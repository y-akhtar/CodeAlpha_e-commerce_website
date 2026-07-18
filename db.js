const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const dbPath = path.join(__dirname, 'database.sqlite');
const productsFilePath = path.join(__dirname, 'products.json');

let sqliteDb = null;

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const db = {
    async init() {
        sqliteDb = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Drop the legacy password_resets table to rebuild it with token columns
        await sqliteDb.exec('DROP TABLE IF EXISTS password_resets');

        await sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                image_url TEXT NOT NULL,
                stock INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pending_registrations (
                email TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                otp TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS password_resets (
                email TEXT PRIMARY KEY,
                token TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                city TEXT NOT NULL,
                zip_code TEXT NOT NULL,
                total_price REAL NOT NULL,
                status TEXT DEFAULT 'Pending',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER,
                product_id INTEGER,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
            );
        `);

        const countResult = await sqliteDb.get('SELECT COUNT(*) as count FROM products');
        if (countResult.count === 0) {
            if (fs.existsSync(productsFilePath)) {
                const raw = fs.readFileSync(productsFilePath, 'utf-8');
                const products = JSON.parse(raw);
                
                const stmt = await sqliteDb.prepare(`
                    INSERT INTO products (id, name, price, description, category, image_url, stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                for (const p of products) {
                    await stmt.run(p.id, p.name, p.price, p.description, p.category, p.image_url, p.stock);
                }
                await stmt.finalize();
            }
        }
    },

    async getProducts(category, search) {
        let query = 'SELECT * FROM products';
        let params = [];
        let conditions = [];

        if (category) {
            conditions.push('category = ?');
            params.push(category);
        }

        if (search) {
            const keywords = search.toLowerCase().split(/\s+/).filter(Boolean);
            keywords.forEach(kw => {
                conditions.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
                params.push('%' + kw + '%', '%' + kw + '%');
            });
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        return await sqliteDb.all(query, params);
    },

    async getProductById(id) {
        return await sqliteDb.get('SELECT * FROM products WHERE id = ?', parseInt(id, 10));
    },

    async initiateRegistration(email, password, firstName, lastName) {
        const existing = await sqliteDb.get('SELECT * FROM users WHERE LOWER(email) = ?', email.toLowerCase());
        if (existing) {
            throw new Error("Email already registered. Please log in or use a different email.");
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const hash = hashPassword(password);

        await sqliteDb.run(
            `INSERT OR REPLACE INTO pending_registrations (email, password_hash, first_name, last_name, otp, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            email.toLowerCase(), hash, firstName, lastName, otp, expiresAt
        );

        return { otp };
    },

    async verifyRegistrationOTP(email, otp) {
        const pending = await sqliteDb.get('SELECT * FROM pending_registrations WHERE email = ?', email.toLowerCase());
        if (!pending) {
            throw new Error("No pending registration found for this email address. Please submit the signup form first.");
        }

        if (new Date(pending.expires_at) < new Date()) {
            await sqliteDb.run('DELETE FROM pending_registrations WHERE email = ?', email.toLowerCase());
            throw new Error("The verification code has expired. Please sign up again.");
        }

        if (pending.otp !== otp) {
            throw new Error("Invalid verification code. Please check and try again.");
        }

        const newUserId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await sqliteDb.run(
            `INSERT INTO users (id, email, password_hash, first_name, last_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            newUserId, pending.email, pending.password_hash, pending.first_name, pending.last_name, createdAt
        );

        await sqliteDb.run('DELETE FROM pending_registrations WHERE email = ?', email.toLowerCase());

        const safeUser = { id: newUserId, email: pending.email, first_name: pending.first_name, last_name: pending.last_name };
        return { user: safeUser, session: { access_token: `local_token_${newUserId}`, user: safeUser } };
    },

    async loginUser(email, password) {
        const user = await sqliteDb.get('SELECT * FROM users WHERE LOWER(email) = ?', email.toLowerCase());
        const hash = hashPassword(password);
        
        if (!user || user.password_hash !== hash) {
            throw new Error("Invalid email or password.");
        }

        const { password_hash, ...safeUser } = user;
        return { user: safeUser, session: { access_token: `local_token_${user.id}`, user: safeUser } };
    },

    async initiatePasswordReset(email) {
        const user = await sqliteDb.get('SELECT * FROM users WHERE LOWER(email) = ?', email.toLowerCase());
        if (!user) {
            throw new Error("No account found with this email address.");
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiry

        await sqliteDb.run(
            `INSERT OR REPLACE INTO password_resets (email, token, expires_at)
             VALUES (?, ?, ?)`,
            email.toLowerCase(), token, expiresAt
        );

        return { token };
    },

    async executePasswordReset(email, token, newPassword) {
        const resetReq = await sqliteDb.get('SELECT * FROM password_resets WHERE email = ?', email.toLowerCase());
        if (!resetReq) {
            throw new Error("No reset request found for this email address. Please request a new link.");
        }

        if (new Date(resetReq.expires_at) < new Date()) {
            await sqliteDb.run('DELETE FROM password_resets WHERE email = ?', email.toLowerCase());
            throw new Error("The recovery link has expired. Please request a new one.");
        }

        if (resetReq.token !== token) {
            throw new Error("Invalid or corrupted password reset link.");
        }

        const hash = hashPassword(newPassword);
        await sqliteDb.run(
            `UPDATE users SET password_hash = ? WHERE LOWER(email) = ?`,
            hash, email.toLowerCase()
        );

        await sqliteDb.run('DELETE FROM password_resets WHERE email = ?', email.toLowerCase());
        return { success: true };
    },

    async createOrder(orderData, items) {
        await sqliteDb.run('BEGIN TRANSACTION');
        try {
            const createdAt = new Date().toISOString();
            const result = await sqliteDb.run(
                `INSERT INTO orders (user_id, first_name, last_name, email, phone, address, city, zip_code, total_price, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                orderData.user_id, orderData.first_name, orderData.last_name, orderData.email,
                orderData.phone, orderData.address, orderData.city, orderData.zip_code,
                orderData.total_price, 'Pending', createdAt
            );

            const orderId = result.lastID;

            for (const item of items) {
                await sqliteDb.run(
                    `INSERT INTO order_items (order_id, product_id, price, quantity)
                     VALUES (?, ?, ?, ?)`,
                    orderId, parseInt(item.product_id, 10), parseFloat(item.price), parseInt(item.quantity, 10)
                );

                await sqliteDb.run(
                    `UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?`,
                    parseInt(item.quantity, 10), parseInt(item.product_id, 10)
                );
            }

            await sqliteDb.run('COMMIT');

            return { id: orderId, ...orderData, status: 'Pending', created_at: createdAt };
        } catch (err) {
            await sqliteDb.run('ROLLBACK');
            throw err;
        }
    },

    async getUserOrders(userIdOrEmail) {
        const orders = await sqliteDb.all(
            `SELECT * FROM orders 
             WHERE user_id = ? OR LOWER(email) = ? 
             ORDER BY datetime(created_at) DESC`,
            userIdOrEmail, userIdOrEmail.toLowerCase()
        );

        for (const order of orders) {
            order.items = await sqliteDb.all(
                `SELECT oi.*, p.name 
                 FROM order_items oi 
                 LEFT JOIN products p ON oi.product_id = p.id 
                 WHERE oi.order_id = ?`,
                order.id
            );
        }

        return orders;
    }
};

module.exports = { db };

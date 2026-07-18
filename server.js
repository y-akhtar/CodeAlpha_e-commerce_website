const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'media')));

async function sendEmailJS(email, templateId, templateParams) {
    const cleanEmail = email ? email.trim() : '';
    console.log(`\n==================================================`);
    console.log(`[EMAIL DISPATCH] RECIPIENT: ${cleanEmail}`);
    console.log(`[EMAIL DISPATCH] TEMPLATE: ${templateId}`);
    console.log(`[EMAIL DISPATCH] PARAMS:`, templateParams);
    console.log(`==================================================\n`);

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (serviceId && templateId && publicKey) {
        try {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: serviceId,
                    template_id: templateId,
                    user_id: publicKey,
                    accessToken: privateKey || undefined,
                    template_params: templateParams
                })
            });

            if (response.ok) {
                console.log(`EmailJS message successfully dispatched to ${cleanEmail}`);
            } else {
                const text = await response.text();
                console.error(`EmailJS API returned error status ${response.status}: ${text}`);
            }
        } catch (err) {
            console.error("Failed to send EmailJS request:", err.message);
        }
    } else {
        console.log(`(EmailJS credentials not fully configured in .env. Running offline mode.)`);
    }
}

app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        const products = await db.getProducts(category, search);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const products = await db.getProducts();
        const categories = [...new Set(products.map(p => p.category))];
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await db.getProductById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found." });
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: "Please fill in all fields." });
        }
        const data = await db.initiateRegistration(email, password, firstName, lastName);
        const templateId = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID || 'template_0t0ysvl';
        
        await sendEmailJS(email, templateId, {
            to_email: email.trim(),
            email: email.trim(),
            otp_code: data.otp,
            otp: data.otp,
            code: data.otp
        });
        
        res.json({ success: true, email, message: "Verification code sent." });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ error: "Email and verification code are required." });
        }
        const data = await db.verifyRegistrationOTP(email, otp);
        res.json({ success: true, user: data.user, session: data.session });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }
        const data = await db.loginUser(email, password);
        res.json(data);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Request password reset link (no OTP required)
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email address is required." });
        }
        const data = await db.initiatePasswordReset(email);
        const templateId = process.env.EMAILJS_RESET_TEMPLATE_ID || 'template_4l9i8n1';
        
        // Generate a recovery link that pre-fills the email and verification token on the frontend
        const resetLink = `http://localhost:3000/forgot-password.html?email=${encodeURIComponent(email)}&token=${data.token}`;
        
        await sendEmailJS(email, templateId, {
            to_email: email.trim(),
            email: email.trim(),
            link: resetLink,
            reset_link: resetLink
        });
        
        res.json({ success: true, message: "Password reset instructions dispatched." });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Verify token & update new password (no OTP input)
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        if (!email || !token || !newPassword) {
            return res.status(400).json({ error: "All fields are required to reset password." });
        }
        const result = await db.executePasswordReset(email, token, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { 
            first_name, last_name, email, phone, 
            address, city, zip_code, total_price, 
            user_id, items 
        } = req.body;

        if (!first_name || !last_name || !email || !phone || !address || !city || !zip_code || !items || items.length === 0) {
            return res.status(400).json({ error: "Please fill in all shipping details." });
        }

        const orderData = {
            first_name, last_name, email, phone, address, city, zip_code,
            total_price: parseFloat(total_price),
            user_id: user_id || null
        };

        const order = await db.createOrder(orderData, items);
        res.status(201).json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/orders/my-orders', async (req, res) => {
    try {
        const { user_id, email } = req.query;
        if (!user_id && !email) {
            return res.status(400).json({ error: "Identity is required." });
        }
        const orders = await db.getUserOrders(user_id || email);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

(async () => {
    try {
        await db.init();
        app.listen(PORT, () => {
            console.log(`Picksy Server is running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Database initialization failed. Server could not start:", err);
    }
})();

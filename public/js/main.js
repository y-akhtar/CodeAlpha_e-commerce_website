/**
 * Picksy E-commerce Client-side JavaScript
 */

// Global State
let cart = JSON.parse(localStorage.getItem('picksy_cart')) || [];
let user = JSON.parse(localStorage.getItem('picksy_user')) || null;
let session = JSON.parse(localStorage.getItem('picksy_session')) || null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    syncAuthUI();
});

// ----------------------------------------
// 1. Toast Notifications
// ----------------------------------------
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass}" style="color: var(--color-${type})"></i>
        <span class="toast-msg">${message}</span>
        <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(toast);

    // Close button trigger
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    // Auto dismiss
    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-15px)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ----------------------------------------
// 2. Shopping Cart Utilities
// ----------------------------------------
function updateCartBadge() {
    const badges = document.querySelectorAll('.cart-count');
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    badges.forEach(badge => {
        if (totalQty > 0) {
            badge.textContent = totalQty;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

function addToCart(id, name, price, image, quantity = 1, stockLimit = 100) {
    const existing = cart.find(item => item.id === id);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + quantity > stockLimit) {
        showToast(`Sorry, only ${stockLimit} units of this item are available.`, 'warning');
        return;
    }

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ id, name, price, image, quantity });
    }

    saveCart();
    updateCartBadge();
    showToast(`Added ${name} to your cart!`, 'success');
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    updateCartBadge();
    showToast("Item removed from your cart.", "info");
}

function updateCartQty(id, newQty, stockLimit = 100) {
    const item = cart.find(item => item.id === id);
    if (item) {
        if (newQty > stockLimit) {
            showToast(`Only ${stockLimit} units in stock.`, 'warning');
            item.quantity = stockLimit;
        } else if (newQty < 1) {
            removeFromCart(id);
            return;
        } else {
            item.quantity = parseInt(newQty, 10);
        }
        saveCart();
        updateCartBadge();
    }
}

function saveCart() {
    localStorage.setItem('picksy_cart', JSON.stringify(cart));
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartBadge();
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// ----------------------------------------
// 3. User Session Auth Utilities
// ----------------------------------------
function syncAuthUI() {
    const authLink = document.getElementById('auth-link');
    const accountLink = document.getElementById('account-link');
    
    if (user) {
        // User logged in
        if (authLink) {
            authLink.innerHTML = `<a href="#" onclick="logoutUser(event)" class="nav-link"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>`;
        }
        if (accountLink) {
            accountLink.classList.remove('hidden');
        }
    } else {
        // User logged out
        if (authLink) {
            authLink.innerHTML = `<a href="login.html" class="nav-link"><i class="fa-solid fa-right-to-bracket"></i> Login</a>`;
        }
        if (accountLink) {
            accountLink.classList.add('hidden');
        }
    }
}

function logoutUser(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('picksy_user');
    localStorage.removeItem('picksy_session');
    user = null;
    session = null;
    syncAuthUI();
    showToast("Logged out successfully.", "info");
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// Format currency display (e.g. Rs. 1,200)
function formatPrice(value) {
    return 'Rs. ' + parseFloat(value).toLocaleString('en-IN');
}

// Toggle mobile navigation drawer menu
function toggleMobileMenu() {
    const nav = document.querySelector('.navbar');
    if (nav) {
        nav.classList.toggle('active');
    }
}

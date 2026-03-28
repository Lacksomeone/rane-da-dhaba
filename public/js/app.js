// ============== RANE DA DHABA — APP.JS ==============

const API_BASE = '';
let authToken = localStorage.getItem('rdd_token') || null;
let authPhone = localStorage.getItem('rdd_phone') || null;
let authEmail = localStorage.getItem('rdd_email') || null;
let authName = localStorage.getItem('rdd_name') || null;

let currentPage = 'home';
let menuData = [];
let cart = JSON.parse(localStorage.getItem('rdd_cart') || '[]');
let currentRating = 0;

// Firebase state
let otpProvider = 'demo';
let firebaseAuth = null;
let firebaseConfirmationResult = null;
let recaptchaVerifier = null;

// ============== INITIALIZATION ==============
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  loadMenu();
  loadFeedback();
  updateAuthUI();
  updateCartUI();
  handleHashNav();
  checkSession(); // Verify existing session on boot
  
  // Listen for Firebase Auth changes to sync with backend
  if (window.firebase) {
    window.firebase.auth().onAuthStateChanged(async (user) => {
      if (user && !authToken) {
        console.log("🔄 User detected in Firebase, syncing with backend...");
        await syncWithBackend(user);
      }
    });
  }

  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });

  window.addEventListener('hashchange', handleHashNav);
});

// Load config from server
async function loadConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    const config = await res.json();
    otpProvider = config.otpProvider || 'demo';

    if (otpProvider === 'firebase' && config.firebase) {
      initFirebase(config.firebase);
    }
    
    // Store owner phone globally for WhatsApp alerts
    window.rddOwnerPhone = config.ownerPhone || '919876543210';
    
    console.log(`🔧 OTP Provider: ${otpProvider}`);
  } catch (err) {
    console.error('Failed to load config:', err);
    otpProvider = 'demo';
  }
}

// Verify if the current token is still valid on the server
async function checkSession() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/api/verify-session`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      console.warn("⚠️ Session expired on server.");
      // If we expired, let onAuthStateChanged try to fix it, or clear local state
      if (!window.firebase?.auth().currentUser) {
        logout(true); // Silent logout
      }
    } else {
      const data = await res.json();
      authName = data.user.name;
      authEmail = data.user.email;
      authPhone = data.user.phone;
      updateAuthUI();
    }
  } catch (err) {
    console.error("Session check failed", err);
  }
}

// Bridge Firebase Auth user to our server session
async function syncWithBackend(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE}/api/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        email: user.email,
        phone: user.phoneNumber,
        displayName: user.displayName,
        uid: user.uid
      })
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      localStorage.setItem('rdd_token', authToken);
      updateAuthUI();
      console.log("✅ Session re-synced successfully!");
    }
  } catch (err) {
    console.error("Failed to sync with backend", err);
  }
}

// Initialize Firebase
function initFirebase(firebaseConfig) {
  try {
    if (!window.firebase) {
      console.error('Firebase SDK not loaded');
      otpProvider = 'demo';
      return;
    }

    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY') {
      console.warn('⚠️ Firebase config not set! Using demo fallback.');
      otpProvider = 'demo';
      return;
    }

    window.firebase.initializeApp(firebaseConfig);
    firebaseAuth = window.firebase.auth();
    firebaseAuth.languageCode = 'en';

    console.log('🔥 Firebase initialized successfully!');
  } catch (err) {
    console.error('Firebase init error:', err);
    otpProvider = 'demo';
  }
}

function setupRecaptcha() {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch(e){}
  }

  if (!firebaseAuth) return;

  recaptchaVerifier = new window.firebase.auth.RecaptchaVerifier('recaptcha-container', {
    size: 'invisible',
    callback: () => console.log('✅ reCAPTCHA verified'),
    'expired-callback': () => showToast('⚠️ Verification expired. Please try again.', 'error')
  });
}

function handleHashNav() {
  const hash = window.location.hash.replace('#', '') || 'home';
  navigateTo(hash, false);
}

// ============== NAVIGATION ==============
function navigateTo(page, pushHash = true) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  const targetPage = document.getElementById(`page-${page}`);
  
  if (targetPage) {
    targetPage.classList.add('active');
  } else {
    document.getElementById('page-home').classList.add('active');
    page = 'home';
  }

  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  currentPage = page;
  if (pushHash) window.location.hash = page;

  document.getElementById('navLinks').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'orders' && authToken) loadOrders();
}

function toggleMobileMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

// ============== AUTH / LOGIN ==============
function updateAuthUI() {
  const authArea = document.getElementById('navAuthArea');
  const mobileAuthArea = document.getElementById('mobileAuthArea');

  if (authToken) {
    let displayStr = authName || (authEmail ? authEmail.split('@')[0] : (authPhone ? `***${authPhone.slice(-4)}` : 'User'));
    if (displayStr.length > 12) displayStr = displayStr.substring(0, 10) + '...';

    const userHtml = `
      <div class="nav-user-info">
        <div class="nav-user-avatar">👤</div>
        <span title="${authEmail || authPhone}">${displayStr}</span>
        <button class="nav-login-btn" onclick="logout()" style="background: rgba(229,57,53,0.15); color: #E53935; box-shadow: none; padding: 8px 16px; font-size: 0.8rem;">Logout</button>
      </div>
    `;

    const mobileHtml = `
      <div style="padding: 20px; border-top: 1px solid var(--border-subtle); margin-top: 10px; text-align: center;">
        <div class="nav-user-avatar" style="margin: 0 auto 12px; width: 60px; height: 60px; font-size: 1.5rem;">👤</div>
        <div style="color: var(--gold); font-weight: 600; margin-bottom: 4px;">${displayStr}</div>
        <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">${authEmail || authPhone}</div>
        <button class="mobile-auth-btn" onclick="logout()" style="background: rgba(229,57,53,0.1); color: #E53935; border: 1px solid rgba(229,57,53,0.2);">Logout</button>
      </div>
    `;

    authArea.innerHTML = userHtml;
    if (mobileAuthArea) mobileAuthArea.innerHTML = mobileHtml;

  } else {
    authArea.innerHTML = `<button class="nav-login-btn" id="loginOpenBtn" onclick="openLoginModal()">Login</button>`;
    if (mobileAuthArea) {
      mobileAuthArea.innerHTML = `
        <button class="mobile-auth-btn" onclick="openLoginModal()" style="background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: var(--bg-dark);">Login / Sign Up</button>
      `;
    }
  }
}

function openLoginModal() {
  document.getElementById('loginModal').classList.add('open');
  showLoginStep(1);
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('open');
  if(document.getElementById('phoneInput')) document.getElementById('phoneInput').value = '';
  clearOtpInputs();
  document.getElementById('loginMsg1').className = 'login-message';
  document.getElementById('loginMsg2').className = 'login-message';
  firebaseConfirmationResult = null;
}

function showLoginStep(step) {
  document.getElementById('loginStep1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('loginStep2').style.display = step === 2 ? 'block' : 'none';
  if (step === 1) document.getElementById('loginMsg1').className = 'login-message';
  if (step === 2) {
    document.getElementById('loginMsg2').className = 'login-message';
    clearOtpInputs();
    setTimeout(() => document.querySelector('.otp-digit')?.focus(), 100);
  }
}

function clearOtpInputs() {
  document.querySelectorAll('.otp-digit').forEach(d => d.value = '');
}

// --- GOOGLE SIGN IN ---
async function signInWithGoogle() {
  if (otpProvider !== 'firebase' || !firebaseAuth) {
    showToast('⚠️ Google Sign-In is only available in Firebase mode.', 'error');
    return;
  }

  const msgEl = document.getElementById('loginMsg1');
  msgEl.className = 'login-message';
  msgEl.textContent = 'Opening Google Sign-In...';

  try {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    const result = await firebaseAuth.signInWithPopup(provider);
    const user = result.user;
    
    msgEl.textContent = 'Verifying...';

    const idToken = await user.getIdToken();

    // Create session on our backend
    const res = await fetch(`${API_BASE}/api/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: idToken,
        email: user.email,
        displayName: user.displayName,
        uid: user.uid
      })
    });
    
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      authEmail = data.user.email;
      authName = data.user.name;
      localStorage.setItem('rdd_token', authToken);
      if(authEmail) localStorage.setItem('rdd_email', authEmail);
      if(authName) localStorage.setItem('rdd_name', authName);
      
      updateAuthUI();
      closeLoginModal();
      showToast('🎉 Login successful with Google!', 'success');
    } else {
      msgEl.className = 'login-message error';
      msgEl.textContent = data.error || 'Login failed.';
    }
  } catch (error) {
    console.error("Google Sign-In Error", error);
    if(error.code !== 'auth/popup-closed-by-user') {
      msgEl.className = 'login-message error';
      msgEl.textContent = 'Failed to sign in with Google.';
    } else {
      msgEl.textContent = '';
    }
  }
}

// --- SEND PHONE OTP ---
async function sendOTP() {
  const phoneInput = document.getElementById('phoneInput');
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const msgEl = document.getElementById('loginMsg1');
  const btn = document.getElementById('sendOtpBtn');

  if (phone.length !== 10) {
    msgEl.className = 'login-message error';
    msgEl.textContent = 'Please enter a valid 10-digit phone number';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  if (otpProvider === 'firebase') {
    await sendOTPViaFirebase(phone, msgEl, btn);
  } else {
    await sendOTPViaBackend(phone, msgEl, btn);
  }
}

async function sendOTPViaFirebase(phone, msgEl, btn) {
  try {
    setupRecaptcha();
    const phoneNumber = `+91${phone}`;
    console.log(`🔥 Sending Firebase OTP to ${phoneNumber}...`);

    firebaseConfirmationResult = await firebaseAuth.signInWithPhoneNumber(
      phoneNumber,
      recaptchaVerifier
    );

    document.getElementById('otpSentMsg').textContent = `OTP sent to +91 ${phone}`;
    showLoginStep(2);
    showToast('📱 OTP sent to your phone!', 'success', 5000);

  } catch (err) {
    console.error('Firebase OTP Error:', err);
    let errorMsg = 'Failed to send OTP. Please try again.';
    if (err.code === 'auth/billing-not-enabled') errorMsg = 'Phone auth billing is not enabled down on Firebase.';
    else if (err.code === 'auth/invalid-phone-number') errorMsg = 'Invalid phone number format.';
    else if (err.code === 'auth/too-many-requests') errorMsg = 'Too many attempts. Wait a few minutes.';
    
    msgEl.className = 'login-message error';
    msgEl.textContent = errorMsg;

    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch(e){}
    }
  }

  btn.disabled = false;
  btn.innerHTML = 'Send SMS OTP →';
}

async function sendOTPViaBackend(phone, msgEl, btn) {
  try {
    const res = await fetch(`${API_BASE}/api/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('otpSentMsg').textContent = `OTP sent to +91 ${phone}`;
      showLoginStep(2);

      if (data.demo_otp) {
        showToast(`🔐 Demo OTP: ${data.demo_otp}`, 'success', 6000);
        const digits = data.demo_otp.split('');
        document.querySelectorAll('.otp-digit').forEach((input, i) => {
          setTimeout(() => { input.value = digits[i] || ''; }, (i + 1) * 150);
        });
      } else {
        showToast(`📱 OTP sent to your phone!`, 'success', 5000);
      }
    } else {
      msgEl.className = 'login-message error';
      msgEl.textContent = data.error;
    }
  } catch (err) {
    msgEl.className = 'login-message error';
    msgEl.textContent = 'Network error. Please try again.';
  }

  btn.disabled = false;
  btn.innerHTML = 'Send SMS OTP →';
}

// --- VERIFY PHONE OTP ---
async function verifyOTP() {
  const phone = document.getElementById('phoneInput').value.trim();
  const otpDigits = document.querySelectorAll('.otp-digit');
  const otp = Array.from(otpDigits).map(d => d.value).join('');
  const msgEl = document.getElementById('loginMsg2');
  const btn = document.getElementById('verifyOtpBtn');

  if (otp.length !== 6) {
    msgEl.className = 'login-message error';
    msgEl.textContent = 'Please enter the 6-digit OTP';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verifying...';

  if (otpProvider === 'firebase') {
    await verifyOTPViaFirebase(otp, phone, msgEl, btn);
  } else {
    await verifyOTPViaBackend(phone, otp, msgEl, btn);
  }
}

async function verifyOTPViaFirebase(otp, phone, msgEl, btn) {
  try {
    if (!firebaseConfirmationResult) {
      msgEl.className = 'login-message error';
      msgEl.textContent = 'Session expired. Request a new OTP.';
      btn.disabled = false;
      btn.innerHTML = 'Verify & Login →';
      return;
    }

    const result = await firebaseConfirmationResult.confirm(otp);
    const user = result.user;
    const idToken = await user.getIdToken();

    const res = await fetch(`${API_BASE}/api/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, phone: user.phoneNumber || phone, uid: user.uid })
    });
    
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      authPhone = data.user.phone;
      localStorage.setItem('rdd_token', authToken);
      localStorage.setItem('rdd_phone', authPhone);
      updateAuthUI();
      closeLoginModal();
      showToast('🎉 Welcome to Rane Da Dhaba!', 'success');
    } else {
      msgEl.className = 'login-message error';
      msgEl.textContent = data.error || 'Login failed.';
    }

  } catch (err) {
    let errorMsg = 'Verification failed.';
    if (err.code === 'auth/invalid-verification-code') errorMsg = 'Wrong OTP! Please try again.';
    else if (err.code === 'auth/code-expired') errorMsg = 'OTP expired. Please request a new one.';
    
    msgEl.className = 'login-message error';
    msgEl.textContent = errorMsg;
  }

  btn.disabled = false;
  btn.innerHTML = 'Verify & Login →';
}

async function verifyOTPViaBackend(phone, otp, msgEl, btn) {
  try {
    const res = await fetch(`${API_BASE}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      authPhone = data.user.phone;
      localStorage.setItem('rdd_token', authToken);
      localStorage.setItem('rdd_phone', authPhone);
      updateAuthUI();
      closeLoginModal();
      showToast('🎉 Welcome to Rane Da Dhaba!', 'success');
    } else {
      msgEl.className = 'login-message error';
      msgEl.textContent = data.error;
    }
  } catch (err) {
    msgEl.className = 'login-message error';
    msgEl.textContent = 'Network error. Please try again.';
  }

  btn.disabled = false;
  btn.innerHTML = 'Verify & Login →';
}

function otpAutoFocus(input, index) {
  input.value = input.value.replace(/[^0-9]/g, '');
  if (input.value && index < 5) {
    const next = document.querySelectorAll('.otp-digit')[index + 1];
    if (next) next.focus();
  }
}

function logout(silent = false) {
  if (!silent) {
    try {
      fetch(`${API_BASE}/api/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (firebaseAuth) firebaseAuth.signOut();
    } catch (e) {}
  }
  authToken = null;
  authPhone = null;
  authEmail = null;
  authName = null;
  localStorage.removeItem('rdd_token');
  localStorage.removeItem('rdd_phone');
  localStorage.removeItem('rdd_email');
  localStorage.removeItem('rdd_name');
  updateAuthUI();
  if (!silent) showToast('👋 Logged out successfully', 'success');
}

// ============== MENU ==============
async function loadMenu() {
  try {
    const res = await fetch(`${API_BASE}/api/menu`);
    const data = await res.json();
    if (data.success) {
      menuData = data.menu;
      renderMenuCategories();
      renderMenuItems('All');
      renderPopularItems();
    }
  } catch (err) {}
}

function renderMenuCategories() {
  const container = document.getElementById('menuCategories');
  const categories = ['All', ...menuData.map(c => c.category)];
  container.innerHTML = categories.map(cat => `
    <button class="menu-cat-btn ${cat === 'All' ? 'active' : ''}" onclick="filterMenu('${cat}', this)">
      ${cat === 'All' ? '🍽️ All' : menuData.find(c => c.category === cat)?.icon + ' ' + cat}
    </button>
  `).join('');
}

function filterMenu(category, btn) {
  document.querySelectorAll('.menu-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMenuItems(category);
}

function renderMenuItems(category) {
  const container = document.getElementById('menuGrid');
  let items = [];
  if (category === 'All') menuData.forEach(cat => cat.items.forEach(i => items.push(i)));
  else items = menuData.find(c => c.category === category)?.items || [];

  container.innerHTML = items.map(item => `
    <div class="menu-card" id="menu-item-${item.id}">
      ${item.popular ? '<div class="menu-card-popular">⭐ Popular</div>' : ''}
      <div class="menu-card-header">
        <div class="menu-card-name">${item.name}</div>
        <div class="menu-card-price">₹${item.price}</div>
      </div>
      <div class="menu-card-desc">${item.desc}</div>
      <div class="menu-card-footer">
        <span class="menu-card-tag ${item.veg ? 'veg' : 'non-veg'}">${item.veg ? '🟢 Veg' : '🔴 Non-Veg'}</span>
        <div id="item-action-${item.id}">
          ${cart.find(c=>c.id===item.id) ? `
            <div class="qty-controls">
              <button class="qty-btn" onclick="updateCart(${item.id}, -1)">−</button>
              <span class="qty-value">${cart.find(c=>c.id===item.id).qty}</span>
              <button class="qty-btn" onclick="updateCart(${item.id}, 1)">+</button>
            </div>
          ` : `<button class="add-to-cart-btn" onclick="addToCart(${item.id})">+ Add</button>`}
        </div>
      </div>
    </div>
  `).join('');
}

function renderPopularItems() {
  const c = document.getElementById('popularItemsGrid');
  if(!c) return;
  let pop = [];
  menuData.forEach(cat => cat.items.forEach(i => { if(i.popular) pop.push(i); }));
  
  c.innerHTML = pop.slice(0, 6).map(item => `
    <div class="menu-card">
      <div class="menu-card-popular">⭐ Popular</div>
      <div class="menu-card-header">
        <div class="menu-card-name">${item.name}</div>
        <div class="menu-card-price">₹${item.price}</div>
      </div>
      <div class="menu-card-desc">${item.desc}</div>
      <div class="menu-card-footer">
        <span class="menu-card-tag ${item.veg ? 'veg' : 'non-veg'}">${item.veg ? '🟢 Veg' : '🔴 Non-Veg'}</span>
        <div>
          ${cart.find(x=>x.id===item.id) ? `
            <div class="qty-controls">
              <button class="qty-btn" onclick="updateCart(${item.id}, -1)">−</button>
              <span class="qty-value">${cart.find(x=>x.id===item.id).qty}</span>
              <button class="qty-btn" onclick="updateCart(${item.id}, 1)">+</button>
            </div>
          ` : `<button class="add-to-cart-btn" onclick="addToCart(${item.id})">+ Add</button>`}
        </div>
      </div>
    </div>
  `).join('');
}

// ============== CART ==============
function findMenuItem(id) {
  for (const cat of menuData) {
    const item = cat.items.find(i => i.id === id);
    if (item) return item;
  }
}

function addToCart(itemId) {
  const item = findMenuItem(itemId);
  if (!item) return;
  const ex = cart.find(c => c.id === itemId);
  if (ex) ex.qty += 1;
  else cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  
  saveCart(); updateCartUI(); renderMenuItems(getActiveCategory()); renderPopularItems();
  showToast(`🍗 ${item.name} added!`, 'success');
}

function updateCart(itemId, delta) {
  const ex = cart.find(c => c.id === itemId);
  if (!ex) return;
  ex.qty += delta;
  if (ex.qty <= 0) cart = cart.filter(c => c.id !== itemId);
  saveCart(); updateCartUI(); renderMenuItems(getActiveCategory()); renderPopularItems();
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.id !== itemId);
  saveCart(); updateCartUI(); renderMenuItems(getActiveCategory()); renderPopularItems();
}

function getActiveCategory() {
  const btn = document.querySelector('.menu-cat-btn.active');
  return btn ? btn.textContent.replace(/^[^\s]+\s/, '').trim() : 'All';
}

function saveCart() { localStorage.setItem('rdd_cart', JSON.stringify(cart)); }

function updateCartUI() {
  const totalItems = cart.reduce((sum, c) => sum + c.qty, 0);
  const badge = document.getElementById('cartBadge');
  badge.textContent = totalItems;
  badge.classList.toggle('show', totalItems > 0);

  const list = document.getElementById('cartItemsList');
  if (cart.length === 0) {
    list.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🍽️</div><p>Your cart is empty</p></div>`;
    document.getElementById('checkoutBtn').disabled = true;
    document.getElementById('checkoutForm').classList.remove('show');
  } else {
    list.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info"><h4>${item.name}</h4><p>₹${item.price} × ${item.qty} = ₹${item.price * item.qty}</p></div>
        <div class="cart-item-controls">
          <div class="qty-controls">
            <button class="qty-btn" onclick="updateCart(${item.id}, -1)">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" onclick="updateCart(${item.id}, 1)">+</button>
          </div>
          <button class="cart-item-remove" onclick="removeFromCart(${item.id})">✕</button>
        </div>
      </div>
    `).join('');
    document.getElementById('checkoutBtn').disabled = false;
    document.getElementById('checkoutForm').classList.add('show');
  }
  document.getElementById('cartTotalValue').textContent = `₹${cart.reduce((s, c) => s + (c.price * c.qty), 0)}`;
}

function toggleCart() {
  document.getElementById('cartOverlay').classList.toggle('open');
  document.getElementById('cartSidebar').classList.toggle('open');
}

// ============== ORDERS ==============
async function placeOrder() {
  if (!authToken) {
    showToast('⚠️ Please login to place an order', 'error');
    openLoginModal();
    return;
  }
  if (cart.length === 0) return;

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>...';

  try {
    const res = await fetch(`${API_BASE}/api/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ items: cart, address: document.getElementById('checkoutAddress').value, notes: document.getElementById('checkoutNotes').value })
    });
    
    if (res.status === 401) {
      showToast('⚠️ Session expired. Please login again.', 'error');
      logout(true);
      openLoginModal();
      btn.disabled = false; btn.textContent = 'Place Order';
      return;
    }

    const data = await res.json();
    if (data.success) {
      showToast('✅ Order placed successfully!', 'success');
      
      const address = document.getElementById('checkoutAddress').value || 'Dine-in';
      const notes = document.getElementById('checkoutNotes').value;
      const total = cart.reduce((s, c) => s + (c.price * c.qty), 0);
      
      let itemsText = cart.map(c => `${c.qty}x ${c.name} - ₹${c.price * c.qty}`).join('\n');
      let text = `*New Order - Rane Da Dhaba* 🍗\n\n*Order ID:* ${data.order.id}\n*Customer:* ${authName || authEmail || authPhone || 'Guest'}\n*Address:* ${address}\n${notes ? `*Notes:* ${notes}\n` : ''}\n*Items:*\n${itemsText}\n\n*Total:* ₹${total}\n\nPlease confirm my order!`;
      
      const phoneToUse = window.rddOwnerPhone || '919876543210';
      
      cart = []; saveCart(); updateCartUI(); toggleCart();
      setTimeout(() => navigateTo('orders'), 100);

      // Try WhatsApp redirect
      try {
        const waUrl = `https://wa.me/${phoneToUse}?text=${encodeURIComponent(text)}`;
        const win = window.open(waUrl, '_blank');
        if (!win || win.closed || typeof win.closed == 'undefined') {
          // If popup is blocked, try direct location change
          window.location.href = waUrl;
        }
      } catch (e) {
        window.location.href = `https://wa.me/${phoneToUse}?text=${encodeURIComponent(text)}`;
      }

    } else showToast(`❌ ${data.error}`, 'error');
  } catch (err) {
    showToast('❌ Connection error. Try again.', 'error');
  }
  
  btn.disabled = false; btn.textContent = 'Place Order';
}

async function loadOrders() {
  if (!authToken) return;
  const container = document.getElementById('ordersListContainer');
  try {
    const res = await fetch(`${API_BASE}/api/orders`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const data = await res.json();
    if (data.success && data.orders.length > 0) {
      container.innerHTML = data.orders.map(o => `
        <div class="order-card">
          <div class="order-card-header"><span class="order-id">#${o.id}</span><span class="order-status">${o.status}</span></div>
          <ul class="order-items-list">${o.items.map(i => `<li><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></li>`).join('')}</ul>
          <div class="order-total"><span>Total</span><span>₹${o.total}</span></div>
          <div class="order-date">${new Date(o.createdAt).toLocaleString()}</div>
        </div>
      `).join('');
    } else container.innerHTML = '<div class="text-center" style="padding:40px;">No orders yet</div>';
  } catch (err) {}
}

// ============== FEEDBACK ==============
function setRating(rating) {
  currentRating = rating;
  document.querySelectorAll('#starRating button').forEach((btn, i) => {
    btn.textContent = i < rating ? '★' : '☆';
    btn.classList.toggle('active', i < rating);
  });
}

async function submitFeedback() {
  const name = document.getElementById('feedbackName').value.trim();
  const comment = document.getElementById('feedbackComment').value.trim();
  if(!name || currentRating===0 || !comment) return showToast('⚠️ Complete the form', 'error');

  try {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rating: currentRating, comment })
    });
    if((await res.json()).success) {
      showToast('🙏 Thanks!', 'success');
      document.getElementById('feedbackName').value=''; document.getElementById('feedbackComment').value=''; setRating(0); loadFeedback();
    }
  } catch(e) {}
}

async function loadFeedback() {
  try {
    const res = await fetch(`${API_BASE}/api/feedback`);
    const data = await res.json();
    if(data.success && data.feedbacks.length > 0) {
      document.getElementById('feedbackReviews').innerHTML = data.feedbacks.map(fb => `
        <div class="feedback-review-card">
          <div class="review-header">
            <div class="review-author"><div class="review-avatar">${fb.name[0]}</div>
              <div><div class="review-name">${fb.name}</div><div class="review-date">${new Date(fb.createdAt).toLocaleDateString()}</div></div>
            </div>
            <div class="review-stars">${'★'.repeat(fb.rating)}${'☆'.repeat(5-fb.rating)}</div>
          </div>
          <div class="review-text">${fb.comment}</div>
        </div>
      `).join('');
    }
  } catch(e) {}
}

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message.match(/^[🚀🎉🍗👋✅🙏📧📱🔐⚠️❌]/) ? '' : (type==='success'?'✅':'⚠️')}${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'toastOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, duration);
}

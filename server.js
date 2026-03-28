require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const OTP_PROVIDER = process.env.OTP_PROVIDER || 'demo';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============== FIREBASE ADMIN SETUP ==============
let firebaseAdmin = null;

if (OTP_PROVIDER === 'firebase') {
  try {
    const admin = require('firebase-admin');
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json';

    const fs = require('fs');
    if (fs.existsSync(path.resolve(__dirname, serviceAccountPath))) {
      const serviceAccount = require(path.resolve(__dirname, serviceAccountPath));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseAdmin = admin;
      console.log('🔥 Firebase Admin SDK initialized successfully!');
    } else {
      console.log('⚠️  Firebase service account file not found (firebase-service-account.json)');
      console.log('   Running without server-side token verification...');
    }
  } catch (err) {
    console.error('❌ Firebase Admin Error:', err.message);
  }
}

// ============== IN-MEMORY DATA STORE ==============
const otpStore = {}; // Demo { phone: { otp, expiresAt } }
const sessions = {}; // { token: { id, email, phone, name, createdAt } }
const orders = [];
const feedbacks = [];

// ============== MENU DATA ==============
const menuData = [
  {
    category: "Starters & Rolls",
    icon: "🍗",
    items: [
      { id: 1, name: "Roasted Chicken", price: 180, desc: "Tender whole chicken roasted with secret spices", veg: false, popular: true },
      { id: 2, name: "Chicken Kali Mirch", price: 200, desc: "Black pepper chicken, smoky and bold", veg: false, popular: true },
      { id: 3, name: "Shaami Kebab Roll", price: 120, desc: "Melt-in-mouth kebab wrapped in rumali roti", veg: false, popular: false },
      { id: 4, name: "Mutton Boti Roll", price: 150, desc: "Succulent mutton pieces in a flaky roll", veg: false, popular: true },
      { id: 5, name: "Chicken Tikka", price: 200, desc: "Classic tandoori chicken tikka", veg: false, popular: true },
      { id: 6, name: "Seekh Kebab", price: 180, desc: "Minced meat skewers grilled to perfection", veg: false, popular: false },
      { id: 7, name: "Paneer Tikka", price: 160, desc: "Marinated cottage cheese grilled in tandoor", veg: true, popular: false }
    ]
  },
  {
    category: "Main Course",
    icon: "🍛",
    items: [
      { id: 8, name: "Chicken Masala", price: 220, desc: "Rich and spicy masala chicken curry", veg: false, popular: true },
      { id: 9, name: "Butter Chicken", price: 250, desc: "Creamy tomato-based chicken — house specialty", veg: false, popular: true },
      { id: 10, name: "Mutton Stew", price: 280, desc: "Slow-cooked mutton in aromatic gravy", veg: false, popular: true },
      { id: 11, name: "Chicken Do Pyaza", price: 200, desc: "Chicken cooked with double onion gravy", veg: false, popular: false },
      { id: 12, name: "Mutton Rogan Josh", price: 300, desc: "Kashmiri-style rich mutton curry", veg: false, popular: true },
      { id: 13, name: "Chicken Changezi", price: 230, desc: "Mughlai chicken in thick spicy gravy", veg: false, popular: false },
      { id: 14, name: "Egg Curry", price: 120, desc: "Boiled eggs in rich onion-tomato gravy", veg: false, popular: false },
      { id: 15, name: "Dal Makhani", price: 150, desc: "Creamy black lentils simmered overnight", veg: true, popular: true }
    ]
  },
  {
    category: "Biryani",
    icon: "🍚",
    items: [
      { id: 16, name: "Chicken Biryani", price: 200, desc: "Fragrant basmati rice layered with spiced chicken", veg: false, popular: true },
      { id: 17, name: "Mutton Biryani", price: 280, desc: "Aromatic dum biryani with tender mutton", veg: false, popular: true },
      { id: 18, name: "Egg Biryani", price: 150, desc: "Biryani with boiled eggs and spices", veg: false, popular: false },
      { id: 19, name: "Veg Biryani", price: 150, desc: "Mixed vegetable biryani with aromatic spices", veg: true, popular: false }
    ]
  },
  {
    category: "Breads",
    icon: "🫓",
    items: [
      { id: 20, name: "Rumali Roti", price: 30, desc: "Paper-thin handkerchief bread", veg: true, popular: true },
      { id: 21, name: "Mughlai Paratha", price: 60, desc: "Stuffed flaky paratha, Mughlai style", veg: false, popular: true },
      { id: 22, name: "Tandoori Roti", price: 20, desc: "Whole wheat bread from clay oven", veg: true, popular: false },
      { id: 23, name: "Butter Naan", price: 40, desc: "Soft naan brushed with butter", veg: true, popular: true },
      { id: 24, name: "Garlic Naan", price: 50, desc: "Naan topped with roasted garlic", veg: true, popular: false },
      { id: 25, name: "Laccha Paratha", price: 40, desc: "Layered flaky paratha", veg: true, popular: false }
    ]
  },
  {
    category: "Beverages",
    icon: "🥤",
    items: [
      { id: 26, name: "Masala Chaas", price: 40, desc: "Spiced buttermilk to cool your palate", veg: true, popular: true },
      { id: 27, name: "Sweet Lassi", price: 60, desc: "Thick creamy yogurt drink", veg: true, popular: true },
      { id: 28, name: "Cold Drink", price: 40, desc: "Chilled soft drink", veg: true, popular: false },
      { id: 29, name: "Mineral Water", price: 20, desc: "Packaged drinking water", veg: true, popular: false }
    ]
  }
];

// ============== HELPER FUNCTIONS ==============
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Please login first' });
  }
  req.user = sessions[token];
  next();
}

// ============== API ROUTES ==============
app.get('/api/config', (req, res) => {
  const config = { 
    otpProvider: OTP_PROVIDER,
    ownerPhone: process.env.OWNER_PHONE || '919876543210' 
  };
  if (OTP_PROVIDER === 'firebase') {
    config.firebase = {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      appId: process.env.FIREBASE_APP_ID || ''
    };
  }
  res.json(config);
});

// --- Firebase Login Endpoint ---
app.post('/api/firebase-login', async (req, res) => {
  const { idToken, email, phone, displayName, uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'Auth credentials required' });
  }

  // If Admin SDK exists, verify token server-side
  if (firebaseAdmin && idToken) {
    try {
      const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
      const token = generateToken();
      
      const vEmail = decoded.email || email || '';
      const vPhone = decoded.phone_number || phone || '';
      const vName = decoded.name || displayName || 'User';

      sessions[token] = { 
        id: decoded.uid, 
        email: vEmail, 
        phone: vPhone, 
        name: vName, 
        createdAt: Date.now() 
      };

      return res.json({
        success: true,
        message: 'Login successful! 🎉',
        token,
        user: sessions[token]
      });
    } catch (err) {
      console.error('❌ Firebase token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  }

  // Fallback (Trust Client)
  console.log(`🔥 Firebase client-auth login for: ${email || phone || uid}`);
  const token = generateToken();
  sessions[token] = { 
    id: uid, 
    email: email || '', 
    phone: (phone || '').replace('+91', '').replace(/\D/g, ''), 
    name: displayName || 'Awesome Guest',
    createdAt: Date.now() 
  };

  res.json({
    success: true,
    message: 'Login successful! 🎉',
    token,
    user: sessions[token]
  });
});

// --- Demo OTP (Fallback or Manual) ---
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10) return res.status(400).json({ error: 'Valid phone required' });

  const otp = generateOTP();
  otpStore[phone] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };
  console.log(`\n📱 [DEMO] OTP for ${phone}: ${otp}\n`);
  res.json({ success: true, message: 'OTP sent successfully!', demo_otp: otp });
});

app.post('/api/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  const stored = otpStore[phone];
  if (!stored || stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (Date.now() > stored.expiresAt) return res.status(400).json({ error: 'OTP Expired' });

  delete otpStore[phone];
  const token = generateToken();
  sessions[token] = { id: `demo_${phone}`, phone, email: '', name: 'Demo User', createdAt: Date.now() };

  res.json({ success: true, message: 'Login successful! 🎉', token, user: sessions[token] });
});

// --- Menu Routes ---
app.get('/api/menu', (req, res) => {
  res.json({ success: true, menu: menuData });
});

// --- Order Routes ---
app.post('/api/order', authMiddleware, (req, res) => {
  const { items, address, notes } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Please add items' });

  const order = {
    id: 'ORD' + Date.now().toString(36).toUpperCase(),
    user_id: req.user.id,
    identifier: req.user.email || req.user.phone,
    items,
    address: address || 'Dine-in',
    notes: notes || '',
    total: items.reduce((sum, item) => sum + (item.price * item.qty), 0),
    status: 'Confirmed',
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  res.json({ success: true, message: `Order placed! Your ID is ${order.id}`, order });
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const userOrders = orders.filter(o => o.user_id === req.user.id);
  res.json({ success: true, orders: userOrders.reverse() });
});

// --- Feedback Routes ---
app.post('/api/feedback', (req, res) => {
  const { name, phone, rating, comment } = req.body;
  feedbacks.push({
    id: feedbacks.length + 1,
    name, phone: phone || 'Anonymous',
    rating: Math.min(5, Math.max(1, parseInt(rating))),
    comment,
    createdAt: new Date().toISOString()
  });
  res.json({ success: true, message: 'Thank you for your feedback! 🙏' });
});

app.get('/api/feedback', (req, res) => res.json({ success: true, feedbacks: [...feedbacks].reverse().slice(0, 20) }));
app.post('/api/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) delete sessions[token];
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const providerLabel = { 'firebase': '🔥 Firebase (Google/Phone)', 'demo': '🧪 Demo Mode' };
app.listen(PORT, () => console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   🍗  RANE DA DHABA — Server Running  🍗        ║
  ║   Local:  http://localhost:${PORT}                 ║
  ║   OTP:    ${providerLabel[OTP_PROVIDER] || OTP_PROVIDER}               ║
  ╚══════════════════════════════════════════════════╝
`));

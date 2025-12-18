const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt'); // Added for hashing [cite: 18, 21]
const jwt = require('jsonwebtoken'); // Added for JWT [cite: 18, 39]

// Import the models
const Customer = require('./models/Customer');
const Driver = require('./models/Driver');
const Booking = require('./models/Booking');
const Admin = require('./models/Admin'); // New Admin Model

dotenv.config();

const app = express();
app.use(express.json());

// 1. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rideHailingDB';
const saltRounds = 10; // [cite: 22]

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// ==========================================
// 2. MIDDLEWARE (RBAC) [cite: 52]
// ==========================================

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // [cite: 56]

    if (!token) return res.status(401).json({ error: "Unauthorized" }); // [cite: 57]

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // [cite: 62]
        req.user = decoded; // [cite: 60]
        next(); // [cite: 61]
    } catch (err) {
        res.status(401).json({ error: "Invalid token" }); // [cite: 65]
    }
};

const authorize = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) { // [cite: 69]
        return res.status(403).json({ error: "Forbidden" }); // [cite: 70]
    }
    next();
};

// ==========================================
// 3. REGISTRATION & LOGIN [cite: 16, 33]
// ==========================================

// [POST] Register User (Customer or Admin)
app.post('/users', async (req, res) => {
    try {
        const { role, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, saltRounds); // [cite: 25]

        if (role === 'admin') {
            // Save specifically to Admin collection
            const admin = new Admin({ ...req.body, password: hashedPassword });
            await admin.save();
            res.status(201).json({ message: "Admin created in admin collection" });
        } else {
            // Default to Customer collection
            const customer = new Customer({ ...req.body, password: hashedPassword }); // [cite: 26]
            await customer.save();
            res.status(201).json({ message: "User created in customer collection" }); // [cite: 28]
        }
    } catch (err) {
        res.status(400).json({ error: "Registration failed" }); // [cite: 30]
    }
});

// [POST] Register Driver
app.post('/drivers', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);
        const driver = new Driver({ ...req.body, password: hashedPassword });
        await driver.save();
        res.status(201).json({ message: "Driver created" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [POST] Login (Returns JWT) [cite: 37]
app.post('/auth/login', async (req, res) => {
    const { email, password, type } = req.body;
    try {
        let user;
        // Direct search to the specific collection based on 'type'
        if (type === 'admin') {
            user = await Admin.findOne({ email });
        } else if (type === 'driver') {
            user = await Driver.findOne({ email }); // [cite: 41]
        } else {
            user = await Customer.findOne({ email });
        }
        
        // Compare password [cite: 43]
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" }); // [cite: 45]
        }

        // Generate Token [cite: 46]
        const token = jwt.sign(
            { userId: user._id, role: user.role }, // [cite: 47]
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN } // [cite: 48]
        );

        res.status(200).json({ token }); // [cite: 49]
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. PROTECTED ADMIN ENDPOINTS [cite: 72]
// ==========================================

app.delete('/admin/users/:id', authenticate, authorize(['admin']), async (req, res) => { // [cite: 74]
    try {
        // Delete from all potential collections
        await Admin.findByIdAndDelete(req.params.id);
        await Customer.findByIdAndDelete(req.params.id);
        await Driver.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Admin access: User deleted from system" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/admin/system-management', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const stats = {
            totalAdmins: await Admin.countDocuments(),
            totalCustomers: await Customer.countDocuments(),
            totalDrivers: await Driver.countDocuments(),
            totalBookings: await Booking.countDocuments()
        };
        const recentActivity = await Booking.find().sort({ createdAt: -1 }).limit(5);

        res.status(200).json({
            status: "System Operational",
            statistics: stats,
            recentActivity: recentActivity
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. OTHER ROUTES
// ==========================================

app.get('/customer/:id', authenticate, async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: 'Customer Not Found' });
        res.status(200).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Import the models
const Customer = require('./models/Customer');
const Driver = require('./models/Driver');
const Booking = require('./models/Booking');
const Admin = require('./models/Admin');

dotenv.config();

const app = express();
app.use(express.json());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rideHailingDB';
const saltRounds = 10;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// ==========================================
// 2. MIDDLEWARE (RBAC)
// ==========================================

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

const authorize = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
};

// ==========================================
// 3. REGISTRATION & LOGIN
// ==========================================

// [POST] Register User (Customer or Admin)
app.post('/users', async (req, res) => {
    try {
        const { role, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        if (role === 'admin') {
            const admin = new Admin({ ...req.body, password: hashedPassword });
            await admin.save();
            res.status(201).json({ message: "Admin created in admin collection" });
        } else {
            const customer = new Customer({ ...req.body, password: hashedPassword });
            await customer.save();
            res.status(201).json({ message: "User created in customer collection" });
        }
    } catch (err) {
        res.status(400).json({ error: "Registration failed" });
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

// [POST] Login (Returns JWT)
app.post('/auth/login', async (req, res) => {
    const { email, password, type } = req.body;
    try {
        let user;
        if (type === 'admin') {
            user = await Admin.findOne({ email });
        } else if (type === 'driver') {
            user = await Driver.findOne({ email });
        } else {
            user = await Customer.findOne({ email });
        }
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(200).json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. PROTECTED ADMIN ENDPOINTS
// ==========================================

app.delete('/admin/users/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
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
// 5. OTHER ROUTES (Customer & Driver Updates)
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

// [PATCH] Update Customer Profile
app.patch('/customer/:id', authenticate, async (req, res) => {
    try {
        if (req.user.userId !== req.params.id) {
            return res.status(403).json({ error: "Access Denied: You can only update your own profile." });
        }

        if (req.body.password) {
            req.body.password = await bcrypt.hash(req.body.password, saltRounds);
        }

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        if (!customer) return res.status(404).json({ message: "Customer not found" });

        res.status(200).json({ 
            message: "Profile updated successfully", 
            data: customer 
        });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [PATCH] Update Driver Status
app.patch('/drivers/:id/status', authenticate, async (req, res) => {
    try {
        const { status } = req.body; 
        const driver = await Driver.findByIdAndUpdate(
            req.params.id, 
            { status: status }, 
            { new: true }
        );
        if (!driver) return res.status(404).json({ message: "Driver not found" });
        res.status(200).json(driver);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [PATCH] Update Driver Details
app.patch('/drivers/:id', authenticate, async (req, res) => {
    try {
        const driver = await Driver.findByIdAndUpdate(
            req.params.id,
            req.body, 
            { new: true }
        );
        if (!driver) return res.status(404).json({ message: "Driver not found" });
        res.status(200).json(driver);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==========================================
// 6. BOOKING ROUTES (The Core Feature)
// ==========================================

// [POST] Create New Booking (Customer Only)
// UPDATED: Now accepts 'distance' for Lab Week 7 Analysis
app.post('/bookings', authenticate, authorize(['customer']), async (req, res) => {
    try {
        // PERUBAHAN DI SINI: Extract 'distance' dari req.body
        const { pickupLocation, dropoffLocation, fare, distance } = req.body;

        const newBooking = new Booking({
            customer: req.user.userId,
            pickupLocation,
            dropoffLocation,
            fare,
            distance, // PERUBAHAN DI SINI: Simpan nilai distance ke database
            status: 'pending'
        });

        await newBooking.save();

        res.status(201).json({ 
            message: "Booking berjaya dibuat! Menunggu driver...", 
            booking: newBooking 
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [GET] View Pending Bookings (Driver Only)
app.get('/bookings/pending', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const bookings = await Booking.find({ status: 'pending' })
            .populate('customer', 'name email phoneNumber') 
            .sort({ createdAt: -1 });

        res.status(200).json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Driver Accept Booking
app.patch('/bookings/:id/accept', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const bookingId = req.params.id;
        const driverId = req.user.userId;

        const booking = await Booking.findOne({ _id: bookingId, status: 'pending' });

        if (!booking) {
            return res.status(400).json({ error: "Booking not found or already taken by other driver" });
        }

        booking.driver = driverId;
        booking.status = 'accepted';
        await booking.save();

        res.status(200).json({ message: "Job Accepted! Sila jemput customer.", booking });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Customer Cancel Booking
app.patch('/bookings/:id/cancel', authenticate, authorize(['customer']), async (req, res) => {
    try {
        const booking = await Booking.findOne({ 
            _id: req.params.id, 
            customer: req.user.userId 
        });

        if (!booking) return res.status(404).json({ error: "Booking not found" });

        booking.status = 'cancelled';
        await booking.save();

        res.status(200).json({ message: "Booking cancelled", booking });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [GET] Customer View My Bookings (History)
app.get('/bookings/my-history', authenticate, authorize(['customer']), async (req, res) => {
    try {
        const myBookings = await Booking.find({ customer: req.user.userId })
            .populate('driver', 'name vehicleType')
            .sort({ createdAt: -1 });

        res.status(200).json(myBookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] Customer Rate Driver (Selepas ride complete)
app.post('/bookings/:id/rate', authenticate, authorize(['customer']), async (req, res) => {
    try {
        const { rating, review } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findOne({ 
            _id: bookingId, 
            customer: req.user.userId 
        });

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        
        if (booking.status === 'pending' || booking.status === 'cancelled') {
            return res.status(400).json({ error: "Ride belum selesai, tak boleh rate lagi." });
        }

        booking.rating = rating;
        booking.review = review;
        booking.status = 'completed'; 
        await booking.save();

        const driverId = booking.driver;
        const driverBookings = await Booking.find({ 
            driver: driverId, 
            rating: { $exists: true } 
        });

        const totalStars = driverBookings.reduce((acc, b) => acc + b.rating, 0);
        const newAverage = totalStars / driverBookings.length;

        await Driver.findByIdAndUpdate(driverId, {
            averageRating: newAverage.toFixed(1),
            totalRatings: driverBookings.length
        });

        res.status(200).json({ 
            message: "Terima kasih atas rating anda!", 
            rating: rating,
            newDriverAverage: newAverage.toFixed(1)
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 7. ANALYTICS ROUTES (LAB WEEK 7)
// ==========================================

// [GET] Passenger Analytics (Aggregation Pipeline)
// Requirement: Analyze passenger ride data using $lookup, $unwind, $group, $project
app.get('/analytics/passengers', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const stats = await Customer.aggregate([
            {
                // Stage 1: Join Customer dengan Booking
                $lookup: {
                    from: 'bookings',        // Nama collection booking dalam database
                    localField: '_id',       // ID pada Customer
                    foreignField: 'customer',// Field dalam Booking yang link ke Customer
                    as: 'rideData'           // Output array baru
                }
            },
            {
                // Stage 2: Pecahkan array rideData
                $unwind: {
                    path: '$rideData',
                    preserveNullAndEmptyArrays: false // Hanya customer yang pernah booking sahaja
                }
            },
            {
                // Stage 3: Grouping & Calculation
                $group: {
                    _id: "$name", // Group ikut nama customer
                    totalRides: { $sum: 1 },             // Kira jumlah booking
                    totalFare: { $sum: "$rideData.fare" }, // Tambah semua tambang
                    avgDistance: { $avg: "$rideData.distance" } // Kira purata jarak
                }
            },
            {
                // Stage 4: Format Output (Project)
                $project: {
                    _id: 0,              // Hide ID
                    name: "$_id",        // Rename _id -> name
                    totalRides: 1,
                    totalFare: { $round: ["$totalFare", 2] }, // Bundarkan 2 titik perpuluhan
                    avgDistance: { $round: ["$avgDistance", 2] }
                }
            }
        ]);

        res.status(200).json(stats);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 8. HOMEPAGE ROUTE (Server Health Check)
// ==========================================
app.get('/', (req, res) => {
    res.status(200).json({
        message: "WELCOME TO GROUP G RIDE API SERVER 🚀",
        status: "Server is Running",
        authors: "AFIFIKRAM, AZYZUL DAN RAZIN",
        description: "Backend API for Ride Hailing System (BENR2423)"
    });
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
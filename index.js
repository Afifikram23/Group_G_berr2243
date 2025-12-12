const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Import the models
const Customer = require('./models/Customer');
const Driver = require('./models/Driver');
const Booking = require('./models/Booking');

dotenv.config();

const app = express();
app.use(express.json());

// 1. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rideHailingDB';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));


// ==========================================
// 2. API ENDPOINTS
// ==========================================

// [POST] Register Customer
app.post('/users', async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json(customer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [POST] Register Driver
app.post('/drivers', async (req, res) => {
    try {
        const driver = new Driver(req.body);
        await driver.save();
        res.status(201).json(driver);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [POST] Login (Customer or Driver)
app.post('/auth/login', async (req, res) => {
    const { email, password, type } = req.body;
    try {
        let user;
        if (type === 'driver') {
            user = await Driver.findOne({ email, password }); 
        } else {
            user = await Customer.findOne({ email, password });
        }
        
        if (!user) return res.status(401).json({ message: "Invalid credentials" });
        res.json({ message: "Login successful", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------
//  CUSTOMER PROFILE FEATURES
// ------------------------------------------

// [GET] View Customer Profile
app.get('/customer/:id', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: 'Customer Not Found' });
        res.status(200).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Update Customer Profile
app.patch('/customers/:id', async (req, res) => {
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        if (!updatedCustomer) return res.status(404).json({ message: 'Customer Not Found' });
        res.status(200).json(updatedCustomer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [DELETE] Delete Customer Profile
app.delete('/customer/:id', async (req, res) => {
    try {
        const deletedCustomer = await Customer.findByIdAndDelete(req.params.id);
        if (!deletedCustomer) return res.status(404).json({ message: 'Customer Not Found' });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------
//  DRIVER PROFILE FEATURES
// ------------------------------------------

// [GET] View Driver Profile
app.get('/drivers/:id', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver Not Found' });
        res.status(200).json(driver);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Update Driver Profile
app.patch('/drivers/:id', async (req, res) => {
    try {
        const updatedDriver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDriver) return res.status(404).json({ message: 'Driver Not Found' });
        res.status(200).json(updatedDriver);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Update Driver Status
app.patch('/drivers/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const driver = await Driver.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!driver) return res.status(404).json({ message: 'Driver Not Found' });
        res.status(200).json(driver);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [DELETE] Delete Driver Profile
app.delete('/drivers/:id', async (req, res) => {
    try {
        const deletedDriver = await Driver.findByIdAndDelete(req.params.id);
        if (!deletedDriver) return res.status(404).json({ message: 'Driver Not Found' });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [GET] View Driver Ratings
app.get('/drivers/:id/ratings', async (req, res) => {
    try {
        const bookings = await Booking.find({ 
            driverId: req.params.id, 
            rating: { $exists: true } 
        });
        const ratings = bookings.map(b => b.rating);
        const average = ratings.length > 0 
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
            : 0;

        res.status(200).json({
            driverId: req.params.id,
            totalRatings: ratings.length,
            averageRating: average, 
            ratingsList: ratings
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------
//  BOOKING & ADMIN ENDPOINTS
// ------------------------------------------

// [POST] Create Booking
app.post('/bookings', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        await booking.save();
        res.status(201).json(booking);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// [GET] View All Bookings
app.get('/bookings', async (req, res) => {
    const bookings = await Booking.find().populate('customerId').populate('driverId');
    res.json(bookings);
});

// [GET] View Specific Booking
app.get('/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('customerId').populate('driverId');
        if (!booking) return res.status(404).json({ message: 'Booking Not Found' });
        res.status(200).json(booking);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Update Booking
app.patch('/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!booking) return res.status(404).json({ message: 'Booking Not Found' });
        res.status(200).json(booking);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] Customer Rating (Rate a Booking)
app.post('/bookings/:id/rating', async (req, res) => {
    try {
        const { rating } = req.body;
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { rating: rating },
            { new: true }
        );
        if (!booking) return res.status(404).json({ message: 'Booking Not Found' });
        res.status(201).json(booking);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [DELETE] Delete Booking
app.delete('/bookings/:id', async (req, res) => {
    try {
        const deletedBooking = await Booking.findByIdAndDelete(req.params.id);
        if (!deletedBooking) return res.status(404).json({ message: 'Booking Not Found' });
        res.status(204).send(); 
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [DELETE] Admin Block User
app.delete('/admin/users/:id', async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.params.id);
        await Driver.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [GET] Admin System Management (Dashboard View) <--- NEW CODE
app.get('/admin/system-management', async (req, res) => {
    try {
        const customerCount = await Customer.countDocuments();
        const driverCount = await Driver.countDocuments();
        const bookingCount = await Booking.countDocuments();

        const recentBookings = await Booking.find().sort({ createdAt: -1 }).limit(5);

        res.status(200).json({
            status: "System Operational",
            statistics: {
                totalCustomers: customerCount,
                totalDrivers: driverCount,
                totalBookings: bookingCount
            },
            recentActivity: recentBookings
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
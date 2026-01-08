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
app.post('/bookings', authenticate, authorize(['customer']), async (req, res) => {
    try {
        const { pickupLocation, dropoffLocation, fare, distance } = req.body;

        const newBooking = new Booking({
            customer: req.user.userId,
            pickupLocation,
            dropoffLocation,
            fare,
            distance, 
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

app.get('/analytics/passengers', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const stats = await Customer.aggregate([
            {
                $lookup: {
                    from: 'bookings',
                    localField: '_id',
                    foreignField: 'customer',
                    as: 'rideData'
                }
            },
            {
                $unwind: {
                    path: '$rideData',
                    preserveNullAndEmptyArrays: false
                }
            },
            {
                $group: {
                    _id: "$name",
                    totalRides: { $sum: 1 },
                    totalFare: { $sum: "$rideData.fare" },
                    avgDistance: { $avg: "$rideData.distance" }
                }
            },
            {
                $project: {
                    _id: 0,
                    name: "$_id",
                    totalRides: 1,
                    totalFare: { $round: ["$totalFare", 2] },
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
// 8. HOMEPAGE ROUTE (PROFESSIONAL UI)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Group G API Server</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
            }
            .container {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 50px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                border: 1px solid rgba(255, 255, 255, 0.18);
                text-align: center;
                max-width: 600px;
                width: 90%;
            }
            h1 {
                font-size: 3rem;
                margin-bottom: 10px;
                background: -webkit-linear-gradient(#00c6ff, #0072ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-weight: 800;
            }
            .subtitle {
                font-size: 1.2rem;
                margin-bottom: 30px;
                color: #e0e0e0;
                letter-spacing: 1px;
            }
            .status-badge {
                background-color: #2ecc71;
                color: #000;
                padding: 8px 20px;
                border-radius: 50px;
                font-weight: bold;
                display: inline-block;
                margin-bottom: 30px;
                box-shadow: 0 0 15px rgba(46, 204, 113, 0.5);
            }
            .team {
                margin-top: 40px;
                border-top: 1px solid rgba(255,255,255,0.2);
                padding-top: 20px;
            }
            .team h3 {
                font-size: 0.9rem;
                text-transform: uppercase;
                color: #aaa;
                margin-bottom: 10px;
            }
            .members {
                font-size: 1.1rem;
                font-weight: 500;
                line-height: 1.6;
            }
            .api-info {
                font-size: 0.8rem;
                margin-top: 30px;
                color: #888;
                font-style: italic;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>GROUP G RIDE</h1>
            <p class="subtitle">ENTERPRISE API SERVER</p>
            
            <div class="status-badge">
                ● SYSTEM OPERATIONAL
            </div>

            <p>Welcome to the backend infrastructure for the Ride Hailing System (BENR2423).</p>

            <div class="team">
                <h3>Developed By Engineering Team:</h3>
                <div class="members">
                    Afifikram<br>
                    Azyzul<br>
                    Razin
                </div>
            </div>

            <div class="api-info">
                Secure Connection via Azure Cloud • Node.js Environment
            </div>
        </div>
    </body>
    </html>
    `);
});

// ==========================================
// 9. WEB DASHBOARD (VISUAL UNTUK BROWSER)
// ==========================================
app.get('/dashboard', async (req, res) => {
    try {
        const stats = {
            totalAdmins: await Admin.countDocuments(),
            totalCustomers: await Customer.countDocuments(),
            totalDrivers: await Driver.countDocuments(),
            totalBookings: await Booking.countDocuments()
        };
        const recentActivity = await Booking.find().sort({ createdAt: -1 }).limit(5);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', sans-serif; background-color: #f0f2f5; padding: 20px; }
                .header { margin-bottom: 20px; }
                .header h2 { color: #1a1a1a; margin: 0; }
                .badge { background: #28a745; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: bold; }
                
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
                .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); text-align: center; border-bottom: 4px solid #007bff; }
                .card h3 { font-size: 36px; margin: 10px 0; color: #007bff; }
                .card p { color: #666; margin: 0; font-weight: 600; text-transform: uppercase; font-size: 12px; }

                .activity-section { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; min-width: 600px; }
                th { text-align: left; padding: 12px; background: #f8f9fa; color: #666; font-size: 14px; }
                td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
                
                .status-pill { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
                .pending { background: #fff3cd; color: #856404; }
                .accepted { background: #cce5ff; color: #004085; }
                .completed { background: #d4edda; color: #155724; }
                .cancelled { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>🚀 Admin Dashboard <span class="badge">LIVE SYSTEM</span></h2>
                <p style="color: #666; font-size: 14px;">Real-time Data from Azure Cloud Database</p>
            </div>

            <div class="stats-grid">
                <div class="card" style="border-color: #007bff">
                    <h3>${stats.totalBookings}</h3>
                    <p>Total Bookings</p>
                </div>
                <div class="card" style="border-color: #28a745">
                    <h3>${stats.totalCustomers}</h3>
                    <p>Customers</p>
                </div>
                <div class="card" style="border-color: #ffc107">
                    <h3>${stats.totalDrivers}</h3>
                    <p>Drivers</p>
                </div>
                <div class="card" style="border-color: #dc3545">
                    <h3>${stats.totalAdmins}</h3>
                    <p>Admins</p>
                </div>
            </div>

            <div class="activity-section">
                <h3 style="margin: 0; color: #333;">Recent Booking Activity</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Pickup</th>
                            <th>Destination</th>
                            <th>Fare (RM)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentActivity.map(ride => `
                        <tr>
                            <td>${new Date(ride.createdAt).toLocaleDateString()}</td>
                            <td>${ride.pickupLocation}</td>
                            <td>${ride.dropoffLocation}</td>
                            <td>${ride.fare.toFixed(2)}</td>
                            <td><span class="status-pill ${ride.status}">${ride.status}</span></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
        `;

        res.send(html);

    } catch (err) {
        res.status(500).send("Error loading dashboard: " + err.message);
    }
});

// ==========================================
// 10. DELETE ROUTE (FIXED)
// ==========================================

// DELETE Customer (Updated: Now uses Customer model)
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // ✅ FIX: Guna 'Customer' bukan 'User'
    const deletedUser = await Customer.findByIdAndDelete(id);
    
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User account deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
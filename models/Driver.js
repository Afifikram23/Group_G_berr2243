const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    vehicleType: { type: String, required: true },
    plateNumber: { type: String, required: true },
    role: { type: String, default: 'driver' },
    status: { type: String, default: 'offline' }, // online, offline, busy

    // --- BARU TAMBAH (Untuk Simpan Average Rating) ---
    averageRating: { type: Number, default: 0 }, // Contoh: 4.8
    totalRatings: { type: Number, default: 0 },  // Berapa orang dah rate
    // -------------------------------------------------

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Driver', driverSchema);
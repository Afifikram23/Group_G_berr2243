const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // <--- ADDED THIS
    vehicleType: { type: String },
    status: { type: String, default: 'available' },
    role: { type: String, default: 'driver' }
});

module.exports = mongoose.model('Driver', driverSchema);
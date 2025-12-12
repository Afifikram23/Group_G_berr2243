const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },  // <--- ADDED THIS LINE
    role: { type: String, default: 'customer' }
});

module.exports = mongoose.model('Customer', customerSchema);
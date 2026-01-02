const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    customer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Customer', // Ini penting supaya boleh link ke profile customer
        required: true 
    },
    driver: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Driver' // Mula-mula kosong, bila driver accept baru isi
    },
    pickupLocation: { type: String, required: true },
    dropoffLocation: { type: String, required: true },
    fare: { type: Number, required: true },
    
    // --- BARU TAMBAH (Untuk Lab Week 7) ---
    distance: { 
        type: Number, 
        required: true // Wajib ada untuk kira 'avgDistance' nanti
    },
    // --------------------------------------

    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    
    // --- Rating System ---
    rating: { 
        type: Number, 
        min: 1, 
        max: 5 
    },
    review: { 
        type: String 
    },
    // ---------------------

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
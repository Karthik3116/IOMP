const mongoose = require('mongoose');

const CameraSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: String,
    streamUrl: { type: String, required: true },
    status: { type: String, default: 'Stopped' },
    addedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Camera', CameraSchema);
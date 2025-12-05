const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    cameraName: { type: String, required: true },
    detectedClass: { type: String, required: true },
    confidence: { type: Number, required: true },
    image: { type: String }, // Stores filename (e.g., "cam1_uuid.jpg")
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', ReportSchema);
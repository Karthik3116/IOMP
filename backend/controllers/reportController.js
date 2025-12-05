const Report = require('../models/Report');

// Get all reports
exports.getReports = async (req, res) => {
    try {
        const reports = await Report.find().sort({ timestamp: -1 }).limit(100);
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Create a report (Called by Python)
exports.createReport = async (req, res, io) => {
    const { cameraName, detectedClass, confidence, image } = req.body;

    console.log(`📩 Webhook received: ${detectedClass} on ${cameraName}`);

    try {
        const newReport = new Report({ 
            cameraName, 
            detectedClass, 
            confidence, 
            image 
        });
        await newReport.save();

        // Trigger Real-time update
        io.emit('new_alert', newReport);

        console.log(`✅ [DB SAVE] Report saved. Image: ${image}`);
        res.status(201).json(newReport);
    } catch (err) {
        console.error("❌ Save Error:", err);
        res.status(500).json({ error: "Failed to save report" });
    }
};
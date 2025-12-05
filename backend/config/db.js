const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect('uri');
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    }
};

module.exports = connectDB;

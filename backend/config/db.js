const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb+srv://karthik3116k:SDTo3NAOVYvHakrm@cluster0.edbxe4c.mongodb.net/drone_guard?retryWrites=true&w=majority&appName=Cluster0');
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    }
};

module.exports = connectDB;
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

// Controllers
const cameraController = require('./controllers/cameraController');
const reportController = require('./controllers/reportController');

const app = express();
const server = http.createServer(app); 

// Middleware
app.use(cors());
app.use(express.json());

// Serve static captures
app.use('/captures', express.static(path.join(__dirname, 'public', 'captures')));

// Database
connectDB();

// Socket.io
const io = new Server(server, { 
    cors: { origin: "*" } 
});

io.on('connection', (socket) => {
    console.log('⚡ Frontend Client Connected');
    
    // Optional: Allow mobile to self-register via socket (future proofing)
    socket.on('register_device', (data) => {
        console.log('📱 Mobile Beacon:', data);
        io.emit('device_found', data);
    });
});

// --- ROUTES ---

// Camera Management
app.get('/api/cameras', cameraController.getCameras);
app.post('/api/cameras', cameraController.addCamera);
app.post('/api/cameras/scan', cameraController.scanNetwork);
app.patch('/api/cameras/:id/status', cameraController.updateStatus);
app.delete('/api/cameras/:id', cameraController.deleteCamera);

// Reporting
app.get('/api/reports', reportController.getReports);
app.post('/api/webhook/detection', (req, res) => {
    reportController.createReport(req, res, io);
});

// Start
const PORT = 4000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Serving Images from: ${path.join(__dirname, 'public', 'captures')}`);
});
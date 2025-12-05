const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const cameraController = require('./controllers/cameraController');
const reportController = require('./controllers/reportController');

const app = express();
const server = http.createServer(app); 

app.use(cors());
app.use(express.json());
app.use('/captures', express.static(path.join(__dirname, 'public', 'captures')));

connectDB();

const io = new Server(server, { cors: { origin: "*" } });
io.on('connection', (socket) => { console.log('⚡ Frontend Client Connected'); });

app.get('/api/cameras', cameraController.getCameras);
app.post('/api/cameras', cameraController.addCamera);
app.post('/api/cameras/scan', cameraController.scanNetwork);
app.patch('/api/cameras/:id/status', cameraController.updateStatus);
app.delete('/api/cameras/:id', cameraController.deleteCamera);
app.get('/api/reports', reportController.getReports);
app.post('/api/webhook/detection', (req, res) => { reportController.createReport(req, res, io); });

const PORT = 4000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
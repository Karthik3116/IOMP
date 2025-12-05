const Camera = require('../models/Camera');
const tcpp = require('tcp-ping');
const os = require('os');
const axios = require('axios');

const getLocalIp = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
};

exports.getCameras = async (req, res) => {
    const cameras = await Camera.find().sort({ addedAt: -1 });
    res.json(cameras);
};

exports.addCamera = async (req, res) => {
    try {
        const newCam = new Camera(req.body);
        await newCam.save();
        res.json(newCam);
    } catch(err) { res.status(500).json(err); }
};

exports.scanNetwork = async (req, res) => {
    const localIp = getLocalIp();
    const subnet = localIp.substring(0, localIp.lastIndexOf('.')); 
    
    console.log(`🔎 Scanning Subnet: ${subnet}.x on Port 8080...`);

    const checkIp = (ip) => {
        return new Promise((resolve) => {
            tcpp.probe(ip, 8080, (err, available) => {
                if (available) {
                    resolve({
                        ip,
                        name: `Mobile Device (${ip})`,
                        location: 'Auto-Discovered',
                        streamUrl: `http://${ip}:8080/video`,
                        status: 'Stopped'
                    });
                } else {
                    resolve(null);
                }
            });
        });
    };

    const promises = [];
    for (let i = 1; i < 255; i++) {
        promises.push(checkIp(`${subnet}.${i}`));
    }

    try {
        const results = await Promise.all(promises);
        const foundDevices = results.filter(dev => dev !== null);
        res.json(foundDevices);
    } catch (error) {
        res.status(500).json([]);
    }
};

exports.updateStatus = async (req, res) => {
    const { status } = req.body;
    try {
        const camera = await Camera.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (status === 'Stopped') {
            try {
                // Set short timeout so Node doesn't wait forever
                await axios.post('http://127.0.0.1:5000/terminate', 
                    { cameraName: camera.name },
                    { timeout: 1000 }
                );
            } catch (pyErr) {
                console.error("⚠️ Failed to signal Python:", pyErr.message);
            }
        }
        res.json(camera);
    } catch (err) {
        res.status(500).json(err);
    }
};

exports.deleteCamera = async (req, res) => {
    const cam = await Camera.findById(req.params.id);
    if (cam) {
        try {
            await axios.post('http://127.0.0.1:5000/terminate', { cameraName: cam.name });
        } catch (e) {} 
    }
    await Camera.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
};
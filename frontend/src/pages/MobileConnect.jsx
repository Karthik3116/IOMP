import React, { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import { Wifi, Smartphone, CheckCircle, Loader2 } from 'lucide-react';

export default function MobileConnect() {
  const [status, setStatus] = useState('initializing'); // initializing, connected, active
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    // Generate a random device name
    const randomName = `Cam-${Math.floor(Math.random() * 9000) + 1000}`;
    setDeviceName(randomName);

    // 1. Announce presence to the Server
    socket.emit('register_device', { 
      name: randomName,
      type: 'Mobile'
    });

    setStatus('connected');

    // Cleanup on unmount
    return () => {
      socket.off('register_device');
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans">
      {/* Pulse Animation */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-emerald-500/30 rounded-full animate-ping"></div>
        <div className="relative z-10 bg-slate-900 p-6 rounded-full border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
          <Wifi size={48} className="text-emerald-400" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">Device Beacon Active</h1>
      
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 w-full max-w-sm mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">Device Name</span>
          <span className="text-emerald-400 font-mono font-bold">{deviceName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Status</span>
          <div className="flex items-center gap-2 text-white text-sm">
             {status === 'connected' ? <CheckCircle size={14} className="text-emerald-500"/> : <Loader2 className="animate-spin"/>}
             {status === 'connected' ? 'Broadcast Active' : 'Connecting...'}
          </div>
        </div>
      </div>

      <div className="text-left bg-slate-900/50 p-6 rounded-xl border border-slate-800 max-w-sm w-full">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Smartphone size={18} className="text-indigo-400"/> Next Steps
        </h3>
        <ol className="list-decimal pl-5 space-y-3 text-sm text-slate-400">
          <li>Keep this browser tab open.</li>
          <li>Ensure an <strong>IP Camera App</strong> is running in the background (e.g., IP Webcam).</li>
          <li>Go to your <strong>Dashboard</strong> on your PC.</li>
          <li>Click "Add" when this device appears.</li>
        </ol>
      </div>

      <p className="mt-8 text-xs text-slate-600">
        DroneGuard Mobile Link v1.0
      </p>
    </div>
  );
}
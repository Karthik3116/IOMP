import React, { useState } from 'react';
import { Plus, Search, Loader2, Wifi } from 'lucide-react';
import CameraCard from '../components/CameraCard';
import { useCameras } from '../hooks/useCameras';
import { scanNetwork } from '../services/api';

export default function Dashboard() {
  const { cameras, addCamera, toggleCamera, deleteCamera } = useCameras();
  const [showModal, setShowModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState([]);
  
  // Manual Add State
  const [newCam, setNewCam] = useState({ name: '', location: '', streamUrl: '' });

  const handleManualSubmit = (e) => {
    e.preventDefault();
    addCamera(newCam);
    setShowModal(false);
    setNewCam({ name: '', location: '', streamUrl: '' });
  };

  const handleScan = async () => {
    setIsScanning(true);
    setFoundDevices([]);
    try {
        const devices = await scanNetwork();
        setFoundDevices(devices);
    } catch (error) {
        console.error("Scan failed", error);
    } finally {
        setIsScanning(false);
    }
  };

  const addFoundDevice = (device) => {
      addCamera(device);
      setFoundDevices(prev => prev.filter(d => d.streamUrl !== device.streamUrl));
  };

  return (
    <div className="p-8 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
            <h2 className="text-3xl font-bold text-white mb-1">Command Center</h2>
            <p className="text-slate-400">Manage active surveillance nodes.</p>
        </div>
        
        <div className="flex gap-3">
            <button onClick={() => setShowModal('scan')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-lg shadow-indigo-900/20 transition-all">
                <Search size={18} /> Auto-Scan Network
            </button>
            <button onClick={() => setShowModal('manual')} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium border border-slate-600 transition-all">
                <Plus size={18} /> Manual Add
            </button>
        </div>
      </div>

      {/* Grid */}
      {cameras.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
            <div className="p-4 bg-slate-800 rounded-full mb-4">
                <Wifi size={32} className="text-slate-500" />
            </div>
            <p className="text-slate-400 font-medium">No cameras detected.</p>
            <button onClick={() => setShowModal('scan')} className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 underline">Scan for devices?</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cameras.map(cam => (
            <CameraCard key={cam._id} camera={cam} onToggle={toggleCamera} onDelete={deleteCamera} />
            ))}
        </div>
      )}

      {/* --- MODALS --- */}

      {/* SCAN MODAL */}
      {showModal === 'scan' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 p-0 rounded-2xl w-[500px] border border-slate-700 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                <h3 className="text-xl font-bold text-white">Network Discovery</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6">
                <p className="text-slate-400 text-sm mb-6">
                    Scanning local network (192.168.x.x) for devices running <b>IP Webcam</b> on port <b>8080</b>.
                </p>

                <div className="flex justify-center mb-6">
                    {!isScanning && foundDevices.length === 0 && (
                        <button onClick={handleScan} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2">
                            Start Scan
                        </button>
                    )}
                    
                    {isScanning && (
                        <div className="flex flex-col items-center text-indigo-400">
                            <Loader2 size={48} className="animate-spin mb-4" />
                            <span className="font-mono text-xs uppercase tracking-widest">Scanning Subnet...</span>
                        </div>
                    )}
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto">
                    {foundDevices.map((device, idx) => (
                        <div key={idx} className="bg-slate-800 p-4 rounded-lg flex justify-between items-center border border-slate-700">
                            <div>
                                <p className="font-bold text-white">{device.name}</p>
                                <p className="text-xs text-slate-500 font-mono">{device.streamUrl}</p>
                            </div>
                            <button onClick={() => addFoundDevice(device)} className="bg-indigo-600 hover:bg-indigo-500 text-xs font-bold px-3 py-1.5 rounded text-white">
                                + ADD
                            </button>
                        </div>
                    ))}
                    {!isScanning && foundDevices.length === 0 && (
                        <p className="text-center text-slate-600 text-sm">No new devices found.</p>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL MODAL */}
      {showModal === 'manual' && (
        
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 p-6 rounded-2xl w-96 border border-slate-700 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-white">Add Device Manually</h3>
            <form onSubmit={handleManualSubmit} className="space-y-4">
                {/* Inside the Manual Modal Form */}
                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stream URL / ID</label>
                    <input 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none" 
                        placeholder="http://192.168.0.101:8080/video" 
                        value={newCam.streamUrl} 
                        onChange={e => setNewCam({...newCam, streamUrl: e.target.value})} 
                        required 
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                        *For IP Webcam App, must end with <b>/video</b>
                    </p>
                    </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Device Name</label>
                <input className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none" placeholder="e.g. Backyard Cam" value={newCam.name} onChange={e => setNewCam({...newCam, name: e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
                <input className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none" placeholder="e.g. Sector 4" value={newCam.location} onChange={e => setNewCam({...newCam, location: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stream URL / ID</label>
                <input className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none" placeholder="http://192.168... OR 0" value={newCam.streamUrl} onChange={e => setNewCam({...newCam, streamUrl: e.target.value})} required />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-900/20 transition-colors">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
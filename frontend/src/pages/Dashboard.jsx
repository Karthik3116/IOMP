import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Loader2, Wifi, ServerCrash, 
  Cctv, Activity, Signal, Power, Trash2
} from 'lucide-react';
import { useCameras } from '../hooks/useCameras';
import { scanNetwork, getStreamUrl } from '../services/api';

// --- SUB-COMPONENT: PROFESSIONAL SURVEILLANCE FEED ---
const SurveillanceFeed = ({ camera, fps, onToggle, onDelete }) => {
  const [time, setTime] = useState(new Date());
  const [isHovered, setIsHovered] = useState(false);

  // Memoize stream URL to prevent reloading on every render
  const streamSrc = useMemo(() => {
    return `${getStreamUrl(camera.streamUrl, camera.name)}&t=${Date.now()}`;
  }, [camera.status, camera.streamUrl, camera.name]);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="relative bg-zinc-950 border border-zinc-800 aspect-video group overflow-hidden shadow-2xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="w-full h-full relative">
        {camera.status === 'Active' ? (
          <img 
            src={streamSrc}
            alt={camera.name}
            className="w-full h-full object-cover"
            onError={(e) => {e.target.style.display='none'; e.target.nextSibling.style.display='flex'}} 
          />
        ) : null}

        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black ${camera.status === 'Active' ? 'hidden' : 'flex'}`}>
            <Signal className="text-zinc-700 mb-2 animate-pulse" size={48} />
            <span className="text-zinc-500 font-mono tracking-[0.2em] text-sm">NO SIGNAL</span>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="bg-black/60 backdrop-blur-sm px-2 py-1 border-l-2 border-emerald-500">
            <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider">{camera.name}</h3>
          </div>
          <div className="flex gap-2">
            {camera.status === 'Active' && (
              <>
                <div className="flex items-center gap-2 bg-red-950/80 px-2 py-1 rounded-sm border border-red-900">
                   <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                   <span className="text-red-500 font-mono text-xs font-bold">REC</span>
                </div>
                <div className="bg-black/60 px-2 py-1 rounded-sm border border-zinc-800">
                   <span className={`font-mono text-xs ${fps > 24 ? 'text-emerald-400' : fps > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {fps || 0} FPS
                   </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-between items-end">
           <div className="font-mono text-xs text-zinc-300 bg-black/40 px-2 py-1">
             {time.toLocaleDateString()} {time.toLocaleTimeString()}
           </div>
        </div>
      </div>

      <div className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-4 transition-opacity duration-200 pointer-events-auto ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
         <button onClick={() => onToggle(camera._id, camera.status)} className={`p-3 rounded-full border-2 transition-all hover:scale-110 ${camera.status === 'Active' ? 'border-red-500 bg-red-500/20 text-red-500' : 'border-emerald-500 bg-emerald-500/20 text-emerald-500'}`}>
           <Power size={24} />
         </button>
         <button onClick={() => onDelete(camera._id)} className="p-3 rounded-full border-2 border-zinc-500 bg-zinc-800 text-zinc-300 hover:border-red-500 hover:text-red-500 hover:bg-red-950 transition-all hover:scale-110">
           <Trash2 size={24} />
         </button>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { cameras, addCamera, toggleCamera, deleteCamera } = useCameras();
  const [fpsData, setFpsData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState([]);
  const [scanStatus, setScanStatus] = useState('');
  const [newCam, setNewCam] = useState({ name: '', location: '', streamUrl: '' });

  // 🟢 POLL FPS DATA FROM BACKEND
  useEffect(() => {
    const interval = setInterval(async () => {
       try {
         // Assuming backend is at port 5000 based on previous context
         const res = await fetch('http://localhost:5000/fps');
         if (res.ok) {
            const data = await res.json();
            setFpsData(data);
         }
       } catch (e) {
         // Silently fail on connection error to avoid console spam
       }
    }, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    addCamera(newCam);
    setShowModal(false);
    setNewCam({ name: '', location: '', streamUrl: '' });
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanStatus('scanning');
    setFoundDevices([]);
    try {
        const devices = await scanNetwork();
        setFoundDevices(devices);
        setScanStatus('complete');
    } catch (error) {
        setScanStatus('error');
    } finally {
        setIsScanning(false);
    }
  };

  return (
    <div className="bg-black min-h-screen text-zinc-300 font-sans selection:bg-emerald-500/30">
      <div className="sticky top-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-900/30 p-2 rounded border border-emerald-500/30">
             <Cctv className="text-emerald-500" size={24} />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight leading-none">SECURITY OPS</h1>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">System Online • v2.4.0</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={() => { setShowModal('scan'); setScanStatus('idle'); setFoundDevices([]); }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-zinc-700 transition-all">
             <Search size={14} /> Auto-Discovery
           </button>
           <button onClick={() => setShowModal('manual')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all">
             <Plus size={14} /> Add Node
           </button>
        </div>
      </div>

      <div className="p-6">
        {cameras.length === 0 ? (
          <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
              <Wifi size={64} className="text-zinc-600" />
              <p className="text-zinc-500 font-mono mt-6 text-lg">NO ACTIVE VIDEO FEEDS</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
             {cameras.map(cam => (
               <SurveillanceFeed 
                 key={cam._id} 
                 camera={cam} 
                 fps={fpsData[cam.name] || 0} // Pass Real FPS here
                 onToggle={toggleCamera} 
                 onDelete={deleteCamera} 
               />
             ))}
          </div>
        )}
      </div>
      
      {/* MODALS */}
      {(showModal === 'scan' || showModal === 'manual') && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 w-[500px] shadow-2xl overflow-hidden">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
               <h3 className="text-white font-bold font-mono uppercase tracking-wider text-sm flex items-center gap-2">
                 {showModal === 'scan' ? 'Network Discovery' : 'Manual Configuration'}
               </h3>
               <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            {showModal === 'scan' && (
              <div className="p-6">
                 <div className="bg-black p-4 rounded border border-zinc-800 font-mono text-xs text-emerald-500 mb-6 h-32 overflow-y-auto">
                    {scanStatus === 'scanning' ? <p className="animate-pulse">{'>'} Probing subnet...</p> : <p>{'>'} Ready.</p>}
                    {scanStatus === 'complete' && <p>{'>'} Found {foundDevices.length} devices.</p>}
                 </div>
                 {foundDevices.map((dev, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-zinc-800 p-3 rounded mb-2">
                       <p className="text-white text-sm">{dev.name}</p>
                       <button onClick={() => {addCamera(dev); setFoundDevices(p => p.filter(d => d !== dev))}} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded">ADD</button>
                    </div>
                 ))}
                 {scanStatus === 'idle' && <button onClick={handleScan} className="w-full py-3 bg-zinc-800 text-white border border-zinc-600">Start Scan</button>}
              </div>
            )}
            {showModal === 'manual' && (
               <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
                  <input className="w-full bg-black border border-zinc-700 p-2 text-white text-sm" placeholder="Name" value={newCam.name} onChange={e => setNewCam({...newCam, name: e.target.value})} required />
                  <input className="w-full bg-black border border-zinc-700 p-2 text-white text-sm" placeholder="URL / ID" value={newCam.streamUrl} onChange={e => setNewCam({...newCam, streamUrl: e.target.value})} required />
                  <button type="submit" className="w-full py-3 bg-emerald-600 text-white font-bold">Register</button>
               </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
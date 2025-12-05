import React from 'react';
import { Camera, Trash2, Play, Square, Wifi } from 'lucide-react';
import { getStreamUrl } from '../services/api';

export default function CameraCard({ camera, onToggle, onDelete }) {
  // Timestamp forces a new request, Python "Session Lock" handles the collision
  const streamSrc = `${getStreamUrl(camera.streamUrl, camera.name)}&t=${Date.now()}`;

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg hover:shadow-2xl transition-all duration-300 group">
      <div className="h-56 bg-black relative flex items-center justify-center group-hover:bg-slate-900 transition-colors">
        {camera.status === 'Active' ? (
          <img 
            src={streamSrc}
            alt="Live Feed"
            className="w-full h-full object-cover"
            onError={(e) => {e.target.style.display='none'; e.target.nextSibling.style.display='flex'}} 
          />
        ) : (
          <div className="text-slate-600 flex flex-col items-center">
            <Camera size={48} className="mb-2 opacity-50" />
            <span className="font-mono text-sm">FEED OFFLINE</span>
          </div>
        )}
        
        {/* Fallback for Broken Stream */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-red-400 ${camera.status === 'Active' ? 'hidden' : 'flex'}`}>
             {camera.status === 'Active' && <Wifi size={32} className="mb-2" />}
             {camera.status === 'Active' && <span className="text-xs font-bold">SIGNAL LOST</span>}
        </div>

        {/* Live Indicator */}
        {camera.status === 'Active' && (
          <div className="absolute top-3 right-3 flex items-center gap-2 backdrop-blur-md bg-black/40 px-3 py-1 rounded-full border border-red-500/20">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
              <span className="text-[10px] font-bold text-red-500 tracking-wider">LIVE</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">{camera.name}</h3>
            <p className="text-slate-400 text-xs font-mono mt-1">{camera.location}</p>
          </div>
          <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${camera.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
            {camera.status}
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => onToggle(camera._id, camera.status)} 
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex justify-center items-center gap-2 transition-colors ${camera.status === 'Active' ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'}`}
          >
            {camera.status === 'Active' ? <><Square size={16}/> Terminate</> : <><Play size={16}/> Activate</>}
          </button>
          
          <button onClick={() => onDelete(camera._id)} className="p-2.5 rounded-lg bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
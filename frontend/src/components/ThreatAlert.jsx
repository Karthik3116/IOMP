import React from 'react';
import { ShieldAlert, X, MapPin, Target } from 'lucide-react';
import { IMAGE_BASE } from '../services/api';

export default function ThreatAlert({ alert, onClose }) {
  // If no alert data, don't render anything
  if (!alert) return null;

  return (
    // 🟢 Key Fix: High Z-Index and Animation classes
    <div className="fixed top-6 right-6 z-[9999] max-w-sm w-full animate-in slide-in-from-right duration-500 fade-in fill-mode-forwards">
      <div className="bg-red-950/95 backdrop-blur-xl border-2 border-red-500 text-white rounded-xl shadow-[0_0_60px_rgba(220,38,38,0.6)] overflow-hidden">
        
        {/* Header - Blinking to indicate active attention needed */}
        <div className="bg-red-600 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 font-black tracking-wider animate-pulse">
            <ShieldAlert fill="white" className="text-red-600" />
            THREAT DETECTED
          </div>
          <button onClick={onClose} className="hover:bg-red-800 rounded-full p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex gap-4">
            {/* Thumbnail */}
            <div className="w-24 h-24 bg-black rounded-lg overflow-hidden border border-red-500/50 flex-shrink-0 relative">
               {alert.image ? (
                 <img 
                   src={`${IMAGE_BASE}${alert.image}`} 
                   alt="Threat" 
                   className="w-full h-full object-cover"
                   onError={(e) => {e.target.style.display='none'}} // Fallback if image 404s
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-red-900/20">
                    <Target className="text-red-500 opacity-50"/>
                 </div>
               )}
            </div>

            {/* Details */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-red-300 text-[10px] font-bold uppercase tracking-wider">Source Camera</p>
                <div className="flex items-center gap-1 text-sm font-bold">
                  <MapPin size={14} className="text-red-500" />
                  {alert.cameraName || "Unknown Source"}
                </div>
              </div>

              <div>
                <p className="text-red-300 text-[10px] font-bold uppercase tracking-wider">Detected Object</p>
                <div className="flex items-center gap-2 text-xl font-black text-white">
                  {alert.detectedClass}
                  <span className="text-xs font-bold px-2 py-0.5 bg-red-500 text-white rounded">
                    {(alert.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
             <div className="text-[10px] text-red-300 font-mono text-center opacity-70">
               Time: {new Date(alert.timestamp).toLocaleTimeString()}
             </div>
             
             {/* Large Dismiss Button */}
             <button 
               onClick={onClose}
               className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-colors shadow-lg border border-red-400 uppercase tracking-widest text-sm"
             >
                Acknowledge & Dismiss
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
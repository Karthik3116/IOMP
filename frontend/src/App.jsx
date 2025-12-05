import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import ThreatAlert from './components/ThreatAlert';
import { socket } from './services/socket';

// Simple Alert Sound (Beep)
const alertSound = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); 

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentAlert, setCurrentAlert] = useState(null);

  useEffect(() => {
    // 🟢 GLOBAL SOCKET LISTENER
    socket.on('new_alert', (newReport) => {
      console.log("🚨 GLOBAL ALERT RECEIVED:", newReport);
      
      // 1. Force the state to update (even if it's a new object)
      setCurrentAlert(newReport);

      // 2. Play Sound safely (Prevent browser blocking errors from stopping the app)
      try {
        alertSound.currentTime = 0;
        const playPromise = alertSound.play();
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn("Audio autoplay blocked by browser:", error);
          });
        }
      } catch (e) {
        console.error("Audio play failed", e);
      }
    });

    return () => socket.off('new_alert');
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-950 text-white font-sans overflow-hidden relative">
      
      {/* 🔴 FIX: Added 'key' prop. 
          Using timestamp ensures React unmounts the old alert and 
          mounts the new one completely, re-triggering the 'slide-in' animation. 
      */}
      <ThreatAlert 
        key={currentAlert ? currentAlert.timestamp : 'no-alert'} 
        alert={currentAlert} 
        onClose={() => setCurrentAlert(null)} 
      />

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="flex-1 overflow-y-auto h-screen p-2">
        <div className="bg-slate-900/50 min-h-full rounded-2xl border border-slate-800 shadow-inner">
          {activeTab === 'dashboard' ? <Dashboard /> : <Reports />}
        </div>
      </div>
    </div>
  );
}

export default App;
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
      
      // 1. Play Sound immediately
      try {
        alertSound.currentTime = 0;
        const playPromise = alertSound.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => console.warn("Audio autoplay blocked:", error));
        }
      } catch (e) {
        console.error("Audio play failed", e);
      }

      // 2. 🟢 FORCE UI RESET
      // First, clear the current alert to trigger an 'unmount'
      setCurrentAlert(null);

      // Then, after a tiny delay, show the new one. 
      // This forces React to mount a fresh component and replay the slide-in animation.
      setTimeout(() => {
        setCurrentAlert(newReport);
      }, 100);
    });

    return () => socket.off('new_alert');
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-950 text-white font-sans overflow-hidden relative">
      
      {/* Using a unique key (timestamp or ID) ensures React treats 
          this as a distinct element instance 
      */}
      <ThreatAlert 
        key={currentAlert ? (currentAlert._id || currentAlert.timestamp) : 'no-alert'} 
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
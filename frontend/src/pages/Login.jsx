import React, { useState } from 'react';
import { ShieldAlert, Lock, Mail, ArrowRight } from 'lucide-react';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      onLogin(true); // Grant access
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-[128px]"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[128px]"></div>

      <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-8 rounded-2xl w-full max-w-md shadow-2xl z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-xl mb-4 shadow-lg shadow-emerald-500/20">
            <ShieldAlert size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">DroneGuard AI</h1>
          <p className="text-slate-400">Secure Autonomous Surveillance</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 focus:border-emerald-500 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-slate-600 outline-none transition-all"
                placeholder="admin@droneguard.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 focus:border-emerald-500 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-slate-600 outline-none transition-all"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <span className="animate-pulse">Authenticating...</span>
            ) : (
              <>
                Access Command Center <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm">
            Restricted Access. Unauthorized entry is logged.
          </p>
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { ShieldAlert, LayoutDashboard, FileText } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const btnClass = (tab) => 
    `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`;

  return (
    <div className="w-64 bg-slate-950 p-6 flex flex-col h-full border-r border-slate-800">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="bg-emerald-500/10 p-2 rounded-lg">
            <ShieldAlert size={28} className="text-emerald-400" />
        </div>
        <div>
            <h1 className="text-xl font-bold tracking-tight text-white">DroneGuard</h1>
            <p className="text-xs text-slate-500">Defense System v2.0</p>
        </div>
      </div>
      
      <nav className="space-y-2 flex-1">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 px-4">Menu</p>
        <button onClick={() => setActiveTab('dashboard')} className={btnClass('dashboard')}>
          <LayoutDashboard size={20} /> Command Center
        </button>
        <button onClick={() => setActiveTab('reports')} className={btnClass('reports')}>
          <FileText size={20} /> Incident Reports
          <span className="ml-auto flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        </button>
      </nav>

      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold">AD</div>
            <div>
                <p className="text-sm font-bold">Admin User</p>
                <p className="text-xs text-emerald-400">● System Online</p>
            </div>
        </div>
      </div>
    </div>
  );
}
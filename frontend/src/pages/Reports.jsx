import React, { useState, useMemo } from "react";
import { useReports } from "../hooks/useReports";
import {
  ShieldAlert, Eye, Clock, Download,
  TrendingUp, MapPin, Activity, AlertTriangle,
  Calendar, Filter, FileSpreadsheet, ChevronLeft, ChevronRight, Zap
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";
import { IMAGE_BASE } from "../services/api";

export default function Reports() {
  const { reports } = useReports();
  const [selectedImage, setSelectedImage] = useState(null);

  const [timeRange, setTimeRange] = useState("24h");
  const [selectedCam, setSelectedCam] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  // 🟢 ANALYTICS ENGINE
  const analytics = useMemo(() => {
    // Safe Defaults
    const defaultTimeData = new Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, count: 0 }));
    const defaultConfLevels = [
      { name: "Critical (>80%)", value: 0, color: "#ef4444" },
      { name: "High (60-80%)", value: 0, color: "#f97316" },
      { name: "Moderate (<60%)", value: 0, color: "#3b82f6" }
    ];
    
    const emptyStats = {
      filtered: [],
      total: 0,
      avgConfidence: "0.0",
      peakHour: 0,
      timeData: defaultTimeData,
      locationData: [],
      confLevels: defaultConfLevels,
      scatterData: []
    };

    if (!reports || reports.length === 0) return emptyStats;

    const now = Date.now();
    const ranges = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000
    };

    // 1. Filtering
    const filtered = reports.filter(r => {
      const timeMatch = (now - new Date(r.timestamp).getTime()) < ranges[timeRange];
      const camMatch = selectedCam === "All" || r.cameraName === selectedCam;
      return timeMatch && camMatch;
    });

    if (filtered.length === 0) return emptyStats;

    // 2. Metrics
    const total = filtered.length;
    const avgConfidence = ((filtered.reduce((acc, curr) => acc + curr.confidence, 0) / total) * 100).toFixed(1);

    const hourCounts = {};
    filtered.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    // Fix: Ensure peakHour is a string or number safely
    const peakHour = Object.keys(hourCounts).length > 0 
        ? Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b)
        : "0";

    // 3. Time Data
    const timeData = new Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, count: 0 }));
    filtered.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      if(timeData[h]) timeData[h].count += 1;
    });

    // 4. Location Data
    const camCounts = {};
    filtered.forEach(r => camCounts[r.cameraName] = (camCounts[r.cameraName] || 0) + 1);
    const locationData = Object.keys(camCounts)
        .map(k => ({ name: k, count: camCounts[k] }))
        .sort((a, b) => b.count - a.count);

    // 5. Confidence Levels
    const confLevels = [
      { name: "Critical (>80%)", value: 0, color: "#ef4444" },
      { name: "High (60-80%)", value: 0, color: "#f97316" },
      { name: "Moderate (<60%)", value: 0, color: "#3b82f6" }
    ];
    filtered.forEach(r => {
      if (r.confidence >= 0.8) confLevels[0].value++;
      else if (r.confidence >= 0.6) confLevels[1].value++;
      else confLevels[2].value++;
    });

    // 6. Scatter Data
    const scatterData = filtered.map(r => ({
      x: new Date(r.timestamp).getHours() + (new Date(r.timestamp).getMinutes() / 60),
      y: Math.round(r.confidence * 100),
      z: 1
    }));

    return { filtered, total, avgConfidence, peakHour, timeData, locationData, confLevels, scatterData };
  }, [reports, timeRange, selectedCam]);

  const downloadCSV = () => {
    if (!analytics || !analytics.filtered || analytics.filtered.length === 0) return;
    const headers = ["Timestamp,Camera,Class,Confidence,ImageID\n"];
    const rows = analytics.filtered.map(r => `${new Date(r.timestamp).toISOString()},${r.cameraName},${r.detectedClass},${r.confidence},${r.image}`);
    const blob = new Blob([...headers, ...rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `droneguard_report_${Date.now()}.csv`;
    a.click();
  };

  const totalPages = Math.ceil((analytics?.filtered.length || 0) / itemsPerPage);
  const currentTableData = analytics?.filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const uniqueCameras = useMemo(() => {
    if(!reports) return [];
    return [...new Set(reports.map(r => r.cameraName))];
  }, [reports]);

  return (
    <div className="p-6 space-y-6 pb-20 font-sans">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1 flex items-center gap-2">
            <Zap className="text-amber-400" fill="currentColor" /> Intelligence Hub
          </h2>
          <p className="text-slate-400 text-sm">Advanced threat heuristics and data mining.</p>
        </div>

        <div className="flex flex-wrap gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700">
          <div className="relative">
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="bg-slate-900 text-white text-sm pl-8 pr-4 py-2 rounded border border-slate-700 focus:border-indigo-500 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition">
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <Clock size={14} className="absolute left-2.5 top-3 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={selectedCam} onChange={(e) => setSelectedCam(e.target.value)} className="bg-slate-900 text-white text-sm pl-8 pr-8 py-2 rounded border border-slate-700 focus:border-indigo-500 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition">
              <option value="All">All Cameras</option>
              {uniqueCameras.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Filter size={14} className="absolute left-2.5 top-3 text-slate-400 pointer-events-none" />
          </div>

          <button onClick={downloadCSV} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors">
            <FileSpreadsheet size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Filtered Incidents</p>
            <h3 className="text-3xl font-black text-white mt-1">{analytics.total}</h3>
            <div className="w-full bg-slate-700 h-1 mt-3 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full" style={{ width: "100%" }}></div>
            </div>
          </div>

          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Avg. Confidence</p>
            <h3 className="text-3xl font-black text-white mt-1">{analytics.avgConfidence}%</h3>
            <p className="text-xs text-slate-500 mt-2">Model Certainty Score</p>
          </div>

          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Peak Threat Hour</p>
            <h3 className="text-3xl font-black text-white mt-1">{analytics.peakHour}:00</h3>
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><TrendingUp size={12} /> High Traffic Time</p>
          </div>

          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Primary Target</p>
            <h3 className="text-xl font-black text-white mt-2 truncate">{analytics.locationData?.[0]?.name || "None"}</h3>
            <p className="text-xs text-slate-500 mt-1">Most Active Sensor</p>
          </div>
        </div>
      )}

      {/* CHARTS SECTION */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 1. TIMELINE - FIXED WIDTH/HEIGHT */}
          <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-80 flex flex-col">
            <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider"><Calendar size={16} className="text-indigo-400" /> Temporal Frequency</h4>
            <div className="w-full h-60"> {/* 🟢 FIXED HEIGHT */}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.timeData}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval={3} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#fff" }} itemStyle={{ color: "#818cf8" }} />
                  <Area type="monotone" dataKey="count" stroke="#818cf8" strokeWidth={3} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. CONFIDENCE PIE - FIXED WIDTH/HEIGHT */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-80 flex flex-col">
            <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider"><Activity size={16} className="text-emerald-400" /> AI Confidence Levels</h4>
            <div className="w-full h-60"> {/* 🟢 FIXED HEIGHT */}
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.confLevels} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {analytics.confLevels.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. SCATTER PLOT - FIXED WIDTH/HEIGHT */}
          <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-80 flex flex-col">
            <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider"><Filter size={16} className="text-pink-400" /> Anomaly Detection (Time vs Confidence)</h4>
            <div className="w-full h-60"> {/* 🟢 FIXED HEIGHT */}
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" dataKey="x" name="Hour" unit="h" stroke="#64748b" domain={[0, 24]} fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="number" dataKey="y" name="Confidence" unit="%" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <ZAxis type="number" dataKey="z" range={[60, 200]} />
                  <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#fff" }} />
                  <Scatter name="Threats" data={analytics.scatterData} fill="#f472b6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. LOCATION BARS - FIXED WIDTH/HEIGHT */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-80 flex flex-col">
            <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider"><MapPin size={16} className="text-red-400" /> Threat Sources</h4>
            <div className="w-full h-60"> {/* 🟢 FIXED HEIGHT */}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={analytics.locationData.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: "#334155", opacity: 0.4 }} contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#fff" }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {analytics.locationData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === 0 ? "#ef4444" : "#3b82f6"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED TABLE */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h4 className="text-white font-bold flex items-center gap-2"><ShieldAlert size={18} className="text-slate-400" /> Detailed Log</h4>
          <span className="text-xs text-slate-500">Showing {currentTableData?.length || 0} of {analytics?.total || 0} Events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Source</th>
                <th className="p-4">Threat Class</th>
                <th className="p-4">Confidence</th>
                <th className="p-4 text-right">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {currentTableData && currentTableData.map((report, idx) => (
                <tr key={idx} className="hover:bg-slate-700/30 transition-colors text-slate-300">
                  <td className="p-4 font-mono text-sm flex items-center gap-2 text-slate-400">
                    {new Date(report.timestamp).toLocaleTimeString()}
                    <span className="text-xs opacity-50">{new Date(report.timestamp).toLocaleDateString()}</span>
                  </td>
                  <td className="p-4 font-bold text-white">{report.cameraName}</td>
                  <td className="p-4">
                    <span className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-xs font-bold border border-red-500/20 flex w-fit items-center gap-2">
                      <AlertTriangle size={12} /> {report.detectedClass}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${report.confidence > 0.8 ? "bg-red-500" : report.confidence > 0.5 ? "bg-orange-500" : "bg-blue-500"}`} style={{ width: `${report.confidence * 100}%` }}></div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400">{(report.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    {report.image && (
                      <button onClick={() => setSelectedImage(report.image)} className="text-indigo-400 hover:text-white bg-slate-900/50 hover:bg-indigo-600 p-2 rounded-lg transition-all border border-slate-700 hover:border-indigo-500 group">
                        <Eye size={16} className="group-hover:scale-110 transition-transform" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-700 flex justify-end items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400"><ChevronLeft size={20} /></button>
            <span className="text-sm text-slate-400 font-mono">Page {currentPage} of {totalPages}</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400"><ChevronRight size={20} /></button>
          </div>
        )}
      </div>

      {/* IMAGE MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-8" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <img src={`${IMAGE_BASE}${selectedImage}`} alt="Threat" className="w-full rounded-lg shadow-2xl border border-slate-700" />
            <div className="absolute top-4 right-4 flex gap-2">
              <a href={`${IMAGE_BASE}${selectedImage}`} download className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-700 border border-slate-600 transition-colors">
                <Download size={20} />
              </a>
              <button onClick={() => setSelectedImage(null)} className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-500 shadow-lg shadow-red-900/50 transition-colors">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
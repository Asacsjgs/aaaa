import React from 'react';
import { StreamItem } from '../types/stream';
import { Radio, Play, Pause, Eye, Activity, Download, Plus, Zap } from 'lucide-react';

interface StreamStatsOverviewProps {
  streams: StreamItem[];
  onOpenCreate: () => void;
  onExportPlaylist: () => void;
}

export const StreamStatsOverview: React.FC<StreamStatsOverviewProps> = ({
  streams,
  onOpenCreate,
  onExportPlaylist
}) => {
  const totalStreams = streams.length;
  const activeStreams = streams.filter(s => s.status === 'active').length;
  const pausedStreams = streams.filter(s => s.status === 'paused').length;
  const totalViewers = streams
    .filter(s => s.status === 'active')
    .reduce((acc, s) => acc + (s.currentViewers || 0), 0);
  const totalViews = streams.reduce((acc, s) => acc + (s.viewsCount || 0), 0);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl mb-8">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        
        {/* Left Welcome Kicker */}
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
            <Zap className="w-4 h-4 fill-current text-cyan-400" />
            <span>منصة التحكم ببروتوكولات البث المباشر الحقوقي</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            مولد وإدارة روابط البث الحقوقية
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            ضع أي رابط بث مباشر أصلي لتحويله إلى رابط حقوقي خاص بك. يمكنك إيقاف البث (Pause) وإعادة تشغيله (Play) في أي وقت دون تغيير الرابط للمشاهدين.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onExportPlaylist}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all shadow-sm"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>تصدير ملف M3U</span>
          </button>

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>توليد رابط جديد</span>
          </button>
        </div>

      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
        
        {/* Metric 1: Total */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>إجمالي الروابط</span>
            <Radio className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-black text-white font-mono tabular-nums">
            {totalStreams}
          </div>
        </div>

        {/* Metric 2: Active */}
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-900/40">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span>البث الشغّال</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono tabular-nums">
            {activeStreams}
          </div>
        </div>

        {/* Metric 3: Paused */}
        <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-900/40">
          <div className="flex items-center justify-between text-xs text-rose-400 mb-1">
            <span>البث المتوقف</span>
            <Pause className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-300 font-mono tabular-nums">
            {pausedStreams}
          </div>
        </div>

        {/* Metric 4: Current Viewers */}
        <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-900/40">
          <div className="flex items-center justify-between text-xs text-indigo-400 mb-1">
            <span>المشاهدون المباشرون</span>
            <Eye className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-300 font-mono tabular-nums">
            {totalViewers.toLocaleString()}
          </div>
        </div>

      </div>

    </div>
  );
};

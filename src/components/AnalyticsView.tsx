import React from 'react';
import { StreamItem } from '../types/stream';
import { Activity, ShieldCheck, Clock, Server, Eye, Zap, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface AnalyticsViewProps {
  streams: StreamItem[];
  onToggleStatus: (id: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ streams, onToggleStatus }) => {
  const activeStreams = streams.filter(s => s.status === 'active');
  const pausedStreams = streams.filter(s => s.status === 'paused');

  return (
    <div className="space-y-8">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">إحصائيات الخادم وحماية روابط البث</h2>
            <p className="text-xs text-slate-400">مراقبة استجابة البث الحية، وسجل عمليات الإيقاف والتشغيل والتضمين.</p>
          </div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Server Telemetry */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>حالة خادم التمرير (Proxy Stream)</span>
            </h3>
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 rounded-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              مستقر 99.9%
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">زمن الاستجابة (Latency):</span>
              <span className="text-cyan-300 font-bold">~24ms</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">نطاق التمرير (Bandwidth):</span>
              <span className="text-indigo-300 font-bold">1.4 GB / hour</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">بروتوكول التشغيل:</span>
              <span className="text-emerald-300 font-bold">HLS v3/v6 (m3u8)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Protection & Watermark Rules */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>الحماية والشعار المائي (Watermark)</span>
            </h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            يتم طباعة الشعار المائي الخاص بك ديناميكياً فوق مشغل الفيديو، وتلقائياً على جميع روابط التضمين لحماية حقوق قناتك ومنع سرقة الفيديو.
          </p>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">منع التضمين غير المصرح:</span>
              <span className="text-emerald-400 font-bold">مُفعل</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">تجاوز قيود CORS للمصدر:</span>
              <span className="text-emerald-400 font-bold">مُفعل تلقائياً</span>
            </div>
          </div>
        </div>

        {/* Card 3: Quick Status Control Center */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>التحكم السريع بجميع الروابط</span>
          </h3>

          <p className="text-xs text-slate-400">
            يمكنك إيقاف أو تشغيل روابطك المباشرة بكبسة زر واحدة من القائمة أدناه:
          </p>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {streams.map(stream => (
              <div key={stream.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="truncate text-slate-200 font-semibold max-w-[150px]">{stream.title}</span>
                <button
                  onClick={() => onToggleStatus(stream.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    stream.status === 'active'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                  }`}
                >
                  {stream.status === 'active' ? 'إيقاف الآن' : 'تشغيل الآن'}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Activity Logs */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>سجل نشاط روابط البث الحقوقية (Live Control Logs)</span>
        </h3>

        <div className="space-y-2 text-xs font-mono">
          {streams.map((s, idx) => (
            <div key={s.id + idx} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800/60">
              <div className="flex items-center gap-2">
                {s.status === 'active' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="text-white font-sans font-semibold">{s.title}</span>
                <span className="text-slate-500">({s.slug})</span>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                  {s.status === 'active' ? 'الحالة: شغّال' : 'الحالة: متوقف'}
                </span>
                <span className="text-slate-500 text-[11px]">{new Date(s.updatedAt).toLocaleTimeString('ar-EG')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

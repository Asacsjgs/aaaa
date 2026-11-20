import React, { useState } from 'react';
import { Layers, Play, Pause, Trash2, Download, CheckCircle2, AlertCircle, RefreshCw, ClipboardList, PlusCircle, FileDown, X, Link, Copy } from 'lucide-react';
import { StreamItem } from '../types/stream';
import { getStreamPlayUrl } from '../utils/urlHelper';

interface BulkGeneratorProps {
  onProcess: (lines: string[]) => Promise<void>;
  onBulkStatus: (ids: string[], status: 'active' | 'paused') => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  streams: StreamItem[];
  serverBaseUrl: string;
  lastBatch: StreamItem[];
  showSuccess: boolean;
  onCloseSuccess: () => void;
}

export const BulkGenerator: React.FC<BulkGeneratorProps> = ({
  onProcess,
  onBulkStatus,
  onBulkDelete,
  streams,
  serverBaseUrl,
  lastBatch,
  showSuccess,
  onCloseSuccess
}) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleProcess = async () => {
    const lines = inputText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    setIsProcessing(true);
    setPlaylistUrl(null);
    try {
      await onProcess(lines);
      setInputText('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateM3uLink = async () => {
    if (lastBatch.length === 0) return;
    setIsGeneratingLink(true);
    try {
      const res = await fetch('/api/playlists/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamIds: lastBatch.map(s => s.id) })
      });
      const data = await res.json();
      if (data.success && data.playlistUrl) {
        setPlaylistUrl(data.playlistUrl);
      }
    } catch (err) {
      console.error('Failed to generate M3U link:', err);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (!playlistUrl) return;
    navigator.clipboard.writeText(playlistUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === streams.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(streams.map(s => s.id));
    }
  };

  const handleDownloadM3U = (batch?: StreamItem[]) => {
    const streamsToExport = batch || (selectedIds.length > 0 
      ? streams.filter(s => selectedIds.includes(s.id))
      : streams);

    if (streamsToExport.length === 0) return;

    let m3u = '#EXTM3U\n';
    streamsToExport.forEach(s => {
      const playUrl = getStreamPlayUrl(s, serverBaseUrl);
      
      m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ''}",${s.title}\n`;
      m3u += `${playUrl}\n`;
    });

    const blob = new Blob([m3u], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playlist_${new Date().getTime()}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 dir-rtl font-cairo">
      
      {/* Success Message Overlay / Section */}
      {showSuccess && lastBatch.length > 0 && (
        <div className="bg-emerald-600 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden animate-in zoom-in duration-300">
          <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/10 pointer-events-none" />
          <button 
            onClick={onCloseSuccess}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center text-center space-y-4 relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center border border-white/30 mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black">تم تجهيز ملفك وحسابك بنجاح!</h3>
              <p className="text-xs sm:text-sm text-white/80 mt-1">
                تم توليد {lastBatch.length} رابط محمي وجاهز للاستخدام الخارجي.
              </p>
            </div>

            <div className="w-full max-w-md space-y-3">
               {/* URL Display Area */}
               {playlistUrl ? (
                 <div className="bg-emerald-900/40 border border-white/20 rounded-2xl p-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-emerald-300">
                       <span className="flex items-center gap-1.5"><Link className="w-3 h-3" /> رابط ملف M3U المباشر</span>
                       <span>نشط الآن</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="flex-1 bg-black/30 rounded-xl px-3 py-2 text-[10px] font-mono dir-ltr text-left truncate border border-white/10">
                          {playlistUrl}
                       </div>
                       <button
                         onClick={handleCopyLink}
                         className={`p-2 rounded-xl transition shrink-0 ${copied ? 'bg-white text-emerald-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
                       >
                          {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                       </button>
                    </div>
                 </div>
               ) : (
                 <button
                   onClick={handleGenerateM3uLink}
                   disabled={isGeneratingLink}
                   className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm rounded-2xl shadow-xl transition flex items-center justify-center gap-2 border border-white/20"
                 >
                   {isGeneratingLink ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Link className="w-5 h-5" />}
                   <span>{isGeneratingLink ? 'جاري إنشاء الرابط...' : 'إنشاء رابط M3U للاستخدام الخارجي'}</span>
                 </button>
               )}

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleDownloadM3U(lastBatch)}
                    className="px-6 py-3.5 bg-white text-emerald-600 font-black text-xs rounded-2xl shadow-xl transition hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <FileDown className="w-5 h-5" />
                    <span>تحميل الملف للجهاز</span>
                  </button>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => onBulkStatus(lastBatch.map(s => s.id), 'paused')}
                      className="flex-1 px-4 py-3.5 bg-rose-700/50 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl border border-white/20 transition flex items-center justify-center gap-2"
                    >
                      <Pause className="w-4 h-4 fill-current" />
                      <span>إيقاف الكل</span>
                    </button>
                    <button
                      onClick={() => onBulkStatus(lastBatch.map(s => s.id), 'active')}
                      className="flex-1 px-4 py-3.5 bg-emerald-700/50 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl border border-white/20 transition flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>تشغيل الكل</span>
                    </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="bg-white dark:bg-[#0d121f] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              قسم التوليد الجماعي والروابط
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              حوّل أي قائمة روابط إلى ملف M3U أو رابط مباشر يعمل على كافة مشغلات الـ IPTV.
            </p>
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-4 pt-4">
          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="ألصق الروابط هنا (رابط واحد في كل سطر)...&#10;مثال للأكستريم: host|user|pass&#10;مثال للروابط: https://server.com/live.m3u8"
              className="w-full h-48 px-5 py-4 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-indigo-500 transition-all font-mono dir-ltr text-left"
            />
            <div className="absolute bottom-4 right-4 text-[10px] text-slate-400 font-bold bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-lg">
              {inputText.split('\n').filter(l => l.trim()).length} رابط مكتشف
            </div>
          </div>

          <button
            onClick={handleProcess}
            disabled={isProcessing || !inputText.trim()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/20 transition flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <PlusCircle className="w-5 h-5" />
            )}
            <span>{isProcessing ? 'جاري تجهيز الروابط...' : 'توليد الروابط الآن'}</span>
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {streams.length > 0 && (
        <div className="bg-white dark:bg-[#0d121f] p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black transition hover:bg-slate-200"
            >
              {selectedIds.length === streams.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
            <span className="text-[11px] font-bold text-slate-500">
              تم تحديد {selectedIds.length} من {streams.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onBulkStatus(selectedIds.length > 0 ? selectedIds : streams.map(s => s.id), 'active')}
              className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white transition shadow-sm"
              title="تشغيل المحددة"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => onBulkStatus(selectedIds.length > 0 ? selectedIds : streams.map(s => s.id), 'paused')}
              className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-600 hover:text-white transition shadow-sm"
              title="إيقاف المحددة"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => onBulkDelete(selectedIds.length > 0 ? selectedIds : streams.map(s => s.id))}
              className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-600 hover:text-white transition shadow-sm"
              title="حذف المحددة"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
            <button
              onClick={() => handleDownloadM3U()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-[11px] flex items-center gap-2 shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition"
            >
              <FileDown className="w-4 h-4" />
              <span>تحميل المختار M3U</span>
            </button>
          </div>
        </div>
      )}

      {/* Results List (Condensed) */}
      <div className="space-y-3">
        {streams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {streams.map(stream => {
              const isSelected = selectedIds.includes(stream.id);
              return (
                <div
                  key={stream.id}
                  onClick={() => toggleSelect(stream.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-md ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d121f] hover:border-indigo-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                      stream.status === 'active' 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                    }`}>
                      {stream.status === 'active' ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[10px] font-black text-slate-900 dark:text-white truncate">
                        {stream.title}
                      </h4>
                      <p className="text-[9px] text-slate-400 truncate font-mono dir-ltr text-right">
                        {stream.slug || stream.id}
                      </p>
                    </div>
                  </div>
                  
                  {/* Status Indicator Bar */}
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                    stream.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                </div>
              );
            })}
          </div>
        ) : !showSuccess && (
          <div className="text-center py-12 bg-white dark:bg-[#0d121f] rounded-[40px] border border-slate-200 dark:border-slate-800 p-8 space-y-4">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">قائمة الروابط فارغة</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              ابدأ بإضافة روابطك في الحقل أعلاه لتوليدها دفعة واحدة وتجهيز الملف.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

import React, { useState } from 'react';
import { StreamItem } from '../types/stream';
import { getCleanBaseUrl, getStreamPlayUrl } from '../utils/urlHelper';
import { X, Download, Copy, Check, Radio, Code } from 'lucide-react';

interface PlaylistExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  streams: StreamItem[];
  serverBaseUrl?: string;
}

export const PlaylistExportModal: React.FC<PlaylistExportModalProps> = ({
  isOpen,
  onClose,
  streams,
  serverBaseUrl
}) => {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  if (!isOpen) return null;

  const cleanBase = getCleanBaseUrl(serverBaseUrl);
  const playlistUrl = `${cleanBase}/api/playlist.m3u`;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDownloadM3U = () => {
    window.open(playlistUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                تصدير وتضمين قوائم البث الحقوقية (M3U / IPTV / Embed)
              </h3>
              <p className="text-xs text-slate-400">
                استخرج رابط القائمة الموحد لشاشات Smart TV، أجهزة الريسيفر، أو أكواد التضمين للمواقع.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Section 1: Full M3U Playlist Link */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-slate-950 border border-indigo-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                <h4 className="text-sm font-bold text-white">رابط قائمة M3U الموحدة لجميع البثوث النشطة</h4>
              </div>
              <button
                onClick={handleDownloadM3U}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل ملف .m3u</span>
              </button>
            </div>

            <p className="text-xs text-slate-300">
              يمكنك إضافة هذا الرابط المباشر العام في تطبيق IPTV (مثل IPTV Smarters, OttPlayer, VLC, Tivimate) لتظهر جميع قنواتك الحقوقية مباشرة.
            </p>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
              <span className="truncate flex-1 select-all text-indigo-300 dir-ltr text-left">{playlistUrl}</span>
              <button
                onClick={() => handleCopy(playlistUrl, 'playlist')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-sans text-xs font-semibold shrink-0"
              >
                {copiedIndex === 'playlist' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === 'playlist' ? 'تم النسخ' : 'نسخ الرابط'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Individual Streams List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              روابط البث الحقوقية الفردية ({streams.length})
            </h4>

            <div className="space-y-3">
              {streams.map((stream) => {
                const streamUrl = getStreamPlayUrl(stream, cleanBase);
                const embedCode = `<iframe src="${cleanBase}/?player=${stream.slug}" width="100%" height="480" frameborder="0" allowfullscreen></iframe>`;

                return (
                  <div key={stream.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${stream.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                        <h5 className="text-sm font-bold text-white">{stream.title}</h5>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">/{stream.slug}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {/* Direct M3U8 */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-slate-300">
                        <span className="truncate text-indigo-300 dir-ltr text-left">{streamUrl}</span>
                        <button
                          onClick={() => handleCopy(streamUrl, `m3u8_${stream.id}`)}
                          className="p-1 rounded text-slate-400 hover:text-white shrink-0"
                          title="نسخ M3U8"
                        >
                          {copiedIndex === `m3u8_${stream.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* iFrame Code */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-slate-300">
                        <span className="truncate text-cyan-300 dir-ltr text-left">&lt;iframe src="..."&gt;</span>
                        <button
                          onClick={() => handleCopy(embedCode, `embed_${stream.id}`)}
                          className="p-1 rounded text-slate-400 hover:text-white shrink-0"
                          title="نسخ كود التضمين"
                        >
                          {copiedIndex === `embed_${stream.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Code className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

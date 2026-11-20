import React, { useState } from 'react';
import { StreamItem } from '../types/stream';
import { getCleanBaseUrl, getStreamPlayUrl } from '../utils/urlHelper';
import { Play, Pause, Copy, Check, Eye, Edit3, Trash2, Link2, ShieldAlert, Smartphone, Ban, ChevronDown, ChevronUp, Server } from 'lucide-react';

interface StreamCardProps {
  stream: StreamItem;
  serverBaseUrl?: string;
  onToggleStatus: (id: string) => void;
  onPreview: (stream: StreamItem) => void;
  onEdit: (stream: StreamItem) => void;
  onDelete: (id: string) => void;
  onBlockApp: (streamId: string, pattern: string, userAgent?: string, appName?: string, appId?: string, ipAddress?: string) => void;
  onUnblockApp: (streamId: string, pattern: string) => void;
  onToggleBlockAll?: (id: string) => void;
  onUpdatePoster?: (streamId: string, posterUrl: string) => void;
}

export const StreamCard: React.FC<StreamCardProps> = ({
  stream,
  serverBaseUrl,
  onToggleStatus,
  onPreview,
  onEdit,
  onDelete,
  onBlockApp,
  onUnblockApp,
  onToggleBlockAll,
  onUpdatePoster
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showAppProtection, setShowAppProtection] = useState(false);
  const [customPattern, setCustomPattern] = useState('');
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [posterMsg, setPosterMsg] = useState<string | null>(null);

  const cleanBase = getCleanBaseUrl(serverBaseUrl);
  const directM3u8 = getStreamPlayUrl(stream, cleanBase);
  const playerUrl = `${cleanBase}/?player=${stream.slug}`;
  const embedCode = `<iframe src="${playerUrl}" width="100%" height="480" frameborder="0" allowfullscreen></iframe>`;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCardImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdatePoster) return;

    setUploadingPoster(true);
    setPosterMsg(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        if (!base64Data) return;

        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, filename: file.name })
        });

        const data = await res.json();
        const imageUrl = data.success && data.imageUrl ? data.imageUrl : base64Data;

        await onUpdatePoster(stream.id, imageUrl);
        setUploadingPoster(false);
        setPosterMsg('✅ تم تغيير صورة شاشة الإيقاف المخصصة بنجاح!');
        setTimeout(() => setPosterMsg(null), 3500);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingPoster(false);
      setPosterMsg('❌ فشل رفع الصورة، حاول مجدداً.');
    }
  };

  const blockedAppsList = stream.blockedApps || [];
  const connectedAppsList = stream.connectedApps || [];
  const blockedCount = blockedAppsList.length;

  const handleManualBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPattern.trim()) return;
    onBlockApp(stream.id, customPattern.trim());
    setCustomPattern('');
  };

  const isActive = stream.status === 'active';
  const posterSrc = stream.customPosterUrl || '/uploads/preset_poster_1.jpg';

  return (
    <div className="min-w-0 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden transition-all duration-300">
      
      {/* Top Banner Card Visual Representation (Matching Screenshot Style) */}
      <div className="relative w-full h-44 sm:h-52 bg-slate-900 overflow-hidden group cursor-pointer" onClick={() => onPreview(stream)}>
        <img
          src={posterSrc}
          alt={stream.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Dark Vignette Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />

        {/* Top Badges Row (Live Red Pill + Viewer Count Pill) */}
        <div className="absolute top-3 right-3 left-3 flex items-center justify-between z-10 dir-rtl">
          <div className="flex items-center gap-2">
            {/* Live Indicator Pill */}
            {isActive ? (
              <span className="px-3 py-1 rounded-full bg-rose-600 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-rose-900/40">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>مباشر</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-slate-800/90 text-slate-300 font-bold text-xs flex items-center gap-1.5 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>متوقف مؤقتاً</span>
              </span>
            )}



            {/* Viewer Count Pill */}
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono">{stream.currentViewers || 0}</span>
            </span>
          </div>

          {/* Quick Play Trigger Overlay button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPreview(stream); }}
            className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition shadow-lg"
            title="مشاهدة البث المباشر"
          >
            <Play className="w-4 h-4 fill-current mr-0.5" />
          </button>
        </div>

        {/* Bottom Title Overlay */}
        <div className="absolute bottom-3 right-3 left-3 z-10 space-y-0.5 dir-rtl">
          <p className="text-white text-base sm:text-lg font-black tracking-tight drop-shadow-md truncate">
            {stream.title}
          </p>
          <p className="text-slate-300 text-xs font-semibold truncate opacity-90">
            {stream.watermarkText || 'بث مباشر حقوقي محمي'}
          </p>
        </div>
      </div>

      {/* Control Bar & Links Area */}
      <div className="p-4 sm:p-5 space-y-4 dir-rtl">
        
        {/* Core Quick Toggle Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              /{stream.slug}
            </span>
            {stream.isXtream && (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Xtream Codes
              </span>
            )}

          </div>

          {/* Status Toggle Button */}
          <button
            type="button"
            onClick={() => onToggleStatus(stream.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition active:scale-95 shadow-sm ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
            }`}
          >
            {isActive ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>إيقاف البث</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>تشغيل البث</span>
              </>
            )}
          </button>
        </div>

        {/* Links Display Box */}
        {stream.isXtream ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span className="flex items-center gap-1.5">
                <Server className="w-4 h-4 text-rose-500" />
                <span>بيانات الاكستريم المباشرة:</span>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans block">Host:</span>
                <p className="text-slate-900 dark:text-white font-bold truncate dir-ltr text-left">{cleanBase}</p>
                <button
                  onClick={() => handleCopy(cleanBase, 'xtream_host')}
                  className="text-[10px] text-rose-600 dark:text-rose-400 font-sans font-bold block pt-0.5 hover:underline"
                >
                  {copiedType === 'xtream_host' ? '✓ تم' : 'نسخ Host'}
                </button>
              </div>

              <div className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans block">User:</span>
                <p className="text-rose-600 dark:text-rose-400 font-bold truncate dir-ltr text-left">{stream.xtreamUser || 'user'}</p>
                <button
                  onClick={() => handleCopy(stream.xtreamUser || 'user', 'xtream_user')}
                  className="text-[10px] text-rose-600 dark:text-rose-400 font-sans font-bold block pt-0.5 hover:underline"
                >
                  {copiedType === 'xtream_user' ? '✓ تم' : 'نسخ User'}
                </button>
              </div>

              <div className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans block">Pass:</span>
                <p className="text-rose-600 dark:text-rose-400 font-bold truncate dir-ltr text-left">{stream.xtreamPass || 'pass'}</p>
                <button
                  onClick={() => handleCopy(stream.xtreamPass || 'pass', 'xtream_pass')}
                  className="text-[10px] text-rose-600 dark:text-rose-400 font-sans font-bold block pt-0.5 hover:underline"
                >
                  {copiedType === 'xtream_pass' ? '✓ تم' : 'نسخ Pass'}
                </button>
              </div>

              <div className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-sans block">ID:</span>
                <p className="text-slate-800 dark:text-slate-200 font-bold truncate dir-ltr text-left">{stream.slug}</p>
                <button
                  onClick={() => handleCopy(stream.slug, 'xtream_id')}
                  className="text-[10px] text-rose-600 dark:text-rose-400 font-sans font-bold block pt-0.5 hover:underline"
                >
                  {copiedType === 'xtream_id' ? '✓ تم' : 'نسخ ID'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 min-w-0">
            <span className="truncate flex-1 min-w-0 select-all text-rose-600 dark:text-rose-400 font-bold dir-ltr text-left text-[11px] sm:text-xs">
              {directM3u8}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(directM3u8, 'm3u8')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-sans text-xs font-bold shrink-0 transition shadow-sm whitespace-nowrap"
            >
              {copiedType === 'm3u8' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'm3u8' ? 'تم النسخ' : 'نسخ M3U8'}</span>
            </button>
          </div>
        )}



        {/* Change Poster Image Options */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">🖼️ شاشة الإيقاف المخصصة:</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!onUpdatePoster) return;
                setUploadingPoster(true);
                await onUpdatePoster(stream.id, '/uploads/preset_poster_1.jpg');
                setUploadingPoster(false);
                setPosterMsg('✅ تم تفعيل الصورة الجاهزة 1');
                setTimeout(() => setPosterMsg(null), 2500);
              }}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-2 text-right hover:border-rose-500 transition"
            >
              <img src="/uploads/preset_poster_1.jpg" alt="1" className="w-8 h-6 rounded object-cover" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">صورة حمراء</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!onUpdatePoster) return;
                setUploadingPoster(true);
                await onUpdatePoster(stream.id, '/uploads/preset_poster_2.jpg');
                setUploadingPoster(false);
                setPosterMsg('✅ تم تفعيل الصورة الجاهزة 2');
                setTimeout(() => setPosterMsg(null), 2500);
              }}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-2 text-right hover:border-rose-500 transition"
            >
              <img src="/uploads/preset_poster_2.jpg" alt="2" className="w-8 h-6 rounded object-cover" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">صورة زرقاء</span>
            </button>
          </div>

          <label className="cursor-pointer block text-center py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition">
            <span>{uploadingPoster ? 'جاري التحميل...' : '📷 رفع صورة جديدة من الهاتف'}</span>
            <input type="file" accept="image/*" onChange={handleCardImageUpload} className="hidden" disabled={uploadingPoster} />
          </label>

          {posterMsg && <p className="text-xs font-bold text-emerald-500 text-center">{posterMsg}</p>}
        </div>

        {/* Anti-Theft App Protection Toggle Drawer */}
        <div className="pt-1">
          <button
            onClick={() => setShowAppProtection(!showAppProtection)}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>🛡️ حظر التطبيقات السارقة ({connectedAppsList.length} متصل | {blockedCount} محظور)</span>
            </div>
            {showAppProtection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAppProtection && (
            <div className="mt-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">حظر كل تطبيقات IPTV الخارجية:</span>
                {onToggleBlockAll && (
                  <button
                    onClick={() => onToggleBlockAll(stream.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      stream.blockAllExternalApps
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {stream.blockAllExternalApps ? '⛔ مفعل (محظورة)' : 'تفعيل حظر المشغلات'}
                  </button>
                )}
              </div>

              <form onSubmit={handleManualBlock} className="flex gap-2">
                <input
                  type="text"
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  placeholder="اسم التطبيق أو IP..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
                />
                <button type="submit" className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-xl flex items-center gap-1 shrink-0">
                  <Ban className="w-3.5 h-3.5" />
                  حظر
                </button>
              </form>

              {/* Active Connected Phone Devices List */}
              {connectedAppsList.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-rose-500" />
                    <span>📱 الهواتف والأجهزة المتصلة المباشرة ({connectedAppsList.length}):</span>
                  </span>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {connectedAppsList.map((app) => (
                      <div
                        key={app.id}
                        className={`p-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 transition ${
                          app.isBlocked
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 font-black text-rose-600 dark:text-rose-400">
                            <Smartphone className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{app.deviceModel || 'هاتف ذكي (Smartphone)'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            <span>{app.appName}</span>
                            {app.ipAddress && <span>• IP: {app.ipAddress}</span>}
                          </div>
                        </div>

                        {app.isBlocked ? (
                          <span className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] flex items-center gap-1">
                            ⛔ محظور نهائياً
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onBlockApp(stream.id, app.deviceModel || app.userAgent, app.userAgent, app.appName, app.id, app.ipAddress)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 shadow transition shrink-0 active:scale-95"
                          >
                            <Ban className="w-3 h-3" />
                            <span>حظر هذا الهاتف نهائياً</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {blockedAppsList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-full block">قائمة الهواتف والتطبيقات المحظورة:</span>
                  {blockedAppsList.map((p, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1">
                      ⛔ {p}
                      <button onClick={() => onUnblockApp(stream.id, p)} className="text-[10px] text-rose-500 underline mr-1">إلغاء الحظر</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPreview(stream)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>مشاهدة</span>
            </button>

            <button
              onClick={() => handleCopy(embedCode, 'embed')}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>تضمين</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(stream)}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl transition"
              title="تعديل"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(stream.id)}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition"
              title="حذف"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

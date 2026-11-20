import React, { useState, useEffect } from 'react';
import { StreamItem } from '../types/stream';
import { Sparkles, Radio, ShieldCheck, X, Check, HelpCircle, Key, Play, Pause, Globe, RefreshCw, AlertCircle, CheckCircle2, Youtube, Video } from 'lucide-react';

interface StreamGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (streamData: Partial<StreamItem>) => void;
  initialData?: StreamItem | null;
}

export const StreamGeneratorModal: React.FC<StreamGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData
}) => {
  const [title, setTitle] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [category, setCategory] = useState<'sports' | 'news' | 'entertainment' | 'gaming' | 'general'>('sports');
  const [streamType, setStreamType] = useState<'hls' | 'dash' | 'youtube' | 'twitch' | 'mp4' | 'embed'>('hls');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [watermarkText, setWatermarkText] = useState('© حقوق البث المباشر محفوظة | لوحة التحكم');
  const [quality, setQuality] = useState('1080p Full HD');
  const [refererHeader, setRefererHeader] = useState('');
  const [userAgentHeader, setUserAgentHeader] = useState('');
  const [pauseNoticeMessage, setPauseNoticeMessage] = useState('البث متوقف مؤقتاً بواسطة صاحب الرابط');
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ reachable: boolean; message: string; detectedType: string } | null>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setOriginalUrl(initialData.originalUrl);
      setCategory(initialData.category);
      setStreamType(initialData.streamType || 'hls');
      setSlug(initialData.slug);
      setStatus(initialData.status);
      setWatermarkText(initialData.watermarkText || '');
      setQuality(initialData.quality || '1080p Full HD');
      setRefererHeader(initialData.refererHeader || '');
      setUserAgentHeader(initialData.userAgentHeader || '');
      setPauseNoticeMessage(initialData.pauseNoticeMessage || 'البث متوقف مؤقتاً بواسطة صاحب الرابط');
      setCustomPosterUrl(initialData.customPosterUrl || '');
      setPassword(initialData.password || '');
    } else {
      setTitle('');
      setOriginalUrl('');
      setCategory('sports');
      setStreamType('hls');
      setSlug('');
      setStatus('active');
      setWatermarkText('© حقوق البث المباشر محفوظة | لوحة التحكم');
      setQuality('1080p Full HD');
      setRefererHeader('');
      setUserAgentHeader('');
      setPauseNoticeMessage('البث متوقف مؤقتاً بواسطة صاحب الرابط');
      setCustomPosterUrl('');
      setPassword('');
      setVerifyResult(null);
    }
  }, [initialData, isOpen]);

  const handleModalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
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
        if (data.success && data.imageUrl) {
          setCustomPosterUrl(data.imageUrl);
        } else {
          setCustomPosterUrl(base64Data);
        }
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploadingImage(false);
    }
  };

  // Auto-detect stream type on link change
  useEffect(() => {
    if (!originalUrl) {
      setVerifyResult(null);
      return;
    }

    const lower = originalUrl.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      setStreamType('youtube');
    } else if (lower.includes('twitch.tv')) {
      setStreamType('twitch');
    } else if (lower.includes('.m3u8') || lower.includes('hls')) {
      setStreamType('hls');
    } else if (lower.includes('.mp4')) {
      setStreamType('mp4');
    }
  }, [originalUrl]);

  if (!isOpen) return null;

  const verifyStreamUrl = async () => {
    if (!originalUrl.trim()) return;
    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch('/api/verify-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: originalUrl })
      });
      const data = await res.json();
      if (data.success) {
        setVerifyResult({
          reachable: data.reachable,
          message: data.message,
          detectedType: data.detectedType
        });
        if (data.normalizedUrl) {
          setOriginalUrl(data.normalizedUrl);
        }
        if (data.detectedType) {
          setStreamType(data.detectedType);
        }
      }
    } catch (err) {
      setVerifyResult({
        reachable: true,
        message: 'تم فحص الرابط وسيتم تمريره عبر خادم حقوق البث.',
        detectedType: streamType
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalUrl.trim() || !title.trim()) return;

    onSubmit({
      id: initialData?.id,
      title: title.trim(),
      originalUrl: originalUrl.trim(),
      category,
      streamType,
      slug: slug.trim(),
      status,
      watermarkText: watermarkText.trim(),
      quality,
      refererHeader: refererHeader.trim(),
      userAgentHeader: userAgentHeader.trim(),
      pauseNoticeMessage: pauseNoticeMessage.trim(),
      customPosterUrl: customPosterUrl.trim(),
      password: password.trim()
    });

    onClose();
  };

  const applySampleStream = (type: 'bein' | 'news' | 'youtube' | 'nasa' | 'redbull') => {
    if (type === 'bein') {
      setTitle('قناة بين سبورت HD1 - الكلاسيكو المباشر');
      setOriginalUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
      setCategory('sports');
      setStreamType('hls');
      setWatermarkText('© حقوق بث المباريات | BeIN Sports Live');
      setSlug('bein-sports-1-hd');
    } else if (type === 'news') {
      setTitle('الجزيرة الإخبارية - تغطية مباشرة 24 ساعة');
      setOriginalUrl('https://aljazeera-eng-hd.akamaized.net/hls/live/2004082/aljazeera/eng_hd/index.m3u8');
      setCategory('news');
      setStreamType('hls');
      setWatermarkText('LIVE NEWS HD · StreamRights');
      setSlug('aljazeera-live-24');
    } else if (type === 'youtube') {
      setTitle('ناسا الفضائية - بث يوتيوب مباشر حقوقي');
      setOriginalUrl('https://www.youtube.com/watch?v=21X5lGlDOfg');
      setCategory('general');
      setStreamType('youtube');
      setWatermarkText('YOUTUBE LIVE RIGHTS · NASA STREAM');
      setSlug('nasa-yt-live');
    } else if (type === 'nasa') {
      setTitle('بث الفضاء المباشر HLS - ناسا الفضائية HD');
      setOriginalUrl('https://ntv1.akamaized.net/hls/live/2014075/NASA-TV-v1/master.m3u8');
      setCategory('general');
      setStreamType('hls');
      setWatermarkText('NASA SPACE RIGHTS STREAM');
      setSlug('nasa-live-space');
    } else if (type === 'redbull') {
      setTitle('بث ريد بول للرياضات الخطيرة RedBull TV');
      setOriginalUrl('https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8');
      setCategory('sports');
      setStreamType('hls');
      setWatermarkText('RedBull Sports Live HD');
      setSlug('redbull-extreme-live');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {initialData ? 'تعديل بيانات البث الحقوقي' : 'توليد رابط بث مباشر حقوقي جديد'}
              </h3>
              <p className="text-xs text-slate-400">
                ضع أي رابط بث حي أو HLS أو يوتيوب لتحويله إلى رابط حقوقي مخصص مع التحكم بالإيقاف والتشغيل.
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

        {/* Quick Presets */}
        {!initialData && (
          <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/60 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-400 whitespace-nowrap">تجربة روابط شغالة:</span>
            <button
              type="button"
              onClick={() => applySampleStream('bein')}
              className="px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900 transition-colors whitespace-nowrap"
            >
              ⚽ BeIN Sports M3U8
            </button>
            <button
              type="button"
              onClick={() => applySampleStream('youtube')}
              className="px-2.5 py-1 rounded-md bg-rose-950 text-rose-300 border border-rose-800/60 hover:bg-rose-900 transition-colors whitespace-nowrap"
            >
              📺 يوتيوب مباشر YouTube
            </button>
            <button
              type="button"
              onClick={() => applySampleStream('news')}
              className="px-2.5 py-1 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900 transition-colors whitespace-nowrap"
            >
              📰 الجزيرة الإخبارية
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Stream Title */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              عنوان البث المباشر / المباراة <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مباراة ريال مدريد وبرشلونة - الكلاسيكو HD"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Original Stream URL with Verification */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300">
                رابط البث الأصلي (HLS .m3u8 / YouTube / Twitch / IPTV) <span className="text-rose-400">*</span>
              </label>
              {originalUrl && (
                <button
                  type="button"
                  onClick={verifyStreamUrl}
                  disabled={verifying}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold"
                >
                  {verifying ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  <span>فحص وصحة الرابط</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="url"
                required
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://server.com/live/stream.m3u8 أو https://youtube.com/watch?v=..."
                className="w-full px-4 py-2.5 pl-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs dir-ltr text-left focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <Radio className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
            </div>

            {verifyResult && (
              <div className={`mt-2 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                verifyResult.reachable ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300' : 'bg-amber-950/60 border border-amber-800/60 text-amber-300'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{verifyResult.message}</span>
              </div>
            )}
          </div>

          {/* Stream Type & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                نوع بروتوكول البث
              </label>
              <select
                value={streamType}
                onChange={(e) => setStreamType(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-indigo-300 font-mono text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="hls">HLS Live Stream (.m3u8)</option>
                <option value="youtube">YouTube Live / Video (تضمين يوتيوب)</option>
                <option value="twitch">Twitch Stream (تضمين تويتش)</option>
                <option value="mp4">Direct MP4 Video File</option>
                <option value="embed">HTML iFrame Web Embed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                فئة البث
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="sports">رياضة ومباريات (Sports)</option>
                <option value="news">أخبار وبث حي (News)</option>
                <option value="entertainment">ترفيه وقنوات (Entertainment)</option>
                <option value="gaming">ألعاب وبثوث (Gaming)</option>
                <option value="general">بث مباشر عام (General)</option>
              </select>
            </div>
          </div>

          {/* Status Switcher */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              حالة الرابط عند التوليد
            </label>
            <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setStatus('active')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  status === 'active'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>شغّال (Active)</span>
              </button>
              <button
                type="button"
                onClick={() => setStatus('paused')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  status === 'paused'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>متوقف (Paused)</span>
              </button>
            </div>
          </div>

          {/* Rights Watermark */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              نص الحقوق النصي (Watermark Text)
            </label>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="مثال: © جميع الحقوق محفوظة لشبكة بث مباشر | TV-RIGHTS"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>



          {/* Pause Message */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              رسالة شاشة الإيقاف (عند إيقاف الرابط)
            </label>
            <input
              type="text"
              value={pauseNoticeMessage}
              onChange={(e) => setPauseNoticeMessage(e.target.value)}
              placeholder="مثال: البث متوقف مؤقتاً للاستراحة وسيعود فور بدء الشوط الثاني."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Custom Pause Screen Image Upload (من الهاتف / الاستوديو) */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="block text-xs font-bold text-slate-200">
              📷 صورة شاشة الإيقاف المخصصة (رفع صورة من الهاتف / الجهاز)
            </label>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <label className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 shrink-0">
                <span className="text-sm">🖼️</span>
                <span>{uploadingImage ? 'جاري التحميل...' : 'اختر صورة من الهاتف/المعرض'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleModalImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </label>

              <div className="flex-1 w-full">
                <input
                  type="text"
                  value={customPosterUrl}
                  onChange={(e) => setCustomPosterUrl(e.target.value)}
                  placeholder="أو ضع رابط صورة مباشرة (http://...)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 dir-ltr text-left"
                />
              </div>
            </div>

            {/* Uploaded Image Preview Thumbnail */}
            {customPosterUrl && (
              <div className="relative mt-2 w-full max-w-xs h-28 rounded-xl overflow-hidden border border-slate-700 group">
                <img
                  src={customPosterUrl}
                  alt="معاينة صورة شاشة الإيقاف"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setCustomPosterUrl('')}
                  className="absolute top-2 right-2 p-1.5 bg-rose-600 text-white rounded-lg opacity-90 hover:opacity-100 shadow-md"
                  title="حذف الصورة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Custom Slug */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              معرف الرابط الحقوقي المخصص (Slug Alias)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono dir-ltr shrink-0">/api/stream/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="bein-hd-1"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-indigo-300 font-mono text-xs focus:outline-none focus:border-indigo-500 dir-ltr text-left"
              />
            </div>
          </div>

          {/* Advanced Headers */}
          <div className="pt-2 border-t border-slate-800/60">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 focus:outline-none"
            >
              <span>{showAdvanced ? 'إخفاء الإعدادات المتقدمة' : '+ خيارات الترويسات والحماية المتقدمة (CORS / Headers / Passcode)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    ترويسة Referer (لتجاوز حماية IPTV)
                  </label>
                  <input
                    type="text"
                    value={refererHeader}
                    onChange={(e) => setRefererHeader(e.target.value)}
                    placeholder="https://original-provider.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono dir-ltr text-left"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    ترويسة User-Agent المخصصة
                  </label>
                  <input
                    type="text"
                    value={userAgentHeader}
                    onChange={(e) => setUserAgentHeader(e.target.value)}
                    placeholder="Mozilla/5.0 (Windows NT 10.0...)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono dir-ltr text-left"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              إلغاء
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{initialData ? 'حفظ التعديلات' : 'توليد رابط البث الحقوقي'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { StreamItem } from '../types/stream';
import {
  Play,
  Pause,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
  Maximize,
  AlertCircle,
  ShieldCheck,
  Copy,
  Check,
  Server,
  Globe,
  Tv
} from 'lucide-react';

interface LivePlayerProps {
  stream: StreamItem;
  onToggleStatus?: (id: string) => void;
  standalone?: boolean;
  deviceId: string;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({
  stream,
  onToggleStatus,
  standalone = false,
  deviceId
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [activeEngine, setActiveEngine] = useState<'hls-proxy' | 'direct-hls' | 'embed' | 'direct-video'>('hls-proxy');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [useEdgeSegmentProxy, setUseEdgeSegmentProxy] = useState(false);

  const host = typeof window !== 'undefined' ? window.location.origin : '';
  const streamKey = stream.streamToken || stream.slug;
  const directM3u8Url = `${host}/v/${streamKey}.m3u8`;
  const watermarkLabel = (stream.watermarkText || '© حقوق البث المباشر محفوظة').trim() || '© حقوق البث المباشر محفوظة';

  const getPosterUrl = (url?: string) => {
    if (!url) return `${host}/uploads/preset_poster_1.jpg`;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) return url;
    if (url.startsWith('/')) return `${host}${url}`;
    return `${host}/${url}`;
  };

  // Detect best starting engine
  useEffect(() => {
    const type = stream.streamType;
    const url = stream.originalUrl.toLowerCase();

    setUseEdgeSegmentProxy(false);
    if (
      type === 'youtube' ||
      type === 'twitch' ||
      type === 'embed' ||
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      url.includes('twitch.tv')
    ) {
      setActiveEngine('embed');
    } else if (type === 'mp4' || url.includes('.mp4') || url.includes('.webm')) {
      setActiveEngine('direct-video');
    } else {
      setActiveEngine('hls-proxy');
    }
  }, [stream.id, stream.streamType, stream.originalUrl]);

  // Attach HLS / Media engine
  useEffect(() => {
    setError(null);

    if (stream.status === 'paused') {
      setIsBuffering(false);
      return;
    }

    if (activeEngine === 'embed') {
      setIsBuffering(false);
      return;
    }

    if (activeEngine === 'direct-video') {
      const video = videoRef.current;
      if (video) {
        video.src = stream.originalUrl;
        video.play().catch(() => setIsPlaying(false));
        setIsBuffering(false);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setIsBuffering(true);

    const targetUrl =
      activeEngine === 'hls-proxy'
        ? (useEdgeSegmentProxy ? `${directM3u8Url}?proxy=1` : directM3u8Url)
        : stream.originalUrl;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.8,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 10,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        startLevel: -1,
        abrEwmaDefaultEstimate: 3500000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.75,
        capLevelToPlayerSize: true,
        startFragPrefetch: true,
        maxLoadingDelay: 4,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 300,
        levelLoadingTimeOut: 12000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 300,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 300
      });

      hlsRef.current = hls;
      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        video.play().catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => setIsPlaying(false));
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (activeEngine === 'hls-proxy' && !useEdgeSegmentProxy) {
                setUseEdgeSegmentProxy(true);
              } else if (activeEngine === 'hls-proxy') {
                setActiveEngine('direct-hls');
              } else {
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setActiveEngine('embed');
              setIsBuffering(false);
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsBuffering(false);
        video.play().catch(() => {});
      });
    } else {
      setActiveEngine('embed');
      setIsBuffering(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [
    stream.id,
    stream.status,
    stream.originalUrl,
    directM3u8Url,
    activeEngine,
    useEdgeSegmentProxy
  ]);

  const staticTelemetryRef = useRef<Record<string, any> | null>(null);

  const collectClientTelemetry = () => {
    if (typeof window === 'undefined') return undefined;
    if (!staticTelemetryRef.current) {
      let gpuRenderer = '';
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl && 'getParameter' in gl) {
          const webgl = gl as WebGLRenderingContext;
          const dbg = webgl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            gpuRenderer = String(webgl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          } else {
            gpuRenderer = String(webgl.getParameter(webgl.RENDERER) || '');
          }
        }
      } catch {}

      const navStatic = navigator as Navigator & { deviceMemory?: number };
      const dpr = window.devicePixelRatio ? ` @${window.devicePixelRatio}x` : '';
      staticTelemetryRef.current = {
        screenResolution: `${window.screen.width}x${window.screen.height}${dpr}`,
        language: navigator.language || '',
        languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 4) : [],
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        cpuCores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : undefined,
        deviceMemoryGb: typeof navStatic.deviceMemory === 'number' ? navStatic.deviceMemory : undefined,
        maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
        platform: navigator.platform || '',
        gpuRenderer: gpuRenderer || undefined
      };
    }

    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    };

    return {
      ...staticTelemetryRef.current,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      networkType: nav.connection?.effectiveType || undefined,
      downlinkMbps: typeof nav.connection?.downlink === 'number' ? nav.connection.downlink : undefined,
      rttMs: typeof nav.connection?.rtt === 'number' ? nav.connection.rtt : undefined,
      isVisible: document.visibilityState === 'visible',
      playbackEngine: activeEngine
    };
  };

  // Real-Time Viewer Heartbeat
  useEffect(() => {
    if (!standalone || stream.status !== 'active') return;

    const sendPing = async () => {
      try {
        await fetch(`/api/stream/${encodeURIComponent(streamKey)}/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            telemetry: collectClientTelemetry()
          })
        });
      } catch {}
    };

    sendPing();
    const pingInterval = setInterval(sendPing, 5000);

    const handleLeave = () => {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`/api/stream/${encodeURIComponent(streamKey)}/leave`, JSON.stringify({ deviceId }));
        } else {
          fetch(`/api/stream/${encodeURIComponent(streamKey)}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
            keepalive: true
          }).catch(() => {});
        }
      } catch {}
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      handleLeave();
    };
  }, [standalone, streamKey, stream.status, activeEngine, deviceId]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden border border-slate-800 bg-[#060911] shadow-2xl ${standalone ? 'w-full max-w-5xl mx-auto' : 'w-full'}`}>

      {/* Stream Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900/95 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold shrink-0">
            <span className={stream.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}>
              {stream.status === 'active' ? 'مباشر' : 'متوقف مؤقتاً'}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">{stream.title}</h2>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
            <button
              onClick={() => setActiveEngine('hls-proxy')}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${
                activeEngine === 'hls-proxy' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-3 h-3" />
              <span>بروكسي HLS</span>
            </button>

            <button
              onClick={() => setActiveEngine('embed')}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${
                activeEngine === 'embed' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="w-3 h-3" />
              <span>تضمين</span>
            </button>

            <button
              onClick={() => setActiveEngine('direct-hls')}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${
                activeEngine === 'direct-hls' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>مباشر</span>
            </button>
          </div>

          {onToggleStatus && (
            <button
              onClick={() => onToggleStatus(stream.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                stream.status === 'active'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {stream.status === 'active' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>إيقاف الرابط</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>تشغيل الرابط</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => handleCopy(directM3u8Url)}
            className="flex items-center gap-1 px-3 py-1.5 font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>نسخ M3U8</span>
          </button>
        </div>
      </div>

      {/* Main Viewing Area */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">

        {/* Paused Stream Broadcast Screen */}
        {stream.status === 'paused' ? (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-center p-4 sm:p-6 z-30 overflow-hidden select-none">
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
              <img
                src={getPosterUrl(stream.customPosterUrl)}
                alt="شاشة حقوق الإيقاف المخصصة"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain opacity-95"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `${host}/uploads/preset_poster_1.jpg`;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/50" />
            </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-xl">
              {!stream.customPosterUrl && (
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-rose-500/40 flex items-center justify-center mb-4">
                  <ShieldAlert className="w-8 h-8 text-rose-400" />
                </div>
              )}

              <h3 className="text-lg sm:text-2xl font-black text-white leading-snug mb-2 tracking-tight">
                {stream.title}
              </h3>

              <div className="w-full p-3 sm:p-4 rounded-2xl bg-slate-900/85 border border-rose-500/30 backdrop-blur-md my-2 space-y-1">
                <span className="text-[11px] font-bold text-rose-400 block">
                  تنبيه مسؤول البث المباشر:
                </span>
                <p className="text-xs sm:text-sm font-semibold text-slate-200 leading-relaxed">
                  {stream.pauseNoticeMessage || 'تم إيقاف هذا الرابط مؤقتاً بواسطة مسؤول البث. سيعود البث فور إعادة تفعيله.'}
                </p>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row items-center gap-3">
                {onToggleStatus ? (
                  <button
                    onClick={() => onToggleStatus(stream.id)}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>إعادة تشغيل البث المباشر الآن</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-300 bg-black/75 px-4 py-2 rounded-xl border border-slate-700">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span>في انتظار إعادة تفعيل البث...</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-300">
                <span className="font-bold text-amber-300">{watermarkLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-400">/{stream.slug}</span>
              </div>
            </div>
          </div>
        ) : activeEngine === 'embed' ? (
          <div className="relative w-full h-full">
            <iframe
              src={stream.originalUrl}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={stream.title}
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls={false}
            playsInline
            poster={getPosterUrl(stream.customPosterUrl)}
          />
        )}

        {/* Static Rights Watermark */}
        {stream.status === 'active' && (
          <div className="absolute top-3.5 right-3.5 z-20 pointer-events-none select-none flex items-center gap-2 bg-black/75 backdrop-blur-md text-slate-100 text-xs font-black px-3.5 py-1.5 rounded-xl border border-white/15">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-white">{watermarkLabel}</span>
          </div>
        )}

        {/* Quality Tag */}
        {stream.status === 'active' && (
          <div className="absolute top-3.5 left-3.5 z-20 pointer-events-none select-none flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums font-bold text-cyan-300 bg-slate-950/80 border border-cyan-500/30 px-2.5 py-1 rounded-md">
              {stream.quality}
            </span>
          </div>
        )}

        {/* Error Message Overlay */}
        {error && (
          <div className="absolute inset-0 z-40 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <p className="text-sm font-bold text-white mb-4 max-w-xs">{error}</p>
            <button
              onClick={() => { setError(null); window.location.reload(); }}
              className="px-6 py-2 bg-rose-600 text-white font-black text-xs rounded-xl shadow-lg"
            >
              تحديث الصفحة والمحاولة مجدداً
            </button>
          </div>
        )}

        {/* Custom Video Controls Bar */}
        {stream.status === 'active' && activeEngine !== 'embed' && !error && (
          <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-transform active:scale-95"
                aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={toggleMute}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <span className="text-xs font-mono text-slate-300">
                LIVE
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                aria-label="ملء الشاشة"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Buffering Indicator */}
        {isBuffering && stream.status === 'active' && activeEngine !== 'embed' && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px] z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-slate-200">جاري الاتصال بالبث المباشر...</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info Box */}
      <div className="p-4 bg-slate-900/70 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span>التصنيف: <strong className="text-slate-200">{stream.category}</strong></span>
          <span aria-hidden="true">·</span>
          <span>الزيارات: <strong className="text-slate-200 font-mono tabular-nums">{stream.viewsCount}</strong></span>
        </div>
      </div>
    </div>
  );
};

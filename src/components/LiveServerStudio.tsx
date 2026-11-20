import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { io, Socket } from 'socket.io-client';
import { LiveServerItem, StreamItem } from '../types/stream';
import {
  Server,
  Copy,
  Check,
  Play,
  Pause,
  Trash2,
  Plus,
  Video,
  Monitor,
  Mic,
  MicOff,
  Radio,
  Upload,
  RefreshCw,
  ArrowLeftRight,
  Eye,
  Film,
  Camera
} from 'lucide-react';

interface LiveServerStudioProps {
  servers: LiveServerItem[];
  streams: StreamItem[];
  serverBaseUrl: string;
  onRefresh: () => void | Promise<void>;
}

const STORAGE_SELECTED_ID_KEY = 'sr_live_server_id';
const STORAGE_SERVERS_BACKUP_KEY = 'sr_live_servers_backup';
const UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB streamed slice per chunk (supports multi-GB up to 1TB without RAM usage)

function formatBytesShort(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function sanitizeBackupServersList(list: unknown[]): LiveServerItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((srv: any) => srv && srv.id && srv.token && srv.id !== 'lsrv_1794928526200_iry2' && srv.token !== 'srv15ca2')
    .map((srv: any) => {
      const cleanSources = Array.isArray(srv.sources)
        ? srv.sources.filter((src: any) => {
            const n = String(src?.name || '').trim().toLowerCase();
            const u = String(src?.url || '').trim().toLowerCase();
            return !n.startsWith('test_') && !u.includes('://localhost:') && !u.includes('://127.0.0.1:');
          })
        : [];
      const activeSourceId =
        srv.activeSourceId && cleanSources.some((x: any) => x.id === srv.activeSourceId)
          ? srv.activeSourceId
          : cleanSources[0]?.id || null;
      return {
        ...srv,
        sources: cleanSources,
        activeSourceId
      } as LiveServerItem;
    });
}

function readBackupServers(): LiveServerItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_SERVERS_BACKUP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const cleaned = sanitizeBackupServersList(parsed);
    if (Array.isArray(parsed) && cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_SERVERS_BACKUP_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function upsertBackupServer(server: LiveServerItem) {
  if (typeof window === 'undefined' || !server?.id) return;
  try {
    const current = readBackupServers();
    const idx = current.findIndex(s => s.id === server.id);
    if (idx >= 0) current[idx] = server;
    else current.unshift(server);
    localStorage.setItem(STORAGE_SERVERS_BACKUP_KEY, JSON.stringify(current));
  } catch {}
}

function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export const LiveServerStudio: React.FC<LiveServerStudioProps> = ({
  servers,
  streams,
  serverBaseUrl,
  onRefresh
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_SELECTED_ID_KEY);
      if (saved) return saved;
    }
    return servers[0]?.id || readBackupServers()[0]?.id || null;
  });
  const [optimisticServer, setOptimisticServer] = useState<LiveServerItem | null>(() => {
    if (servers.length > 0) return null;
    const backup = readBackupServers();
    if (backup.length === 0) return null;
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_SELECTED_ID_KEY) : null;
    return backup.find(s => s.id === saved) || backup[0] || null;
  });
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create New Server Form State
  const [newTitle, setNewTitle] = useState('');
  const [newInitialUrl, setNewInitialUrl] = useState('');
  const [newInitialName, setNewInitialName] = useState('');
  const [creating, setCreating] = useState(false);

  // Hot-Swap / Add Source State
  const [quickName, setQuickName] = useState('');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickKind, setQuickKind] = useState<'auto' | 'hls' | 'video'>('auto');
  const [switching, setSwitching] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesLabel, setUploadBytesLabel] = useState('');
  const [freeDiskBytes, setFreeDiskBytes] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live Server Monitor Preview (hls.js)
  const [showMonitor, setShowMonitor] = useState(false);
  const monitorVideoRef = useRef<HTMLVideoElement>(null);
  const monitorHlsRef = useRef<Hls | null>(null);
  const userMonitorPausedRef = useRef(false);

  // Studio Camera / Screen Live Capture State
  const [captureMode, setCaptureMode] = useState<'camera' | 'screen'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [studioQuality, setStudioQuality] = useState<'720p' | '480p'>('720p');
  const [micMuted, setMicMuted] = useState(false);
  const [isStreamingStudio, setIsStreamingStudio] = useState(false);
  const [startingStudio, setStartingStudio] = useState(false);
  const [studioServerId, setStudioServerId] = useState<string | null>(null);
  const [studioElapsedSec, setStudioElapsedSec] = useState(0);
  const [studioKbps, setStudioKbps] = useState(0);

  const studioVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const studioServerIdRef = useRef<string | null>(null);
  const isStreamingStudioRef = useRef(false);
  const stoppingStudioRef = useRef(false);
  const recoveringStudioRef = useRef(false);
  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());
  const chosenContainerRef = useRef<'webm' | 'mp4'>('webm');
  const chosenMimeRef = useRef<string>('');
  const hasAudioTrackRef = useRef<boolean>(true);
  const studioQualityRef = useRef<'720p' | '480p'>('720p');
  const captureModeRef = useRef<'camera' | 'screen'>('camera');
  const facingModeRef = useRef<'user' | 'environment'>('environment');
  const micMutedRef = useRef<boolean>(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const bytesWindowRef = useRef(0);
  const hasTriedRestoreRef = useRef(false);

  studioQualityRef.current = studioQuality;
  captureModeRef.current = captureMode;
  facingModeRef.current = facingMode;
  micMutedRef.current = micMuted;

  // Fetch real server storage capacity once
  useEffect(() => {
    fetch('/api/live-servers/storage')
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.freeBytes) setFreeDiskBytes(Number(d.freeBytes));
      })
      .catch(() => {});
  }, []);

  // Backup real servers to localStorage & restore once on boot if ephemeral container restarted empty
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (servers.length > 0) {
      hasTriedRestoreRef.current = true;
      try {
        localStorage.setItem(STORAGE_SERVERS_BACKUP_KEY, JSON.stringify(servers));
      } catch {}
      setOptimisticServer(null);
      if (!selectedId || !servers.some(s => s.id === selectedId)) {
        const saved = localStorage.getItem(STORAGE_SELECTED_ID_KEY);
        const matched = saved && servers.find(s => s.id === saved);
        const nextId = matched ? matched.id : servers[0].id;
        setSelectedId(nextId);
        localStorage.setItem(STORAGE_SELECTED_ID_KEY, nextId);
      } else {
        localStorage.setItem(STORAGE_SELECTED_ID_KEY, selectedId);
      }
    } else if (!hasTriedRestoreRef.current) {
      hasTriedRestoreRef.current = true;
      const parsedBackup = readBackupServers();
      if (parsedBackup.length > 0) {
        const preferred =
          parsedBackup.find(s => s.id === selectedId) || parsedBackup[0];
        if (preferred) setOptimisticServer(preferred);
        fetch('/api/live-servers/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: parsedBackup })
        })
          .then(r => r.json())
          .then(res => {
            if (res?.success && Array.isArray(res.servers) && res.servers.length > 0) {
              const matched = res.servers.find((s: LiveServerItem) => s.id === selectedId) || res.servers[0];
              setOptimisticServer(matched);
              onRefresh();
            } else {
              setOptimisticServer(null);
            }
          })
          .catch(() => {
            setOptimisticServer(null);
          });
      }
    }
  }, [servers, selectedId]);

  const effectiveServers =
    servers.length > 0 ? servers : optimisticServer ? [optimisticServer] : [];
  const selectedServer =
    effectiveServers.find(s => s.id === selectedId) || effectiveServers[0] || null;
  const cleanBase = (serverBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const serverM3u8Url = selectedServer ? `${cleanBase}/srv/${selectedServer.token}.m3u8` : '';

  const showToast = (type: 'ok' | 'err', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => {
      setFeedbackMsg(prev => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Monitor player lifecycle
  useEffect(() => {
    if (!showMonitor || !selectedServer || !monitorVideoRef.current) {
      if (monitorHlsRef.current) {
        monitorHlsRef.current.destroy();
        monitorHlsRef.current = null;
      }
      return;
    }

    const video = monitorVideoRef.current;
    userMonitorPausedRef.current = false;
    const playUrl = `${cleanBase}/srv/${selectedServer.token}.m3u8`;

    const onPause = () => {
      if (!video.ended && video.readyState >= 2) {
        userMonitorPausedRef.current = true;
      }
    };
    const onPlay = () => {
      userMonitorPausedRef.current = false;
    };
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);

    if (Hls.isSupported()) {
      if (monitorHlsRef.current) monitorHlsRef.current.destroy();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 6,
        maxBufferLength: 10,
        manifestLoadingMaxRetry: 15,
        manifestLoadingRetryDelay: 800,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 600
      });
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!userMonitorPausedRef.current && video.paused) {
          video.play().catch(() => {});
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
          if (video.buffered.length > 0) {
            const liveEnd = video.buffered.end(video.buffered.length - 1);
            if (liveEnd - video.currentTime > 1.5) {
              video.currentTime = Math.max(0, liveEnd - 0.5);
            }
          }
          if (!userMonitorPausedRef.current) {
            video.play().catch(() => {});
          }
          return;
        }
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => {
              try {
                hls.startLoad(-1);
              } catch {}
            }, 600);
          }
        }
      });
      monitorHlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl;
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      if (monitorHlsRef.current) {
        monitorHlsRef.current.destroy();
        monitorHlsRef.current = null;
      }
    };
  }, [showMonitor, selectedServer?.id, selectedServer?.token, cleanBase]);

  // Jump monitor immediately to live edge after source/camera switch
  useEffect(() => {
    if (showMonitor && monitorHlsRef.current) {
      try {
        monitorHlsRef.current.startLoad(-1);
      } catch {}
    }
  }, [showMonitor, selectedServer?.switchCount]);

  // Studio timer + bitrate meter
  useEffect(() => {
    if (!isStreamingStudio) {
      setStudioElapsedSec(0);
      setStudioKbps(0);
      bytesWindowRef.current = 0;
      return;
    }
    const timer = setInterval(() => {
      setStudioElapsedSec(prev => prev + 1);
      const kbps = Math.round((bytesWindowRef.current * 8) / 1000);
      setStudioKbps(kbps);
      bytesWindowRef.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, [isStreamingStudio]);

  // Cleanup studio broadcast on unmount
  useEffect(() => {
    return () => {
      stopStudioBroadcast(false);
    };
  }, []);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  };

  // Auto-create a real server if none exists yet so phone upload & camera never stall or reset
  const ensureActiveServer = async (fallbackTitle?: string): Promise<LiveServerItem | null> => {
    if (selectedServer) return selectedServer;
    const res = await fetch('/api/live-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: (fallbackTitle || 'سيرفر البث المباشر').trim()
      })
    });
    const data = await res.json();
    if (data.success && data.server) {
      const created = data.server as LiveServerItem;
      upsertBackupServer(created);
      setOptimisticServer(created);
      setSelectedId(created.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_SELECTED_ID_KEY, created.id);
      }
      await onRefresh();
      return created;
    }
    return null;
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const cleanInitUrl = normalizeInputUrl(newInitialUrl);
      const res = await fetch('/api/live-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          initialUrl: cleanInitUrl || undefined,
          initialSourceName: newInitialName.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success && data.server) {
        const created = data.server as LiveServerItem;
        upsertBackupServer(created);
        setOptimisticServer(created);
        setSelectedId(created.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_SELECTED_ID_KEY, created.id);
        }
        setShowCreateForm(false);
        setNewTitle('');
        setNewInitialUrl('');
        setNewInitialName('');
        await onRefresh();
        showToast('ok', 'تم إنشاء سيرفر البث المباشر وتوليد رابط M3U8 بنجاح');
      } else {
        showToast('err', data.error || 'تعذر إنشاء السيرفر');
      }
    } catch {
      showToast('err', 'حدث خطأ أثناء الاتصال بالسيرفر');
    } finally {
      setCreating(false);
    }
  };

  const handleSwitchSource = async (
    payload: { sourceId?: string; url?: string; name?: string; kind?: 'hls' | 'video' },
    targetServerOverride?: LiveServerItem | null
  ) => {
    const targetSrv = targetServerOverride || (await ensureActiveServer(payload.name));
    if (!targetSrv) {
      showToast('err', 'تعذر تجهيز السيرفر');
      return;
    }
    if (isStreamingStudio) {
      await stopStudioBroadcast(false);
    }
    setSwitching(true);
    try {
      const normalizedPayload = payload.url
        ? { ...payload, url: normalizeInputUrl(payload.url) }
        : payload;
      const res = await fetch(`/api/live-servers/${targetSrv.id}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...normalizedPayload,
          fallbackServer: targetSrv
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.server) {
          upsertBackupServer(data.server);
          setOptimisticServer(data.server);
        }
        await onRefresh();
        if (payload.url) {
          setQuickUrl('');
          setQuickName('');
        }
        showToast('ok', 'تم تشغيل المصدر على رابط السيرفر بنجاح');
      } else {
        showToast('err', data.error || 'تعذر تبديل المصدر');
      }
    } catch {
      showToast('err', 'فشل تبديل المصدر');
    } finally {
      setSwitching(false);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeInputUrl(quickUrl);
    if (!cleaned) return;
    await handleSwitchSource({
      url: cleaned,
      name: quickName.trim() || undefined,
      kind: quickKind === 'auto' ? undefined : quickKind
    });
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!selectedServer) return;
    try {
      await fetch(`/api/live-servers/${selectedServer.id}/sources/${sourceId}`, { method: 'DELETE' });
      onRefresh();
    } catch {}
  };

  const handleToggleServerStatus = async () => {
    if (!selectedServer) return;
    if (selectedServer.status === 'live' && isStreamingStudio) {
      await stopStudioBroadcast(false);
    }
    try {
      const res = await fetch(`/api/live-servers/${selectedServer.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallbackServer: selectedServer })
      });
      const data = await res.json();
      if (data.success) {
        if (data.server) {
          upsertBackupServer(data.server);
          setOptimisticServer(data.server);
        }
        onRefresh();
      }
    } catch {}
  };

  const handleDeleteServer = async () => {
    if (!selectedServer) return;
    if (!confirm(`هل أنت متأكد من حذف سيرفر "${selectedServer.title}"؟ سيتوقف رابط M3U8 الخاص به.`)) return;
    if (isStreamingStudio && studioServerIdRef.current === selectedServer.id) {
      await stopStudioBroadcast(false);
    }
    try {
      const deletedId = selectedServer.id;
      await fetch(`/api/live-servers/${deletedId}`, { method: 'DELETE' });
      if (typeof window !== 'undefined') {
        if (localStorage.getItem(STORAGE_SELECTED_ID_KEY) === deletedId) {
          localStorage.removeItem(STORAGE_SELECTED_ID_KEY);
        }
        try {
          const rawBackup = localStorage.getItem(STORAGE_SERVERS_BACKUP_KEY);
          if (rawBackup) {
            const filtered = JSON.parse(rawBackup).filter((x: LiveServerItem) => x.id !== deletedId);
            localStorage.setItem(STORAGE_SERVERS_BACKUP_KEY, JSON.stringify(filtered));
          }
        } catch {}
      }
      setOptimisticServer(null);
      setSelectedId(null);
      await onRefresh();
    } catch {}
  };

  const uploadChunkWithRetry = async (
    chunkBlob: Blob,
    uploadId: string,
    index: number,
    total: number,
    filename: string,
    attemptsLeft = 2
  ): Promise<{ success: boolean; done?: boolean; videoUrl?: string; error?: string }> => {
    try {
      const res = await fetch(
        `/api/live-servers/upload-video-chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}&total=${total}&filename=${encodeURIComponent(filename)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunkBlob
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'chunk upload failed');
      }
      return data;
    } catch (err) {
      if (attemptsLeft > 0) {
        await new Promise(r => setTimeout(r, 600));
        return uploadChunkWithRetry(chunkBlob, uploadId, index, total, filename, attemptsLeft - 1);
      }
      throw err;
    }
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    setUploadProgress(0);
    setUploadBytesLabel(`0 MB / ${formatBytesShort(file.size)}`);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '') || 'فيديو 24/7';
    const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_SIZE));

    try {
      let finalVideoUrl = '';
      for (let i = 0; i < totalChunks; i++) {
        const start = i * UPLOAD_CHUNK_SIZE;
        const end = Math.min(file.size, start + UPLOAD_CHUNK_SIZE);
        const chunk = file.slice(start, end);
        const resData = await uploadChunkWithRetry(chunk, uploadId, i, totalChunks, file.name);
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        setUploadBytesLabel(`${formatBytesShort(end)} / ${formatBytesShort(file.size)}`);
        if (resData.done && resData.videoUrl) {
          finalVideoUrl = resData.videoUrl;
        }
      }

      if (finalVideoUrl) {
        const targetSrv = await ensureActiveServer(cleanTitle);
        if (!targetSrv) {
          showToast('err', 'تم رفع الفيديو ولكن تعذر إنشاء السيرفر');
          return;
        }
        await handleSwitchSource(
          {
            url: finalVideoUrl,
            name: cleanTitle,
            kind: 'video'
          },
          targetSrv
        );
      } else {
        showToast('err', 'لم يكتمل رفع ملف الفيديو');
      }
    } catch {
      showToast('err', 'تعذر رفع ملف الفيديو من الهاتف. تأكد من استقرار الشبكة وحاول مرة أخرى.');
    } finally {
      setUploadingVideo(false);
      setUploadProgress(0);
      setUploadBytesLabel('');
      e.target.value = '';
    }
  };

  const acquireCameraStream = async (width: number, height: number): Promise<MediaStream> => {
    const tiers: MediaStreamConstraints[] = [
      { video: { width: { ideal: width }, height: { ideal: height }, facingMode }, audio: true },
      { video: { facingMode }, audio: true },
      { video: true, audio: false }
    ];
    let lastError: unknown = null;
    for (const constraints of tiers) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: unknown) {
        lastError = err;
        const errName = (err as { name?: string })?.name || '';
        // If user explicitly denied camera permission, don't retry further tiers
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          throw err;
        }
      }
    }
    throw lastError || new Error('Camera unavailable');
  };

  const attachRecorderAndStreamChunks = (stream: MediaStream, targetSrv: LiveServerItem) => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.stop();
      } catch {}
    }
    chunkQueueRef.current = Promise.resolve();

    let recorder: MediaRecorder;
    const chosenMime = chosenMimeRef.current;
    try {
      recorder = chosenMime
        ? new MediaRecorder(stream, {
            mimeType: chosenMime,
            videoBitsPerSecond: studioQualityRef.current === '720p' ? 1600000 : 950000
          })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = event => {
      if (stoppingStudioRef.current || !event.data || event.data.size === 0) return;
      const blob = event.data;
      chunkQueueRef.current = chunkQueueRef.current
        .then(async () => {
          if (stoppingStudioRef.current) return;
          const buf = await blob.arrayBuffer();
          if (stoppingStudioRef.current || buf.byteLength === 0) return;
          bytesWindowRef.current += buf.byteLength;

          const activeSocket = socketRef.current;
          if (activeSocket && activeSocket.connected) {
            activeSocket.emit('live-studio:chunk', { serverId: targetSrv.id, chunk: buf });
            return;
          }

          const resp = await fetch(`/api/live-servers/${targetSrv.id}/studio-chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: buf
          }).catch(() => null);

          if (resp && resp.status === 409 && isStreamingStudioRef.current && !stoppingStudioRef.current) {
            recoverStudioPipeline(targetSrv);
          }
        })
        .catch(() => {});
    };

    recorder.start(400);
    recorderRef.current = recorder;
  };

  const recoverStudioPipeline = async (targetSrv: LiveServerItem) => {
    if (recoveringStudioRef.current || stoppingStudioRef.current || !isStreamingStudioRef.current) return;
    recoveringStudioRef.current = true;
    try {
      let currentStream = mediaStreamRef.current;
      const trackDead = !currentStream || currentStream.getVideoTracks().every(t => t.readyState === 'ended');
      if (trackDead && captureModeRef.current === 'camera') {
        try {
          const height = studioQualityRef.current === '720p' ? 720 : 480;
          const width = studioQualityRef.current === '720p' ? 1280 : 854;
          const freshStream = await acquireCameraStream(width, height);
          freshStream.getAudioTracks().forEach(t => {
            t.enabled = !micMutedRef.current;
          });
          mediaStreamRef.current = freshStream;
          hasAudioTrackRef.current = freshStream.getAudioTracks().length > 0;
          if (studioVideoRef.current) {
            studioVideoRef.current.srcObject = freshStream;
            studioVideoRef.current.play().catch(() => {});
          }
          currentStream = freshStream;
        } catch {
          return;
        }
      }
      if (!currentStream) return;

      const startRes = await fetch(`/api/live-servers/${targetSrv.id}/studio-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: chosenContainerRef.current,
          hasAudio: hasAudioTrackRef.current,
          fallbackServer: targetSrv
        })
      }).catch(() => null);

      if (startRes && startRes.ok && !stoppingStudioRef.current && isStreamingStudioRef.current) {
        attachRecorderAndStreamChunks(currentStream, targetSrv);
      }
    } finally {
      setTimeout(() => {
        recoveringStudioRef.current = false;
      }, 1500);
    }
  };

  // Recover seamlessly if mobile browser returns to foreground while studio broadcast was active
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isStreamingStudioRef.current && !stoppingStudioRef.current) {
        const srv = effectiveServers.find(s => s.id === studioServerIdRef.current) || selectedServer;
        if (!srv) return;
        const currentStream = mediaStreamRef.current;
        const trackDead = !currentStream || currentStream.getVideoTracks().every(t => t.readyState === 'ended');
        if (trackDead || !recorderRef.current || recorderRef.current.state === 'inactive') {
          recoverStudioPipeline(srv);
        }
        try {
          const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
          if (wl && !wakeLockRef.current) {
            wl.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [effectiveServers, selectedServer]);

  const startStudioBroadcast = async () => {
    if (startingStudio || isStreamingStudio) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      showToast('err', 'المتصفح الحالي لا يدعم الوصول إلى الكاميرا أو الشاشة (تأكد من فتح الموقع عبر HTTPS)');
      return;
    }

    stoppingStudioRef.current = false;
    setStartingStudio(true);
    try {
      const height = studioQuality === '720p' ? 720 : 480;
      const width = studioQuality === '720p' ? 1280 : 854;

      // CRITICAL for mobile Safari/Chrome: request camera/screen synchronously BEFORE any async fetch()
      let stream: MediaStream;
      if (captureMode === 'screen') {
        if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          showToast('err', 'مشاركة الشاشة غير مدعومة على متصفح هذا الهاتف — استخدم وضع الكاميرا المباشرة');
          setStartingStudio(false);
          return;
        }
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } },
          audio: true
        });
        if (displayStream.getAudioTracks().length === 0) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStream.getAudioTracks().forEach(t => displayStream.addTrack(t));
          } catch {}
        }
        stream = displayStream;
      } else {
        stream = await acquireCameraStream(width, height);
      }

      const hasAudioTrack = stream.getAudioTracks().length > 0;
      hasAudioTrackRef.current = hasAudioTrack;
      stream.getAudioTracks().forEach(t => {
        t.enabled = !micMuted;
      });

      mediaStreamRef.current = stream;
      if (studioVideoRef.current) {
        studioVideoRef.current.srcObject = stream;
        studioVideoRef.current.play().catch(() => {});
      }

      // Now ensure an active server exists (creates one automatically if user jumped straight to camera)
      const targetSrv = await ensureActiveServer('بث الكاميرا المباشر');
      if (!targetSrv) {
        throw new Error('server_create_failed');
      }

      // Pick codec matching actual audio track presence
      const mimeCandidates = hasAudioTrack
        ? [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=h264,opus',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
          ]
        : [
            'video/webm;codecs=vp8',
            'video/webm;codecs=h264',
            'video/webm',
            'video/mp4'
          ];
      const chosenMime =
        mimeCandidates.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';
      const container: 'webm' | 'mp4' = chosenMime.includes('mp4') ? 'mp4' : 'webm';
      chosenMimeRef.current = chosenMime;
      chosenContainerRef.current = container;

      // Always start FFmpeg studio pipeline reliably via HTTP POST first (immune to WS proxy delays)
      const startRes = await fetch(`/api/live-servers/${targetSrv.id}/studio-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container,
          hasAudio: hasAudioTrack,
          fallbackServer: targetSrv
        })
      });
      const startData = await startRes.json().catch(() => null);
      if (!startRes.ok || !startData?.success) {
        throw new Error('studio_start_failed');
      }

      // Connect Socket.IO in parallel (polling -> websocket upgrade); HTTP chunk fallback works automatically if WS is pending/dropped
      const socket = io({
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500
      });
      socketRef.current = socket;

      socket.on('live-studio:need-restart', () => {
        if (isStreamingStudioRef.current && !stoppingStudioRef.current) {
          recoverStudioPipeline(targetSrv);
        }
      });
      socket.on('live-studio:ended', () => {
        if (isStreamingStudioRef.current && !stoppingStudioRef.current) {
          recoverStudioPipeline(targetSrv);
        }
      });

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (document.visibilityState === 'visible') {
          setTimeout(() => {
            if (!stoppingStudioRef.current && mediaStreamRef.current?.getVideoTracks().every(t => t.readyState === 'ended')) {
              if (document.visibilityState === 'visible') {
                stopStudioBroadcast(true);
              }
            }
          }, 500);
        }
      });

      studioServerIdRef.current = targetSrv.id;
      isStreamingStudioRef.current = true;
      setStudioServerId(targetSrv.id);
      setIsStreamingStudio(true);

      attachRecorderAndStreamChunks(stream, targetSrv);

      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl) {
          wakeLockRef.current = await wl.request('screen');
        }
      } catch {}

      const updatedStudioSrv: LiveServerItem = startData.server || {
        ...targetSrv,
        activeMode: 'studio',
        status: 'live',
        switchCount: (targetSrv.switchCount || 1) + 1
      };
      upsertBackupServer(updatedStudioSrv);
      setOptimisticServer(updatedStudioSrv);
      onRefresh();
      showToast(
        'ok',
        hasAudioTrack
          ? 'بدأ البث المباشر من الكاميرا على رابط السيرفر الآن!'
          : 'بدأ بث الكاميرا مباشرة (بدون مايكروفون) على رابط السيرفر الآن!'
      );
    } catch (err: unknown) {
      console.error('Studio start error:', err);
      await stopStudioBroadcast(false);
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        showToast('err', 'تم رفض إذن الكاميرا — فعّل صلاحية الكاميرا من إعدادات المتصفح أو افتح الموقع بمتصفح خارجي');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        showToast('err', 'لم يتم العثور على كاميرا متصلة في هذا الجهاز');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        showToast('err', 'الكاميرا مستخدمة من تطبيق آخر — أغلق التطبيقات الأخرى وحاول مرة أخرى');
      } else {
        showToast('err', 'تعذر بدء البث المباشر من الكاميرا. تأكد من صلاحية الوصول واتصال الشبكة.');
      }
    } finally {
      setStartingStudio(false);
    }
  };

  const stopStudioBroadcast = async (notifyRefresh = true) => {
    stoppingStudioRef.current = true;
    isStreamingStudioRef.current = false;
    const activeSrvId = studioServerIdRef.current || studioServerId;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.stop();
      } catch {}
    }
    recorderRef.current = null;
    chunkQueueRef.current = Promise.resolve();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (studioVideoRef.current) {
      studioVideoRef.current.srcObject = null;
    }

    if (socketRef.current) {
      if (activeSrvId && socketRef.current.connected) {
        socketRef.current.emit('live-studio:stop', { serverId: activeSrvId });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (activeSrvId) {
      fetch(`/api/live-servers/${activeSrvId}/studio-stop`, { method: 'POST' }).catch(() => {});
    }

    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    studioServerIdRef.current = null;
    setIsStreamingStudio(false);
    setStudioServerId(null);
    if (notifyRefresh) onRefresh();
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !next;
      });
    }
  };

  const nonBulkStreams = streams.filter(s => !s.isBulk);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            سيرفر البث المباشر
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            رابط بث ثابت بصيغة M3U8 مع تغيير فوري للمحتوى أو رفع فيديو من الهاتف أو بث الكاميرا مباشرة
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition whitespace-nowrap shrink-0 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>سيرفر بث جديد</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
            feedbackMsg.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Create Server Form */}
      {(showCreateForm || effectiveServers.length === 0) && (
        <form
          onSubmit={handleCreateServer}
          className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                إنشاء سيرفر بث مباشر حقيقي
              </h3>
              {effectiveServers.length === 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  أنشئ سيرفر باسم مخصص أو ابدأ مباشرة برفع فيديو من هاتفك أو فتح الكاميرا بالأسفل وسيتم إنشاء السيرفر تلقائياً
                </p>
              )}
            </div>
            {effectiveServers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                إغلاق
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                اسم السيرفر *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="مثال: السيرفر الرياضي الرئيسي"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                اسم القناة الافتتاحية (اختياري)
              </label>
              <input
                type="text"
                value={newInitialName}
                onChange={e => setNewInitialName(e.target.value)}
                placeholder="مثال: البث الرئيسي"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                رابط M3U8 أو فيديو مبدئي (اختياري)
              </label>
              <input
                type="text"
                inputMode="url"
                value={newInitialUrl}
                onChange={e => setNewInitialUrl(e.target.value)}
                placeholder="https://.../live.m3u8"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white dir-ltr text-left focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition whitespace-nowrap shrink-0"
            >
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              <span>توليد السيرفر ورابط M3U8</span>
            </button>
          </div>
        </form>
      )}

      {/* Server Switcher Tabs if multiple exist */}
      {effectiveServers.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {effectiveServers.map(srv => {
            const isSelected = srv.id === selectedServer?.id;
            return (
              <button
                key={srv.id}
                type="button"
                onClick={() => {
                  setSelectedId(srv.id);
                  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_SELECTED_ID_KEY, srv.id);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 border ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-[#0d121f] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                <span>{srv.title}</span>
                <span className="mx-1.5 opacity-50">·</span>
                <span className="font-mono tabular-nums text-[11px]">{srv.currentViewers || 0} مشاهد</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Output Server Endpoint & Real Status (when server exists) */}
      {selectedServer && (
        <section className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {selectedServer.title}
                </h3>
                <span
                  className={`text-xs font-extrabold ${
                    selectedServer.status === 'live'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {selectedServer.status === 'live' ? 'بث شغّال' : 'متوقف مؤقتاً'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap tabular-nums">
                <span>
                  المصدر الحالي:{' '}
                  {selectedServer.activeMode === 'studio'
                    ? 'استوديو الكاميرا/الشاشة'
                    : selectedServer.sources.find(x => x.id === selectedServer.activeSourceId)?.name || 'بدون مصدر'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  المشاهدين الآن:{' '}
                  <strong className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedServer.currentViewers || 0}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  الطلبات:{' '}
                  <strong className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedServer.viewsCount || 0}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowMonitor(!showMonitor)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap shrink-0 ${
                  showMonitor
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showMonitor ? 'إخفاء شاشة السيرفر' : 'معاينة بث السيرفر'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleServerStatus}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                  selectedServer.status === 'live'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {selectedServer.status === 'live' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{selectedServer.status === 'live' ? 'إيقاف البث' : 'تشغيل البث'}</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteServer}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 border border-slate-200 dark:border-slate-800 transition"
                title="حذف السيرفر"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fixed M3U8 Output URL */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 px-1.5">
              رابط السيرفر:
            </span>
            <span className="flex-1 min-w-0 truncate font-mono text-xs text-rose-600 dark:text-rose-400 font-bold dir-ltr text-left select-all">
              {serverM3u8Url}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(serverM3u8Url, 'srv-url')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition whitespace-nowrap shrink-0"
            >
              {copiedId === 'srv-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'srv-url' ? 'تم النسخ' : 'نسخ M3U8'}</span>
            </button>
          </div>

          {/* Live Monitor Video Preview */}
          {showMonitor && (
            <div className="pt-2">
              <div className="aspect-video w-full max-w-2xl mx-auto rounded-xl overflow-hidden bg-black border border-slate-800">
                <video
                  ref={monitorVideoRef}
                  autoPlay
                  controls
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Main 2-Column Workspace (Always Available for Direct Upload & Camera Start) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Column 1: Instant Live Source Switcher + Mobile Chunked Video Upload */}
        <section className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              تغيير محتوى السيرفر أو رفع فيديو من الهاتف
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              بدّل القناة أو ارفع فيديو من الهاتف ليعمل كبث مباشر 24/7 على نفس رابط M3U8
            </p>
          </div>

          {/* Instant Switch Form */}
          <form onSubmit={handleQuickSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                placeholder="اسم القناة / المحتوى..."
                className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {(['auto', 'hls', 'video'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setQuickKind(k)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                      quickKind === k
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    {k === 'auto' ? 'تلقائي' : k === 'hls' ? 'رابط مباشر' : 'فيديو 24/7'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                inputMode="url"
                required
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://.../stream.m3u8 أو ai.studio/..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white dir-ltr text-left focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={switching}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition whitespace-nowrap shrink-0"
              >
                {switching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                <span>تبديل البث الآن</span>
              </button>
            </div>
          </form>

          {/* Upload Video File for 24/7 Live Channel + Progress Bar + Quick Import */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black cursor-pointer transition whitespace-nowrap shrink-0 ${
                  uploadingVideo
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-wait'
                    : 'bg-slate-900 dark:bg-slate-800 hover:bg-rose-600 text-white'
                }`}
              >
                {uploadingVideo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>
                  {uploadingVideo
                    ? `جاري الرفع ${uploadProgress}%...`
                    : 'رفع فيديو من الهاتف وبثه مباشر 24/7'}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoFileUpload}
                  disabled={uploadingVideo}
                  className="hidden"
                />
              </label>

              {nonBulkStreams.length > 0 && (
                <select
                  defaultValue=""
                  onChange={e => {
                    const found = nonBulkStreams.find(x => x.id === e.target.value);
                    if (found) {
                      handleSwitchSource({
                        url: found.originalUrl,
                        name: found.title,
                        kind: 'hls'
                      });
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                >
                  <option value="">سحب قناة من روابطك...</option>
                  {nonBulkStreams.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {uploadingVideo ? (
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden border border-slate-200 dark:border-slate-800">
                  <div
                    className="h-full bg-rose-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  جاري الرفع المباشر إلى السيرفر: {uploadProgress}% ({uploadBytesLabel})
                </p>
              </div>
            ) : (
              freeDiskBytes > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  مساحة الرفع المتاحة على السيرفر: {formatBytesShort(freeDiskBytes)} (رفع مجزأ بدون استهلاك الرام)
                </p>
              )
            )}
          </div>

          {/* Saved Sources List */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>المصادر المحفوظة داخل السيرفر</span>
              <span className="font-mono tabular-nums">{selectedServer?.sources.length || 0}</span>
            </div>

            {!selectedServer || selectedServer.sources.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                لا توجد مصادر مضافة بعد. ضع رابط قناة أو ارفع فيديو من الهاتف أو ابدأ بث الكاميرا.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {selectedServer.sources.map(src => {
                  const isActive =
                    selectedServer.status === 'live' &&
                    selectedServer.activeMode === 'source' &&
                    selectedServer.activeSourceId === src.id;
                  return (
                    <div
                      key={src.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          {src.kind === 'video' ? (
                            <Film className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <Radio className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {src.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{src.kind === 'video' ? 'فيديو 24/7' : 'بث مباشر HLS'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate font-mono dir-ltr max-w-[180px]">{src.url}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive ? (
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-black whitespace-nowrap">
                            يبث الآن
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={switching}
                            onClick={() => handleSwitchSource({ sourceId: src.id })}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-rose-600 text-white text-[11px] font-bold transition whitespace-nowrap"
                          >
                            بث الآن
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(src.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                          title="حذف المصدر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Column 2: Live Studio Camera & Screen Broadcaster */}
        <section className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                استوديو البث المباشر من جهازك
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                بث الكاميرا أو شاشة الجهاز مباشرة على رابط السيرفر لحظياً
              </p>
            </div>

            {isStreamingStudio && (
              <div className="text-left font-mono tabular-nums text-xs">
                <span className="text-rose-500 font-black block">{formatTimer(studioElapsedSec)}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{studioKbps} Kbps</span>
              </div>
            )}
          </div>

          {/* Mode & Quality Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isStreamingStudio || startingStudio}
                onClick={() => setCaptureMode('camera')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  captureMode === 'camera'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>كاميرا + مايك</span>
              </button>
              <button
                type="button"
                disabled={isStreamingStudio || startingStudio}
                onClick={() => setCaptureMode('screen')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  captureMode === 'screen'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>مشاركة الشاشة</span>
              </button>
            </div>

            {captureMode === 'camera' && (
              <button
                type="button"
                disabled={isStreamingStudio || startingStudio}
                onClick={() => setFacingMode(facingMode === 'environment' ? 'user' : 'environment')}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap"
              >
                {facingMode === 'environment' ? 'الكاميرا الخلفية' : 'الكاميرا الأمامية'}
              </button>
            )}

            <select
              disabled={isStreamingStudio || startingStudio}
              value={studioQuality}
              onChange={e => setStudioQuality(e.target.value as '720p' | '480p')}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="720p">720p HD</option>
              <option value="480p">480p سريع</option>
            </select>

            <button
              type="button"
              onClick={toggleMic}
              className={`p-2 rounded-xl border transition ${
                micMuted
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
              }`}
              title={micMuted ? 'تشغيل المايك' : 'كتم المايك'}
            >
              {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {/* Studio Camera Preview Viewport */}
          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
            <video
              ref={studioVideoRef}
              muted
              playsInline
              autoPlay
              className="w-full h-full object-contain"
            />
            {!isStreamingStudio && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs gap-2 p-4 text-center pointer-events-none">
                <Video className="w-8 h-8 opacity-60" />
                <span>اضغط "فتح الكاميرا وبدء البث المباشر الآن" للبث على رابط السيرفر فوراً</span>
              </div>
            )}
          </div>

          {/* Start / Stop Studio Broadcast Button */}
          {isStreamingStudio ? (
            <button
              type="button"
              onClick={() => stopStudioBroadcast(true)}
              className="w-full py-3.5 px-5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-rose-600 text-white text-xs sm:text-sm font-black transition flex items-center justify-center gap-2"
            >
              <Pause className="w-4 h-4" />
              <span>إيقاف بث الاستوديو</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={startingStudio}
              onClick={startStudioBroadcast}
              className="w-full py-3.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs sm:text-sm font-black transition flex items-center justify-center gap-2"
            >
              {startingStudio ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              <span>{startingStudio ? 'جاري تشغيل الكاميرا والربط بالسيرفر...' : 'فتح الكاميرا وبدء البث المباشر الآن'}</span>
            </button>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            تنبيه للهواتف: لإبقاء الكاميرا تبث بلا توقف، أبقِ هذه الصفحة مفتوحة (أو استخدم تقسيم الشاشة) وشاهد البث من زر "معاينة بث السيرفر" أو افتح رابط M3U8 من جهاز/مشغل آخر.
          </p>
        </section>
      </div>
    </div>
  );
};

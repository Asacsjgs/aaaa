import React, { useState, useEffect } from 'react';
import { StreamItem, VirtualXtreamAccount, SecurityPolicyConfig, TrafficTimelineBucket, LiveServerItem } from './types/stream';
import { getCleanBaseUrl } from './utils/urlHelper';
import { Header } from './components/Header';
import { Navbar, NavTabType } from './components/Navbar';
import { StreamCard } from './components/StreamCard';
import { LivePlayer } from './components/LivePlayer';
import { VirtualXtreamShield } from './components/VirtualXtreamShield';
import { IntelligenceRadar, IntelligenceConnection, IntelligenceSecuritySummary, IpCorrelationEntry } from './components/IntelligenceRadar';
import { BulkGenerator } from './components/BulkGenerator';
import { LiveServerStudio } from './components/LiveServerStudio';
import { Radio, Sparkles, CheckCircle2, Play, Pause, RefreshCw, Tv, X, ShieldCheck, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sr_active_tab');
      if (saved === 'home' || saved === 'generator' || saved === 'live_server' || saved === 'bulk_generator' || saved === 'virtual_xtream' || saved === 'intelligence') {
        return saved;
      }
    }
    return 'home';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sr_active_tab', activeTab);
    }
  }, [activeTab]);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('site_theme');
      if (saved !== null) return saved === 'dark';
    }
    return true;
  });

  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [liveServers, setLiveServers] = useState<LiveServerItem[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualXtreamAccount[]>([]);
  const [radarConnections, setRadarConnections] = useState<IntelligenceConnection[]>([]);
  const [radarIpCorrelations, setRadarIpCorrelations] = useState<IpCorrelationEntry[]>([]);
  const [radarSecuritySummary, setRadarSecuritySummary] = useState<IntelligenceSecuritySummary | null>(null);
  const [radarTrafficTimeline, setRadarTrafficTimeline] = useState<TrafficTimelineBucket[]>([]);
  const [radarSecurityPolicy, setRadarSecurityPolicy] = useState<SecurityPolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverBaseUrl, setServerBaseUrl] = useState<string>('');
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [deviceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sr_device_id');
      if (saved) return saved;
      const newId = `dev_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('sr_device_id', newId);
      return newId;
    }
    return '';
  });

  // Generator Form State
  const [title, setTitle] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [watermarkText, setWatermarkText] = useState('© جميع الحقوق محفوظة');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [pauseNoticeMessage, setPauseNoticeMessage] = useState('البث متوقف مؤقتاً بواسطة صاحب الرابط.');
  const [customPosterUrl, setCustomPosterUrl] = useState('/uploads/preset_poster_1.jpg');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Verification State
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  // Preview Modal
  const [previewStream, setPreviewStream] = useState<StreamItem | null>(null);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);

  // Standalone Player Check
  const [standaloneSlug, setStandaloneSlug] = useState<string | null>(null);

  // Stealth White Screen Unlock State
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === 'true' || params.get('key') === '1234' || params.get('unlock') === '1' || params.get('secret') === 'admin') {
        localStorage.setItem('sr_admin_unlocked', 'true');
        return true;
      }
      return localStorage.getItem('sr_admin_unlocked') === 'true';
    }
    return false;
  });

  const [secretPinModal, setSecretPinModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const playerParam = params.get('player') || params.get('v');
      if (playerParam) setStandaloneSlug(playerParam);
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark', 'dark-mode');
      document.body.classList.remove('light-mode');
      document.body.style.backgroundColor = '#080c14';
      localStorage.setItem('site_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark', 'dark-mode');
      document.body.classList.add('light-mode');
      document.body.style.backgroundColor = '#f8fafc';
      localStorage.setItem('site_theme', 'light');
    }
  }, [darkMode]);

  const handleWhiteScreenClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setSecretPinModal(true);
        return 0;
      }
      return next;
    });
  };

  const handleUnlockPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinCode.trim() === '1234' || pinCode.trim() === 'admin' || pinCode.trim() === '1122') {
      localStorage.setItem('sr_admin_unlocked', 'true');
      setIsAdminUnlocked(true);
      setSecretPinModal(false);
      setPinError(false);
      setPinCode('');
    } else {
      setPinError(true);
    }
  };

  const handleLockAdminPanel = () => {
    localStorage.removeItem('sr_admin_unlocked');
    setIsAdminUnlocked(false);
  };

  // Fetch Streams, Virtual Xtream Accounts & Radar Telemetry
  const fetchAllData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      
      if (isInitial) {
        const configRes = await fetch('/api/config').catch(() => null);
        if (configRes && configRes.ok) {
          const configData = await configRes.json();
          if (configData.baseUrl) setServerBaseUrl(configData.baseUrl);
          if (configData.googleMapsApiKey) {
            setMapsApiKey(prev => prev || configData.googleMapsApiKey);
          }
        }
      }

      const streamsRes = await fetch('/api/streams').catch(() => null);
      if (streamsRes && streamsRes.ok) {
        const streamsData = await streamsRes.json().catch(() => null);
        if (streamsData && streamsData.success && Array.isArray(streamsData.streams)) {
          setStreams(streamsData.streams);
        }
      }

      const vxRes = await fetch('/api/virtual-xtream').catch(() => null);
      if (vxRes && vxRes.ok) {
        const vxData = await vxRes.json().catch(() => null);
        if (vxData && vxData.success && Array.isArray(vxData.accounts)) {
          setVirtualAccounts(vxData.accounts);
        }
      }

      const srvRes = await fetch('/api/live-servers', { cache: 'no-store' }).catch(() => null);
      if (srvRes && srvRes.ok) {
        const srvData = await srvRes.json().catch(() => null);
        if (srvData && srvData.success && Array.isArray(srvData.servers)) {
          if (srvData.servers.length > 0) {
            setLiveServers(srvData.servers);
            try {
              localStorage.setItem('sr_live_servers_backup', JSON.stringify(srvData.servers));
            } catch {}
          } else {
            let backedUp: LiveServerItem[] = [];
            try {
              const raw = localStorage.getItem('sr_live_servers_backup');
              const parsed = raw ? JSON.parse(raw) : [];
              if (Array.isArray(parsed)) {
                backedUp = parsed
                  .filter((srv: any) => srv && srv.id !== 'lsrv_1794928526200_iry2' && srv.token !== 'srv15ca2')
                  .map((srv: any) => ({
                    ...srv,
                    sources: Array.isArray(srv.sources)
                      ? srv.sources.filter((src: any) => {
                          const n = String(src?.name || '').toLowerCase();
                          const u = String(src?.url || '').toLowerCase();
                          return !n.startsWith('test_') && !u.includes('://localhost:') && !u.includes('://127.0.0.1:');
                        })
                      : []
                  }));
                localStorage.setItem('sr_live_servers_backup', JSON.stringify(backedUp));
              }
            } catch {}

            if (isInitial && backedUp.length > 0) {
              const restRes = await fetch('/api/live-servers/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ servers: backedUp })
              }).catch(() => null);
              const restData = restRes && restRes.ok ? await restRes.json().catch(() => null) : null;
              if (restData && restData.success && Array.isArray(restData.servers) && restData.servers.length > 0) {
                setLiveServers(restData.servers);
              } else {
                setLiveServers([]);
              }
            } else {
              setLiveServers([]);
            }
          }
        }
      }

      const radarRes = await fetch('/api/intelligence-radar').catch(() => null);
      if (radarRes && radarRes.ok) {
        const radarData = await radarRes.json().catch(() => null);
        if (radarData && radarData.success && Array.isArray(radarData.connections)) {
          setRadarConnections(radarData.connections);
          if (Array.isArray(radarData.ipCorrelations)) {
            setRadarIpCorrelations(radarData.ipCorrelations);
          }
          if (radarData.securitySummary) {
            setRadarSecuritySummary(radarData.securitySummary);
          }
          if (Array.isArray(radarData.trafficTimeline)) {
            setRadarTrafficTimeline(radarData.trafficTimeline);
          }
          if (radarData.securityPolicy) {
            setRadarSecurityPolicy(radarData.securityPolicy);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleBlockRadarDevice = async (
    sourceType: 'stream' | 'virtual_xtream',
    sourceId: string,
    pattern: string,
    userAgent?: string,
    appName?: string,
    appId?: string,
    ipAddress?: string
  ) => {
    try {
      await fetch('/api/intelligence-radar/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceId, pattern, userAgent, appName, appId, ipAddress })
      });
      fetchAllData(false);
    } catch (err) {
      console.error('Failed to block device on radar', err);
    }
  };

  const handleUnblockRadarDevice = async (
    sourceType: 'stream' | 'virtual_xtream',
    sourceId: string,
    pattern: string
  ) => {
    try {
      await fetch('/api/intelligence-radar/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceId, pattern })
      });
      fetchAllData(false);
    } catch (err) {
      console.error('Failed to unblock device on radar', err);
    }
  };



  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    fetchAllData(true);

    const interval = setInterval(() => {
      fetchAllData(false);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  // Handle Local Image Upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      console.error('Failed to upload image:', err);
      setUploadingImage(false);
    }
  };




  const cleanBase = getCleanBaseUrl(serverBaseUrl);

  // Quick Verify URL
  const handleVerify = async () => {
    if (!originalUrl.trim()) return;
    setVerifying(true);
    setVerifyMsg(null);

    try {
      const res = await fetch('/api/verify-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: originalUrl })
      });
      const data = await res.json();
      if (data.success) {
        setVerifyMsg(data.message || '✅ تم التحقق من الرابط وسيعمل عبر البروكسي.');
        if (data.normalizedUrl) setOriginalUrl(data.normalizedUrl);
      }
    } catch {
      setVerifyMsg('✅ تم قبول الرابط وسيتم تمريره عبر السيرفر.');
    } finally {
      setVerifying(false);
    }
  };

  // Generate Stream Link
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !originalUrl.trim()) return;

    try {
      const payload = {
        title: title.trim(),
        originalUrl: originalUrl.trim(),
        slug: slug.trim(),
        watermarkText: watermarkText.trim() || '© جميع الحقوق محفوظة',
        status,
        pauseNoticeMessage: pauseNoticeMessage.trim(),
        customPosterUrl: customPosterUrl.trim() || '/uploads/preset_poster_1.jpg',
        isXtream: false
      };

      if (editingStreamId) {
        const res = await fetch(`/api/streams/${editingStreamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          setStreams(prev => prev.map(s => (s.id === editingStreamId ? data.stream : s)));
          setEditingStreamId(null);
          setActiveTab('home');
        }
      } else {
        const res = await fetch('/api/streams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          setStreams(prev => [data.stream, ...prev]);
          setActiveTab('home');
        }
      }

      // Reset form
      setTitle('');
      setOriginalUrl('');
      setSlug('');
      setWatermarkText('© جميع الحقوق محفوظة');
      setCustomPosterUrl('/uploads/preset_poster_1.jpg');
      setVerifyMsg(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Stream Status
  const handleToggleStatus = async (id: string) => {
    setStreams(prev =>
      prev.map(s => (s.id === id ? { ...s, status: s.status === 'active' ? 'paused' : 'active' } : s))
    );

    if (previewStream && previewStream.id === id) {
      setPreviewStream(prev => prev ? { ...prev, status: prev.status === 'active' ? 'paused' : 'active' } : null);
    }

    try {
      const res = await fetch(`/api/streams/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success && data.stream) {
        setStreams(prev => prev.map(s => (s.id === id ? data.stream : s)));
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  // Block App for stream
  const handleBlockApp = async (streamId: string, pattern: string, userAgent?: string, appName?: string, appId?: string, ipAddress?: string) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/block-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, userAgent, appName, appId, ipAddress })
      });
      const data = await res.json();
      if (data.success && data.stream) {
        setStreams(prev => prev.map(s => (s.id === streamId ? data.stream : s)));
      }
    } catch (err) {
      console.error('Failed to block app', err);
    }
  };

  // Toggle Master Block All External Apps
  const handleToggleBlockAll = async (streamId: string) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/toggle-block-all`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success && data.stream) {
        setStreams(prev => prev.map(s => (s.id === streamId ? data.stream : s)));
      }
    } catch (err) {
      console.error('Failed to toggle block all apps', err);
    }
  };

  // Unblock App for stream
  const handleUnblockApp = async (streamId: string, pattern: string) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/unblock-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern })
      });
      const data = await res.json();
      if (data.success && data.stream) {
        setStreams(prev => prev.map(s => (s.id === streamId ? data.stream : s)));
      }
    } catch (err) {
      console.error('Failed to unblock app', err);
    }
  };

  // Direct Update Stream Poster Image
  const handleUpdatePoster = async (streamId: string, posterUrl: string) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/poster`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPosterUrl: posterUrl })
      });
      const data = await res.json();
      if (data.success && data.stream) {
        setStreams(prev => prev.map(s => (s.id === streamId ? data.stream : s)));
        if (previewStream && previewStream.id === streamId) {
          setPreviewStream(data.stream);
        }
      }
    } catch (err) {
      console.error('Failed to update poster', err);
    }
  };

  // Delete Single Stream
  const handleDeleteStream = async (id: string) => {
    if (!confirm('هل أنت تأكد من رغبتك في حذف هذا الرابط الحقوقي؟')) return;

    setStreams(prev => prev.filter(s => s.id !== id));
    if (previewStream?.id === id) setPreviewStream(null);

    try {
      await fetch(`/api/streams/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
  };

  // Clear All Streams
  const handleClearAll = async () => {
    if (!confirm('هل أنت تأكد من رغبتك في حذف جميع الروابط الحالية؟')) return;

    setStreams([]);
    setPreviewStream(null);

    try {
      await fetch('/api/streams-all', { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk Handlers
  const [lastBulkBatch, setLastBulkBatch] = useState<StreamItem[]>([]);
  const [showBulkSuccess, setShowBulkSuccess] = useState(false);

  const handleBulkProcess = async (lines: string[]) => {
    try {
      const res = await fetch('/api/streams/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines })
      });
      const data = await res.json();
      if (data.success && data.streams) {
        setStreams(prev => [...data.streams, ...prev]);
        setLastBulkBatch(data.streams);
        setShowBulkSuccess(true);
        // Do not switch to 'home' automatically, stay in bulk_generator to show success
      }
    } catch (err) {
      console.error('Bulk process failed:', err);
    }
  };

  const handleBulkStatus = async (ids: string[], status: 'active' | 'paused') => {
    try {
      await fetch('/api/streams/bulk-toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status })
      });
      setStreams(prev => prev.map(s => ids.includes(s.id) ? { ...s, status } : s));
    } catch (err) {
      console.error('Bulk status update failed:', err);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!confirm(`هل أنت متأكد من حذف ${ids.length} رابط؟`)) return;
    try {
      await fetch('/api/streams/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      setStreams(prev => prev.filter(s => !ids.includes(s.id)));
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  // Import Public Xtream Account into Virtual Xtream Shield
  const handleImportXtreamToVirtual = async (name: string, host: string, user: string, pass: string) => {
    try {
      const randomSuffix = Math.floor(Math.random() * 899 + 100);
      const res = await fetch('/api/virtual-xtream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `استيراد: ${name}`,
          targetHost: host,
          targetUsername: user,
          targetPassword: pass,
          virtualUsername: `v_${user.substring(0, 6)}_${randomSuffix}`,
          virtualPassword: `p_${Math.floor(Math.random() * 89999 + 10000)}`,
          maxConnections: 5,
          watermarkText: '© جميع الحقوق محفوظة'
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData(false);
        setActiveTab('virtual_xtream');
      }
    } catch (err) {
      console.error('Failed to import Xtream account:', err);
    }
  };

  const activeCount = streams.filter(s => s.status === 'active' && !s.isBulk).length;
  const totalDisplayCount = streams.filter(s => !s.isBulk).length;

  // Render Blank White Screen for ordinary visitors
  if (!isAdminUnlocked && !standaloneSlug) {
    return (
      <div
        onClick={handleWhiteScreenClick}
        className="fixed inset-0 w-full h-full bg-white z-[999999] cursor-default flex items-center justify-center select-none"
        style={{ backgroundColor: '#ffffff' }}
      >
        {secretPinModal && (
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 p-7 rounded-3xl shadow-2xl w-full max-w-sm text-center text-slate-100 space-y-4 dir-rtl"
          >
            <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">فتح لوحة التحكم السرية للموقع</h3>
              <p className="text-xs text-slate-400 mt-1">أدخل الكود السري الخاص بك لفتح لوحة التحكم</p>
            </div>

            <form onSubmit={handleUnlockPin} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={pinCode}
                onChange={e => {
                  setPinCode(e.target.value);
                  setPinError(false);
                }}
                placeholder="الكود السري (الافتراضي: 1234)"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-center font-mono text-xl text-amber-300 focus:outline-none focus:border-amber-500"
              />
              {pinError && (
                <p className="text-xs text-rose-400 font-bold">الكود السري غير صحيح!</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition shadow-lg"
                >
                  دخول اللوحة
                </button>
                <button
                  type="button"
                  onClick={() => setSecretPinModal(false)}
                  className="px-4 py-3 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-700"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // Render Standalone Player Mode
  if (standaloneSlug) {
    const matchedStream = streams.find(
      s => s.streamToken === standaloneSlug || s.slug === standaloneSlug || s.id === standaloneSlug
    );
    return (
      <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-8 dir-rtl transition-colors">
        {loading && !matchedStream ? (
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <RefreshCw className="w-7 h-7 animate-spin text-rose-500" />
            <span className="text-sm font-bold">جاري تجهيز البث...</span>
          </div>
        ) : matchedStream ? (
          <div className="w-full max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Tv className="w-5 h-5 text-rose-500" />
                <span className="font-black text-white text-base sm:text-lg">
                  مشغل البث المباشر
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-xs sm:text-sm text-slate-400 truncate max-w-xs">{matchedStream.title}</span>
              </div>
              {isAdminUnlocked && (
                <a href="/" className="text-xs font-bold text-rose-400 hover:underline whitespace-nowrap shrink-0">
                  ← لوحة التحكم
                </a>
              )}
            </div>
            <LivePlayer
              stream={matchedStream}
              onToggleStatus={isAdminUnlocked ? handleToggleStatus : undefined}
              standalone={true}
              deviceId={deviceId}
            />
          </div>
        ) : (
          <div className="text-center space-y-3 p-8 bg-[#0b101d] border border-slate-800 rounded-3xl shadow-xl">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <h2 className="text-lg font-bold">الرابط غير موجود أو تم حذفه</h2>
            {isAdminUnlocked && (
              <a href="/" className="inline-block text-xs font-bold text-white bg-rose-600 px-5 py-2.5 rounded-xl shadow-lg">
                الانتقال للوحة التحكم
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col pb-20 dir-rtl selection:bg-rose-600 selection:text-white transition-colors">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm flex items-center justify-center gap-3">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
          <button
            type="button"
            onClick={() => setMapsQuotaExceeded(false)}
            className="text-amber-800 hover:text-amber-950 font-bold text-xs px-2 py-0.5 rounded border border-amber-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Top Header */}
      <Header
        onOpenCreate={() => {
          setActiveTab('generator');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onClearAll={handleClearAll}
        activeCount={activeCount}
        totalCount={totalDisplayCount}
        serverBaseUrl={cleanBase}
        onLockAdmin={handleLockAdminPanel}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />

      {/* Main Container */}
      <main className={`flex-1 ${activeTab === 'live_server' ? 'max-w-5xl' : 'max-w-4xl'} w-full mx-auto px-4 sm:px-6 py-6 space-y-8`}>
        
        {/* TAB 1: HOME (Grid of Stream Channels) */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-rose-500" />
                <span className="text-xs font-bold">جاري تحميل البث...</span>
              </div>
            ) : streams.filter(s => !s.isBulk).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {streams.filter(s => !s.isBulk).map(stream => (
                  <StreamCard
                    key={stream.id}
                    stream={stream}
                    serverBaseUrl={cleanBase}
                    onToggleStatus={handleToggleStatus}
                    onPreview={(s) => setPreviewStream(s)}
                    onEdit={(s) => {
                      setTitle(s.title);
                      setOriginalUrl(s.originalUrl);
                      setSlug(s.slug || '');
                      setWatermarkText(s.watermarkText || '© جميع الحقوق محفوظة');
                      setStatus(s.status);
                      setPauseNoticeMessage(s.pauseNoticeMessage || '');
                      setCustomPosterUrl(s.customPosterUrl || '');
                      setEditingStreamId(s.id);
                      setActiveTab('generator');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onDelete={handleDeleteStream}
                    onBlockApp={handleBlockApp}
                    onUnblockApp={handleUnblockApp}
                    onToggleBlockAll={handleToggleBlockAll}
                    onUpdatePoster={handleUpdatePoster}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white dark:bg-[#0d121f] rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 shadow-sm">
                <Tv className="w-12 h-12 text-slate-400 mx-auto opacity-50" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">لا توجد روابط حية حالياً</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  انقر على تبويب "المولد" بالأسفل لإنشاء أول رابط بث حقوقي خاص بك!
                </p>
                <button
                  onClick={() => setActiveTab('generator')}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition"
                >
                  الانتقال للمولد وإنشاء بث
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GENERATOR (Link Creation Form) */}
        {activeTab === 'generator' && (
          <div className="rounded-3xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center gap-3.5 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {editingStreamId ? 'تعديل بيانات البث الحقوقي' : 'توليد رابط بث مباشر جديد'}
                  </h2>
                  <button 
                    onClick={() => setActiveTab('bulk_generator')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black border border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition"
                  >
                    التوليد الجماعي
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  ضع أي رابط بث مباشر أصلي وسيقوم النظام بتحويله لـ رابط خاص بك مع خيار الإيقاف والتشغيل.
                </p>
              </div>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5">
              {/* Stream Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  عنوان البث <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان البث المباشر..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-rose-500 transition"
                />
              </div>

              {/* HLS Direct Stream URL */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    رابط البث الأصلي (HLS .m3u8 / YouTube) <span className="text-rose-500">*</span>
                  </label>
                  {originalUrl && (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={verifying}
                      className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                    >
                      {verifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>فحص الرابط</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="url"
                    required
                    value={originalUrl}
                    onChange={(e) => setOriginalUrl(e.target.value)}
                    placeholder="https://server.com/live/stream.m3u8"
                    className="w-full px-4 py-3 pl-10 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs dir-ltr text-left focus:outline-none focus:border-rose-500 transition"
                  />
                  <Radio className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>

                {verifyMsg && (
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-2xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{verifyMsg}</span>
                  </p>
                )}
              </div>

              {/* Rights Watermark Text */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  نص العلامة المائية فوق الفيديو (Watermark Text)
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="© جميع الحقوق محفوظة"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Custom Slug Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  🔗 اسم الرابط المخصص (Custom Slug)
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="اسم مخصص للرابط (اختياري)..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 font-mono text-xs focus:outline-none focus:border-rose-500 dir-ltr text-left"
                />
              </div>

              {/* Pause Image Selection */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  🖼️ اختيار صورة شاشة الإيقاف المخصصة:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCustomPosterUrl('/uploads/preset_poster_1.jpg')}
                    className={`p-2 rounded-2xl border text-right transition flex items-center gap-2 ${
                      customPosterUrl.includes('preset_poster_1')
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <img src="/uploads/preset_poster_1.jpg" alt="1" className="w-12 h-9 rounded-lg object-cover" />
                    <span className="text-xs font-bold">صورة 1</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomPosterUrl('/uploads/preset_poster_2.jpg')}
                    className={`p-2 rounded-2xl border text-right transition flex items-center gap-2 ${
                      customPosterUrl.includes('preset_poster_2')
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <img src="/uploads/preset_poster_2.jpg" alt="2" className="w-12 h-9 rounded-lg object-cover" />
                    <span className="text-xs font-bold">صورة 2</span>
                  </button>
                </div>

                <label className="cursor-pointer block text-center py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition">
                  <span>{uploadingImage ? 'جاري التحميل...' : '📷 رفع صورة مخصصة من الهاتف'}</span>
                  <input type="file" accept="image/*" onChange={handleImageFileChange} className="hidden" disabled={uploadingImage} />
                </label>
              </div>



              {/* Status Selector */}
              <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                    status === 'active' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>شغّال (Active)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('paused')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                    status === 'paused' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500'
                  }`}
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>متوقف (Paused)</span>
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm shadow-xl shadow-rose-600/30 transition flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{editingStreamId ? 'حفظ التعديلات' : '⚡ توليد رابط البث الآن'}</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB: BULK GENERATOR */}
        {activeTab === 'bulk_generator' && (
          <BulkGenerator
            streams={streams.filter(s => s.isBulk)}
            serverBaseUrl={cleanBase}
            onProcess={handleBulkProcess}
            onBulkStatus={handleBulkStatus}
            onBulkDelete={handleBulkDelete}
            lastBatch={lastBulkBatch}
            showSuccess={showBulkSuccess}
            onCloseSuccess={() => setShowBulkSuccess(false)}
          />
        )}

        {/* TAB 3: VIRTUAL XTREAM SHIELD */}
        {activeTab === 'virtual_xtream' && (
          <VirtualXtreamShield
            accounts={virtualAccounts}
            serverBaseUrl={cleanBase}
            onRefresh={() => fetchAllData(false)}
          />
        )}

        {/* TAB: LIVE STREAM SERVER (kept mounted so active camera stream & uploads survive tab switches) */}
        <div className={activeTab === 'live_server' ? 'block' : 'hidden'}>
          <LiveServerStudio
            servers={liveServers}
            streams={streams}
            serverBaseUrl={cleanBase}
            onRefresh={() => fetchAllData(false)}
          />
        </div>

        {/* TAB 4: INTELLIGENCE RADAR */}
        {activeTab === 'intelligence' && (
          <IntelligenceRadar
            connections={radarConnections}
            ipCorrelations={radarIpCorrelations}
            securitySummary={radarSecuritySummary}
            trafficTimeline={radarTrafficTimeline}
            securityPolicy={radarSecurityPolicy}
            mapsApiKey={mapsApiKey}
            totalStreamsCount={streams.length}
            totalVirtualCount={virtualAccounts.length}
            onBlockDevice={handleBlockRadarDevice}
            onUnblockDevice={handleUnblockRadarDevice}
            onRefresh={() => fetchAllData(false)}
          />
        )}

        {/* Live Player Modal */}
        {previewStream && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div className="relative w-full max-w-4xl bg-white dark:bg-[#0b101d] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-4">
              <div className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Tv className="w-5 h-5 text-rose-600 dark:text-rose-500" />
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">معاينة البث المباشر</h3>
                </div>
                <button
                  onClick={() => setPreviewStream(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6">
                <LivePlayer
                  stream={previewStream}
                  onToggleStatus={handleToggleStatus}
                  deviceId={deviceId}
                />
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        streamCount={totalDisplayCount}
        virtualCount={virtualAccounts.length}
        radarCount={radarConnections.length}
        liveServerCount={liveServers.length}
      />

    </div>
  );
}

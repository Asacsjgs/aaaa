import React, { useState, useEffect } from 'react';
import { VirtualXtreamAccount } from '../types/stream';
import { ShieldCheck, Copy, Check, Lock, Power, Eye, EyeOff, Trash2, Smartphone, AlertTriangle, RefreshCw, Upload, Image, Plus, Server, Activity, Cpu, Layers } from 'lucide-react';

interface Props {
  accounts: VirtualXtreamAccount[];
  serverBaseUrl: string;
  onRefresh: () => void;
}

export function VirtualXtreamShield({ accounts, serverBaseUrl, onRefresh }: Props) {
  const [title, setTitle] = useState('');
  const [realHost, setRealHost] = useState('');
  const [realUser, setRealUser] = useState('');
  const [realPass, setRealPass] = useState('');
  const [customVirtualHost, setCustomVirtualHost] = useState('');
  const [customPosterUrl, setCustomPosterUrl] = useState('/uploads/preset_poster_1.jpg');
  const [showRealPass, setShowRealPass] = useState<Record<string, boolean>>({});
  const [editingHostMap, setEditingHostMap] = useState<Record<string, string>>({});
  const [editingTitleMap, setEditingTitleMap] = useState<Record<string, string>>({});
  
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proxyStats, setProxyStats] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>({ blockedIps: [], logs: [], totalBlockedAttacks: 0 });
  const [inputBlockIp, setInputBlockIp] = useState('');
  const [inputBlockReason, setInputBlockReason] = useState('');
  const [showSecurityTab, setShowSecurityTab] = useState(false);

  const fetchSecurity = async () => {
    try {
      const res = await fetch('/api/security/firewall');
      const data = await res.json();
      if (data.success) {
        setSecurityData(data);
      }
    } catch {}
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/proxy-stats');
        const data = await res.json();
        if (data.success) {
          setProxyStats(data.metrics);
        }
      } catch {}
    };
    fetchStats();
    fetchSecurity();
    const interval = setInterval(() => {
      fetchStats();
      fetchSecurity();
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleManualBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputBlockIp.trim()) return;
    try {
      await fetch('/api/security/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: inputBlockIp.trim(), reason: inputBlockReason.trim() || 'حظر يدوي بواسطة مدير اللوحة' })
      });
      setInputBlockIp('');
      setInputBlockReason('');
      fetchSecurity();
    } catch {}
  };

  const handleUnblockIp = async (ip: string) => {
    try {
      await fetch('/api/security/unblock-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      fetchSecurity();
    } catch {}
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/security/clear-logs', { method: 'DELETE' });
      fetchSecurity();
    } catch {}
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!realHost.trim() || !realUser.trim() || !realPass.trim()) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة للسيرفر الأصلي');
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/virtual-xtream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'سيرفر اكستريم وهمي محمي',
          realHost: realHost.trim(),
          realUser: realUser.trim(),
          realPass: realPass.trim(),
          customVirtualHost: customVirtualHost.trim(),
          customPosterUrl: customPosterUrl.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setTitle('');
        setRealHost('');
        setRealUser('');
        setRealPass('');
        setCustomVirtualHost('');
        onRefresh();
      } else {
        setErrorMsg(data.error || 'فشل إنشاء الحساب الوهمي');
      }
    } catch {
      setErrorMsg('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTitle = async (id: string, newTitle: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCustomHost = async (id: string, newHost: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/host`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customVirtualHost: newHost })
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/toggle`, { method: 'PATCH' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBlockAll = async (id: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/toggle-block-all`, { method: 'PATCH' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleBlockApp = async (id: string, pattern: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/block-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern })
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت تأكد من رغبتك في حذف هذا السيرفر الوهمي النهائي؟')) return;
    try {
      await fetch(`/api/virtual-xtream/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePoster = async (id: string, posterUrl: string) => {
    try {
      await fetch(`/api/virtual-xtream/${id}/poster`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPosterUrl: posterUrl })
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetAccId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
        const finalUrl = data.success && data.imageUrl ? data.imageUrl : base64Data;

        if (targetAccId) {
          handleUpdatePoster(targetAccId, finalUrl);
        } else {
          setCustomPosterUrl(finalUrl);
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8 dir-rtl">
      
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-amber-200 flex items-center gap-2">
                <span>نظام حماية السيرفر الأصلي (اكستريم وهمي / بروكسي وسيط)</span>
                <span className="px-2.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 rounded-full font-mono">PRO</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
                يخفي بيانات سيرفرك الأصلي 100% ويولد لك بيانات دخول وهمية تابعة لموقعك حصراً. عند توقيف الخدمة، يتوقف البث وتظهر صورة حقوقك فوراً!
              </p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold transition shadow-sm shrink-0"
          >
            <RefreshCw className="w-4 h-4 text-amber-500" />
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* Account Generator Form */}
      <form onSubmit={handleCreate} className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">إضافة اشتراك اكستريم أصلي وحمايته</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">أدخل بيانات السيرفر الأصلي لربطه وإنشاء حساب وهمي محمي تابع لخادمك.</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 rounded-2xl text-rose-700 dark:text-rose-200 text-xs sm:text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              🏷️ اسم السيرفر الوهمي (Server Name)
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="مثال: سيرفر الاكستريم الملوك"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-amber-600 dark:text-amber-300 mb-2">
              رابط خادم الاكستريم الأصلي (Real Host) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={realHost}
              onChange={e => setRealHost(e.target.value)}
              placeholder="مثال: http://real-iptv-domain.com:8080"
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-mono dir-ltr text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-amber-600 dark:text-amber-300 mb-2">
              اسم المستخدم الأصلي (Real User) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={realUser}
              onChange={e => setRealUser(e.target.value)}
              placeholder="مثال: my_real_username"
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-mono dir-ltr text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-amber-600 dark:text-amber-300 mb-2">
              كلمة السر الأصلية (Real Password) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={realPass}
              onChange={e => setRealPass(e.target.value)}
              placeholder="مثال: my_real_password"
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-mono dir-ltr text-left"
            />
          </div>

          <div className="md:col-span-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 space-y-2">
            <label className="block text-xs font-bold text-amber-800 dark:text-amber-300">
              🌐 رابط/دومين الخادم الوهمي المخصص بالكامل (Custom Virtual Host URL)
            </label>
            <input
              type="text"
              value={customVirtualHost}
              onChange={e => setCustomVirtualHost(e.target.value)}
              placeholder="مثال: https://cdn-live.workers.dev أو vip-line-4k.net:8080 (اختياري)"
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-mono dir-ltr text-left"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl shadow-xl transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          <ShieldCheck className="w-5 h-5" />
          <span>{creating ? 'جاري حماية وتوليد السيرفر الوهمي...' : '⚡ توليد سيرفر اكستريم وهمي محمي فوراُ'}</span>
        </button>
      </form>

      {/* List of Created Virtual Xtream Accounts */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" />
            <span>السيرفرات الوهمية المحمية ({accounts.length})</span>
          </h3>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3 shadow-sm">
            <ShieldCheck className="w-12 h-12 text-slate-400 mx-auto" />
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold">لم تقم بإضافة أي سيرفر اكستريم وهمي حتى الآن.</p>
          </div>
        ) : (
          accounts.map(acc => {
            const isPaused = acc.status === 'paused';
            const showPass = showRealPass[acc.id] || false;
            const baseServer = serverBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
            const virtualHost = acc.customVirtualHost && acc.customVirtualHost.trim()
              ? (acc.customVirtualHost.trim().startsWith('http://') || acc.customVirtualHost.trim().startsWith('https://')
                  ? acc.customVirtualHost.trim()
                  : `https://${acc.customVirtualHost.trim()}`)
              : baseServer;
            const virtualM3u = `${virtualHost}/get.php?username=${acc.virtualUser}&password=${acc.virtualPass}&type=m3u_plus&output=ts`;

            return (
              <div key={acc.id} className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-lg space-y-6 relative overflow-hidden">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        السيرفر الأصلي مخفي ومحمي 100%
                      </span>
                      <h4 className="text-base font-black text-slate-900 dark:text-white">{acc.title}</h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(acc.id)}
                      className={`px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition shadow-md ${
                        isPaused
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 hover:bg-rose-500/30'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      {isPaused ? 'إلغاء التوقيف (تشغيل)' : 'زر القتل الفوري (توقيف)'}
                    </button>

                    <button
                      onClick={() => handleDelete(acc.id)}
                      className="p-2.5 text-slate-400 hover:text-rose-600 rounded-2xl transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-300">🏷️ اسم السيرفر (Name):</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingTitleMap[acc.id] !== undefined ? editingTitleMap[acc.id] : acc.title}
                          onChange={e => setEditingTitleMap(prev => ({ ...prev, [acc.id]: e.target.value }))}
                          className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = editingTitleMap[acc.id] !== undefined ? editingTitleMap[acc.id] : acc.title;
                            if (val.trim()) handleUpdateTitle(acc.id, val.trim());
                          }}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow shrink-0"
                        >
                          حفظ
                        </button>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">🌐 رابط الخادم (Host URL):</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingHostMap[acc.id] !== undefined ? editingHostMap[acc.id] : (acc.customVirtualHost || virtualHost)}
                          onChange={e => setEditingHostMap(prev => ({ ...prev, [acc.id]: e.target.value }))}
                          className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none dir-ltr text-left"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = editingHostMap[acc.id] !== undefined ? editingHostMap[acc.id] : (acc.customVirtualHost || virtualHost);
                            handleUpdateCustomHost(acc.id, val);
                          }}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow shrink-0"
                        >
                          حفظ
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 block">اسم المستخدم الوهمي:</span>
                      <span className="text-xs text-amber-600 dark:text-amber-300 font-mono font-bold dir-ltr block text-left">{acc.virtualUser}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 block">كلمة السر الوهمية:</span>
                      <span className="text-xs text-amber-600 dark:text-amber-300 font-mono font-bold dir-ltr block text-left">{acc.virtualPass}</span>
                    </div>
                  </div>

                  {/* Connected Phones & Devices Section */}
                  {acc.connectedApps && acc.connectedApps.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4 text-amber-500" />
                          <span>📱 الهواتف والأجهزة المتصلة بهذا الحساب ({acc.connectedApps.length}):</span>
                        </span>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {acc.connectedApps.map((app) => (
                          <div
                            key={app.id}
                            className={`p-2.5 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-2 transition ${
                              app.isBlocked
                                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 font-black text-amber-600 dark:text-amber-400">
                                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{app.deviceModel || 'هاتف ذكي (Smartphone)'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                <span>{app.appName}</span>
                                {app.ipAddress && <span>• IP: {app.ipAddress}</span>}
                              </div>
                            </div>

                            {app.isBlocked ? (
                              <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-bold text-[10px] flex items-center gap-1">
                                ⛔ محظور نهائياً
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBlockApp(acc.id, app.deviceModel || app.userAgent)}
                                className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 shadow transition shrink-0 active:scale-95"
                              >
                                <span>⛔ حظر هذا الهاتف نهائياً</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

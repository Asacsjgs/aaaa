import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radar,
  Ban,
  CheckCircle2,
  Globe,
  Smartphone,
  Wifi,
  RefreshCw,
  Activity,
  MapPin,
  Search,
  Crosshair,
  Terminal,
  ShieldAlert,
  Lock,
  ShieldCheck,
  Database,
  Navigation,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Bot,
  Tv,
  Server,
  Clock,
  Layers,
  ShieldBan,
  Unlock,
  AlertTriangle,
  Cpu,
  Monitor,
  Fingerprint,
  GitBranch,
  Gauge,
  History,
  Sliders,
  FileCode2,
  KeyRound,
  Radio,
  Shield
} from 'lucide-react';
import {
  ConnectedApp,
  BlockedIpRecord,
  SecurityEventLog,
  SecurityPolicyConfig,
  TrafficTimelineBucket,
  IntelligenceConnection
} from '../types/stream';
import { LiveGeoMap } from './LiveGeoMap';

export type { IntelligenceConnection };

export interface IpCorrelationEntry {
  ip: string;
  totalHits: number;
  deviceCount: number;
  sources: string[];
  apps: string[];
  fingerprintCount: number;
  isOnlineAny: boolean;
  isGlobalIpBlocked: boolean;
  country: string;
  city: string;
  isp: string;
  maxRiskScore: number;
}

export interface IntelligenceSecuritySummary {
  blockedIpsCount: number;
  securityLogsCount: number;
  blockedIps: BlockedIpRecord[];
  recentSecurityLogs: SecurityEventLog[];
}

interface IpLookupResult {
  success: boolean;
  ip: string;
  geo: {
    ip?: string;
    country?: string;
    countryCode?: string;
    region?: string;
    regionName?: string;
    city?: string;
    isp?: string;
    org?: string;
    lat?: number;
    lon?: number;
    zip?: string;
    timezone?: string;
    as?: string;
    mobile?: boolean;
    proxy?: boolean;
    hosting?: boolean;
  };
  isBlocked: boolean;
  blockedRecord: BlockedIpRecord | null;
  relatedLogs: SecurityEventLog[];
  seenInSources: {
    sourceType: 'stream' | 'virtual_xtream';
    sourceId: string;
    sourceTitle: string;
    appName: string;
    requestCount: number;
    lastActive: string;
  }[];
}

interface DnsIntelResult {
  success: boolean;
  mode: 'ip' | 'domain';
  target: string;
  ptrRecords?: string[];
  geo?: IpLookupResult['geo'];
  dns?: {
    aRecords: string[];
    aaaaRecords: string[];
    cnameRecords: string[];
    nsRecords: string[];
    mxRecords: string[];
    txtRecords: string[];
    primaryPtr: string[];
  };
  http?: {
    status: number | null;
    finalUrl: string | null;
    headers: Record<string, string>;
  } | null;
  tls?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    protocol?: string | null;
  } | null;
}

interface IntelligenceRadarProps {
  connections: IntelligenceConnection[];
  ipCorrelations?: IpCorrelationEntry[];
  securitySummary?: IntelligenceSecuritySummary | null;
  trafficTimeline?: TrafficTimelineBucket[];
  securityPolicy?: SecurityPolicyConfig | null;
  mapsApiKey?: string;
  totalStreamsCount: number;
  totalVirtualCount: number;
  onBlockDevice: (
    sourceType: 'stream' | 'virtual_xtream',
    sourceId: string,
    pattern: string,
    userAgent?: string,
    appName?: string,
    appId?: string,
    ipAddress?: string
  ) => void;
  onUnblockDevice: (
    sourceType: 'stream' | 'virtual_xtream',
    sourceId: string,
    pattern: string
  ) => void;
  onRefresh: () => void;
}

export const IntelligenceRadar: React.FC<IntelligenceRadarProps> = ({
  connections,
  ipCorrelations = [],
  securitySummary = null,
  trafficTimeline = [],
  securityPolicy = null,
  mapsApiKey = '',
  totalStreamsCount,
  totalVirtualCount,
  onBlockDevice,
  onUnblockDevice,
  onRefresh
}) => {
  const [subTab, setSubTab] = useState<'targets' | 'correlations' | 'tools' | 'firewall' | 'analytics'>('targets');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'online' | 'high_risk' | 'vpn_hosting' | 'iptv' | 'blocked'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedMapTarget, setSelectedMapTarget] = useState<IntelligenceConnection | null>(null);

  // Confirmations (no window.confirm)
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmClearSecLogs, setConfirmClearSecLogs] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Tools Tab: IP Lookup + DNS/HTTP/TLS Diagnostics
  const [toolInput, setToolInput] = useState('');
  const [toolLoading, setToolLoading] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [ipLookupResult, setIpLookupResult] = useState<IpLookupResult | null>(null);
  const [dnsIntelResult, setDnsIntelResult] = useState<DnsIntelResult | null>(null);

  // Firewall & Auto-Defense Policy State
  const [manualBlockIp, setManualBlockIp] = useState('');
  const [manualBlockReason, setManualBlockReason] = useState('');
  const [firewallBusy, setFirewallBusy] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<SecurityPolicyConfig>({
    autoBlockVpnProxy: false,
    autoBlockDatacenter: false,
    autoBlockBots: false,
    ddosMaxReqPer10s: 70,
    ddosBanMinutes: 30,
    bruteForceMaxAttempts: 5,
    bruteForceBanMinutes: 60
  });
  const [policySaving, setPolicySaving] = useState(false);
  const [policySavedNotice, setPolicySavedNotice] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (securityPolicy) {
      setPolicyDraft(securityPolicy);
    }
  }, [securityPolicy]);

  // Derived Telemetry Metrics
  const stats = useMemo(() => {
    const live = connections.filter(c => c.isOnline).length;
    const blocked = connections.filter(c => c.isBlocked || c.isGlobalIpBlocked).length;
    const uniqueIps = new Set(connections.map(c => c.ipAddress).filter(Boolean)).size;
    const vpnOrHosting = connections.filter(c => c.proxy || c.hosting).length;
    const highRiskCount = connections.filter(c => (c.riskScore || 0) >= 60).length;
    const sharedIps = ipCorrelations.filter(c => c.sources.length > 1 || c.deviceCount > 1).length;
    return {
      total: connections.length,
      live,
      blocked,
      uniqueIps,
      vpnOrHosting,
      highRiskCount,
      sharedIps
    };
  }, [connections, ipCorrelations]);

  // Traffic Timeline Metrics
  const timelineStats = useMemo(() => {
    const data = trafficTimeline.length > 0
      ? trafficTimeline
      : Array.from({ length: 12 }, (_, idx) => ({
          minuteKey: `empty-${idx}`,
          label: '--:--',
          requests: 0,
          blocked: 0,
          threats: 0
        }));
    const maxVal = Math.max(5, ...data.map(d => Math.max(d.requests, d.blocked)));
    const totalReq15m = data.reduce((s, d) => s + d.requests, 0);
    const totalBlocked15m = data.reduce((s, d) => s + d.blocked, 0);
    return { data, maxVal, totalReq15m, totalBlocked15m };
  }, [trafficTimeline]);

  // Filtered Connections
  const filteredConnections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return connections.filter(conn => {
      if (filterMode === 'online' && !conn.isOnline) return false;
      if (filterMode === 'high_risk' && (conn.riskScore || 0) < 50) return false;
      if (filterMode === 'vpn_hosting' && !conn.proxy && !conn.hosting) return false;
      if (filterMode === 'iptv' && conn.clientType !== 'iptv_app') return false;
      if (filterMode === 'blocked' && !conn.isBlocked && !conn.isGlobalIpBlocked) return false;

      if (!q) return true;
      return (
        (conn.appName || '').toLowerCase().includes(q) ||
        (conn.ipAddress || '').toLowerCase().includes(q) ||
        (conn.country || '').toLowerCase().includes(q) ||
        (conn.city || '').toLowerCase().includes(q) ||
        (conn.isp || '').toLowerCase().includes(q) ||
        (conn.osName || '').toLowerCase().includes(q) ||
        (conn.deviceFingerprint || '').toLowerCase().includes(q) ||
        (conn.sourceTitle || '').toLowerCase().includes(q) ||
        (conn.userAgent || '').toLowerCase().includes(q)
      );
    });
  }, [connections, filterMode, searchQuery]);

  // Analytics Breakdown
  const analytics = useMemo(() => {
    const byCountry: Record<string, number> = {};
    const byApp: Record<string, number> = {};
    const byOs: Record<string, number> = {};
    let residential = 0;
    let mobileNet = 0;
    let proxyVpn = 0;
    let datacenter = 0;

    connections.forEach(c => {
      const country = c.country && c.country !== 'غير معروف' ? c.country : 'غير محدد';
      byCountry[country] = (byCountry[country] || 0) + 1;

      const appBase = (c.appName || 'غير معروف').split(' • ')[0].trim();
      byApp[appBase] = (byApp[appBase] || 0) + 1;

      const os = c.osName || 'غير محدد';
      byOs[os] = (byOs[os] || 0) + 1;

      if (c.proxy) proxyVpn++;
      else if (c.hosting) datacenter++;
      else if (c.mobile) mobileNet++;
      else residential++;
    });

    const sortTop = (map: Record<string, number>) =>
      Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    return {
      topCountries: sortTop(byCountry),
      topApps: sortTop(byApp),
      topOs: sortTop(byOs),
      networkMix: { residential, mobileNet, proxyVpn, datacenter }
    };
  }, [connections]);

  // Animated Tactical Radar Sweep Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let angle = 0;

    const blips = connections.slice(0, 24).map((c, idx) => {
      const seed = (c.ipAddress || c.id || String(idx))
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const r = 18 + (seed % 52);
      const theta = ((seed * 41) % 360) * (Math.PI / 180);
      return {
        r,
        theta,
        isBlocked: !!(c.isBlocked || c.isGlobalIpBlocked),
        isOnline: !!c.isOnline,
        isHighRisk: (c.riskScore || 0) >= 60
      };
    });

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(cx, cy) - 6;

      ctx.clearRect(0, 0, w, h);

      // Tactical radial backdrop
      const bgGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR);
      bgGrad.addColorStop(0, 'rgba(6, 78, 59, 0.25)');
      bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.92)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fill();

      // Concentric range rings
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
      ctx.lineWidth = 1;
      [0.33, 0.66, 1].forEach(scale => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * scale, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Sweep Wedge
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const sweepGrad = ctx.createLinearGradient(0, 0, maxR, 0);
      sweepGrad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      sweepGrad.addColorStop(1, 'rgba(34, 211, 238, 0.04)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, -0.5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(maxR, 0);
      ctx.stroke();
      ctx.restore();

      // Target Blips
      blips.forEach(b => {
        const bx = cx + Math.cos(b.theta) * (b.r / 75) * maxR;
        const by = cy + Math.sin(b.theta) * (b.r / 75) * maxR;
        ctx.beginPath();
        ctx.arc(bx, by, b.isOnline ? 3.5 : 2.3, 0, Math.PI * 2);
        ctx.fillStyle = b.isBlocked
          ? '#f43f5e'
          : b.isHighRisk
          ? '#f59e0b'
          : b.isOnline
          ? '#10b981'
          : '#38bdf8';
        ctx.fill();
      });

      angle = (angle + 0.03) % (Math.PI * 2);
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [connections]);

  const handleCopy = (val: string, key: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const formatRelativeTime = (isoDate?: string) => {
    if (!isoDate) return 'غير معروف';
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
    if (diffSec < 15) return 'الآن (مباشر)';
    if (diffSec < 60) return `منذ ${diffSec} ثانية`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} ساعة`;
    return new Date(isoDate).toLocaleDateString('ar-EG');
  };

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return 'أقل من دقيقة';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}ث`;
    if (m < 60) return `${m}د ${s}ث`;
    const h = Math.floor(m / 60);
    return `${h}س ${m % 60}د`;
  };

  const getRiskStyle = (score = 0) => {
    if (score >= 65) return { label: 'خطر مرتفع', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40', barFill: '#f43f5e' };
    if (score >= 35) return { label: 'تنبيه متوسط', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', barFill: '#f59e0b' };
    return { label: 'طبيعي / آمن', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', barFill: '#10b981' };
  };

  const runIntelligenceDiagnostic = async (overrideTarget?: string) => {
    const target = (overrideTarget ?? toolInput).trim();
    if (!target) return;
    if (overrideTarget) {
      setToolInput(overrideTarget);
      setSubTab('tools');
    }
    setToolLoading(true);
    setToolError(null);
    setIpLookupResult(null);
    setDnsIntelResult(null);

    try {
      const cleanHost = target.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim();
      const looksLikeIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost) || cleanHost.includes(':');

      const dnsPromise = fetch('/api/intelligence-radar/dns-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      }).then(r => r.json());

      const lookupPromise = looksLikeIp
        ? fetch('/api/intelligence-radar/lookup-ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: cleanHost })
          }).then(r => r.json())
        : Promise.resolve(null);

      const [dnsData, ipData] = await Promise.all([dnsPromise, lookupPromise]);

      if (!dnsData.success) {
        setToolError(dnsData.error || 'تعذر إتمام الفحص');
      } else {
        setDnsIntelResult(dnsData);
      }

      if (ipData && ipData.success) {
        setIpLookupResult(ipData);
      }
    } catch {
      setToolError('فشل الاتصال بخادم التشخيص الاستخباراتي');
    } finally {
      setToolLoading(false);
    }
  };

  const handleGlobalBlockIp = async (ip: string, reason?: string) => {
    if (!ip) return;
    setActionBusy(`gblock_${ip}`);
    try {
      await fetch('/api/security/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason: reason || 'حظر شامل من مركز عمليات الاستخبارات SOC' })
      });
      onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleGlobalUnblockIp = async (ip: string) => {
    if (!ip) return;
    setActionBusy(`gunblock_${ip}`);
    try {
      await fetch('/api/security/unblock-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeleteConnection = async (conn: IntelligenceConnection) => {
    setActionBusy(`del_${conn.id}`);
    try {
      await fetch('/api/intelligence-radar/connection', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: conn.sourceType,
          sourceId: conn.sourceId,
          appId: conn.id
        })
      });
      setConfirmDeleteKey(null);
      onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleClearAllConnections = async () => {
    setActionBusy('clear_all');
    try {
      await fetch('/api/intelligence-radar/connections', { method: 'DELETE' });
      setConfirmClearAll(false);
      onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleManualFirewallBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBlockIp.trim()) return;
    setFirewallBusy(true);
    try {
      await handleGlobalBlockIp(manualBlockIp.trim(), manualBlockReason.trim() || 'حظر يدوي عبر الجدار الناري');
      setManualBlockIp('');
      setManualBlockReason('');
    } finally {
      setFirewallBusy(false);
    }
  };

  const handleClearSecurityLogs = async () => {
    setFirewallBusy(true);
    try {
      await fetch('/api/security/clear-logs', { method: 'DELETE' });
      setConfirmClearSecLogs(false);
      onRefresh();
    } finally {
      setFirewallBusy(false);
    }
  };

  const handleSaveSecurityPolicy = async () => {
    setPolicySaving(true);
    setPolicySavedNotice(false);
    try {
      const res = await fetch('/api/security/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policyDraft)
      });
      const data = await res.json();
      if (data.success && data.policy) {
        setPolicyDraft(data.policy);
        setPolicySavedNotice(true);
        setTimeout(() => setPolicySavedNotice(false), 2500);
        onRefresh();
      }
    } finally {
      setPolicySaving(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'IP',
      'Status',
      'RiskScore',
      'Country',
      'City',
      'ISP',
      'ASN',
      'AppName',
      'OS',
      'ClientType',
      'Fingerprint',
      'Requests',
      'Proxy',
      'Hosting',
      'SourceTitle',
      'LastActive'
    ];
    const rows = filteredConnections.map(c => [
      c.ipAddress || '',
      c.isOnline ? 'ONLINE' : 'OFFLINE',
      String(c.riskScore || 0),
      c.country || '',
      c.city || '',
      c.isp || '',
      c.as || '',
      c.appName || '',
      c.osName || '',
      c.clientType || '',
      c.deviceFingerprint || '',
      String(c.requestCount || 0),
      c.proxy ? 'YES' : 'NO',
      c.hosting ? 'YES' : 'NO',
      c.sourceTitle || '',
      c.lastActive || ''
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soc-intelligence-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 dir-rtl">
      {/* TACTICAL SOC COMMAND COCKPIT HEADER */}
      <div className="relative overflow-hidden rounded-3xl bg-[#030712] border border-cyan-500/25 shadow-2xl shadow-cyan-950/30 p-5 sm:p-6 text-slate-100">
        {/* Top Command Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <Radar className="w-6 h-6 text-cyan-400" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  مركز عمليات الاستخبارات والدفاع السيبراني (SOC)
                </h2>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                  DEFENSIVE_TELEMETRY :: ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                خريطة انتشار حية، بصمة شبكية وعتادية دقيقة، تحليل DNS/HTTP، ودرع حظر آلي للـ VPN والهجمات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCsv}
              disabled={filteredConnections.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-bold transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>تصدير CSV</span>
            </button>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition shadow-lg shadow-cyan-600/25"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث فوري</span>
            </button>
          </div>
        </div>

        {/* Dual-Scope Command Grid: Real Google Map + Radar Sweep & Live Traffic Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-5">
          {/* Real Interactive Google Maps Live Tracker (8 cols) */}
          <div className="lg:col-span-8">
            <LiveGeoMap
              apiKey={mapsApiKey}
              connections={connections}
              focusedConnection={selectedMapTarget}
              onSelectFocus={conn => setSelectedMapTarget(conn)}
              onInspectIp={ip => runIntelligenceDiagnostic(ip)}
              onGlobalBlockIp={handleGlobalBlockIp}
              onGlobalUnblockIp={handleGlobalUnblockIp}
            />
          </div>

          {/* Radar Scope + Real Live Request/Threat Chart (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Compact Radar Scope + Quick Threat Readout */}
            <div className="bg-[#070d1a] border border-slate-800/90 rounded-2xl p-3.5 flex items-center gap-4">
              <div className="relative shrink-0">
                <canvas ref={canvasRef} width={132} height={132} className="rounded-full border border-cyan-500/30 shadow-lg shadow-cyan-500/10" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-bold">متصل الآن</div>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">{stats.live}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-bold">خطر مرتفع</div>
                  <div className="text-lg font-black text-amber-400 font-mono mt-0.5">{stats.highRiskCount}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-bold">VPN / سيرفر</div>
                  <div className="text-lg font-black text-purple-400 font-mono mt-0.5">{stats.vpnOrHosting}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-bold">IP محظورة</div>
                  <div className="text-lg font-black text-rose-400 font-mono mt-0.5">
                    {securitySummary?.blockedIpsCount ?? stats.blocked}
                  </div>
                </div>
              </div>
            </div>

            {/* Real Per-Minute Traffic & Blocked Attacks Timeline */}
            <div className="bg-[#070d1a] border border-slate-800/90 rounded-2xl p-3.5 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black text-slate-200">معدل الطلبات والتصدي الفعلي (15 دقيقة)</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-cyan-400">{timelineStats.totalReq15m} REQ</span>
                  <span className="text-rose-400">{timelineStats.totalBlocked15m} BLK</span>
                </div>
              </div>

              <div className="bg-[#020617] border border-slate-800/80 rounded-xl p-2">
                <svg viewBox="0 0 360 76" className="w-full h-16 block">
                  {timelineStats.data.map((bucket, idx) => {
                    const barSlotW = 360 / timelineStats.data.length;
                    const x = idx * barSlotW + 4;
                    const reqH = Math.max(2, Math.round((bucket.requests / timelineStats.maxVal) * 54));
                    const blkH = bucket.blocked > 0 ? Math.max(3, Math.round((bucket.blocked / timelineStats.maxVal) * 54)) : 0;
                    return (
                      <g key={bucket.minuteKey}>
                        <rect
                          x={x}
                          y={58 - reqH}
                          width={Math.max(8, barSlotW - 10)}
                          height={reqH}
                          rx="2"
                          fill="#0891b2"
                          opacity="0.75"
                        />
                        {blkH > 0 && (
                          <rect
                            x={x}
                            y={58 - blkH}
                            width={Math.max(8, barSlotW - 10)}
                            height={blkH}
                            rx="2"
                            fill="#f43f5e"
                          />
                        )}
                        {idx % 3 === 0 && (
                          <text
                            x={x + (barSlotW - 10) / 2}
                            y="72"
                            textAnchor="middle"
                            fontSize="7.5"
                            fill="#64748b"
                            fontFamily="monospace"
                          >
                            {bucket.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-slate-800/80">
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">الأهداف المسجلة</span>
            <span className="text-sm font-black font-mono text-white">{stats.total}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">IP فريدة</span>
            <span className="text-sm font-black font-mono text-cyan-300">{stats.uniqueIps}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">تشارك IP</span>
            <span className="text-sm font-black font-mono text-amber-300">{stats.sharedIps}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">سجل التهديدات</span>
            <span className="text-sm font-black font-mono text-rose-300">{securitySummary?.securityLogsCount ?? 0}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">حظر VPN آلي</span>
            <span className={`text-[11px] font-black font-mono ${policyDraft.autoBlockVpnProxy ? 'text-emerald-400' : 'text-slate-500'}`}>
              {policyDraft.autoBlockVpnProxy ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold">حظر البوتات آلي</span>
            <span className={`text-[11px] font-black font-mono ${policyDraft.autoBlockBots ? 'text-emerald-400' : 'text-slate-500'}`}>
              {policyDraft.autoBlockBots ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* SOC MODULE SUB-NAVIGATION */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto">
        <button
          onClick={() => setSubTab('targets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
            subTab === 'targets'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>رادار الأهداف الحية ({connections.length})</span>
        </button>

        <button
          onClick={() => setSubTab('correlations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
            subTab === 'correlations'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>كشف التشارك ({stats.sharedIps})</span>
        </button>

        <button
          onClick={() => setSubTab('tools')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
            subTab === 'tools'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>أدوات الاستخبارات الحقيقية (DNS & IP & TLS)</span>
        </button>

        <button
          onClick={() => setSubTab('firewall')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
            subTab === 'firewall'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>درع الدفاع الآلي والجدار الناري ({securitySummary?.blockedIpsCount ?? 0})</span>
        </button>

        <button
          onClick={() => setSubTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
            subTab === 'analytics'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>تحليلات الشبكات والعتاد</span>
        </button>
      </div>

      {/* MODULE 1: LIVE TARGETS RADAR */}
      {subTab === 'targets' && (
        <div className="space-y-4">
          {/* Search & Filter Control Strip */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث متقدم: IP، بصمة الجهاز FP، الدولة، المزود ISP، المشغل، القناة..."
                className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'online', label: `متصل (${stats.live})` },
                { id: 'high_risk', label: `عالي الخطورة (${stats.highRiskCount})` },
                { id: 'vpn_hosting', label: `VPN/سحابي (${stats.vpnOrHosting})` },
                { id: 'iptv', label: 'تطبيقات IPTV' },
                { id: 'blocked', label: `محظور (${stats.blocked})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterMode(f.id as typeof filterMode)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                    filterMode === f.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}

              {connections.length > 0 && (
                confirmClearAll ? (
                  <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-500/40 px-2.5 py-1 rounded-lg">
                    <span className="text-[11px] text-rose-200 font-bold">مسح السجل؟</span>
                    <button
                      onClick={handleClearAllConnections}
                      disabled={actionBusy === 'clear_all'}
                      className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black"
                    >
                      تأكيد
                    </button>
                    <button
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearAll(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تنظيف الكل</span>
                  </button>
                )
              )}
            </div>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center">
              <Radar className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-300">لا توجد أهداف مطابقة حالياً في سجل الرادار</p>
              <p className="text-xs text-slate-500 mt-1">بمجرد تشغيل أي رابط بث أو حساب اكستريم سيتم رصده وتصنيفه فورياً هنا</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredConnections.map(conn => {
                const uniqueKey = `${conn.sourceType}_${conn.sourceId}_${conn.id}`;
                const isExpanded = expandedId === uniqueKey;
                const risk = getRiskStyle(conn.riskScore || 0);
                const riskVal = Math.min(100, Math.max(0, conn.riskScore || 0));

                return (
                  <div
                    key={uniqueKey}
                    className={`rounded-2xl border transition overflow-hidden ${
                      conn.isBlocked || conn.isGlobalIpBlocked
                        ? 'bg-rose-950/15 border-rose-500/35'
                        : conn.isOnline
                        ? 'bg-[#070d1a] border-emerald-500/35 shadow-lg shadow-emerald-950/20'
                        : 'bg-slate-950 border-slate-800/90'
                    }`}
                  >
                    {/* Card Header & Core Telemetry */}
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3.5 border-b border-slate-800/70">
                        <div className="flex items-start sm:items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              conn.isBlocked || conn.isGlobalIpBlocked
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                : conn.isOnline
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {conn.clientType === 'bot_scraper' ? (
                              <Bot className="w-5 h-5" />
                            ) : conn.clientType === 'iptv_app' ? (
                              <Tv className="w-5 h-5" />
                            ) : (
                              <Monitor className="w-5 h-5" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-black text-white">{conn.appName}</h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                  conn.isOnline
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {conn.isOnline ? 'LIVE متصل' : formatRelativeTime(conn.lastActive)}
                              </span>
                              {conn.isGlobalIpBlocked && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600/25 text-rose-300 border border-rose-500/40">
                                  محظور بالجدار الناري
                                </span>
                              )}
                              {conn.proxy && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  VPN / PROXY
                                </span>
                              )}
                              {conn.hosting && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                  DATACENTER
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-400 mt-1">
                              <span className="text-cyan-300 font-bold">{conn.sourceTitle}</span>
                              <span>•</span>
                              <span>{conn.osName || 'OS غير محدد'}</span>
                              {conn.deviceModel && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-300">{conn.deviceModel}</span>
                                </>
                              )}
                              {conn.deviceFingerprint && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-slate-400 flex items-center gap-1">
                                    <Fingerprint className="w-3 h-3 text-cyan-400" />
                                    {conn.deviceFingerprint}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Risk Meter */}
                        <div className="flex items-center gap-3 self-start xl:self-center">
                          <div className="w-36">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-slate-400 font-bold">مؤشر الخطر</span>
                              <span className="font-mono font-black text-white">{riskVal}/100</span>
                            </div>
                            <svg viewBox="0 0 100 6" className="w-full h-1.5 rounded overflow-hidden bg-slate-800">
                              <rect x="0" y="0" width={riskVal} height="6" rx="3" fill={risk.barFill} />
                            </svg>
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${risk.badge}`}>
                            {risk.label}
                          </span>
                        </div>
                      </div>

                      {/* 4-Column Network & Geo Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3.5">
                        {/* IP Box */}
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 font-bold mb-1 flex items-center justify-between">
                            <span>عنوان الشبكة IP</span>
                            <button
                              onClick={() => handleCopy(conn.ipAddress || '', `ip_${uniqueKey}`)}
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                            >
                              {copiedKey === `ip_${uniqueKey}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>نسخ</span>
                            </button>
                          </div>
                          <div className="font-mono text-xs font-black text-cyan-300 truncate">
                            {conn.ipAddress || 'غير متوفر'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {conn.as || (conn.mobile ? 'اتصال شريحة خلوي Mobile' : 'شبكة أرضية/ثابتة')}
                          </div>
                        </div>

                        {/* Geo Box */}
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 font-bold mb-1 flex items-center justify-between">
                            <span>الموقع الجغرافي</span>
                            {typeof conn.lat === 'number' && typeof conn.lon === 'number' && (
                              <a
                                href={`https://www.google.com/maps?q=${conn.lat},${conn.lon}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:underline flex items-center gap-0.5"
                              >
                                <MapPin className="w-3 h-3" />
                                <span>خريطة</span>
                              </a>
                            )}
                          </div>
                          <div className="text-xs font-black text-white truncate">
                            {conn.country || 'غير معروف'}
                            {conn.city ? ` • ${conn.city}` : ''}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {conn.regionName || conn.timezone || 'المنطقة الزمنية غير محددة'}
                          </div>
                        </div>

                        {/* ISP Box */}
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 font-bold mb-1">مزود الخدمة ISP</div>
                          <div className="text-xs font-black text-slate-200 truncate">{conn.isp || 'غير معروف'}</div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            آخر مسار: {conn.lastEndpoint || 'غير مسجل'}
                          </div>
                        </div>

                        {/* Activity & Rate Box */}
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 font-bold mb-1">النشاط والمعدل</div>
                          <div className="text-xs font-black text-white font-mono">
                            {conn.requestCount} طلب • {conn.requestsPerMinute || 0}/د
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            مدة الجلسة: {formatDuration(conn.sessionDurationSec)}
                          </div>
                        </div>
                      </div>

                      {/* Risk Reasons */}
                      {conn.riskReasons && conn.riskReasons.length > 0 && (
                        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                          {conn.riskReasons.map((reason, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Footer */}
                      <div className="mt-3.5 pt-3 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : uniqueKey)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-bold transition"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>تفاصيل العتاد والـ Headers ({conn.accessHistory?.length || 0})</span>
                          </button>

                          {typeof conn.lat === 'number' && typeof conn.lon === 'number' && (
                            <button
                              onClick={() => {
                                setSelectedMapTarget(conn);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold transition"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>عرض على الخريطة</span>
                            </button>
                          )}

                          {conn.ipAddress && (
                            <button
                              onClick={() => runIntelligenceDiagnostic(conn.ipAddress)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold transition"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                              <span>فحص IP & PTR</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Per-Channel / Account Block */}
                          {conn.isBlocked ? (
                            <button
                              onClick={() => onUnblockDevice(conn.sourceType, conn.sourceId, conn.ipAddress || conn.userAgent)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>فك حظر القناة</span>
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                onBlockDevice(
                                  conn.sourceType,
                                  conn.sourceId,
                                  conn.ipAddress || conn.userAgent,
                                  conn.userAgent,
                                  conn.appName,
                                  conn.id,
                                  conn.ipAddress
                                )
                              }
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] font-bold transition"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>حظر من القناة</span>
                            </button>
                          )}

                          {/* Global Firewall IP Block */}
                          {conn.ipAddress &&
                            (conn.isGlobalIpBlocked ? (
                              <button
                                onClick={() => handleGlobalUnblockIp(conn.ipAddress!)}
                                disabled={actionBusy === `gunblock_${conn.ipAddress}`}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                <span>رفع الحظر الشامل</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGlobalBlockIp(conn.ipAddress!, `حظر شامل من الرادار (${conn.appName})`)}
                                disabled={actionBusy === `gblock_${conn.ipAddress}`}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black transition"
                              >
                                <ShieldBan className="w-3.5 h-3.5" />
                                <span>حظر IP شامل</span>
                              </button>
                            ))}

                          {/* Delete Record Inline Confirm */}
                          {confirmDeleteKey === uniqueKey ? (
                            <div className="flex items-center gap-1 bg-slate-900 border border-rose-500/40 px-2 py-1 rounded-lg">
                              <button
                                onClick={() => handleDeleteConnection(conn)}
                                className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                              >
                                حذف
                              </button>
                              <button
                                onClick={() => setConfirmDeleteKey(null)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                              >
                                تراجع
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteKey(uniqueKey)}
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-800 text-slate-400 hover:text-rose-400 transition"
                              title="حذف السجل"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Deep Forensic Telemetry Drawer */}
                    {isExpanded && (
                      <div className="bg-[#020617] border-t border-slate-800/90 p-4 sm:p-5 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Hardware & Browser Telemetry */}
                          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                            <div className="flex items-center gap-2 text-xs font-black text-cyan-300 mb-2.5">
                              <Cpu className="w-4 h-4" />
                              <span>بصمة العتاد والمتصفح الحقيقية</span>
                            </div>
                            {conn.clientTelemetry ? (
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="p-2 rounded bg-slate-900/80">
                                  <span className="text-slate-500 block">الشاشة / النافذة</span>
                                  <span className="text-slate-200 font-mono font-bold">
                                    {conn.clientTelemetry.screenResolution || '-'} / {conn.clientTelemetry.viewportSize || '-'}
                                  </span>
                                </div>
                                <div className="p-2 rounded bg-slate-900/80">
                                  <span className="text-slate-500 block">المعالج والذاكرة</span>
                                  <span className="text-slate-200 font-mono font-bold">
                                    {conn.clientTelemetry.cpuCores ?? '-'} Cores • {conn.clientTelemetry.deviceMemoryGb ?? '-'} GB
                                  </span>
                                </div>
                                <div className="p-2 rounded bg-slate-900/80 col-span-2">
                                  <span className="text-slate-500 block">معالج الرسوميات (WebGL GPU)</span>
                                  <span className="text-slate-200 font-mono text-[10px] break-all">
                                    {conn.clientTelemetry.gpuRenderer || 'غير متاح في هذا المشغل'}
                                  </span>
                                </div>
                                <div className="p-2 rounded bg-slate-900/80">
                                  <span className="text-slate-500 block">الشبكة وزمن الاستجابة</span>
                                  <span className="text-emerald-300 font-mono font-bold">
                                    {conn.clientTelemetry.networkType || 'auto'} • {conn.clientTelemetry.rttMs ?? '-'} ms
                                  </span>
                                </div>
                                <div className="p-2 rounded bg-slate-900/80">
                                  <span className="text-slate-500 block">محرك التشغيل / التبويب</span>
                                  <span className="text-slate-200 font-bold">
                                    {conn.clientTelemetry.playbackEngine || 'Native'} •{' '}
                                    {conn.clientTelemetry.isVisible === false ? 'مخفي' : 'مرئي'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500">
                                يتصل عبر مشغل IPTV خارجي مباشر (تطبيقات IPTV لا ترسل بيانات المتصفح مثل WebGL وتُعتمد بصمة الـ IP و User-Agent).
                              </p>
                            )}
                          </div>

                          {/* HTTP Headers & Raw UA */}
                          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2 text-[11px]">
                            <div className="flex items-center gap-2 text-xs font-black text-amber-300 mb-1">
                              <FileCode2 className="w-4 h-4" />
                              <span>ترويسات HTTP والهوية النصية</span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 font-mono text-[10px] text-slate-300 break-all">
                              <span className="text-slate-500">User-Agent: </span>
                              {conn.userAgent || 'N/A'}
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 font-mono text-[10px] text-slate-300 break-all">
                              <span className="text-slate-500">Accept-Language: </span>
                              {conn.acceptLanguage || 'غير مرسلة'}
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 font-mono text-[10px] text-slate-300 break-all">
                              <span className="text-slate-500">Referer / Origin: </span>
                              {conn.referer || 'طلب مباشر بدون Referer'}
                            </div>
                            {conn.forwardedChain && (
                              <div className="p-2 rounded bg-slate-900/80 font-mono text-[10px] text-cyan-300 break-all">
                                <span className="text-slate-500">X-Forwarded-For: </span>
                                {conn.forwardedChain}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Access History */}
                        {conn.accessHistory && conn.accessHistory.length > 0 && (
                          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                            <div className="flex items-center gap-2 text-xs font-black text-emerald-300 mb-2">
                              <History className="w-4 h-4" />
                              <span>سجل آخر المسارات المطلوبة ({conn.accessHistory.length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {conn.accessHistory.map((h, i) => (
                                <div key={i} className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800/70 flex items-center justify-between gap-2 text-[10px]">
                                  <span className="font-mono text-slate-200 truncate">{h.endpoint}</span>
                                  <span className="font-mono text-slate-500 shrink-0">
                                    {new Date(h.timestamp).toLocaleTimeString('en-GB')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODULE 2: IP CORRELATIONS & ACCOUNT SHARING DETECTOR */}
      {subTab === 'correlations' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-amber-400" />
                <span>خريطة ترابط الـ IP وكشف التشارك وإعادة البث (Restream Detection)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تجميع تلقائي لكل عنوان IP اتصل بأكثر من قناة أو أكثر من تطبيق مشغل أو أكثر من بصمة جهاز
              </p>
            </div>
          </div>

          {ipCorrelations.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-xs">لا توجد بيانات ترابط مسجلة حتى الآن</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ipCorrelations.map(item => (
                <div
                  key={item.ip}
                  className={`p-4 rounded-2xl border ${
                    item.isGlobalIpBlocked
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : item.sources.length > 1 || item.deviceCount > 1
                      ? 'bg-amber-950/15 border-amber-500/30'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-cyan-300">{item.ip}</span>
                      {item.isOnlineAny && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black">LIVE</span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-300">
                      {item.totalHits} طلب • خطر {item.maxRiskScore}/100
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 mb-2.5">
                    {item.country} {item.city ? `• ${item.city}` : ''} — <span className="text-slate-400">{item.isp || 'ISP غير محدد'}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold">
                      {item.sources.length} قناة/حساب
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold">
                      {item.deviceCount} اتصال مسجل
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold">
                      {item.fingerprintCount} بصمة جهاز
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mb-3 truncate">
                    القنوات: {item.sources.join(' ، ')}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => runIntelligenceDiagnostic(item.ip)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold transition"
                    >
                      فحص عميق
                    </button>
                    {item.isGlobalIpBlocked ? (
                      <button
                        onClick={() => handleGlobalUnblockIp(item.ip)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black transition"
                      >
                        فك الحظر
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGlobalBlockIp(item.ip, `تشارك مفرط عبر ${item.sources.length} مصادر`)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black transition"
                      >
                        حظر شامل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODULE 3: REAL DEFENSIVE INTELLIGENCE TOOLS (IP + PTR + DNS + HTTP + TLS) */}
      {subTab === 'tools' && (
        <div className="space-y-4">
          <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  <span>محطة التشخيص الاستخباراتي الحقيقي (IP • Reverse DNS • Domain • HTTP Headers • TLS)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  أدخل أي عنوان IP زائر أو اسم نطاق/رابط خادم بث لتحليل سجلات DNS الحقيقية، سجل PTR العكسي، الترويسات الأمنية، وشهادة SSL/TLS
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-mono font-bold">
                READ-ONLY DIAGNOSTICS
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={toolInput}
                onChange={e => setToolInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runIntelligenceDiagnostic()}
                placeholder="مثال IP: 8.8.8.8 أو نطاق: example.com أو رابط بث..."
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => runIntelligenceDiagnostic()}
                disabled={toolLoading || !toolInput.trim()}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {toolLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>تشغيل الفحص الحقيقي</span>
              </button>
            </div>

            {toolError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                {toolError}
              </div>
            )}

            {/* Quick IP Targets from Current Connections */}
            {connections.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-slate-500 font-bold">فحص سريع لآخر IPs:</span>
                {Array.from(new Set(connections.map(c => c.ipAddress).filter(Boolean)))
                  .slice(0, 6)
                  .map(ip => (
                    <button
                      key={ip}
                      onClick={() => runIntelligenceDiagnostic(ip)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-300 font-mono text-[10px] font-bold transition"
                    >
                      {ip}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Diagnostic Output */}
          {dnsIntelResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Geo & Reverse PTR Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-cyan-300 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>هوية الشبكة و Reverse DNS (PTR)</span>
                  </h4>
                  <span className="font-mono text-xs font-black text-white bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                    {dnsIntelResult.target}
                  </span>
                </div>

                {dnsIntelResult.geo && (
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">الدولة / المدينة</span>
                      <span className="text-white font-bold">
                        {dnsIntelResult.geo.country || '-'} {dnsIntelResult.geo.city ? `(${dnsIntelResult.geo.city})` : ''}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">المزود (ISP / Org)</span>
                      <span className="text-slate-200 font-bold truncate block">
                        {dnsIntelResult.geo.isp || dnsIntelResult.geo.org || '-'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">رقم الشبكة (ASN)</span>
                      <span className="text-cyan-300 font-mono font-bold truncate block">
                        {dnsIntelResult.geo.as || '-'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">التصنيف الأمني</span>
                      <span className="font-bold text-amber-300">
                        {dnsIntelResult.geo.proxy
                          ? 'VPN / Proxy'
                          : dnsIntelResult.geo.hosting
                          ? 'Datacenter / سحابي'
                          : dnsIntelResult.geo.mobile
                          ? 'شبكة جوال'
                          : 'سكني / عادي'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400 mb-1.5">سجلات Reverse PTR:</div>
                  {(dnsIntelResult.ptrRecords?.length || dnsIntelResult.dns?.primaryPtr?.length) ? (
                    <div className="space-y-1">
                      {(dnsIntelResult.ptrRecords || dnsIntelResult.dns?.primaryPtr || []).map((ptr, i) => (
                        <div key={i} className="font-mono text-xs text-emerald-300">{ptr}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">لا يوجد سجل PTR عكسي معلن لهذا العنوان</div>
                  )}
                </div>

                {ipLookupResult && (
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <span className="text-slate-400">الحالة في جدارك الناري: </span>
                      <span className={ipLookupResult.isBlocked ? 'text-rose-400 font-black' : 'text-emerald-400 font-black'}>
                        {ipLookupResult.isBlocked ? 'محظور حالياً' : 'غير محظور'}
                      </span>
                      <span className="text-slate-500 block text-[11px]">
                        رُصد في {ipLookupResult.seenInSources.length} قناة/حساب محلي
                      </span>
                    </div>
                    {ipLookupResult.isBlocked ? (
                      <button
                        onClick={() => handleGlobalUnblockIp(ipLookupResult.ip)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black"
                      >
                        فك الحظر
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGlobalBlockIp(ipLookupResult.ip, 'حظر عبر محطة الاستخبارات')}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-black"
                      >
                        حظر شامل
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* DNS Records, HTTP Headers & TLS Certificate (Domain Mode) */}
              {dnsIntelResult.mode === 'domain' && dnsIntelResult.dns && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    <span>سجلات DNS وشهادة TLS وترويسات الخادم</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-slate-500 font-bold block mb-1">A Records (IPv4)</span>
                      {dnsIntelResult.dns.aRecords.length > 0 ? (
                        dnsIntelResult.dns.aRecords.map((a, i) => (
                          <div key={i} className="font-mono text-cyan-300">{a}</div>
                        ))
                      ) : (
                        <span className="text-slate-600">لا يوجد</span>
                      )}
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-slate-500 font-bold block mb-1">NameServers (NS)</span>
                      {dnsIntelResult.dns.nsRecords.length > 0 ? (
                        dnsIntelResult.dns.nsRecords.slice(0, 4).map((ns, i) => (
                          <div key={i} className="font-mono text-slate-200 truncate">{ns}</div>
                        ))
                      ) : (
                        <span className="text-slate-600">لا يوجد</span>
                      )}
                    </div>
                  </div>

                  {dnsIntelResult.tls && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                          شهادة الأمان SSL/TLS
                        </span>
                        <span className={dnsIntelResult.tls.valid ? 'text-emerald-400 font-black' : 'text-amber-400 font-black'}>
                          {dnsIntelResult.tls.valid ? 'موثوقة Valid' : 'غير موثقة / Self-Signed'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        المُصدر: {dnsIntelResult.tls.issuer || '-'} • البروتوكول: {dnsIntelResult.tls.protocol || '-'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        الانتهاء: {dnsIntelResult.tls.validTo || '-'}
                      </div>
                    </div>
                  )}

                  {dnsIntelResult.http && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-300">ترويسات HTTP Response</span>
                        <span className="font-mono text-cyan-300 font-bold">HTTP {dnsIntelResult.http.status}</span>
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {Object.entries(dnsIntelResult.http.headers).map(([k, v]) => (
                          <div key={k} className="font-mono text-[10px] break-all">
                            <span className="text-amber-300">{k}: </span>
                            <span className="text-slate-300">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODULE 4: AUTO-DEFENSE POLICY ENGINE & GLOBAL FIREWALL */}
      {subTab === 'firewall' && (
        <div className="space-y-4">
          {/* Auto-Defense Policy Console */}
          <div className="bg-slate-950 border border-cyan-500/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-cyan-400" />
                  <span>محرك سياسات الدفاع الآلي (Auto-Defense Firewall Policy)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  تفعيل الحظر التلقائي الفوري على مستوى الخادم ضد الشبكات المخفية، البوتات، وهجمات الإغراق والتخمين
                </p>
              </div>
              <div className="flex items-center gap-2">
                {policySavedNotice && (
                  <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                    تم الحفظ والتفعيل
                  </span>
                )}
                <button
                  onClick={handleSaveSecurityPolicy}
                  disabled={policySaving}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition disabled:opacity-50"
                >
                  {policySaving ? 'جاري الحفظ...' : 'حفظ وتطبيق السياسة'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  key: 'autoBlockVpnProxy' as const,
                  title: 'حظر VPN / Proxy تلقائياً',
                  desc: 'حظر أي IP يمر عبر شبكة VPN أو بروكسي مخفي فور اتصاله بالبث'
                },
                {
                  key: 'autoBlockDatacenter' as const,
                  title: 'حظر خوادم Datacenter آلياً',
                  desc: 'منع السيرفرات السحابية ومزارع إعادة البث من سحب روابطك'
                },
                {
                  key: 'autoBlockBots' as const,
                  title: 'حظر البوتات والـ Scrapers',
                  desc: 'إيقاف أدوات السحب مثل Python/Curl/Scrapy على روابط البث تلقائياً'
                }
              ].map(toggle => (
                <button
                  key={toggle.key}
                  type="button"
                  onClick={() =>
                    setPolicyDraft(prev => ({
                      ...prev,
                      [toggle.key]: !prev[toggle.key]
                    }))
                  }
                  className={`p-4 rounded-xl border text-right transition flex flex-col justify-between gap-2 ${
                    policyDraft[toggle.key]
                      ? 'bg-emerald-950/30 border-emerald-500/50'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-black text-white">{toggle.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                        policyDraft[toggle.key] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {policyDraft[toggle.key] ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{toggle.desc}</p>
                </button>
              ))}
            </div>

            {/* Rate Limit & Brute Force Thresholds */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <label className="text-[11px] text-slate-400 font-bold block mb-1.5">حد DDoS (طلب / 10 ثوانٍ)</label>
                <input
                  type="number"
                  min={15}
                  max={500}
                  value={policyDraft.ddosMaxReqPer10s}
                  onChange={e => setPolicyDraft(p => ({ ...p, ddosMaxReqPer10s: Number(e.target.value) || 70 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <label className="text-[11px] text-slate-400 font-bold block mb-1.5">مدة حظر DDoS (دقيقة)</label>
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={policyDraft.ddosBanMinutes}
                  onChange={e => setPolicyDraft(p => ({ ...p, ddosBanMinutes: Number(e.target.value) || 30 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <label className="text-[11px] text-slate-400 font-bold block mb-1.5">محاولات التخمين المسموحة</label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={policyDraft.bruteForceMaxAttempts}
                  onChange={e => setPolicyDraft(p => ({ ...p, bruteForceMaxAttempts: Number(e.target.value) || 5 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <label className="text-[11px] text-slate-400 font-bold block mb-1.5">مدة حظر التخمين (دقيقة)</label>
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={policyDraft.bruteForceBanMinutes}
                  onChange={e => setPolicyDraft(p => ({ ...p, bruteForceBanMinutes: Number(e.target.value) || 60 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Manual Ban + Blocked List + Security Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-sm font-black text-rose-300 flex items-center gap-2">
                <ShieldBan className="w-4 h-4" />
                <span>قائمة الحظر الشاملة ({securitySummary?.blockedIpsCount ?? 0})</span>
              </h4>

              <form onSubmit={handleManualFirewallBlock} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualBlockIp}
                  onChange={e => setManualBlockIp(e.target.value)}
                  placeholder="أدخل IP للحظر الفوري..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={manualBlockReason}
                  onChange={e => setManualBlockReason(e.target.value)}
                  placeholder="السبب (اختياري)"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                />
                <button
                  type="submit"
                  disabled={firewallBusy || !manualBlockIp.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black disabled:opacity-50"
                >
                  حظر
                </button>
              </form>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(securitySummary?.blockedIps || []).length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">لا توجد عناوين IP محظورة حالياً</p>
                ) : (
                  (securitySummary?.blockedIps || []).map(rec => (
                    <div
                      key={rec.ip}
                      className="p-3 rounded-xl bg-slate-900/90 border border-rose-500/25 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-black text-rose-300">{rec.ip}</div>
                        <div className="text-[11px] text-slate-400 truncate">{rec.reason}</div>
                      </div>
                      <button
                        onClick={() => handleGlobalUnblockIp(rec.ip)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold shrink-0"
                      >
                        فك الحظر
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>سجل التصديات الأمنية ({securitySummary?.securityLogsCount ?? 0})</span>
                </h4>
                {(securitySummary?.recentSecurityLogs || []).length > 0 && (
                  confirmClearSecLogs ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleClearSecurityLogs}
                        className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-black"
                      >
                        تأكيد المسح
                      </button>
                      <button
                        onClick={() => setConfirmClearSecLogs(false)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px]"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClearSecLogs(true)}
                      className="text-[11px] text-rose-400 hover:underline font-bold"
                    >
                      مسح السجل
                    </button>
                  )
                )}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(securitySummary?.recentSecurityLogs || []).length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">لا توجد محاولات هجومية مسجلة</p>
                ) : (
                  (securitySummary?.recentSecurityLogs || []).map(log => (
                    <div key={log.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono font-black text-cyan-300">{log.ip}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] font-bold">
                          {log.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">{log.details}</div>
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">
                        {new Date(log.timestamp).toLocaleString('ar-EG')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 5: NETWORK & HARDWARE ANALYTICS */}
      {subTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Countries */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>توزيع الدول الأكثر اتصالاً</span>
            </h4>
            {analytics.topCountries.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد بيانات كافية</p>
            ) : (
              analytics.topCountries.map(([name, count]) => {
                const pct = Math.max(4, Math.round((count / Math.max(1, connections.length)) * 100));
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200 font-bold">{name}</span>
                      <span className="font-mono text-cyan-300">{count} ({pct}%)</span>
                    </div>
                    <svg viewBox="0 0 100 4" className="w-full h-1.5 rounded bg-slate-900">
                      <rect x="0" y="0" width={pct} height="4" rx="2" fill="#06b6d4" />
                    </svg>
                  </div>
                );
              })
            )}
          </div>

          {/* Apps */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-emerald-400" />
              <span>تطبيقات التشغيل والمتصفحات</span>
            </h4>
            {analytics.topApps.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد بيانات كافية</p>
            ) : (
              analytics.topApps.map(([name, count]) => {
                const pct = Math.max(4, Math.round((count / Math.max(1, connections.length)) * 100));
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200 font-bold truncate max-w-[230px]">{name}</span>
                      <span className="font-mono text-emerald-300">{count} ({pct}%)</span>
                    </div>
                    <svg viewBox="0 0 100 4" className="w-full h-1.5 rounded bg-slate-900">
                      <rect x="0" y="0" width={pct} height="4" rx="2" fill="#10b981" />
                    </svg>
                  </div>
                );
              })
            )}
          </div>

          {/* OS Distribution */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>أنظمة التشغيل المكتشفة</span>
            </h4>
            {analytics.topOs.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد بيانات كافية</p>
            ) : (
              analytics.topOs.map(([name, count]) => {
                const pct = Math.max(4, Math.round((count / Math.max(1, connections.length)) * 100));
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200 font-bold">{name}</span>
                      <span className="font-mono text-indigo-300">{count} ({pct}%)</span>
                    </div>
                    <svg viewBox="0 0 100 4" className="w-full h-1.5 rounded bg-slate-900">
                      <rect x="0" y="0" width={pct} height="4" rx="2" fill="#6366f1" />
                    </svg>
                  </div>
                );
              })
            )}
          </div>

          {/* Network Classification */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-amber-400" />
              <span>تصنيف نوعية الشبكات والاتصال</span>
            </h4>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">شبكات منزلية / ثابتة</div>
                <div className="text-xl font-black font-mono text-emerald-400 mt-1">{analytics.networkMix.residential}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">شبكات شريحة خلوي (4G/5G)</div>
                <div className="text-xl font-black font-mono text-cyan-400 mt-1">{analytics.networkMix.mobileNet}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">VPN / Proxy</div>
                <div className="text-xl font-black font-mono text-amber-400 mt-1">{analytics.networkMix.proxyVpn}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">مراكز بيانات / استضافة</div>
                <div className="text-xl font-black font-mono text-rose-400 mt-1">{analytics.networkMix.datacenter}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

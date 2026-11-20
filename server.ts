process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { execFileSync, spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import { Readable } from 'stream';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression({
  level: 6,
  threshold: 512,
  filter: (req, res) => {
    const p = req.path.toLowerCase();
    if (
      p.startsWith('/s-seg') ||
      p.startsWith('/srv/') ||
      p.startsWith('/api/proxy-segment') ||
      p.startsWith('/uploads/') ||
      p.endsWith('.ts') ||
      p.endsWith('.m4s') ||
      p.endsWith('.mp4') ||
      p.endsWith('.mov')
    ) {
      return false;
    }
    const ct = String(res.getHeader('Content-Type') || '').toLowerCase();
    if (ct.startsWith('video/') || ct.includes('mp2t') || ct.includes('octet-stream')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Anti-Telegram & Anti-Social Link Preview Stealth Shield
app.use((req, res, next) => {
  const ua = (req.get('user-agent') || '').toLowerCase();
  const accept = (req.get('accept') || '').toLowerCase();
  const reqPath = req.path.toLowerCase();
  
  const isStreamOrPhpRoute =
    reqPath.includes('get.php') ||
    reqPath.includes('player_api.php') ||
    reqPath.includes('xmltv.php') ||
    reqPath.startsWith('/live/') ||
    reqPath.startsWith('/movie/') ||
    reqPath.startsWith('/series/') ||
    reqPath.startsWith('/v/') ||
    reqPath.startsWith('/m/') ||
    reqPath.startsWith('/srv/') ||
    reqPath.startsWith('/s-seg') ||
    reqPath.includes('manifest.m3u8') ||
    reqPath.includes('/proxy-segment');

  // Explicit social media preview crawler bot detection
  const isSocialPreviewBot =
    ua.includes('telegram') ||
    ua.includes('facebook') ||
    ua.includes('facebot') ||
    ua.includes('twitter') ||
    ua.includes('whatsapp') ||
    ua.includes('discord') ||
    ua.includes('slack') ||
    ua.includes('skype') ||
    ua.includes('applebot') ||
    ua.includes('vkshare') ||
    ua.includes('metauri') ||
    ua.includes('embedly') ||
    ua.includes('bingbot') ||
    ua.includes('googlebot') ||
    ua.includes('crawler') ||
    ua.includes('spider') ||
    ua.includes('preview') ||
    ua.includes('bot') ||
    req.get('purpose') === 'prefetch' ||
    req.get('sec-purpose') === 'prefetch' ||
    req.get('x-purpose') === 'preview';

  // Rule 1: Always allow all IPTV requests to stream or PHP routes unless explicitly a social preview bot
  if (isStreamOrPhpRoute) {
    if (isSocialPreviewBot) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(404).send('');
    }
    return next();
  }

  // Rule 2: Social media bot on non-IPTV routes -> 404 Empty
  if (isSocialPreviewBot) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(404).send('');
  }

  // Rule 3: Background non-interactive preview requests on root '/' without browser sec-fetch-user
  const isBackgroundPreviewOnRoot =
    (reqPath === '/' || reqPath === '') &&
    accept.includes('text/html') &&
    !req.get('sec-fetch-user') &&
    !req.get('sec-ch-ua') &&
    req.method === 'GET';

  if (isBackgroundPreviewOnRoot) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(404).send('');
  }

  next();
});

// Ensure public uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Improved static serving for video files
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');
  next();
}, express.static(UPLOADS_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
    if (path.endsWith('.mov')) res.setHeader('Content-Type', 'video/quicktime');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

export interface ConnectedApp {
  id: string;
  userAgent: string;
  appName: string;
  deviceModel?: string;
  ipAddress?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  lat?: number;
  lon?: number;
  zip?: string;
  timezone?: string;
  as?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  referer?: string;
  acceptLanguage?: string;
  forwardedChain?: string;
  deviceFingerprint?: string;
  requestCount: number;
  firstSeen?: string;
  lastActive: string;
  lastEndpoint?: string;
  osName?: string;
  clientType?: 'iptv_app' | 'browser' | 'bot_scraper' | 'unknown';
  sessionDurationSec?: number;
  requestsPerMinute?: number;
  riskScore?: number;
  riskReasons?: string[];
  accessHistory?: { endpoint: string; timestamp: string }[];
  clientTelemetry?: Record<string, any>;
  isBlocked: boolean;
}

export interface StreamItem {
  id: string;
  slug: string;
  streamToken?: string;
  title: string;
  category: 'sports' | 'news' | 'entertainment' | 'gaming' | 'general';
  originalUrl: string;
  streamType: 'hls' | 'dash' | 'embed' | 'youtube' | 'twitch' | 'mp4';
  status: 'active' | 'paused';
  watermarkText: string;
  quality: string;
  refererHeader?: string;
  userAgentHeader?: string;
  password?: string;
  allowedDomains?: string;
  viewsCount: number;
  currentViewers: number;
  createdAt: string;
  updatedAt: string;
  pauseNoticeMessage?: string;
  customPosterUrl?: string;
  customLogoUrl?: string;
  logoPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  logoSize?: 'sm' | 'md' | 'lg';
  autoPauseTimerMinutes?: number;
  blockAllExternalApps?: boolean;
  blockedApps?: string[];
  connectedApps?: ConnectedApp[];
  isXtream?: boolean;
  xtreamHost?: string;
  xtreamUser?: string;
  xtreamPass?: string;
  xtreamStreamId?: string;
  isBulk?: boolean;
}

export interface PlaylistBatch {
  id: string;
  streamIds: string[];
  createdAt: string;
}

function extractDeviceModel(ua: string): string {
  if (!ua) return '';

  // Samsung Galaxy models: SM-S918B, SM-G998B, SM-A536B, etc.
  const samsungMatch = ua.match(/(SM-[A-Z0-9]+|Galaxy\s+[A-Za-z0-9\s+]+)/i);
  if (samsungMatch) return `Samsung ${samsungMatch[1].trim()}`;

  // Xiaomi / Redmi / POCO models
  const xiaomiMatch = ua.match(/(Redmi\s+[A-Za-z0-9\s]+|POCO\s+[A-Za-z0-9\s]+|Mi\s+[A-Za-z0-9\s]+|22[0-9]{7}[A-Z]|23[0-9]{7}[A-Z]|21[0-9]{7}[A-Z])/i);
  if (xiaomiMatch) return `Xiaomi ${xiaomiMatch[1].trim()}`;

  // Realme / Oppo / Vivo / OnePlus models
  const oppoRealmeMatch = ua.match(/(Realme\s+[A-Za-z0-9\s]+|RMX[0-9]+|CPH[0-9]+|OPPO\s+[A-Za-z0-9\s]+|Vivo\s+[A-Za-z0-9\s]+|V2[0-9]{3}|OnePlus\s+[A-Za-z0-9\s]+|DN2103|NE2213)/i);
  if (oppoRealmeMatch) return oppoRealmeMatch[1].trim();

  // Huawei / Honor models
  const huaweiMatch = ua.match(/(HUAWEI\s+[A-Za-z0-9\s-]+|HONOR\s+[A-Za-z0-9\s-]+|VOG-L29|ELE-L29|ANA-NX9|NOP-AN00)/i);
  if (huaweiMatch) return huaweiMatch[1].trim();

  // Google Pixel models
  const pixelMatch = ua.match(/(Pixel\s+[0-9a-zA-Z\s]+)/i);
  if (pixelMatch) return `Google ${pixelMatch[1].trim()}`;

  // General Android phone model from User-Agent parenthesis
  const androidMatch = ua.match(/\((?:Linux|Android)[^;)]*;\s*(?:U;)?\s*Android[^;)]*;\s*([^;)]+)/i) ||
                       ua.match(/Android\s+[0-9.]+;\s*([^;)]+)/i) ||
                       ua.match(/Build\/([^;\)\s]+)/i);

  if (androidMatch && androidMatch[1]) {
    let model = androidMatch[1].trim().replace(/Build\/.*/i, '').replace(/[\/].*/, '').trim();
    if (model && !model.toLowerCase().includes('khtml') && !model.toLowerCase().includes('wv') && !model.toLowerCase().includes('mobile') && model.length > 2) {
      return model;
    }
  }

  // iOS Apple Devices
  if (ua.includes('iPhone')) {
    const m = ua.match(/iPhone OS\s+([0-9_]+)/i);
    return m ? `iPhone (iOS ${m[1].replace(/_/g, '.')})` : 'هاتف iPhone';
  }
  if (ua.includes('iPad')) return 'جهاز iPad';
  if (ua.includes('Macintosh')) return 'جهاز Mac';
  if (ua.includes('Windows')) return 'كمبيوتر Windows';

  return '';
}

function detectAppName(ua: string, referer?: string): string {
  if (!ua && !referer) return 'مشغل مجهول (بدون بيانات User-Agent)';
  const lowerUA = (ua || '').toLowerCase();
  const lowerRef = (referer || '').toLowerCase();
  const deviceModel = extractDeviceModel(ua);

  let appName = '';

  if (lowerUA.includes('exoplayer')) appName = 'تطبيق ExoPlayer (أندرويد / IPTV)';
  else if (lowerUA.includes('iptv smarters') || lowerUA.includes('smarters')) appName = 'تطبيق IPTV Smarters Pro';
  else if (lowerUA.includes('tivimate')) appName = 'تطبيق TiviMate IPTV';
  else if (lowerUA.includes('xciptv')) appName = 'تطبيق XCIPTV Player';
  else if (lowerUA.includes('ott navigator')) appName = 'تطبيق OTT Navigator';
  else if (lowerUA.includes('televizo')) appName = 'تطبيق Televizo IPTV';
  else if (lowerUA.includes('gse')) appName = 'تطبيق GSE Smart IPTV';
  else if (lowerUA.includes('ssiptv') || lowerUA.includes('ss-iptv')) appName = 'تطبيق SS IPTV';
  else if (lowerUA.includes('smartiptv') || lowerUA.includes('siptv')) appName = 'تطبيق Smart IPTV';
  else if (lowerUA.includes('kodi')) appName = 'مشغل Kodi Media Center';
  else if (lowerUA.includes('vlc')) appName = 'مشغل VLC Media Player';
  else if (lowerUA.includes('lavf') || lowerUA.includes('ffmpeg')) appName = 'محرك FFmpeg / Lavf Player';
  else if (lowerUA.includes('mpv')) appName = 'مشغل MPV Player';
  else if (lowerUA.includes('applecoremedia') || lowerUA.includes('cfnetwork')) appName = 'مشغل iOS / Apple Native Player';
  else if (lowerUA.includes('okhttp')) appName = 'تطبيق أندرويد (OkHttp Client)';
  else if (lowerUA.includes('dalvik')) appName = 'تطبيق أندرويد مخصص (Dalvik VM)';
  else if (lowerUA.includes('python') || lowerUA.includes('requests') || lowerUA.includes('curl') || lowerUA.includes('wget') || lowerUA.includes('scrapy') || lowerUA.includes('go-http-client')) appName = 'أداة سحب تلقائية (Bot / Script)';
  else if (lowerUA.includes('edg/') || lowerUA.includes('edge')) appName = 'متصفح Microsoft Edge';
  else if (lowerUA.includes('chrome')) appName = 'متصفح Google Chrome';
  else if (lowerUA.includes('safari') && !lowerUA.includes('chrome')) appName = 'متصفح Apple Safari';
  else if (lowerUA.includes('firefox')) appName = 'متصفح Mozilla Firefox';
  else if (lowerUA.includes('x-stream') || lowerUA.includes('xtream-master')) appName = 'تطبيق X-Stream Masters';
  else if (lowerUA.includes('dream player')) appName = 'تطبيق Dream Player';
  else if (lowerUA.includes('iptv pro')) appName = 'تطبيق IPTV Pro';

  if (!appName) {
    const pkgMatch = ua.match(/([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)/);
    if (pkgMatch) {
      appName = `تطبيق أندرويد (${pkgMatch[1]})`;
    } else if (referer) {
      try {
        const u = new URL(referer);
        appName = `موقع/تطبيق: ${u.hostname}`;
      } catch {}
    } else {
      appName = `تطبيق خارجي (${ua.substring(0, 30)})`;
    }
  }

  if (deviceModel && !appName.includes(deviceModel)) {
    return `${appName} • هاتف: ${deviceModel}`;
  }

  return appName;
}

function detectOsName(ua: string): string {
  if (!ua) return 'غير معروف';
  const lower = ua.toLowerCase();

  if (lower.includes('tizen')) return 'Samsung Tizen TV';
  if (lower.includes('web0s') || lower.includes('webos')) return 'LG webOS TV';
  if (lower.includes('aft') || lower.includes('firetv') || lower.includes('fire os')) return 'Amazon Fire OS';
  if (lower.includes('roku')) return 'Roku OS';
  if (lower.includes('appletv') || lower.includes('tvos')) return 'Apple tvOS';

  const androidVer = ua.match(/Android\s+([0-9.]+)/i);
  if (androidVer) return `Android ${androidVer[1]}`;
  if (lower.includes('android') || lower.includes('dalvik') || lower.includes('exoplayer') || lower.includes('okhttp')) {
    return 'Android OS';
  }

  const iosVer = ua.match(/(?:iPhone|CPU)\s+OS\s+([0-9_]+)/i);
  if (iosVer) return `iOS ${iosVer[1].replace(/_/g, '.')}`;
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('applecoremedia') || lower.includes('cfnetwork')) {
    return 'Apple iOS / iPadOS';
  }

  if (lower.includes('windows nt 10.0')) return 'Windows 10/11';
  if (lower.includes('windows')) return 'Windows';
  if (lower.includes('macintosh') || lower.includes('mac os x')) return 'macOS';
  if (lower.includes('linux')) return 'Linux';

  return 'نظام غير محدد';
}

function classifyClientType(ua: string, referer?: string): 'iptv_app' | 'browser' | 'bot_scraper' | 'unknown' {
  const lower = (ua || '').toLowerCase();
  if (!lower && !referer) return 'unknown';

  const botKeywords = [
    'python', 'curl', 'wget', 'requests', 'scrapy', 'go-http-client', 'axios',
    'node-fetch', 'undici', 'postman', 'insomnia', 'sqlmap', 'nmap', 'nikto',
    'headless', 'puppeteer', 'playwright', 'phantomjs', 'bot', 'spider', 'crawler', 'httrack'
  ];
  if (botKeywords.some(k => lower.includes(k))) {
    return 'bot_scraper';
  }

  const iptvKeywords = [
    'exoplayer', 'smarters', 'okhttp', 'vlc', 'tivimate', 'xciptv', 'ott navigator',
    'ssiptv', 'ss-iptv', 'smartiptv', 'siptv', 'dalvik', 'kodi', 'lavf', 'ffmpeg',
    'mpv', 'mplayer', 'televizo', 'gse', 'x-stream', 'xtream', 'dream player',
    'iptv pro', 'applecoremedia', 'cfnetwork', 'stagefright', 'libvlc'
  ];
  if (iptvKeywords.some(k => lower.includes(k))) {
    return 'iptv_app';
  }

  if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari') || lower.includes('firefox') || lower.includes('edg/')) {
    return 'browser';
  }

  return 'unknown';
}

function isInternalOrPrivateIp(ip: string): boolean {
  const cleanIp = (ip || '').replace('::ffff:', '').trim().toLowerCase();
  if (!cleanIp || cleanIp === '::1' || cleanIp === 'localhost' || cleanIp === '0.0.0.0') return true;
  if (
    cleanIp.startsWith('127.') ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('169.254.')
  ) {
    return true;
  }
  if (cleanIp.startsWith('172.')) {
    const secondOctet = parseInt(cleanIp.split('.')[1] || '', 10);
    if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) return true;
  }
  if (cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:') || cleanIp.startsWith('fe80:')) return true;
  return false;
}

function isRealExternalViewer(ip: string, ua?: string): boolean {
  if (isInternalOrPrivateIp(ip)) return false;
  const lowerUa = (ua || '').toLowerCase();
  if (
    lowerUa.startsWith('curl/') ||
    lowerUa.startsWith('wget/') ||
    lowerUa.includes('bot') ||
    lowerUa.includes('crawler') ||
    lowerUa.includes('spider') ||
    lowerUa.includes('preview') ||
    lowerUa.includes('headless') ||
    lowerUa.includes('python-requests') ||
    lowerUa.includes('go-http-client')
  ) {
    return false;
  }
  return true;
}

function getClientIp(req: express.Request): string {
  const headerCandidates = [
    req.headers['cf-connecting-ip'],
    req.headers['true-client-ip'],
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
    req.headers['x-forwarded-for']
  ];
  for (const raw of headerCandidates) {
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw.join(',').split(',') : String(raw).split(',');
    for (const item of list) {
      const candidate = item.replace('::ffff:', '').trim();
      if (candidate && !isInternalOrPrivateIp(candidate)) {
        return candidate;
      }
    }
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].replace('::ffff:', '').trim();
  }
  return (req.socket.remoteAddress || req.ip || '').replace('::ffff:', '').trim();
}

// Anti-Hacker & Security Firewall System
export interface BlockedIpRecord {
  ip: string;
  reason: string;
  blockedAt: string;
  attempts?: number;
  expiresAt?: number;
}

export interface SecurityEventLog {
  id: string;
  ip: string;
  type: 'BRUTE_FORCE' | 'DDoS_FLOOD' | 'SECURITY_SCANNER' | 'INJECTION_ATTACK' | 'UNAUTHORIZED_ACCESS';
  details: string;
  timestamp: string;
}

const BLOCKED_IPS_FILE = path.join(__dirname, 'blocked_ips.json');
const SECURITY_LOGS_FILE = path.join(__dirname, 'security_logs.json');

function loadBlockedIps(): BlockedIpRecord[] {
  try {
    if (fs.existsSync(BLOCKED_IPS_FILE)) {
      return JSON.parse(fs.readFileSync(BLOCKED_IPS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveBlockedIps(list: BlockedIpRecord[]) {
  try {
    fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

function loadSecurityLogs(): SecurityEventLog[] {
  try {
    if (fs.existsSync(SECURITY_LOGS_FILE)) {
      return JSON.parse(fs.readFileSync(SECURITY_LOGS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveSecurityLogs(logs: SecurityEventLog[]) {
  try {
    fs.writeFileSync(SECURITY_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch {}
}

let blockedIpsStore = loadBlockedIps();
let securityLogsStore = loadSecurityLogs();

function addSecurityLog(ip: string, type: SecurityEventLog['type'], details: string) {
  const log: SecurityEventLog = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ip,
    type,
    details,
    timestamp: new Date().toISOString()
  };
  securityLogsStore.unshift(log);
  if (securityLogsStore.length > 100) securityLogsStore = securityLogsStore.slice(0, 100);
  saveSecurityLogs(securityLogsStore);
}

function blockIpAddress(ip: string, reason: string, durationMinutes?: number) {
  if (!ip) return;
  const expiresAt = durationMinutes ? Date.now() + (durationMinutes * 60 * 1000) : undefined;
  const existing = blockedIpsStore.find(b => b.ip === ip);
  if (existing) {
    existing.reason = reason;
    existing.blockedAt = new Date().toISOString();
    existing.attempts = (existing.attempts || 1) + 1;
    existing.expiresAt = expiresAt;
  } else {
    blockedIpsStore.unshift({
      ip,
      reason,
      blockedAt: new Date().toISOString(),
      attempts: 1,
      expiresAt
    });
  }
  saveBlockedIps(blockedIpsStore);
}

export interface SecurityPolicyConfig {
  autoBlockVpnProxy: boolean;
  autoBlockDatacenter: boolean;
  autoBlockBots: boolean;
  ddosMaxReqPer10s: number;
  ddosBanMinutes: number;
  bruteForceMaxAttempts: number;
  bruteForceBanMinutes: number;
}

export interface TrafficTimelineBucket {
  minuteKey: string;
  label: string;
  requests: number;
  blocked: number;
  threats: number;
}

const SECURITY_POLICY_FILE = path.join(__dirname, 'security_policy.json');
const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  autoBlockVpnProxy: false,
  autoBlockDatacenter: false,
  autoBlockBots: false,
  ddosMaxReqPer10s: 70,
  ddosBanMinutes: 30,
  bruteForceMaxAttempts: 5,
  bruteForceBanMinutes: 60
};

function loadSecurityPolicy(): SecurityPolicyConfig {
  try {
    if (fs.existsSync(SECURITY_POLICY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SECURITY_POLICY_FILE, 'utf-8'));
      return { ...DEFAULT_SECURITY_POLICY, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SECURITY_POLICY };
}

function saveSecurityPolicy(policy: SecurityPolicyConfig) {
  try {
    fs.writeFileSync(SECURITY_POLICY_FILE, JSON.stringify(policy, null, 2), 'utf-8');
  } catch {}
}

let securityPolicyStore: SecurityPolicyConfig = loadSecurityPolicy();
const trafficTimelineMap = new Map<string, TrafficTimelineBucket>();

function recordTrafficEvent(kind: 'request' | 'blocked' | 'threat') {
  const now = new Date();
  const minuteKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const label = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let bucket = trafficTimelineMap.get(minuteKey);
  if (!bucket) {
    bucket = { minuteKey, label, requests: 0, blocked: 0, threats: 0 };
    trafficTimelineMap.set(minuteKey, bucket);
    if (trafficTimelineMap.size > 40) {
      const oldestKey = trafficTimelineMap.keys().next().value;
      if (oldestKey) trafficTimelineMap.delete(oldestKey);
    }
  }
  if (kind === 'request') bucket.requests += 1;
  if (kind === 'blocked') bucket.blocked += 1;
  if (kind === 'threat') {
    bucket.threats += 1;
    bucket.blocked += 1;
  }
}

function getRecentTrafficTimeline(minutesCount = 15): TrafficTimelineBucket[] {
  const result: TrafficTimelineBucket[] = [];
  const now = Date.now();
  for (let i = minutesCount - 1; i >= 0; i--) {
    const d = new Date(now - i * 60000);
    const minuteKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const existing = trafficTimelineMap.get(minuteKey);
    result.push(existing || { minuteKey, label, requests: 0, blocked: 0, threats: 0 });
  }
  return result;
}

const failedLoginTracker = new Map<string, { count: number; firstAttempt: number }>();
const requestRateTracker = new Map<string, { count: number; windowStart: number }>();

function recordFailedLogin(ip: string) {
  if (!ip) return;
  const now = Date.now();
  const maxAttempts = Math.max(2, Math.min(30, securityPolicyStore.bruteForceMaxAttempts || 5));
  const banMins = Math.max(5, Math.min(10080, securityPolicyStore.bruteForceBanMinutes || 60));
  const item = failedLoginTracker.get(ip);
  if (!item || (now - item.firstAttempt) > 300000) {
    failedLoginTracker.set(ip, { count: 1, firstAttempt: now });
  } else {
    item.count += 1;
    if (item.count >= maxAttempts) {
      blockIpAddress(ip, 'محاولة تخمين كلمة السر بكثرة (Anti-Brute Force Lockout)', banMins);
      addSecurityLog(ip, 'BRUTE_FORCE', `حظر تلقائي: ${item.count} محاولات تخمين كلمة سر فاشلة متتالية`);
      recordTrafficEvent('threat');
      failedLoginTracker.delete(ip);
    }
  }
}

function recordSuccessfulLogin(ip: string) {
  if (ip) failedLoginTracker.delete(ip);
}

// Global Firewall Protection Middleware
app.use((req, res, next) => {
  const ip = getClientIp(req);
  const ua = (req.get('user-agent') || '').toLowerCase();
  const url = (req.originalUrl || req.url || '').toLowerCase();

  const isDashboardPoll =
    url.startsWith('/api/intelligence-radar') ||
    url === '/api/streams' ||
    url === '/api/virtual-xtream' ||
    url.startsWith('/api/security') ||
    url === '/api/config' ||
    url.startsWith('/@') ||
    url.startsWith('/node_modules') ||
    url.startsWith('/src/') ||
    url.startsWith('/assets/');

  if (!isDashboardPoll) {
    recordTrafficEvent('request');
  }

  // 1. Check if IP is in Firewall ban list
  const now = Date.now();
  const blockedRec = blockedIpsStore.find(b => b.ip === ip);
  if (blockedRec) {
    if (blockedRec.expiresAt && now > blockedRec.expiresAt) {
      blockedIpsStore = blockedIpsStore.filter(b => b.ip !== ip);
      saveBlockedIps(blockedIpsStore);
    } else {
      if (!isDashboardPoll) recordTrafficEvent('blocked');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(403).send(`403 Forbidden - IP ${ip} Blocked By Xtream Firewall Shield (${blockedRec.reason})`);
    }
  }

  // 2. Anti-Scanner & Hacker Tool Detection
  const hackerTools = ['sqlmap', 'nmap', 'nikto', 'zgrab', 'masscan', 'gobuster', 'dirbuster', 'w3af', 'hydra', 'medusa', 'burp', 'acunetix', 'nessus', 'metasploit'];
  if (hackerTools.some(tool => ua.includes(tool))) {
    blockIpAddress(ip, 'أداة فحص وتخمين ثغرات امنية (Security Scanner / Sniffer)', 1440);
    addSecurityLog(ip, 'SECURITY_SCANNER', `حظر أداة فحص ثغرات هجومية: ${ua.substring(0, 50)}`);
    recordTrafficEvent('threat');
    return res.status(403).send('403 Forbidden - Security Scanner Blocked');
  }

  // 3. Malicious Injection Attack Inspection
  if (url.includes('union%20select') || url.includes('select%20') || url.includes('information_schema') || url.includes('<script') || url.includes('/etc/passwd')) {
    blockIpAddress(ip, 'محاولة حقن ثغرة أو أوامر خبيثة (Injection Attack)', 1440);
    addSecurityLog(ip, 'INJECTION_ATTACK', `محاولة حقن خبيثة في الرابط: ${url.substring(0, 60)}`);
    recordTrafficEvent('threat');
    return res.status(403).send('403 Forbidden - Injection Attempt Blocked');
  }

  // 4. Optional Auto-Block Bots & Scrapers Policy on Stream/API routes
  const isStreamOrPhp = url.includes('player_api.php') || url.includes('get.php') || url.includes('/live/') || url.includes('/stream/') || url.includes('/api/stream/');
  if (securityPolicyStore.autoBlockBots && isStreamOrPhp) {
    if (classifyClientType(req.get('user-agent') || '', req.get('referer')) === 'bot_scraper') {
      blockIpAddress(ip, 'حظر تلقائي: بوت سحب/كشط محتوى (Auto-Defense Bot Shield)', 180);
      addSecurityLog(ip, 'SECURITY_SCANNER', `تم تفعيل الدرع الآلي ضد Bot/Scraper: ${ua.substring(0, 60)}`);
      recordTrafficEvent('threat');
      return res.status(403).send('403 Forbidden - Automated Scraper Blocked');
    }
  }

  // 5. Anti-DDoS Rate Limiting on Stream & PHP API Endpoints (Configurable Policy)
  if (isStreamOrPhp && ip) {
    const maxReq = Math.max(15, Math.min(500, securityPolicyStore.ddosMaxReqPer10s || 70));
    const banMins = Math.max(5, Math.min(10080, securityPolicyStore.ddosBanMinutes || 30));
    const rateItem = requestRateTracker.get(ip);
    if (!rateItem || (now - rateItem.windowStart) > 10000) {
      requestRateTracker.set(ip, { count: 1, windowStart: now });
    } else {
      rateItem.count += 1;
      if (rateItem.count > maxReq) {
        blockIpAddress(ip, 'هجوم إغراق وسحب متكرر (DDoS / Rate Limit Exceeded)', banMins);
        addSecurityLog(ip, 'DDoS_FLOOD', `تجاوز معدل الطلبات المسموح (${maxReq}/10s): ${rateItem.count} طلب`);
        recordTrafficEvent('threat');
        return res.status(429).send('429 Too Many Requests - IP Flooding Rate Limit');
      }
    }
  }

  next();
});

function checkIsBlocked(
  clientUA: string,
  clientReferer: string,
  clientIP: string,
  blockedList?: string[],
  blockAllExternalApps?: boolean
): boolean {
  const lowerUA = (clientUA || '').toLowerCase();
  const lowerRef = (clientReferer || '').toLowerCase();
  const ip = (clientIP || '').trim();

  // If "Block All External IPTV Apps" master switch is enabled
  if (blockAllExternalApps) {
    const isStandardBrowser = (lowerUA.includes('mozilla') || lowerUA.includes('chrome') || lowerUA.includes('safari') || lowerUA.includes('firefox')) &&
                              !lowerUA.includes('exoplayer') &&
                              !lowerUA.includes('okhttp') &&
                              !lowerUA.includes('dalvik') &&
                              !lowerUA.includes('vlc') &&
                              !lowerUA.includes('tivimate') &&
                              !lowerUA.includes('smarters') &&
                              !lowerUA.includes('xciptv') &&
                              !lowerUA.includes('ott navigator');

    if (!isStandardBrowser || !clientUA) {
      return true; // Block external app / player
    }
  }

  if (!blockedList || blockedList.length === 0) return false;

  return blockedList.some(pattern => {
    if (!pattern) return false;
    const rawP = pattern.trim();
    if (!rawP) return false;
    const lowerP = rawP.toLowerCase();

    // Check direct IP match
    if (ip && (ip === rawP || ip === lowerP)) {
      return true;
    }

    // Strip Arabic letters and decorative symbols to get pure technical tokens
    const cleanPattern = lowerP.replace(/[\u0600-\u06FF]/g, '').replace(/[•()]/g, '').trim();

    if (cleanPattern && cleanPattern.length >= 2) {
      if (lowerUA.includes(cleanPattern) || lowerRef.includes(cleanPattern)) {
        return true;
      }
    }

    if (lowerUA.includes(lowerP) || lowerRef.includes(lowerP) || lowerP.includes(lowerUA)) {
      return true;
    }

    return false;
  });
}

export interface VirtualXtreamAccount {
  id: string;
  title: string;
  realHost: string;
  realUser: string;
  realPass: string;
  virtualUser: string;
  virtualPass: string;
  customVirtualHost?: string;
  maxConnections?: number;
  status: 'active' | 'paused';
  customPosterUrl?: string;
  blockAllExternalApps?: boolean;
  blockedApps?: string[];
  connectedApps?: ConnectedApp[];
  createdAt: string;
  updatedAt: string;
}

function getActiveConnectionsCount(vAcc: VirtualXtreamAccount): number {
  if (!vAcc.connectedApps) return 0;
  const now = Date.now();
  return vAcc.connectedApps.filter(app => {
    if (app.isBlocked) return false;
    const lastActiveMs = new Date(app.lastActive).getTime();
    return (now - lastActiveMs) < 15000;
  }).length;
}

function checkExceedsMaxConnections(vAcc: VirtualXtreamAccount, clientUA: string, clientIP: string): boolean {
  return false; // Unlimited connections enabled
}

const STORAGE_FILE = path.join(__dirname, 'streams_data.json');
const VIRTUAL_XTREAM_FILE = path.join(__dirname, 'virtual_xtream_data.json');
const PLAYLISTS_FILE = path.join(__dirname, 'playlists_data.json');

function generateOpaqueToken(existingTokens?: Set<string>): string {
  for (let i = 0; i < 10; i++) {
    const token = crypto.randomBytes(5).toString('base64url').replace(/[_-]/g, 'x').toLowerCase();
    if (!existingTokens || !existingTokens.has(token)) {
      return token;
    }
  }
  return crypto.randomBytes(6).toString('hex');
}

function loadPlaylists(): PlaylistBatch[] {
  try {
    if (fs.existsSync(PLAYLISTS_FILE)) {
      return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function savePlaylists(list: PlaylistBatch[]) {
  try {
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

let playlistsStore = loadPlaylists();


const INITIAL_STREAMS: StreamItem[] = [
  {
    id: 'stream_bein_1',
    title: '⚽ beIN SPORTS 1 HD - بث مباشر 4K',
    category: 'sports',
    originalUrl: 'https://live-hls-web-aje.akamaized.net/m3u8/out/v1/63102d5b7a8543d889b56d365f5e55e8/index.m3u8',
    slug: 'bein_sports_1',
    streamType: 'hls',
    status: 'active',
    watermarkText: '© جميع الحقوق محفوظة - beIN Sports',
    quality: '4K',
    viewsCount: 1420,
    currentViewers: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customPosterUrl: '/uploads/preset_poster_1.jpg',
    pauseNoticeMessage: 'البث متوقف مؤقتاً',
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: 'stream_aljazeera',
    title: '📺 قناة الجزيرة الإخبارية HD',
    category: 'news',
    originalUrl: 'https://live-hls-web-aje.akamaized.net/m3u8/out/v1/63102d5b7a8543d889b56d365f5e55e8/index.m3u8',
    slug: 'aljazeera_live',
    streamType: 'hls',
    status: 'active',
    watermarkText: '© جميع الحقوق محفوظة - Al Jazeera',
    quality: '1080p',
    viewsCount: 2850,
    currentViewers: 89,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customPosterUrl: '/uploads/preset_poster_2.jpg',
    pauseNoticeMessage: 'البث متوقف مؤقتاً',
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: 'stream_france24',
    title: '🎬 فرانس 24 بالعربية F24 HD',
    category: 'news',
    originalUrl: 'https://static.france24.com/live/F24_AR_HI_HLS/live_tv.m3u8',
    slug: 'france24_live',
    streamType: 'hls',
    status: 'active',
    watermarkText: '© جميع الحقوق محفوظة - France 24',
    quality: '1080p',
    viewsCount: 940,
    currentViewers: 23,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customPosterUrl: '/uploads/preset_poster_1.jpg',
    pauseNoticeMessage: 'البث متوقف مؤقتاً',
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: 'stream_dw',
    title: '🌍 قناة DW عربية الفضائية',
    category: 'general',
    originalUrl: 'https://dwstream4-lh.akamaihd.net/i/dwstream4_live@131329/master.m3u8',
    slug: 'dw_arabic',
    streamType: 'hls',
    status: 'active',
    watermarkText: '© جميع الحقوق محفوظة - DW Arabia',
    quality: '1080p',
    viewsCount: 620,
    currentViewers: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customPosterUrl: '/uploads/preset_poster_2.jpg',
    pauseNoticeMessage: 'البث متوقف مؤقتاً',
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: 'stream_redbull',
    title: '🍿 ريد بول تيفي Live HD',
    category: 'entertainment',
    originalUrl: 'https://rbmn-live.akamaized.net/hls/live/591070/GEO_ROW_1/master.m3u8',
    slug: 'redbull_tv',
    streamType: 'hls',
    status: 'active',
    watermarkText: '© جميع الحقوق محفوظة - Red Bull TV',
    quality: '1080p',
    viewsCount: 1780,
    currentViewers: 54,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customPosterUrl: '/uploads/preset_poster_1.jpg',
    pauseNoticeMessage: 'البث متوقف مؤقتاً',
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  }
];

function ensureStreamTokens(list: StreamItem[]): { list: StreamItem[]; changed: boolean } {
  let changed = false;
  const used = new Set<string>(list.map(s => s.streamToken).filter(Boolean) as string[]);
  const updated = list.map(s => {
    const next: any = { ...s };
    if (!next.streamToken) {
      const token = generateOpaqueToken(used);
      used.add(token);
      next.streamToken = token;
      changed = true;
    }
    if ('shortUrl' in next) {
      delete next.shortUrl;
      changed = true;
    }
    if (Array.isArray(next.connectedApps)) {
      const filteredApps = next.connectedApps.filter((a: ConnectedApp) =>
        isRealExternalViewer(a.ipAddress || '', a.userAgent)
      );
      if (filteredApps.length !== next.connectedApps.length) {
        next.connectedApps = filteredApps;
        changed = true;
      }
    }
    return next as StreamItem;
  });
  return { list: updated, changed };
}

function loadStreams(): StreamItem[] {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const { list, changed } = ensureStreamTokens(parsed);
        if (changed) saveStreams(list);
        return list;
      }
    }
  } catch (err) {
    console.error('Error reading storage file:', err);
  }
  return ensureStreamTokens(INITIAL_STREAMS).list;
}

let streamsSaveTimer: NodeJS.Timeout | null = null;
let latestStreamsPending: StreamItem[] | null = null;

function flushStreamsSync() {
  if (streamsSaveTimer) {
    clearTimeout(streamsSaveTimer);
    streamsSaveTimer = null;
  }
  if (!latestStreamsPending) return;
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(latestStreamsPending, null, 2), 'utf-8');
    latestStreamsPending = null;
  } catch (err) {
    console.error('Error saving storage file:', err);
  }
}

function saveStreams(streams: StreamItem[]) {
  latestStreamsPending = streams;
  if (streamsSaveTimer) return;
  streamsSaveTimer = setTimeout(() => {
    streamsSaveTimer = null;
    const snapshot = latestStreamsPending;
    latestStreamsPending = null;
    if (!snapshot) return;
    fs.promises.writeFile(STORAGE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8').catch(err => {
      console.error('Error saving storage file:', err);
    });
  }, 800);
}

function saveStreamsNow(streams: StreamItem[]) {
  latestStreamsPending = streams;
  flushStreamsSync();
}

process.once('SIGINT', () => { flushStreamsSync(); process.exit(0); });
process.once('SIGTERM', () => { flushStreamsSync(); process.exit(0); });

let streamsStore = loadStreams();

// ==========================================
// Real Live Broadcast Server Engine (/srv/:token.m3u8)
// Supports:
//  1) Real-time Browser/Mobile Studio Camera & Screen -> WebSocket -> FFmpeg -> HLS
//  2) Instant 0ms Live Channel Hot-Swap (External HLS .m3u8 with seamless Discontinuity)
//  3) 24/7 Live Video Loop Channel (MP4 / Uploaded Video -> FFmpeg -> HLS)
// ==========================================
export interface LiveServerSourceItem {
  id: string;
  name: string;
  url: string;
  kind: 'hls' | 'video';
  userAgent?: string;
  referer?: string;
}

export interface LiveServerItem {
  id: string;
  token: string;
  title: string;
  status: 'live' | 'paused';
  activeMode: 'studio' | 'source';
  activeSourceId: string | null;
  sources: LiveServerSourceItem[];
  switchCount: number;
  lastSwitchedAt: string;
  createdAt: string;
  updatedAt: string;
  pauseNoticeMessage?: string;
  customPosterUrl?: string;
  viewsCount: number;
  currentViewers: number;
}

interface LiveServerRuntime {
  serverId: string;
  studioProc: ChildProcess | null;
  studioDir: string;
  studioActive: boolean;
  studioSocketId: string | null;
  studioDisconnectTimer?: ReturnType<typeof setTimeout> | null;
  studioStartedAt: number;
  lastStudioChunkAt: number;
  studioBytesSent: number;
  studioContainer?: 'webm' | 'mp4';
  studioHasAudio?: boolean;
  loopProc: ChildProcess | null;
  loopDir: string;
  loopSourceUrl: string;
  loopActive: boolean;
  nextSeq: number;
  keyToSeq: Map<string, number>;
  discontinuitySeqList: number[];
  lastStreamTag: string;
  resolvedVariantCache?: { sourceUrl: string; epoch: number; variantUrl: string; expiresAt: number };
  activeViewersMap: Map<string, number>;
}

const LIVE_SERVERS_FILE = path.join(__dirname, 'live_servers_data.json');
const LIVE_SERVER_HLS_DIR = path.join(os.tmpdir(), 'live_server_hls');
if (!fs.existsSync(LIVE_SERVER_HLS_DIR)) {
  fs.mkdirSync(LIVE_SERVER_HLS_DIR, { recursive: true });
}

function isStaleTestLiveSource(src: any): boolean {
  if (!src || !src.url) return true;
  const name = String(src.name || '').trim().toLowerCase();
  const url = String(src.url || '').trim().toLowerCase();
  if (name.startsWith('test_')) return true;
  if (url.includes('://localhost:') || url.includes('://127.0.0.1:')) return true;
  if (url.startsWith('/uploads/srv_vid_') || url.includes('/uploads/srv_vid_')) {
    const fileName = path.basename(url.split('?')[0]);
    if (!fs.existsSync(path.join(UPLOADS_DIR, fileName))) {
      return true;
    }
  }
  return false;
}

function sanitizeLiveServerItem(item: any): LiveServerItem | null {
  if (!item || !item.id || !item.token || !item.title) return null;
  if (String(item.id) === 'lsrv_1794928526200_iry2' || String(item.token) === 'srv15ca2') {
    return null;
  }
  const rawSources = Array.isArray(item.sources) ? item.sources : [];
  const cleanSources: LiveServerSourceItem[] = rawSources.filter((src: any) => !isStaleTestLiveSource(src));
  let activeSourceId = item.activeSourceId ? String(item.activeSourceId) : null;
  if (activeSourceId && !cleanSources.some(s => s.id === activeSourceId)) {
    activeSourceId = cleanSources[0]?.id || null;
  }
  return {
    id: String(item.id),
    token: String(item.token),
    title: String(item.title),
    status: item.status === 'paused' ? 'paused' : 'live',
    activeMode: 'source',
    activeSourceId,
    sources: cleanSources,
    switchCount: Number(item.switchCount) || 1,
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: String(item.updatedAt || new Date().toISOString()),
    lastSwitchedAt: String(item.lastSwitchedAt || new Date().toISOString()),
    pauseNoticeMessage: String(item.pauseNoticeMessage || 'البث متوقف مؤقتاً من غرفة التحكم'),
    customPosterUrl: String(item.customPosterUrl || '/uploads/preset_poster_1.jpg'),
    viewsCount: Number(item.viewsCount) || 0,
    currentViewers: 0
  };
}

function loadLiveServers(): LiveServerItem[] {
  try {
    if (fs.existsSync(LIVE_SERVERS_FILE)) {
      const raw = fs.readFileSync(LIVE_SERVERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map(sanitizeLiveServerItem)
          .filter((x): x is LiveServerItem => Boolean(x));
        if (cleaned.length !== parsed.length) {
          saveLiveServersNow(cleaned);
        }
        return cleaned;
      }
    }
  } catch (err) {
    console.error('Error loading live servers:', err);
  }
  return [];
}

let liveServersStore: LiveServerItem[] = loadLiveServers();
const liveServerRuntimes = new Map<string, LiveServerRuntime>();

function saveLiveServersNow(list: LiveServerItem[] = liveServersStore) {
  try {
    const tmpFile = `${LIVE_SERVERS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmpFile, LIVE_SERVERS_FILE);
  } catch (err) {
    console.error('Error saving live servers:', err);
  }
}

function getLiveServerRuntime(serverId: string): LiveServerRuntime {
  let rt = liveServerRuntimes.get(serverId);
  if (!rt) {
    rt = {
      serverId,
      studioProc: null,
      studioDir: path.join(LIVE_SERVER_HLS_DIR, serverId, 'studio'),
      studioActive: false,
      studioSocketId: null,
      studioStartedAt: 0,
      lastStudioChunkAt: 0,
      studioBytesSent: 0,
      loopProc: null,
      loopDir: path.join(LIVE_SERVER_HLS_DIR, serverId, 'loop'),
      loopSourceUrl: '',
      loopActive: false,
      nextSeq: 100,
      keyToSeq: new Map(),
      discontinuitySeqList: [],
      lastStreamTag: '',
      activeViewersMap: new Map()
    };
    liveServerRuntimes.set(serverId, rt);
  }
  return rt;
}

function killChildSafely(proc: ChildProcess | null) {
  if (!proc) return;
  try {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.end();
    }
  } catch {}
  try {
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {}
    }, 900);
  } catch {}
}

function stopLiveServerStudio(serverId: string) {
  const rt = liveServerRuntimes.get(serverId);
  if (!rt) return;
  if (rt.studioDisconnectTimer) {
    clearTimeout(rt.studioDisconnectTimer);
    rt.studioDisconnectTimer = null;
  }
  if (rt.studioProc) {
    killChildSafely(rt.studioProc);
    rt.studioProc = null;
  }
  rt.studioActive = false;
  rt.studioSocketId = null;
  rt.studioStartedAt = 0;
  rt.lastStudioChunkAt = 0;
  rt.studioBytesSent = 0;
  try {
    if (fs.existsSync(rt.studioDir)) {
      fs.rmSync(rt.studioDir, { recursive: true, force: true });
    }
  } catch {}
}

function startLiveServerStudioPipeline(
  srv: LiveServerItem,
  options: { container?: 'webm' | 'mp4'; hasAudio?: boolean; socketId?: string | null }
) {
  stopLiveServerLoop(srv.id);
  stopLiveServerStudio(srv.id);

  const rt = getLiveServerRuntime(srv.id);
  fs.mkdirSync(rt.studioDir, { recursive: true });

  const inputFormat = options.container === 'mp4' ? 'mp4' : 'webm';
  const hasAudio = options.hasAudio !== false;
  const startNum = Math.floor(Date.now() / 1000) % 1000000;

  // IMPORTANT: Do NOT set tiny probesize (32KB) or +nobuffer on WebM/MP4 pipe:0
  // Tiny probesize consumes the initial keyframe during stream probing and causes
  // VP8 "Discarding interframe without a prior keyframe!" & 0-second segments.
  const args: string[] = [
    '-y',
    '-loglevel', 'warning',
    '-probesize', '500000',
    '-analyzeduration', '1500000',
    '-fflags', '+genpts+discardcorrupt',
    '-f', inputFormat,
    '-i', 'pipe:0'
  ];

  if (!hasAudio) {
    args.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest'
    );
  } else {
    args.push('-map', '0:v:0', '-map', '0:a?');
  }

  args.push(
    '-threads', '2',
    '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:flags=fast_bilinear,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    '-r', '25',
    '-vsync', 'cfr',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-g', '25',
    '-keyint_min', '25',
    '-sc_threshold', '0',
    '-b:v', '1400k',
    '-maxrate', '1800k',
    '-bufsize', '2000k',
    '-max_muxing_queue_size', '1024',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-start_number', String(startNum),
    '-hls_flags', 'delete_segments+omit_endlist+temp_file',
    '-hls_segment_filename', path.join(rt.studioDir, 'seg%d.ts'),
    path.join(rt.studioDir, 'index.m3u8')
  );

  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  rt.studioProc = proc;
  rt.studioActive = true;
  rt.studioSocketId = options.socketId || null;
  rt.studioStartedAt = Date.now();
  rt.lastStudioChunkAt = Date.now();
  rt.studioBytesSent = 0;
  rt.studioContainer = inputFormat;
  rt.studioHasAudio = hasAudio;

  proc.stdin?.on('error', () => {});
  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg && !msg.includes('deprecated pixel format')) {
      console.warn(`[StudioFFmpeg ${srv.token}]`, msg.slice(0, 260));
    }
  });
  proc.on('exit', (code) => {
    if (rt.studioProc === proc) {
      rt.studioProc = null;
      rt.studioActive = false;
      rt.studioSocketId = null;
      if (globalIo) {
        globalIo.emit('live-studio:ended', { serverId: srv.id, code });
      }
      broadcastLiveServerUpdate(srv);
    }
  });

  srv.activeMode = 'studio';
  srv.status = 'live';
  srv.switchCount += 1;
  srv.lastSwitchedAt = new Date().toISOString();
  srv.updatedAt = srv.lastSwitchedAt;
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  return rt;
}

function stopLiveServerLoop(serverId: string) {
  const rt = liveServerRuntimes.get(serverId);
  if (!rt) return;
  if (rt.loopProc) {
    killChildSafely(rt.loopProc);
    rt.loopProc = null;
  }
  rt.loopActive = false;
  rt.loopSourceUrl = '';
  try {
    if (fs.existsSync(rt.loopDir)) {
      fs.rmSync(rt.loopDir, { recursive: true, force: true });
    }
  } catch {}
}

function stopAllLiveServerProcesses() {
  for (const serverId of Array.from(liveServerRuntimes.keys())) {
    stopLiveServerStudio(serverId);
    stopLiveServerLoop(serverId);
  }
}

process.on('exit', stopAllLiveServerProcesses);

function serializeLiveServer(s: LiveServerItem) {
  const rt = liveServerRuntimes.get(s.id);
  const now = Date.now();
  let viewers = 0;
  if (rt) {
    for (const [k, ts] of rt.activeViewersMap.entries()) {
      if (now - ts <= 16000) viewers++;
      else rt.activeViewersMap.delete(k);
    }
  }
  return {
    ...s,
    currentViewers: viewers,
    studioActive: !!(rt && rt.studioActive),
    studioStartedAt: rt?.studioStartedAt || 0,
    studioBytesSent: rt?.studioBytesSent || 0,
    loopActive: !!(rt && rt.loopActive)
  };
}

function broadcastLiveServerUpdate(s: LiveServerItem) {
  if (globalIo) {
    globalIo.emit('live-server:updated', serializeLiveServer(s));
  }
}

function detectSourceKind(url: string): 'hls' | 'video' {
  const lower = (url || '').trim().toLowerCase().split('?')[0];
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.mkv') || lower.endsWith('.webm') || lower.startsWith('/uploads/')) {
    return 'video';
  }
  return 'hls';
}

function ensureStandbyLoadingTs(): string | null {
  const target = path.join(UPLOADS_DIR, 'standby_loading.ts');
  try {
    if (fs.existsSync(target) && fs.statSync(target).size > 2048) {
      return target;
    }
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=#080c14:s=1280x720:r=25',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', '2',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-g', '25',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-shortest',
        '-f', 'mpegts',
        target
      ],
      { stdio: 'pipe', timeout: 10000 }
    );
    if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  } catch (err) {
    console.warn('Standby loading TS generation fallback:', err);
  }
  const preset1Ts = path.join(UPLOADS_DIR, 'preset_poster_1.ts');
  return fs.existsSync(preset1Ts) ? preset1Ts : null;
}

function localFileHasAudio(filePath: string): boolean {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath],
      { encoding: 'utf-8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return String(out || '').trim().length > 0;
  } catch {
    return true;
  }
}

function startVideoLoopPipeline(server: LiveServerItem, source: LiveServerSourceItem): boolean {
  const rt = getLiveServerRuntime(server.id);
  if (rt.loopActive && rt.loopProc && rt.loopSourceUrl === source.url) {
    return true;
  }
  stopLiveServerLoop(server.id);
  fs.mkdirSync(rt.loopDir, { recursive: true });

  let inputPath = source.url.trim();
  let isLocalFile = false;
  if (inputPath.includes('/uploads/')) {
    const rawName = inputPath.split('/uploads/')[1]?.split('?')[0] || '';
    const safeName = path.basename(rawName);
    const localFile = path.join(UPLOADS_DIR, safeName);
    if (safeName && fs.existsSync(localFile)) {
      inputPath = localFile;
      isLocalFile = true;
    } else if (inputPath.startsWith('/uploads/')) {
      return false;
    }
  }

  const hasAudio = isLocalFile ? localFileHasAudio(inputPath) : true;
  const args: string[] = ['-y', '-loglevel', 'warning', '-probesize', '131072', '-analyzeduration', '500000', '-fflags', '+genpts+discardcorrupt'];
  if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
    if (source.userAgent) args.push('-user_agent', source.userAgent);
    if (source.referer) args.push('-headers', `Referer: ${source.referer}\r\n`);
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '3');
  }

  const startNum = Math.floor(Date.now() / 1000) % 1000000;
  args.push('-threads', '2', '-re', '-stream_loop', '-1', '-i', inputPath);

  if (!hasAudio) {
    args.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest'
    );
  } else {
    args.push('-map', '0:v:0', '-map', '0:a?');
  }

  args.push(
    '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:flags=fast_bilinear,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    '-r', '25',
    '-vsync', 'cfr',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-g', '25',
    '-keyint_min', '25',
    '-sc_threshold', '0',
    '-b:v', '1600k',
    '-maxrate', '2200k',
    '-bufsize', '2200k',
    '-max_muxing_queue_size', '1024',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '6',
    '-start_number', String(startNum),
    '-hls_flags', 'delete_segments+omit_endlist+temp_file',
    '-hls_segment_filename', path.join(rt.loopDir, 'seg%d.ts'),
    path.join(rt.loopDir, 'index.m3u8')
  );

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  rt.loopProc = proc;
  rt.loopActive = true;
  rt.loopSourceUrl = source.url;

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg && !msg.includes('deprecated pixel format')) {
      console.warn(`[LiveLoop ${server.token}]`, msg.slice(0, 200));
    }
  });

  proc.on('exit', () => {
    if (rt.loopProc === proc) {
      rt.loopProc = null;
      rt.loopActive = false;
    }
  });

  return true;
}

async function waitForLocalHlsPlaylist(dir: string, timeoutMs = 4500): Promise<string | null> {
  const manifestPath = path.join(dir, 'index.m3u8');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(manifestPath)) {
        const text = fs.readFileSync(manifestPath, 'utf-8');
        if (/\.ts/m.test(text) && /#EXTINF:/m.test(text)) {
          return text;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

function buildMonotonicHlsPlaylist(
  rt: LiveServerRuntime,
  streamTag: string | number,
  segments: { key: string; extinf: string; uri: string; preTags?: string[] }[],
  targetDuration = 4
): string {
  const tagStr = String(streamTag);
  const segSeqs: number[] = [];

  for (const seg of segments) {
    let seq = rt.keyToSeq.get(seg.key);
    if (seq === undefined) {
      seq = rt.nextSeq++;
      rt.keyToSeq.set(seg.key, seq);
      if (rt.lastStreamTag && rt.lastStreamTag !== tagStr) {
        rt.discontinuitySeqList.push(seq);
      }
      rt.lastStreamTag = tagStr;
    }
    segSeqs.push(seq);
  }

  const firstSeq = segSeqs[0] ?? rt.nextSeq;
  const discSeq = rt.discontinuitySeqList.filter(d => d < firstSeq).length;
  const discSet = new Set(rt.discontinuitySeqList);

  if (rt.keyToSeq.size > 150) {
    const excess = rt.keyToSeq.size - 100;
    let count = 0;
    for (const k of rt.keyToSeq.keys()) {
      rt.keyToSeq.delete(k);
      if (++count >= excess) break;
    }
  }
  if (rt.discontinuitySeqList.length > 60) {
    rt.discontinuitySeqList = rt.discontinuitySeqList.filter(d => d >= firstSeq - 40);
  }

  const lines: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.max(2, Math.ceil(targetDuration))}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstSeq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`
  ];

  segments.forEach((seg, idx) => {
    if (discSet.has(segSeqs[idx])) {
      lines.push('#EXT-X-DISCONTINUITY');
    }
    if (seg.preTags && seg.preTags.length > 0) {
      seg.preTags.forEach(t => lines.push(t));
    }
    lines.push(seg.extinf);
    lines.push(seg.uri);
  });

  return lines.join('\n') + '\n';
}

function parseBestVariantFromMaster(masterText: string, masterBaseUrl: string): string | null {
  const lines = masterText.split('\n');
  const candidates: { bw: number; isAudioOnly: boolean; url: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const bw = bwMatch ? Number(bwMatch[1]) : 1000000;
      const codecsMatch = line.match(/CODECS="([^"]+)"/i);
      const codecs = codecsMatch ? codecsMatch[1].toLowerCase() : '';
      const hasResolution = /RESOLUTION=\d+x\d+/i.test(line);
      const isAudioOnly = !hasResolution && codecs.includes('mp4a') && !codecs.includes('avc') && !codecs.includes('hev') && !codecs.includes('hvc');

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next.startsWith('#')) {
          if (next.startsWith('#EXT-X-STREAM-INF:')) break;
          continue;
        }
        candidates.push({
          bw,
          isAudioOnly,
          url: resolveRelativeUrl(next, masterBaseUrl)
        });
        break;
      }
    }
  }

  if (candidates.length === 0) return null;
  const videoCandidates = candidates.filter(c => !c.isAudioOnly);
  const pool = videoCandidates.length > 0 ? videoCandidates : candidates;
  pool.sort((a, b) => b.bw - a.bw);
  return pool[0].url;
}

async function fetchLiveServerExternalSegments(
  server: LiveServerItem,
  rt: LiveServerRuntime,
  source: LiveServerSourceItem,
  publicBaseUrl: string
): Promise<{
  targetDuration: number;
  segments: { key: string; extinf: string; uri: string; preTags?: string[] }[];
  autoVideoFallback?: boolean;
  isPausedInternal?: boolean;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let rawUrl = source.url.trim();
    let effectiveUA = source.userAgent;
    let effectiveReferer = source.referer;

    // Resolve internal /v/:slug or /m/:slug stream links directly from streamsStore (bypasses AI Studio proxy login!)
    const localSlugMatch = rawUrl.match(/\/(?:v|m)\/([a-zA-Z0-9_-]+)(?:\.m3u8)?(?:\?|$)/i);
    if (localSlugMatch && localSlugMatch[1]) {
      const localMatch = streamsStore.find(
        s => s.streamToken === localSlugMatch[1] || s.slug === localSlugMatch[1] || s.id === localSlugMatch[1]
      );
      if (localMatch) {
        if (localMatch.status === 'paused') {
          clearTimeout(timeout);
          return { targetDuration: 3, segments: [], isPausedInternal: true };
        }
        rawUrl = localMatch.originalUrl.trim();
        effectiveUA = effectiveUA || localMatch.userAgentHeader || undefined;
        effectiveReferer = effectiveReferer || localMatch.refererHeader || undefined;
      }
    }

    let fetchTargetUrl = rawUrl;
    if (
      rt.resolvedVariantCache &&
      rt.resolvedVariantCache.sourceUrl === fetchTargetUrl &&
      rt.resolvedVariantCache.epoch === server.switchCount &&
      Date.now() < rt.resolvedVariantCache.expiresAt
    ) {
      fetchTargetUrl = rt.resolvedVariantCache.variantUrl;
    }

    let resp = await fetch(fetchTargetUrl, {
      headers: getObfuscatedUpstreamHeaders(effectiveUA, effectiveReferer),
      signal: controller.signal
    }).catch(() => null);

    if ((!resp || !resp.ok) && fetchTargetUrl !== rawUrl) {
      rt.resolvedVariantCache = undefined;
      fetchTargetUrl = rawUrl;
      resp = await fetch(fetchTargetUrl, {
        headers: getObfuscatedUpstreamHeaders(effectiveUA, effectiveReferer),
        signal: controller.signal
      }).catch(() => null);
    }

    if (resp && (resp.status === 403 || resp.status === 406) && !effectiveUA) {
      resp = await fetch(fetchTargetUrl, {
        headers: getObfuscatedUpstreamHeaders('VLC/3.0.18 LibVLC/3.0.18', effectiveReferer),
        signal: controller.signal
      }).catch(() => null);
    }

    if (!resp || !resp.ok) {
      clearTimeout(timeout);
      return null;
    }

    const respCt = (resp.headers.get('content-type') || '').toLowerCase();
    if (respCt.startsWith('video/') || respCt === 'application/octet-stream') {
      clearTimeout(timeout);
      return { targetDuration: 2, segments: [], autoVideoFallback: true };
    }

    let text = await resp.text();
    if (!text.includes('#EXTM3U')) {
      clearTimeout(timeout);
      return null;
    }

    let finalOriginUrl = resp.url || fetchTargetUrl;
    let lastSlash = finalOriginUrl.lastIndexOf('/');
    let baseUrl = lastSlash !== -1 ? finalOriginUrl.substring(0, lastSlash + 1) : finalOriginUrl;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const bestVariant = parseBestVariantFromMaster(text, baseUrl);
      if (!bestVariant) {
        clearTimeout(timeout);
        return null;
      }
      rt.resolvedVariantCache = {
        sourceUrl: rawUrl,
        epoch: server.switchCount,
        variantUrl: bestVariant,
        expiresAt: Date.now() + 60000
      };
      const varResp = await fetch(bestVariant, {
        headers: getObfuscatedUpstreamHeaders(effectiveUA, effectiveReferer),
        signal: controller.signal
      }).catch(() => null);
      if (!varResp || !varResp.ok) {
        clearTimeout(timeout);
        return null;
      }
      text = await varResp.text();
      finalOriginUrl = varResp.url || bestVariant;
      lastSlash = finalOriginUrl.lastIndexOf('/');
      baseUrl = lastSlash !== -1 ? finalOriginUrl.substring(0, lastSlash + 1) : finalOriginUrl;
    }

    clearTimeout(timeout);

    const tdMatch = text.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/);
    const targetDuration = tdMatch ? Math.ceil(Number(tdMatch[1])) : 4;
    const proxyBase = `${publicBaseUrl}/srv/${encodeURIComponent(server.token)}/seg?e=${server.switchCount}&u=`;

    const lines = text.split('\n');
    const segments: { key: string; extinf: string; uri: string; preTags?: string[] }[] = [];
    let pendingPreTags: string[] = [];
    let pendingExtinf: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        pendingExtinf = line;
      } else if (line.startsWith('#EXT-X-KEY:') || line.startsWith('#EXT-X-MAP:') || line.startsWith('#EXT-X-BYTERANGE:')) {
        pendingPreTags.push(rewriteTagUriAttributes(line, baseUrl, proxyBase, true));
      } else if (line.startsWith('#')) {
        continue;
      } else if (pendingExtinf) {
        const resolved = resolveRelativeUrl(line, baseUrl);
        segments.push({
          key: `${server.switchCount}:${resolved}`,
          extinf: pendingExtinf,
          uri: `${proxyBase}${encodeURIComponent(resolved)}`,
          preTags: pendingPreTags.length > 0 ? [...pendingPreTags] : undefined
        });
        pendingExtinf = null;
        pendingPreTags = [];
      }
    }

    if (segments.length === 0) return null;
    return { targetDuration, segments: segments.slice(-5) };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function parseLocalFfmpegSegments(
  manifestText: string,
  publicBaseUrl: string,
  token: string,
  mode: 'studio' | 'loop',
  epoch: number
): { targetDuration: number; segments: { key: string; extinf: string; uri: string }[] } {
  const tdMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/);
  const targetDuration = tdMatch ? Math.ceil(Number(tdMatch[1])) : 2;
  const segments: { key: string; extinf: string; uri: string }[] = [];
  const lines = manifestText.split('\n');
  let pendingExtinf: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      pendingExtinf = line;
    } else if (!line.startsWith('#') && pendingExtinf) {
      const segName = path.basename(line);
      segments.push({
        key: `${epoch}:${mode}:${segName}`,
        extinf: pendingExtinf,
        uri: `${publicBaseUrl}/srv/${encodeURIComponent(token)}/lseg/${mode}/${encodeURIComponent(segName)}?e=${epoch}`
      });
      pendingExtinf = null;
    }
  }
  return { targetDuration, segments };
}

function cleanCustomVirtualHost(rawHost?: string): string | undefined {
  if (!rawHost) return undefined;
  let trimmed = rawHost.trim().replace(/\/$/, '');
  if (!trimmed) return undefined;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function loadVirtualXtream(): VirtualXtreamAccount[] {
  let loadedAccounts: VirtualXtreamAccount[] = [];
  try {
    if (fs.existsSync(VIRTUAL_XTREAM_FILE)) {
      const data = fs.readFileSync(VIRTUAL_XTREAM_FILE, 'utf-8');
      const accounts: VirtualXtreamAccount[] = JSON.parse(data);
      if (Array.isArray(accounts)) {
        loadedAccounts = accounts
          .filter(acc => !acc.id.startsWith('px_'))
          .map(acc => {
            if (acc.customVirtualHost && (acc.customVirtualHost.includes('1n3xor7x9') || acc.customVirtualHost.includes('streamrelay'))) {
              acc.customVirtualHost = '';
            }
            if (acc.customVirtualHost) {
              acc.customVirtualHost = cleanCustomVirtualHost(acc.customVirtualHost);
            }
            if (Array.isArray(acc.connectedApps)) {
              acc.connectedApps = acc.connectedApps.filter(a =>
                isRealExternalViewer(a.ipAddress || '', a.userAgent)
              );
            }
            return acc;
          });
      }
    }
  } catch (err) {
    console.error('Error reading virtual xtream storage:', err);
  }

  return loadedAccounts;
}

function saveVirtualXtream(accounts: VirtualXtreamAccount[]) {
  try {
    fs.writeFileSync(VIRTUAL_XTREAM_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving virtual xtream storage:', err);
  }
}

let virtualXtreamStore = loadVirtualXtream();

const ipGeoCache: Record<string, any> = {};

async function fetchRealIpGeoDetails(ip: string, forceRefresh = false): Promise<any> {
  const cleanIp = (ip || '').replace('::ffff:', '').trim();

  // Never query GeoIP for empty or internal/loopback IPs (prevents fake server datacenter locations)
  if (!cleanIp || isInternalOrPrivateIp(cleanIp)) {
    return {};
  }

  const cacheKey = cleanIp;
  if (!forceRefresh && ipGeoCache[cacheKey]) {
    return ipGeoCache[cacheKey];
  }

  // Primary: ip-api.com (rich fields including mobile/proxy/hosting/asn/coords)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const apiUrl = cleanIp ? `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=66846719` : `http://ip-api.com/json/?fields=66846719`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const result = {
          ip: data.query || cleanIp,
          country: data.country || 'غير معروف',
          countryCode: data.countryCode || '',
          region: data.region || '',
          regionName: data.regionName || '',
          city: data.city || '',
          isp: data.isp || data.org || '',
          org: data.org || '',
          lat: data.lat,
          lon: data.lon,
          zip: data.zip,
          timezone: data.timezone,
          as: data.as,
          mobile: !!data.mobile,
          proxy: !!data.proxy,
          hosting: !!data.hosting
        };

        ipGeoCache[cacheKey] = result;
        return result;
      }
    }
  } catch (err) {
    console.warn('Primary IP Geolocation lookup error:', err);
  }

  // Secondary HTTPS Fallback: ipwho.is
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const fallbackUrl = cleanIp ? `https://ipwho.is/${encodeURIComponent(cleanIp)}` : `https://ipwho.is/`;
    const res = await fetch(fallbackUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        const conn = data.connection || {};
        const sec = data.security || {};
        const result = {
          ip: data.ip || cleanIp,
          country: data.country || 'غير معروف',
          countryCode: data.country_code || '',
          region: data.region_code || '',
          regionName: data.region || '',
          city: data.city || '',
          isp: conn.isp || conn.org || '',
          org: conn.org || '',
          lat: data.latitude,
          lon: data.longitude,
          zip: data.postal || '',
          timezone: data.timezone?.id || '',
          as: conn.asn ? `AS${conn.asn} ${conn.org || ''}`.trim() : '',
          mobile: conn.type === 'cellular' || false,
          proxy: !!(sec.proxy || sec.vpn || sec.tor),
          hosting: !!(sec.hosting)
        };
        ipGeoCache[cacheKey] = result;
        return result;
      }
    }
  } catch (err) {
    console.warn('Secondary IP Geolocation fallback error:', err);
  }

  return {
    ip: cleanIp,
    country: 'غير معروف',
    countryCode: '',
    region: '',
    regionName: '',
    city: '',
    isp: '',
    mobile: false,
    proxy: false,
    hosting: false
  };
}

function computeDeviceFingerprint(ip: string, ua: string, acceptLang?: string): string {
  const raw = `${ip || 'noip'}|${ua || 'noua'}|${acceptLang || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 12).toUpperCase();
}

function appendAccessHistory(app: ConnectedApp, endpoint: string | undefined, nowIso: string) {
  if (!endpoint) return;
  if (!app.accessHistory) app.accessHistory = [];
  const last = app.accessHistory[0];
  if (last && last.endpoint === endpoint) {
    last.timestamp = nowIso;
  } else {
    app.accessHistory.unshift({ endpoint, timestamp: nowIso });
    if (app.accessHistory.length > 10) {
      app.accessHistory = app.accessHistory.slice(0, 10);
    }
  }
}

function computeConnectionRiskAndRate(app: any, nowMs: number) {
  const firstMs = app.firstSeen ? new Date(app.firstSeen).getTime() : (app.lastActive ? new Date(app.lastActive).getTime() : nowMs);
  const lastMs = app.lastActive ? new Date(app.lastActive).getTime() : nowMs;
  const sessionDurationSec = Math.max(0, Math.round((lastMs - firstMs) / 1000));
  const durationMinutes = Math.max(1, sessionDurationSec / 60);
  const requestsPerMinute = Math.round(((app.requestCount || 1) / durationMinutes) * 10) / 10;

  let riskScore = 0;
  const riskReasons: string[] = [];

  if (app.proxy) {
    riskScore += 35;
    riskReasons.push('اتصال عبر VPN / Proxy');
  }
  if (app.hosting) {
    riskScore += 30;
    riskReasons.push('عنوان مركز بيانات / سيرفر (Hosting)');
  }
  if (app.clientType === 'bot_scraper') {
    riskScore += 40;
    riskReasons.push('أداة سحب تلقائية أو سكربت (Bot)');
  }
  if (!app.userAgent || app.userAgent === 'unknown-app-client') {
    riskScore += 20;
    riskReasons.push('بدون بصمة User-Agent');
  }
  if (requestsPerMinute > 30) {
    riskScore += 25;
    riskReasons.push(`معدل طلبات مرتفع (${requestsPerMinute}/دقيقة)`);
  }
  if (app.forwardedChain && app.forwardedChain.includes(',')) {
    riskScore += 15;
    riskReasons.push('سلسلة بروكسي متعددة (Multi-Hop)');
  }
  if (app.isBlocked || app.isGlobalIpBlocked) {
    riskScore = Math.max(riskScore, 85);
    riskReasons.push('مقيد أو محظور أمنياً');
  }

  return {
    sessionDurationSec,
    requestsPerMinute,
    riskScore: Math.min(100, riskScore),
    riskReasons
  };
}

async function trackVirtualAccountApp(
  vAcc: VirtualXtreamAccount,
  clientUA: string,
  clientReferer: string,
  clientIP: string,
  endpoint?: string,
  extra?: { acceptLanguage?: string; forwardedChain?: string }
) {
  if (!isRealExternalViewer(clientIP, clientUA)) return;
  if (!vAcc.connectedApps) vAcc.connectedApps = [];
  const appName = detectAppName(clientUA, clientReferer);
  const deviceModel = extractDeviceModel(clientUA);
  const osName = detectOsName(clientUA);
  const clientType = classifyClientType(clientUA, clientReferer);
  const uaKey = clientUA || clientReferer || 'unknown-app-client';
  const geo = await fetchRealIpGeoDetails(clientIP);
  const fingerprint = computeDeviceFingerprint(clientIP, uaKey, extra?.acceptLanguage);

  const isBlockedApp = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
  const nowIso = new Date().toISOString();

  let existingApp = vAcc.connectedApps.find(a =>
    a.userAgent === uaKey ||
    (a.ipAddress && clientIP && a.ipAddress === clientIP) ||
    (a.appName === appName && appName !== 'مشغل مجهول (بدون بيانات User-Agent)')
  );

  if (existingApp) {
    existingApp.requestCount += 1;
    existingApp.lastActive = nowIso;
    if (!existingApp.firstSeen) existingApp.firstSeen = nowIso;
    if (endpoint) existingApp.lastEndpoint = endpoint;
    appendAccessHistory(existingApp, endpoint, nowIso);
    existingApp.osName = osName;
    existingApp.clientType = clientType;
    existingApp.deviceFingerprint = fingerprint;
    if (extra?.acceptLanguage) existingApp.acceptLanguage = extra.acceptLanguage;
    if (extra?.forwardedChain) existingApp.forwardedChain = extra.forwardedChain;
    existingApp.isBlocked = isBlockedApp;
    if (deviceModel) existingApp.deviceModel = deviceModel;
    if (clientIP) existingApp.ipAddress = clientIP;
    if (clientReferer) existingApp.referer = clientReferer;
    if (clientUA && (!existingApp.userAgent || existingApp.userAgent === 'unknown-app-client')) existingApp.userAgent = clientUA;
    if (geo.country) existingApp.country = geo.country;
    if (geo.countryCode) existingApp.countryCode = geo.countryCode;
    if (geo.city) existingApp.city = geo.city;
    if (geo.regionName) existingApp.regionName = geo.regionName;
    if (geo.isp) existingApp.isp = geo.isp;
    if (geo.lat) existingApp.lat = geo.lat;
    if (geo.lon) existingApp.lon = geo.lon;
    if (geo.zip) existingApp.zip = geo.zip;
    if (geo.timezone) existingApp.timezone = geo.timezone;
    if (geo.as) existingApp.as = geo.as;
    existingApp.mobile = !!geo.mobile;
    existingApp.proxy = !!geo.proxy;
    existingApp.hosting = !!geo.hosting;
    if (clientIP && geo.proxy && securityPolicyStore.autoBlockVpnProxy && !blockedIpsStore.some(b => b.ip === clientIP)) {
      blockIpAddress(clientIP, 'حظر تلقائي: اتصال عبر VPN/Proxy (Auto-Defense Policy)', 120);
      addSecurityLog(clientIP, 'UNAUTHORIZED_ACCESS', 'الدرع الآلي: حظر IP يمر عبر VPN/Proxy');
      recordTrafficEvent('threat');
    }
    if (clientIP && geo.hosting && securityPolicyStore.autoBlockDatacenter && !blockedIpsStore.some(b => b.ip === clientIP)) {
      blockIpAddress(clientIP, 'حظر تلقائي: استضافة سحابية / Datacenter (Auto-Defense Policy)', 120);
      addSecurityLog(clientIP, 'UNAUTHORIZED_ACCESS', 'الدرع الآلي: حظر IP تابع لمركز بيانات/استضافة');
      recordTrafficEvent('threat');
    }
  } else {
    const created: ConnectedApp = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userAgent: uaKey,
      appName,
      deviceModel: deviceModel || undefined,
      osName,
      clientType,
      deviceFingerprint: fingerprint,
      acceptLanguage: extra?.acceptLanguage || undefined,
      forwardedChain: extra?.forwardedChain || undefined,
      ipAddress: clientIP || undefined,
      country: geo.country,
      countryCode: geo.countryCode || undefined,
      regionName: geo.regionName,
      city: geo.city,
      isp: geo.isp,
      lat: geo.lat,
      lon: geo.lon,
      zip: geo.zip || undefined,
      timezone: geo.timezone || undefined,
      as: geo.as,
      mobile: !!geo.mobile,
      proxy: !!geo.proxy,
      hosting: !!geo.hosting,
      referer: clientReferer || undefined,
      requestCount: 1,
      firstSeen: nowIso,
      lastActive: nowIso,
      lastEndpoint: endpoint || undefined,
      accessHistory: endpoint ? [{ endpoint, timestamp: nowIso }] : [],
      isBlocked: isBlockedApp
    };
    vAcc.connectedApps.unshift(created);
  }

  if (vAcc.connectedApps.length > 40) {
    vAcc.connectedApps = vAcc.connectedApps.slice(0, 40);
  }

  saveVirtualXtream(virtualXtreamStore);
}


// Helper: get clean public base URL without AI Studio iframe wrappers
function getPublicBaseUrl(req: express.Request): string {
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost || req.get('host') || '').split(',')[0].trim();
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.secure || (host && host.includes('run.app')) ? 'https' : 'http');

  if (host && !host.includes('aistudio.google.com')) {
    return `${protocol}://${host}`;
  }

  if (process.env.APP_URL && !process.env.APP_URL.includes('aistudio.google.com') && !process.env.APP_URL.includes('MY_APP_URL')) {
    return process.env.APP_URL.replace(/\/$/, '');
  }

  return `${protocol}://${host || 'localhost:3000'}`;
}

function buildStreamPlayUrl(stream: StreamItem, baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  return `${cleanBase}/v/${stream.streamToken || stream.slug || stream.id}.m3u8`;
}

// Helper: convert user's uploaded poster image to MPEG-TS video segment using ffmpeg
function getHash(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function clearOldPosterTsFiles(streamId: string) {
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach(file => {
        if (file.startsWith(`poster_ts_${streamId}_`)) {
          try { fs.unlinkSync(path.join(UPLOADS_DIR, file)); } catch {}
        }
      });
    }
  } catch {}
}

async function getOrGenerateTsSegmentForStream(stream: StreamItem): Promise<string | null> {
  const urlStr = (stream.customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg').trim();
  
  if (urlStr.includes('BK7PcpCk') || urlStr.includes('a473215') || urlStr.includes('preset_poster_1')) {
    const preset1Ts = path.join(UPLOADS_DIR, 'preset_poster_1.ts');
    if (fs.existsSync(preset1Ts)) return preset1Ts;
  }
  if (urlStr.includes('fdjC56ZJ') || urlStr.includes('6bc8fa3a') || urlStr.includes('preset_poster_2')) {
    const preset2Ts = path.join(UPLOADS_DIR, 'preset_poster_2.ts');
    if (fs.existsSync(preset2Ts)) return preset2Ts;
  }

  const watermark = (stream.watermarkText || '').trim();
  const updatedAt = stream.updatedAt || '';
  const hash = getHash(`${stream.id}_${urlStr}_${watermark}_${updatedAt}`);
  const targetTsPath = path.join(UPLOADS_DIR, `poster_ts_${stream.id}_${hash}.ts`);

  if (fs.existsSync(targetTsPath) && fs.statSync(targetTsPath).size > 0) {
    return targetTsPath;
  }

  // Clear any older generated segment for this stream to ensure fresh image updates
  clearOldPosterTsFiles(stream.id);

  let sourceImagePath = '';
  let tempImageCreated = false;

  try {
    if (urlStr.startsWith('data:image/')) {
      const matches = urlStr.match(/^data:image\/([a-zA-Z0-9+.=-]+);base64,(.+)$/);
      if (matches && matches[2]) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        sourceImagePath = path.join(UPLOADS_DIR, `temp_img_${hash}.${ext}`);
        fs.writeFileSync(sourceImagePath, Buffer.from(matches[2], 'base64'));
        tempImageCreated = true;
      }
    } else if (urlStr.includes('/uploads/')) {
      const fileName = urlStr.split('/uploads/').pop()?.split('?')[0];
      if (fileName) {
        const localPath = path.join(UPLOADS_DIR, fileName);
        if (fs.existsSync(localPath)) {
          sourceImagePath = localPath;
        }
      }
    }

    if (!sourceImagePath) {
      const relativeClean = urlStr.startsWith('/') ? urlStr.substring(1) : urlStr;
      const directPath = path.join(__dirname, relativeClean);
      const publicPath = path.join(__dirname, 'public', relativeClean);

      if (fs.existsSync(directPath)) {
        sourceImagePath = directPath;
      } else if (fs.existsSync(publicPath)) {
        sourceImagePath = publicPath;
      } else if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        try {
          const fetchRes = await fetch(urlStr, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
          });
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            sourceImagePath = path.join(UPLOADS_DIR, `temp_img_${hash}.jpg`);
            fs.writeFileSync(sourceImagePath, Buffer.from(arrayBuf));
            tempImageCreated = true;
          }
        } catch (fetchErr) {
          console.warn('Failed fetching remote poster image:', fetchErr);
        }
      }
    }

    if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
      return null;
    }

    const baseFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black';
    let filterString = baseFilter;

    if (watermark) {
      const safeWatermark = watermark.replace(/[':\\]/g, ' ').substring(0, 50);
      if (safeWatermark) {
        filterString += `,drawtext=text='${safeWatermark}':x=(w-text_w)/2:y=h-60:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8`;
      }
    }

    // Try generating TS with watermark
    try {
      execFileSync('ffmpeg', [
        '-y',
        '-loop', '1',
        '-i', sourceImagePath,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-t', '4',
        '-pix_fmt', 'yuv420p',
        '-vf', filterString,
        '-r', '25',
        '-shortest',
        '-f', 'mpegts',
        targetTsPath
      ], { stdio: 'pipe', timeout: 15000 });
    } catch (ffmpegErr) {
      // Fallback: If drawtext filter failed (e.g. missing font file), retry with base scaling filter only!
      console.warn('FFmpeg drawtext failed, retrying with base image scaling only...', ffmpegErr);
      execFileSync('ffmpeg', [
        '-y',
        '-loop', '1',
        '-i', sourceImagePath,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-t', '4',
        '-pix_fmt', 'yuv420p',
        '-vf', baseFilter,
        '-r', '25',
        '-shortest',
        '-f', 'mpegts',
        targetTsPath
      ], { stdio: 'pipe', timeout: 15000 });
    }

    if (tempImageCreated && fs.existsSync(sourceImagePath)) {
      try { fs.unlinkSync(sourceImagePath); } catch {}
    }

    if (fs.existsSync(targetTsPath) && fs.statSync(targetTsPath).size > 0) {
      return targetTsPath;
    }
  } catch (err) {
    console.error('Error generating MPEG-TS segment from poster image:', err);
  }

  return null;
}



// Config Endpoint
app.get('/api/config', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  res.json({
    success: true,
    baseUrl,
    appUrl: process.env.APP_URL || '',
    googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
  });
});

// Image Upload Endpoint (supports Base64 data URLs from mobile gallery/camera)
app.post('/api/upload-image', (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'صورة الإيقاف مفقودة' });
    }

    // Check if it's data URL
    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9+.=-]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const dataBuffer = Buffer.from(matches[2], 'base64');
      const uniqueFileName = `pause_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, uniqueFileName);
      
      fs.writeFileSync(filePath, dataBuffer);
      const publicBaseUrl = getPublicBaseUrl(req);
      const imageUrl = `${publicBaseUrl}/uploads/${uniqueFileName}`;

      return res.json({ success: true, imageUrl });
    }

    // If already URL or direct data URL string
    return res.json({ success: true, imageUrl: imageBase64 });
  } catch (err) {
    console.error('Image upload failed:', err);
    res.status(500).json({ success: false, error: 'فشل حفظ الصورة على السيرفر' });
  }
});

// Helper: detect stream type from URL
function detectStreamType(url: string): 'hls' | 'youtube' | 'twitch' | 'mp4' | 'embed' {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'youtube';
  }
  if (lower.includes('twitch.tv')) {
    return 'twitch';
  }
  if (lower.includes('.m3u8') || lower.includes('hls') || lower.includes('.ts')) {
    return 'hls';
  }
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov')) {
    return 'mp4';
  }
  return 'embed';
}

// Helper: normalize video URL (e.g. YouTube watch URL to embed URL)
function normalizeStreamUrl(url: string): { normalizedUrl: string; detectedType: 'hls' | 'youtube' | 'twitch' | 'mp4' | 'embed' } {
  const type = detectStreamType(url);
  let normalized = url.trim();

  if (type === 'youtube') {
    let videoId = '';
    if (normalized.includes('v=')) {
      const match = normalized.match(/v=([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes('youtu.be/')) {
      const match = normalized.match(/youtu\.be\/([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes('/embed/')) {
      const match = normalized.match(/\/embed\/([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes('/live/')) {
      const match = normalized.match(/\/live\/([\w-]+)/);
      if (match) videoId = match[1];
    }

    if (videoId) {
      normalized = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
    }
  } else if (type === 'twitch') {
    const match = normalized.match(/twitch\.tv\/([\w-]+)/);
    if (match && !normalized.includes('player.twitch.tv')) {
      const channel = match[1];
      normalized = `https://player.twitch.tv/?channel=${channel}&parent=localhost&autoplay=true`;
    }
  }

  return { normalizedUrl: normalized, detectedType: type };
}

// Stream URL Validation API
app.post('/api/verify-stream', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'الرابط مفقود' });
  }

  const { normalizedUrl, detectedType } = normalizeStreamUrl(url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const checkRes = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    const isReachable = checkRes ? (checkRes.ok || checkRes.status === 403 || checkRes.status === 405 || checkRes.status === 302) : true;

    res.json({
      success: true,
      reachable: isReachable,
      detectedType,
      normalizedUrl,
      status: checkRes ? checkRes.status : 200,
      message: detectedType === 'hls'
        ? 'رابط بث HLS m3u8 صحيح وتلقائي التحويل'
        : detectedType === 'youtube'
        ? 'بث/فيديو يوتيوب مدمج بنجاح'
        : 'رابط مباشر أو تضمين خارجي'
    });
  } catch (err) {
    res.json({
      success: true,
      reachable: true,
      detectedType,
      normalizedUrl,
      message: 'تم استقبال الرابط وسيتم علاجه عبر بروكسي التمرير.'
    });
  }
});

function computeRealViewers(stream: StreamItem): number {
  if (!stream.connectedApps || stream.connectedApps.length === 0) return 0;
  const now = Date.now();
  return stream.connectedApps.filter(app => {
    if (app.isBlocked) return false;
    const lastActiveMs = new Date(app.lastActive).getTime();
    return (now - lastActiveMs) < 15000;
  }).length;
}

async function updateConnectionInfo(
  app: ConnectedApp,
  clientUA: string,
  clientReferer: string,
  clientIP: string,
  endpoint?: string,
  extra?: { acceptLanguage?: string; forwardedChain?: string; telemetry?: any }
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const lastActive = app.lastActive ? new Date(app.lastActive) : new Date(0);
  const diffMs = now.getTime() - lastActive.getTime();

  app.requestCount += 1;
  app.lastActive = nowIso;
  if (!app.firstSeen) app.firstSeen = nowIso;
  if (endpoint) app.lastEndpoint = endpoint;
  appendAccessHistory(app, endpoint, nowIso);
  if (clientUA) {
    app.osName = detectOsName(clientUA);
    app.clientType = classifyClientType(clientUA, clientReferer);
  }
  if (extra?.acceptLanguage) app.acceptLanguage = extra.acceptLanguage;
  if (extra?.forwardedChain) app.forwardedChain = extra.forwardedChain;
  if (extra?.telemetry && typeof extra.telemetry === 'object') {
    app.clientTelemetry = extra.telemetry;
  }
  app.deviceFingerprint = computeDeviceFingerprint(clientIP, clientUA || clientReferer, extra?.acceptLanguage || app.acceptLanguage);

  // Only perform heavy geo lookup once every 30 minutes to ensure maximum server speed (unless lat/lon missing)
  if (diffMs < 30 * 60 * 1000 && app.country && app.country !== 'غير معروف' && typeof app.lat === 'number' && typeof app.lon === 'number') {
    return;
  }

  const appName = detectAppName(clientUA, clientReferer);
  const deviceModel = extractDeviceModel(clientUA);
  const geo = await fetchRealIpGeoDetails(clientIP);

  if (!app.appName || app.appName.includes('مجهول')) app.appName = appName;
  if (deviceModel) app.deviceModel = deviceModel;
  if (clientIP) app.ipAddress = clientIP;
  if (clientReferer) app.referer = clientReferer;
  if (clientUA && (!app.userAgent || app.userAgent === 'unknown-app-client')) app.userAgent = clientUA;
  if (!app.osName) app.osName = detectOsName(clientUA);
  if (!app.clientType) app.clientType = classifyClientType(clientUA, clientReferer);

  if (geo.country) app.country = geo.country;
  if (geo.regionName) app.regionName = geo.regionName;
  if (geo.city) app.city = geo.city;
  if (geo.isp) app.isp = geo.isp;
  if (geo.countryCode) app.countryCode = geo.countryCode;
  if (geo.lat) app.lat = geo.lat;
  if (geo.lon) app.lon = geo.lon;
  if (geo.zip) app.zip = geo.zip;
  if (geo.timezone) app.timezone = geo.timezone;
  if (geo.as) app.as = geo.as;
  app.mobile = !!geo.mobile;
  app.proxy = !!geo.proxy;
  app.hosting = !!geo.hosting;
  if (clientIP && geo.proxy && securityPolicyStore.autoBlockVpnProxy && !blockedIpsStore.some(b => b.ip === clientIP)) {
    blockIpAddress(clientIP, 'حظر تلقائي: اتصال عبر VPN/Proxy (Auto-Defense Policy)', 120);
    addSecurityLog(clientIP, 'UNAUTHORIZED_ACCESS', 'الدرع الآلي: حظر IP يمر عبر VPN/Proxy');
    recordTrafficEvent('threat');
  }
  if (clientIP && geo.hosting && securityPolicyStore.autoBlockDatacenter && !blockedIpsStore.some(b => b.ip === clientIP)) {
    blockIpAddress(clientIP, 'حظر تلقائي: استضافة سحابية / Datacenter (Auto-Defense Policy)', 120);
    addSecurityLog(clientIP, 'UNAUTHORIZED_ACCESS', 'الدرع الآلي: حظر IP تابع لمركز بيانات/استضافة');
    recordTrafficEvent('threat');
  }
}

// Instant Real-Time Viewer Heartbeat Endpoints (External Real Viewers Only)
app.post('/api/stream/:slugOrId/ping', async (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find(s => s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
  }

  const clientUA = req.get('user-agent') || '';
  const clientReferer = req.get('referer') || req.get('origin') || '';
  const clientIP = getClientIp(req);
  const acceptLanguage = req.get('accept-language') || '';
  const forwardedChain = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';

  if (!isRealExternalViewer(clientIP, clientUA)) {
    return res.json({ success: true, currentViewers: computeRealViewers(stream) });
  }

  const { deviceId, telemetry } = req.body || {};

  if (!stream.connectedApps) stream.connectedApps = [];
  const appName = detectAppName(clientUA, clientReferer);
  const uaKey = clientUA || clientReferer || 'unknown-app-client';

  let existingApp = stream.connectedApps.find(a =>
    (deviceId && a.id === deviceId) ||
    a.userAgent === uaKey ||
    (a.ipAddress && clientIP && a.ipAddress === clientIP)
  );

  if (existingApp) {
    if (deviceId && !existingApp.id.startsWith('app_')) {
      existingApp.id = deviceId;
    }
    updateConnectionInfo(existingApp, clientUA, clientReferer, clientIP, `web_player:${stream.slug}`, {
      acceptLanguage,
      forwardedChain,
      telemetry
    }).then(() => saveStreams(streamsStore)).catch(() => {});
  } else {
    const nowIso = new Date().toISOString();
    const newApp: ConnectedApp = {
      id: deviceId || `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userAgent: uaKey,
      appName,
      ipAddress: clientIP,
      osName: detectOsName(clientUA),
      clientType: classifyClientType(clientUA, clientReferer),
      acceptLanguage: acceptLanguage || undefined,
      forwardedChain: forwardedChain || undefined,
      deviceFingerprint: computeDeviceFingerprint(clientIP, uaKey, acceptLanguage),
      requestCount: 1,
      firstSeen: nowIso,
      lastActive: nowIso,
      lastEndpoint: `web_player:${stream.slug}`,
      accessHistory: [{ endpoint: `web_player:${stream.slug}`, timestamp: nowIso }],
      clientTelemetry: telemetry && typeof telemetry === 'object' ? telemetry : undefined,
      isBlocked: false
    };
    stream.connectedApps.unshift(newApp);
    if (stream.connectedApps.length > 40) {
      stream.connectedApps = stream.connectedApps.slice(0, 40);
    }
    saveStreams(streamsStore);
    updateConnectionInfo(newApp, clientUA, clientReferer, clientIP, `web_player:${stream.slug}`, {
      acceptLanguage,
      forwardedChain,
      telemetry
    }).then(() => saveStreams(streamsStore)).catch(() => {});
  }

  res.json({ success: true, currentViewers: computeRealViewers(stream) });
});

app.post('/api/stream/:slugOrId/leave', (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find(s => s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
  }

  const clientUA = req.get('user-agent') || '';
  const clientReferer = req.get('referer') || req.get('origin') || '';
  const clientIP = getClientIp(req);

  const { deviceId } = req.body;

  if (stream.connectedApps) {
    stream.connectedApps = stream.connectedApps.filter(a =>
       deviceId ? a.id !== deviceId : !(a.userAgent === (req.get('user-agent') || '') || (a.ipAddress && clientIP && a.ipAddress === clientIP))
    );
    saveStreams(streamsStore);
  }

  res.json({ success: true, currentViewers: computeRealViewers(stream) });
});

// REST API Endpoints
app.get('/api/streams', (req, res) => {
  const streamsWithRealViewers = streamsStore.map(s => ({
    ...s,
    currentViewers: computeRealViewers(s)
  }));
  res.json({ success: true, streams: streamsWithRealViewers });
});

app.get('/api/streams/:slugOrId', (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find(s =>
    s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId
  );
  if (!stream) {
    return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
  }
  res.json({
    success: true,
    stream: {
      ...stream,
      currentViewers: computeRealViewers(stream)
    }
  });
});

app.post('/api/streams', async (req, res) => {
  const body = req.body;
  let finalOriginalUrl = body.originalUrl || '';

  if (body.isXtream || body.xtreamHost) {
    const rawHost = (body.xtreamHost || '').trim().replace(/\/$/, '');
    const user = (body.xtreamUser || '').trim();
    const pass = (body.xtreamPass || '').trim();
    const streamId = (body.xtreamStreamId || '').trim();

    if (rawHost && user && pass && streamId) {
      if (streamId.endsWith('.m3u8') || streamId.endsWith('.ts')) {
        finalOriginalUrl = `${rawHost}/live/${user}/${pass}/${streamId}`;
      } else {
        finalOriginalUrl = `${rawHost}/live/${user}/${pass}/${streamId}.m3u8`;
      }
    }
  }

  if (!finalOriginalUrl || !body.title) {
    return res.status(400).json({ success: false, error: 'يرجى تزويد بيانات الكستريم أو رابط البث الأصلي وعنوان البث' });
  }

  const { normalizedUrl, detectedType } = normalizeStreamUrl(finalOriginalUrl);

  let rawSlug = body.slug ? body.slug.trim() : '';
  let formattedSlug = rawSlug
    ? rawSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0600-\u06FF-]/g, '')
    : `live-${Math.random().toString(36).substring(2, 8)}`;

  if (!formattedSlug) {
    formattedSlug = `live-${Math.random().toString(36).substring(2, 8)}`;
  }

  let uniqueSlug = formattedSlug;
  let counter = 1;
  while (streamsStore.some(s => s.slug === uniqueSlug)) {
    uniqueSlug = `${formattedSlug}-${counter}`;
    counter++;
  }

  const usedTokens = new Set<string>(streamsStore.map(s => s.streamToken).filter(Boolean) as string[]);
  const newStream: StreamItem = {
    id: `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    slug: uniqueSlug,
    streamToken: generateOpaqueToken(usedTokens),
    title: body.title,
    category: body.category || 'sports',
    originalUrl: normalizedUrl,
    streamType: body.streamType || detectedType,
    status: body.status || 'active',
    watermarkText: body.watermarkText || '© حقوق البث محفوظة',
    quality: body.quality || '1080p HD',
    refererHeader: body.refererHeader || '',
    userAgentHeader: body.userAgentHeader || '',
    password: body.password || '',
    allowedDomains: body.allowedDomains || '',
    viewsCount: 0,
    currentViewers: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pauseNoticeMessage: body.pauseNoticeMessage || 'البث متوقف مؤقتاً بواسطة صاحب الرابط',
    customPosterUrl: body.customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
    customLogoUrl: body.customLogoUrl || '',
    logoPosition: body.logoPosition || 'top-right',
    logoSize: body.logoSize || 'md',
    autoPauseTimerMinutes: body.autoPauseTimerMinutes ? Number(body.autoPauseTimerMinutes) : undefined,
    isXtream: !!(body.isXtream || body.xtreamHost),
    xtreamHost: body.xtreamHost || '',
    xtreamUser: body.xtreamUser || '',
    xtreamPass: body.xtreamPass || '',
    xtreamStreamId: body.xtreamStreamId || '',
    isBulk: false
  };

  const publicBaseUrl = getPublicBaseUrl(req);

  streamsStore.unshift(newStream);
  saveStreamsNow(streamsStore);

  if (newStream.customPosterUrl) {
    getOrGenerateTsSegmentForStream(newStream).catch(() => {});
  }

  res.status(201).json({ success: true, stream: newStream });
});

app.put('/api/streams/:id', (req, res) => {
  const { id } = req.params;
  const index = streamsStore.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  const body = req.body;
  const existing = streamsStore[index];

  let normalizedUrl = existing.originalUrl;
  let detectedType = existing.streamType;

  if (body.originalUrl && body.originalUrl !== existing.originalUrl) {
    const norm = normalizeStreamUrl(body.originalUrl);
    normalizedUrl = norm.normalizedUrl;
    detectedType = norm.detectedType;
  }

  let newSlug = existing.slug;
  if (body.slug && body.slug.trim() !== '') {
    const rawSlug = body.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0600-\u06FF-]/g, '');
    if (rawSlug) {
      let uniqueSlug = rawSlug;
      let counter = 1;
      while (streamsStore.some(s => s.id !== id && s.slug === uniqueSlug)) {
        uniqueSlug = `${rawSlug}-${counter}`;
        counter++;
      }
      newSlug = uniqueSlug;
    }
  }

  const updated: StreamItem = {
    ...existing,
    ...body,
    slug: newSlug,
    originalUrl: normalizedUrl,
    streamType: body.streamType || detectedType,
    updatedAt: new Date().toISOString()
  };

  streamsStore[index] = updated;
  saveStreamsNow(streamsStore);

  if (updated.customPosterUrl) {
    getOrGenerateTsSegmentForStream(updated).catch(() => {});
  }

  res.json({ success: true, stream: updated });
});

app.patch('/api/streams/:id/toggle', (req, res) => {
  const { id } = req.params;
  const stream = streamsStore.find(s => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  stream.status = stream.status === 'active' ? 'paused' : 'active';
  stream.updatedAt = new Date().toISOString();
  saveStreamsNow(streamsStore);

  if (stream.status === 'paused' && stream.customPosterUrl) {
    getOrGenerateTsSegmentForStream(stream).catch(() => {});
  }

  res.json({ success: true, status: stream.status, stream });
});

app.post('/api/streams/:id/block-app', (req, res) => {
  const { id } = req.params;
  const { pattern, userAgent, appName, appId, ipAddress } = req.body;
  const stream = streamsStore.find(s => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  if (!stream.blockedApps) stream.blockedApps = [];

  const rawTargets = [pattern, userAgent, appName, appId, ipAddress].filter(Boolean).map(t => String(t).trim());
  if (rawTargets.length === 0) {
    return res.status(400).json({ success: false, error: 'معرّف أو اسم التطبيق مفقود' });
  }

  const newTokensToBlock: string[] = [];

  rawTargets.forEach(t => {
    newTokensToBlock.push(t);
    const lowerT = t.toLowerCase();

    // Extract technical keywords if Arabic or display text is present
    const cleanT = lowerT.replace(/[\u0600-\u06FF]/g, '').replace(/[•()]/g, '').trim();
    if (cleanT && cleanT.length >= 2) {
      newTokensToBlock.push(cleanT);
    }

    if (lowerT.includes('exoplayer')) newTokensToBlock.push('exoplayer', 'okhttp', 'dalvik');
    if (lowerT.includes('smarters')) newTokensToBlock.push('smarters', 'iptv smarters');
    if (lowerT.includes('tivimate')) newTokensToBlock.push('tivimate');
    if (lowerT.includes('vlc')) newTokensToBlock.push('vlc', 'libvlc');
    if (lowerT.includes('xciptv')) newTokensToBlock.push('xciptv');
    if (lowerT.includes('okhttp')) newTokensToBlock.push('okhttp', 'dalvik');

    const modelMatch = t.match(/(SM-[A-Z0-9]+|Redmi[^;)]+|iPhone|iPad|Galaxy[^;)]+)/i);
    if (modelMatch) {
      newTokensToBlock.push(modelMatch[1].trim());
    }
  });

  newTokensToBlock.forEach(token => {
    if (token && !stream.blockedApps!.some(b => b.toLowerCase() === token.toLowerCase())) {
      stream.blockedApps!.push(token);
    }
  });

  if (stream.connectedApps) {
    stream.connectedApps.forEach(a => {
      const isMatch = newTokensToBlock.some(t => {
        const lowerT = t.toLowerCase();
        return a.id === t ||
               (a.ipAddress && a.ipAddress.toLowerCase() === lowerT) ||
               a.userAgent.toLowerCase().includes(lowerT) ||
               a.appName.toLowerCase().includes(lowerT);
      });
      if (isMatch) {
        a.isBlocked = true;
      }
    });
  }

  stream.updatedAt = new Date().toISOString();
  saveStreams(streamsStore);
  res.json({ success: true, message: 'تم حظر التطبيق وتوقيف الخدمة عنه نهائياً بنجاح', stream });
});

app.patch('/api/streams/:id/toggle-block-all', (req, res) => {
  const { id } = req.params;
  const stream = streamsStore.find(s => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  stream.blockAllExternalApps = !stream.blockAllExternalApps;
  stream.updatedAt = new Date().toISOString();
  saveStreams(streamsStore);

  const msg = stream.blockAllExternalApps
    ? 'تم تفعيل حظر كافة مشغلات IPTV والتطبيقات الخارجية بنجاح'
    : 'تم إيقاف حظر المشغلات الخارجية';

  res.json({ success: true, message: msg, blockAllExternalApps: stream.blockAllExternalApps, stream });
});

app.post('/api/streams/:id/unblock-app', (req, res) => {
  const { id } = req.params;
  const { pattern } = req.body;
  const stream = streamsStore.find(s => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  const cleanP = (pattern || '').trim().toLowerCase();
  if (stream.blockedApps) {
    stream.blockedApps = stream.blockedApps.filter(p => p.toLowerCase() !== cleanP);
  }

  if (stream.connectedApps) {
    stream.connectedApps.forEach(a => {
      if (a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP) || a.id === cleanP || (a.ipAddress && a.ipAddress.toLowerCase() === cleanP)) {
        a.isBlocked = false;
      }
    });
  }

  stream.updatedAt = new Date().toISOString();
  saveStreams(streamsStore);
  res.json({ success: true, message: 'تم إلغاء حظر التطبيق بنجاح', stream });
});

app.patch('/api/streams/:id/poster', async (req, res) => {
  const { id } = req.params;
  const { customPosterUrl } = req.body;
  const stream = streamsStore.find(s => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'البث غير موجود' });
  }

  stream.customPosterUrl = (customPosterUrl || '').trim();
  stream.updatedAt = new Date().toISOString();
  saveStreamsNow(streamsStore);

  let tsGenerated = false;
  if (stream.customPosterUrl) {
    try {
      const generatedPath = await getOrGenerateTsSegmentForStream(stream);
      tsGenerated = !!(generatedPath && fs.existsSync(generatedPath));
    } catch (err) {
      console.error('Error in instant poster TS generation:', err);
    }
  }

  res.json({
    success: true,
    message: 'تم حفظ وتطبيق صورة شاشة الإيقاف المخصصة بنجاح!',
    stream,
    tsGenerated
  });
});

app.delete('/api/streams/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = streamsStore.length;
  streamsStore = streamsStore.filter(s => s.id !== id && s.slug !== id);
  saveStreamsNow(streamsStore);
  if (streamsStore.length < initialLength) {
    res.json({ success: true, message: 'تم حذف رابط البث بنجاح' });
  } else {
    res.status(404).json({ success: false, error: 'البث غير موجود' });
  }
});

app.delete('/api/streams-all', (req, res) => {
  streamsStore = [];
  saveStreamsNow(streamsStore);
  res.json({ success: true, message: 'تم حذف جميع الروابط بنجاح' });
});

// Bulk Generation & Management Endpoints
function parseXtreamLine(line: string) {
  if (line.includes('|')) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      return { host: parts[0], user: parts[1], pass: parts[2] };
    }
  }
  if (line.includes('username=') && line.includes('password=')) {
    try {
      const u = new URL(line);
      const user = u.searchParams.get('username') || '';
      const pass = u.searchParams.get('password') || '';
      const host = `${u.protocol}//${u.host}`;
      return { host, user, pass };
    } catch {}
  }
  return null;
}

app.post('/api/streams/bulk', async (req, res) => {
  const { lines } = req.body;
  if (!Array.isArray(lines)) return res.status(400).json({ success: false });

  const newStreams: StreamItem[] = [];
  const now = new Date().toISOString();

  const usedBulkTokens = new Set<string>(streamsStore.map(s => s.streamToken).filter(Boolean) as string[]);

  for (const line of lines) {
    const xtream = parseXtreamLine(line);
    if (xtream) {
      const id = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const tok = generateOpaqueToken(usedBulkTokens);
      usedBulkTokens.add(tok);
      const newStream: StreamItem = {
        id,
        title: `بث اكستريم - ${xtream.user.substring(0, 5)}`,
        category: 'general',
        originalUrl: `${xtream.host}/get.php?username=${xtream.user}&password=${xtream.pass}&type=m3u_plus&output=ts`,
        slug: `xtream_${Math.floor(Math.random() * 8999 + 1000)}`,
        streamToken: tok,
        streamType: 'hls',
        status: 'active',
        watermarkText: '© جميع الحقوق محفوظة',
        quality: 'HD',
        viewsCount: 0,
        currentViewers: 0,
        createdAt: now,
        updatedAt: now,
        isXtream: true,
        xtreamHost: xtream.host,
        xtreamUser: xtream.user,
        xtreamPass: xtream.pass,
        customPosterUrl: '/uploads/preset_poster_1.jpg',
        connectedApps: [],
        blockedApps: [],
        isBulk: true
      };
      newStreams.push(newStream);
    } else if (line.startsWith('http')) {
      const id = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const title = line.split('/').pop()?.split('?')[0] || 'رابط بث مباشر';
      const tok = generateOpaqueToken(usedBulkTokens);
      usedBulkTokens.add(tok);
      const newStream: StreamItem = {
        id,
        title: `بث مباشر - ${title.substring(0, 15)}`,
        category: 'general',
        originalUrl: line,
        slug: `live_${Math.floor(Math.random() * 8999 + 1000)}`,
        streamToken: tok,
        streamType: detectStreamType(line),
        status: 'active',
        watermarkText: '© جميع الحقوق محفوظة',
        quality: 'HD',
        viewsCount: 0,
        currentViewers: 0,
        createdAt: now,
        updatedAt: now,
        customPosterUrl: '/uploads/preset_poster_1.jpg',
        connectedApps: [],
        blockedApps: [],
        isBulk: true
      };
      newStreams.push(newStream);
    }
  }

  streamsStore = [...newStreams, ...streamsStore];
  saveStreams(streamsStore);
  res.json({ success: true, streams: newStreams });
});

app.patch('/api/streams/bulk-toggle', (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false });

  streamsStore = streamsStore.map(s => {
    if (ids.includes(s.id)) {
      return { ...s, status, updatedAt: new Date().toISOString() };
    }
    return s;
  });

  saveStreams(streamsStore);
  res.json({ success: true });
});

app.post('/api/streams/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false });

  streamsStore = streamsStore.filter(s => !ids.includes(s.id));
  saveStreams(streamsStore);
  res.json({ success: true });
});

app.post('/api/playlists/bulk', (req, res) => {
  const { streamIds } = req.body;
  if (!Array.isArray(streamIds) || streamIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Ids missing' });
  }

  const id = `batch_${Math.random().toString(36).substring(2, 10)}`;
  const batch: PlaylistBatch = {
    id,
    streamIds,
    createdAt: new Date().toISOString()
  };

  playlistsStore.unshift(batch);
  if (playlistsStore.length > 200) playlistsStore = playlistsStore.slice(0, 200);
  savePlaylists(playlistsStore);

  const baseUrl = getPublicBaseUrl(req);
  res.json({ success: true, batchId: id, playlistUrl: `${baseUrl}/playlist/${id}.m3u` });
});

app.get('/playlist/:batchId.m3u', (req, res) => {
  const { batchId } = req.params;
  const batch = playlistsStore.find(b => b.id === batchId);
  if (!batch) return res.status(404).send('Playlist not found');

  const baseUrl = getPublicBaseUrl(req);
  let m3u = '#EXTM3U\n';
  
  batch.streamIds.forEach(sid => {
    const s = streamsStore.find(st => st.id === sid);
    if (s && s.status === 'active') {
      const playUrl = buildStreamPlayUrl(s, baseUrl);
      
      m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ''}",${s.title}\n`;
      m3u += `${playUrl}\n`;
    }
  });

  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="playlist_${batchId}.m3u"`);
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30'); 
  res.setHeader('X-Stream-Speed', 'FAST_M3U_DIRECT');
  res.send(m3u);
});

app.get('/api/playlist.m3u', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  let m3u = '#EXTM3U\n';
  
  streamsStore.filter(s => !s.isBulk && s.status === 'active').forEach(s => {
    const playUrl = buildStreamPlayUrl(s, baseUrl);
    
    m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ''}",${s.title}\n`;
    m3u += `${playUrl}\n`;
  });

  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.send(m3u);
});



let globalIo: Server | null = null;

// Intelligence Radar Telemetry Endpoints
app.get('/api/intelligence-radar', async (req, res) => {
  const rawList: any[] = [];

  streamsStore.forEach(stream => {
    if (stream.connectedApps && Array.isArray(stream.connectedApps)) {
      stream.connectedApps.forEach(app => {
        if (!isRealExternalViewer(app.ipAddress || '', app.userAgent)) return;
        rawList.push({
          app,
          sourceTitle: stream.title,
          sourceType: 'stream',
          sourceId: stream.id
        });
      });
    }
  });

  virtualXtreamStore.forEach(vAcc => {
    if (vAcc.connectedApps && Array.isArray(vAcc.connectedApps)) {
      vAcc.connectedApps.forEach(app => {
        if (!isRealExternalViewer(app.ipAddress || '', app.userAgent)) return;
        rawList.push({
          app,
          sourceTitle: vAcc.title,
          sourceType: 'virtual_xtream',
          sourceId: vAcc.id
        });
      });
    }
  });

  const now = Date.now();
  // Clean up expired firewall bans cleanly
  const activeBlockedIps = blockedIpsStore.filter(b => !b.expiresAt || b.expiresAt > now);
  const blockedIpSet = new Set(activeBlockedIps.map(b => b.ip));

  const connections: any[] = [];

  await Promise.all(
    rawList.map(async item => {
      const targetIp = item.app.ipAddress || '';
      const needsGeo = targetIp && (!item.app.country || item.app.country === 'غير معروف' || item.app.lat === undefined);
      const geo = needsGeo ? await fetchRealIpGeoDetails(targetIp) : {};

      const lastActiveMs = item.app.lastActive ? new Date(item.app.lastActive).getTime() : 0;
      const isOnline = !item.app.isBlocked && (now - lastActiveMs) < 25000;
      const isGlobalIpBlocked = !!(targetIp && blockedIpSet.has(targetIp));

      const enrichedBase = {
        ...item.app,
        country: item.app.country && item.app.country !== 'غير معروف' ? item.app.country : (geo.country || 'غير معروف'),
        countryCode: item.app.countryCode || geo.countryCode || '',
        regionName: item.app.regionName || geo.regionName || '',
        city: item.app.city || geo.city || '',
        isp: item.app.isp || geo.isp || '',
        lat: item.app.lat !== undefined ? item.app.lat : geo.lat,
        lon: item.app.lon !== undefined ? item.app.lon : geo.lon,
        zip: item.app.zip || geo.zip || '',
        timezone: item.app.timezone || geo.timezone || '',
        mobile: item.app.mobile !== undefined ? item.app.mobile : !!geo.mobile,
        proxy: item.app.proxy !== undefined ? item.app.proxy : !!geo.proxy,
        hosting: item.app.hosting !== undefined ? item.app.hosting : !!geo.hosting,
        as: item.app.as || geo.as || '',
        osName: item.app.osName || detectOsName(item.app.userAgent || ''),
        clientType: item.app.clientType || classifyClientType(item.app.userAgent || '', item.app.referer),
        deviceFingerprint: item.app.deviceFingerprint || computeDeviceFingerprint(targetIp, item.app.userAgent || '', item.app.acceptLanguage),
        firstSeen: item.app.firstSeen || item.app.lastActive,
        isOnline,
        isGlobalIpBlocked,
        sourceTitle: item.sourceTitle,
        sourceType: item.sourceType,
        sourceId: item.sourceId
      };

      const riskStats = computeConnectionRiskAndRate(enrichedBase, now);

      connections.push({
        ...enrichedBase,
        ...riskStats
      });
    })
  );

  connections.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

  // Build Cross-Channel & Multi-Device IP Correlation map (Account Sharing / Restream Detector)
  const ipCorrMap: Record<string, {
    ip: string;
    totalHits: number;
    deviceCount: number;
    sources: Set<string>;
    apps: Set<string>;
    fingerprints: Set<string>;
    isOnlineAny: boolean;
    isGlobalIpBlocked: boolean;
    country: string;
    city: string;
    isp: string;
    maxRiskScore: number;
  }> = {};

  connections.forEach(c => {
    const ip = (c.ipAddress || '').trim();
    if (!ip) return;
    if (!ipCorrMap[ip]) {
      ipCorrMap[ip] = {
        ip,
        totalHits: 0,
        deviceCount: 0,
        sources: new Set(),
        apps: new Set(),
        fingerprints: new Set(),
        isOnlineAny: false,
        isGlobalIpBlocked: !!c.isGlobalIpBlocked,
        country: c.country || 'غير معروف',
        city: c.city || '',
        isp: c.isp || '',
        maxRiskScore: 0
      };
    }
    const entry = ipCorrMap[ip];
    entry.totalHits += c.requestCount || 0;
    entry.deviceCount += 1;
    entry.sources.add(c.sourceTitle);
    entry.apps.add((c.appName || '').split(' • ')[0].trim());
    if (c.deviceFingerprint) entry.fingerprints.add(c.deviceFingerprint);
    if (c.isOnline) entry.isOnlineAny = true;
    if (c.isGlobalIpBlocked) entry.isGlobalIpBlocked = true;
    if ((c.riskScore || 0) > entry.maxRiskScore) entry.maxRiskScore = c.riskScore || 0;
  });

  const ipCorrelations = Object.values(ipCorrMap)
    .map(e => ({
      ip: e.ip,
      totalHits: e.totalHits,
      deviceCount: e.deviceCount,
      sources: Array.from(e.sources),
      apps: Array.from(e.apps),
      fingerprintCount: e.fingerprints.size,
      isOnlineAny: e.isOnlineAny,
      isGlobalIpBlocked: e.isGlobalIpBlocked,
      country: e.country,
      city: e.city,
      isp: e.isp,
      maxRiskScore: e.maxRiskScore
    }))
    .sort((a, b) => b.sources.length - a.sources.length || b.deviceCount - a.deviceCount || b.totalHits - a.totalHits)
    .slice(0, 30);

  res.json({
    success: true,
    connections,
    ipCorrelations,
    totalStreamsCount: streamsStore.length,
    totalVirtualCount: virtualXtreamStore.length,
    trafficTimeline: getRecentTrafficTimeline(15),
    securityPolicy: securityPolicyStore,
    securitySummary: {
      blockedIpsCount: activeBlockedIps.length,
      securityLogsCount: securityLogsStore.length,
      blockedIps: activeBlockedIps,
      recentSecurityLogs: securityLogsStore.slice(0, 30)
    }
  });
});

app.post('/api/intelligence-radar/lookup-ip', async (req, res) => {
  const { ip } = req.body;
  const cleanIp = String(ip || '').replace('::ffff:', '').trim();
  if (!cleanIp) {
    return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان IP صالح للفحص' });
  }

  try {
    const geo = await fetchRealIpGeoDetails(cleanIp, true);
    const now = Date.now();
    const blockedRecord = blockedIpsStore.find(b => b.ip === cleanIp && (!b.expiresAt || b.expiresAt > now)) || null;
    const relatedLogs = securityLogsStore.filter(l => l.ip === cleanIp).slice(0, 15);

    const seenInSources: { sourceType: 'stream' | 'virtual_xtream'; sourceId: string; sourceTitle: string; appName: string; requestCount: number; lastActive: string }[] = [];
    streamsStore.forEach(s => {
      (s.connectedApps || []).forEach(a => {
        if (a.ipAddress && a.ipAddress.replace('::ffff:', '').trim() === cleanIp) {
          seenInSources.push({ sourceType: 'stream', sourceId: s.id, sourceTitle: s.title, appName: a.appName, requestCount: a.requestCount, lastActive: a.lastActive });
        }
      });
    });
    virtualXtreamStore.forEach(v => {
      (v.connectedApps || []).forEach(a => {
        if (a.ipAddress && a.ipAddress.replace('::ffff:', '').trim() === cleanIp) {
          seenInSources.push({ sourceType: 'virtual_xtream', sourceId: v.id, sourceTitle: v.title, appName: a.appName, requestCount: a.requestCount, lastActive: a.lastActive });
        }
      });
    });

    res.json({
      success: true,
      ip: cleanIp,
      geo,
      isBlocked: !!blockedRecord,
      blockedRecord,
      relatedLogs,
      seenInSources
    });
  } catch (err) {
    console.error('IP Lookup error:', err);
    res.status(500).json({ success: false, error: 'فشل فحص عنوان الـ IP' });
  }
});

// Legitimate Defensive DNS, Reverse PTR, HTTP Header & TLS Certificate Inspector
app.post('/api/intelligence-radar/dns-intel', async (req, res) => {
  const rawTarget = String(req.body?.target || '').trim();
  if (!rawTarget) {
    return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان IP أو اسم نطاق (Domain) أو رابط بث للفحص' });
  }

  let host = rawTarget;
  let originalProtocol = 'https:';
  try {
    if (rawTarget.includes('://')) {
      const parsed = new URL(rawTarget);
      host = parsed.hostname;
      originalProtocol = parsed.protocol || 'https:';
    } else {
      host = rawTarget.split('/')[0].split(':')[0].trim();
    }
  } catch {
    host = rawTarget.split('/')[0].split(':')[0].trim();
  }

  host = host.replace(/^::ffff:/, '').trim();
  if (!host || host.length > 253) {
    return res.status(400).json({ success: false, error: 'صيغة الهدف غير صالحة' });
  }

  const isIp = net.isIP(host) !== 0;

  if (isIp) {
    try {
      const [ptrRes, geo] = await Promise.all([
        dns.reverse(host).catch(() => [] as string[]),
        fetchRealIpGeoDetails(host, true)
      ]);
      return res.json({
        success: true,
        mode: 'ip',
        target: host,
        ptrRecords: ptrRes,
        geo
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'تعذر إتمام فحص Reverse DNS للـ IP' });
    }
  }

  // Domain / Stream Host Diagnostic
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host)) {
    return res.status(400).json({ success: false, error: 'اسم النطاق غير صالح (مثال: example.com أو 8.8.8.8)' });
  }

  try {
    const [aRes, aaaaRes, mxRes, txtRes, nsRes, cnameRes] = await Promise.allSettled([
      dns.resolve4(host),
      dns.resolve6(host),
      dns.resolveMx(host),
      dns.resolveTxt(host),
      dns.resolveNs(host),
      dns.resolveCname(host)
    ]);

    const aRecords = aRes.status === 'fulfilled' ? aRes.value : [];
    const aaaaRecords = aaaaRes.status === 'fulfilled' ? aaaaRes.value : [];
    const mxRecords = mxRes.status === 'fulfilled' ? mxRes.value.map(m => `${m.exchange} (pri ${m.priority})`) : [];
    const txtRecords = txtRes.status === 'fulfilled' ? txtRes.value.map(t => t.join('')) : [];
    const nsRecords = nsRes.status === 'fulfilled' ? nsRes.value : [];
    const cnameRecords = cnameRes.status === 'fulfilled' ? cnameRes.value : [];

    // Geo lookup for the primary resolved IP
    const primaryIp = aRecords[0] || '';
    const [primaryGeo, primaryPtr] = primaryIp
      ? await Promise.all([
          fetchRealIpGeoDetails(primaryIp, false),
          dns.reverse(primaryIp).catch(() => [] as string[])
        ])
      : [{}, [] as string[]];

    // Safe HTTP/HTTPS Response Headers inspection (no scanning/fuzzing)
    let httpHeaders: Record<string, string> | null = null;
    let httpStatus: number | null = null;
    let finalUrl: string | null = null;
    const probeProtocols = originalProtocol === 'http:' ? ['http', 'https'] : ['https', 'http'];
    for (const proto of probeProtocols) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const resp = await fetch(`${proto}://${host}/`, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        httpStatus = resp.status;
        finalUrl = resp.url;
        const picked: Record<string, string> = {};
        const interesting = ['server', 'cf-ray', 'cf-cache-status', 'via', 'x-cache', 'content-type', 'cache-control', 'strict-transport-security', 'access-control-allow-origin', 'x-powered-by'];
        interesting.forEach(h => {
          const val = resp.headers.get(h);
          if (val) picked[h] = val;
        });
        httpHeaders = picked;
        break;
      } catch {
        // try next protocol
      }
    }

    // Safe TLS Certificate metadata check
    const tlsInfo = await new Promise<{
      valid: boolean;
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      protocol?: string | null;
    } | null>(resolve => {
      try {
        const socket = tls.connect(
          { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 3500 },
          () => {
            try {
              const cert = socket.getPeerCertificate();
              const proto = socket.getProtocol();
              socket.end();
              if (cert && Object.keys(cert).length > 0) {
                const rawIssuer = cert.issuer?.O || cert.issuer?.CN;
                const rawSubject = cert.subject?.CN;
                resolve({
                  valid: socket.authorized,
                  issuer: Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer || undefined,
                  subject: Array.isArray(rawSubject) ? rawSubject[0] : rawSubject || undefined,
                  validFrom: cert.valid_from,
                  validTo: cert.valid_to,
                  protocol: proto
                });
              } else {
                resolve(null);
              }
            } catch {
              socket.destroy();
              resolve(null);
            }
          }
        );
        socket.on('timeout', () => {
          socket.destroy();
          resolve(null);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });

    res.json({
      success: true,
      mode: 'domain',
      target: host,
      dns: {
        aRecords,
        aaaaRecords,
        cnameRecords,
        nsRecords,
        mxRecords,
        txtRecords: txtRecords.slice(0, 8),
        primaryPtr
      },
      geo: primaryGeo,
      http: httpHeaders ? { status: httpStatus, finalUrl, headers: httpHeaders } : null,
      tls: tlsInfo
    });
  } catch (err) {
    console.error('DNS Intel error:', err);
    res.status(500).json({ success: false, error: 'تعذر إتمام تحليل DNS للنطاق المطلوب' });
  }
});

app.delete('/api/intelligence-radar/connection', (req, res) => {
  const { sourceType, sourceId, appId } = req.body;
  if (!sourceType || !sourceId || !appId) {
    return res.status(400).json({ success: false, error: 'بيانات الجهاز ناقصة' });
  }

  if (sourceType === 'stream') {
    const stream = streamsStore.find(s => s.id === sourceId);
    if (stream && stream.connectedApps) {
      stream.connectedApps = stream.connectedApps.filter(a => a.id !== appId);
      saveStreams(streamsStore);
    }
  } else if (sourceType === 'virtual_xtream') {
    const vAcc = virtualXtreamStore.find(v => v.id === sourceId);
    if (vAcc && vAcc.connectedApps) {
      vAcc.connectedApps = vAcc.connectedApps.filter(a => a.id !== appId);
      saveVirtualXtream(virtualXtreamStore);
    }
  }

  res.json({ success: true, message: 'تم حذف سجل الجهاز بنجاح' });
});

app.delete('/api/intelligence-radar/connections', (req, res) => {
  const mode = (req.body && req.body.mode) || 'all';
  const now = Date.now();

  streamsStore.forEach(stream => {
    if (stream.connectedApps) {
      stream.connectedApps = mode === 'offline_only'
        ? stream.connectedApps.filter(a => !a.isBlocked && (now - new Date(a.lastActive).getTime()) < 25000)
        : [];
    }
  });
  saveStreams(streamsStore);

  virtualXtreamStore.forEach(vAcc => {
    if (vAcc.connectedApps) {
      vAcc.connectedApps = mode === 'offline_only'
        ? vAcc.connectedApps.filter(a => !a.isBlocked && (now - new Date(a.lastActive).getTime()) < 25000)
        : [];
    }
  });
  saveVirtualXtream(virtualXtreamStore);

  res.json({
    success: true,
    message: mode === 'offline_only' ? 'تم مسح السجلات القديمة مع إبقاء المتصلين حالياً' : 'تم مسح جميع سجلات الاتصالات بنجاح'
  });
});

app.post('/api/intelligence-radar/block', (req, res) => {
  const { sourceType, sourceId, pattern } = req.body;
  const cleanP = (pattern || '').trim().toLowerCase();

  if (sourceType === 'stream') {
    const stream = streamsStore.find(s => s.id === sourceId);
    if (stream) {
      if (!stream.blockedApps) stream.blockedApps = [];
      if (!stream.blockedApps.includes(pattern)) stream.blockedApps.push(pattern);
      if (stream.connectedApps) {
        stream.connectedApps.forEach(a => {
          if (a.id === pattern || (a.ipAddress && a.ipAddress.toLowerCase() === cleanP) || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = true;
          }
        });
      }
      saveStreams(streamsStore);
    }
  } else if (sourceType === 'virtual_xtream') {
    const vAcc = virtualXtreamStore.find(v => v.id === sourceId);
    if (vAcc) {
      if (!vAcc.blockedApps) vAcc.blockedApps = [];
      if (!vAcc.blockedApps.includes(pattern)) vAcc.blockedApps.push(pattern);
      if (vAcc.connectedApps) {
        vAcc.connectedApps.forEach(a => {
          if (a.id === pattern || (a.ipAddress && a.ipAddress.toLowerCase() === cleanP) || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = true;
          }
        });
      }
      saveVirtualXtream(virtualXtreamStore);
    }
  }

  res.json({ success: true, message: 'تم حظر الجهاز فوراً عبر الرادار' });
});

app.post('/api/intelligence-radar/unblock', (req, res) => {
  const { sourceType, sourceId, pattern } = req.body;
  const cleanP = (pattern || '').trim().toLowerCase();

  if (sourceType === 'stream') {
    const stream = streamsStore.find(s => s.id === sourceId);
    if (stream) {
      if (stream.blockedApps) {
        stream.blockedApps = stream.blockedApps.filter(p => p.toLowerCase() !== cleanP);
      }
      if (stream.connectedApps) {
        stream.connectedApps.forEach(a => {
          if (a.id === pattern || (a.ipAddress && a.ipAddress.toLowerCase() === cleanP) || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = false;
          }
        });
      }
      saveStreams(streamsStore);
    }
  } else if (sourceType === 'virtual_xtream') {
    const vAcc = virtualXtreamStore.find(v => v.id === sourceId);
    if (vAcc) {
      if (vAcc.blockedApps) {
        vAcc.blockedApps = vAcc.blockedApps.filter(p => p.toLowerCase() !== cleanP);
      }
      if (vAcc.connectedApps) {
        vAcc.connectedApps.forEach(a => {
          if (a.id === pattern || (a.ipAddress && a.ipAddress.toLowerCase() === cleanP) || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = false;
          }
        });
      }
      saveVirtualXtream(virtualXtreamStore);
    }
  }

  res.json({ success: true, message: 'تم إزالة الحظر عن الجهاز بنجاح' });
});

// Virtual Xtream Account Endpoints
app.get('/api/virtual-xtream', (req, res) => {
  res.json({ success: true, accounts: virtualXtreamStore });
});

app.post('/api/virtual-xtream', (req, res) => {
  const { title, realHost, realUser, realPass, customPosterUrl, customVirtualHost, maxConnections } = req.body;

  if (!realHost || !realUser || !realPass) {
    return res.status(400).json({ success: false, error: 'يرجى إدخال رابط السيرفر الأصلي، اسم المستخدم، وكلمة السر' });
  }

  const randHash = crypto.randomBytes(4).toString('hex');
  const vUser = `vuser_${randHash}`;
  const vPass = `vpass_${crypto.randomBytes(3).toString('hex')}`;

  let cleanedHost = realHost.trim().replace(/\/$/, '');
  if (!cleanedHost.startsWith('http://') && !cleanedHost.startsWith('https://')) {
    cleanedHost = `http://${cleanedHost}`;
  }

  const rawCustomHost = (customVirtualHost || '').trim();
  let finalCustomVirtualHost: string | undefined = undefined;
  let finalTitle = (title || 'سيرفر اكستريم وهمي محمي').trim();

  if (rawCustomHost) {
    if (isResolvableDomainOrIp(rawCustomHost)) {
      if (rawCustomHost.startsWith('http://') || rawCustomHost.startsWith('https://')) {
        finalCustomVirtualHost = rawCustomHost.replace(/\/$/, '');
      } else {
        finalCustomVirtualHost = `https://${rawCustomHost.replace(/\/$/, '')}`;
      }
    } else {
      const cleanName = rawCustomHost.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      if (cleanName && (!title || title.includes('اكستريم'))) {
        finalTitle = cleanName;
      }
      finalCustomVirtualHost = undefined;
    }
  }

  const newAcc: VirtualXtreamAccount = {
    id: `vx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: finalTitle,
    realHost: cleanedHost,
    realUser: realUser.trim(),
    realPass: realPass.trim(),
    virtualUser: vUser,
    virtualPass: vPass,
    customVirtualHost: finalCustomVirtualHost,
    maxConnections: typeof maxConnections === 'number' ? maxConnections : (parseInt(maxConnections, 10) || 12),
    status: 'active',
    customPosterUrl: (customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg').trim(),
    blockAllExternalApps: false,
    blockedApps: [],
    connectedApps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  virtualXtreamStore.unshift(newAcc);
  saveVirtualXtream(virtualXtreamStore);

  res.status(201).json({ success: true, account: newAcc });
});

app.patch('/api/virtual-xtream/:id/max-connections', (req, res) => {
  const { id } = req.params;
  const { maxConnections } = req.body;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  acc.maxConnections = typeof maxConnections === 'number' ? maxConnections : (parseInt(maxConnections, 10) || 12);
  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, message: 'تم تحديث أقصى عدد للمتصلين بنجاح', account: acc });
});

app.patch('/api/virtual-xtream/:id/host', (req, res) => {
  const { id } = req.params;
  const { customVirtualHost } = req.body;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  const raw = (customVirtualHost || '').trim();
  if (!raw) {
    acc.customVirtualHost = undefined;
  } else if (isResolvableDomainOrIp(raw)) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      acc.customVirtualHost = raw.replace(/\/$/, '');
    } else {
      acc.customVirtualHost = `https://${raw.replace(/\/$/, '')}`;
    }
  } else {
    const cleanName = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (cleanName) {
      acc.title = cleanName;
    }
    acc.customVirtualHost = undefined;
  }

  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, message: 'تم تحديث رابط الهوست الوهمي بنجاح', account: acc });
});

app.patch('/api/virtual-xtream/:id/title', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  if (title && title.trim()) {
    acc.title = title.trim();
  }

  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, message: 'تم تحديث اسم السيرفر بنجاح', account: acc });
});

app.patch('/api/virtual-xtream/:id/toggle', (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  acc.status = acc.status === 'active' ? 'paused' : 'active';
  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, status: acc.status, account: acc });
});

app.patch('/api/virtual-xtream/:id/poster', (req, res) => {
  const { id } = req.params;
  const { customPosterUrl } = req.body;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  acc.customPosterUrl = (customPosterUrl || '').trim();
  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, message: 'تم تحديث صورة شاشة الإيقاف المخصصة بنجاح', account: acc });
});

app.post('/api/virtual-xtream/:id/block-app', (req, res) => {
  const { id } = req.params;
  const { pattern, userAgent, appName } = req.body;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  if (!acc.blockedApps) acc.blockedApps = [];
  const token = (pattern || userAgent || appName || '').trim();
  if (token && !acc.blockedApps.includes(token)) {
    acc.blockedApps.push(token);
  }

  if (acc.connectedApps) {
    acc.connectedApps.forEach(a => {
      if (a.userAgent.toLowerCase().includes(token.toLowerCase()) || a.appName.toLowerCase().includes(token.toLowerCase())) {
        a.isBlocked = true;
      }
    });
  }

  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: 'تم حظر التطبيق على السيرفر الوهمي', account: acc });
});

app.patch('/api/virtual-xtream/:id/toggle-block-all', (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find(a => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: 'الحساب غير موجود' });

  acc.blockAllExternalApps = !acc.blockAllExternalApps;
  acc.updatedAt = new Date().toISOString();
  saveVirtualXtream(virtualXtreamStore);

  res.json({ success: true, blockAllExternalApps: acc.blockAllExternalApps, account: acc });
});

app.delete('/api/virtual-xtream/:id', (req, res) => {
  const { id } = req.params;
  virtualXtreamStore = virtualXtreamStore.filter(a => a.id !== id);
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: 'تم حذف سيرفر الاكستريم الوهمي' });
});

// Security Firewall & Anti-Hacker Dashboard Endpoints
app.get('/api/security/firewall', (req, res) => {
  res.json({
    success: true,
    blockedIps: blockedIpsStore,
    logs: securityLogsStore,
    totalBlockedAttacks: securityLogsStore.length
  });
});

app.post('/api/security/block-ip', (req, res) => {
  const { ip, reason } = req.body;
  if (!ip || !ip.trim()) return res.status(400).json({ success: false, error: 'عنوان IP مفقود' });
  const targetIp = ip.trim();
  blockIpAddress(targetIp, reason || 'حظر يدوي بواسطة صاحب الموقع', undefined);
  addSecurityLog(targetIp, 'UNAUTHORIZED_ACCESS', 'حظر يدوي بواسطة مدير اللوحة');
  res.json({ success: true, message: `تم حظر IP (${targetIp}) بنجاح`, blockedIps: blockedIpsStore });
});

app.post('/api/security/unblock-ip', (req, res) => {
  const { ip } = req.body;
  if (!ip || !ip.trim()) return res.status(400).json({ success: false, error: 'عنوان IP مفقود' });
  const targetIp = ip.trim();
  blockedIpsStore = blockedIpsStore.filter(b => b.ip !== targetIp);
  saveBlockedIps(blockedIpsStore);
  res.json({ success: true, message: `تم إلغاء حظر IP (${targetIp}) بنجاح`, blockedIps: blockedIpsStore });
});

app.delete('/api/security/clear-logs', (req, res) => {
  securityLogsStore = [];
  saveSecurityLogs([]);
  res.json({ success: true, message: 'تم مسح سجل الهجمات بنجاح' });
});

app.get('/api/security/policy', (req, res) => {
  res.json({ success: true, policy: securityPolicyStore });
});

app.put('/api/security/policy', (req, res) => {
  const body = req.body || {};
  const nextPolicy: SecurityPolicyConfig = {
    autoBlockVpnProxy: typeof body.autoBlockVpnProxy === 'boolean' ? body.autoBlockVpnProxy : securityPolicyStore.autoBlockVpnProxy,
    autoBlockDatacenter: typeof body.autoBlockDatacenter === 'boolean' ? body.autoBlockDatacenter : securityPolicyStore.autoBlockDatacenter,
    autoBlockBots: typeof body.autoBlockBots === 'boolean' ? body.autoBlockBots : securityPolicyStore.autoBlockBots,
    ddosMaxReqPer10s: Number.isFinite(Number(body.ddosMaxReqPer10s)) ? Math.max(15, Math.min(500, Math.round(Number(body.ddosMaxReqPer10s)))) : securityPolicyStore.ddosMaxReqPer10s,
    ddosBanMinutes: Number.isFinite(Number(body.ddosBanMinutes)) ? Math.max(5, Math.min(10080, Math.round(Number(body.ddosBanMinutes)))) : securityPolicyStore.ddosBanMinutes,
    bruteForceMaxAttempts: Number.isFinite(Number(body.bruteForceMaxAttempts)) ? Math.max(2, Math.min(30, Math.round(Number(body.bruteForceMaxAttempts)))) : securityPolicyStore.bruteForceMaxAttempts,
    bruteForceBanMinutes: Number.isFinite(Number(body.bruteForceBanMinutes)) ? Math.max(5, Math.min(10080, Math.round(Number(body.bruteForceBanMinutes)))) : securityPolicyStore.bruteForceBanMinutes
  };
  securityPolicyStore = nextPolicy;
  saveSecurityPolicy(nextPolicy);
  res.json({ success: true, policy: securityPolicyStore });
});




async function sendPauseSegmentForStream(
  res: express.Response,
  customPosterUrl?: string,
  streamOrAccId?: string,
  title?: string
) {
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (customPosterUrl) {
    const tempStream: StreamItem = {
      id: streamOrAccId || 'pause_temp',
      slug: streamOrAccId || 'pause_temp',
      title: title || 'البث متوقف',
      category: 'sports',
      originalUrl: '',
      streamType: 'hls',
      status: 'paused',
      watermarkText: '© جميع الحقوق محفوظة',
      quality: '1080p',
      viewsCount: 0,
      currentViewers: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customPosterUrl
    };
    try {
      const customTsPath = await getOrGenerateTsSegmentForStream(tempStream);
      if (customTsPath && fs.existsSync(customTsPath)) {
        return res.sendFile(customTsPath);
      }
    } catch {}
  }

  const preset1Ts = path.join(UPLOADS_DIR, 'preset_poster_1.ts');
  if (fs.existsSync(preset1Ts)) {
    return res.sendFile(preset1Ts);
  }

  return res.status(503).send('Stream Paused');
}

// Route to serve video slate segment when Virtual Xtream account is paused
app.get('/api/virtual-xtream/:id/pause-segment.ts', async (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find(a => a.id === id);
  return sendPauseSegmentForStream(res, acc?.customPosterUrl, acc?.id, acc?.title);
});

function isResolvableDomainOrIp(hostStr?: string): boolean {
  if (!hostStr) return false;
  const clean = hostStr.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  if (!clean || !clean.includes('.')) return false;
  const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return domainRegex.test(clean) || ipRegex.test(clean);
}

function getVirtualXtreamHostUrl(vAcc: VirtualXtreamAccount | undefined, publicBaseUrl: string): string {
  if (!vAcc || !vAcc.customVirtualHost) {
    return publicBaseUrl;
  }
  const clean = cleanCustomVirtualHost(vAcc.customVirtualHost);
  return clean || publicBaseUrl;
}

function getValidVirtualHost(vAcc: VirtualXtreamAccount | undefined, publicBaseUrl: string): string {
  return getVirtualXtreamHostUrl(vAcc, publicBaseUrl);
}

function rewriteXtreamTextResponse(
  rawText: string,
  vAcc: VirtualXtreamAccount,
  publicBaseUrl: string
): string {
  if (!rawText) return rawText;
  let text = rawText;

  const realClean = vAcc.realHost.trim().replace(/\/$/, '');
  const realHostNoProto = realClean.replace(/^https?:\/\//, '');

  const validVirtualHost = getValidVirtualHost(vAcc, publicBaseUrl);
  let pubHost = validVirtualHost;
  let pubHostNoProto = validVirtualHost.replace(/^https?:\/\//, '');

  // 1. Regex rewrite for ANY domain or IP address containing /realUser/realPass/
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const realUserEsc = escapeRegex(vAcc.realUser);
  const realPassEsc = escapeRegex(vAcc.realPass);

  const urlRegex = new RegExp(`https?:\\/\\/[^/\\\\s"'\`]+(?:\\/+(live|movie|series))?\\/+${realUserEsc}\\/+${realPassEsc}(?=[/\\\\s"'\`\\?\\&]|$)`, 'gi');
  text = text.replace(urlRegex, (match, type) => {
    const streamType = type ? `${type}/` : '';
    return `${pubHost}/${streamType}${vAcc.virtualUser}/${vAcc.virtualPass}`;
  });

  // 2. Rewrite direct real host matches
  text = text.replaceAll(realClean, pubHost);
  text = text.replaceAll(realHostNoProto, pubHostNoProto);

  // 3. Rewrite remaining paths and credentials
  text = text.replaceAll(`/live/${vAcc.realUser}/${vAcc.realPass}`, `/live/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/movie/${vAcc.realUser}/${vAcc.realPass}`, `/movie/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/series/${vAcc.realUser}/${vAcc.realPass}`, `/series/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/${vAcc.realUser}/${vAcc.realPass}/`, `/${vAcc.virtualUser}/${vAcc.virtualPass}/`);
  text = text.replaceAll(`/${vAcc.realUser}/${vAcc.realPass}`, `/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`username=${vAcc.realUser}`, `username=${vAcc.virtualUser}`);
  text = text.replaceAll(`password=${vAcc.realPass}`, `password=${vAcc.virtualPass}`);

  return text;
}

function rewriteXtreamJsonResponse(
  rawData: any,
  vAcc: VirtualXtreamAccount,
  publicBaseUrl: string,
  req?: express.Request
): any {
  if (!rawData) return rawData;

  const jsonStr = JSON.stringify(rawData);
  const rewrittenStr = rewriteXtreamTextResponse(jsonStr, vAcc, publicBaseUrl);

  let parsed: any;
  try {
    parsed = JSON.parse(rewrittenStr);
  } catch {
    parsed = rawData;
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.user_info) {
      parsed.user_info.username = vAcc.virtualUser;
      parsed.user_info.password = vAcc.virtualPass;
      parsed.user_info.auth = 1;
      parsed.user_info.status = 'Active';
      if (!parsed.user_info.exp_date) parsed.user_info.exp_date = '1793015082';
      if (!parsed.user_info.is_trial) parsed.user_info.is_trial = '0';
      if (!parsed.user_info.active_cons) parsed.user_info.active_cons = '1';
      if (!parsed.user_info.max_connections) parsed.user_info.max_connections = '100';
      if (!parsed.user_info.allowed_output_formats) parsed.user_info.allowed_output_formats = ['m3u8', 'ts', 'rtmp'];
    }
    if (parsed.server_info) {
      try {
        const pubUrl = getValidVirtualHost(vAcc, publicBaseUrl);
        const uStr = pubUrl.startsWith('http') ? pubUrl : `https://${pubUrl}`;
        const u = new URL(uStr);
        parsed.server_info.url = u.hostname;
        parsed.server_info.port = u.port || (u.protocol === 'https:' ? '443' : '80');
        parsed.server_info.https_port = u.port || '443';
        parsed.server_info.server_protocol = u.protocol.replace(':', '');
        parsed.server_info.url_given = `${pubUrl.replace(/\/$/, '')}/`;
        if (vAcc && vAcc.title) {
          parsed.server_info.server_name = vAcc.title;
          parsed.server_info.name = vAcc.title;
        }
      } catch {}
    }
  }

  return parsed;
}

// Xtream Codes Player API Endpoint (Supports GET & POST for IPTV Smarters, XCIPTV, TiviMate, OTT Navigator, Drama Live)
app.all(['/player_api.php', '/api/player_api.php', '/:prefix/player_api.php', '/api/:prefix/player_api.php'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  // Extract params from query or body
  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || '').trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || '').trim();
  const action = String(req.query.action || req.body?.action || '').trim();
  const reqCategoryId = String(req.query.category_id || req.body?.category_id || '').trim();

  console.log(`[Virtual Xtream Player API] Request method=${req.method}, user=${username}, action=${action}, category_id=${reqCategoryId}`);

  const clientUA = req.get('user-agent') || '';
  const clientReferer = req.get('referer') || req.get('origin') || '';
  const clientIP = getClientIp(req);

  const vAcc = virtualXtreamStore.find(v => v.virtualUser === username && v.virtualPass === password);

  if (vAcc) {
    recordSuccessfulLogin(clientIP);
    trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, action ? `player_api:${action}` : 'player_api:auth', {
      acceptLanguage: req.get('accept-language') || '',
      forwardedChain: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : ''
    });

    const isBlocked = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
    const isExceeded = checkExceedsMaxConnections(vAcc, clientUA, clientIP);

    if (vAcc.status === 'paused' || isBlocked || isExceeded) {
      if (isExceeded) {
        return res.json({
          user_info: {
            username: vAcc.virtualUser,
            password: vAcc.virtualPass,
            message: `Max Connections Limit Reached (${vAcc.maxConnections || 12} max)`,
            auth: 0,
            status: 'MaxConnectionsLimit',
            active_cons: String(getActiveConnectionsCount(vAcc))
          }
        });
      }
      if (action === 'get_live_streams') {
        return res.json([{
          num: 1,
          name: '⚠️ البث متوقف - حماية سيرفر الاكستريم الأصلي',
          stream_type: 'live',
          stream_id: 'paused_notice',
          stream_icon: vAcc.customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
          category_id: '1',
          custom_sid: '',
          tv_archive: 0,
          direct_source: ''
        }]);
      }
      if (action === 'get_live_categories') {
        return res.json([{ category_id: '1', category_name: 'قنوات متوقفة للحماية', parent_id: 0 }]);
      }
      if (action === 'get_vod_categories' || action === 'get_series_categories' || action === 'get_vod_streams' || action === 'get_series') {
        return res.json([]);
      }
      return res.json({
        user_info: {
          username: vAcc.virtualUser,
          password: vAcc.virtualPass,
          message: isBlocked ? 'Access Blocked By App Lock' : 'Account Paused By Owner',
          auth: 0,
          status: 'Disabled',
          active_cons: '0'
        }
      });
    }

    // Active virtual account! Fetch real Xtream data from real upstream server
    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, '');
      if (!realHost.startsWith('http://') && !realHost.startsWith('https://')) {
        realHost = `http://${realHost}`;
      }

      // Combine query and body params
      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => {
        if (typeof v === 'string') searchParams.set(k, v);
      });
      Object.entries(req.body || {}).forEach(([k, v]) => {
        if (typeof v === 'string') searchParams.set(k, v);
      });

      // Inject real username and password
      searchParams.set('username', vAcc.realUser);
      searchParams.set('password', vAcc.realPass);

      const targetUrl = `${realHost}/player_api.php?${searchParams.toString()}`;
      console.log(`[Virtual Xtream] Proxying request to real server -> ${realHost}/player_api.php (action: ${action || 'auth'})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      // Try primary GET request first
      let upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers: getObfuscatedUpstreamHeaders(clientUA),
        signal: controller.signal
      }).catch(err => {
        console.warn('[Virtual Xtream] Upstream GET player_api fetch error:', err);
        return null;
      });

      // If GET failed or returned HTTP 4xx/5xx, retry with POST x-www-form-urlencoded
      if (!upstreamRes || !upstreamRes.ok) {
        console.log(`[Virtual Xtream] Retrying real server with POST method for action=${action || 'auth'}...`);
        upstreamRes = await fetch(`${realHost}/player_api.php`, {
          method: 'POST',
          headers: {
            ...getObfuscatedUpstreamHeaders(clientUA),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: searchParams.toString(),
          signal: controller.signal
        }).catch(err => {
          console.warn('[Virtual Xtream] Upstream POST player_api fetch error:', err);
          return null;
        });
      }

      clearTimeout(timeoutId);

      const publicBaseUrl = getPublicBaseUrl(req);

      if (upstreamRes && upstreamRes.ok) {
        const rawText = await upstreamRes.text();
        try {
          const rawData = JSON.parse(rawText);
          if (Array.isArray(rawData)) {
            if (action === 'get_live_streams' || (!action && rawData.length > 0 && rawData[0].stream_type === 'live')) {
              const siteStreams = streamsStore.map((s, idx) => ({
                num: rawData.length + idx + 1,
                name: `📺 ${s.title}`,
                stream_type: 'live',
                stream_id: s.slug,
                stream_icon: s.customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
                category_id: s.category === 'sports' ? '1' : '2',
                added: String(Math.floor(Date.now() / 1000)),
                custom_sid: '',
                tv_archive: 0,
                direct_source: ''
              }));
              let combinedData = [...rawData, ...siteStreams];
              if (reqCategoryId) {
                const filtered = combinedData.filter((item: any) => String(item.category_id) === reqCategoryId);
                if (filtered.length > 0) combinedData = filtered;
              }
              const rewrittenData = rewriteXtreamJsonResponse(combinedData, vAcc, publicBaseUrl, req);
              return res.json(rewrittenData);
            }
            const rewrittenData = rewriteXtreamJsonResponse(rawData, vAcc, publicBaseUrl, req);
            return res.json(rewrittenData);
          } else if (rawData && typeof rawData === 'object') {
            const rewrittenData = rewriteXtreamJsonResponse(rawData, vAcc, publicBaseUrl, req);
            return res.json(rewrittenData);
          }
        } catch {
          console.warn('[Virtual Xtream] Upstream returned non-JSON text, using fallback handler');
        }
      } else {
        console.warn(`[Virtual Xtream] Upstream server returned error code ${upstreamRes?.status}, using fallback JSON handler`);
      }
    } catch (err) {
      console.error('[Virtual Xtream] Error proxying real Xtream player_api:', err);
    }
  } else if (username || password) {
    const clientIP = getClientIp(req);
    recordFailedLogin(clientIP);
  }

  // Graceful Fallback for Virtual Accounts & Direct IPTV Player Requests
  const publicBaseUrl = getPublicBaseUrl(req);
  let hostname = (req.get('host') || 'localhost').split(':')[0];
  let port = '443';
  let protocol = 'https';

  try {
    const pubUrl = getValidVirtualHost(vAcc, publicBaseUrl);
    const uStr = pubUrl.startsWith('http') ? pubUrl : `https://${pubUrl}`;
    const u = new URL(uStr);
    hostname = u.hostname;
    port = u.port || (u.protocol === 'https:' ? '443' : '80');
    protocol = u.protocol.replace(':', '');
  } catch {}

  if (action === 'get_live_categories') {
    return res.json([
      { category_id: '1', category_name: 'قنوات رياضية حقوقية', parent_id: 0 },
      { category_id: '2', category_name: 'قنوات عامة ومباشرة', parent_id: 0 }
    ]);
  }

  if (action === 'get_vod_categories' || action === 'get_series_categories') {
    return res.json([]);
  }

  if (action === 'get_vod_streams' || action === 'get_series') {
    return res.json([]);
  }

  if (action === 'get_short_epg' || action === 'get_simple_data_table' || action === 'get_live_epg') {
    return res.json({ epg_listings: [] });
  }

  if (action === 'get_vod_info') {
    return res.json({ info: {}, movie_data: {} });
  }

  if (action === 'get_series_info') {
    return res.json({ seasons: [], info: {}, episodes: {} });
  }

  if (action === 'get_live_streams') {
    let liveList = streamsStore.map((s, idx) => ({
      num: idx + 1,
      name: s.title,
      stream_type: 'live',
      stream_id: s.slug,
      stream_icon: s.customPosterUrl || 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
      epg_channel_id: '',
      added: String(Math.floor(Date.now() / 1000)),
      category_id: s.category === 'sports' ? '1' : '2',
      custom_sid: '',
      tv_archive: 0,
      direct_source: '',
      tv_archive_duration: 0
    }));

    if (liveList.length === 0) {
      liveList = [
        {
          num: 1,
          name: '⚽ beIN SPORTS 1 HD - بث مباشر محمي',
          stream_type: 'live',
          stream_id: 'bein_sports_1',
          stream_icon: 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
          epg_channel_id: 'bein1',
          added: String(Math.floor(Date.now() / 1000)),
          category_id: '1',
          custom_sid: '',
          tv_archive: 0,
          direct_source: '',
          tv_archive_duration: 0
        },
        {
          num: 2,
          name: '📺 قناة الإخبارية المباشرة - بث حقوقي',
          stream_type: 'live',
          stream_id: 'news_live',
          stream_icon: 'https://i.ibb.co/BK7PcpCk/image-a473215.jpg',
          epg_channel_id: 'news',
          added: String(Math.floor(Date.now() / 1000)),
          category_id: '2',
          custom_sid: '',
          tv_archive: 0,
          direct_source: '',
          tv_archive_duration: 0
        }
      ];
    }

    if (reqCategoryId) {
      const filtered = liveList.filter(s => String(s.category_id) === reqCategoryId);
      if (filtered.length > 0) liveList = filtered;
    }

    return res.json(liveList);
  }

  if (action !== '') {
    return res.json([]);
  }

  // Authentication response when action is empty ""
  return res.json({
    user_info: {
      username: vAcc ? vAcc.virtualUser : (username || 'xtream_user'),
      password: vAcc ? vAcc.virtualPass : (password || 'xtream_pass'),
      message: 'Auth Successful',
      auth: 1,
      status: 'Active',
      exp_date: '1793015082',
      is_trial: '0',
      active_cons: '1',
      created_at: '1600000000',
      max_connections: '100',
      allowed_output_formats: ['m3u8', 'ts']
    },
    server_info: {
      url: hostname,
      port,
      https_port: '443',
      server_protocol: protocol,
      rtmp_port: '8888',
      timezone: 'UTC',
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString(),
      url_given: `${publicBaseUrl.replace(/\/$/, '')}/`,
      server_name: vAcc ? vAcc.title : 'Virtual Xtream Server',
      name: vAcc ? vAcc.title : 'Virtual Xtream Server'
    }
  });
});

// Xtream M3U Playlist proxy endpoint (Supports GET & POST)
app.all(['/get.php', '/api/get.php', '/:prefix/get.php', '/api/:prefix/get.php'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || '').trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || '').trim();

  const vAcc = virtualXtreamStore.find(v => v.virtualUser === username && v.virtualPass === password);
  if (vAcc) {
    const clientUA = req.get('user-agent') || '';
    const clientReferer = req.get('referer') || req.get('origin') || '';
    const clientIP = getClientIp(req);

    trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, 'get.php (M3U)', {
      acceptLanguage: req.get('accept-language') || '',
      forwardedChain: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : ''
    });

    const isBlocked = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
    const isExceeded = checkExceedsMaxConnections(vAcc, clientUA, clientIP);

    if (vAcc.status === 'paused' || isBlocked || isExceeded) {
      res.setHeader('Content-Type', 'audio/x-mpegurl');
      const publicBaseUrl = getPublicBaseUrl(req);
      const msg = isExceeded ? `تجاوز حد المتصلين المتزامنين (${vAcc.maxConnections || 12})` : 'البث متوقف للحماية';
      return res.send(`#EXTM3U\n#EXTINF:-1, ${msg}\n${publicBaseUrl}/api/virtual-xtream/${vAcc.id}/pause-segment.ts\n`);
    }

    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, '');
      if (!realHost.startsWith('http://') && !realHost.startsWith('https://')) {
        realHost = `http://${realHost}`;
      }

      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => { if (typeof v === 'string') searchParams.set(k, v); });
      Object.entries(req.body || {}).forEach(([k, v]) => { if (typeof v === 'string') searchParams.set(k, v); });

      searchParams.set('username', vAcc.realUser);
      searchParams.set('password', vAcc.realPass);

      const upstreamRes = await fetch(`${realHost}/get.php?${searchParams.toString()}`, {
        headers: {
          'User-Agent': clientUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send('Failed fetching playlist from real server');
      }

      const m3uText = await upstreamRes.text();
      const publicBaseUrl = getPublicBaseUrl(req);

      // Run full text rewriter first to rewrite all CDN/IP nodes, tvg-logos, and credentials
      const textRewritten = rewriteXtreamTextResponse(m3uText, vAcc, publicBaseUrl);

      const lines = textRewritten.split('\n');
      const rewritten = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return trimmed;
        }

        const streamMatch = trimmed.match(/\/(live|movie|series)\/[^\/]+\/[^\/]+\/([^\s]+)/) ||
                            trimmed.match(/\/([^\/]+\/[^\/]+)$/) ||
                            trimmed.match(/\/([^\/]+)$/);

        let streamPath = 'live/' + (streamMatch ? streamMatch[streamMatch.length - 1] : 'stream');
        if (streamMatch && streamMatch[1] && streamMatch[2]) {
          streamPath = `${streamMatch[1]}/${streamMatch[2]}`;
        }

        return `${publicBaseUrl}/${streamPath.startsWith('live/') || streamPath.startsWith('movie/') || streamPath.startsWith('series/') ? '' : 'live/'}${vAcc.virtualUser}/${vAcc.virtualPass}/${streamPath.replace(/^(live|movie|series)\//, '')}`;
      });

      res.setHeader('Content-Type', 'audio/x-mpegurl');
      res.setHeader('Content-Disposition', 'attachment; filename="virtual_xtream.m3u"');
      return res.send(rewritten.join('\n'));
    } catch (err) {
      return res.status(502).send('Error proxying playlist');
    }
  }

  // Fallback M3U playlist if direct request
  const publicBaseUrl = getPublicBaseUrl(req);
  res.setHeader('Content-Type', 'audio/x-mpegurl');
  res.setHeader('Content-Disposition', 'attachment; filename="virtual_xtream.m3u"');

  const m3uLines = ['#EXTM3U'];
  if (streamsStore.length > 0) {
    streamsStore.forEach(s => {
      m3uLines.push(`#EXTINF:-1 tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ''}" group-title="${s.category}",${s.title}`);
      m3uLines.push(`${publicBaseUrl}/live/${username || 'user'}/${password || 'pass'}/${s.slug}.m3u8`);
    });
  } else {
    m3uLines.push(`#EXTINF:-1 tvg-name="beIN SPORTS 1 HD" tvg-logo="https://i.ibb.co/BK7PcpCk/image-a473215.jpg" group-title="قنوات رياضية",⚽ beIN SPORTS 1 HD - بث مباشر محمي`);
    m3uLines.push(`${publicBaseUrl}/live/${username || 'user'}/${password || 'pass'}/bein_sports_1.m3u8`);
    m3uLines.push(`#EXTINF:-1 tvg-name="News Live" tvg-logo="https://i.ibb.co/BK7PcpCk/image-a473215.jpg" group-title="قنوات عامة",📺 قناة الإخبارية المباشرة - بث حقوقي`);
    m3uLines.push(`${publicBaseUrl}/live/${username || 'user'}/${password || 'pass'}/news_live.m3u8`);
  }

  return res.send(m3uLines.join('\n'));
});

// Xtream XMLTV EPG Proxy Endpoint (Supports GET & POST)
app.all(['/xmltv.php', '/api/xmltv.php', '/:prefix/xmltv.php', '/api/:prefix/xmltv.php'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || '').trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || '').trim();

  const vAcc = virtualXtreamStore.find(v => (v.virtualUser === username && v.virtualPass === password) || (v.realUser === username && v.realPass === password));
  if (vAcc) {
    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, '');
      if (!realHost.startsWith('http://') && !realHost.startsWith('https://')) {
        realHost = `http://${realHost}`;
      }

      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => { if (typeof v === 'string') searchParams.set(k, v); });
      Object.entries(req.body || {}).forEach(([k, v]) => { if (typeof v === 'string') searchParams.set(k, v); });

      searchParams.set('username', vAcc.realUser);
      searchParams.set('password', vAcc.realPass);

      const upstreamRes = await fetch(`${realHost}/xmltv.php?${searchParams.toString()}`, {
        headers: {
          'User-Agent': req.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        }
      }).catch(() => null);

      if (upstreamRes && upstreamRes.ok) {
        const xmlText = await upstreamRes.text();
        const publicBaseUrl = getPublicBaseUrl(req);
        const rewrittenXml = rewriteXtreamTextResponse(xmlText, vAcc, publicBaseUrl);
        res.setHeader('Content-Type', 'text/xml');
        return res.send(rewrittenXml);
      }
    } catch (err) {
      console.error('[Virtual Xtream XMLTV] Error proxying EPG:', err);
    }
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.send(`<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="VirtualXtreamEPG"></tv>`);
});

// ==========================================
// Live Broadcast Server REST API & Streaming Routes (/api/live-servers & /srv/:token)
// ==========================================
app.get('/api/live-servers', (_req, res) => {
  res.json({
    success: true,
    servers: liveServersStore.map(serializeLiveServer)
  });
});

app.post('/api/live-servers', (req, res) => {
  const body = req.body || {};
  const usedTokens = new Set<string>(liveServersStore.map(s => s.token));
  let token = '';
  for (let i = 0; i < 20; i++) {
    const candidate = `srv${crypto.randomBytes(3).toString('hex').slice(0, 5)}`;
    if (!usedTokens.has(candidate)) {
      token = candidate;
      break;
    }
  }
  if (!token) token = `srv${Date.now().toString(36)}`;

  const initialSources: LiveServerSourceItem[] = [];
  if (body.initialUrl && String(body.initialUrl).trim()) {
    const url = String(body.initialUrl).trim();
    initialSources.push({
      id: `src_${Date.now()}`,
      name: String(body.initialSourceName || 'القناة الرئيسية').trim(),
      url,
      kind: body.initialKind === 'video' ? 'video' : detectSourceKind(url),
      userAgent: body.userAgent ? String(body.userAgent).trim() : undefined,
      referer: body.referer ? String(body.referer).trim() : undefined
    });
  }

  const now = new Date().toISOString();
  const newServer: LiveServerItem = {
    id: `lsrv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    token,
    title: String(body.title || 'سيرفر البث المباشر').trim(),
    status: 'live',
    activeMode: 'source',
    activeSourceId: initialSources[0]?.id || null,
    sources: initialSources,
    switchCount: 1,
    lastSwitchedAt: now,
    createdAt: now,
    updatedAt: now,
    pauseNoticeMessage: String(body.pauseNoticeMessage || 'البث متوقف مؤقتاً من غرفة التحكم').trim(),
    customPosterUrl: String(body.customPosterUrl || '/uploads/preset_poster_1.jpg').trim(),
    viewsCount: 0,
    currentViewers: 0
  };

  liveServersStore.unshift(newServer);
  saveLiveServersNow(liveServersStore);
  if (initialSources[0]?.kind === 'video') {
    startVideoLoopPipeline(newServer, initialSources[0]);
  }
  broadcastLiveServerUpdate(newServer);
  res.status(201).json({ success: true, server: serializeLiveServer(newServer) });
});

app.get('/api/live-servers/storage', (_req, res) => {
  try {
    const stat = fs.statfsSync(UPLOADS_DIR);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    let usedUploadBytes = 0;
    try {
      for (const f of fs.readdirSync(UPLOADS_DIR)) {
        if (f.startsWith('srv_vid_')) {
          usedUploadBytes += fs.statSync(path.join(UPLOADS_DIR, f)).size;
        }
      }
    } catch {}
    res.json({
      success: true,
      totalBytes,
      freeBytes,
      usedUploadBytes,
      maxSupportedBytes: 1024 * 1024 * 1024 * 1024 // 1 TB virtual chunk ceiling
    });
  } catch {
    res.json({ success: true, totalBytes: 0, freeBytes: 0, usedUploadBytes: 0, maxSupportedBytes: 1024 * 1024 * 1024 * 1024 });
  }
});

app.post('/api/live-servers/restore', (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.servers) ? req.body.servers : [];
    if (incoming.length === 0) {
      return res.json({ success: true, restored: 0, servers: liveServersStore.map(serializeLiveServer) });
    }
    let restoredCount = 0;
    for (const item of incoming) {
      const sanitized = sanitizeLiveServerItem(item);
      if (!sanitized) continue;
      if (liveServersStore.some(s => s.id === sanitized.id || s.token === sanitized.token)) continue;
      sanitized.updatedAt = new Date().toISOString();
      liveServersStore.push(sanitized);
      restoredCount += 1;
    }
    if (restoredCount > 0) {
      saveLiveServersNow(liveServersStore);
    }
    return res.json({ success: true, restored: restoredCount, servers: liveServersStore.map(serializeLiveServer) });
  } catch {
    return res.status(500).json({ success: false, error: 'تعذر استعادة بيانات السيرفر' });
  }
});

app.post('/api/live-servers/upload-video-chunk', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const buf = req.body as Buffer;
    const rawUploadId = String(req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const index = Number(req.query.index ?? -1);
    const total = Number(req.query.total ?? 0);
    const rawName = String(req.query.filename || 'video.mp4');

    if (!rawUploadId || !Number.isFinite(index) || index < 0 || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ success: false, error: 'بيانات رفع الفيديو غير مكتملة' });
    }
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ success: false, error: 'الجزء المرفوع فارغ' });
    }

    const extMatch = path.extname(rawName).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const ext = ['.mp4', '.mov', '.webm', '.mkv', '.3gp', '.m4v', '.avi', '.ts'].includes(extMatch) ? extMatch : '.mp4';
    const fileName = `srv_vid_${rawUploadId}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    if (index === 0) {
      await fs.promises.writeFile(filePath, buf);
    } else {
      await fs.promises.appendFile(filePath, buf);
    }

    const done = index + 1 >= total;
    return res.json({
      success: true,
      done,
      index,
      videoUrl: done ? `/uploads/${fileName}` : undefined
    });
  } catch (err) {
    console.error('Upload video chunk error:', err);
    return res.status(500).json({ success: false, error: 'فشل حفظ جزء الفيديو' });
  }
});

app.post('/api/live-servers/upload-video', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
  try {
    const buf = req.body as Buffer;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ success: false, error: 'ملف الفيديو فارغ أو غير صالح' });
    }
    const rawName = String(req.query.filename || 'video.mp4');
    const extMatch = path.extname(rawName).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const ext = ['.mp4', '.mov', '.webm', '.mkv', '.3gp', '.m4v', '.avi', '.ts'].includes(extMatch) ? extMatch : '.mp4';
    const fileName = `srv_vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), buf);
    return res.json({ success: true, videoUrl: `/uploads/${fileName}` });
  } catch (err) {
    console.error('Upload server video error:', err);
    return res.status(500).json({ success: false, error: 'فشل حفظ ملف الفيديو' });
  }
});

app.put('/api/live-servers/:id', (req, res) => {
  const srv = liveServersStore.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  const body = req.body || {};
  if (body.title !== undefined) srv.title = String(body.title).trim() || srv.title;
  if (body.pauseNoticeMessage !== undefined) srv.pauseNoticeMessage = String(body.pauseNoticeMessage).trim();
  if (body.customPosterUrl !== undefined) srv.customPosterUrl = String(body.customPosterUrl).trim();
  srv.updatedAt = new Date().toISOString();

  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});

app.post('/api/live-servers/:id/sources', (req, res) => {
  const srv = liveServersStore.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  const { name, url, kind, userAgent, referer, activateNow } = req.body || {};
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return res.status(400).json({ success: false, error: 'يرجى إدخال رابط البث أو الفيديو' });

  const src: LiveServerSourceItem = {
    id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || `مصدر ${srv.sources.length + 1}`).trim(),
    url: cleanUrl,
    kind: kind === 'video' ? 'video' : (kind === 'hls' ? 'hls' : detectSourceKind(cleanUrl)),
    userAgent: userAgent ? String(userAgent).trim() : undefined,
    referer: referer ? String(referer).trim() : undefined
  };

  srv.sources.unshift(src);
  if (activateNow || !srv.activeSourceId) {
    stopLiveServerStudio(srv.id);
    srv.activeMode = 'source';
    srv.activeSourceId = src.id;
    srv.status = 'live';
    srv.switchCount += 1;
    srv.lastSwitchedAt = new Date().toISOString();
    const rt = getLiveServerRuntime(srv.id);
    rt.resolvedVariantCache = undefined;
    if (src.kind === 'video') {
      startVideoLoopPipeline(srv, src);
    } else {
      stopLiveServerLoop(srv.id);
    }
  }
  srv.updatedAt = new Date().toISOString();
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, source: src, server: serializeLiveServer(srv) });
});

app.delete('/api/live-servers/:id/sources/:sourceId', (req, res) => {
  const srv = liveServersStore.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  const wasActive = srv.activeSourceId === req.params.sourceId;
  srv.sources = srv.sources.filter(x => x.id !== req.params.sourceId);
  if (wasActive) {
    stopLiveServerLoop(srv.id);
    srv.activeSourceId = srv.sources[0]?.id || null;
    srv.switchCount += 1;
    srv.lastSwitchedAt = new Date().toISOString();
    if (srv.sources[0]?.kind === 'video' && srv.status === 'live') {
      startVideoLoopPipeline(srv, srv.sources[0]);
    }
  }
  srv.updatedAt = new Date().toISOString();
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});

app.post('/api/live-servers/:id/switch', async (req, res) => {
  let srv = liveServersStore.find(s => s.id === req.params.id);
  const { mode, sourceId, url, name, kind, userAgent, referer, fallbackServer } = req.body || {};

  // Auto-rehydrate server if ephemeral container restarted without it
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    srv = {
      id: String(fallbackServer.id),
      token: String(fallbackServer.token),
      title: String(fallbackServer.title || 'سيرفر البث المباشر'),
      status: 'live',
      activeMode: 'source',
      activeSourceId: fallbackServer.activeSourceId || null,
      sources: Array.isArray(fallbackServer.sources) ? fallbackServer.sources : [],
      switchCount: Number(fallbackServer.switchCount) || 1,
      createdAt: String(fallbackServer.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      lastSwitchedAt: new Date().toISOString(),
      pauseNoticeMessage: String(fallbackServer.pauseNoticeMessage || 'البث متوقف مؤقتاً من غرفة التحكم'),
      customPosterUrl: String(fallbackServer.customPosterUrl || '/uploads/preset_poster_1.jpg'),
      viewsCount: Number(fallbackServer.viewsCount) || 0,
      currentViewers: 0
    };
    liveServersStore.unshift(srv);
  }
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  const rt = getLiveServerRuntime(srv.id);
  rt.resolvedVariantCache = undefined;

  if (mode === 'studio') {
    stopLiveServerLoop(srv.id);
    srv.activeMode = 'studio';
    srv.status = 'live';
    srv.switchCount += 1;
    srv.lastSwitchedAt = new Date().toISOString();
    srv.updatedAt = srv.lastSwitchedAt;
    saveLiveServersNow(liveServersStore);
    broadcastLiveServerUpdate(srv);
    return res.json({ success: true, server: serializeLiveServer(srv) });
  }

  let targetSource: LiveServerSourceItem | undefined;
  if (sourceId) {
    targetSource = srv.sources.find(x => x.id === sourceId);
    if (!targetSource) {
      return res.status(404).json({ success: false, error: 'المصدر المحدد غير موجود' });
    }
  } else if (url && String(url).trim()) {
    let cleanUrl = String(url).trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    if (cleanUrl.includes(`/srv/${srv.token}`)) {
      return res.status(400).json({ success: false, error: 'لا يمكن وضع رابط نفس السيرفر كمصدر لنفسه' });
    }
    const existing = srv.sources.find(x => x.url === cleanUrl);
    if (existing) {
      targetSource = existing;
      if (name && String(name).trim()) existing.name = String(name).trim();
      if (kind === 'video' || kind === 'hls') existing.kind = kind;
    } else {
      targetSource = {
        id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: String(name || `بث مباشر ${srv.sources.length + 1}`).trim(),
        url: cleanUrl,
        kind: kind === 'video' ? 'video' : (kind === 'hls' ? 'hls' : detectSourceKind(cleanUrl)),
        userAgent: userAgent ? String(userAgent).trim() : undefined,
        referer: referer ? String(referer).trim() : undefined
      };
      srv.sources.unshift(targetSource);
    }
  } else {
    return res.status(400).json({ success: false, error: 'حدد مصدراً أو أدخل رابطاً للتبديل' });
  }

  stopLiveServerStudio(srv.id);
  srv.activeMode = 'source';
  srv.activeSourceId = targetSource.id;
  srv.status = 'live';
  srv.switchCount += 1;
  srv.lastSwitchedAt = new Date().toISOString();
  srv.updatedAt = srv.lastSwitchedAt;

  if (targetSource.kind === 'video') {
    startVideoLoopPipeline(srv, targetSource);
    // Warm up the first HLS segment before responding so player sees live video immediately
    await waitForLocalHlsPlaylist(rt.loopDir, 1800);
  } else {
    stopLiveServerLoop(srv.id);
  }

  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  return res.json({ success: true, server: serializeLiveServer(srv) });
});

app.post('/api/live-servers/:id/studio-start', (req, res) => {
  const { container, hasAudio, fallbackServer } = req.body || {};
  let srv = liveServersStore.find(s => s.id === req.params.id);
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    const sanitized = sanitizeLiveServerItem(fallbackServer);
    if (sanitized) {
      srv = sanitized;
      liveServersStore.unshift(srv);
    }
  }
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  startLiveServerStudioPipeline(srv, {
    container: container === 'mp4' ? 'mp4' : 'webm',
    hasAudio: hasAudio !== false,
    socketId: null
  });
  return res.json({ success: true, server: serializeLiveServer(srv) });
});

app.post('/api/live-servers/:id/studio-stop', (req, res) => {
  const serverId = req.params.id;
  stopLiveServerStudio(serverId);
  const srv = liveServersStore.find(s => s.id === serverId);
  if (srv) {
    if (srv.activeSourceId) {
      srv.activeMode = 'source';
      const fallbackSrc = srv.sources.find(x => x.id === srv.activeSourceId);
      if (fallbackSrc?.kind === 'video' && srv.status === 'live') {
        startVideoLoopPipeline(srv, fallbackSrc);
      }
    }
    srv.switchCount += 1;
    srv.lastSwitchedAt = new Date().toISOString();
    srv.updatedAt = srv.lastSwitchedAt;
    saveLiveServersNow(liveServersStore);
    broadcastLiveServerUpdate(srv);
  }
  return res.json({ success: true, server: srv ? serializeLiveServer(srv) : null });
});

app.post('/api/live-servers/:id/studio-chunk', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const srv = liveServersStore.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false });
  const rt = liveServerRuntimes.get(srv.id);
  if (!rt || !rt.studioProc || !rt.studioActive) return res.status(409).json({ success: false });
  const buf = req.body as Buffer;
  if (buf && Buffer.isBuffer(buf) && buf.length > 0) {
    if (rt.studioDisconnectTimer) {
      clearTimeout(rt.studioDisconnectTimer);
      rt.studioDisconnectTimer = null;
    }
    rt.lastStudioChunkAt = Date.now();
    const stdin = rt.studioProc.stdin;
    if (stdin && !stdin.destroyed && stdin.writable) {
      try {
        rt.studioBytesSent += buf.length;
        stdin.write(buf);
      } catch {}
    }
  }
  return res.json({ success: true });
});

app.patch('/api/live-servers/:id/toggle', (req, res) => {
  let srv = liveServersStore.find(s => s.id === req.params.id);
  const fallbackServer = req.body?.fallbackServer;
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    srv = {
      id: String(fallbackServer.id),
      token: String(fallbackServer.token),
      title: String(fallbackServer.title || 'سيرفر البث المباشر'),
      status: fallbackServer.status === 'paused' ? 'paused' : 'live',
      activeMode: 'source',
      activeSourceId: fallbackServer.activeSourceId || null,
      sources: Array.isArray(fallbackServer.sources) ? fallbackServer.sources : [],
      switchCount: Number(fallbackServer.switchCount) || 1,
      createdAt: String(fallbackServer.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      lastSwitchedAt: new Date().toISOString(),
      pauseNoticeMessage: String(fallbackServer.pauseNoticeMessage || 'البث متوقف مؤقتاً من غرفة التحكم'),
      customPosterUrl: String(fallbackServer.customPosterUrl || '/uploads/preset_poster_1.jpg'),
      viewsCount: Number(fallbackServer.viewsCount) || 0,
      currentViewers: 0
    };
    liveServersStore.unshift(srv);
  }
  if (!srv) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  srv.status = srv.status === 'live' ? 'paused' : 'live';
  srv.switchCount += 1;
  srv.lastSwitchedAt = new Date().toISOString();
  srv.updatedAt = srv.lastSwitchedAt;

  if (srv.status === 'paused') {
    stopLiveServerStudio(srv.id);
    stopLiveServerLoop(srv.id);
    if (srv.activeMode === 'studio') {
      srv.activeMode = 'source';
    }
  } else if (srv.activeMode === 'source' && srv.activeSourceId) {
    const src = srv.sources.find(x => x.id === srv.activeSourceId);
    if (src?.kind === 'video') {
      startVideoLoopPipeline(srv, src);
    }
  }

  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});

app.delete('/api/live-servers/:id', (req, res) => {
  const id = req.params.id;
  const idx = liveServersStore.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'السيرفر غير موجود' });

  stopLiveServerStudio(id);
  stopLiveServerLoop(id);
  liveServerRuntimes.delete(id);
  liveServersStore.splice(idx, 1);
  saveLiveServersNow(liveServersStore);
  if (globalIo) globalIo.emit('live-server:deleted', { id });
  res.json({ success: true });
});

// Serve local FFmpeg studio or loop .ts segment with zero RAM buffering
app.get('/srv/:token/lseg/:mode/:segName', (req, res) => {
  const { token, mode, segName } = req.params;
  if ((mode !== 'studio' && mode !== 'loop') || !/^seg\d+\.ts$/.test(segName)) {
    return res.status(400).send('Invalid segment');
  }
  const srv = liveServersStore.find(s => s.token === token || s.id === token);
  if (!srv) return res.status(404).send('Server not found');

  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get('user-agent') || ''}`;
  rt.activeViewersMap.set(viewerKey, Date.now());

  const dir = mode === 'studio' ? rt.studioDir : rt.loopDir;
  const segPath = path.join(dir, segName);
  if (!fs.existsSync(segPath)) {
    return res.status(404).send('Segment not ready');
  }

  applyObfuscatedResponseHeaders(res, 'video/MP2T');
  const readStream = fs.createReadStream(segPath);
  readStream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  res.on('close', () => readStream.destroy());
  readStream.pipe(res);
});

// Serve pause standby MPEG-TS segment for Live Server (ONLY when server is explicitly paused)
app.get('/srv/:token/pause.ts', async (req, res) => {
  const srv = liveServersStore.find(s => s.token === req.params.token || s.id === req.params.token);
  if (!srv) return res.status(404).send('Server not found');
  return sendPauseSegmentForStream(res, srv.customPosterUrl, srv.id, srv.title);
});

// Serve clean neutral A/V loading standby TS (H264+AAC) while studio/loop/external warms up — never says "Paused"
app.get('/srv/:token/standby.ts', (_req, res) => {
  const tsPath = ensureStandbyLoadingTs();
  if (tsPath && fs.existsSync(tsPath)) {
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(tsPath);
  }
  return res.status(503).send('Standby initializing');
});

// Zero-cache fast segment pipe for hot-swap external HLS sources
app.get('/srv/:token/seg', async (req, res) => {
  const srv = liveServersStore.find(s => s.token === req.params.token || s.id === req.params.token);
  const targetUrl = String(req.query.u || '');
  if (!srv || !targetUrl) return res.status(400).send('Missing URL');

  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get('user-agent') || ''}`;
  rt.activeViewersMap.set(viewerKey, Date.now());

  const activeSrc = srv.sources.find(x => x.id === srv.activeSourceId);
  const controller = new AbortController();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
    controller.abort();
  });

  try {
    const connectTimeout = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(targetUrl, {
      headers: {
        ...getObfuscatedUpstreamHeaders(activeSrc?.userAgent, activeSrc?.referer),
        ...(req.headers.range ? { Range: String(req.headers.range) } : {})
      },
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(connectTimeout);

    if (clientClosed || res.writableEnded) return;
    if (!upstream || (!upstream.ok && upstream.status !== 206)) {
      return res.status(upstream?.status || 502).send('Upstream segment unavailable');
    }

    const ct = upstream.headers.get('content-type') || 'video/MP2T';
    res.status(upstream.status);
    applyObfuscatedResponseHeaders(res, ct);
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      res.on('close', () => nodeStream.destroy());
      nodeStream.pipe(res);
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch {
    if (!res.headersSent) return res.status(502).send('Segment stream error');
  }
});

// Primary Live Server HLS Endpoint: /srv/:token.m3u8
app.get(['/srv/:token.m3u8', '/srv/:token'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const rawToken = String(req.params.token || '').replace(/\.m3u8$/i, '');
  const srv = liveServersStore.find(s => s.token === rawToken || s.id === rawToken);
  if (!srv) {
    return res.status(404).send('#EXTM3U\n#EXT-X-ERROR: LIVE_SERVER_NOT_FOUND');
  }

  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get('user-agent') || ''}`;
  rt.activeViewersMap.set(viewerKey, Date.now());
  srv.viewsCount = (srv.viewsCount || 0) + 1;

  const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, '');

  // Paused state -> explicit "Broadcast Paused" slate
  if (srv.status === 'paused') {
    const pauseSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/pause.ts?e=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 4000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:pause`, [
      { key: `${srv.switchCount}:pause:${bucket}`, extinf: '#EXTINF:4.000,', uri: `${pauseSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:pause:${bucket + 1}`, extinf: '#EXTINF:4.000,', uri: `${pauseSeg}&b=${bucket + 1}` }
    ], 4);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  // Mode 1: Studio Camera / Screen Live Stream (Socket.IO or HTTP -> FFmpeg -> HLS)
  if (srv.activeMode === 'studio') {
    if (rt.studioActive) {
      const localText = await waitForLocalHlsPlaylist(rt.studioDir, 1200);
      if (localText) {
        const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, 'studio', srv.switchCount);
        if (parsed.segments.length > 0) {
          const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:studio`, parsed.segments, parsed.targetDuration);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          return res.send(playlist);
        }
      }
    }
    // Neutral A/V loading standby while studio camera finishes first keyframe (never shows "Broadcast Paused")
    const standbySeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?wait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:studio-wait`, [
      { key: `${srv.switchCount}:studio-wait:${bucket}`, extinf: '#EXTINF:2.000,', uri: `${standbySeg}&b=${bucket}` },
      { key: `${srv.switchCount}:studio-wait:${bucket + 1}`, extinf: '#EXTINF:2.000,', uri: `${standbySeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  // Mode 2: Active Source (External HLS Hot-Swap OR 24/7 Video Loop)
  const activeSrc = srv.sources.find(x => x.id === srv.activeSourceId) || srv.sources[0];
  if (!activeSrc) {
    const standbySeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?empty=1`;
    const bucket = Math.floor(Date.now() / 2000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:empty`, [
      { key: `${srv.switchCount}:empty:${bucket}`, extinf: '#EXTINF:2.000,', uri: `${standbySeg}&b=${bucket}` },
      { key: `${srv.switchCount}:empty:${bucket + 1}`, extinf: '#EXTINF:2.000,', uri: `${standbySeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  if (activeSrc.kind === 'video') {
    if (!rt.loopActive || rt.loopSourceUrl !== activeSrc.url) {
      startVideoLoopPipeline(srv, activeSrc);
    }
    const localText = await waitForLocalHlsPlaylist(rt.loopDir, 7500);
    if (localText) {
      const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, 'loop', srv.switchCount);
      if (parsed.segments.length > 0) {
        const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop`, parsed.segments, parsed.targetDuration);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(playlist);
      }
    }
    const warmSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?loopwait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop-wait`, [
      { key: `${srv.switchCount}:loop-wait:${bucket}`, extinf: '#EXTINF:2.000,', uri: `${warmSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:loop-wait:${bucket + 1}`, extinf: '#EXTINF:2.000,', uri: `${warmSeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  // Fast External Live HLS Hot-Swap (supports internal /v/:slug & auto video promotion)
  const external = await fetchLiveServerExternalSegments(srv, rt, activeSrc, publicBaseUrl);
  if (external?.autoVideoFallback) {
    activeSrc.kind = 'video';
    startVideoLoopPipeline(srv, activeSrc);
    saveLiveServersNow(liveServersStore);
    const localText = await waitForLocalHlsPlaylist(rt.loopDir, 7500);
    if (localText) {
      const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, 'loop', srv.switchCount);
      if (parsed.segments.length > 0) {
        const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop`, parsed.segments, parsed.targetDuration);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(playlist);
      }
    }
  }

  if (external?.isPausedInternal) {
    const pauseSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/pause.ts?e=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 4000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:pause-int`, [
      { key: `${srv.switchCount}:pause-int:${bucket}`, extinf: '#EXTINF:4.000,', uri: `${pauseSeg}&b=${bucket}` }
    ], 4);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  if (!external || external.segments.length === 0) {
    const waitSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?hlswait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2000);
    const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:hls-wait`, [
      { key: `${srv.switchCount}:hls-wait:${bucket}`, extinf: '#EXTINF:2.000,', uri: `${waitSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:hls-wait:${bucket + 1}`, extinf: '#EXTINF:2.000,', uri: `${waitSeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(playlist);
  }

  const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:hls:${activeSrc.id}`, external.segments, external.targetDuration);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  return res.send(playlist);
});

// Stream Proxy / HLS Manifest Generator & Relative URL Rewriter (Supports Virtual Xtream & Direct Streams)
app.all([
  '/v/:slug.m3u8',
  '/v/:slug',
  '/m/:slug.m3u8',
  '/m/:slug',
  '/api/stream/:slug/manifest.m3u8',
  '/api/stream/:slug/manifest.m3u8/*',
  '/live/:user/:pass/:slug*',
  '/:prefix/live/:user/:pass/:slug*',
  '/movie/:user/:pass/:slug*',
  '/:prefix/movie/:user/:pass/:slug*',
  '/series/:user/:pass/:slug*',
  '/:prefix/series/:user/:pass/:slug*',
  '/:user/:pass/:slug*'
], async (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  const reqUser = req.params.user;
  const reqPass = req.params.pass;
  let rawSlug = req.params.slug || req.params[0] || '';

  // Do not let /:user/:pass/:slug* swallow /v/:slug/seg.ts or /srv/...
  if (((reqUser === 'v' || reqUser === 'm') && req.path.endsWith('/seg.ts')) || reqUser === 'srv') {
    return next();
  }

  // 1. Check if request is for Virtual Xtream Account
  if (reqUser && reqPass) {
    const vAcc = virtualXtreamStore.find(v => v.virtualUser === reqUser && v.virtualPass === reqPass);
    if (vAcc) {
      const clientUA = req.get('user-agent') || '';
      const clientReferer = req.get('referer') || req.get('origin') || '';
      const clientIP = getClientIp(req);

      trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, `xtream_stream:${rawSlug || 'live'}`, {
        acceptLanguage: req.get('accept-language') || '',
        forwardedChain: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : ''
      });

      const isBlocked = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
      const isExceeded = checkExceedsMaxConnections(vAcc, clientUA, clientIP);

      if (vAcc.status === 'paused' || isBlocked || isExceeded) {
        if (isBlocked) {
          return res.status(403).send('403 Forbidden - Access Blocked By Virtual Xtream Shield');
        }

        if (req.originalUrl.includes('.ts') || req.path.endsWith('.ts')) {
          return sendPauseSegmentForStream(res, vAcc.customPosterUrl, vAcc.id, vAcc.title);
        }

        const publicBaseUrl = getPublicBaseUrl(req);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:5.000,\n${publicBaseUrl}/api/virtual-xtream/${vAcc.id}/pause-segment.ts\n`);
      }

      // Active Virtual Account -> Check local website stream first or proxy from real Xtream server
      const cleanSlugParam = (rawSlug || '').replace(/\.(m3u8|ts)$/, '');
      const localMatch = streamsStore.find(s => s.streamToken === cleanSlugParam || s.slug === cleanSlugParam || s.id === cleanSlugParam || s.slug === rawSlug);

      if (localMatch) {
        if (localMatch.status === 'paused') {
          return sendPauseSegmentForStream(res, localMatch.customPosterUrl, localMatch.id, localMatch.title);
        }
        const publicBaseUrl = getPublicBaseUrl(req);
        return res.redirect(buildStreamPlayUrl(localMatch, publicBaseUrl));
      }

      if (cleanSlugParam === 'bein_sports_1' || cleanSlugParam === 'news_live') {
        return sendPauseSegmentForStream(res, vAcc.customPosterUrl, vAcc.id, vAcc.title);
      }

      try {
        let realHost = vAcc.realHost.trim().replace(/\/$/, '');
        if (!realHost.startsWith('http://') && !realHost.startsWith('https://')) {
          realHost = `http://${realHost}`;
        }

        let origPath = req.originalUrl;
        let realPath = origPath
          .replace(`/live/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/live/${vAcc.realUser}/${vAcc.realPass}`)
          .replace(`/movie/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/movie/${vAcc.realUser}/${vAcc.realPass}`)
          .replace(`/series/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/series/${vAcc.realUser}/${vAcc.realPass}`)
          .replace(`/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/${vAcc.realUser}/${vAcc.realPass}`);

        const realStreamUrl = `${realHost}${realPath}`;

        // ULTRA-FAST DIRECT ORIGIN SPEED: If protection isn't specifically enforcing proxy rewrite, redirect directly for 0ms latency!
        const needsProxyProtection = vAcc.blockAllExternalApps || (vAcc.blockedApps && vAcc.blockedApps.length > 0) || req.query.proxy === '1';
        if (!needsProxyProtection) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.redirect(302, realStreamUrl);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const upstreamRes = await fetch(realStreamUrl, {
          headers: {
            'User-Agent': clientUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
          redirect: 'follow',
          signal: controller.signal
        }).catch(err => {
          console.error('[Virtual Xtream Stream Proxy] Error fetching real stream:', err);
          return null;
        });

        clearTimeout(timeoutId);

        if (!upstreamRes || !upstreamRes.ok) {
          console.warn(`[Virtual Xtream Stream Proxy] Upstream returned status ${upstreamRes?.status || 502}`);
          return res.status(upstreamRes?.status || 502).send('Real server stream unreachable');
        }

        const finalUrl = upstreamRes.url || realStreamUrl;
        const contentType = upstreamRes.headers.get('content-type') || 'video/MP2T';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');

        const isM3u = contentType.includes('mpegurl') || contentType.includes('m3u8') || req.originalUrl.includes('.m3u8');

        if (isM3u) {
          const text = await upstreamRes.text();
          if (text.trim().startsWith('#EXTM3U') || isM3u) {
            const publicBaseUrl = getPublicBaseUrl(req);
            const proxyBase = `${publicBaseUrl}/api/proxy-segment?vUser=${encodeURIComponent(vAcc.virtualUser)}&url=`;

            const lastSlashIdx = finalUrl.lastIndexOf('/');
            const baseUrl = lastSlashIdx !== -1 ? finalUrl.substring(0, lastSlashIdx + 1) : finalUrl;

            const lines = text.split('\n');
            const rewritten = lines.map(line => {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) return line;

              let resolvedUrl = trimmed;
              if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                try { resolvedUrl = new URL(trimmed, baseUrl).href; } catch { resolvedUrl = trimmed; }
              }
              return `${proxyBase}${encodeURIComponent(resolvedUrl)}`;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten.join('\n'));
          }
        }

        // Pipe binary / TS video stream directly to res using Readable.fromWeb for instant playback!
        if (upstreamRes.body) {
          res.setHeader('Content-Type', contentType);
          if (upstreamRes.headers.get('content-length')) {
            res.setHeader('Content-Length', upstreamRes.headers.get('content-length')!);
          }
          Readable.fromWeb(upstreamRes.body as any).pipe(res);
          return;
        }

        const arrayBuf = await upstreamRes.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        return res.send(Buffer.from(arrayBuf));
      } catch (err) {
        console.error('[Virtual Xtream Stream Proxy] Error proxying real stream:', err);
        return res.status(502).send('Error proxying real Xtream stream');
      }
    }
  }

  // 2. Direct Stream Slug matching logic
  if (!rawSlug || rawSlug.startsWith('api') || rawSlug.startsWith('public') || rawSlug.startsWith('assets') || rawSlug.includes('.')) {
    if (rawSlug.endsWith('.m3u8') || rawSlug.endsWith('.ts')) {
      rawSlug = rawSlug.replace(/\.(m3u8|ts)$/, '');
    } else {
      return next();
    }
  }

  const cleanSlug = rawSlug.replace(/\.(m3u8|ts)$/, '');
  const stream = streamsStore.find(s =>
    s.streamToken === cleanSlug ||
    s.slug === cleanSlug ||
    s.id === cleanSlug ||
    s.slug === rawSlug ||
    s.xtreamStreamId === cleanSlug
  );

  if (!stream) {
    if (req.originalUrl.includes('/live/') || req.originalUrl.includes('.m3u8') || req.path.startsWith('/v/') || req.path.startsWith('/m/')) {
      return res.status(404).send('#EXTM3U\n#EXT-X-ERROR: STREAM_NOT_FOUND');
    }
    return next();
  }


  // Extract Client User-Agent, Referer, IP Address, and HTTP Intelligence Headers
  const clientUA = req.get('user-agent') || '';
  const clientReferer = req.get('referer') || req.get('origin') || '';
  const clientIP = getClientIp(req);
  const acceptLanguage = req.get('accept-language') || '';
  const forwardedChain = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';

  // Check if incoming request is from a blocked application
  const isBlockedApp = checkIsBlocked(
    clientUA,
    clientReferer,
    clientIP,
    stream.blockedApps,
    stream.blockAllExternalApps
  );

  // Track & Update Connected Applications List ONLY for real external viewers, non-blocking for 0ms stream speed
  if (isRealExternalViewer(clientIP, clientUA)) {
    if (!stream.connectedApps) stream.connectedApps = [];
    const appName = detectAppName(clientUA, clientReferer);
    const uaKey = clientUA || clientReferer || 'unknown-app-client';
    const endpointLabel = `hls:${cleanSlug}`;

    let existingApp = stream.connectedApps.find(a =>
      a.userAgent === uaKey ||
      (a.ipAddress && clientIP && a.ipAddress === clientIP) ||
      (a.appName === appName && appName !== 'مشغل مجهول (بدون بيانات User-Agent)')
    );

    if (existingApp) {
      existingApp.isBlocked = isBlockedApp;
      updateConnectionInfo(existingApp, clientUA, clientReferer, clientIP, endpointLabel, {
        acceptLanguage,
        forwardedChain
      }).then(() => saveStreams(streamsStore)).catch(() => {});
    } else {
      const nowIso = new Date().toISOString();
      const newApp: ConnectedApp = {
        id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userAgent: uaKey,
        appName,
        ipAddress: clientIP,
        osName: detectOsName(clientUA),
        clientType: classifyClientType(clientUA, clientReferer),
        acceptLanguage: acceptLanguage || undefined,
        forwardedChain: forwardedChain || undefined,
        deviceFingerprint: computeDeviceFingerprint(clientIP, uaKey, acceptLanguage),
        requestCount: 1,
        firstSeen: nowIso,
        lastActive: nowIso,
        lastEndpoint: endpointLabel,
        accessHistory: [{ endpoint: endpointLabel, timestamp: nowIso }],
        isBlocked: isBlockedApp
      };
      stream.connectedApps.unshift(newApp);
      if (stream.connectedApps.length > 40) {
        stream.connectedApps = stream.connectedApps.slice(0, 40);
      }
      updateConnectionInfo(newApp, clientUA, clientReferer, clientIP, endpointLabel, {
        acceptLanguage,
        forwardedChain
      }).then(() => saveStreams(streamsStore)).catch(() => {});
    }
  }

  // Enforce App Block STRICTLY: Return 403 HTTP status code so players crash/stop playback
  if (isBlockedApp) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Stream-Protection', 'APP_ACCESS_BLOCKED');
    saveStreams(streamsStore);
    return res.status(403).send('403 Forbidden - App Stolen Access Blocked By Owner');
  }

  // Handle Paused Stream state
  if (stream.status === 'paused') {
    if (req.originalUrl.includes('.ts') || req.path.endsWith('.ts')) {
      return sendPauseSegmentForStream(res, stream.customPosterUrl, stream.id, stream.title);
    }

    const publicBaseUrl = getPublicBaseUrl(req);
    const segKey = stream.streamToken || stream.slug;
    const pauseSegUrl = `${publicBaseUrl}/v/${segKey}/seg.ts`;

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Stream-Status', 'PAUSED');
    const cacheBuster = Date.now();
    const pausedNotice = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXT-X-MEDIA-SEQUENCE:1
#EXTINF:5.000,
${pauseSegUrl}?v=${cacheBuster}
`;
    return res.send(pausedNotice);
  }

  stream.viewsCount = (stream.viewsCount || 0) + 1;

  try {
    const originalUrl = stream.originalUrl;

    const hasSpecialHeaders = !!(stream.refererHeader || stream.userAgentHeader);
    const hasBlockingActive = !!(stream.blockAllExternalApps || (stream.blockedApps && stream.blockedApps.length > 0));
    const isProxyForced = req.query.proxy === '1';

    // Direct zero-hop CDN delivery unless proxy protection / custom headers / CORS fallback (?proxy=1) are required
    const needsProxy = (hasSpecialHeaders || hasBlockingActive || isProxyForced) && (!stream.isBulk || hasSpecialHeaders);
    const isM3u8Request = req.path.endsWith('.m3u8') || stream.streamType === 'hls';

    if (!needsProxy && !isM3u8Request && stream.streamType !== 'youtube' && stream.streamType !== 'twitch' && stream.streamType !== 'embed') {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, originalUrl);
    }

    if (stream.streamType === 'youtube' || stream.streamType === 'twitch' || stream.streamType === 'embed') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>${stream.title}</title></head>
          <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
            <iframe src="${originalUrl}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay"></iframe>
          </body>
        </html>
      `);
    }

    const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, '');

    const liveManifest = await fetchLiveManifestUncached(stream, publicBaseUrl, needsProxy);
    if (!liveManifest) {
      return res.redirect(originalUrl);
    }

    res.setHeader('Content-Type', liveManifest.contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(liveManifest.text);
  } catch (err) {
    res.redirect(stream.originalUrl);
  }
});

// Proxy Performance Metrics (Live Pass-Through, Zero Temporary Cache)
export interface ProxyMetrics {
  totalRequestsServiced: number;
  originFetchCount: number;
  cachedRequestsServiced: number;
  activeStreamsCount: number;
  cachedSegmentsCount: number;
  bandwidthSavedMB: number;
}

const proxyMetrics: ProxyMetrics = {
  totalRequestsServiced: 0,
  originFetchCount: 0,
  cachedRequestsServiced: 0,
  activeStreamsCount: 0,
  cachedSegmentsCount: 0,
  bandwidthSavedMB: 0
};

function resolveRelativeUrl(rawUrl: string, baseUrl: string): string {
  if (!rawUrl || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;
  try {
    return new URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}

function rewriteTagUriAttributes(
  line: string,
  baseUrl: string,
  proxyBase: string,
  needsProxy: boolean
): string {
  if (!line.includes('URI="')) return line;
  return line.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
    const resolved = resolveRelativeUrl(rawUri.trim(), baseUrl);
    const finalUri = needsProxy ? `${proxyBase}${encodeURIComponent(resolved)}` : resolved;
    return `URI="${finalUri}"`;
  });
}

async function fetchLiveSubPlaylistUncached(
  targetUrl: string,
  proxyBase: string,
  userAgent?: string,
  referer?: string
): Promise<{ text: string; contentType: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const fetchRes = await fetch(targetUrl, {
      headers: getObfuscatedUpstreamHeaders(userAgent, referer),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (!fetchRes || !fetchRes.ok) return null;
    const text = await fetchRes.text();
    const finalTargetUrl = fetchRes.url || targetUrl;
    const lastSlashIdx = finalTargetUrl.lastIndexOf('/');
    const baseUrl = lastSlashIdx !== -1 ? finalTargetUrl.substring(0, lastSlashIdx + 1) : finalTargetUrl;

    const rewrittenText = text
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return rewriteTagUriAttributes(line, baseUrl, proxyBase, true);
        }
        const resolvedUrl = resolveRelativeUrl(trimmed, baseUrl);
        return `${proxyBase}${encodeURIComponent(resolvedUrl)}`;
      })
      .join('\n');

    return { text: rewrittenText, contentType: 'application/vnd.apple.mpegurl' };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function fetchLiveManifestUncached(
  stream: StreamItem,
  publicBaseUrl: string,
  needsProxy: boolean
): Promise<{ text: string; contentType: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(stream.originalUrl, {
      headers: getObfuscatedUpstreamHeaders(stream.userAgentHeader, stream.refererHeader),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (!response || !response.ok) return null;

    const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    const text = await response.text();
    const segStreamParam = encodeURIComponent(stream.streamToken || stream.slug);
    const proxyBase = `${publicBaseUrl}/s-seg?s=${segStreamParam}&url=`;

    const finalOriginUrl = response.url || stream.originalUrl;
    const lastSlashIdx = finalOriginUrl.lastIndexOf('/');
    const baseUrl = lastSlashIdx !== -1 ? finalOriginUrl.substring(0, lastSlashIdx + 1) : finalOriginUrl;

    const finalManifestText = text
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return rewriteTagUriAttributes(line, baseUrl, proxyBase, needsProxy);
        }
        const resolvedUrl = resolveRelativeUrl(trimmed, baseUrl);
        return needsProxy ? `${proxyBase}${encodeURIComponent(resolvedUrl)}` : resolvedUrl;
      })
      .join('\n');

    return { text: finalManifestText, contentType };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

setInterval(() => {
  proxyMetrics.cachedSegmentsCount = 0;
  proxyMetrics.activeStreamsCount = streamsStore.filter(s => s.status === 'active').length + virtualXtreamStore.filter(v => v.status === 'active').length;
}, 10000);

// Traffic Obfuscation & Fake Header Injection Helpers
function getObfuscatedUpstreamHeaders(customUA?: string, customReferer?: string): Record<string, string> {
  const ua = customUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  return {
    'User-Agent': ua,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(customReferer ? { 'Referer': customReferer } : {})
  };
}

function applyObfuscatedResponseHeaders(res: express.Response, contentType: string = 'video/MP2T') {
  res.setHeader('Server', 'nginx/1.24.0 (Ubuntu)');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
}

// Proxy Metrics REST API Endpoint
app.get('/api/proxy-stats', (req, res) => {
  res.json({
    success: true,
    metrics: {
      ...proxyMetrics,
      multiplexEfficiencyPercent: 100,
      savedConnectionsCount: 0,
      activeCachedSegments: 0
    }
  });
});

// Zero-Cache Live Pass-Through Stream Pipe (supports .m3u8 sub-playlists & .ts/.m4s segments with kernel backpressure)
app.get(['/api/proxy-segment', '/s-seg'], async (req, res) => {
  const targetUrl = req.query.url as string;
  const streamSlug = (req.query.stream || req.query.s) as string;
  const vUser = req.query.vUser as string;

  if (!targetUrl) {
    return res.status(400).send('URL query parameter missing');
  }

  const clientUA = req.get('user-agent') || '';
  const clientReferer = req.get('referer') || req.get('origin') || '';
  const clientIP = getClientIp(req);

  let streamUa: string | undefined;
  let streamReferer: string | undefined;

  if (streamSlug) {
    const stream = streamsStore.find(s => s.streamToken === streamSlug || s.slug === streamSlug || s.id === slugToMatch(streamSlug));
    if (stream) {
      if (checkIsBlocked(clientUA, clientReferer, clientIP, stream.blockedApps, stream.blockAllExternalApps)) {
        return res.status(403).send('403 Forbidden: Stolen App Blocked');
      }
      streamUa = stream.userAgentHeader || undefined;
      streamReferer = stream.refererHeader || undefined;
    }
  }

  if (vUser) {
    const vAcc = virtualXtreamStore.find(v => v.virtualUser === vUser);
    if (vAcc && checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps)) {
      return res.status(403).send('403 Forbidden: Stolen App Blocked');
    }
  }

  const controller = new AbortController();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
    controller.abort();
  });

  try {
    const isM3u8 = targetUrl.includes('.m3u8');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (isM3u8) {
      const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, '');
      const queryParams: string[] = [];
      if (streamSlug) queryParams.push(`s=${encodeURIComponent(streamSlug)}`);
      if (vUser) queryParams.push(`vUser=${encodeURIComponent(vUser)}`);
      const queryPrefix = queryParams.length > 0 ? `${queryParams.join('&')}&` : '';
      const proxyBase = `${publicBaseUrl}/s-seg?${queryPrefix}url=`;

      proxyMetrics.totalRequestsServiced += 1;
      proxyMetrics.originFetchCount += 1;

      const freshSub = await fetchLiveSubPlaylistUncached(targetUrl, proxyBase, streamUa || clientUA, streamReferer);
      if (!freshSub) {
        return res.status(502).send('Proxy segment fetch failed');
      }

      applyObfuscatedResponseHeaders(res, freshSub.contentType);
      return res.send(freshSub.text);
    }

    proxyMetrics.totalRequestsServiced += 1;
    proxyMetrics.originFetchCount += 1;

    // Timeout ONLY covers establishing initial connection/headers, never kills active video chunks mid-stream!
    const connectTimeout = setTimeout(() => controller.abort(), 12000);
    const fetchHeaders: Record<string, string> = {
      ...getObfuscatedUpstreamHeaders(streamUa || clientUA, streamReferer),
      ...(req.headers.range ? { Range: String(req.headers.range) } : {})
    };

    const fetchRes = await fetch(targetUrl, {
      headers: fetchHeaders,
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(connectTimeout);

    if (clientClosed || res.writableEnded) return;

    if (!fetchRes || (!fetchRes.ok && fetchRes.status !== 206)) {
      return res.status(fetchRes?.status || 502).send('Proxy TS segment fetch failed');
    }

    const contentType = fetchRes.headers.get('content-type') || 'video/MP2T';
    res.status(fetchRes.status);
    applyObfuscatedResponseHeaders(res, contentType);

    if (fetchRes.headers.get('content-length')) {
      res.setHeader('Content-Length', fetchRes.headers.get('content-length')!);
    }
    if (fetchRes.headers.get('content-range')) {
      res.setHeader('Content-Range', fetchRes.headers.get('content-range')!);
    }

    if (fetchRes.body) {
      const nodeStream = Readable.fromWeb(fetchRes.body as any);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
      return;
    }

    const arrayBuf = await fetchRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuf));
  } catch (err) {
    if (!res.headersSent && !clientClosed) {
      res.status(500).send('Proxy segment error');
    }
  }
});

function slugToMatch(slug: string): string {
  return slug;
}

// Route to serve video slate segment when stream is paused for external players
app.get(['/api/stream/:slug/pause-segment.ts', '/api/stream/:slug/pause-slate.ts', '/m/:slug/seg.ts', '/v/:slug/seg.ts'], async (req, res) => {
  const { slug } = req.params;
  const stream = streamsStore.find(s => s.streamToken === slug || s.slug === slug || s.id === slug);

  if (stream) {
    const clientUA = req.get('user-agent') || '';
    const clientReferer = req.get('referer') || req.get('origin') || '';
    const clientIP = getClientIp(req);

    if (checkIsBlocked(clientUA, clientReferer, clientIP, stream.blockedApps, stream.blockAllExternalApps)) {
      return res.status(403).send('403 Forbidden: Stolen App Blocked');
    }

    if (stream.customPosterUrl) {
      try {
        const customTsPath = await getOrGenerateTsSegmentForStream(stream);
        if (customTsPath && fs.existsSync(customTsPath)) {
          res.setHeader('Content-Type', 'video/MP2T');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.sendFile(customTsPath);
        }
      } catch (err) {
        console.error('Failed serving custom poster TS segment:', err);
      }
    }
  }

  const preset1Ts = path.join(UPLOADS_DIR, 'preset_poster_1.ts');
  if (fs.existsSync(preset1Ts)) {
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(preset1Ts);
  }

  res.status(503).send('Stream Paused');
});

async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom'
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      const cleanPath = url.split('?')[0].replace(/^\/+|\/+$/g, '');

      if (
        url.startsWith('/api') ||
        url.startsWith('/v/') ||
        url.startsWith('/m/') ||
        url.startsWith('/srv/') ||
        url.startsWith('/uploads/') ||
        url.startsWith('/s-seg') ||
        url.includes('/get.php') ||
        url.includes('/player_api.php') ||
        url.includes('/live/') ||
        url.includes('/movie/') ||
        url.includes('/series/')
      ) {
        return next();
      }

      if (cleanPath && !cleanPath.includes('.') && cleanPath !== 'uploads' && cleanPath !== 'assets') {
        const isVirtualSlug = virtualXtreamStore.some(v =>
          v.customVirtualHost &&
          cleanCustomVirtualHost(v.customVirtualHost)?.toLowerCase() === cleanPath.toLowerCase()
        );

        if (isVirtualSlug) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title></title></head>
<body style="background-color: #ffffff; margin: 0; padding: 0; height: 100vh;"></body>
</html>`);
        }
      }

      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);

        // Strip any title, description, og or twitter meta tags completely
        template = template
          .replace(/<title>.*?<\/title>/gi, '')
          .replace(/<meta property="og:[^>]*>/gi, '')
          .replace(/<meta name="twitter:[^>]*>/gi, '')
          .replace(/<meta name="description"[^>]*>/gi, '');

        res.status(200).set({
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
        }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.use('*', (req, res, next) => {
      const url = req.originalUrl;
      const cleanPath = url.split('?')[0].replace(/^\/+|\/+$/g, '');

      if (
        url.startsWith('/api') ||
        url.startsWith('/v/') ||
        url.startsWith('/m/') ||
        url.startsWith('/srv/') ||
        url.startsWith('/uploads/') ||
        url.startsWith('/s-seg') ||
        url.includes('/get.php') ||
        url.includes('/player_api.php') ||
        url.includes('/live/') ||
        url.includes('/movie/') ||
        url.includes('/series/')
      ) {
        return res.status(404).send('');
      }

      if (cleanPath && !cleanPath.includes('.') && cleanPath !== 'uploads' && cleanPath !== 'assets') {
        const isVirtualSlug = virtualXtreamStore.some(v =>
          v.customVirtualHost &&
          cleanCustomVirtualHost(v.customVirtualHost)?.toLowerCase() === cleanPath.toLowerCase()
        );

        if (isVirtualSlug) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title></title></head>
<body style="background-color: #ffffff; margin: 0; padding: 0; height: 100vh;"></body>
</html>`);
        }
      }

      try {
        let template = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf-8');
        template = template
          .replace(/<title>.*?<\/title>/gi, '')
          .replace(/<meta property="og:[^>]*>/gi, '')
          .replace(/<meta name="twitter:[^>]*>/gi, '')
          .replace(/<meta name="description"[^>]*>/gi, '');

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        res.send(template);
      } catch {
        res.status(404).send('');
      }
    });
  }

  const httpServer = createServer(app);
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.requestTimeout = 0;
  httpServer.timeout = 0;
  httpServer.on('connection', (socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 8e6,
    pingTimeout: 60000,
    pingInterval: 25000,
    perMessageDeflate: false
  });
  globalIo = io;

  io.on('connection', (socket) => {
    const deviceId = socket.handshake.query.deviceId as string;
    if (deviceId) {
      socket.join(deviceId);
      console.log(`Device connected to socket: ${deviceId}`);
    }

    socket.on('live-studio:start', (payload: { serverId?: string; container?: 'webm' | 'mp4'; hasAudio?: boolean; fallbackServer?: LiveServerItem }) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      let srv = liveServersStore.find(s => s.id === serverId);
      if (!srv && payload?.fallbackServer && payload.fallbackServer.id === serverId && payload.fallbackServer.token) {
        const sanitized = sanitizeLiveServerItem(payload.fallbackServer);
        if (sanitized) {
          srv = sanitized;
          liveServersStore.unshift(srv);
        }
      }
      if (!srv) return;

      startLiveServerStudioPipeline(srv, {
        container: payload?.container === 'mp4' ? 'mp4' : 'webm',
        hasAudio: payload?.hasAudio !== false,
        socketId: socket.id
      });
      socket.emit('live-studio:started', { serverId: srv.id, token: srv.token });
    });

    socket.on('live-studio:chunk', (payload: { serverId?: string; chunk?: ArrayBuffer | Buffer }) => {
      const serverId = payload?.serverId;
      if (!serverId || !payload?.chunk) return;
      const rt = liveServerRuntimes.get(serverId);
      if (!rt || !rt.studioProc || !rt.studioActive) {
        socket.emit('live-studio:need-restart', { serverId });
        return;
      }
      // Allow seamless socket rebind on reconnect
      if (rt.studioDisconnectTimer) {
        clearTimeout(rt.studioDisconnectTimer);
        rt.studioDisconnectTimer = null;
      }
      rt.studioSocketId = socket.id;
      rt.lastStudioChunkAt = Date.now();
      const stdin = rt.studioProc.stdin;
      if (!stdin || stdin.destroyed || !stdin.writable) return;
      try {
        const buf = Buffer.isBuffer(payload.chunk) ? payload.chunk : Buffer.from(payload.chunk);
        rt.studioBytesSent += buf.length;
        stdin.write(buf);
      } catch {}
    });

    socket.on('live-studio:stop', (payload: { serverId?: string }) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      const rt = liveServerRuntimes.get(serverId);
      if (!rt) return;
      stopLiveServerStudio(serverId);
      const srv = liveServersStore.find(s => s.id === serverId);
      if (srv) {
        if (srv.activeSourceId) {
          srv.activeMode = 'source';
          const fallbackSrc = srv.sources.find(x => x.id === srv.activeSourceId);
          if (fallbackSrc?.kind === 'video' && srv.status === 'live') {
            startVideoLoopPipeline(srv, fallbackSrc);
          }
        }
        srv.switchCount += 1;
        srv.lastSwitchedAt = new Date().toISOString();
        srv.updatedAt = srv.lastSwitchedAt;
        saveLiveServersNow(liveServersStore);
        broadcastLiveServerUpdate(srv);
      }
      socket.emit('live-studio:stopped', { serverId });
    });

    socket.on('disconnect', () => {
      for (const [serverId, rt] of liveServerRuntimes.entries()) {
        if (rt.studioSocketId === socket.id && rt.studioActive) {
          if (rt.studioDisconnectTimer) clearTimeout(rt.studioDisconnectTimer);
          rt.studioDisconnectTimer = setTimeout(() => {
            const recentChunkArrived = rt.lastStudioChunkAt && (Date.now() - rt.lastStudioChunkAt < 20000);
            if (!recentChunkArrived && rt.studioSocketId === socket.id && rt.studioActive) {
              stopLiveServerStudio(serverId);
              const srv = liveServersStore.find(s => s.id === serverId);
              if (srv) {
                if (srv.activeSourceId) {
                  srv.activeMode = 'source';
                  const fallbackSrc = srv.sources.find(x => x.id === srv.activeSourceId);
                  if (fallbackSrc?.kind === 'video' && srv.status === 'live') {
                    startVideoLoopPipeline(srv, fallbackSrc);
                  }
                }
                srv.switchCount += 1;
                srv.lastSwitchedAt = new Date().toISOString();
                srv.updatedAt = srv.lastSwitchedAt;
                saveLiveServersNow(liveServersStore);
                broadcastLiveServerUpdate(srv);
              }
            }
          }, 25000);
        }
      }
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupServer();

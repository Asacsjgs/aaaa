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

export interface ClientTelemetryInfo {
  screenResolution?: string;
  viewportSize?: string;
  language?: string;
  languages?: string[];
  clientTimezone?: string;
  cpuCores?: number;
  deviceMemoryGb?: number;
  maxTouchPoints?: number;
  platform?: string;
  gpuRenderer?: string;
  networkType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  isVisible?: boolean;
  playbackEngine?: string;
}

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
  clientTelemetry?: ClientTelemetryInfo;
  isBlocked: boolean;
}

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

export interface IntelligenceConnection extends ConnectedApp {
  sourceTitle: string;
  sourceType: 'stream' | 'virtual_xtream';
  sourceId: string;
  isOnline?: boolean;
  isGlobalIpBlocked?: boolean;
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
  studioActive?: boolean;
  studioStartedAt?: number;
  studioBytesSent?: number;
  loopActive?: boolean;
}

export type CategoryFilter = 'all' | 'sports' | 'news' | 'entertainment' | 'gaming' | 'general';
export type StatusFilter = 'all' | 'active' | 'paused';




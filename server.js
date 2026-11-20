// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { execFileSync, spawn } from "child_process";
import crypto from "crypto";
import { Readable } from "stream";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import dns from "dns/promises";
import net from "net";
import tls from "tls";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3e3;
app.disable("x-powered-by");
app.set("etag", false);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression({
  level: 6,
  threshold: 512,
  filter: (req, res) => {
    const p = req.path.toLowerCase();
    if (p.startsWith("/s-seg") || p.startsWith("/srv/") || p.startsWith("/api/proxy-segment") || p.startsWith("/uploads/") || p.endsWith(".ts") || p.endsWith(".m4s") || p.endsWith(".mp4") || p.endsWith(".mov")) {
      return false;
    }
    const ct = String(res.getHeader("Content-Type") || "").toLowerCase();
    if (ct.startsWith("video/") || ct.includes("mp2t") || ct.includes("octet-stream")) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
app.use((req, res, next) => {
  const ua = (req.get("user-agent") || "").toLowerCase();
  const accept = (req.get("accept") || "").toLowerCase();
  const reqPath = req.path.toLowerCase();
  const isStreamOrPhpRoute = reqPath.includes("get.php") || reqPath.includes("player_api.php") || reqPath.includes("xmltv.php") || reqPath.startsWith("/live/") || reqPath.startsWith("/movie/") || reqPath.startsWith("/series/") || reqPath.startsWith("/v/") || reqPath.startsWith("/m/") || reqPath.startsWith("/srv/") || reqPath.startsWith("/s-seg") || reqPath.includes("manifest.m3u8") || reqPath.includes("/proxy-segment");
  const isSocialPreviewBot = ua.includes("telegram") || ua.includes("facebook") || ua.includes("facebot") || ua.includes("twitter") || ua.includes("whatsapp") || ua.includes("discord") || ua.includes("slack") || ua.includes("skype") || ua.includes("applebot") || ua.includes("vkshare") || ua.includes("metauri") || ua.includes("embedly") || ua.includes("bingbot") || ua.includes("googlebot") || ua.includes("crawler") || ua.includes("spider") || ua.includes("preview") || ua.includes("bot") || req.get("purpose") === "prefetch" || req.get("sec-purpose") === "prefetch" || req.get("x-purpose") === "preview";
  if (isStreamOrPhpRoute) {
    if (isSocialPreviewBot) {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.status(404).send("");
    }
    return next();
  }
  if (isSocialPreviewBot) {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(404).send("");
  }
  const isBackgroundPreviewOnRoot = (reqPath === "/" || reqPath === "") && accept.includes("text/html") && !req.get("sec-fetch-user") && !req.get("sec-ch-ua") && req.method === "GET";
  if (isBackgroundPreviewOnRoot) {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(404).send("");
  }
  next();
});
var UPLOADS_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Accept-Ranges", "bytes");
  next();
}, express.static(UPLOADS_DIR, {
  setHeaders: (res, path2) => {
    if (path2.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
    if (path2.endsWith(".mov")) res.setHeader("Content-Type", "video/quicktime");
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));
function extractDeviceModel(ua) {
  if (!ua) return "";
  const samsungMatch = ua.match(/(SM-[A-Z0-9]+|Galaxy\s+[A-Za-z0-9\s+]+)/i);
  if (samsungMatch) return `Samsung ${samsungMatch[1].trim()}`;
  const xiaomiMatch = ua.match(/(Redmi\s+[A-Za-z0-9\s]+|POCO\s+[A-Za-z0-9\s]+|Mi\s+[A-Za-z0-9\s]+|22[0-9]{7}[A-Z]|23[0-9]{7}[A-Z]|21[0-9]{7}[A-Z])/i);
  if (xiaomiMatch) return `Xiaomi ${xiaomiMatch[1].trim()}`;
  const oppoRealmeMatch = ua.match(/(Realme\s+[A-Za-z0-9\s]+|RMX[0-9]+|CPH[0-9]+|OPPO\s+[A-Za-z0-9\s]+|Vivo\s+[A-Za-z0-9\s]+|V2[0-9]{3}|OnePlus\s+[A-Za-z0-9\s]+|DN2103|NE2213)/i);
  if (oppoRealmeMatch) return oppoRealmeMatch[1].trim();
  const huaweiMatch = ua.match(/(HUAWEI\s+[A-Za-z0-9\s-]+|HONOR\s+[A-Za-z0-9\s-]+|VOG-L29|ELE-L29|ANA-NX9|NOP-AN00)/i);
  if (huaweiMatch) return huaweiMatch[1].trim();
  const pixelMatch = ua.match(/(Pixel\s+[0-9a-zA-Z\s]+)/i);
  if (pixelMatch) return `Google ${pixelMatch[1].trim()}`;
  const androidMatch = ua.match(/\((?:Linux|Android)[^;)]*;\s*(?:U;)?\s*Android[^;)]*;\s*([^;)]+)/i) || ua.match(/Android\s+[0-9.]+;\s*([^;)]+)/i) || ua.match(/Build\/([^;\)\s]+)/i);
  if (androidMatch && androidMatch[1]) {
    let model = androidMatch[1].trim().replace(/Build\/.*/i, "").replace(/[\/].*/, "").trim();
    if (model && !model.toLowerCase().includes("khtml") && !model.toLowerCase().includes("wv") && !model.toLowerCase().includes("mobile") && model.length > 2) {
      return model;
    }
  }
  if (ua.includes("iPhone")) {
    const m = ua.match(/iPhone OS\s+([0-9_]+)/i);
    return m ? `iPhone (iOS ${m[1].replace(/_/g, ".")})` : "\u0647\u0627\u062A\u0641 iPhone";
  }
  if (ua.includes("iPad")) return "\u062C\u0647\u0627\u0632 iPad";
  if (ua.includes("Macintosh")) return "\u062C\u0647\u0627\u0632 Mac";
  if (ua.includes("Windows")) return "\u0643\u0645\u0628\u064A\u0648\u062A\u0631 Windows";
  return "";
}
function detectAppName(ua, referer) {
  if (!ua && !referer) return "\u0645\u0634\u063A\u0644 \u0645\u062C\u0647\u0648\u0644 (\u0628\u062F\u0648\u0646 \u0628\u064A\u0627\u0646\u0627\u062A User-Agent)";
  const lowerUA = (ua || "").toLowerCase();
  const lowerRef = (referer || "").toLowerCase();
  const deviceModel = extractDeviceModel(ua);
  let appName = "";
  if (lowerUA.includes("exoplayer")) appName = "\u062A\u0637\u0628\u064A\u0642 ExoPlayer (\u0623\u0646\u062F\u0631\u0648\u064A\u062F / IPTV)";
  else if (lowerUA.includes("iptv smarters") || lowerUA.includes("smarters")) appName = "\u062A\u0637\u0628\u064A\u0642 IPTV Smarters Pro";
  else if (lowerUA.includes("tivimate")) appName = "\u062A\u0637\u0628\u064A\u0642 TiviMate IPTV";
  else if (lowerUA.includes("xciptv")) appName = "\u062A\u0637\u0628\u064A\u0642 XCIPTV Player";
  else if (lowerUA.includes("ott navigator")) appName = "\u062A\u0637\u0628\u064A\u0642 OTT Navigator";
  else if (lowerUA.includes("televizo")) appName = "\u062A\u0637\u0628\u064A\u0642 Televizo IPTV";
  else if (lowerUA.includes("gse")) appName = "\u062A\u0637\u0628\u064A\u0642 GSE Smart IPTV";
  else if (lowerUA.includes("ssiptv") || lowerUA.includes("ss-iptv")) appName = "\u062A\u0637\u0628\u064A\u0642 SS IPTV";
  else if (lowerUA.includes("smartiptv") || lowerUA.includes("siptv")) appName = "\u062A\u0637\u0628\u064A\u0642 Smart IPTV";
  else if (lowerUA.includes("kodi")) appName = "\u0645\u0634\u063A\u0644 Kodi Media Center";
  else if (lowerUA.includes("vlc")) appName = "\u0645\u0634\u063A\u0644 VLC Media Player";
  else if (lowerUA.includes("lavf") || lowerUA.includes("ffmpeg")) appName = "\u0645\u062D\u0631\u0643 FFmpeg / Lavf Player";
  else if (lowerUA.includes("mpv")) appName = "\u0645\u0634\u063A\u0644 MPV Player";
  else if (lowerUA.includes("applecoremedia") || lowerUA.includes("cfnetwork")) appName = "\u0645\u0634\u063A\u0644 iOS / Apple Native Player";
  else if (lowerUA.includes("okhttp")) appName = "\u062A\u0637\u0628\u064A\u0642 \u0623\u0646\u062F\u0631\u0648\u064A\u062F (OkHttp Client)";
  else if (lowerUA.includes("dalvik")) appName = "\u062A\u0637\u0628\u064A\u0642 \u0623\u0646\u062F\u0631\u0648\u064A\u062F \u0645\u062E\u0635\u0635 (Dalvik VM)";
  else if (lowerUA.includes("python") || lowerUA.includes("requests") || lowerUA.includes("curl") || lowerUA.includes("wget") || lowerUA.includes("scrapy") || lowerUA.includes("go-http-client")) appName = "\u0623\u062F\u0627\u0629 \u0633\u062D\u0628 \u062A\u0644\u0642\u0627\u0626\u064A\u0629 (Bot / Script)";
  else if (lowerUA.includes("edg/") || lowerUA.includes("edge")) appName = "\u0645\u062A\u0635\u0641\u062D Microsoft Edge";
  else if (lowerUA.includes("chrome")) appName = "\u0645\u062A\u0635\u0641\u062D Google Chrome";
  else if (lowerUA.includes("safari") && !lowerUA.includes("chrome")) appName = "\u0645\u062A\u0635\u0641\u062D Apple Safari";
  else if (lowerUA.includes("firefox")) appName = "\u0645\u062A\u0635\u0641\u062D Mozilla Firefox";
  else if (lowerUA.includes("x-stream") || lowerUA.includes("xtream-master")) appName = "\u062A\u0637\u0628\u064A\u0642 X-Stream Masters";
  else if (lowerUA.includes("dream player")) appName = "\u062A\u0637\u0628\u064A\u0642 Dream Player";
  else if (lowerUA.includes("iptv pro")) appName = "\u062A\u0637\u0628\u064A\u0642 IPTV Pro";
  if (!appName) {
    const pkgMatch = ua.match(/([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)/);
    if (pkgMatch) {
      appName = `\u062A\u0637\u0628\u064A\u0642 \u0623\u0646\u062F\u0631\u0648\u064A\u062F (${pkgMatch[1]})`;
    } else if (referer) {
      try {
        const u = new URL(referer);
        appName = `\u0645\u0648\u0642\u0639/\u062A\u0637\u0628\u064A\u0642: ${u.hostname}`;
      } catch {
      }
    } else {
      appName = `\u062A\u0637\u0628\u064A\u0642 \u062E\u0627\u0631\u062C\u064A (${ua.substring(0, 30)})`;
    }
  }
  if (deviceModel && !appName.includes(deviceModel)) {
    return `${appName} \u2022 \u0647\u0627\u062A\u0641: ${deviceModel}`;
  }
  return appName;
}
function detectOsName(ua) {
  if (!ua) return "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641";
  const lower = ua.toLowerCase();
  if (lower.includes("tizen")) return "Samsung Tizen TV";
  if (lower.includes("web0s") || lower.includes("webos")) return "LG webOS TV";
  if (lower.includes("aft") || lower.includes("firetv") || lower.includes("fire os")) return "Amazon Fire OS";
  if (lower.includes("roku")) return "Roku OS";
  if (lower.includes("appletv") || lower.includes("tvos")) return "Apple tvOS";
  const androidVer = ua.match(/Android\s+([0-9.]+)/i);
  if (androidVer) return `Android ${androidVer[1]}`;
  if (lower.includes("android") || lower.includes("dalvik") || lower.includes("exoplayer") || lower.includes("okhttp")) {
    return "Android OS";
  }
  const iosVer = ua.match(/(?:iPhone|CPU)\s+OS\s+([0-9_]+)/i);
  if (iosVer) return `iOS ${iosVer[1].replace(/_/g, ".")}`;
  if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("applecoremedia") || lower.includes("cfnetwork")) {
    return "Apple iOS / iPadOS";
  }
  if (lower.includes("windows nt 10.0")) return "Windows 10/11";
  if (lower.includes("windows")) return "Windows";
  if (lower.includes("macintosh") || lower.includes("mac os x")) return "macOS";
  if (lower.includes("linux")) return "Linux";
  return "\u0646\u0638\u0627\u0645 \u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
}
function classifyClientType(ua, referer) {
  const lower = (ua || "").toLowerCase();
  if (!lower && !referer) return "unknown";
  const botKeywords = [
    "python",
    "curl",
    "wget",
    "requests",
    "scrapy",
    "go-http-client",
    "axios",
    "node-fetch",
    "undici",
    "postman",
    "insomnia",
    "sqlmap",
    "nmap",
    "nikto",
    "headless",
    "puppeteer",
    "playwright",
    "phantomjs",
    "bot",
    "spider",
    "crawler",
    "httrack"
  ];
  if (botKeywords.some((k) => lower.includes(k))) {
    return "bot_scraper";
  }
  const iptvKeywords = [
    "exoplayer",
    "smarters",
    "okhttp",
    "vlc",
    "tivimate",
    "xciptv",
    "ott navigator",
    "ssiptv",
    "ss-iptv",
    "smartiptv",
    "siptv",
    "dalvik",
    "kodi",
    "lavf",
    "ffmpeg",
    "mpv",
    "mplayer",
    "televizo",
    "gse",
    "x-stream",
    "xtream",
    "dream player",
    "iptv pro",
    "applecoremedia",
    "cfnetwork",
    "stagefright",
    "libvlc"
  ];
  if (iptvKeywords.some((k) => lower.includes(k))) {
    return "iptv_app";
  }
  if (lower.includes("mozilla") || lower.includes("chrome") || lower.includes("safari") || lower.includes("firefox") || lower.includes("edg/")) {
    return "browser";
  }
  return "unknown";
}
function isInternalOrPrivateIp(ip) {
  const cleanIp = (ip || "").replace("::ffff:", "").trim().toLowerCase();
  if (!cleanIp || cleanIp === "::1" || cleanIp === "localhost" || cleanIp === "0.0.0.0") return true;
  if (cleanIp.startsWith("127.") || cleanIp.startsWith("10.") || cleanIp.startsWith("192.168.") || cleanIp.startsWith("169.254.")) {
    return true;
  }
  if (cleanIp.startsWith("172.")) {
    const secondOctet = parseInt(cleanIp.split(".")[1] || "", 10);
    if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) return true;
  }
  if (cleanIp.startsWith("fc00:") || cleanIp.startsWith("fd00:") || cleanIp.startsWith("fe80:")) return true;
  return false;
}
function isRealExternalViewer(ip, ua) {
  if (isInternalOrPrivateIp(ip)) return false;
  const lowerUa = (ua || "").toLowerCase();
  if (lowerUa.startsWith("curl/") || lowerUa.startsWith("wget/") || lowerUa.includes("bot") || lowerUa.includes("crawler") || lowerUa.includes("spider") || lowerUa.includes("preview") || lowerUa.includes("headless") || lowerUa.includes("python-requests") || lowerUa.includes("go-http-client")) {
    return false;
  }
  return true;
}
function getClientIp(req) {
  const headerCandidates = [
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-client-ip"],
    req.headers["x-forwarded-for"]
  ];
  for (const raw of headerCandidates) {
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw.join(",").split(",") : String(raw).split(",");
    for (const item of list) {
      const candidate = item.replace("::ffff:", "").trim();
      if (candidate && !isInternalOrPrivateIp(candidate)) {
        return candidate;
      }
    }
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].replace("::ffff:", "").trim();
  }
  return (req.socket.remoteAddress || req.ip || "").replace("::ffff:", "").trim();
}
var BLOCKED_IPS_FILE = path.join(__dirname, "blocked_ips.json");
var SECURITY_LOGS_FILE = path.join(__dirname, "security_logs.json");
function loadBlockedIps() {
  try {
    if (fs.existsSync(BLOCKED_IPS_FILE)) {
      return JSON.parse(fs.readFileSync(BLOCKED_IPS_FILE, "utf-8"));
    }
  } catch {
  }
  return [];
}
function saveBlockedIps(list) {
  try {
    fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
  }
}
function loadSecurityLogs() {
  try {
    if (fs.existsSync(SECURITY_LOGS_FILE)) {
      return JSON.parse(fs.readFileSync(SECURITY_LOGS_FILE, "utf-8"));
    }
  } catch {
  }
  return [];
}
function saveSecurityLogs(logs) {
  try {
    fs.writeFileSync(SECURITY_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch {
  }
}
var blockedIpsStore = loadBlockedIps();
var securityLogsStore = loadSecurityLogs();
function addSecurityLog(ip, type, details) {
  const log = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ip,
    type,
    details,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  securityLogsStore.unshift(log);
  if (securityLogsStore.length > 100) securityLogsStore = securityLogsStore.slice(0, 100);
  saveSecurityLogs(securityLogsStore);
}
function blockIpAddress(ip, reason, durationMinutes) {
  if (!ip) return;
  const expiresAt = durationMinutes ? Date.now() + durationMinutes * 60 * 1e3 : void 0;
  const existing = blockedIpsStore.find((b) => b.ip === ip);
  if (existing) {
    existing.reason = reason;
    existing.blockedAt = (/* @__PURE__ */ new Date()).toISOString();
    existing.attempts = (existing.attempts || 1) + 1;
    existing.expiresAt = expiresAt;
  } else {
    blockedIpsStore.unshift({
      ip,
      reason,
      blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 1,
      expiresAt
    });
  }
  saveBlockedIps(blockedIpsStore);
}
var SECURITY_POLICY_FILE = path.join(__dirname, "security_policy.json");
var DEFAULT_SECURITY_POLICY = {
  autoBlockVpnProxy: false,
  autoBlockDatacenter: false,
  autoBlockBots: false,
  ddosMaxReqPer10s: 70,
  ddosBanMinutes: 30,
  bruteForceMaxAttempts: 5,
  bruteForceBanMinutes: 60
};
function loadSecurityPolicy() {
  try {
    if (fs.existsSync(SECURITY_POLICY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SECURITY_POLICY_FILE, "utf-8"));
      return { ...DEFAULT_SECURITY_POLICY, ...parsed };
    }
  } catch {
  }
  return { ...DEFAULT_SECURITY_POLICY };
}
function saveSecurityPolicy(policy) {
  try {
    fs.writeFileSync(SECURITY_POLICY_FILE, JSON.stringify(policy, null, 2), "utf-8");
  } catch {
  }
}
var securityPolicyStore = loadSecurityPolicy();
var trafficTimelineMap = /* @__PURE__ */ new Map();
function recordTrafficEvent(kind) {
  const now = /* @__PURE__ */ new Date();
  const minuteKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const label = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let bucket = trafficTimelineMap.get(minuteKey);
  if (!bucket) {
    bucket = { minuteKey, label, requests: 0, blocked: 0, threats: 0 };
    trafficTimelineMap.set(minuteKey, bucket);
    if (trafficTimelineMap.size > 40) {
      const oldestKey = trafficTimelineMap.keys().next().value;
      if (oldestKey) trafficTimelineMap.delete(oldestKey);
    }
  }
  if (kind === "request") bucket.requests += 1;
  if (kind === "blocked") bucket.blocked += 1;
  if (kind === "threat") {
    bucket.threats += 1;
    bucket.blocked += 1;
  }
}
function getRecentTrafficTimeline(minutesCount = 15) {
  const result = [];
  const now = Date.now();
  for (let i = minutesCount - 1; i >= 0; i--) {
    const d = new Date(now - i * 6e4);
    const minuteKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const existing = trafficTimelineMap.get(minuteKey);
    result.push(existing || { minuteKey, label, requests: 0, blocked: 0, threats: 0 });
  }
  return result;
}
var failedLoginTracker = /* @__PURE__ */ new Map();
var requestRateTracker = /* @__PURE__ */ new Map();
function recordFailedLogin(ip) {
  if (!ip) return;
  const now = Date.now();
  const maxAttempts = Math.max(2, Math.min(30, securityPolicyStore.bruteForceMaxAttempts || 5));
  const banMins = Math.max(5, Math.min(10080, securityPolicyStore.bruteForceBanMinutes || 60));
  const item = failedLoginTracker.get(ip);
  if (!item || now - item.firstAttempt > 3e5) {
    failedLoginTracker.set(ip, { count: 1, firstAttempt: now });
  } else {
    item.count += 1;
    if (item.count >= maxAttempts) {
      blockIpAddress(ip, "\u0645\u062D\u0627\u0648\u0644\u0629 \u062A\u062E\u0645\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631 \u0628\u0643\u062B\u0631\u0629 (Anti-Brute Force Lockout)", banMins);
      addSecurityLog(ip, "BRUTE_FORCE", `\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: ${item.count} \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u062A\u062E\u0645\u064A\u0646 \u0643\u0644\u0645\u0629 \u0633\u0631 \u0641\u0627\u0634\u0644\u0629 \u0645\u062A\u062A\u0627\u0644\u064A\u0629`);
      recordTrafficEvent("threat");
      failedLoginTracker.delete(ip);
    }
  }
}
function recordSuccessfulLogin(ip) {
  if (ip) failedLoginTracker.delete(ip);
}
app.use((req, res, next) => {
  const ip = getClientIp(req);
  const ua = (req.get("user-agent") || "").toLowerCase();
  const url = (req.originalUrl || req.url || "").toLowerCase();
  const isDashboardPoll = url.startsWith("/api/intelligence-radar") || url === "/api/streams" || url === "/api/virtual-xtream" || url.startsWith("/api/security") || url === "/api/config" || url.startsWith("/@") || url.startsWith("/node_modules") || url.startsWith("/src/") || url.startsWith("/assets/");
  if (!isDashboardPoll) {
    recordTrafficEvent("request");
  }
  const now = Date.now();
  const blockedRec = blockedIpsStore.find((b) => b.ip === ip);
  if (blockedRec) {
    if (blockedRec.expiresAt && now > blockedRec.expiresAt) {
      blockedIpsStore = blockedIpsStore.filter((b) => b.ip !== ip);
      saveBlockedIps(blockedIpsStore);
    } else {
      if (!isDashboardPoll) recordTrafficEvent("blocked");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(403).send(`403 Forbidden - IP ${ip} Blocked By Xtream Firewall Shield (${blockedRec.reason})`);
    }
  }
  const hackerTools = ["sqlmap", "nmap", "nikto", "zgrab", "masscan", "gobuster", "dirbuster", "w3af", "hydra", "medusa", "burp", "acunetix", "nessus", "metasploit"];
  if (hackerTools.some((tool) => ua.includes(tool))) {
    blockIpAddress(ip, "\u0623\u062F\u0627\u0629 \u0641\u062D\u0635 \u0648\u062A\u062E\u0645\u064A\u0646 \u062B\u063A\u0631\u0627\u062A \u0627\u0645\u0646\u064A\u0629 (Security Scanner / Sniffer)", 1440);
    addSecurityLog(ip, "SECURITY_SCANNER", `\u062D\u0638\u0631 \u0623\u062F\u0627\u0629 \u0641\u062D\u0635 \u062B\u063A\u0631\u0627\u062A \u0647\u062C\u0648\u0645\u064A\u0629: ${ua.substring(0, 50)}`);
    recordTrafficEvent("threat");
    return res.status(403).send("403 Forbidden - Security Scanner Blocked");
  }
  if (url.includes("union%20select") || url.includes("select%20") || url.includes("information_schema") || url.includes("<script") || url.includes("/etc/passwd")) {
    blockIpAddress(ip, "\u0645\u062D\u0627\u0648\u0644\u0629 \u062D\u0642\u0646 \u062B\u063A\u0631\u0629 \u0623\u0648 \u0623\u0648\u0627\u0645\u0631 \u062E\u0628\u064A\u062B\u0629 (Injection Attack)", 1440);
    addSecurityLog(ip, "INJECTION_ATTACK", `\u0645\u062D\u0627\u0648\u0644\u0629 \u062D\u0642\u0646 \u062E\u0628\u064A\u062B\u0629 \u0641\u064A \u0627\u0644\u0631\u0627\u0628\u0637: ${url.substring(0, 60)}`);
    recordTrafficEvent("threat");
    return res.status(403).send("403 Forbidden - Injection Attempt Blocked");
  }
  const isStreamOrPhp = url.includes("player_api.php") || url.includes("get.php") || url.includes("/live/") || url.includes("/stream/") || url.includes("/api/stream/");
  if (securityPolicyStore.autoBlockBots && isStreamOrPhp) {
    if (classifyClientType(req.get("user-agent") || "", req.get("referer")) === "bot_scraper") {
      blockIpAddress(ip, "\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: \u0628\u0648\u062A \u0633\u062D\u0628/\u0643\u0634\u0637 \u0645\u062D\u062A\u0648\u0649 (Auto-Defense Bot Shield)", 180);
      addSecurityLog(ip, "SECURITY_SCANNER", `\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062F\u0631\u0639 \u0627\u0644\u0622\u0644\u064A \u0636\u062F Bot/Scraper: ${ua.substring(0, 60)}`);
      recordTrafficEvent("threat");
      return res.status(403).send("403 Forbidden - Automated Scraper Blocked");
    }
  }
  if (isStreamOrPhp && ip) {
    const maxReq = Math.max(15, Math.min(500, securityPolicyStore.ddosMaxReqPer10s || 70));
    const banMins = Math.max(5, Math.min(10080, securityPolicyStore.ddosBanMinutes || 30));
    const rateItem = requestRateTracker.get(ip);
    if (!rateItem || now - rateItem.windowStart > 1e4) {
      requestRateTracker.set(ip, { count: 1, windowStart: now });
    } else {
      rateItem.count += 1;
      if (rateItem.count > maxReq) {
        blockIpAddress(ip, "\u0647\u062C\u0648\u0645 \u0625\u063A\u0631\u0627\u0642 \u0648\u0633\u062D\u0628 \u0645\u062A\u0643\u0631\u0631 (DDoS / Rate Limit Exceeded)", banMins);
        addSecurityLog(ip, "DDoS_FLOOD", `\u062A\u062C\u0627\u0648\u0632 \u0645\u0639\u062F\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D (${maxReq}/10s): ${rateItem.count} \u0637\u0644\u0628`);
        recordTrafficEvent("threat");
        return res.status(429).send("429 Too Many Requests - IP Flooding Rate Limit");
      }
    }
  }
  next();
});
function checkIsBlocked(clientUA, clientReferer, clientIP, blockedList, blockAllExternalApps) {
  const lowerUA = (clientUA || "").toLowerCase();
  const lowerRef = (clientReferer || "").toLowerCase();
  const ip = (clientIP || "").trim();
  if (blockAllExternalApps) {
    const isStandardBrowser = (lowerUA.includes("mozilla") || lowerUA.includes("chrome") || lowerUA.includes("safari") || lowerUA.includes("firefox")) && !lowerUA.includes("exoplayer") && !lowerUA.includes("okhttp") && !lowerUA.includes("dalvik") && !lowerUA.includes("vlc") && !lowerUA.includes("tivimate") && !lowerUA.includes("smarters") && !lowerUA.includes("xciptv") && !lowerUA.includes("ott navigator");
    if (!isStandardBrowser || !clientUA) {
      return true;
    }
  }
  if (!blockedList || blockedList.length === 0) return false;
  return blockedList.some((pattern) => {
    if (!pattern) return false;
    const rawP = pattern.trim();
    if (!rawP) return false;
    const lowerP = rawP.toLowerCase();
    if (ip && (ip === rawP || ip === lowerP)) {
      return true;
    }
    const cleanPattern = lowerP.replace(/[\u0600-\u06FF]/g, "").replace(/[•()]/g, "").trim();
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
function getActiveConnectionsCount(vAcc) {
  if (!vAcc.connectedApps) return 0;
  const now = Date.now();
  return vAcc.connectedApps.filter((app2) => {
    if (app2.isBlocked) return false;
    const lastActiveMs = new Date(app2.lastActive).getTime();
    return now - lastActiveMs < 15e3;
  }).length;
}
function checkExceedsMaxConnections(vAcc, clientUA, clientIP) {
  return false;
}
var STORAGE_FILE = path.join(__dirname, "streams_data.json");
var VIRTUAL_XTREAM_FILE = path.join(__dirname, "virtual_xtream_data.json");
var PLAYLISTS_FILE = path.join(__dirname, "playlists_data.json");
function generateOpaqueToken(existingTokens) {
  for (let i = 0; i < 10; i++) {
    const token = crypto.randomBytes(5).toString("base64url").replace(/[_-]/g, "x").toLowerCase();
    if (!existingTokens || !existingTokens.has(token)) {
      return token;
    }
  }
  return crypto.randomBytes(6).toString("hex");
}
function loadPlaylists() {
  try {
    if (fs.existsSync(PLAYLISTS_FILE)) {
      return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, "utf-8"));
    }
  } catch {
  }
  return [];
}
function savePlaylists(list) {
  try {
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
  }
}
var playlistsStore = loadPlaylists();
var INITIAL_STREAMS = [
  {
    id: "stream_bein_1",
    title: "\u26BD beIN SPORTS 1 HD - \u0628\u062B \u0645\u0628\u0627\u0634\u0631 4K",
    category: "sports",
    originalUrl: "https://live-hls-web-aje.akamaized.net/m3u8/out/v1/63102d5b7a8543d889b56d365f5e55e8/index.m3u8",
    slug: "bein_sports_1",
    streamType: "hls",
    status: "active",
    watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 - beIN Sports",
    quality: "4K",
    viewsCount: 1420,
    currentViewers: 42,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    customPosterUrl: "/uploads/preset_poster_1.jpg",
    pauseNoticeMessage: "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B",
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: "stream_aljazeera",
    title: "\u{1F4FA} \u0642\u0646\u0627\u0629 \u0627\u0644\u062C\u0632\u064A\u0631\u0629 \u0627\u0644\u0625\u062E\u0628\u0627\u0631\u064A\u0629 HD",
    category: "news",
    originalUrl: "https://live-hls-web-aje.akamaized.net/m3u8/out/v1/63102d5b7a8543d889b56d365f5e55e8/index.m3u8",
    slug: "aljazeera_live",
    streamType: "hls",
    status: "active",
    watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 - Al Jazeera",
    quality: "1080p",
    viewsCount: 2850,
    currentViewers: 89,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    customPosterUrl: "/uploads/preset_poster_2.jpg",
    pauseNoticeMessage: "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B",
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: "stream_france24",
    title: "\u{1F3AC} \u0641\u0631\u0627\u0646\u0633 24 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 F24 HD",
    category: "news",
    originalUrl: "https://static.france24.com/live/F24_AR_HI_HLS/live_tv.m3u8",
    slug: "france24_live",
    streamType: "hls",
    status: "active",
    watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 - France 24",
    quality: "1080p",
    viewsCount: 940,
    currentViewers: 23,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    customPosterUrl: "/uploads/preset_poster_1.jpg",
    pauseNoticeMessage: "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B",
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: "stream_dw",
    title: "\u{1F30D} \u0642\u0646\u0627\u0629 DW \u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0641\u0636\u0627\u0626\u064A\u0629",
    category: "general",
    originalUrl: "https://dwstream4-lh.akamaihd.net/i/dwstream4_live@131329/master.m3u8",
    slug: "dw_arabic",
    streamType: "hls",
    status: "active",
    watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 - DW Arabia",
    quality: "1080p",
    viewsCount: 620,
    currentViewers: 15,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    customPosterUrl: "/uploads/preset_poster_2.jpg",
    pauseNoticeMessage: "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B",
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  },
  {
    id: "stream_redbull",
    title: "\u{1F37F} \u0631\u064A\u062F \u0628\u0648\u0644 \u062A\u064A\u0641\u064A Live HD",
    category: "entertainment",
    originalUrl: "https://rbmn-live.akamaized.net/hls/live/591070/GEO_ROW_1/master.m3u8",
    slug: "redbull_tv",
    streamType: "hls",
    status: "active",
    watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 - Red Bull TV",
    quality: "1080p",
    viewsCount: 1780,
    currentViewers: 54,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    customPosterUrl: "/uploads/preset_poster_1.jpg",
    pauseNoticeMessage: "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B",
    connectedApps: [],
    blockedApps: [],
    isXtream: false
  }
];
function ensureStreamTokens(list) {
  let changed = false;
  const used = new Set(list.map((s) => s.streamToken).filter(Boolean));
  const updated = list.map((s) => {
    const next = { ...s };
    if (!next.streamToken) {
      const token = generateOpaqueToken(used);
      used.add(token);
      next.streamToken = token;
      changed = true;
    }
    if ("shortUrl" in next) {
      delete next.shortUrl;
      changed = true;
    }
    if (Array.isArray(next.connectedApps)) {
      const filteredApps = next.connectedApps.filter(
        (a) => isRealExternalViewer(a.ipAddress || "", a.userAgent)
      );
      if (filteredApps.length !== next.connectedApps.length) {
        next.connectedApps = filteredApps;
        changed = true;
      }
    }
    return next;
  });
  return { list: updated, changed };
}
function loadStreams() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const { list, changed } = ensureStreamTokens(parsed);
        if (changed) saveStreams(list);
        return list;
      }
    }
  } catch (err) {
    console.error("Error reading storage file:", err);
  }
  return ensureStreamTokens(INITIAL_STREAMS).list;
}
var streamsSaveTimer = null;
var latestStreamsPending = null;
function flushStreamsSync() {
  if (streamsSaveTimer) {
    clearTimeout(streamsSaveTimer);
    streamsSaveTimer = null;
  }
  if (!latestStreamsPending) return;
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(latestStreamsPending, null, 2), "utf-8");
    latestStreamsPending = null;
  } catch (err) {
    console.error("Error saving storage file:", err);
  }
}
function saveStreams(streams) {
  latestStreamsPending = streams;
  if (streamsSaveTimer) return;
  streamsSaveTimer = setTimeout(() => {
    streamsSaveTimer = null;
    const snapshot = latestStreamsPending;
    latestStreamsPending = null;
    if (!snapshot) return;
    fs.promises.writeFile(STORAGE_FILE, JSON.stringify(snapshot, null, 2), "utf-8").catch((err) => {
      console.error("Error saving storage file:", err);
    });
  }, 800);
}
function saveStreamsNow(streams) {
  latestStreamsPending = streams;
  flushStreamsSync();
}
process.once("SIGINT", () => {
  flushStreamsSync();
  process.exit(0);
});
process.once("SIGTERM", () => {
  flushStreamsSync();
  process.exit(0);
});
var streamsStore = loadStreams();
var LIVE_SERVERS_FILE = path.join(__dirname, "live_servers_data.json");
var LIVE_SERVER_HLS_DIR = path.join(os.tmpdir(), "live_server_hls");
if (!fs.existsSync(LIVE_SERVER_HLS_DIR)) {
  fs.mkdirSync(LIVE_SERVER_HLS_DIR, { recursive: true });
}
function isStaleTestLiveSource(src) {
  if (!src || !src.url) return true;
  const name = String(src.name || "").trim().toLowerCase();
  const url = String(src.url || "").trim().toLowerCase();
  if (name.startsWith("test_")) return true;
  if (url.includes("://localhost:") || url.includes("://127.0.0.1:")) return true;
  if (url.startsWith("/uploads/srv_vid_") || url.includes("/uploads/srv_vid_")) {
    const fileName = path.basename(url.split("?")[0]);
    if (!fs.existsSync(path.join(UPLOADS_DIR, fileName))) {
      return true;
    }
  }
  return false;
}
function sanitizeLiveServerItem(item) {
  if (!item || !item.id || !item.token || !item.title) return null;
  if (String(item.id) === "lsrv_1794928526200_iry2" || String(item.token) === "srv15ca2") {
    return null;
  }
  const rawSources = Array.isArray(item.sources) ? item.sources : [];
  const cleanSources = rawSources.filter((src) => !isStaleTestLiveSource(src));
  let activeSourceId = item.activeSourceId ? String(item.activeSourceId) : null;
  if (activeSourceId && !cleanSources.some((s) => s.id === activeSourceId)) {
    activeSourceId = cleanSources[0]?.id || null;
  }
  return {
    id: String(item.id),
    token: String(item.token),
    title: String(item.title),
    status: item.status === "paused" ? "paused" : "live",
    activeMode: "source",
    activeSourceId,
    sources: cleanSources,
    switchCount: Number(item.switchCount) || 1,
    createdAt: String(item.createdAt || (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: String(item.updatedAt || (/* @__PURE__ */ new Date()).toISOString()),
    lastSwitchedAt: String(item.lastSwitchedAt || (/* @__PURE__ */ new Date()).toISOString()),
    pauseNoticeMessage: String(item.pauseNoticeMessage || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B \u0645\u0646 \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u062D\u0643\u0645"),
    customPosterUrl: String(item.customPosterUrl || "/uploads/preset_poster_1.jpg"),
    viewsCount: Number(item.viewsCount) || 0,
    currentViewers: 0
  };
}
function loadLiveServers() {
  try {
    if (fs.existsSync(LIVE_SERVERS_FILE)) {
      const raw = fs.readFileSync(LIVE_SERVERS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map(sanitizeLiveServerItem).filter((x) => Boolean(x));
        if (cleaned.length !== parsed.length) {
          saveLiveServersNow(cleaned);
        }
        return cleaned;
      }
    }
  } catch (err) {
    console.error("Error loading live servers:", err);
  }
  return [];
}
var liveServersStore = loadLiveServers();
var liveServerRuntimes = /* @__PURE__ */ new Map();
function saveLiveServersNow(list = liveServersStore) {
  try {
    const tmpFile = `${LIVE_SERVERS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), "utf-8");
    fs.renameSync(tmpFile, LIVE_SERVERS_FILE);
  } catch (err) {
    console.error("Error saving live servers:", err);
  }
}
function getLiveServerRuntime(serverId) {
  let rt = liveServerRuntimes.get(serverId);
  if (!rt) {
    rt = {
      serverId,
      studioProc: null,
      studioDir: path.join(LIVE_SERVER_HLS_DIR, serverId, "studio"),
      studioActive: false,
      studioSocketId: null,
      studioStartedAt: 0,
      lastStudioChunkAt: 0,
      studioBytesSent: 0,
      loopProc: null,
      loopDir: path.join(LIVE_SERVER_HLS_DIR, serverId, "loop"),
      loopSourceUrl: "",
      loopActive: false,
      nextSeq: 100,
      keyToSeq: /* @__PURE__ */ new Map(),
      discontinuitySeqList: [],
      lastStreamTag: "",
      activeViewersMap: /* @__PURE__ */ new Map()
    };
    liveServerRuntimes.set(serverId, rt);
  }
  return rt;
}
function killChildSafely(proc) {
  if (!proc) return;
  try {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.end();
    }
  } catch {
  }
  try {
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill("SIGKILL");
      } catch {
      }
    }, 900);
  } catch {
  }
}
function stopLiveServerStudio(serverId) {
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
  } catch {
  }
}
function startLiveServerStudioPipeline(srv, options) {
  stopLiveServerLoop(srv.id);
  stopLiveServerStudio(srv.id);
  const rt = getLiveServerRuntime(srv.id);
  fs.mkdirSync(rt.studioDir, { recursive: true });
  const inputFormat = options.container === "mp4" ? "mp4" : "webm";
  const hasAudio = options.hasAudio !== false;
  const startNum = Math.floor(Date.now() / 1e3) % 1e6;
  const args = [
    "-y",
    "-loglevel",
    "warning",
    "-probesize",
    "500000",
    "-analyzeduration",
    "1500000",
    "-fflags",
    "+genpts+discardcorrupt",
    "-f",
    inputFormat,
    "-i",
    "pipe:0"
  ];
  if (!hasAudio) {
    args.push(
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest"
    );
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?");
  }
  args.push(
    "-threads",
    "2",
    "-vf",
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:flags=fast_bilinear,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-r",
    "25",
    "-vsync",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-g",
    "25",
    "-keyint_min",
    "25",
    "-sc_threshold",
    "0",
    "-b:v",
    "1400k",
    "-maxrate",
    "1800k",
    "-bufsize",
    "2000k",
    "-max_muxing_queue_size",
    "1024",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "6",
    "-start_number",
    String(startNum),
    "-hls_flags",
    "delete_segments+omit_endlist+temp_file",
    "-hls_segment_filename",
    path.join(rt.studioDir, "seg%d.ts"),
    path.join(rt.studioDir, "index.m3u8")
  );
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  rt.studioProc = proc;
  rt.studioActive = true;
  rt.studioSocketId = options.socketId || null;
  rt.studioStartedAt = Date.now();
  rt.lastStudioChunkAt = Date.now();
  rt.studioBytesSent = 0;
  rt.studioContainer = inputFormat;
  rt.studioHasAudio = hasAudio;
  proc.stdin?.on("error", () => {
  });
  proc.stderr?.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg && !msg.includes("deprecated pixel format")) {
      console.warn(`[StudioFFmpeg ${srv.token}]`, msg.slice(0, 260));
    }
  });
  proc.on("exit", (code) => {
    if (rt.studioProc === proc) {
      rt.studioProc = null;
      rt.studioActive = false;
      rt.studioSocketId = null;
      if (globalIo) {
        globalIo.emit("live-studio:ended", { serverId: srv.id, code });
      }
      broadcastLiveServerUpdate(srv);
    }
  });
  srv.activeMode = "studio";
  srv.status = "live";
  srv.switchCount += 1;
  srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
  srv.updatedAt = srv.lastSwitchedAt;
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  return rt;
}
function stopLiveServerLoop(serverId) {
  const rt = liveServerRuntimes.get(serverId);
  if (!rt) return;
  if (rt.loopProc) {
    killChildSafely(rt.loopProc);
    rt.loopProc = null;
  }
  rt.loopActive = false;
  rt.loopSourceUrl = "";
  try {
    if (fs.existsSync(rt.loopDir)) {
      fs.rmSync(rt.loopDir, { recursive: true, force: true });
    }
  } catch {
  }
}
function stopAllLiveServerProcesses() {
  for (const serverId of Array.from(liveServerRuntimes.keys())) {
    stopLiveServerStudio(serverId);
    stopLiveServerLoop(serverId);
  }
}
process.on("exit", stopAllLiveServerProcesses);
function serializeLiveServer(s) {
  const rt = liveServerRuntimes.get(s.id);
  const now = Date.now();
  let viewers = 0;
  if (rt) {
    for (const [k, ts] of rt.activeViewersMap.entries()) {
      if (now - ts <= 16e3) viewers++;
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
function broadcastLiveServerUpdate(s) {
  if (globalIo) {
    globalIo.emit("live-server:updated", serializeLiveServer(s));
  }
}
function detectSourceKind(url) {
  const lower = (url || "").trim().toLowerCase().split("?")[0];
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv") || lower.endsWith(".webm") || lower.startsWith("/uploads/")) {
    return "video";
  }
  return "hls";
}
function ensureStandbyLoadingTs() {
  const target = path.join(UPLOADS_DIR, "standby_loading.ts");
  try {
    if (fs.existsSync(target) && fs.statSync(target).size > 2048) {
      return target;
    }
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=#080c14:s=1280x720:r=25",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "25",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        "-f",
        "mpegts",
        target
      ],
      { stdio: "pipe", timeout: 1e4 }
    );
    if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  } catch (err) {
    console.warn("Standby loading TS generation fallback:", err);
  }
  const preset1Ts = path.join(UPLOADS_DIR, "preset_poster_1.ts");
  return fs.existsSync(preset1Ts) ? preset1Ts : null;
}
function localFileHasAudio(filePath) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", filePath],
      { encoding: "utf-8", timeout: 2500, stdio: ["ignore", "pipe", "ignore"] }
    );
    return String(out || "").trim().length > 0;
  } catch {
    return true;
  }
}
function startVideoLoopPipeline(server, source) {
  const rt = getLiveServerRuntime(server.id);
  if (rt.loopActive && rt.loopProc && rt.loopSourceUrl === source.url) {
    return true;
  }
  stopLiveServerLoop(server.id);
  fs.mkdirSync(rt.loopDir, { recursive: true });
  let inputPath = source.url.trim();
  let isLocalFile = false;
  if (inputPath.includes("/uploads/")) {
    const rawName = inputPath.split("/uploads/")[1]?.split("?")[0] || "";
    const safeName = path.basename(rawName);
    const localFile = path.join(UPLOADS_DIR, safeName);
    if (safeName && fs.existsSync(localFile)) {
      inputPath = localFile;
      isLocalFile = true;
    } else if (inputPath.startsWith("/uploads/")) {
      return false;
    }
  }
  const hasAudio = isLocalFile ? localFileHasAudio(inputPath) : true;
  const args = ["-y", "-loglevel", "warning", "-probesize", "131072", "-analyzeduration", "500000", "-fflags", "+genpts+discardcorrupt"];
  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    if (source.userAgent) args.push("-user_agent", source.userAgent);
    if (source.referer) args.push("-headers", `Referer: ${source.referer}\r
`);
    args.push("-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "3");
  }
  const startNum = Math.floor(Date.now() / 1e3) % 1e6;
  args.push("-threads", "2", "-re", "-stream_loop", "-1", "-i", inputPath);
  if (!hasAudio) {
    args.push(
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest"
    );
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?");
  }
  args.push(
    "-vf",
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:flags=fast_bilinear,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-r",
    "25",
    "-vsync",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-g",
    "25",
    "-keyint_min",
    "25",
    "-sc_threshold",
    "0",
    "-b:v",
    "1600k",
    "-maxrate",
    "2200k",
    "-bufsize",
    "2200k",
    "-max_muxing_queue_size",
    "1024",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "1",
    "-hls_list_size",
    "6",
    "-start_number",
    String(startNum),
    "-hls_flags",
    "delete_segments+omit_endlist+temp_file",
    "-hls_segment_filename",
    path.join(rt.loopDir, "seg%d.ts"),
    path.join(rt.loopDir, "index.m3u8")
  );
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  rt.loopProc = proc;
  rt.loopActive = true;
  rt.loopSourceUrl = source.url;
  proc.stderr?.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg && !msg.includes("deprecated pixel format")) {
      console.warn(`[LiveLoop ${server.token}]`, msg.slice(0, 200));
    }
  });
  proc.on("exit", () => {
    if (rt.loopProc === proc) {
      rt.loopProc = null;
      rt.loopActive = false;
    }
  });
  return true;
}
async function waitForLocalHlsPlaylist(dir, timeoutMs = 4500) {
  const manifestPath = path.join(dir, "index.m3u8");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(manifestPath)) {
        const text = fs.readFileSync(manifestPath, "utf-8");
        if (/\.ts/m.test(text) && /#EXTINF:/m.test(text)) {
          return text;
        }
      }
    } catch {
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
function buildMonotonicHlsPlaylist(rt, streamTag, segments, targetDuration = 4) {
  const tagStr = String(streamTag);
  const segSeqs = [];
  for (const seg of segments) {
    let seq = rt.keyToSeq.get(seg.key);
    if (seq === void 0) {
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
  const discSeq = rt.discontinuitySeqList.filter((d) => d < firstSeq).length;
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
    rt.discontinuitySeqList = rt.discontinuitySeqList.filter((d) => d >= firstSeq - 40);
  }
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${Math.max(2, Math.ceil(targetDuration))}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstSeq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`
  ];
  segments.forEach((seg, idx) => {
    if (discSet.has(segSeqs[idx])) {
      lines.push("#EXT-X-DISCONTINUITY");
    }
    if (seg.preTags && seg.preTags.length > 0) {
      seg.preTags.forEach((t) => lines.push(t));
    }
    lines.push(seg.extinf);
    lines.push(seg.uri);
  });
  return lines.join("\n") + "\n";
}
function parseBestVariantFromMaster(masterText, masterBaseUrl) {
  const lines = masterText.split("\n");
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const bw = bwMatch ? Number(bwMatch[1]) : 1e6;
      const codecsMatch = line.match(/CODECS="([^"]+)"/i);
      const codecs = codecsMatch ? codecsMatch[1].toLowerCase() : "";
      const hasResolution = /RESOLUTION=\d+x\d+/i.test(line);
      const isAudioOnly = !hasResolution && codecs.includes("mp4a") && !codecs.includes("avc") && !codecs.includes("hev") && !codecs.includes("hvc");
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next.startsWith("#")) {
          if (next.startsWith("#EXT-X-STREAM-INF:")) break;
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
  const videoCandidates = candidates.filter((c) => !c.isAudioOnly);
  const pool = videoCandidates.length > 0 ? videoCandidates : candidates;
  pool.sort((a, b) => b.bw - a.bw);
  return pool[0].url;
}
async function fetchLiveServerExternalSegments(server, rt, source, publicBaseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8e3);
  try {
    let rawUrl = source.url.trim();
    let effectiveUA = source.userAgent;
    let effectiveReferer = source.referer;
    const localSlugMatch = rawUrl.match(/\/(?:v|m)\/([a-zA-Z0-9_-]+)(?:\.m3u8)?(?:\?|$)/i);
    if (localSlugMatch && localSlugMatch[1]) {
      const localMatch = streamsStore.find(
        (s) => s.streamToken === localSlugMatch[1] || s.slug === localSlugMatch[1] || s.id === localSlugMatch[1]
      );
      if (localMatch) {
        if (localMatch.status === "paused") {
          clearTimeout(timeout);
          return { targetDuration: 3, segments: [], isPausedInternal: true };
        }
        rawUrl = localMatch.originalUrl.trim();
        effectiveUA = effectiveUA || localMatch.userAgentHeader || void 0;
        effectiveReferer = effectiveReferer || localMatch.refererHeader || void 0;
      }
    }
    let fetchTargetUrl = rawUrl;
    if (rt.resolvedVariantCache && rt.resolvedVariantCache.sourceUrl === fetchTargetUrl && rt.resolvedVariantCache.epoch === server.switchCount && Date.now() < rt.resolvedVariantCache.expiresAt) {
      fetchTargetUrl = rt.resolvedVariantCache.variantUrl;
    }
    let resp = await fetch(fetchTargetUrl, {
      headers: getObfuscatedUpstreamHeaders(effectiveUA, effectiveReferer),
      signal: controller.signal
    }).catch(() => null);
    if ((!resp || !resp.ok) && fetchTargetUrl !== rawUrl) {
      rt.resolvedVariantCache = void 0;
      fetchTargetUrl = rawUrl;
      resp = await fetch(fetchTargetUrl, {
        headers: getObfuscatedUpstreamHeaders(effectiveUA, effectiveReferer),
        signal: controller.signal
      }).catch(() => null);
    }
    if (resp && (resp.status === 403 || resp.status === 406) && !effectiveUA) {
      resp = await fetch(fetchTargetUrl, {
        headers: getObfuscatedUpstreamHeaders("VLC/3.0.18 LibVLC/3.0.18", effectiveReferer),
        signal: controller.signal
      }).catch(() => null);
    }
    if (!resp || !resp.ok) {
      clearTimeout(timeout);
      return null;
    }
    const respCt = (resp.headers.get("content-type") || "").toLowerCase();
    if (respCt.startsWith("video/") || respCt === "application/octet-stream") {
      clearTimeout(timeout);
      return { targetDuration: 2, segments: [], autoVideoFallback: true };
    }
    let text = await resp.text();
    if (!text.includes("#EXTM3U")) {
      clearTimeout(timeout);
      return null;
    }
    let finalOriginUrl = resp.url || fetchTargetUrl;
    let lastSlash = finalOriginUrl.lastIndexOf("/");
    let baseUrl = lastSlash !== -1 ? finalOriginUrl.substring(0, lastSlash + 1) : finalOriginUrl;
    if (text.includes("#EXT-X-STREAM-INF")) {
      const bestVariant = parseBestVariantFromMaster(text, baseUrl);
      if (!bestVariant) {
        clearTimeout(timeout);
        return null;
      }
      rt.resolvedVariantCache = {
        sourceUrl: rawUrl,
        epoch: server.switchCount,
        variantUrl: bestVariant,
        expiresAt: Date.now() + 6e4
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
      lastSlash = finalOriginUrl.lastIndexOf("/");
      baseUrl = lastSlash !== -1 ? finalOriginUrl.substring(0, lastSlash + 1) : finalOriginUrl;
    }
    clearTimeout(timeout);
    const tdMatch = text.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/);
    const targetDuration = tdMatch ? Math.ceil(Number(tdMatch[1])) : 4;
    const proxyBase = `${publicBaseUrl}/srv/${encodeURIComponent(server.token)}/seg?e=${server.switchCount}&u=`;
    const lines = text.split("\n");
    const segments = [];
    let pendingPreTags = [];
    let pendingExtinf = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("#EXTINF:")) {
        pendingExtinf = line;
      } else if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-MAP:") || line.startsWith("#EXT-X-BYTERANGE:")) {
        pendingPreTags.push(rewriteTagUriAttributes(line, baseUrl, proxyBase, true));
      } else if (line.startsWith("#")) {
        continue;
      } else if (pendingExtinf) {
        const resolved = resolveRelativeUrl(line, baseUrl);
        segments.push({
          key: `${server.switchCount}:${resolved}`,
          extinf: pendingExtinf,
          uri: `${proxyBase}${encodeURIComponent(resolved)}`,
          preTags: pendingPreTags.length > 0 ? [...pendingPreTags] : void 0
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
function parseLocalFfmpegSegments(manifestText, publicBaseUrl, token, mode, epoch) {
  const tdMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/);
  const targetDuration = tdMatch ? Math.ceil(Number(tdMatch[1])) : 2;
  const segments = [];
  const lines = manifestText.split("\n");
  let pendingExtinf = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      pendingExtinf = line;
    } else if (!line.startsWith("#") && pendingExtinf) {
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
function cleanCustomVirtualHost(rawHost) {
  if (!rawHost) return void 0;
  let trimmed = rawHost.trim().replace(/\/$/, "");
  if (!trimmed) return void 0;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
function loadVirtualXtream() {
  let loadedAccounts = [];
  try {
    if (fs.existsSync(VIRTUAL_XTREAM_FILE)) {
      const data = fs.readFileSync(VIRTUAL_XTREAM_FILE, "utf-8");
      const accounts = JSON.parse(data);
      if (Array.isArray(accounts)) {
        loadedAccounts = accounts.filter((acc) => !acc.id.startsWith("px_")).map((acc) => {
          if (acc.customVirtualHost && (acc.customVirtualHost.includes("1n3xor7x9") || acc.customVirtualHost.includes("streamrelay"))) {
            acc.customVirtualHost = "";
          }
          if (acc.customVirtualHost) {
            acc.customVirtualHost = cleanCustomVirtualHost(acc.customVirtualHost);
          }
          if (Array.isArray(acc.connectedApps)) {
            acc.connectedApps = acc.connectedApps.filter(
              (a) => isRealExternalViewer(a.ipAddress || "", a.userAgent)
            );
          }
          return acc;
        });
      }
    }
  } catch (err) {
    console.error("Error reading virtual xtream storage:", err);
  }
  return loadedAccounts;
}
function saveVirtualXtream(accounts) {
  try {
    fs.writeFileSync(VIRTUAL_XTREAM_FILE, JSON.stringify(accounts, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving virtual xtream storage:", err);
  }
}
var virtualXtreamStore = loadVirtualXtream();
var ipGeoCache = {};
async function fetchRealIpGeoDetails(ip, forceRefresh = false) {
  const cleanIp = (ip || "").replace("::ffff:", "").trim();
  if (!cleanIp || isInternalOrPrivateIp(cleanIp)) {
    return {};
  }
  const cacheKey = cleanIp;
  if (!forceRefresh && ipGeoCache[cacheKey]) {
    return ipGeoCache[cacheKey];
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4e3);
    const apiUrl = cleanIp ? `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=66846719` : `http://ip-api.com/json/?fields=66846719`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success") {
        const result = {
          ip: data.query || cleanIp,
          country: data.country || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
          countryCode: data.countryCode || "",
          region: data.region || "",
          regionName: data.regionName || "",
          city: data.city || "",
          isp: data.isp || data.org || "",
          org: data.org || "",
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
    console.warn("Primary IP Geolocation lookup error:", err);
  }
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
          country: data.country || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
          countryCode: data.country_code || "",
          region: data.region_code || "",
          regionName: data.region || "",
          city: data.city || "",
          isp: conn.isp || conn.org || "",
          org: conn.org || "",
          lat: data.latitude,
          lon: data.longitude,
          zip: data.postal || "",
          timezone: data.timezone?.id || "",
          as: conn.asn ? `AS${conn.asn} ${conn.org || ""}`.trim() : "",
          mobile: conn.type === "cellular" || false,
          proxy: !!(sec.proxy || sec.vpn || sec.tor),
          hosting: !!sec.hosting
        };
        ipGeoCache[cacheKey] = result;
        return result;
      }
    }
  } catch (err) {
    console.warn("Secondary IP Geolocation fallback error:", err);
  }
  return {
    ip: cleanIp,
    country: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    countryCode: "",
    region: "",
    regionName: "",
    city: "",
    isp: "",
    mobile: false,
    proxy: false,
    hosting: false
  };
}
function computeDeviceFingerprint(ip, ua, acceptLang) {
  const raw = `${ip || "noip"}|${ua || "noua"}|${acceptLang || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 12).toUpperCase();
}
function appendAccessHistory(app2, endpoint, nowIso) {
  if (!endpoint) return;
  if (!app2.accessHistory) app2.accessHistory = [];
  const last = app2.accessHistory[0];
  if (last && last.endpoint === endpoint) {
    last.timestamp = nowIso;
  } else {
    app2.accessHistory.unshift({ endpoint, timestamp: nowIso });
    if (app2.accessHistory.length > 10) {
      app2.accessHistory = app2.accessHistory.slice(0, 10);
    }
  }
}
function computeConnectionRiskAndRate(app2, nowMs) {
  const firstMs = app2.firstSeen ? new Date(app2.firstSeen).getTime() : app2.lastActive ? new Date(app2.lastActive).getTime() : nowMs;
  const lastMs = app2.lastActive ? new Date(app2.lastActive).getTime() : nowMs;
  const sessionDurationSec = Math.max(0, Math.round((lastMs - firstMs) / 1e3));
  const durationMinutes = Math.max(1, sessionDurationSec / 60);
  const requestsPerMinute = Math.round((app2.requestCount || 1) / durationMinutes * 10) / 10;
  let riskScore = 0;
  const riskReasons = [];
  if (app2.proxy) {
    riskScore += 35;
    riskReasons.push("\u0627\u062A\u0635\u0627\u0644 \u0639\u0628\u0631 VPN / Proxy");
  }
  if (app2.hosting) {
    riskScore += 30;
    riskReasons.push("\u0639\u0646\u0648\u0627\u0646 \u0645\u0631\u0643\u0632 \u0628\u064A\u0627\u0646\u0627\u062A / \u0633\u064A\u0631\u0641\u0631 (Hosting)");
  }
  if (app2.clientType === "bot_scraper") {
    riskScore += 40;
    riskReasons.push("\u0623\u062F\u0627\u0629 \u0633\u062D\u0628 \u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u0623\u0648 \u0633\u0643\u0631\u0628\u062A (Bot)");
  }
  if (!app2.userAgent || app2.userAgent === "unknown-app-client") {
    riskScore += 20;
    riskReasons.push("\u0628\u062F\u0648\u0646 \u0628\u0635\u0645\u0629 User-Agent");
  }
  if (requestsPerMinute > 30) {
    riskScore += 25;
    riskReasons.push(`\u0645\u0639\u062F\u0644 \u0637\u0644\u0628\u0627\u062A \u0645\u0631\u062A\u0641\u0639 (${requestsPerMinute}/\u062F\u0642\u064A\u0642\u0629)`);
  }
  if (app2.forwardedChain && app2.forwardedChain.includes(",")) {
    riskScore += 15;
    riskReasons.push("\u0633\u0644\u0633\u0644\u0629 \u0628\u0631\u0648\u0643\u0633\u064A \u0645\u062A\u0639\u062F\u062F\u0629 (Multi-Hop)");
  }
  if (app2.isBlocked || app2.isGlobalIpBlocked) {
    riskScore = Math.max(riskScore, 85);
    riskReasons.push("\u0645\u0642\u064A\u062F \u0623\u0648 \u0645\u062D\u0638\u0648\u0631 \u0623\u0645\u0646\u064A\u0627\u064B");
  }
  return {
    sessionDurationSec,
    requestsPerMinute,
    riskScore: Math.min(100, riskScore),
    riskReasons
  };
}
async function trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, endpoint, extra) {
  if (!isRealExternalViewer(clientIP, clientUA)) return;
  if (!vAcc.connectedApps) vAcc.connectedApps = [];
  const appName = detectAppName(clientUA, clientReferer);
  const deviceModel = extractDeviceModel(clientUA);
  const osName = detectOsName(clientUA);
  const clientType = classifyClientType(clientUA, clientReferer);
  const uaKey = clientUA || clientReferer || "unknown-app-client";
  const geo = await fetchRealIpGeoDetails(clientIP);
  const fingerprint = computeDeviceFingerprint(clientIP, uaKey, extra?.acceptLanguage);
  const isBlockedApp = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  let existingApp = vAcc.connectedApps.find(
    (a) => a.userAgent === uaKey || a.ipAddress && clientIP && a.ipAddress === clientIP || a.appName === appName && appName !== "\u0645\u0634\u063A\u0644 \u0645\u062C\u0647\u0648\u0644 (\u0628\u062F\u0648\u0646 \u0628\u064A\u0627\u0646\u0627\u062A User-Agent)"
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
    if (clientUA && (!existingApp.userAgent || existingApp.userAgent === "unknown-app-client")) existingApp.userAgent = clientUA;
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
    if (clientIP && geo.proxy && securityPolicyStore.autoBlockVpnProxy && !blockedIpsStore.some((b) => b.ip === clientIP)) {
      blockIpAddress(clientIP, "\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: \u0627\u062A\u0635\u0627\u0644 \u0639\u0628\u0631 VPN/Proxy (Auto-Defense Policy)", 120);
      addSecurityLog(clientIP, "UNAUTHORIZED_ACCESS", "\u0627\u0644\u062F\u0631\u0639 \u0627\u0644\u0622\u0644\u064A: \u062D\u0638\u0631 IP \u064A\u0645\u0631 \u0639\u0628\u0631 VPN/Proxy");
      recordTrafficEvent("threat");
    }
    if (clientIP && geo.hosting && securityPolicyStore.autoBlockDatacenter && !blockedIpsStore.some((b) => b.ip === clientIP)) {
      blockIpAddress(clientIP, "\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: \u0627\u0633\u062A\u0636\u0627\u0641\u0629 \u0633\u062D\u0627\u0628\u064A\u0629 / Datacenter (Auto-Defense Policy)", 120);
      addSecurityLog(clientIP, "UNAUTHORIZED_ACCESS", "\u0627\u0644\u062F\u0631\u0639 \u0627\u0644\u0622\u0644\u064A: \u062D\u0638\u0631 IP \u062A\u0627\u0628\u0639 \u0644\u0645\u0631\u0643\u0632 \u0628\u064A\u0627\u0646\u0627\u062A/\u0627\u0633\u062A\u0636\u0627\u0641\u0629");
      recordTrafficEvent("threat");
    }
  } else {
    const created = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userAgent: uaKey,
      appName,
      deviceModel: deviceModel || void 0,
      osName,
      clientType,
      deviceFingerprint: fingerprint,
      acceptLanguage: extra?.acceptLanguage || void 0,
      forwardedChain: extra?.forwardedChain || void 0,
      ipAddress: clientIP || void 0,
      country: geo.country,
      countryCode: geo.countryCode || void 0,
      regionName: geo.regionName,
      city: geo.city,
      isp: geo.isp,
      lat: geo.lat,
      lon: geo.lon,
      zip: geo.zip || void 0,
      timezone: geo.timezone || void 0,
      as: geo.as,
      mobile: !!geo.mobile,
      proxy: !!geo.proxy,
      hosting: !!geo.hosting,
      referer: clientReferer || void 0,
      requestCount: 1,
      firstSeen: nowIso,
      lastActive: nowIso,
      lastEndpoint: endpoint || void 0,
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
function getPublicBaseUrl(req) {
  const forwardedHost = req.get("x-forwarded-host");
  const host = (forwardedHost || req.get("host") || "").split(",")[0].trim();
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.secure || host && host.includes("run.app") ? "https" : "http");
  if (host && !host.includes("aistudio.google.com")) {
    return `${protocol}://${host}`;
  }
  if (process.env.APP_URL && !process.env.APP_URL.includes("aistudio.google.com") && !process.env.APP_URL.includes("MY_APP_URL")) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  return `${protocol}://${host || "localhost:3000"}`;
}
function buildStreamPlayUrl(stream, baseUrl) {
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/v/${stream.streamToken || stream.slug || stream.id}.m3u8`;
}
function getHash(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}
function clearOldPosterTsFiles(streamId) {
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach((file) => {
        if (file.startsWith(`poster_ts_${streamId}_`)) {
          try {
            fs.unlinkSync(path.join(UPLOADS_DIR, file));
          } catch {
          }
        }
      });
    }
  } catch {
  }
}
async function getOrGenerateTsSegmentForStream(stream) {
  const urlStr = (stream.customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg").trim();
  if (urlStr.includes("BK7PcpCk") || urlStr.includes("a473215") || urlStr.includes("preset_poster_1")) {
    const preset1Ts = path.join(UPLOADS_DIR, "preset_poster_1.ts");
    if (fs.existsSync(preset1Ts)) return preset1Ts;
  }
  if (urlStr.includes("fdjC56ZJ") || urlStr.includes("6bc8fa3a") || urlStr.includes("preset_poster_2")) {
    const preset2Ts = path.join(UPLOADS_DIR, "preset_poster_2.ts");
    if (fs.existsSync(preset2Ts)) return preset2Ts;
  }
  const watermark = (stream.watermarkText || "").trim();
  const updatedAt = stream.updatedAt || "";
  const hash = getHash(`${stream.id}_${urlStr}_${watermark}_${updatedAt}`);
  const targetTsPath = path.join(UPLOADS_DIR, `poster_ts_${stream.id}_${hash}.ts`);
  if (fs.existsSync(targetTsPath) && fs.statSync(targetTsPath).size > 0) {
    return targetTsPath;
  }
  clearOldPosterTsFiles(stream.id);
  let sourceImagePath = "";
  let tempImageCreated = false;
  try {
    if (urlStr.startsWith("data:image/")) {
      const matches = urlStr.match(/^data:image\/([a-zA-Z0-9+.=-]+);base64,(.+)$/);
      if (matches && matches[2]) {
        const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
        sourceImagePath = path.join(UPLOADS_DIR, `temp_img_${hash}.${ext}`);
        fs.writeFileSync(sourceImagePath, Buffer.from(matches[2], "base64"));
        tempImageCreated = true;
      }
    } else if (urlStr.includes("/uploads/")) {
      const fileName = urlStr.split("/uploads/").pop()?.split("?")[0];
      if (fileName) {
        const localPath = path.join(UPLOADS_DIR, fileName);
        if (fs.existsSync(localPath)) {
          sourceImagePath = localPath;
        }
      }
    }
    if (!sourceImagePath) {
      const relativeClean = urlStr.startsWith("/") ? urlStr.substring(1) : urlStr;
      const directPath = path.join(__dirname, relativeClean);
      const publicPath = path.join(__dirname, "public", relativeClean);
      if (fs.existsSync(directPath)) {
        sourceImagePath = directPath;
      } else if (fs.existsSync(publicPath)) {
        sourceImagePath = publicPath;
      } else if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
        try {
          const fetchRes = await fetch(urlStr, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" }
          });
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            sourceImagePath = path.join(UPLOADS_DIR, `temp_img_${hash}.jpg`);
            fs.writeFileSync(sourceImagePath, Buffer.from(arrayBuf));
            tempImageCreated = true;
          }
        } catch (fetchErr) {
          console.warn("Failed fetching remote poster image:", fetchErr);
        }
      }
    }
    if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
      return null;
    }
    const baseFilter = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black";
    let filterString = baseFilter;
    if (watermark) {
      const safeWatermark = watermark.replace(/[':\\]/g, " ").substring(0, 50);
      if (safeWatermark) {
        filterString += `,drawtext=text='${safeWatermark}':x=(w-text_w)/2:y=h-60:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8`;
      }
    }
    try {
      execFileSync("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        sourceImagePath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-t",
        "4",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        filterString,
        "-r",
        "25",
        "-shortest",
        "-f",
        "mpegts",
        targetTsPath
      ], { stdio: "pipe", timeout: 15e3 });
    } catch (ffmpegErr) {
      console.warn("FFmpeg drawtext failed, retrying with base image scaling only...", ffmpegErr);
      execFileSync("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        sourceImagePath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-t",
        "4",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        baseFilter,
        "-r",
        "25",
        "-shortest",
        "-f",
        "mpegts",
        targetTsPath
      ], { stdio: "pipe", timeout: 15e3 });
    }
    if (tempImageCreated && fs.existsSync(sourceImagePath)) {
      try {
        fs.unlinkSync(sourceImagePath);
      } catch {
      }
    }
    if (fs.existsSync(targetTsPath) && fs.statSync(targetTsPath).size > 0) {
      return targetTsPath;
    }
  } catch (err) {
    console.error("Error generating MPEG-TS segment from poster image:", err);
  }
  return null;
}
app.get("/api/config", (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  res.json({
    success: true,
    baseUrl,
    appUrl: process.env.APP_URL || "",
    googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""
  });
});
app.post("/api/upload-image", (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "\u0635\u0648\u0631\u0629 \u0627\u0644\u0625\u064A\u0642\u0627\u0641 \u0645\u0641\u0642\u0648\u062F\u0629" });
    }
    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9+.=-]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const dataBuffer = Buffer.from(matches[2], "base64");
      const uniqueFileName = `pause_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, uniqueFileName);
      fs.writeFileSync(filePath, dataBuffer);
      const publicBaseUrl = getPublicBaseUrl(req);
      const imageUrl = `${publicBaseUrl}/uploads/${uniqueFileName}`;
      return res.json({ success: true, imageUrl });
    }
    return res.json({ success: true, imageUrl: imageBase64 });
  } catch (err) {
    console.error("Image upload failed:", err);
    res.status(500).json({ success: false, error: "\u0641\u0634\u0644 \u062D\u0641\u0638 \u0627\u0644\u0635\u0648\u0631\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631" });
  }
});
function detectStreamType(url) {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return "youtube";
  }
  if (lower.includes("twitch.tv")) {
    return "twitch";
  }
  if (lower.includes(".m3u8") || lower.includes("hls") || lower.includes(".ts")) {
    return "hls";
  }
  if (lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov")) {
    return "mp4";
  }
  return "embed";
}
function normalizeStreamUrl(url) {
  const type = detectStreamType(url);
  let normalized = url.trim();
  if (type === "youtube") {
    let videoId = "";
    if (normalized.includes("v=")) {
      const match = normalized.match(/v=([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes("youtu.be/")) {
      const match = normalized.match(/youtu\.be\/([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes("/embed/")) {
      const match = normalized.match(/\/embed\/([\w-]+)/);
      if (match) videoId = match[1];
    } else if (normalized.includes("/live/")) {
      const match = normalized.match(/\/live\/([\w-]+)/);
      if (match) videoId = match[1];
    }
    if (videoId) {
      normalized = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
    }
  } else if (type === "twitch") {
    const match = normalized.match(/twitch\.tv\/([\w-]+)/);
    if (match && !normalized.includes("player.twitch.tv")) {
      const channel = match[1];
      normalized = `https://player.twitch.tv/?channel=${channel}&parent=localhost&autoplay=true`;
    }
  }
  return { normalizedUrl: normalized, detectedType: type };
}
app.post("/api/verify-stream", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0645\u0641\u0642\u0648\u062F" });
  }
  const { normalizedUrl, detectedType } = normalizeStreamUrl(url);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    const checkRes = await fetch(normalizedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);
    const isReachable = checkRes ? checkRes.ok || checkRes.status === 403 || checkRes.status === 405 || checkRes.status === 302 : true;
    res.json({
      success: true,
      reachable: isReachable,
      detectedType,
      normalizedUrl,
      status: checkRes ? checkRes.status : 200,
      message: detectedType === "hls" ? "\u0631\u0627\u0628\u0637 \u0628\u062B HLS m3u8 \u0635\u062D\u064A\u062D \u0648\u062A\u0644\u0642\u0627\u0626\u064A \u0627\u0644\u062A\u062D\u0648\u064A\u0644" : detectedType === "youtube" ? "\u0628\u062B/\u0641\u064A\u062F\u064A\u0648 \u064A\u0648\u062A\u064A\u0648\u0628 \u0645\u062F\u0645\u062C \u0628\u0646\u062C\u0627\u062D" : "\u0631\u0627\u0628\u0637 \u0645\u0628\u0627\u0634\u0631 \u0623\u0648 \u062A\u0636\u0645\u064A\u0646 \u062E\u0627\u0631\u062C\u064A"
    });
  } catch (err) {
    res.json({
      success: true,
      reachable: true,
      detectedType,
      normalizedUrl,
      message: "\u062A\u0645 \u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0631\u0627\u0628\u0637 \u0648\u0633\u064A\u062A\u0645 \u0639\u0644\u0627\u062C\u0647 \u0639\u0628\u0631 \u0628\u0631\u0648\u0643\u0633\u064A \u0627\u0644\u062A\u0645\u0631\u064A\u0631."
    });
  }
});
function computeRealViewers(stream) {
  if (!stream.connectedApps || stream.connectedApps.length === 0) return 0;
  const now = Date.now();
  return stream.connectedApps.filter((app2) => {
    if (app2.isBlocked) return false;
    const lastActiveMs = new Date(app2.lastActive).getTime();
    return now - lastActiveMs < 15e3;
  }).length;
}
async function updateConnectionInfo(app2, clientUA, clientReferer, clientIP, endpoint, extra) {
  const now = /* @__PURE__ */ new Date();
  const nowIso = now.toISOString();
  const lastActive = app2.lastActive ? new Date(app2.lastActive) : /* @__PURE__ */ new Date(0);
  const diffMs = now.getTime() - lastActive.getTime();
  app2.requestCount += 1;
  app2.lastActive = nowIso;
  if (!app2.firstSeen) app2.firstSeen = nowIso;
  if (endpoint) app2.lastEndpoint = endpoint;
  appendAccessHistory(app2, endpoint, nowIso);
  if (clientUA) {
    app2.osName = detectOsName(clientUA);
    app2.clientType = classifyClientType(clientUA, clientReferer);
  }
  if (extra?.acceptLanguage) app2.acceptLanguage = extra.acceptLanguage;
  if (extra?.forwardedChain) app2.forwardedChain = extra.forwardedChain;
  if (extra?.telemetry && typeof extra.telemetry === "object") {
    app2.clientTelemetry = extra.telemetry;
  }
  app2.deviceFingerprint = computeDeviceFingerprint(clientIP, clientUA || clientReferer, extra?.acceptLanguage || app2.acceptLanguage);
  if (diffMs < 30 * 60 * 1e3 && app2.country && app2.country !== "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" && typeof app2.lat === "number" && typeof app2.lon === "number") {
    return;
  }
  const appName = detectAppName(clientUA, clientReferer);
  const deviceModel = extractDeviceModel(clientUA);
  const geo = await fetchRealIpGeoDetails(clientIP);
  if (!app2.appName || app2.appName.includes("\u0645\u062C\u0647\u0648\u0644")) app2.appName = appName;
  if (deviceModel) app2.deviceModel = deviceModel;
  if (clientIP) app2.ipAddress = clientIP;
  if (clientReferer) app2.referer = clientReferer;
  if (clientUA && (!app2.userAgent || app2.userAgent === "unknown-app-client")) app2.userAgent = clientUA;
  if (!app2.osName) app2.osName = detectOsName(clientUA);
  if (!app2.clientType) app2.clientType = classifyClientType(clientUA, clientReferer);
  if (geo.country) app2.country = geo.country;
  if (geo.regionName) app2.regionName = geo.regionName;
  if (geo.city) app2.city = geo.city;
  if (geo.isp) app2.isp = geo.isp;
  if (geo.countryCode) app2.countryCode = geo.countryCode;
  if (geo.lat) app2.lat = geo.lat;
  if (geo.lon) app2.lon = geo.lon;
  if (geo.zip) app2.zip = geo.zip;
  if (geo.timezone) app2.timezone = geo.timezone;
  if (geo.as) app2.as = geo.as;
  app2.mobile = !!geo.mobile;
  app2.proxy = !!geo.proxy;
  app2.hosting = !!geo.hosting;
  if (clientIP && geo.proxy && securityPolicyStore.autoBlockVpnProxy && !blockedIpsStore.some((b) => b.ip === clientIP)) {
    blockIpAddress(clientIP, "\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: \u0627\u062A\u0635\u0627\u0644 \u0639\u0628\u0631 VPN/Proxy (Auto-Defense Policy)", 120);
    addSecurityLog(clientIP, "UNAUTHORIZED_ACCESS", "\u0627\u0644\u062F\u0631\u0639 \u0627\u0644\u0622\u0644\u064A: \u062D\u0638\u0631 IP \u064A\u0645\u0631 \u0639\u0628\u0631 VPN/Proxy");
    recordTrafficEvent("threat");
  }
  if (clientIP && geo.hosting && securityPolicyStore.autoBlockDatacenter && !blockedIpsStore.some((b) => b.ip === clientIP)) {
    blockIpAddress(clientIP, "\u062D\u0638\u0631 \u062A\u0644\u0642\u0627\u0626\u064A: \u0627\u0633\u062A\u0636\u0627\u0641\u0629 \u0633\u062D\u0627\u0628\u064A\u0629 / Datacenter (Auto-Defense Policy)", 120);
    addSecurityLog(clientIP, "UNAUTHORIZED_ACCESS", "\u0627\u0644\u062F\u0631\u0639 \u0627\u0644\u0622\u0644\u064A: \u062D\u0638\u0631 IP \u062A\u0627\u0628\u0639 \u0644\u0645\u0631\u0643\u0632 \u0628\u064A\u0627\u0646\u0627\u062A/\u0627\u0633\u062A\u0636\u0627\u0641\u0629");
    recordTrafficEvent("threat");
  }
}
app.post("/api/stream/:slugOrId/ping", async (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find((s) => s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  const clientUA = req.get("user-agent") || "";
  const clientReferer = req.get("referer") || req.get("origin") || "";
  const clientIP = getClientIp(req);
  const acceptLanguage = req.get("accept-language") || "";
  const forwardedChain = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : "";
  if (!isRealExternalViewer(clientIP, clientUA)) {
    return res.json({ success: true, currentViewers: computeRealViewers(stream) });
  }
  const { deviceId, telemetry } = req.body || {};
  if (!stream.connectedApps) stream.connectedApps = [];
  const appName = detectAppName(clientUA, clientReferer);
  const uaKey = clientUA || clientReferer || "unknown-app-client";
  let existingApp = stream.connectedApps.find(
    (a) => deviceId && a.id === deviceId || a.userAgent === uaKey || a.ipAddress && clientIP && a.ipAddress === clientIP
  );
  if (existingApp) {
    if (deviceId && !existingApp.id.startsWith("app_")) {
      existingApp.id = deviceId;
    }
    updateConnectionInfo(existingApp, clientUA, clientReferer, clientIP, `web_player:${stream.slug}`, {
      acceptLanguage,
      forwardedChain,
      telemetry
    }).then(() => saveStreams(streamsStore)).catch(() => {
    });
  } else {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const newApp = {
      id: deviceId || `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userAgent: uaKey,
      appName,
      ipAddress: clientIP,
      osName: detectOsName(clientUA),
      clientType: classifyClientType(clientUA, clientReferer),
      acceptLanguage: acceptLanguage || void 0,
      forwardedChain: forwardedChain || void 0,
      deviceFingerprint: computeDeviceFingerprint(clientIP, uaKey, acceptLanguage),
      requestCount: 1,
      firstSeen: nowIso,
      lastActive: nowIso,
      lastEndpoint: `web_player:${stream.slug}`,
      accessHistory: [{ endpoint: `web_player:${stream.slug}`, timestamp: nowIso }],
      clientTelemetry: telemetry && typeof telemetry === "object" ? telemetry : void 0,
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
    }).then(() => saveStreams(streamsStore)).catch(() => {
    });
  }
  res.json({ success: true, currentViewers: computeRealViewers(stream) });
});
app.post("/api/stream/:slugOrId/leave", (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find((s) => s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  const clientUA = req.get("user-agent") || "";
  const clientReferer = req.get("referer") || req.get("origin") || "";
  const clientIP = getClientIp(req);
  const { deviceId } = req.body;
  if (stream.connectedApps) {
    stream.connectedApps = stream.connectedApps.filter(
      (a) => deviceId ? a.id !== deviceId : !(a.userAgent === (req.get("user-agent") || "") || a.ipAddress && clientIP && a.ipAddress === clientIP)
    );
    saveStreams(streamsStore);
  }
  res.json({ success: true, currentViewers: computeRealViewers(stream) });
});
app.get("/api/streams", (req, res) => {
  const streamsWithRealViewers = streamsStore.map((s) => ({
    ...s,
    currentViewers: computeRealViewers(s)
  }));
  res.json({ success: true, streams: streamsWithRealViewers });
});
app.get("/api/streams/:slugOrId", (req, res) => {
  const { slugOrId } = req.params;
  const stream = streamsStore.find(
    (s) => s.streamToken === slugOrId || s.id === slugOrId || s.slug === slugOrId
  );
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  res.json({
    success: true,
    stream: {
      ...stream,
      currentViewers: computeRealViewers(stream)
    }
  });
});
app.post("/api/streams", async (req, res) => {
  const body = req.body;
  let finalOriginalUrl = body.originalUrl || "";
  if (body.isXtream || body.xtreamHost) {
    const rawHost = (body.xtreamHost || "").trim().replace(/\/$/, "");
    const user = (body.xtreamUser || "").trim();
    const pass = (body.xtreamPass || "").trim();
    const streamId = (body.xtreamStreamId || "").trim();
    if (rawHost && user && pass && streamId) {
      if (streamId.endsWith(".m3u8") || streamId.endsWith(".ts")) {
        finalOriginalUrl = `${rawHost}/live/${user}/${pass}/${streamId}`;
      } else {
        finalOriginalUrl = `${rawHost}/live/${user}/${pass}/${streamId}.m3u8`;
      }
    }
  }
  if (!finalOriginalUrl || !body.title) {
    return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u062A\u0632\u0648\u064A\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0643\u0633\u062A\u0631\u064A\u0645 \u0623\u0648 \u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u062B \u0627\u0644\u0623\u0635\u0644\u064A \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u062B" });
  }
  const { normalizedUrl, detectedType } = normalizeStreamUrl(finalOriginalUrl);
  let rawSlug = body.slug ? body.slug.trim() : "";
  let formattedSlug = rawSlug ? rawSlug.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, "") : `live-${Math.random().toString(36).substring(2, 8)}`;
  if (!formattedSlug) {
    formattedSlug = `live-${Math.random().toString(36).substring(2, 8)}`;
  }
  let uniqueSlug = formattedSlug;
  let counter = 1;
  while (streamsStore.some((s) => s.slug === uniqueSlug)) {
    uniqueSlug = `${formattedSlug}-${counter}`;
    counter++;
  }
  const usedTokens = new Set(streamsStore.map((s) => s.streamToken).filter(Boolean));
  const newStream = {
    id: `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    slug: uniqueSlug,
    streamToken: generateOpaqueToken(usedTokens),
    title: body.title,
    category: body.category || "sports",
    originalUrl: normalizedUrl,
    streamType: body.streamType || detectedType,
    status: body.status || "active",
    watermarkText: body.watermarkText || "\xA9 \u062D\u0642\u0648\u0642 \u0627\u0644\u0628\u062B \u0645\u062D\u0641\u0648\u0638\u0629",
    quality: body.quality || "1080p HD",
    refererHeader: body.refererHeader || "",
    userAgentHeader: body.userAgentHeader || "",
    password: body.password || "",
    allowedDomains: body.allowedDomains || "",
    viewsCount: 0,
    currentViewers: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    pauseNoticeMessage: body.pauseNoticeMessage || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B \u0628\u0648\u0627\u0633\u0637\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0631\u0627\u0628\u0637",
    customPosterUrl: body.customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
    customLogoUrl: body.customLogoUrl || "",
    logoPosition: body.logoPosition || "top-right",
    logoSize: body.logoSize || "md",
    autoPauseTimerMinutes: body.autoPauseTimerMinutes ? Number(body.autoPauseTimerMinutes) : void 0,
    isXtream: !!(body.isXtream || body.xtreamHost),
    xtreamHost: body.xtreamHost || "",
    xtreamUser: body.xtreamUser || "",
    xtreamPass: body.xtreamPass || "",
    xtreamStreamId: body.xtreamStreamId || "",
    isBulk: false
  };
  const publicBaseUrl = getPublicBaseUrl(req);
  streamsStore.unshift(newStream);
  saveStreamsNow(streamsStore);
  if (newStream.customPosterUrl) {
    getOrGenerateTsSegmentForStream(newStream).catch(() => {
    });
  }
  res.status(201).json({ success: true, stream: newStream });
});
app.put("/api/streams/:id", (req, res) => {
  const { id } = req.params;
  const index = streamsStore.findIndex((s) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
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
  if (body.slug && body.slug.trim() !== "") {
    const rawSlug = body.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, "");
    if (rawSlug) {
      let uniqueSlug = rawSlug;
      let counter = 1;
      while (streamsStore.some((s) => s.id !== id && s.slug === uniqueSlug)) {
        uniqueSlug = `${rawSlug}-${counter}`;
        counter++;
      }
      newSlug = uniqueSlug;
    }
  }
  const updated = {
    ...existing,
    ...body,
    slug: newSlug,
    originalUrl: normalizedUrl,
    streamType: body.streamType || detectedType,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  streamsStore[index] = updated;
  saveStreamsNow(streamsStore);
  if (updated.customPosterUrl) {
    getOrGenerateTsSegmentForStream(updated).catch(() => {
    });
  }
  res.json({ success: true, stream: updated });
});
app.patch("/api/streams/:id/toggle", (req, res) => {
  const { id } = req.params;
  const stream = streamsStore.find((s) => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  stream.status = stream.status === "active" ? "paused" : "active";
  stream.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStreamsNow(streamsStore);
  if (stream.status === "paused" && stream.customPosterUrl) {
    getOrGenerateTsSegmentForStream(stream).catch(() => {
    });
  }
  res.json({ success: true, status: stream.status, stream });
});
app.post("/api/streams/:id/block-app", (req, res) => {
  const { id } = req.params;
  const { pattern, userAgent, appName, appId, ipAddress } = req.body;
  const stream = streamsStore.find((s) => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  if (!stream.blockedApps) stream.blockedApps = [];
  const rawTargets = [pattern, userAgent, appName, appId, ipAddress].filter(Boolean).map((t) => String(t).trim());
  if (rawTargets.length === 0) {
    return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0641\u0642\u0648\u062F" });
  }
  const newTokensToBlock = [];
  rawTargets.forEach((t) => {
    newTokensToBlock.push(t);
    const lowerT = t.toLowerCase();
    const cleanT = lowerT.replace(/[\u0600-\u06FF]/g, "").replace(/[•()]/g, "").trim();
    if (cleanT && cleanT.length >= 2) {
      newTokensToBlock.push(cleanT);
    }
    if (lowerT.includes("exoplayer")) newTokensToBlock.push("exoplayer", "okhttp", "dalvik");
    if (lowerT.includes("smarters")) newTokensToBlock.push("smarters", "iptv smarters");
    if (lowerT.includes("tivimate")) newTokensToBlock.push("tivimate");
    if (lowerT.includes("vlc")) newTokensToBlock.push("vlc", "libvlc");
    if (lowerT.includes("xciptv")) newTokensToBlock.push("xciptv");
    if (lowerT.includes("okhttp")) newTokensToBlock.push("okhttp", "dalvik");
    const modelMatch = t.match(/(SM-[A-Z0-9]+|Redmi[^;)]+|iPhone|iPad|Galaxy[^;)]+)/i);
    if (modelMatch) {
      newTokensToBlock.push(modelMatch[1].trim());
    }
  });
  newTokensToBlock.forEach((token) => {
    if (token && !stream.blockedApps.some((b) => b.toLowerCase() === token.toLowerCase())) {
      stream.blockedApps.push(token);
    }
  });
  if (stream.connectedApps) {
    stream.connectedApps.forEach((a) => {
      const isMatch = newTokensToBlock.some((t) => {
        const lowerT = t.toLowerCase();
        return a.id === t || a.ipAddress && a.ipAddress.toLowerCase() === lowerT || a.userAgent.toLowerCase().includes(lowerT) || a.appName.toLowerCase().includes(lowerT);
      });
      if (isMatch) {
        a.isBlocked = true;
      }
    });
  }
  stream.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStreams(streamsStore);
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0648\u062A\u0648\u0642\u064A\u0641 \u0627\u0644\u062E\u062F\u0645\u0629 \u0639\u0646\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0628\u0646\u062C\u0627\u062D", stream });
});
app.patch("/api/streams/:id/toggle-block-all", (req, res) => {
  const { id } = req.params;
  const stream = streamsStore.find((s) => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  stream.blockAllExternalApps = !stream.blockAllExternalApps;
  stream.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStreams(streamsStore);
  const msg = stream.blockAllExternalApps ? "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u062D\u0638\u0631 \u0643\u0627\u0641\u0629 \u0645\u0634\u063A\u0644\u0627\u062A IPTV \u0648\u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629 \u0628\u0646\u062C\u0627\u062D" : "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u062D\u0638\u0631 \u0627\u0644\u0645\u0634\u063A\u0644\u0627\u062A \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629";
  res.json({ success: true, message: msg, blockAllExternalApps: stream.blockAllExternalApps, stream });
});
app.post("/api/streams/:id/unblock-app", (req, res) => {
  const { id } = req.params;
  const { pattern } = req.body;
  const stream = streamsStore.find((s) => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  const cleanP = (pattern || "").trim().toLowerCase();
  if (stream.blockedApps) {
    stream.blockedApps = stream.blockedApps.filter((p) => p.toLowerCase() !== cleanP);
  }
  if (stream.connectedApps) {
    stream.connectedApps.forEach((a) => {
      if (a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP) || a.id === cleanP || a.ipAddress && a.ipAddress.toLowerCase() === cleanP) {
        a.isBlocked = false;
      }
    });
  }
  stream.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStreams(streamsStore);
  res.json({ success: true, message: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u0638\u0631 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0628\u0646\u062C\u0627\u062D", stream });
});
app.patch("/api/streams/:id/poster", async (req, res) => {
  const { id } = req.params;
  const { customPosterUrl } = req.body;
  const stream = streamsStore.find((s) => s.id === id);
  if (!stream) {
    return res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
  stream.customPosterUrl = (customPosterUrl || "").trim();
  stream.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStreamsNow(streamsStore);
  let tsGenerated = false;
  if (stream.customPosterUrl) {
    try {
      const generatedPath = await getOrGenerateTsSegmentForStream(stream);
      tsGenerated = !!(generatedPath && fs.existsSync(generatedPath));
    } catch (err) {
      console.error("Error in instant poster TS generation:", err);
    }
  }
  res.json({
    success: true,
    message: "\u062A\u0645 \u062D\u0641\u0638 \u0648\u062A\u0637\u0628\u064A\u0642 \u0635\u0648\u0631\u0629 \u0634\u0627\u0634\u0629 \u0627\u0644\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0645\u062E\u0635\u0635\u0629 \u0628\u0646\u062C\u0627\u062D!",
    stream,
    tsGenerated
  });
});
app.delete("/api/streams/:id", (req, res) => {
  const { id } = req.params;
  const initialLength = streamsStore.length;
  streamsStore = streamsStore.filter((s) => s.id !== id && s.slug !== id);
  saveStreamsNow(streamsStore);
  if (streamsStore.length < initialLength) {
    res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u062B \u0628\u0646\u062C\u0627\u062D" });
  } else {
    res.status(404).json({ success: false, error: "\u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  }
});
app.delete("/api/streams-all", (req, res) => {
  streamsStore = [];
  saveStreamsNow(streamsStore);
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u062C\u0645\u064A\u0639 \u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0628\u0646\u062C\u0627\u062D" });
});
function parseXtreamLine(line) {
  if (line.includes("|")) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 3) {
      return { host: parts[0], user: parts[1], pass: parts[2] };
    }
  }
  if (line.includes("username=") && line.includes("password=")) {
    try {
      const u = new URL(line);
      const user = u.searchParams.get("username") || "";
      const pass = u.searchParams.get("password") || "";
      const host = `${u.protocol}//${u.host}`;
      return { host, user, pass };
    } catch {
    }
  }
  return null;
}
app.post("/api/streams/bulk", async (req, res) => {
  const { lines } = req.body;
  if (!Array.isArray(lines)) return res.status(400).json({ success: false });
  const newStreams = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const usedBulkTokens = new Set(streamsStore.map((s) => s.streamToken).filter(Boolean));
  for (const line of lines) {
    const xtream = parseXtreamLine(line);
    if (xtream) {
      const id = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const tok = generateOpaqueToken(usedBulkTokens);
      usedBulkTokens.add(tok);
      const newStream = {
        id,
        title: `\u0628\u062B \u0627\u0643\u0633\u062A\u0631\u064A\u0645 - ${xtream.user.substring(0, 5)}`,
        category: "general",
        originalUrl: `${xtream.host}/get.php?username=${xtream.user}&password=${xtream.pass}&type=m3u_plus&output=ts`,
        slug: `xtream_${Math.floor(Math.random() * 8999 + 1e3)}`,
        streamToken: tok,
        streamType: "hls",
        status: "active",
        watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629",
        quality: "HD",
        viewsCount: 0,
        currentViewers: 0,
        createdAt: now,
        updatedAt: now,
        isXtream: true,
        xtreamHost: xtream.host,
        xtreamUser: xtream.user,
        xtreamPass: xtream.pass,
        customPosterUrl: "/uploads/preset_poster_1.jpg",
        connectedApps: [],
        blockedApps: [],
        isBulk: true
      };
      newStreams.push(newStream);
    } else if (line.startsWith("http")) {
      const id = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const title = line.split("/").pop()?.split("?")[0] || "\u0631\u0627\u0628\u0637 \u0628\u062B \u0645\u0628\u0627\u0634\u0631";
      const tok = generateOpaqueToken(usedBulkTokens);
      usedBulkTokens.add(tok);
      const newStream = {
        id,
        title: `\u0628\u062B \u0645\u0628\u0627\u0634\u0631 - ${title.substring(0, 15)}`,
        category: "general",
        originalUrl: line,
        slug: `live_${Math.floor(Math.random() * 8999 + 1e3)}`,
        streamToken: tok,
        streamType: detectStreamType(line),
        status: "active",
        watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629",
        quality: "HD",
        viewsCount: 0,
        currentViewers: 0,
        createdAt: now,
        updatedAt: now,
        customPosterUrl: "/uploads/preset_poster_1.jpg",
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
app.patch("/api/streams/bulk-toggle", (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false });
  streamsStore = streamsStore.map((s) => {
    if (ids.includes(s.id)) {
      return { ...s, status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    return s;
  });
  saveStreams(streamsStore);
  res.json({ success: true });
});
app.post("/api/streams/bulk-delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false });
  streamsStore = streamsStore.filter((s) => !ids.includes(s.id));
  saveStreams(streamsStore);
  res.json({ success: true });
});
app.post("/api/playlists/bulk", (req, res) => {
  const { streamIds } = req.body;
  if (!Array.isArray(streamIds) || streamIds.length === 0) {
    return res.status(400).json({ success: false, error: "Ids missing" });
  }
  const id = `batch_${Math.random().toString(36).substring(2, 10)}`;
  const batch = {
    id,
    streamIds,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  playlistsStore.unshift(batch);
  if (playlistsStore.length > 200) playlistsStore = playlistsStore.slice(0, 200);
  savePlaylists(playlistsStore);
  const baseUrl = getPublicBaseUrl(req);
  res.json({ success: true, batchId: id, playlistUrl: `${baseUrl}/playlist/${id}.m3u` });
});
app.get("/playlist/:batchId.m3u", (req, res) => {
  const { batchId } = req.params;
  const batch = playlistsStore.find((b) => b.id === batchId);
  if (!batch) return res.status(404).send("Playlist not found");
  const baseUrl = getPublicBaseUrl(req);
  let m3u = "#EXTM3U\n";
  batch.streamIds.forEach((sid) => {
    const s = streamsStore.find((st) => st.id === sid);
    if (s && s.status === "active") {
      const playUrl = buildStreamPlayUrl(s, baseUrl);
      m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ""}",${s.title}
`;
      m3u += `${playUrl}
`;
    }
  });
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="playlist_${batchId}.m3u"`);
  res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
  res.setHeader("X-Stream-Speed", "FAST_M3U_DIRECT");
  res.send(m3u);
});
app.get("/api/playlist.m3u", (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  let m3u = "#EXTM3U\n";
  streamsStore.filter((s) => !s.isBulk && s.status === "active").forEach((s) => {
    const playUrl = buildStreamPlayUrl(s, baseUrl);
    m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ""}",${s.title}
`;
    m3u += `${playUrl}
`;
  });
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="playlist.m3u"');
  res.setHeader("Cache-Control", "public, max-age=30");
  res.send(m3u);
});
var globalIo = null;
app.get("/api/intelligence-radar", async (req, res) => {
  const rawList = [];
  streamsStore.forEach((stream) => {
    if (stream.connectedApps && Array.isArray(stream.connectedApps)) {
      stream.connectedApps.forEach((app2) => {
        if (!isRealExternalViewer(app2.ipAddress || "", app2.userAgent)) return;
        rawList.push({
          app: app2,
          sourceTitle: stream.title,
          sourceType: "stream",
          sourceId: stream.id
        });
      });
    }
  });
  virtualXtreamStore.forEach((vAcc) => {
    if (vAcc.connectedApps && Array.isArray(vAcc.connectedApps)) {
      vAcc.connectedApps.forEach((app2) => {
        if (!isRealExternalViewer(app2.ipAddress || "", app2.userAgent)) return;
        rawList.push({
          app: app2,
          sourceTitle: vAcc.title,
          sourceType: "virtual_xtream",
          sourceId: vAcc.id
        });
      });
    }
  });
  const now = Date.now();
  const activeBlockedIps = blockedIpsStore.filter((b) => !b.expiresAt || b.expiresAt > now);
  const blockedIpSet = new Set(activeBlockedIps.map((b) => b.ip));
  const connections = [];
  await Promise.all(
    rawList.map(async (item) => {
      const targetIp = item.app.ipAddress || "";
      const needsGeo = targetIp && (!item.app.country || item.app.country === "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" || item.app.lat === void 0);
      const geo = needsGeo ? await fetchRealIpGeoDetails(targetIp) : {};
      const lastActiveMs = item.app.lastActive ? new Date(item.app.lastActive).getTime() : 0;
      const isOnline = !item.app.isBlocked && now - lastActiveMs < 25e3;
      const isGlobalIpBlocked = !!(targetIp && blockedIpSet.has(targetIp));
      const enrichedBase = {
        ...item.app,
        country: item.app.country && item.app.country !== "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" ? item.app.country : geo.country || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
        countryCode: item.app.countryCode || geo.countryCode || "",
        regionName: item.app.regionName || geo.regionName || "",
        city: item.app.city || geo.city || "",
        isp: item.app.isp || geo.isp || "",
        lat: item.app.lat !== void 0 ? item.app.lat : geo.lat,
        lon: item.app.lon !== void 0 ? item.app.lon : geo.lon,
        zip: item.app.zip || geo.zip || "",
        timezone: item.app.timezone || geo.timezone || "",
        mobile: item.app.mobile !== void 0 ? item.app.mobile : !!geo.mobile,
        proxy: item.app.proxy !== void 0 ? item.app.proxy : !!geo.proxy,
        hosting: item.app.hosting !== void 0 ? item.app.hosting : !!geo.hosting,
        as: item.app.as || geo.as || "",
        osName: item.app.osName || detectOsName(item.app.userAgent || ""),
        clientType: item.app.clientType || classifyClientType(item.app.userAgent || "", item.app.referer),
        deviceFingerprint: item.app.deviceFingerprint || computeDeviceFingerprint(targetIp, item.app.userAgent || "", item.app.acceptLanguage),
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
  const ipCorrMap = {};
  connections.forEach((c) => {
    const ip = (c.ipAddress || "").trim();
    if (!ip) return;
    if (!ipCorrMap[ip]) {
      ipCorrMap[ip] = {
        ip,
        totalHits: 0,
        deviceCount: 0,
        sources: /* @__PURE__ */ new Set(),
        apps: /* @__PURE__ */ new Set(),
        fingerprints: /* @__PURE__ */ new Set(),
        isOnlineAny: false,
        isGlobalIpBlocked: !!c.isGlobalIpBlocked,
        country: c.country || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
        city: c.city || "",
        isp: c.isp || "",
        maxRiskScore: 0
      };
    }
    const entry = ipCorrMap[ip];
    entry.totalHits += c.requestCount || 0;
    entry.deviceCount += 1;
    entry.sources.add(c.sourceTitle);
    entry.apps.add((c.appName || "").split(" \u2022 ")[0].trim());
    if (c.deviceFingerprint) entry.fingerprints.add(c.deviceFingerprint);
    if (c.isOnline) entry.isOnlineAny = true;
    if (c.isGlobalIpBlocked) entry.isGlobalIpBlocked = true;
    if ((c.riskScore || 0) > entry.maxRiskScore) entry.maxRiskScore = c.riskScore || 0;
  });
  const ipCorrelations = Object.values(ipCorrMap).map((e) => ({
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
  })).sort((a, b) => b.sources.length - a.sources.length || b.deviceCount - a.deviceCount || b.totalHits - a.totalHits).slice(0, 30);
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
app.post("/api/intelligence-radar/lookup-ip", async (req, res) => {
  const { ip } = req.body;
  const cleanIp = String(ip || "").replace("::ffff:", "").trim();
  if (!cleanIp) {
    return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0639\u0646\u0648\u0627\u0646 IP \u0635\u0627\u0644\u062D \u0644\u0644\u0641\u062D\u0635" });
  }
  try {
    const geo = await fetchRealIpGeoDetails(cleanIp, true);
    const now = Date.now();
    const blockedRecord = blockedIpsStore.find((b) => b.ip === cleanIp && (!b.expiresAt || b.expiresAt > now)) || null;
    const relatedLogs = securityLogsStore.filter((l) => l.ip === cleanIp).slice(0, 15);
    const seenInSources = [];
    streamsStore.forEach((s) => {
      (s.connectedApps || []).forEach((a) => {
        if (a.ipAddress && a.ipAddress.replace("::ffff:", "").trim() === cleanIp) {
          seenInSources.push({ sourceType: "stream", sourceId: s.id, sourceTitle: s.title, appName: a.appName, requestCount: a.requestCount, lastActive: a.lastActive });
        }
      });
    });
    virtualXtreamStore.forEach((v) => {
      (v.connectedApps || []).forEach((a) => {
        if (a.ipAddress && a.ipAddress.replace("::ffff:", "").trim() === cleanIp) {
          seenInSources.push({ sourceType: "virtual_xtream", sourceId: v.id, sourceTitle: v.title, appName: a.appName, requestCount: a.requestCount, lastActive: a.lastActive });
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
    console.error("IP Lookup error:", err);
    res.status(500).json({ success: false, error: "\u0641\u0634\u0644 \u0641\u062D\u0635 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0640 IP" });
  }
});
app.post("/api/intelligence-radar/dns-intel", async (req, res) => {
  const rawTarget = String(req.body?.target || "").trim();
  if (!rawTarget) {
    return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0639\u0646\u0648\u0627\u0646 IP \u0623\u0648 \u0627\u0633\u0645 \u0646\u0637\u0627\u0642 (Domain) \u0623\u0648 \u0631\u0627\u0628\u0637 \u0628\u062B \u0644\u0644\u0641\u062D\u0635" });
  }
  let host = rawTarget;
  let originalProtocol = "https:";
  try {
    if (rawTarget.includes("://")) {
      const parsed = new URL(rawTarget);
      host = parsed.hostname;
      originalProtocol = parsed.protocol || "https:";
    } else {
      host = rawTarget.split("/")[0].split(":")[0].trim();
    }
  } catch {
    host = rawTarget.split("/")[0].split(":")[0].trim();
  }
  host = host.replace(/^::ffff:/, "").trim();
  if (!host || host.length > 253) {
    return res.status(400).json({ success: false, error: "\u0635\u064A\u063A\u0629 \u0627\u0644\u0647\u062F\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" });
  }
  const isIp = net.isIP(host) !== 0;
  if (isIp) {
    try {
      const [ptrRes, geo] = await Promise.all([
        dns.reverse(host).catch(() => []),
        fetchRealIpGeoDetails(host, true)
      ]);
      return res.json({
        success: true,
        mode: "ip",
        target: host,
        ptrRecords: ptrRes,
        geo
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: "\u062A\u0639\u0630\u0631 \u0625\u062A\u0645\u0627\u0645 \u0641\u062D\u0635 Reverse DNS \u0644\u0644\u0640 IP" });
    }
  }
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host)) {
    return res.status(400).json({ success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0637\u0627\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D (\u0645\u062B\u0627\u0644: example.com \u0623\u0648 8.8.8.8)" });
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
    const aRecords = aRes.status === "fulfilled" ? aRes.value : [];
    const aaaaRecords = aaaaRes.status === "fulfilled" ? aaaaRes.value : [];
    const mxRecords = mxRes.status === "fulfilled" ? mxRes.value.map((m) => `${m.exchange} (pri ${m.priority})`) : [];
    const txtRecords = txtRes.status === "fulfilled" ? txtRes.value.map((t) => t.join("")) : [];
    const nsRecords = nsRes.status === "fulfilled" ? nsRes.value : [];
    const cnameRecords = cnameRes.status === "fulfilled" ? cnameRes.value : [];
    const primaryIp = aRecords[0] || "";
    const [primaryGeo, primaryPtr] = primaryIp ? await Promise.all([
      fetchRealIpGeoDetails(primaryIp, false),
      dns.reverse(primaryIp).catch(() => [])
    ]) : [{}, []];
    let httpHeaders = null;
    let httpStatus = null;
    let finalUrl = null;
    const probeProtocols = originalProtocol === "http:" ? ["http", "https"] : ["https", "http"];
    for (const proto of probeProtocols) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const resp = await fetch(`${proto}://${host}/`, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal
        });
        clearTimeout(timer);
        httpStatus = resp.status;
        finalUrl = resp.url;
        const picked = {};
        const interesting = ["server", "cf-ray", "cf-cache-status", "via", "x-cache", "content-type", "cache-control", "strict-transport-security", "access-control-allow-origin", "x-powered-by"];
        interesting.forEach((h) => {
          const val = resp.headers.get(h);
          if (val) picked[h] = val;
        });
        httpHeaders = picked;
        break;
      } catch {
      }
    }
    const tlsInfo = await new Promise((resolve) => {
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
                  issuer: Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer || void 0,
                  subject: Array.isArray(rawSubject) ? rawSubject[0] : rawSubject || void 0,
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
        socket.on("timeout", () => {
          socket.destroy();
          resolve(null);
        });
        socket.on("error", () => {
          socket.destroy();
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
    res.json({
      success: true,
      mode: "domain",
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
    console.error("DNS Intel error:", err);
    res.status(500).json({ success: false, error: "\u062A\u0639\u0630\u0631 \u0625\u062A\u0645\u0627\u0645 \u062A\u062D\u0644\u064A\u0644 DNS \u0644\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0645\u0637\u0644\u0648\u0628" });
  }
});
app.delete("/api/intelligence-radar/connection", (req, res) => {
  const { sourceType, sourceId, appId } = req.body;
  if (!sourceType || !sourceId || !appId) {
    return res.status(400).json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0646\u0627\u0642\u0635\u0629" });
  }
  if (sourceType === "stream") {
    const stream = streamsStore.find((s) => s.id === sourceId);
    if (stream && stream.connectedApps) {
      stream.connectedApps = stream.connectedApps.filter((a) => a.id !== appId);
      saveStreams(streamsStore);
    }
  } else if (sourceType === "virtual_xtream") {
    const vAcc = virtualXtreamStore.find((v) => v.id === sourceId);
    if (vAcc && vAcc.connectedApps) {
      vAcc.connectedApps = vAcc.connectedApps.filter((a) => a.id !== appId);
      saveVirtualXtream(virtualXtreamStore);
    }
  }
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u062C\u0647\u0627\u0632 \u0628\u0646\u062C\u0627\u062D" });
});
app.delete("/api/intelligence-radar/connections", (req, res) => {
  const mode = req.body && req.body.mode || "all";
  const now = Date.now();
  streamsStore.forEach((stream) => {
    if (stream.connectedApps) {
      stream.connectedApps = mode === "offline_only" ? stream.connectedApps.filter((a) => !a.isBlocked && now - new Date(a.lastActive).getTime() < 25e3) : [];
    }
  });
  saveStreams(streamsStore);
  virtualXtreamStore.forEach((vAcc) => {
    if (vAcc.connectedApps) {
      vAcc.connectedApps = mode === "offline_only" ? vAcc.connectedApps.filter((a) => !a.isBlocked && now - new Date(a.lastActive).getTime() < 25e3) : [];
    }
  });
  saveVirtualXtream(virtualXtreamStore);
  res.json({
    success: true,
    message: mode === "offline_only" ? "\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0642\u062F\u064A\u0645\u0629 \u0645\u0639 \u0625\u0628\u0642\u0627\u0621 \u0627\u0644\u0645\u062A\u0635\u0644\u064A\u0646 \u062D\u0627\u0644\u064A\u0627\u064B" : "\u062A\u0645 \u0645\u0633\u062D \u062C\u0645\u064A\u0639 \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A \u0628\u0646\u062C\u0627\u062D"
  });
});
app.post("/api/intelligence-radar/block", (req, res) => {
  const { sourceType, sourceId, pattern } = req.body;
  const cleanP = (pattern || "").trim().toLowerCase();
  if (sourceType === "stream") {
    const stream = streamsStore.find((s) => s.id === sourceId);
    if (stream) {
      if (!stream.blockedApps) stream.blockedApps = [];
      if (!stream.blockedApps.includes(pattern)) stream.blockedApps.push(pattern);
      if (stream.connectedApps) {
        stream.connectedApps.forEach((a) => {
          if (a.id === pattern || a.ipAddress && a.ipAddress.toLowerCase() === cleanP || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = true;
          }
        });
      }
      saveStreams(streamsStore);
    }
  } else if (sourceType === "virtual_xtream") {
    const vAcc = virtualXtreamStore.find((v) => v.id === sourceId);
    if (vAcc) {
      if (!vAcc.blockedApps) vAcc.blockedApps = [];
      if (!vAcc.blockedApps.includes(pattern)) vAcc.blockedApps.push(pattern);
      if (vAcc.connectedApps) {
        vAcc.connectedApps.forEach((a) => {
          if (a.id === pattern || a.ipAddress && a.ipAddress.toLowerCase() === cleanP || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = true;
          }
        });
      }
      saveVirtualXtream(virtualXtreamStore);
    }
  }
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u062C\u0647\u0627\u0632 \u0641\u0648\u0631\u0627\u064B \u0639\u0628\u0631 \u0627\u0644\u0631\u0627\u062F\u0627\u0631" });
});
app.post("/api/intelligence-radar/unblock", (req, res) => {
  const { sourceType, sourceId, pattern } = req.body;
  const cleanP = (pattern || "").trim().toLowerCase();
  if (sourceType === "stream") {
    const stream = streamsStore.find((s) => s.id === sourceId);
    if (stream) {
      if (stream.blockedApps) {
        stream.blockedApps = stream.blockedApps.filter((p) => p.toLowerCase() !== cleanP);
      }
      if (stream.connectedApps) {
        stream.connectedApps.forEach((a) => {
          if (a.id === pattern || a.ipAddress && a.ipAddress.toLowerCase() === cleanP || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = false;
          }
        });
      }
      saveStreams(streamsStore);
    }
  } else if (sourceType === "virtual_xtream") {
    const vAcc = virtualXtreamStore.find((v) => v.id === sourceId);
    if (vAcc) {
      if (vAcc.blockedApps) {
        vAcc.blockedApps = vAcc.blockedApps.filter((p) => p.toLowerCase() !== cleanP);
      }
      if (vAcc.connectedApps) {
        vAcc.connectedApps.forEach((a) => {
          if (a.id === pattern || a.ipAddress && a.ipAddress.toLowerCase() === cleanP || a.userAgent.toLowerCase().includes(cleanP) || a.appName.toLowerCase().includes(cleanP)) {
            a.isBlocked = false;
          }
        });
      }
      saveVirtualXtream(virtualXtreamStore);
    }
  }
  res.json({ success: true, message: "\u062A\u0645 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062D\u0638\u0631 \u0639\u0646 \u0627\u0644\u062C\u0647\u0627\u0632 \u0628\u0646\u062C\u0627\u062D" });
});
app.get("/api/virtual-xtream", (req, res) => {
  res.json({ success: true, accounts: virtualXtreamStore });
});
app.post("/api/virtual-xtream", (req, res) => {
  const { title, realHost, realUser, realPass, customPosterUrl, customVirtualHost, maxConnections } = req.body;
  if (!realHost || !realUser || !realPass) {
    return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0623\u0635\u0644\u064A\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u060C \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631" });
  }
  const randHash = crypto.randomBytes(4).toString("hex");
  const vUser = `vuser_${randHash}`;
  const vPass = `vpass_${crypto.randomBytes(3).toString("hex")}`;
  let cleanedHost = realHost.trim().replace(/\/$/, "");
  if (!cleanedHost.startsWith("http://") && !cleanedHost.startsWith("https://")) {
    cleanedHost = `http://${cleanedHost}`;
  }
  const rawCustomHost = (customVirtualHost || "").trim();
  let finalCustomVirtualHost = void 0;
  let finalTitle = (title || "\u0633\u064A\u0631\u0641\u0631 \u0627\u0643\u0633\u062A\u0631\u064A\u0645 \u0648\u0647\u0645\u064A \u0645\u062D\u0645\u064A").trim();
  if (rawCustomHost) {
    if (isResolvableDomainOrIp(rawCustomHost)) {
      if (rawCustomHost.startsWith("http://") || rawCustomHost.startsWith("https://")) {
        finalCustomVirtualHost = rawCustomHost.replace(/\/$/, "");
      } else {
        finalCustomVirtualHost = `https://${rawCustomHost.replace(/\/$/, "")}`;
      }
    } else {
      const cleanName = rawCustomHost.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      if (cleanName && (!title || title.includes("\u0627\u0643\u0633\u062A\u0631\u064A\u0645"))) {
        finalTitle = cleanName;
      }
      finalCustomVirtualHost = void 0;
    }
  }
  const newAcc = {
    id: `vx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: finalTitle,
    realHost: cleanedHost,
    realUser: realUser.trim(),
    realPass: realPass.trim(),
    virtualUser: vUser,
    virtualPass: vPass,
    customVirtualHost: finalCustomVirtualHost,
    maxConnections: typeof maxConnections === "number" ? maxConnections : parseInt(maxConnections, 10) || 12,
    status: "active",
    customPosterUrl: (customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg").trim(),
    blockAllExternalApps: false,
    blockedApps: [],
    connectedApps: [],
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  virtualXtreamStore.unshift(newAcc);
  saveVirtualXtream(virtualXtreamStore);
  res.status(201).json({ success: true, account: newAcc });
});
app.patch("/api/virtual-xtream/:id/max-connections", (req, res) => {
  const { id } = req.params;
  const { maxConnections } = req.body;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  acc.maxConnections = typeof maxConnections === "number" ? maxConnections : parseInt(maxConnections, 10) || 12;
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0623\u0642\u0635\u0649 \u0639\u062F\u062F \u0644\u0644\u0645\u062A\u0635\u0644\u064A\u0646 \u0628\u0646\u062C\u0627\u062D", account: acc });
});
app.patch("/api/virtual-xtream/:id/host", (req, res) => {
  const { id } = req.params;
  const { customVirtualHost } = req.body;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  const raw = (customVirtualHost || "").trim();
  if (!raw) {
    acc.customVirtualHost = void 0;
  } else if (isResolvableDomainOrIp(raw)) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      acc.customVirtualHost = raw.replace(/\/$/, "");
    } else {
      acc.customVirtualHost = `https://${raw.replace(/\/$/, "")}`;
    }
  } else {
    const cleanName = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (cleanName) {
      acc.title = cleanName;
    }
    acc.customVirtualHost = void 0;
  }
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0631\u0627\u0628\u0637 \u0627\u0644\u0647\u0648\u0633\u062A \u0627\u0644\u0648\u0647\u0645\u064A \u0628\u0646\u062C\u0627\u062D", account: acc });
});
app.patch("/api/virtual-xtream/:id/title", (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  if (title && title.trim()) {
    acc.title = title.trim();
  }
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0633\u0645 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0628\u0646\u062C\u0627\u062D", account: acc });
});
app.patch("/api/virtual-xtream/:id/toggle", (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  acc.status = acc.status === "active" ? "paused" : "active";
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, status: acc.status, account: acc });
});
app.patch("/api/virtual-xtream/:id/poster", (req, res) => {
  const { id } = req.params;
  const { customPosterUrl } = req.body;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  acc.customPosterUrl = (customPosterUrl || "").trim();
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0635\u0648\u0631\u0629 \u0634\u0627\u0634\u0629 \u0627\u0644\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0645\u062E\u0635\u0635\u0629 \u0628\u0646\u062C\u0627\u062D", account: acc });
});
app.post("/api/virtual-xtream/:id/block-app", (req, res) => {
  const { id } = req.params;
  const { pattern, userAgent, appName } = req.body;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  if (!acc.blockedApps) acc.blockedApps = [];
  const token = (pattern || userAgent || appName || "").trim();
  if (token && !acc.blockedApps.includes(token)) {
    acc.blockedApps.push(token);
  }
  if (acc.connectedApps) {
    acc.connectedApps.forEach((a) => {
      if (a.userAgent.toLowerCase().includes(token.toLowerCase()) || a.appName.toLowerCase().includes(token.toLowerCase())) {
        a.isBlocked = true;
      }
    });
  }
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0648\u0647\u0645\u064A", account: acc });
});
app.patch("/api/virtual-xtream/:id/toggle-block-all", (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  if (!acc) return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  acc.blockAllExternalApps = !acc.blockAllExternalApps;
  acc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, blockAllExternalApps: acc.blockAllExternalApps, account: acc });
});
app.delete("/api/virtual-xtream/:id", (req, res) => {
  const { id } = req.params;
  virtualXtreamStore = virtualXtreamStore.filter((a) => a.id !== id);
  saveVirtualXtream(virtualXtreamStore);
  res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0627\u0643\u0633\u062A\u0631\u064A\u0645 \u0627\u0644\u0648\u0647\u0645\u064A" });
});
app.get("/api/security/firewall", (req, res) => {
  res.json({
    success: true,
    blockedIps: blockedIpsStore,
    logs: securityLogsStore,
    totalBlockedAttacks: securityLogsStore.length
  });
});
app.post("/api/security/block-ip", (req, res) => {
  const { ip, reason } = req.body;
  if (!ip || !ip.trim()) return res.status(400).json({ success: false, error: "\u0639\u0646\u0648\u0627\u0646 IP \u0645\u0641\u0642\u0648\u062F" });
  const targetIp = ip.trim();
  blockIpAddress(targetIp, reason || "\u062D\u0638\u0631 \u064A\u062F\u0648\u064A \u0628\u0648\u0627\u0633\u0637\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0648\u0642\u0639", void 0);
  addSecurityLog(targetIp, "UNAUTHORIZED_ACCESS", "\u062D\u0638\u0631 \u064A\u062F\u0648\u064A \u0628\u0648\u0627\u0633\u0637\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0644\u0648\u062D\u0629");
  res.json({ success: true, message: `\u062A\u0645 \u062D\u0638\u0631 IP (${targetIp}) \u0628\u0646\u062C\u0627\u062D`, blockedIps: blockedIpsStore });
});
app.post("/api/security/unblock-ip", (req, res) => {
  const { ip } = req.body;
  if (!ip || !ip.trim()) return res.status(400).json({ success: false, error: "\u0639\u0646\u0648\u0627\u0646 IP \u0645\u0641\u0642\u0648\u062F" });
  const targetIp = ip.trim();
  blockedIpsStore = blockedIpsStore.filter((b) => b.ip !== targetIp);
  saveBlockedIps(blockedIpsStore);
  res.json({ success: true, message: `\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u0638\u0631 IP (${targetIp}) \u0628\u0646\u062C\u0627\u062D`, blockedIps: blockedIpsStore });
});
app.delete("/api/security/clear-logs", (req, res) => {
  securityLogsStore = [];
  saveSecurityLogs([]);
  res.json({ success: true, message: "\u062A\u0645 \u0645\u0633\u062D \u0633\u062C\u0644 \u0627\u0644\u0647\u062C\u0645\u0627\u062A \u0628\u0646\u062C\u0627\u062D" });
});
app.get("/api/security/policy", (req, res) => {
  res.json({ success: true, policy: securityPolicyStore });
});
app.put("/api/security/policy", (req, res) => {
  const body = req.body || {};
  const nextPolicy = {
    autoBlockVpnProxy: typeof body.autoBlockVpnProxy === "boolean" ? body.autoBlockVpnProxy : securityPolicyStore.autoBlockVpnProxy,
    autoBlockDatacenter: typeof body.autoBlockDatacenter === "boolean" ? body.autoBlockDatacenter : securityPolicyStore.autoBlockDatacenter,
    autoBlockBots: typeof body.autoBlockBots === "boolean" ? body.autoBlockBots : securityPolicyStore.autoBlockBots,
    ddosMaxReqPer10s: Number.isFinite(Number(body.ddosMaxReqPer10s)) ? Math.max(15, Math.min(500, Math.round(Number(body.ddosMaxReqPer10s)))) : securityPolicyStore.ddosMaxReqPer10s,
    ddosBanMinutes: Number.isFinite(Number(body.ddosBanMinutes)) ? Math.max(5, Math.min(10080, Math.round(Number(body.ddosBanMinutes)))) : securityPolicyStore.ddosBanMinutes,
    bruteForceMaxAttempts: Number.isFinite(Number(body.bruteForceMaxAttempts)) ? Math.max(2, Math.min(30, Math.round(Number(body.bruteForceMaxAttempts)))) : securityPolicyStore.bruteForceMaxAttempts,
    bruteForceBanMinutes: Number.isFinite(Number(body.bruteForceBanMinutes)) ? Math.max(5, Math.min(10080, Math.round(Number(body.bruteForceBanMinutes)))) : securityPolicyStore.bruteForceBanMinutes
  };
  securityPolicyStore = nextPolicy;
  saveSecurityPolicy(nextPolicy);
  res.json({ success: true, policy: securityPolicyStore });
});
async function sendPauseSegmentForStream(res, customPosterUrl, streamOrAccId, title) {
  res.setHeader("Content-Type", "video/MP2T");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (customPosterUrl) {
    const tempStream = {
      id: streamOrAccId || "pause_temp",
      slug: streamOrAccId || "pause_temp",
      title: title || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641",
      category: "sports",
      originalUrl: "",
      streamType: "hls",
      status: "paused",
      watermarkText: "\xA9 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629",
      quality: "1080p",
      viewsCount: 0,
      currentViewers: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      customPosterUrl
    };
    try {
      const customTsPath = await getOrGenerateTsSegmentForStream(tempStream);
      if (customTsPath && fs.existsSync(customTsPath)) {
        return res.sendFile(customTsPath);
      }
    } catch {
    }
  }
  const preset1Ts = path.join(UPLOADS_DIR, "preset_poster_1.ts");
  if (fs.existsSync(preset1Ts)) {
    return res.sendFile(preset1Ts);
  }
  return res.status(503).send("Stream Paused");
}
app.get("/api/virtual-xtream/:id/pause-segment.ts", async (req, res) => {
  const { id } = req.params;
  const acc = virtualXtreamStore.find((a) => a.id === id);
  return sendPauseSegmentForStream(res, acc?.customPosterUrl, acc?.id, acc?.title);
});
function isResolvableDomainOrIp(hostStr) {
  if (!hostStr) return false;
  const clean = hostStr.trim().replace(/^https?:\/\//i, "").split("/")[0].split(":")[0];
  if (!clean || !clean.includes(".")) return false;
  const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return domainRegex.test(clean) || ipRegex.test(clean);
}
function getVirtualXtreamHostUrl(vAcc, publicBaseUrl) {
  if (!vAcc || !vAcc.customVirtualHost) {
    return publicBaseUrl;
  }
  const clean = cleanCustomVirtualHost(vAcc.customVirtualHost);
  return clean || publicBaseUrl;
}
function getValidVirtualHost(vAcc, publicBaseUrl) {
  return getVirtualXtreamHostUrl(vAcc, publicBaseUrl);
}
function rewriteXtreamTextResponse(rawText, vAcc, publicBaseUrl) {
  if (!rawText) return rawText;
  let text = rawText;
  const realClean = vAcc.realHost.trim().replace(/\/$/, "");
  const realHostNoProto = realClean.replace(/^https?:\/\//, "");
  const validVirtualHost = getValidVirtualHost(vAcc, publicBaseUrl);
  let pubHost = validVirtualHost;
  let pubHostNoProto = validVirtualHost.replace(/^https?:\/\//, "");
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const realUserEsc = escapeRegex(vAcc.realUser);
  const realPassEsc = escapeRegex(vAcc.realPass);
  const urlRegex = new RegExp(`https?:\\/\\/[^/\\\\s"'\`]+(?:\\/+(live|movie|series))?\\/+${realUserEsc}\\/+${realPassEsc}(?=[/\\\\s"'\`\\?\\&]|$)`, "gi");
  text = text.replace(urlRegex, (match, type) => {
    const streamType = type ? `${type}/` : "";
    return `${pubHost}/${streamType}${vAcc.virtualUser}/${vAcc.virtualPass}`;
  });
  text = text.replaceAll(realClean, pubHost);
  text = text.replaceAll(realHostNoProto, pubHostNoProto);
  text = text.replaceAll(`/live/${vAcc.realUser}/${vAcc.realPass}`, `/live/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/movie/${vAcc.realUser}/${vAcc.realPass}`, `/movie/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/series/${vAcc.realUser}/${vAcc.realPass}`, `/series/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`/${vAcc.realUser}/${vAcc.realPass}/`, `/${vAcc.virtualUser}/${vAcc.virtualPass}/`);
  text = text.replaceAll(`/${vAcc.realUser}/${vAcc.realPass}`, `/${vAcc.virtualUser}/${vAcc.virtualPass}`);
  text = text.replaceAll(`username=${vAcc.realUser}`, `username=${vAcc.virtualUser}`);
  text = text.replaceAll(`password=${vAcc.realPass}`, `password=${vAcc.virtualPass}`);
  return text;
}
function rewriteXtreamJsonResponse(rawData, vAcc, publicBaseUrl, req) {
  if (!rawData) return rawData;
  const jsonStr = JSON.stringify(rawData);
  const rewrittenStr = rewriteXtreamTextResponse(jsonStr, vAcc, publicBaseUrl);
  let parsed;
  try {
    parsed = JSON.parse(rewrittenStr);
  } catch {
    parsed = rawData;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.user_info) {
      parsed.user_info.username = vAcc.virtualUser;
      parsed.user_info.password = vAcc.virtualPass;
      parsed.user_info.auth = 1;
      parsed.user_info.status = "Active";
      if (!parsed.user_info.exp_date) parsed.user_info.exp_date = "1793015082";
      if (!parsed.user_info.is_trial) parsed.user_info.is_trial = "0";
      if (!parsed.user_info.active_cons) parsed.user_info.active_cons = "1";
      if (!parsed.user_info.max_connections) parsed.user_info.max_connections = "100";
      if (!parsed.user_info.allowed_output_formats) parsed.user_info.allowed_output_formats = ["m3u8", "ts", "rtmp"];
    }
    if (parsed.server_info) {
      try {
        const pubUrl = getValidVirtualHost(vAcc, publicBaseUrl);
        const uStr = pubUrl.startsWith("http") ? pubUrl : `https://${pubUrl}`;
        const u = new URL(uStr);
        parsed.server_info.url = u.hostname;
        parsed.server_info.port = u.port || (u.protocol === "https:" ? "443" : "80");
        parsed.server_info.https_port = u.port || "443";
        parsed.server_info.server_protocol = u.protocol.replace(":", "");
        parsed.server_info.url_given = `${pubUrl.replace(/\/$/, "")}/`;
        if (vAcc && vAcc.title) {
          parsed.server_info.server_name = vAcc.title;
          parsed.server_info.name = vAcc.title;
        }
      } catch {
      }
    }
  }
  return parsed;
}
app.all(["/player_api.php", "/api/player_api.php", "/:prefix/player_api.php", "/api/:prefix/player_api.php"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || "").trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || "").trim();
  const action = String(req.query.action || req.body?.action || "").trim();
  const reqCategoryId = String(req.query.category_id || req.body?.category_id || "").trim();
  console.log(`[Virtual Xtream Player API] Request method=${req.method}, user=${username}, action=${action}, category_id=${reqCategoryId}`);
  const clientUA = req.get("user-agent") || "";
  const clientReferer = req.get("referer") || req.get("origin") || "";
  const clientIP = getClientIp(req);
  const vAcc = virtualXtreamStore.find((v) => v.virtualUser === username && v.virtualPass === password);
  if (vAcc) {
    recordSuccessfulLogin(clientIP);
    trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, action ? `player_api:${action}` : "player_api:auth", {
      acceptLanguage: req.get("accept-language") || "",
      forwardedChain: typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : ""
    });
    const isBlocked = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
    const isExceeded = checkExceedsMaxConnections(vAcc, clientUA, clientIP);
    if (vAcc.status === "paused" || isBlocked || isExceeded) {
      if (isExceeded) {
        return res.json({
          user_info: {
            username: vAcc.virtualUser,
            password: vAcc.virtualPass,
            message: `Max Connections Limit Reached (${vAcc.maxConnections || 12} max)`,
            auth: 0,
            status: "MaxConnectionsLimit",
            active_cons: String(getActiveConnectionsCount(vAcc))
          }
        });
      }
      if (action === "get_live_streams") {
        return res.json([{
          num: 1,
          name: "\u26A0\uFE0F \u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 - \u062D\u0645\u0627\u064A\u0629 \u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0627\u0643\u0633\u062A\u0631\u064A\u0645 \u0627\u0644\u0623\u0635\u0644\u064A",
          stream_type: "live",
          stream_id: "paused_notice",
          stream_icon: vAcc.customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
          category_id: "1",
          custom_sid: "",
          tv_archive: 0,
          direct_source: ""
        }]);
      }
      if (action === "get_live_categories") {
        return res.json([{ category_id: "1", category_name: "\u0642\u0646\u0648\u0627\u062A \u0645\u062A\u0648\u0642\u0641\u0629 \u0644\u0644\u062D\u0645\u0627\u064A\u0629", parent_id: 0 }]);
      }
      if (action === "get_vod_categories" || action === "get_series_categories" || action === "get_vod_streams" || action === "get_series") {
        return res.json([]);
      }
      return res.json({
        user_info: {
          username: vAcc.virtualUser,
          password: vAcc.virtualPass,
          message: isBlocked ? "Access Blocked By App Lock" : "Account Paused By Owner",
          auth: 0,
          status: "Disabled",
          active_cons: "0"
        }
      });
    }
    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, "");
      if (!realHost.startsWith("http://") && !realHost.startsWith("https://")) {
        realHost = `http://${realHost}`;
      }
      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      Object.entries(req.body || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      searchParams.set("username", vAcc.realUser);
      searchParams.set("password", vAcc.realPass);
      const targetUrl = `${realHost}/player_api.php?${searchParams.toString()}`;
      console.log(`[Virtual Xtream] Proxying request to real server -> ${realHost}/player_api.php (action: ${action || "auth"})`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12e3);
      let upstreamRes = await fetch(targetUrl, {
        method: "GET",
        headers: getObfuscatedUpstreamHeaders(clientUA),
        signal: controller.signal
      }).catch((err) => {
        console.warn("[Virtual Xtream] Upstream GET player_api fetch error:", err);
        return null;
      });
      if (!upstreamRes || !upstreamRes.ok) {
        console.log(`[Virtual Xtream] Retrying real server with POST method for action=${action || "auth"}...`);
        upstreamRes = await fetch(`${realHost}/player_api.php`, {
          method: "POST",
          headers: {
            ...getObfuscatedUpstreamHeaders(clientUA),
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: searchParams.toString(),
          signal: controller.signal
        }).catch((err) => {
          console.warn("[Virtual Xtream] Upstream POST player_api fetch error:", err);
          return null;
        });
      }
      clearTimeout(timeoutId);
      const publicBaseUrl2 = getPublicBaseUrl(req);
      if (upstreamRes && upstreamRes.ok) {
        const rawText = await upstreamRes.text();
        try {
          const rawData = JSON.parse(rawText);
          if (Array.isArray(rawData)) {
            if (action === "get_live_streams" || !action && rawData.length > 0 && rawData[0].stream_type === "live") {
              const siteStreams = streamsStore.map((s, idx) => ({
                num: rawData.length + idx + 1,
                name: `\u{1F4FA} ${s.title}`,
                stream_type: "live",
                stream_id: s.slug,
                stream_icon: s.customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
                category_id: s.category === "sports" ? "1" : "2",
                added: String(Math.floor(Date.now() / 1e3)),
                custom_sid: "",
                tv_archive: 0,
                direct_source: ""
              }));
              let combinedData = [...rawData, ...siteStreams];
              if (reqCategoryId) {
                const filtered = combinedData.filter((item) => String(item.category_id) === reqCategoryId);
                if (filtered.length > 0) combinedData = filtered;
              }
              const rewrittenData2 = rewriteXtreamJsonResponse(combinedData, vAcc, publicBaseUrl2, req);
              return res.json(rewrittenData2);
            }
            const rewrittenData = rewriteXtreamJsonResponse(rawData, vAcc, publicBaseUrl2, req);
            return res.json(rewrittenData);
          } else if (rawData && typeof rawData === "object") {
            const rewrittenData = rewriteXtreamJsonResponse(rawData, vAcc, publicBaseUrl2, req);
            return res.json(rewrittenData);
          }
        } catch {
          console.warn("[Virtual Xtream] Upstream returned non-JSON text, using fallback handler");
        }
      } else {
        console.warn(`[Virtual Xtream] Upstream server returned error code ${upstreamRes?.status}, using fallback JSON handler`);
      }
    } catch (err) {
      console.error("[Virtual Xtream] Error proxying real Xtream player_api:", err);
    }
  } else if (username || password) {
    const clientIP2 = getClientIp(req);
    recordFailedLogin(clientIP2);
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  let hostname = (req.get("host") || "localhost").split(":")[0];
  let port = "443";
  let protocol = "https";
  try {
    const pubUrl = getValidVirtualHost(vAcc, publicBaseUrl);
    const uStr = pubUrl.startsWith("http") ? pubUrl : `https://${pubUrl}`;
    const u = new URL(uStr);
    hostname = u.hostname;
    port = u.port || (u.protocol === "https:" ? "443" : "80");
    protocol = u.protocol.replace(":", "");
  } catch {
  }
  if (action === "get_live_categories") {
    return res.json([
      { category_id: "1", category_name: "\u0642\u0646\u0648\u0627\u062A \u0631\u064A\u0627\u0636\u064A\u0629 \u062D\u0642\u0648\u0642\u064A\u0629", parent_id: 0 },
      { category_id: "2", category_name: "\u0642\u0646\u0648\u0627\u062A \u0639\u0627\u0645\u0629 \u0648\u0645\u0628\u0627\u0634\u0631\u0629", parent_id: 0 }
    ]);
  }
  if (action === "get_vod_categories" || action === "get_series_categories") {
    return res.json([]);
  }
  if (action === "get_vod_streams" || action === "get_series") {
    return res.json([]);
  }
  if (action === "get_short_epg" || action === "get_simple_data_table" || action === "get_live_epg") {
    return res.json({ epg_listings: [] });
  }
  if (action === "get_vod_info") {
    return res.json({ info: {}, movie_data: {} });
  }
  if (action === "get_series_info") {
    return res.json({ seasons: [], info: {}, episodes: {} });
  }
  if (action === "get_live_streams") {
    let liveList = streamsStore.map((s, idx) => ({
      num: idx + 1,
      name: s.title,
      stream_type: "live",
      stream_id: s.slug,
      stream_icon: s.customPosterUrl || "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
      epg_channel_id: "",
      added: String(Math.floor(Date.now() / 1e3)),
      category_id: s.category === "sports" ? "1" : "2",
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
      tv_archive_duration: 0
    }));
    if (liveList.length === 0) {
      liveList = [
        {
          num: 1,
          name: "\u26BD beIN SPORTS 1 HD - \u0628\u062B \u0645\u0628\u0627\u0634\u0631 \u0645\u062D\u0645\u064A",
          stream_type: "live",
          stream_id: "bein_sports_1",
          stream_icon: "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
          epg_channel_id: "bein1",
          added: String(Math.floor(Date.now() / 1e3)),
          category_id: "1",
          custom_sid: "",
          tv_archive: 0,
          direct_source: "",
          tv_archive_duration: 0
        },
        {
          num: 2,
          name: "\u{1F4FA} \u0642\u0646\u0627\u0629 \u0627\u0644\u0625\u062E\u0628\u0627\u0631\u064A\u0629 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 - \u0628\u062B \u062D\u0642\u0648\u0642\u064A",
          stream_type: "live",
          stream_id: "news_live",
          stream_icon: "https://i.ibb.co/BK7PcpCk/image-a473215.jpg",
          epg_channel_id: "news",
          added: String(Math.floor(Date.now() / 1e3)),
          category_id: "2",
          custom_sid: "",
          tv_archive: 0,
          direct_source: "",
          tv_archive_duration: 0
        }
      ];
    }
    if (reqCategoryId) {
      const filtered = liveList.filter((s) => String(s.category_id) === reqCategoryId);
      if (filtered.length > 0) liveList = filtered;
    }
    return res.json(liveList);
  }
  if (action !== "") {
    return res.json([]);
  }
  return res.json({
    user_info: {
      username: vAcc ? vAcc.virtualUser : username || "xtream_user",
      password: vAcc ? vAcc.virtualPass : password || "xtream_pass",
      message: "Auth Successful",
      auth: 1,
      status: "Active",
      exp_date: "1793015082",
      is_trial: "0",
      active_cons: "1",
      created_at: "1600000000",
      max_connections: "100",
      allowed_output_formats: ["m3u8", "ts"]
    },
    server_info: {
      url: hostname,
      port,
      https_port: "443",
      server_protocol: protocol,
      rtmp_port: "8888",
      timezone: "UTC",
      timestamp_now: Math.floor(Date.now() / 1e3),
      time_now: (/* @__PURE__ */ new Date()).toISOString(),
      url_given: `${publicBaseUrl.replace(/\/$/, "")}/`,
      server_name: vAcc ? vAcc.title : "Virtual Xtream Server",
      name: vAcc ? vAcc.title : "Virtual Xtream Server"
    }
  });
});
app.all(["/get.php", "/api/get.php", "/:prefix/get.php", "/api/:prefix/get.php"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || "").trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || "").trim();
  const vAcc = virtualXtreamStore.find((v) => v.virtualUser === username && v.virtualPass === password);
  if (vAcc) {
    const clientUA = req.get("user-agent") || "";
    const clientReferer = req.get("referer") || req.get("origin") || "";
    const clientIP = getClientIp(req);
    trackVirtualAccountApp(vAcc, clientUA, clientReferer, clientIP, "get.php (M3U)", {
      acceptLanguage: req.get("accept-language") || "",
      forwardedChain: typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : ""
    });
    const isBlocked = checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps);
    const isExceeded = checkExceedsMaxConnections(vAcc, clientUA, clientIP);
    if (vAcc.status === "paused" || isBlocked || isExceeded) {
      res.setHeader("Content-Type", "audio/x-mpegurl");
      const publicBaseUrl2 = getPublicBaseUrl(req);
      const msg = isExceeded ? `\u062A\u062C\u0627\u0648\u0632 \u062D\u062F \u0627\u0644\u0645\u062A\u0635\u0644\u064A\u0646 \u0627\u0644\u0645\u062A\u0632\u0627\u0645\u0646\u064A\u0646 (${vAcc.maxConnections || 12})` : "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0644\u0644\u062D\u0645\u0627\u064A\u0629";
      return res.send(`#EXTM3U
#EXTINF:-1, ${msg}
${publicBaseUrl2}/api/virtual-xtream/${vAcc.id}/pause-segment.ts
`);
    }
    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, "");
      if (!realHost.startsWith("http://") && !realHost.startsWith("https://")) {
        realHost = `http://${realHost}`;
      }
      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      Object.entries(req.body || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      searchParams.set("username", vAcc.realUser);
      searchParams.set("password", vAcc.realPass);
      const upstreamRes = await fetch(`${realHost}/get.php?${searchParams.toString()}`, {
        headers: {
          "User-Agent": clientUA || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send("Failed fetching playlist from real server");
      }
      const m3uText = await upstreamRes.text();
      const publicBaseUrl2 = getPublicBaseUrl(req);
      const textRewritten = rewriteXtreamTextResponse(m3uText, vAcc, publicBaseUrl2);
      const lines = textRewritten.split("\n");
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return trimmed;
        }
        const streamMatch = trimmed.match(/\/(live|movie|series)\/[^\/]+\/[^\/]+\/([^\s]+)/) || trimmed.match(/\/([^\/]+\/[^\/]+)$/) || trimmed.match(/\/([^\/]+)$/);
        let streamPath = "live/" + (streamMatch ? streamMatch[streamMatch.length - 1] : "stream");
        if (streamMatch && streamMatch[1] && streamMatch[2]) {
          streamPath = `${streamMatch[1]}/${streamMatch[2]}`;
        }
        return `${publicBaseUrl2}/${streamPath.startsWith("live/") || streamPath.startsWith("movie/") || streamPath.startsWith("series/") ? "" : "live/"}${vAcc.virtualUser}/${vAcc.virtualPass}/${streamPath.replace(/^(live|movie|series)\//, "")}`;
      });
      res.setHeader("Content-Type", "audio/x-mpegurl");
      res.setHeader("Content-Disposition", 'attachment; filename="virtual_xtream.m3u"');
      return res.send(rewritten.join("\n"));
    } catch (err) {
      return res.status(502).send("Error proxying playlist");
    }
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.setHeader("Content-Disposition", 'attachment; filename="virtual_xtream.m3u"');
  const m3uLines = ["#EXTM3U"];
  if (streamsStore.length > 0) {
    streamsStore.forEach((s) => {
      m3uLines.push(`#EXTINF:-1 tvg-name="${s.title}" tvg-logo="${s.customPosterUrl || ""}" group-title="${s.category}",${s.title}`);
      m3uLines.push(`${publicBaseUrl}/live/${username || "user"}/${password || "pass"}/${s.slug}.m3u8`);
    });
  } else {
    m3uLines.push(`#EXTINF:-1 tvg-name="beIN SPORTS 1 HD" tvg-logo="https://i.ibb.co/BK7PcpCk/image-a473215.jpg" group-title="\u0642\u0646\u0648\u0627\u062A \u0631\u064A\u0627\u0636\u064A\u0629",\u26BD beIN SPORTS 1 HD - \u0628\u062B \u0645\u0628\u0627\u0634\u0631 \u0645\u062D\u0645\u064A`);
    m3uLines.push(`${publicBaseUrl}/live/${username || "user"}/${password || "pass"}/bein_sports_1.m3u8`);
    m3uLines.push(`#EXTINF:-1 tvg-name="News Live" tvg-logo="https://i.ibb.co/BK7PcpCk/image-a473215.jpg" group-title="\u0642\u0646\u0648\u0627\u062A \u0639\u0627\u0645\u0629",\u{1F4FA} \u0642\u0646\u0627\u0629 \u0627\u0644\u0625\u062E\u0628\u0627\u0631\u064A\u0629 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 - \u0628\u062B \u062D\u0642\u0648\u0642\u064A`);
    m3uLines.push(`${publicBaseUrl}/live/${username || "user"}/${password || "pass"}/news_live.m3u8`);
  }
  return res.send(m3uLines.join("\n"));
});
app.all(["/xmltv.php", "/api/xmltv.php", "/:prefix/xmltv.php", "/api/:prefix/xmltv.php"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  const username = String(req.query.username || req.body?.username || req.query.user || req.body?.user || "").trim();
  const password = String(req.query.password || req.body?.password || req.query.pass || req.body?.pass || "").trim();
  const vAcc = virtualXtreamStore.find((v) => v.virtualUser === username && v.virtualPass === password || v.realUser === username && v.realPass === password);
  if (vAcc) {
    try {
      let realHost = vAcc.realHost.trim().replace(/\/$/, "");
      if (!realHost.startsWith("http://") && !realHost.startsWith("https://")) {
        realHost = `http://${realHost}`;
      }
      const searchParams = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      Object.entries(req.body || {}).forEach(([k, v]) => {
        if (typeof v === "string") searchParams.set(k, v);
      });
      searchParams.set("username", vAcc.realUser);
      searchParams.set("password", vAcc.realPass);
      const upstreamRes = await fetch(`${realHost}/xmltv.php?${searchParams.toString()}`, {
        headers: {
          "User-Agent": req.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
        }
      }).catch(() => null);
      if (upstreamRes && upstreamRes.ok) {
        const xmlText = await upstreamRes.text();
        const publicBaseUrl = getPublicBaseUrl(req);
        const rewrittenXml = rewriteXtreamTextResponse(xmlText, vAcc, publicBaseUrl);
        res.setHeader("Content-Type", "text/xml");
        return res.send(rewrittenXml);
      }
    } catch (err) {
      console.error("[Virtual Xtream XMLTV] Error proxying EPG:", err);
    }
  }
  res.setHeader("Content-Type", "text/xml");
  return res.send(`<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="VirtualXtreamEPG"></tv>`);
});
app.get("/api/live-servers", (_req, res) => {
  res.json({
    success: true,
    servers: liveServersStore.map(serializeLiveServer)
  });
});
app.post("/api/live-servers", (req, res) => {
  const body = req.body || {};
  const usedTokens = new Set(liveServersStore.map((s) => s.token));
  let token = "";
  for (let i = 0; i < 20; i++) {
    const candidate = `srv${crypto.randomBytes(3).toString("hex").slice(0, 5)}`;
    if (!usedTokens.has(candidate)) {
      token = candidate;
      break;
    }
  }
  if (!token) token = `srv${Date.now().toString(36)}`;
  const initialSources = [];
  if (body.initialUrl && String(body.initialUrl).trim()) {
    const url = String(body.initialUrl).trim();
    initialSources.push({
      id: `src_${Date.now()}`,
      name: String(body.initialSourceName || "\u0627\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629").trim(),
      url,
      kind: body.initialKind === "video" ? "video" : detectSourceKind(url),
      userAgent: body.userAgent ? String(body.userAgent).trim() : void 0,
      referer: body.referer ? String(body.referer).trim() : void 0
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newServer = {
    id: `lsrv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    token,
    title: String(body.title || "\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631").trim(),
    status: "live",
    activeMode: "source",
    activeSourceId: initialSources[0]?.id || null,
    sources: initialSources,
    switchCount: 1,
    lastSwitchedAt: now,
    createdAt: now,
    updatedAt: now,
    pauseNoticeMessage: String(body.pauseNoticeMessage || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B \u0645\u0646 \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u062D\u0643\u0645").trim(),
    customPosterUrl: String(body.customPosterUrl || "/uploads/preset_poster_1.jpg").trim(),
    viewsCount: 0,
    currentViewers: 0
  };
  liveServersStore.unshift(newServer);
  saveLiveServersNow(liveServersStore);
  if (initialSources[0]?.kind === "video") {
    startVideoLoopPipeline(newServer, initialSources[0]);
  }
  broadcastLiveServerUpdate(newServer);
  res.status(201).json({ success: true, server: serializeLiveServer(newServer) });
});
app.get("/api/live-servers/storage", (_req, res) => {
  try {
    const stat = fs.statfsSync(UPLOADS_DIR);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    let usedUploadBytes = 0;
    try {
      for (const f of fs.readdirSync(UPLOADS_DIR)) {
        if (f.startsWith("srv_vid_")) {
          usedUploadBytes += fs.statSync(path.join(UPLOADS_DIR, f)).size;
        }
      }
    } catch {
    }
    res.json({
      success: true,
      totalBytes,
      freeBytes,
      usedUploadBytes,
      maxSupportedBytes: 1024 * 1024 * 1024 * 1024
      // 1 TB virtual chunk ceiling
    });
  } catch {
    res.json({ success: true, totalBytes: 0, freeBytes: 0, usedUploadBytes: 0, maxSupportedBytes: 1024 * 1024 * 1024 * 1024 });
  }
});
app.post("/api/live-servers/restore", (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.servers) ? req.body.servers : [];
    if (incoming.length === 0) {
      return res.json({ success: true, restored: 0, servers: liveServersStore.map(serializeLiveServer) });
    }
    let restoredCount = 0;
    for (const item of incoming) {
      const sanitized = sanitizeLiveServerItem(item);
      if (!sanitized) continue;
      if (liveServersStore.some((s) => s.id === sanitized.id || s.token === sanitized.token)) continue;
      sanitized.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      liveServersStore.push(sanitized);
      restoredCount += 1;
    }
    if (restoredCount > 0) {
      saveLiveServersNow(liveServersStore);
    }
    return res.json({ success: true, restored: restoredCount, servers: liveServersStore.map(serializeLiveServer) });
  } catch {
    return res.status(500).json({ success: false, error: "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0641\u0631" });
  }
});
app.post("/api/live-servers/upload-video-chunk", express.raw({ type: "*/*", limit: "25mb" }), async (req, res) => {
  try {
    const buf = req.body;
    const rawUploadId = String(req.query.uploadId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const index = Number(req.query.index ?? -1);
    const total = Number(req.query.total ?? 0);
    const rawName = String(req.query.filename || "video.mp4");
    if (!rawUploadId || !Number.isFinite(index) || index < 0 || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0631\u0641\u0639 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629" });
    }
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ success: false, error: "\u0627\u0644\u062C\u0632\u0621 \u0627\u0644\u0645\u0631\u0641\u0648\u0639 \u0641\u0627\u0631\u063A" });
    }
    const extMatch = path.extname(rawName).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const ext = [".mp4", ".mov", ".webm", ".mkv", ".3gp", ".m4v", ".avi", ".ts"].includes(extMatch) ? extMatch : ".mp4";
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
      videoUrl: done ? `/uploads/${fileName}` : void 0
    });
  } catch (err) {
    console.error("Upload video chunk error:", err);
    return res.status(500).json({ success: false, error: "\u0641\u0634\u0644 \u062D\u0641\u0638 \u062C\u0632\u0621 \u0627\u0644\u0641\u064A\u062F\u064A\u0648" });
  }
});
app.post("/api/live-servers/upload-video", express.raw({ type: "*/*", limit: "200mb" }), async (req, res) => {
  try {
    const buf = req.body;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ success: false, error: "\u0645\u0644\u0641 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0641\u0627\u0631\u063A \u0623\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    }
    const rawName = String(req.query.filename || "video.mp4");
    const extMatch = path.extname(rawName).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const ext = [".mp4", ".mov", ".webm", ".mkv", ".3gp", ".m4v", ".avi", ".ts"].includes(extMatch) ? extMatch : ".mp4";
    const fileName = `srv_vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), buf);
    return res.json({ success: true, videoUrl: `/uploads/${fileName}` });
  } catch (err) {
    console.error("Upload server video error:", err);
    return res.status(500).json({ success: false, error: "\u0641\u0634\u0644 \u062D\u0641\u0638 \u0645\u0644\u0641 \u0627\u0644\u0641\u064A\u062F\u064A\u0648" });
  }
});
app.put("/api/live-servers/:id", (req, res) => {
  const srv = liveServersStore.find((s) => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  const body = req.body || {};
  if (body.title !== void 0) srv.title = String(body.title).trim() || srv.title;
  if (body.pauseNoticeMessage !== void 0) srv.pauseNoticeMessage = String(body.pauseNoticeMessage).trim();
  if (body.customPosterUrl !== void 0) srv.customPosterUrl = String(body.customPosterUrl).trim();
  srv.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});
app.post("/api/live-servers/:id/sources", (req, res) => {
  const srv = liveServersStore.find((s) => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  const { name, url, kind, userAgent, referer, activateNow } = req.body || {};
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u062B \u0623\u0648 \u0627\u0644\u0641\u064A\u062F\u064A\u0648" });
  const src = {
    id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || `\u0645\u0635\u062F\u0631 ${srv.sources.length + 1}`).trim(),
    url: cleanUrl,
    kind: kind === "video" ? "video" : kind === "hls" ? "hls" : detectSourceKind(cleanUrl),
    userAgent: userAgent ? String(userAgent).trim() : void 0,
    referer: referer ? String(referer).trim() : void 0
  };
  srv.sources.unshift(src);
  if (activateNow || !srv.activeSourceId) {
    stopLiveServerStudio(srv.id);
    srv.activeMode = "source";
    srv.activeSourceId = src.id;
    srv.status = "live";
    srv.switchCount += 1;
    srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rt = getLiveServerRuntime(srv.id);
    rt.resolvedVariantCache = void 0;
    if (src.kind === "video") {
      startVideoLoopPipeline(srv, src);
    } else {
      stopLiveServerLoop(srv.id);
    }
  }
  srv.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, source: src, server: serializeLiveServer(srv) });
});
app.delete("/api/live-servers/:id/sources/:sourceId", (req, res) => {
  const srv = liveServersStore.find((s) => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  const wasActive = srv.activeSourceId === req.params.sourceId;
  srv.sources = srv.sources.filter((x) => x.id !== req.params.sourceId);
  if (wasActive) {
    stopLiveServerLoop(srv.id);
    srv.activeSourceId = srv.sources[0]?.id || null;
    srv.switchCount += 1;
    srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (srv.sources[0]?.kind === "video" && srv.status === "live") {
      startVideoLoopPipeline(srv, srv.sources[0]);
    }
  }
  srv.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});
app.post("/api/live-servers/:id/switch", async (req, res) => {
  let srv = liveServersStore.find((s) => s.id === req.params.id);
  const { mode, sourceId, url, name, kind, userAgent, referer, fallbackServer } = req.body || {};
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    srv = {
      id: String(fallbackServer.id),
      token: String(fallbackServer.token),
      title: String(fallbackServer.title || "\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631"),
      status: "live",
      activeMode: "source",
      activeSourceId: fallbackServer.activeSourceId || null,
      sources: Array.isArray(fallbackServer.sources) ? fallbackServer.sources : [],
      switchCount: Number(fallbackServer.switchCount) || 1,
      createdAt: String(fallbackServer.createdAt || (/* @__PURE__ */ new Date()).toISOString()),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastSwitchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pauseNoticeMessage: String(fallbackServer.pauseNoticeMessage || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B \u0645\u0646 \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u062D\u0643\u0645"),
      customPosterUrl: String(fallbackServer.customPosterUrl || "/uploads/preset_poster_1.jpg"),
      viewsCount: Number(fallbackServer.viewsCount) || 0,
      currentViewers: 0
    };
    liveServersStore.unshift(srv);
  }
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  const rt = getLiveServerRuntime(srv.id);
  rt.resolvedVariantCache = void 0;
  if (mode === "studio") {
    stopLiveServerLoop(srv.id);
    srv.activeMode = "studio";
    srv.status = "live";
    srv.switchCount += 1;
    srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
    srv.updatedAt = srv.lastSwitchedAt;
    saveLiveServersNow(liveServersStore);
    broadcastLiveServerUpdate(srv);
    return res.json({ success: true, server: serializeLiveServer(srv) });
  }
  let targetSource;
  if (sourceId) {
    targetSource = srv.sources.find((x) => x.id === sourceId);
    if (!targetSource) {
      return res.status(404).json({ success: false, error: "\u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    }
  } else if (url && String(url).trim()) {
    let cleanUrl = String(url).trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://") && !cleanUrl.startsWith("/")) {
      cleanUrl = `https://${cleanUrl}`;
    }
    if (cleanUrl.includes(`/srv/${srv.token}`)) {
      return res.status(400).json({ success: false, error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0648\u0636\u0639 \u0631\u0627\u0628\u0637 \u0646\u0641\u0633 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0643\u0645\u0635\u062F\u0631 \u0644\u0646\u0641\u0633\u0647" });
    }
    const existing = srv.sources.find((x) => x.url === cleanUrl);
    if (existing) {
      targetSource = existing;
      if (name && String(name).trim()) existing.name = String(name).trim();
      if (kind === "video" || kind === "hls") existing.kind = kind;
    } else {
      targetSource = {
        id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: String(name || `\u0628\u062B \u0645\u0628\u0627\u0634\u0631 ${srv.sources.length + 1}`).trim(),
        url: cleanUrl,
        kind: kind === "video" ? "video" : kind === "hls" ? "hls" : detectSourceKind(cleanUrl),
        userAgent: userAgent ? String(userAgent).trim() : void 0,
        referer: referer ? String(referer).trim() : void 0
      };
      srv.sources.unshift(targetSource);
    }
  } else {
    return res.status(400).json({ success: false, error: "\u062D\u062F\u062F \u0645\u0635\u062F\u0631\u0627\u064B \u0623\u0648 \u0623\u062F\u062E\u0644 \u0631\u0627\u0628\u0637\u0627\u064B \u0644\u0644\u062A\u0628\u062F\u064A\u0644" });
  }
  stopLiveServerStudio(srv.id);
  srv.activeMode = "source";
  srv.activeSourceId = targetSource.id;
  srv.status = "live";
  srv.switchCount += 1;
  srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
  srv.updatedAt = srv.lastSwitchedAt;
  if (targetSource.kind === "video") {
    startVideoLoopPipeline(srv, targetSource);
    await waitForLocalHlsPlaylist(rt.loopDir, 1800);
  } else {
    stopLiveServerLoop(srv.id);
  }
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  return res.json({ success: true, server: serializeLiveServer(srv) });
});
app.post("/api/live-servers/:id/studio-start", (req, res) => {
  const { container, hasAudio, fallbackServer } = req.body || {};
  let srv = liveServersStore.find((s) => s.id === req.params.id);
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    const sanitized = sanitizeLiveServerItem(fallbackServer);
    if (sanitized) {
      srv = sanitized;
      liveServersStore.unshift(srv);
    }
  }
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  startLiveServerStudioPipeline(srv, {
    container: container === "mp4" ? "mp4" : "webm",
    hasAudio: hasAudio !== false,
    socketId: null
  });
  return res.json({ success: true, server: serializeLiveServer(srv) });
});
app.post("/api/live-servers/:id/studio-stop", (req, res) => {
  const serverId = req.params.id;
  stopLiveServerStudio(serverId);
  const srv = liveServersStore.find((s) => s.id === serverId);
  if (srv) {
    if (srv.activeSourceId) {
      srv.activeMode = "source";
      const fallbackSrc = srv.sources.find((x) => x.id === srv.activeSourceId);
      if (fallbackSrc?.kind === "video" && srv.status === "live") {
        startVideoLoopPipeline(srv, fallbackSrc);
      }
    }
    srv.switchCount += 1;
    srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
    srv.updatedAt = srv.lastSwitchedAt;
    saveLiveServersNow(liveServersStore);
    broadcastLiveServerUpdate(srv);
  }
  return res.json({ success: true, server: srv ? serializeLiveServer(srv) : null });
});
app.post("/api/live-servers/:id/studio-chunk", express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  const srv = liveServersStore.find((s) => s.id === req.params.id);
  if (!srv) return res.status(404).json({ success: false });
  const rt = liveServerRuntimes.get(srv.id);
  if (!rt || !rt.studioProc || !rt.studioActive) return res.status(409).json({ success: false });
  const buf = req.body;
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
      } catch {
      }
    }
  }
  return res.json({ success: true });
});
app.patch("/api/live-servers/:id/toggle", (req, res) => {
  let srv = liveServersStore.find((s) => s.id === req.params.id);
  const fallbackServer = req.body?.fallbackServer;
  if (!srv && fallbackServer && fallbackServer.id === req.params.id && fallbackServer.token) {
    srv = {
      id: String(fallbackServer.id),
      token: String(fallbackServer.token),
      title: String(fallbackServer.title || "\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631"),
      status: fallbackServer.status === "paused" ? "paused" : "live",
      activeMode: "source",
      activeSourceId: fallbackServer.activeSourceId || null,
      sources: Array.isArray(fallbackServer.sources) ? fallbackServer.sources : [],
      switchCount: Number(fallbackServer.switchCount) || 1,
      createdAt: String(fallbackServer.createdAt || (/* @__PURE__ */ new Date()).toISOString()),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastSwitchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pauseNoticeMessage: String(fallbackServer.pauseNoticeMessage || "\u0627\u0644\u0628\u062B \u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B \u0645\u0646 \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u062D\u0643\u0645"),
      customPosterUrl: String(fallbackServer.customPosterUrl || "/uploads/preset_poster_1.jpg"),
      viewsCount: Number(fallbackServer.viewsCount) || 0,
      currentViewers: 0
    };
    liveServersStore.unshift(srv);
  }
  if (!srv) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  srv.status = srv.status === "live" ? "paused" : "live";
  srv.switchCount += 1;
  srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
  srv.updatedAt = srv.lastSwitchedAt;
  if (srv.status === "paused") {
    stopLiveServerStudio(srv.id);
    stopLiveServerLoop(srv.id);
    if (srv.activeMode === "studio") {
      srv.activeMode = "source";
    }
  } else if (srv.activeMode === "source" && srv.activeSourceId) {
    const src = srv.sources.find((x) => x.id === srv.activeSourceId);
    if (src?.kind === "video") {
      startVideoLoopPipeline(srv, src);
    }
  }
  saveLiveServersNow(liveServersStore);
  broadcastLiveServerUpdate(srv);
  res.json({ success: true, server: serializeLiveServer(srv) });
});
app.delete("/api/live-servers/:id", (req, res) => {
  const id = req.params.id;
  const idx = liveServersStore.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
  stopLiveServerStudio(id);
  stopLiveServerLoop(id);
  liveServerRuntimes.delete(id);
  liveServersStore.splice(idx, 1);
  saveLiveServersNow(liveServersStore);
  if (globalIo) globalIo.emit("live-server:deleted", { id });
  res.json({ success: true });
});
app.get("/srv/:token/lseg/:mode/:segName", (req, res) => {
  const { token, mode, segName } = req.params;
  if (mode !== "studio" && mode !== "loop" || !/^seg\d+\.ts$/.test(segName)) {
    return res.status(400).send("Invalid segment");
  }
  const srv = liveServersStore.find((s) => s.token === token || s.id === token);
  if (!srv) return res.status(404).send("Server not found");
  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get("user-agent") || ""}`;
  rt.activeViewersMap.set(viewerKey, Date.now());
  const dir = mode === "studio" ? rt.studioDir : rt.loopDir;
  const segPath = path.join(dir, segName);
  if (!fs.existsSync(segPath)) {
    return res.status(404).send("Segment not ready");
  }
  applyObfuscatedResponseHeaders(res, "video/MP2T");
  const readStream = fs.createReadStream(segPath);
  readStream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  res.on("close", () => readStream.destroy());
  readStream.pipe(res);
});
app.get("/srv/:token/pause.ts", async (req, res) => {
  const srv = liveServersStore.find((s) => s.token === req.params.token || s.id === req.params.token);
  if (!srv) return res.status(404).send("Server not found");
  return sendPauseSegmentForStream(res, srv.customPosterUrl, srv.id, srv.title);
});
app.get("/srv/:token/standby.ts", (_req, res) => {
  const tsPath = ensureStandbyLoadingTs();
  if (tsPath && fs.existsSync(tsPath)) {
    res.setHeader("Content-Type", "video/MP2T");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.sendFile(tsPath);
  }
  return res.status(503).send("Standby initializing");
});
app.get("/srv/:token/seg", async (req, res) => {
  const srv = liveServersStore.find((s) => s.token === req.params.token || s.id === req.params.token);
  const targetUrl = String(req.query.u || "");
  if (!srv || !targetUrl) return res.status(400).send("Missing URL");
  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get("user-agent") || ""}`;
  rt.activeViewersMap.set(viewerKey, Date.now());
  const activeSrc = srv.sources.find((x) => x.id === srv.activeSourceId);
  const controller = new AbortController();
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
    controller.abort();
  });
  try {
    const connectTimeout = setTimeout(() => controller.abort(), 1e4);
    const upstream = await fetch(targetUrl, {
      headers: {
        ...getObfuscatedUpstreamHeaders(activeSrc?.userAgent, activeSrc?.referer),
        ...req.headers.range ? { Range: String(req.headers.range) } : {}
      },
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(connectTimeout);
    if (clientClosed || res.writableEnded) return;
    if (!upstream || !upstream.ok && upstream.status !== 206) {
      return res.status(upstream?.status || 502).send("Upstream segment unavailable");
    }
    const ct = upstream.headers.get("content-type") || "video/MP2T";
    res.status(upstream.status);
    applyObfuscatedResponseHeaders(res, ct);
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      res.on("close", () => nodeStream.destroy());
      nodeStream.pipe(res);
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch {
    if (!res.headersSent) return res.status(502).send("Segment stream error");
  }
});
app.get(["/srv/:token.m3u8", "/srv/:token"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const rawToken = String(req.params.token || "").replace(/\.m3u8$/i, "");
  const srv = liveServersStore.find((s) => s.token === rawToken || s.id === rawToken);
  if (!srv) {
    return res.status(404).send("#EXTM3U\n#EXT-X-ERROR: LIVE_SERVER_NOT_FOUND");
  }
  const rt = getLiveServerRuntime(srv.id);
  const viewerKey = `${getClientIp(req)}|${req.get("user-agent") || ""}`;
  rt.activeViewersMap.set(viewerKey, Date.now());
  srv.viewsCount = (srv.viewsCount || 0) + 1;
  const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, "");
  if (srv.status === "paused") {
    const pauseSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/pause.ts?e=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 4e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:pause`, [
      { key: `${srv.switchCount}:pause:${bucket}`, extinf: "#EXTINF:4.000,", uri: `${pauseSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:pause:${bucket + 1}`, extinf: "#EXTINF:4.000,", uri: `${pauseSeg}&b=${bucket + 1}` }
    ], 4);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  if (srv.activeMode === "studio") {
    if (rt.studioActive) {
      const localText = await waitForLocalHlsPlaylist(rt.studioDir, 1200);
      if (localText) {
        const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, "studio", srv.switchCount);
        if (parsed.segments.length > 0) {
          const playlist3 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:studio`, parsed.segments, parsed.targetDuration);
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          return res.send(playlist3);
        }
      }
    }
    const standbySeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?wait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:studio-wait`, [
      { key: `${srv.switchCount}:studio-wait:${bucket}`, extinf: "#EXTINF:2.000,", uri: `${standbySeg}&b=${bucket}` },
      { key: `${srv.switchCount}:studio-wait:${bucket + 1}`, extinf: "#EXTINF:2.000,", uri: `${standbySeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  const activeSrc = srv.sources.find((x) => x.id === srv.activeSourceId) || srv.sources[0];
  if (!activeSrc) {
    const standbySeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?empty=1`;
    const bucket = Math.floor(Date.now() / 2e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:empty`, [
      { key: `${srv.switchCount}:empty:${bucket}`, extinf: "#EXTINF:2.000,", uri: `${standbySeg}&b=${bucket}` },
      { key: `${srv.switchCount}:empty:${bucket + 1}`, extinf: "#EXTINF:2.000,", uri: `${standbySeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  if (activeSrc.kind === "video") {
    if (!rt.loopActive || rt.loopSourceUrl !== activeSrc.url) {
      startVideoLoopPipeline(srv, activeSrc);
    }
    const localText = await waitForLocalHlsPlaylist(rt.loopDir, 7500);
    if (localText) {
      const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, "loop", srv.switchCount);
      if (parsed.segments.length > 0) {
        const playlist3 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop`, parsed.segments, parsed.targetDuration);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.send(playlist3);
      }
    }
    const warmSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?loopwait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop-wait`, [
      { key: `${srv.switchCount}:loop-wait:${bucket}`, extinf: "#EXTINF:2.000,", uri: `${warmSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:loop-wait:${bucket + 1}`, extinf: "#EXTINF:2.000,", uri: `${warmSeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  const external = await fetchLiveServerExternalSegments(srv, rt, activeSrc, publicBaseUrl);
  if (external?.autoVideoFallback) {
    activeSrc.kind = "video";
    startVideoLoopPipeline(srv, activeSrc);
    saveLiveServersNow(liveServersStore);
    const localText = await waitForLocalHlsPlaylist(rt.loopDir, 7500);
    if (localText) {
      const parsed = parseLocalFfmpegSegments(localText, publicBaseUrl, srv.token, "loop", srv.switchCount);
      if (parsed.segments.length > 0) {
        const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:loop`, parsed.segments, parsed.targetDuration);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.send(playlist2);
      }
    }
  }
  if (external?.isPausedInternal) {
    const pauseSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/pause.ts?e=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 4e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:pause-int`, [
      { key: `${srv.switchCount}:pause-int:${bucket}`, extinf: "#EXTINF:4.000,", uri: `${pauseSeg}&b=${bucket}` }
    ], 4);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  if (!external || external.segments.length === 0) {
    const waitSeg = `${publicBaseUrl}/srv/${encodeURIComponent(srv.token)}/standby.ts?hlswait=${srv.switchCount}`;
    const bucket = Math.floor(Date.now() / 2e3);
    const playlist2 = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:hls-wait`, [
      { key: `${srv.switchCount}:hls-wait:${bucket}`, extinf: "#EXTINF:2.000,", uri: `${waitSeg}&b=${bucket}` },
      { key: `${srv.switchCount}:hls-wait:${bucket + 1}`, extinf: "#EXTINF:2.000,", uri: `${waitSeg}&b=${bucket + 1}` }
    ], 2);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(playlist2);
  }
  const playlist = buildMonotonicHlsPlaylist(rt, `${srv.switchCount}:hls:${activeSrc.id}`, external.segments, external.targetDuration);
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  return res.send(playlist);
});
app.all([
  "/v/:slug.m3u8",
  "/v/:slug",
  "/m/:slug.m3u8",
  "/m/:slug",
  "/api/stream/:slug/manifest.m3u8",
  "/api/stream/:slug/manifest.m3u8/*",
  "/live/:user/:pass/:slug*",
  "/:prefix/live/:user/:pass/:slug*",
  "/movie/:user/:pass/:slug*",
  "/:prefix/movie/:user/:pass/:slug*",
  "/series/:user/:pass/:slug*",
  "/:prefix/series/:user/:pass/:slug*",
  "/:user/:pass/:slug*"
], async (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  const reqUser = req.params.user;
  const reqPass = req.params.pass;
  let rawSlug = req.params.slug || req.params[0] || "";
  if ((reqUser === "v" || reqUser === "m") && req.path.endsWith("/seg.ts") || reqUser === "srv") {
    return next();
  }
  if (reqUser && reqPass) {
    const vAcc = virtualXtreamStore.find((v) => v.virtualUser === reqUser && v.virtualPass === reqPass);
    if (vAcc) {
      const clientUA2 = req.get("user-agent") || "";
      const clientReferer2 = req.get("referer") || req.get("origin") || "";
      const clientIP2 = getClientIp(req);
      trackVirtualAccountApp(vAcc, clientUA2, clientReferer2, clientIP2, `xtream_stream:${rawSlug || "live"}`, {
        acceptLanguage: req.get("accept-language") || "",
        forwardedChain: typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : ""
      });
      const isBlocked = checkIsBlocked(clientUA2, clientReferer2, clientIP2, vAcc.blockedApps, vAcc.blockAllExternalApps);
      const isExceeded = checkExceedsMaxConnections(vAcc, clientUA2, clientIP2);
      if (vAcc.status === "paused" || isBlocked || isExceeded) {
        if (isBlocked) {
          return res.status(403).send("403 Forbidden - Access Blocked By Virtual Xtream Shield");
        }
        if (req.originalUrl.includes(".ts") || req.path.endsWith(".ts")) {
          return sendPauseSegmentForStream(res, vAcc.customPosterUrl, vAcc.id, vAcc.title);
        }
        const publicBaseUrl = getPublicBaseUrl(req);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXT-X-MEDIA-SEQUENCE:1
#EXTINF:5.000,
${publicBaseUrl}/api/virtual-xtream/${vAcc.id}/pause-segment.ts
`);
      }
      const cleanSlugParam = (rawSlug || "").replace(/\.(m3u8|ts)$/, "");
      const localMatch = streamsStore.find((s) => s.streamToken === cleanSlugParam || s.slug === cleanSlugParam || s.id === cleanSlugParam || s.slug === rawSlug);
      if (localMatch) {
        if (localMatch.status === "paused") {
          return sendPauseSegmentForStream(res, localMatch.customPosterUrl, localMatch.id, localMatch.title);
        }
        const publicBaseUrl = getPublicBaseUrl(req);
        return res.redirect(buildStreamPlayUrl(localMatch, publicBaseUrl));
      }
      if (cleanSlugParam === "bein_sports_1" || cleanSlugParam === "news_live") {
        return sendPauseSegmentForStream(res, vAcc.customPosterUrl, vAcc.id, vAcc.title);
      }
      try {
        let realHost = vAcc.realHost.trim().replace(/\/$/, "");
        if (!realHost.startsWith("http://") && !realHost.startsWith("https://")) {
          realHost = `http://${realHost}`;
        }
        let origPath = req.originalUrl;
        let realPath = origPath.replace(`/live/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/live/${vAcc.realUser}/${vAcc.realPass}`).replace(`/movie/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/movie/${vAcc.realUser}/${vAcc.realPass}`).replace(`/series/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/series/${vAcc.realUser}/${vAcc.realPass}`).replace(`/${vAcc.virtualUser}/${vAcc.virtualPass}`, `/${vAcc.realUser}/${vAcc.realPass}`);
        const realStreamUrl = `${realHost}${realPath}`;
        const needsProxyProtection = vAcc.blockAllExternalApps || vAcc.blockedApps && vAcc.blockedApps.length > 0 || req.query.proxy === "1";
        if (!needsProxyProtection) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.redirect(302, realStreamUrl);
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15e3);
        const upstreamRes = await fetch(realStreamUrl, {
          headers: {
            "User-Agent": clientUA2 || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
          },
          redirect: "follow",
          signal: controller.signal
        }).catch((err) => {
          console.error("[Virtual Xtream Stream Proxy] Error fetching real stream:", err);
          return null;
        });
        clearTimeout(timeoutId);
        if (!upstreamRes || !upstreamRes.ok) {
          console.warn(`[Virtual Xtream Stream Proxy] Upstream returned status ${upstreamRes?.status || 502}`);
          return res.status(upstreamRes?.status || 502).send("Real server stream unreachable");
        }
        const finalUrl = upstreamRes.url || realStreamUrl;
        const contentType = upstreamRes.headers.get("content-type") || "video/MP2T";
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");
        const isM3u = contentType.includes("mpegurl") || contentType.includes("m3u8") || req.originalUrl.includes(".m3u8");
        if (isM3u) {
          const text = await upstreamRes.text();
          if (text.trim().startsWith("#EXTM3U") || isM3u) {
            const publicBaseUrl = getPublicBaseUrl(req);
            const proxyBase = `${publicBaseUrl}/api/proxy-segment?vUser=${encodeURIComponent(vAcc.virtualUser)}&url=`;
            const lastSlashIdx = finalUrl.lastIndexOf("/");
            const baseUrl = lastSlashIdx !== -1 ? finalUrl.substring(0, lastSlashIdx + 1) : finalUrl;
            const lines = text.split("\n");
            const rewritten = lines.map((line) => {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith("#")) return line;
              let resolvedUrl = trimmed;
              if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                try {
                  resolvedUrl = new URL(trimmed, baseUrl).href;
                } catch {
                  resolvedUrl = trimmed;
                }
              }
              return `${proxyBase}${encodeURIComponent(resolvedUrl)}`;
            });
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            return res.send(rewritten.join("\n"));
          }
        }
        if (upstreamRes.body) {
          res.setHeader("Content-Type", contentType);
          if (upstreamRes.headers.get("content-length")) {
            res.setHeader("Content-Length", upstreamRes.headers.get("content-length"));
          }
          Readable.fromWeb(upstreamRes.body).pipe(res);
          return;
        }
        const arrayBuf = await upstreamRes.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        return res.send(Buffer.from(arrayBuf));
      } catch (err) {
        console.error("[Virtual Xtream Stream Proxy] Error proxying real stream:", err);
        return res.status(502).send("Error proxying real Xtream stream");
      }
    }
  }
  if (!rawSlug || rawSlug.startsWith("api") || rawSlug.startsWith("public") || rawSlug.startsWith("assets") || rawSlug.includes(".")) {
    if (rawSlug.endsWith(".m3u8") || rawSlug.endsWith(".ts")) {
      rawSlug = rawSlug.replace(/\.(m3u8|ts)$/, "");
    } else {
      return next();
    }
  }
  const cleanSlug = rawSlug.replace(/\.(m3u8|ts)$/, "");
  const stream = streamsStore.find(
    (s) => s.streamToken === cleanSlug || s.slug === cleanSlug || s.id === cleanSlug || s.slug === rawSlug || s.xtreamStreamId === cleanSlug
  );
  if (!stream) {
    if (req.originalUrl.includes("/live/") || req.originalUrl.includes(".m3u8") || req.path.startsWith("/v/") || req.path.startsWith("/m/")) {
      return res.status(404).send("#EXTM3U\n#EXT-X-ERROR: STREAM_NOT_FOUND");
    }
    return next();
  }
  const clientUA = req.get("user-agent") || "";
  const clientReferer = req.get("referer") || req.get("origin") || "";
  const clientIP = getClientIp(req);
  const acceptLanguage = req.get("accept-language") || "";
  const forwardedChain = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : "";
  const isBlockedApp = checkIsBlocked(
    clientUA,
    clientReferer,
    clientIP,
    stream.blockedApps,
    stream.blockAllExternalApps
  );
  if (isRealExternalViewer(clientIP, clientUA)) {
    if (!stream.connectedApps) stream.connectedApps = [];
    const appName = detectAppName(clientUA, clientReferer);
    const uaKey = clientUA || clientReferer || "unknown-app-client";
    const endpointLabel = `hls:${cleanSlug}`;
    let existingApp = stream.connectedApps.find(
      (a) => a.userAgent === uaKey || a.ipAddress && clientIP && a.ipAddress === clientIP || a.appName === appName && appName !== "\u0645\u0634\u063A\u0644 \u0645\u062C\u0647\u0648\u0644 (\u0628\u062F\u0648\u0646 \u0628\u064A\u0627\u0646\u0627\u062A User-Agent)"
    );
    if (existingApp) {
      existingApp.isBlocked = isBlockedApp;
      updateConnectionInfo(existingApp, clientUA, clientReferer, clientIP, endpointLabel, {
        acceptLanguage,
        forwardedChain
      }).then(() => saveStreams(streamsStore)).catch(() => {
      });
    } else {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newApp = {
        id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userAgent: uaKey,
        appName,
        ipAddress: clientIP,
        osName: detectOsName(clientUA),
        clientType: classifyClientType(clientUA, clientReferer),
        acceptLanguage: acceptLanguage || void 0,
        forwardedChain: forwardedChain || void 0,
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
      }).then(() => saveStreams(streamsStore)).catch(() => {
      });
    }
  }
  if (isBlockedApp) {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Stream-Protection", "APP_ACCESS_BLOCKED");
    saveStreams(streamsStore);
    return res.status(403).send("403 Forbidden - App Stolen Access Blocked By Owner");
  }
  if (stream.status === "paused") {
    if (req.originalUrl.includes(".ts") || req.path.endsWith(".ts")) {
      return sendPauseSegmentForStream(res, stream.customPosterUrl, stream.id, stream.title);
    }
    const publicBaseUrl = getPublicBaseUrl(req);
    const segKey = stream.streamToken || stream.slug;
    const pauseSegUrl = `${publicBaseUrl}/v/${segKey}/seg.ts`;
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Stream-Status", "PAUSED");
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
    const hasBlockingActive = !!(stream.blockAllExternalApps || stream.blockedApps && stream.blockedApps.length > 0);
    const isProxyForced = req.query.proxy === "1";
    const needsProxy = (hasSpecialHeaders || hasBlockingActive || isProxyForced) && (!stream.isBulk || hasSpecialHeaders);
    const isM3u8Request = req.path.endsWith(".m3u8") || stream.streamType === "hls";
    if (!needsProxy && !isM3u8Request && stream.streamType !== "youtube" && stream.streamType !== "twitch" && stream.streamType !== "embed") {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, originalUrl);
    }
    if (stream.streamType === "youtube" || stream.streamType === "twitch" || stream.streamType === "embed") {
      res.setHeader("Content-Type", "text/html");
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
    const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, "");
    const liveManifest = await fetchLiveManifestUncached(stream, publicBaseUrl, needsProxy);
    if (!liveManifest) {
      return res.redirect(originalUrl);
    }
    res.setHeader("Content-Type", liveManifest.contentType);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(liveManifest.text);
  } catch (err) {
    res.redirect(stream.originalUrl);
  }
});
var proxyMetrics = {
  totalRequestsServiced: 0,
  originFetchCount: 0,
  cachedRequestsServiced: 0,
  activeStreamsCount: 0,
  cachedSegmentsCount: 0,
  bandwidthSavedMB: 0
};
function resolveRelativeUrl(rawUrl, baseUrl) {
  if (!rawUrl || rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  try {
    return new URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}
function rewriteTagUriAttributes(line, baseUrl, proxyBase, needsProxy) {
  if (!line.includes('URI="')) return line;
  return line.replace(/URI="([^"]+)"/g, (_match, rawUri) => {
    const resolved = resolveRelativeUrl(rawUri.trim(), baseUrl);
    const finalUri = needsProxy ? `${proxyBase}${encodeURIComponent(resolved)}` : resolved;
    return `URI="${finalUri}"`;
  });
}
async function fetchLiveSubPlaylistUncached(targetUrl, proxyBase, userAgent, referer) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  try {
    const fetchRes = await fetch(targetUrl, {
      headers: getObfuscatedUpstreamHeaders(userAgent, referer),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);
    if (!fetchRes || !fetchRes.ok) return null;
    const text = await fetchRes.text();
    const finalTargetUrl = fetchRes.url || targetUrl;
    const lastSlashIdx = finalTargetUrl.lastIndexOf("/");
    const baseUrl = lastSlashIdx !== -1 ? finalTargetUrl.substring(0, lastSlashIdx + 1) : finalTargetUrl;
    const rewrittenText = text.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteTagUriAttributes(line, baseUrl, proxyBase, true);
      }
      const resolvedUrl = resolveRelativeUrl(trimmed, baseUrl);
      return `${proxyBase}${encodeURIComponent(resolvedUrl)}`;
    }).join("\n");
    return { text: rewrittenText, contentType: "application/vnd.apple.mpegurl" };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
async function fetchLiveManifestUncached(stream, publicBaseUrl, needsProxy) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  try {
    const response = await fetch(stream.originalUrl, {
      headers: getObfuscatedUpstreamHeaders(stream.userAgentHeader, stream.refererHeader),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);
    if (!response || !response.ok) return null;
    const contentType = response.headers.get("content-type") || "application/vnd.apple.mpegurl";
    const text = await response.text();
    const segStreamParam = encodeURIComponent(stream.streamToken || stream.slug);
    const proxyBase = `${publicBaseUrl}/s-seg?s=${segStreamParam}&url=`;
    const finalOriginUrl = response.url || stream.originalUrl;
    const lastSlashIdx = finalOriginUrl.lastIndexOf("/");
    const baseUrl = lastSlashIdx !== -1 ? finalOriginUrl.substring(0, lastSlashIdx + 1) : finalOriginUrl;
    const finalManifestText = text.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteTagUriAttributes(line, baseUrl, proxyBase, needsProxy);
      }
      const resolvedUrl = resolveRelativeUrl(trimmed, baseUrl);
      return needsProxy ? `${proxyBase}${encodeURIComponent(resolvedUrl)}` : resolvedUrl;
    }).join("\n");
    return { text: finalManifestText, contentType };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
setInterval(() => {
  proxyMetrics.cachedSegmentsCount = 0;
  proxyMetrics.activeStreamsCount = streamsStore.filter((s) => s.status === "active").length + virtualXtreamStore.filter((v) => v.status === "active").length;
}, 1e4);
function getObfuscatedUpstreamHeaders(customUA, customReferer) {
  const ua = customUA || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  return {
    "User-Agent": ua,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    ...customReferer ? { "Referer": customReferer } : {}
  };
}
function applyObfuscatedResponseHeaders(res, contentType = "video/MP2T") {
  res.setHeader("Server", "nginx/1.24.0 (Ubuntu)");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
}
app.get("/api/proxy-stats", (req, res) => {
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
app.get(["/api/proxy-segment", "/s-seg"], async (req, res) => {
  const targetUrl = req.query.url;
  const streamSlug = req.query.stream || req.query.s;
  const vUser = req.query.vUser;
  if (!targetUrl) {
    return res.status(400).send("URL query parameter missing");
  }
  const clientUA = req.get("user-agent") || "";
  const clientReferer = req.get("referer") || req.get("origin") || "";
  const clientIP = getClientIp(req);
  let streamUa;
  let streamReferer;
  if (streamSlug) {
    const stream = streamsStore.find((s) => s.streamToken === streamSlug || s.slug === streamSlug || s.id === slugToMatch(streamSlug));
    if (stream) {
      if (checkIsBlocked(clientUA, clientReferer, clientIP, stream.blockedApps, stream.blockAllExternalApps)) {
        return res.status(403).send("403 Forbidden: Stolen App Blocked");
      }
      streamUa = stream.userAgentHeader || void 0;
      streamReferer = stream.refererHeader || void 0;
    }
  }
  if (vUser) {
    const vAcc = virtualXtreamStore.find((v) => v.virtualUser === vUser);
    if (vAcc && checkIsBlocked(clientUA, clientReferer, clientIP, vAcc.blockedApps, vAcc.blockAllExternalApps)) {
      return res.status(403).send("403 Forbidden: Stolen App Blocked");
    }
  }
  const controller = new AbortController();
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
    controller.abort();
  });
  try {
    const isM3u8 = targetUrl.includes(".m3u8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (isM3u8) {
      const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, "");
      const queryParams = [];
      if (streamSlug) queryParams.push(`s=${encodeURIComponent(streamSlug)}`);
      if (vUser) queryParams.push(`vUser=${encodeURIComponent(vUser)}`);
      const queryPrefix = queryParams.length > 0 ? `${queryParams.join("&")}&` : "";
      const proxyBase = `${publicBaseUrl}/s-seg?${queryPrefix}url=`;
      proxyMetrics.totalRequestsServiced += 1;
      proxyMetrics.originFetchCount += 1;
      const freshSub = await fetchLiveSubPlaylistUncached(targetUrl, proxyBase, streamUa || clientUA, streamReferer);
      if (!freshSub) {
        return res.status(502).send("Proxy segment fetch failed");
      }
      applyObfuscatedResponseHeaders(res, freshSub.contentType);
      return res.send(freshSub.text);
    }
    proxyMetrics.totalRequestsServiced += 1;
    proxyMetrics.originFetchCount += 1;
    const connectTimeout = setTimeout(() => controller.abort(), 12e3);
    const fetchHeaders = {
      ...getObfuscatedUpstreamHeaders(streamUa || clientUA, streamReferer),
      ...req.headers.range ? { Range: String(req.headers.range) } : {}
    };
    const fetchRes = await fetch(targetUrl, {
      headers: fetchHeaders,
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(connectTimeout);
    if (clientClosed || res.writableEnded) return;
    if (!fetchRes || !fetchRes.ok && fetchRes.status !== 206) {
      return res.status(fetchRes?.status || 502).send("Proxy TS segment fetch failed");
    }
    const contentType = fetchRes.headers.get("content-type") || "video/MP2T";
    res.status(fetchRes.status);
    applyObfuscatedResponseHeaders(res, contentType);
    if (fetchRes.headers.get("content-length")) {
      res.setHeader("Content-Length", fetchRes.headers.get("content-length"));
    }
    if (fetchRes.headers.get("content-range")) {
      res.setHeader("Content-Range", fetchRes.headers.get("content-range"));
    }
    if (fetchRes.body) {
      const nodeStream = Readable.fromWeb(fetchRes.body);
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      res.on("close", () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
      return;
    }
    const arrayBuf = await fetchRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuf));
  } catch (err) {
    if (!res.headersSent && !clientClosed) {
      res.status(500).send("Proxy segment error");
    }
  }
});
function slugToMatch(slug) {
  return slug;
}
app.get(["/api/stream/:slug/pause-segment.ts", "/api/stream/:slug/pause-slate.ts", "/m/:slug/seg.ts", "/v/:slug/seg.ts"], async (req, res) => {
  const { slug } = req.params;
  const stream = streamsStore.find((s) => s.streamToken === slug || s.slug === slug || s.id === slug);
  if (stream) {
    const clientUA = req.get("user-agent") || "";
    const clientReferer = req.get("referer") || req.get("origin") || "";
    const clientIP = getClientIp(req);
    if (checkIsBlocked(clientUA, clientReferer, clientIP, stream.blockedApps, stream.blockAllExternalApps)) {
      return res.status(403).send("403 Forbidden: Stolen App Blocked");
    }
    if (stream.customPosterUrl) {
      try {
        const customTsPath = await getOrGenerateTsSegmentForStream(stream);
        if (customTsPath && fs.existsSync(customTsPath)) {
          res.setHeader("Content-Type", "video/MP2T");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.sendFile(customTsPath);
        }
      } catch (err) {
        console.error("Failed serving custom poster TS segment:", err);
      }
    }
  }
  const preset1Ts = path.join(UPLOADS_DIR, "preset_poster_1.ts");
  if (fs.existsSync(preset1Ts)) {
    res.setHeader("Content-Type", "video/MP2T");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.sendFile(preset1Ts);
  }
  res.status(503).send("Stream Paused");
});
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: "custom"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      const cleanPath = url.split("?")[0].replace(/^\/+|\/+$/g, "");
      if (url.startsWith("/api") || url.startsWith("/v/") || url.startsWith("/m/") || url.startsWith("/srv/") || url.startsWith("/uploads/") || url.startsWith("/s-seg") || url.includes("/get.php") || url.includes("/player_api.php") || url.includes("/live/") || url.includes("/movie/") || url.includes("/series/")) {
        return next();
      }
      if (cleanPath && !cleanPath.includes(".") && cleanPath !== "uploads" && cleanPath !== "assets") {
        const isVirtualSlug = virtualXtreamStore.some(
          (v) => v.customVirtualHost && cleanCustomVirtualHost(v.customVirtualHost)?.toLowerCase() === cleanPath.toLowerCase()
        );
        if (isVirtualSlug) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title></title></head>
<body style="background-color: #ffffff; margin: 0; padding: 0; height: 100vh;"></body>
</html>`);
        }
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        template = template.replace(/<title>.*?<\/title>/gi, "").replace(/<meta property="og:[^>]*>/gi, "").replace(/<meta name="twitter:[^>]*>/gi, "").replace(/<meta name="description"[^>]*>/gi, "");
        res.status(200).set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
        }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use("/assets", express.static(path.join(distPath, "assets"), { maxAge: "365d", immutable: true }));
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));
    app.use("*", (req, res, next) => {
      const url = req.originalUrl;
      const cleanPath = url.split("?")[0].replace(/^\/+|\/+$/g, "");
      if (url.startsWith("/api") || url.startsWith("/v/") || url.startsWith("/m/") || url.startsWith("/srv/") || url.startsWith("/uploads/") || url.startsWith("/s-seg") || url.includes("/get.php") || url.includes("/player_api.php") || url.includes("/live/") || url.includes("/movie/") || url.includes("/series/")) {
        return res.status(404).send("");
      }
      if (cleanPath && !cleanPath.includes(".") && cleanPath !== "uploads" && cleanPath !== "assets") {
        const isVirtualSlug = virtualXtreamStore.some(
          (v) => v.customVirtualHost && cleanCustomVirtualHost(v.customVirtualHost)?.toLowerCase() === cleanPath.toLowerCase()
        );
        if (isVirtualSlug) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title></title></head>
<body style="background-color: #ffffff; margin: 0; padding: 0; height: 100vh;"></body>
</html>`);
        }
      }
      try {
        let template = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
        template = template.replace(/<title>.*?<\/title>/gi, "").replace(/<meta property="og:[^>]*>/gi, "").replace(/<meta name="twitter:[^>]*>/gi, "").replace(/<meta name="description"[^>]*>/gi, "");
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
        res.send(template);
      } catch {
        res.status(404).send("");
      }
    });
  }
  const httpServer = createServer(app);
  httpServer.keepAliveTimeout = 65e3;
  httpServer.headersTimeout = 66e3;
  httpServer.requestTimeout = 0;
  httpServer.timeout = 0;
  httpServer.on("connection", (socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 3e4);
  });
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 8e6,
    pingTimeout: 6e4,
    pingInterval: 25e3,
    perMessageDeflate: false
  });
  globalIo = io;
  io.on("connection", (socket) => {
    const deviceId = socket.handshake.query.deviceId;
    if (deviceId) {
      socket.join(deviceId);
      console.log(`Device connected to socket: ${deviceId}`);
    }
    socket.on("live-studio:start", (payload) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      let srv = liveServersStore.find((s) => s.id === serverId);
      if (!srv && payload?.fallbackServer && payload.fallbackServer.id === serverId && payload.fallbackServer.token) {
        const sanitized = sanitizeLiveServerItem(payload.fallbackServer);
        if (sanitized) {
          srv = sanitized;
          liveServersStore.unshift(srv);
        }
      }
      if (!srv) return;
      startLiveServerStudioPipeline(srv, {
        container: payload?.container === "mp4" ? "mp4" : "webm",
        hasAudio: payload?.hasAudio !== false,
        socketId: socket.id
      });
      socket.emit("live-studio:started", { serverId: srv.id, token: srv.token });
    });
    socket.on("live-studio:chunk", (payload) => {
      const serverId = payload?.serverId;
      if (!serverId || !payload?.chunk) return;
      const rt = liveServerRuntimes.get(serverId);
      if (!rt || !rt.studioProc || !rt.studioActive) {
        socket.emit("live-studio:need-restart", { serverId });
        return;
      }
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
      } catch {
      }
    });
    socket.on("live-studio:stop", (payload) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      const rt = liveServerRuntimes.get(serverId);
      if (!rt) return;
      stopLiveServerStudio(serverId);
      const srv = liveServersStore.find((s) => s.id === serverId);
      if (srv) {
        if (srv.activeSourceId) {
          srv.activeMode = "source";
          const fallbackSrc = srv.sources.find((x) => x.id === srv.activeSourceId);
          if (fallbackSrc?.kind === "video" && srv.status === "live") {
            startVideoLoopPipeline(srv, fallbackSrc);
          }
        }
        srv.switchCount += 1;
        srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
        srv.updatedAt = srv.lastSwitchedAt;
        saveLiveServersNow(liveServersStore);
        broadcastLiveServerUpdate(srv);
      }
      socket.emit("live-studio:stopped", { serverId });
    });
    socket.on("disconnect", () => {
      for (const [serverId, rt] of liveServerRuntimes.entries()) {
        if (rt.studioSocketId === socket.id && rt.studioActive) {
          if (rt.studioDisconnectTimer) clearTimeout(rt.studioDisconnectTimer);
          rt.studioDisconnectTimer = setTimeout(() => {
            const recentChunkArrived = rt.lastStudioChunkAt && Date.now() - rt.lastStudioChunkAt < 2e4;
            if (!recentChunkArrived && rt.studioSocketId === socket.id && rt.studioActive) {
              stopLiveServerStudio(serverId);
              const srv = liveServersStore.find((s) => s.id === serverId);
              if (srv) {
                if (srv.activeSourceId) {
                  srv.activeMode = "source";
                  const fallbackSrc = srv.sources.find((x) => x.id === srv.activeSourceId);
                  if (fallbackSrc?.kind === "video" && srv.status === "live") {
                    startVideoLoopPipeline(srv, fallbackSrc);
                  }
                }
                srv.switchCount += 1;
                srv.lastSwitchedAt = (/* @__PURE__ */ new Date()).toISOString();
                srv.updatedAt = srv.lastSwitchedAt;
                saveLiveServersNow(liveServersStore);
                broadcastLiveServerUpdate(srv);
              }
            }
          }, 25e3);
        }
      }
    });
  });
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
setupServer();

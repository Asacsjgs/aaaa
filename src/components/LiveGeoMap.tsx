import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus
} from '@vis.gl/react-google-maps';
import {
  Globe,
  Crosshair,
  Radar,
  ShieldBan,
  Unlock,
  Terminal,
  MapPin,
  Layers,
  AlertTriangle,
  Radio,
  Wifi
} from 'lucide-react';
import { IntelligenceConnection } from '../types/stream';

interface LiveGeoMapProps {
  apiKey: string;
  connections: IntelligenceConnection[];
  focusedConnection: IntelligenceConnection | null;
  onSelectFocus: (conn: IntelligenceConnection | null) => void;
  onInspectIp: (ip: string) => void;
  onGlobalBlockIp: (ip: string, reason?: string) => void;
  onGlobalUnblockIp: (ip: string) => void;
}

type MapLayerMode = 'roadmap' | 'hybrid' | 'satellite';

interface AdvancedMarkerWithRefProps {
  conn: IntelligenceConnection;
  isSelected: boolean;
  zIndex: number;
  onMarkerSelect: (conn: IntelligenceConnection, marker: google.maps.marker.AdvancedMarkerElement) => void;
}

const AdvancedMarkerWithRef: React.FC<AdvancedMarkerWithRefProps> = ({
  conn,
  isSelected,
  zIndex,
  onMarkerSelect
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const isDanger = !!(conn.isBlocked || conn.isGlobalIpBlocked || (conn.riskScore || 0) >= 65);
  const isProxy = !!(conn.proxy || conn.hosting);
  const isOnline = !!conn.isOnline;

  const pinBg = isDanger
    ? 'bg-rose-500 border-rose-200 shadow-rose-500/60'
    : isOnline
    ? 'bg-emerald-400 border-emerald-100 shadow-emerald-400/70'
    : isProxy
    ? 'bg-amber-400 border-amber-100 shadow-amber-400/60'
    : 'bg-cyan-400 border-cyan-100 shadow-cyan-400/50';

  const ringColor = isDanger
    ? 'bg-rose-500/40'
    : isOnline
    ? 'bg-emerald-400/45'
    : 'bg-amber-400/35';

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: Number(conn.lat), lng: Number(conn.lon) }}
      zIndex={zIndex}
      title={`${conn.ipAddress || ''} — ${conn.city || conn.country || ''}`}
      onClick={() => {
        if (marker) {
          onMarkerSelect(conn, marker);
        }
      }}
    >
      <div className="relative flex flex-col items-center cursor-pointer group select-none">
        {(isOnline || isSelected || isDanger) && (
          <span
            className={`absolute -top-1.5 w-7 h-7 rounded-full animate-ping pointer-events-none ${ringColor}`}
          />
        )}
        <div
          className={`relative w-4 h-4 rounded-full border-2 shadow-lg transition-transform duration-200 ${pinBg} ${
            isSelected ? 'scale-125 ring-4 ring-white/50' : 'group-hover:scale-125'
          }`}
        />
        {(isOnline || isSelected) && (
          <div className="mt-1 px-2 py-0.5 rounded-md bg-slate-950/90 border border-cyan-400/40 text-white text-[10px] font-bold whitespace-nowrap shadow-md">
            <span>{conn.city || conn.country || conn.ipAddress}</span>
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
};

interface MapControllerProps {
  pinnedConnections: IntelligenceConnection[];
  focusedConnection: IntelligenceConnection | null;
  autoTrackLatest: boolean;
  fitTrigger: number;
  onAutoSelectMarker: (conn: IntelligenceConnection) => void;
}

const MapCameraController: React.FC<MapControllerProps> = ({
  pinnedConnections,
  focusedConnection,
  autoTrackLatest,
  fitTrigger,
  onAutoSelectMarker
}) => {
  const map = useMap();
  const lastTrackedSigRef = useRef<string>('');
  const didInitialFitRef = useRef(false);

  // Smooth pan when user selects a target manually
  useEffect(() => {
    if (!map || !focusedConnection) return;
    if (typeof focusedConnection.lat === 'number' && typeof focusedConnection.lon === 'number') {
      map.panTo({ lat: focusedConnection.lat, lng: focusedConnection.lon });
      const currentZoom = map.getZoom() || 4;
      if (currentZoom < 11) {
        map.setZoom(12);
      }
    }
  }, [map, focusedConnection]);

  // Fit all markers on initial mount or explicit button press
  useEffect(() => {
    if (!map || pinnedConnections.length === 0) return;
    if (didInitialFitRef.current && fitTrigger === 0) return;

    if (pinnedConnections.length === 1) {
      const only = pinnedConnections[0];
      map.panTo({ lat: Number(only.lat), lng: Number(only.lon) });
      map.setZoom(11);
    } else {
      const lats = pinnedConnections.map(c => Number(c.lat));
      const lngs = pinnedConnections.map(c => Number(c.lon));
      map.fitBounds(
        {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lngs),
          west: Math.min(...lngs)
        },
        56
      );
    }
    didInitialFitRef.current = true;
  }, [map, pinnedConnections, fitTrigger]);

  // Auto-fly to newly active live viewer when they open a link
  useEffect(() => {
    if (!map || !autoTrackLatest || pinnedConnections.length === 0) return;
    const newestOnline = pinnedConnections.find(c => c.isOnline) || pinnedConnections[0];
    if (!newestOnline) return;
    const sig = `${newestOnline.sourceId}_${newestOnline.id}_${newestOnline.firstSeen || ''}`;
    if (!lastTrackedSigRef.current) {
      lastTrackedSigRef.current = sig;
      return;
    }
    if (sig !== lastTrackedSigRef.current && newestOnline.isOnline) {
      lastTrackedSigRef.current = sig;
      map.panTo({ lat: Number(newestOnline.lat), lng: Number(newestOnline.lon) });
      map.setZoom(12);
      onAutoSelectMarker(newestOnline);
    }
  }, [map, pinnedConnections, autoTrackLatest, onAutoSelectMarker]);

  return null;
};

interface MapCanvasInnerProps {
  pinnedConnections: IntelligenceConnection[];
  mapType: MapLayerMode;
  focusedConnection: IntelligenceConnection | null;
  autoTrackLatest: boolean;
  fitTrigger: number;
  onSelectFocus: (conn: IntelligenceConnection | null) => void;
  onInspectIp: (ip: string) => void;
  onGlobalBlockIp: (ip: string, reason?: string) => void;
  onGlobalUnblockIp: (ip: string) => void;
}

const MapCanvasInner: React.FC<MapCanvasInnerProps> = ({
  pinnedConnections,
  mapType,
  focusedConnection,
  autoTrackLatest,
  fitTrigger,
  onSelectFocus,
  onInspectIp,
  onGlobalBlockIp,
  onGlobalUnblockIp
}) => {
  const apiStatus = useApiLoadingStatus();
  const [selectedConn, setSelectedConn] = useState<IntelligenceConnection | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [apiStatus]);

  useEffect(() => {
    if (focusedConnection) {
      setSelectedConn(focusedConnection);
    }
  }, [focusedConnection]);

  const handleMarkerSelect = useCallback(
    (conn: IntelligenceConnection, marker: google.maps.marker.AdvancedMarkerElement) => {
      setSelectedConn(conn);
      setSelectedMarker(marker);
      onSelectFocus(conn);
    },
    [onSelectFocus]
  );

  const handleCloseInfo = useCallback(() => {
    setSelectedConn(null);
    setSelectedMarker(null);
    onSelectFocus(null);
  }, [onSelectFocus]);

  // Sort northernmost first so southern pins layer naturally on top
  const sortedPins = useMemo(() => {
    return [...pinnedConnections]
      .sort((a, b) => Number(b.lat) - Number(a.lat))
      .slice(0, 80);
  }, [pinnedConnections]);

  if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="w-full h-[380px] sm:h-[430px] rounded-2xl bg-slate-950 border border-amber-500/30 flex flex-col items-center justify-center p-6 text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-sm font-black text-white">تعذر تحميل طبقة خرائط Google في هذه اللحظة</p>
        <p className="text-xs text-slate-400 max-w-md">
          يرجى التحقق من تفعيل مفتاح Google Maps API أو حصة الاستخدام اليومية في حسابك.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[380px] sm:h-[430px] rounded-2xl overflow-hidden border border-cyan-500/25 bg-[#020617]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        mapTypeId={mapType}
        colorScheme="DARK"
        defaultCenter={{ lat: 31.5, lng: 43.0 }}
        defaultZoom={4}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        <MapCameraController
          pinnedConnections={sortedPins}
          focusedConnection={focusedConnection}
          autoTrackLatest={autoTrackLatest}
          fitTrigger={fitTrigger}
          onAutoSelectMarker={conn => setSelectedConn(conn)}
        />

        {sortedPins.map((conn, idx) => {
          const isSelected =
            selectedConn?.id === conn.id && selectedConn?.sourceId === conn.sourceId;
          const zIndex = isSelected ? 1000 : conn.isOnline ? 500 + idx : idx;
          return (
            <AdvancedMarkerWithRef
              key={`gpin_${conn.sourceId}_${conn.id}`}
              conn={conn}
              isSelected={isSelected}
              zIndex={zIndex}
              onMarkerSelect={handleMarkerSelect}
            />
          );
        })}

        {selectedConn && selectedMarker && (
          <InfoWindow
            anchor={selectedMarker}
            maxWidth={290}
            onCloseClick={handleCloseInfo}
          >
            <div className="p-1 text-right dir-rtl font-['Cairo',sans-serif] space-y-2 text-slate-900">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                <span className="font-mono font-black text-xs text-cyan-700">
                  {selectedConn.ipAddress || 'IP غير متاح'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    selectedConn.isGlobalIpBlocked || selectedConn.isBlocked
                      ? 'bg-rose-100 text-rose-700'
                      : selectedConn.isOnline
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedConn.isGlobalIpBlocked || selectedConn.isBlocked
                    ? 'محظور'
                    : selectedConn.isOnline
                    ? 'متصل الآن'
                    : 'سجل سابق'}
                </span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="font-bold text-slate-900">
                  📍 {selectedConn.city ? `${selectedConn.city}، ` : ''}
                  {selectedConn.regionName ? `${selectedConn.regionName}، ` : ''}
                  {selectedConn.country || 'غير معروف'}
                </div>
                <div className="text-slate-600 truncate">
                  🏢 المزود: {selectedConn.isp || 'غير محدد'}
                </div>
                <div className="text-slate-700 font-semibold truncate">
                  📺 القناة: {selectedConn.sourceTitle}
                </div>
                <div className="text-slate-600">
                  📱 المشغل: {selectedConn.appName} ({selectedConn.osName || '-'})
                </div>
                <div className="text-slate-500 font-mono text-[10px]">
                  Lat: {Number(selectedConn.lat).toFixed(4)} • Lng: {Number(selectedConn.lon).toFixed(4)} • طلبات: {selectedConn.requestCount}
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                {selectedConn.ipAddress && (
                  <button
                    onClick={() => onInspectIp(selectedConn.ipAddress!)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-black transition"
                  >
                    فحص DNS/IP
                  </button>
                )}
                {selectedConn.ipAddress &&
                  (selectedConn.isGlobalIpBlocked ? (
                    <button
                      onClick={() => onGlobalUnblockIp(selectedConn.ipAddress!)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black transition"
                    >
                      فك الحظر
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        onGlobalBlockIp(
                          selectedConn.ipAddress!,
                          `حظر من الخريطة (${selectedConn.city || selectedConn.country || ''})`
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black transition"
                    >
                      حظر IP
                    </button>
                  ))}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Overlay Empty Waiting Indicator if zero pins */}
      {sortedPins.length === 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-center">
          <div className="px-4 py-2 rounded-xl bg-slate-950/90 border border-cyan-500/30 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur-md flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>في انتظار تشغيل أي رابط بث لعرض موقع المشاهد الحقيقي هنا فورياً...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const LiveGeoMap: React.FC<LiveGeoMapProps> = ({
  apiKey,
  connections,
  focusedConnection,
  onSelectFocus,
  onInspectIp,
  onGlobalBlockIp,
  onGlobalUnblockIp
}) => {
  const [mapType, setMapType] = useState<MapLayerMode>('roadmap');
  const [autoTrackLatest, setAutoTrackLatest] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);

  const pinnedConnections = useMemo(() => {
    return connections.filter(
      c =>
        typeof c.lat === 'number' &&
        typeof c.lon === 'number' &&
        !Number.isNaN(c.lat) &&
        !Number.isNaN(c.lon) &&
        !(c.lat === 0 && c.lon === 0)
    );
  }, [connections]);

  const liveOnlinePinned = useMemo(
    () => pinnedConnections.filter(c => c.isOnline).length,
    [pinnedConnections]
  );

  return (
    <div className="bg-[#070d1a] border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 space-y-3">
      {/* Map HUD Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-black text-white">
                خريطة التتبع الجغرافي الحقيقية (Google Maps Live)
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                {liveOnlinePinned} LIVE • {pinnedConnections.length} LOCATED
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              بمجرد تشغيل أي رابط بث أو حساب اكستريم يظهر دبوس موقع المشاهد الحقيقي فوراً على الخريطة
            </p>
          </div>
        </div>

        {/* Layer Switcher + Camera Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
            {[
              { id: 'roadmap' as const, label: 'ليلية' },
              { id: 'hybrid' as const, label: 'هجين' },
              { id: 'satellite' as const, label: 'قمر صناعي' }
            ].map(layer => (
              <button
                key={layer.id}
                onClick={() => setMapType(layer.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                  mapType === layer.id
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {layer.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              onSelectFocus(null);
              setFitTrigger(v => v + 1);
            }}
            disabled={pinnedConnections.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-bold transition disabled:opacity-40"
            title="توسيط الخريطة على جميع المواقع"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>توسيط الكل</span>
          </button>

          <button
            onClick={() => setAutoTrackLatest(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition ${
              autoTrackLatest
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="تحليق تلقائي لموقع أي شخص يشغل الرابط فوراً"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>تتبع تلقائي {autoTrackLatest ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Real Google Map Viewport */}
      {apiKey ? (
        <APIProvider apiKey={apiKey} libraries={['marker']} language="ar">
          <MapCanvasInner
            pinnedConnections={pinnedConnections}
            mapType={mapType}
            focusedConnection={focusedConnection}
            autoTrackLatest={autoTrackLatest}
            fitTrigger={fitTrigger}
            onSelectFocus={onSelectFocus}
            onInspectIp={onInspectIp}
            onGlobalBlockIp={onGlobalBlockIp}
            onGlobalUnblockIp={onGlobalUnblockIp}
          />
        </APIProvider>
      ) : (
        <div className="w-full h-[380px] sm:h-[430px] rounded-2xl bg-[#020617] border border-slate-800 flex flex-col items-center justify-center p-6 text-center gap-3">
          <Radar className="w-10 h-10 text-cyan-400 animate-spin" />
          <p className="text-xs font-bold text-slate-300">جاري تهيئة خريطة Google الحقيقية وتحميل مفتاح الخدمة...</p>
        </div>
      )}

      {/* Live Quick-Jump Strip for Active Locations */}
      {pinnedConnections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-bold flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>أحدث المواقع المرصودة (انقر للتحليق المباشر إلى الموقع على الخريطة):</span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {focusedConnection ? `محدد: ${focusedConnection.ipAddress}` : 'اضغط أي دبوس للتفاصيل'}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {pinnedConnections.slice(0, 12).map(conn => {
              const isSelected =
                focusedConnection?.id === conn.id && focusedConnection?.sourceId === conn.sourceId;
              return (
                <button
                  key={`jump_${conn.sourceId}_${conn.id}`}
                  onClick={() => onSelectFocus(conn)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-right transition ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/15'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      conn.isGlobalIpBlocked || conn.isBlocked
                        ? 'bg-rose-500'
                        : conn.isOnline
                        ? 'bg-emerald-400 animate-pulse'
                        : conn.proxy || conn.hosting
                        ? 'bg-amber-400'
                        : 'bg-cyan-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] font-black truncate max-w-[130px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>{conn.city || conn.country || 'موقع غير محدد'}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                      {conn.ipAddress} • {conn.sourceTitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Selected Viewer Action Strip */}
          {focusedConnection && (
            <div className="p-3 rounded-xl bg-slate-900/95 border border-cyan-500/35 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-cyan-300">{focusedConnection.ipAddress}</span>
                <span className="text-slate-500">•</span>
                <span className="text-white font-bold">
                  {focusedConnection.city ? `${focusedConnection.city}، ` : ''}
                  {focusedConnection.regionName ? `${focusedConnection.regionName}، ` : ''}
                  {focusedConnection.country}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-[11px]">
                  {focusedConnection.isp || 'ISP غير محدد'} — {focusedConnection.appName}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {focusedConnection.ipAddress && (
                  <button
                    onClick={() => onInspectIp(focusedConnection.ipAddress!)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold transition"
                  >
                    <Terminal className="w-3 h-3" />
                    <span>فحص عميق</span>
                  </button>
                )}
                {focusedConnection.ipAddress &&
                  (focusedConnection.isGlobalIpBlocked ? (
                    <button
                      onClick={() => onGlobalUnblockIp(focusedConnection.ipAddress!)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black transition"
                    >
                      <Unlock className="w-3 h-3" />
                      <span>فك الحظر</span>
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        onGlobalBlockIp(
                          focusedConnection.ipAddress!,
                          `حظر من الخريطة (${focusedConnection.city || focusedConnection.country || ''})`
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black transition"
                    >
                      <ShieldBan className="w-3 h-3" />
                      <span>حظر IP</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

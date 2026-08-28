// Direção visual: Cockpit Solar — instrumentação neo-industrial, âmbar solar, telemetria monoespaçada e estado honesto.
// Este arquivo concentra a experiência do cockpit: cada ação deve confirmar intenção e cada falha deve ser acionável.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Compass, Crosshair, LocateFixed, MapPin, Moon, Navigation, Pause, Play, RotateCcw, Search, Settings2, Signal, Sun, X } from "lucide-react";
import { toast } from "sonner";

type Point = { lat: number; lng: number };
type Step = Point & { text: string; distance: number; kind: "depart" | "turn" | "arrive" };
type Mode = "map" | "ar";
type RouteEngine = "local" | "graphhopper" | "valhalla";
type CalibrationState = "uncalibrated" | "calibrating" | "ready";
type OfflineRegion = { id: string; label: string; center: Point; tiles: number; downloaded: number; failed: number; status: "ready" | "partial" | "downloading" | "cancelled"; updatedAt: string };

const TILE_DB = "wayfinder-offline";
const TILE_STORE = "tiles";
const REGION_STORE = "regions";
const readRegions = (): OfflineRegion[] => { try { return JSON.parse(localStorage.getItem("wayfinder-regions") || "[]"); } catch { return []; } };
const tileKey = (z: number, x: number, y: number) => `osm/${z}/${x}/${y}`;
const openOfflineDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
  const request = indexedDB.open(TILE_DB, 2);
  request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(TILE_STORE)) db.createObjectStore(TILE_STORE); if (!db.objectStoreNames.contains(REGION_STORE)) db.createObjectStore(REGION_STORE); };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const saveOfflineTile = async (key: string, blob: Blob) => { const db = await openOfflineDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(TILE_STORE, "readwrite"); tx.objectStore(TILE_STORE).put(blob, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); };
const saveOfflineRegion = async (region: { id: string; label: string; tiles: number; createdAt: string }) => { const db = await openOfflineDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(REGION_STORE, "readwrite"); tx.objectStore(REGION_STORE).put(region, region.id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); };
const tileXY = (lat: number, lng: number, zoom: number) => { const scale = 2 ** zoom; const x = Math.floor(((lng + 180) / 360) * scale); const rad = toRad(lat); const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale); return { x, y }; };
const decodePolyline6 = (encoded: string): Point[] => { let index = 0; let lat = 0; let lng = 0; const points: Point[] = []; const read = () => { let result = 0; let shift = 0; let byte = 0; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); return (result & 1) ? ~(result >> 1) : result >> 1; }; while (index < encoded.length) { lat += read(); lng += read(); points.push({ lat: lat / 1e6, lng: lng / 1e6 }); } return points; };
const normalizeRouteResponse = (payload: any, engine: RouteEngine): ReturnType<typeof makeLocalRoute> | null => {
  const route = engine === "graphhopper" ? payload?.paths?.[0] : payload?.trip;
  if (!route) return null;
  const coordinates = engine === "graphhopper" ? (route.points?.coordinates || []) : (route.legs?.[0]?.shape ? decodePolyline6(route.legs[0].shape).map(point => [point.lng, point.lat]) : []);
  if (coordinates.length < 2) return null;
  const points = coordinates.map((pair: number[]) => ({ lat: Number(pair[1]), lng: Number(pair[0]) }));
  const instructions = engine === "graphhopper" ? (route.instructions || []) : (route.legs?.[0]?.maneuvers || []);
  const steps: Step[] = instructions.map((item: any, index: number) => { const point = points[Math.min(index * Math.max(1, Math.floor(points.length / Math.max(1, instructions.length))), points.length - 1)]; return { ...point, text: item.text || item.instruction || item.verbal_pre_transition_instruction || "Continue pela rota", distance: Number(item.distance || item.length || 0), kind: index === instructions.length - 1 ? "arrive" : index === 0 ? "depart" : "turn" }; });
  return { points, steps: steps.length ? steps : [{ ...points[points.length - 1], text: "Siga a rota calculada", distance: 0, kind: "arrive" }], distance: Number(route.distance || route.summary?.length || 0), duration: Number(route.time ? route.time / 1000 : route.summary?.time || 0) };
};

const FALLBACK_ORIGIN: Point = { lat: -23.55052, lng: -46.6333 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toRad = (n: number) => (n * Math.PI) / 180;
const toDeg = (n: number) => (n * 180) / Math.PI;
const normalizeHeading = (n: number) => (n + 360) % 360;
const circularDelta = (target: number, current: number) => ((target - current + 540) % 360) - 180;
const haversine = (a: Point, b: Point) => {
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat); const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
};
const bearing = (a: Point, b: Point) => normalizeHeading(toDeg(Math.atan2(Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat)), Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng)))));
const formatDistance = (m: number) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
const formatTime = (seconds: number) => { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`; };

function makeLocalRoute(origin: Point, destination: Point): { points: Point[]; steps: Step[]; distance: number; duration: number } {
  const dx = destination.lng - origin.lng; const dy = destination.lat - origin.lat;
  const bend = { lat: origin.lat + dy * 0.42, lng: origin.lng + dx * 0.58 };
  const points = [origin, { lat: origin.lat + dy * 0.18, lng: origin.lng + dx * 0.12 }, bend, { lat: origin.lat + dy * 0.75, lng: origin.lng + dx * 0.88 }, destination];
  const distance = points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0);
  const turnBearing = bearing(points[1], bend);
  const steps: Step[] = [
    { ...points[1], text: "Siga em frente pela rota marcada", distance: haversine(origin, points[1]), kind: "depart" },
    { ...bend, text: turnBearing > 180 ? "Vire à esquerda no próximo cruzamento" : "Vire à direita no próximo cruzamento", distance: haversine(points[1], bend), kind: "turn" },
    { ...points[3], text: "Continue seguindo a faixa âmbar", distance: haversine(bend, points[3]), kind: "turn" },
    { ...destination, text: "Você chegou ao destino", distance: haversine(points[3], destination), kind: "arrive" },
  ];
  return { points, steps, distance, duration: distance / 8.3 };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("map");
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [destinationText, setDestinationText] = useState("");
  const [route, setRoute] = useState<ReturnType<typeof makeLocalRoute> | null>(null);
  const [heading, setHeading] = useState(0);
  const [headingQuality, setHeadingQuality] = useState<"ready" | "waiting" | "unsupported">("waiting");
  const [gpsState, setGpsState] = useState<"waiting" | "ready" | "offline" | "error">("waiting");
  const [cameraState, setCameraState] = useState<"off" | "ready" | "blocked">("off");
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [mapNight, setMapNight] = useState(true);
  const [routeColor, setRouteColor] = useState("#ffb000");
  const [routeWidth, setRouteWidth] = useState(4);
  const [searching, setSearching] = useState(false);
  const [offlineTiles, setOfflineTiles] = useState(() => Number(localStorage.getItem("gps-ar-tiles") || 0));
  const [offlineRegion, setOfflineRegion] = useState(() => localStorage.getItem("gps-ar-region") || "Nenhuma região pré-carregada");
  const [regions, setRegions] = useState<OfflineRegion[]>(readRegions);
  const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
  const [offlineDownloadState, setOfflineDownloadState] = useState<"idle" | "downloading" | "paused" | "done">("idle");
  const [offlineDownloadStats, setOfflineDownloadStats] = useState({ completed: 0, total: 0, failed: 0 });
  const downloadAbort = useRef<AbortController | null>(null);
  const [routeEngine, setRouteEngine] = useState<RouteEngine>(() => (localStorage.getItem("gps-ar-engine") as RouteEngine) || "local");
  const [routingEndpoint, setRoutingEndpoint] = useState(() => localStorage.getItem("gps-ar-endpoint") || "");
  const [calibration, setCalibration] = useState<CalibrationState>(() => (localStorage.getItem("gps-ar-calibration") as CalibrationState) || "uncalibrated");
  const [headingOffset, setHeadingOffset] = useState(() => Number(localStorage.getItem("gps-ar-heading-offset") || 0));
  const [sensorAngles, setSensorAngles] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [simulation, setSimulation] = useState(false);
  const [simulationPaused, setSimulationPaused] = useState(false);
  const [toastMessage, setToastMessage] = useState("Sistema pronto");
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchId = useRef<number | null>(null);
  const smoothHeading = useRef(0);

  const setStatus = useCallback((message: string) => { setToastMessage(message); }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsState("error"); setStatus("GPS indisponível neste navegador"); return; }
    const onPosition = (position: GeolocationPosition) => { setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }); setGpsState(navigator.onLine ? "ready" : "offline"); };
    const onError = () => { setGpsState("error"); setStatus("GPS não respondeu — toque no mapa para definir a origem"); };
    navigator.geolocation.getCurrentPosition(onPosition, onError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
    watchId.current = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 });
    const offline = () => setGpsState("offline"); const online = () => setGpsState(origin ? "ready" : "waiting");
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [origin, setStatus]);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const raw = typeof (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading === "number" ? (event as DeviceOrientationEvent & { webkitCompassHeading: number }).webkitCompassHeading : event.alpha == null ? null : normalizeHeading(360 - event.alpha);
    if (raw == null) return;
    setSensorAngles({ alpha: event.alpha || 0, beta: event.beta || 0, gamma: event.gamma || 0 });
    const delta = circularDelta(raw, smoothHeading.current); smoothHeading.current = normalizeHeading(smoothHeading.current + delta * 0.18); setHeading(normalizeHeading(smoothHeading.current + headingOffset)); setHeadingQuality("ready");
  }, [headingOffset]);

  const startOfflineRegionDownload = async (existing?: OfflineRegion) => {
    const center = existing?.center || origin || FALLBACK_ORIGIN; const regionId = existing?.id || `${center.lat.toFixed(3)}-${center.lng.toFixed(3)}`; const zooms = [14, 15, 16]; const radius = 0.012; const list: { z: number; x: number; y: number }[] = [];

    zooms.forEach(z => { const nw = tileXY(center.lat + radius, center.lng - radius, z); const se = tileXY(center.lat - radius, center.lng + radius, z); for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) list.push({ z, x, y }); });
    const previousCompleted = existing?.downloaded || 0; setOfflineProgress(Math.round((previousCompleted / list.length) * 100)); setOfflineDownloadState("downloading"); setOfflineDownloadStats({ completed: previousCompleted, total: list.length, failed: existing?.failed || 0 }); downloadAbort.current = new AbortController(); let completed = previousCompleted; let failed = existing?.failed || 0;
    for (let index = previousCompleted; index < list.length; index += 1) { if (downloadAbort.current.signal.aborted) { setOfflineDownloadState("paused"); break; } const tile = list[index]; try { const response = await fetch(`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`, { signal: downloadAbort.current.signal }); if (response.ok) await saveOfflineTile(tileKey(tile.z, tile.x, tile.y), await response.blob()); else failed += 1; } catch { failed += 1; } completed += 1; setOfflineProgress(Math.round((completed / list.length) * 100)); setOfflineDownloadStats({ completed, total: list.length, failed }); const liveRegion: OfflineRegion = { id: regionId, label: existing?.label || `Região ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`, center, tiles: list.length, downloaded: completed, failed, status: "downloading", updatedAt: new Date().toISOString() }; setRegions(current => { const next = [...current.filter(region => region.id !== regionId), liveRegion]; localStorage.setItem("wayfinder-regions", JSON.stringify(next)); return next; }); }
    if (!downloadAbort.current.signal.aborted) { const label = existing?.label || `Região ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`; const finalRegion: OfflineRegion = { id: regionId, label, center, tiles: list.length, downloaded: completed, failed, status: failed ? "partial" : "ready", updatedAt: new Date().toISOString() }; setRegions(current => { const next = [...current.filter(region => region.id !== regionId), finalRegion]; localStorage.setItem("wayfinder-regions", JSON.stringify(next)); return next; }); setOfflineDownloadState("done"); setOfflineTiles(previous => previous + Math.max(0, completed - previousCompleted)); setOfflineRegion(label); localStorage.setItem("gps-ar-region", label); localStorage.setItem("gps-ar-tiles", String(offlineTiles + Math.max(0, completed - previousCompleted))); setStatus(failed ? `Região parcial: ${failed} falhas` : `Região salva: ${completed} tiles`); setTimeout(() => setOfflineProgress(null), 1200); }
  };
  const cancelOfflineDownload = () => { downloadAbort.current?.abort(); setStatus("Download pausado — você pode retomar depois"); };
  const removeOfflineRegion = (id: string) => { const next = regions.filter(region => region.id !== id); setRegions(next); localStorage.setItem("wayfinder-regions", JSON.stringify(next)); setStatus("Região removida do catálogo local"); };

  const enableSensors = useCallback(async () => {
    try {
      const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
      if (orientation.requestPermission) { const permission = await orientation.requestPermission(); if (permission !== "granted") throw new Error("Orientação recusada"); }
      window.addEventListener("deviceorientationabsolute", handleOrientation, true); window.addEventListener("deviceorientation", handleOrientation, true); setHeadingQuality("waiting");
      return true;
    } catch { setHeadingQuality("unsupported"); setStatus("Bússola bloqueada — use o botão de calibração do navegador"); return false; }
  }, [handleOrientation, setStatus]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState("blocked"); setStatus("Câmera indisponível neste contexto"); return false; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); } setCameraState("ready"); return true; } catch { setCameraState("blocked"); setStatus("Permita a câmera para entrar no modo AR"); return false; }
  }, [setStatus]);

  const enterAR = async (simulated = false) => { if (!route) { setStatus("Calcule uma rota antes de iniciar o AR"); return; } setSimulation(simulated); setSimulationPaused(false); const sensorOk = simulated ? true : await enableSensors(); const cameraOk = simulated ? true : await startCamera(); if (!cameraOk) return; if (!sensorOk) toast("AR ativo com heading estimado — calibre para maior precisão"); setMode("ar"); setIsNavigating(true); setActiveStep(0); };
  const calibrateHeading = () => { setCalibration("calibrating"); setStatus("Gire o aparelho lentamente para calibrar"); window.setTimeout(() => { const offset = normalizeHeading(-smoothHeading.current); setHeadingOffset(offset); localStorage.setItem("gps-ar-heading-offset", String(offset)); localStorage.setItem("gps-ar-calibration", "ready"); setCalibration("ready"); setStatus("Bússola calibrada e offset salvo"); }, 2200); };
  const exitAR = () => { setMode("map"); setIsNavigating(false); setSimulation(false); setSimulationPaused(false); const stream = videoRef.current?.srcObject as MediaStream | null; stream?.getTracks().forEach(track => track.stop()); if (videoRef.current) videoRef.current.srcObject = null; };

  const handleMapTap = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height;
    const base = origin || FALLBACK_ORIGIN; const destinationPoint = { lat: base.lat + (0.018 - y * 0.036), lng: base.lng + (x - 0.5) * 0.05 };
    setDestination(destinationPoint); setDestinationText("Ponto marcado no mapa"); setRoute(null); setStatus("Destino fixado — pronto para calcular");
  };

  const searchDestination = async () => {
    if (!destinationText.trim()) return; setSearching(true);
    if (!navigator.onLine) { setSearching(false); setStatus("Sem rede: toque diretamente no mapa para uma rota local"); return; }
    try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=pt-BR&q=${encodeURIComponent(destinationText)}`, { headers: { Accept: "application/json" } }); const data = await response.json(); if (!data[0]) throw new Error(); setDestination({ lat: Number(data[0].lat), lng: Number(data[0].lon) }); setStatus("Destino encontrado — confirme calculando a rota"); } catch { setStatus("Endereço não encontrado — escolha um ponto no mapa"); } finally { setSearching(false); }
  };

  const calculateRoute = async () => { const start = origin || FALLBACK_ORIGIN; const end = destination; if (!end) { setStatus("Escolha um endereço ou toque no mapa"); return; } setOrigin(start); if (routeEngine !== "local" && routingEndpoint.trim()) { try { const query = routeEngine === "graphhopper" ? `${routingEndpoint}?point=${start.lat},${start.lng}&point=${end.lat},${end.lng}&points_encoded=false&instructions=true` : `${routingEndpoint}`; const response = await fetch(query, { method: routeEngine === "valhalla" ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: routeEngine === "valhalla" ? JSON.stringify({ locations: [{ lat: start.lat, lon: start.lng }, { lat: end.lat, lon: end.lng }], costing: "auto", directions_options: { units: "kilometers" } }) : undefined }); const normalized = normalizeRouteResponse(await response.json(), routeEngine); if (normalized) { setRoute(normalized); setActiveStep(0); setStatus(`${routeEngine === "graphhopper" ? "GraphHopper" : "Valhalla"} calculou a rota`); return; } } catch { setStatus("Motor offline indisponível — usando fallback local"); } } const nextRoute = makeLocalRoute(start, end); setRoute(nextRoute); setActiveStep(0); setStatus(navigator.onLine ? "Fallback local pronto — configure um motor offline para ruas reais" : "Rota offline demonstrativa pronta"); };
  const routeDistance = route && origin ? haversine(origin, destination || origin) : 0;
  const currentTarget = route?.steps[Math.min(activeStep, route.steps.length - 1)];
  const relativeBearing = currentTarget ? circularDelta(bearing(origin || FALLBACK_ORIGIN, currentTarget), heading) : 0;
  const remaining = route ? route.steps.slice(activeStep).reduce((sum, step) => sum + step.distance, 0) : 0;

  useEffect(() => { if (!isNavigating || !origin || !currentTarget) return; if (haversine(origin, currentTarget) < 18 && activeStep < (route?.steps.length || 1) - 1) setActiveStep(step => step + 1); }, [origin, currentTarget, activeStep, isNavigating, route]);
  useEffect(() => { if (!simulation || simulationPaused || !route || !isNavigating) return; const timer = window.setInterval(() => setActiveStep(step => step < route.steps.length - 1 ? step + 1 : step), 2400); return () => window.clearInterval(timer); }, [simulation, simulationPaused, route, isNavigating]);

  const statusLabel = gpsState === "ready" ? "GPS confirmado" : gpsState === "offline" ? "GPS · offline" : gpsState === "error" ? "GPS indisponível" : "Localizando";
  const markerStyle = useMemo(() => ({ left: `${destination ? clamp(50 + (destination.lng - (origin || FALLBACK_ORIGIN).lng) * 8000, 12, 88) : 68}%`, top: `${destination ? clamp(50 - (destination.lat - (origin || FALLBACK_ORIGIN).lat) * 8000, 18, 80) : 34}%` }), [destination, origin]);

  return <main className={`app-shell ${mapNight ? "night" : "day"}`}>
    <video ref={videoRef} className="ar-video" playsInline muted aria-hidden="true" />
    <section className={`map-stage ${mode === "ar" ? "is-hidden" : ""}`} onClick={handleMapTap} aria-label="Mapa interativo, toque para fixar um destino">
      <div className="map-texture" /><div className="map-grid" /><div className="road road-a" /><div className="road road-b" /><div className="road road-c" />
      {route && <svg className="route-line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={route.points.map((point, i) => `${i === 0 ? 50 : clamp(50 + (point.lng - (origin || FALLBACK_ORIGIN).lng) * 8000, 10, 90)},${i === 0 ? 54 : clamp(50 - (point.lat - (origin || FALLBACK_ORIGIN).lat) * 8000, 12, 88)}`).join(" ")} fill="none" stroke={routeColor} strokeWidth={routeWidth / 2} strokeLinecap="round" strokeLinejoin="round" /></svg>}
      <div className="map-label label-one">AV. PAULISTA</div><div className="map-label label-two">R. AUGUSTA</div><div className="map-label label-three">CENTRO · SP</div>
      <div className="user-marker"><span /><i>▴</i><b>VOCÊ</b></div>{destination && <div className="destination-marker" style={markerStyle}><MapPin size={18} /><span>DESTINO</span></div>}
    </section>

    {mode === "ar" && <section className="ar-stage" aria-label="Modo de navegação em realidade aumentada"><div className="ar-vignette" /><div className="ar-horizon" /><div className="ar-crosshair"><Crosshair size={22} /><span>ALINHE O HORIZONTE</span></div><div className="ar-guide" style={{ transform: `translateX(-50%) rotate(${relativeBearing * 0.55}deg)` }}><div className="guide-ring" /><Navigation size={82} fill={routeColor} color={routeColor} strokeWidth={1.4} /></div><div className="ar-road-glow" style={{ background: `linear-gradient(90deg, transparent, ${routeColor}55, transparent)` }} /><div className="ar-caption">{cameraState === "ready" ? "CÂMERA ATIVA · ROTA EM FOCO" : "CÂMERA INDISPONÍVEL"}</div></section>}

    <header className="topbar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /></div><div><strong>WAYFINDER</strong><span>OFFLINE AR NAVIGATION</span></div></div><div className="telemetry"><div className="status-pill"><span className={`status-dot ${gpsState === "ready" ? "on" : gpsState === "offline" ? "warn" : ""}`} />{statusLabel}</div><div className="telemetry-chip mono"><Compass size={14} /> {Math.round(heading).toString().padStart(3, "0")}°</div><button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Abrir configurações"><Settings2 size={18} /></button></div></header>

    <div className="left-rail"><div className="rail-tag">{mode === "ar" ? "AR / LIVE" : "MAP / LOCAL"}</div><div className="rail-line" /><div className="rail-coordinate mono">{(origin || FALLBACK_ORIGIN).lat.toFixed(4)}<br />{(origin || FALLBACK_ORIGIN).lng.toFixed(4)}</div></div>

    {mode === "ar" && <button className="exit-ar icon-button" onClick={exitAR} aria-label="Sair do modo AR"><X size={20} /></button>}
    {mode === "map" && <button className="recenter icon-button" onClick={() => { if (!origin) { setOrigin(FALLBACK_ORIGIN); setStatus("Posição de demonstração ativada"); } else setStatus("Mapa centralizado na sua posição"); }} aria-label="Recentralizar mapa"><LocateFixed size={19} /></button>}

    <section className={`command-deck ${mode === "ar" ? "ar-deck" : ""}`}>
      <div className="deck-topline"><span className="mono">{mode === "ar" ? "NAVEGAÇÃO ATIVA" : "PLANEJAR TRAJETO"}</span><span className="deck-separator" /><span className="mono">{navigator.onLine ? "LINK ONLINE" : "CACHE LOCAL"}</span><span className="deck-separator" /><span className="mono">{route ? "ROTA CONFIRMADA" : "AGUARDANDO DESTINO"}</span></div>
      {mode === "map" ? <><div className="search-row"><div className="search-field"><Search size={17} /><input value={destinationText} onChange={event => setDestinationText(event.target.value)} onKeyDown={event => event.key === "Enter" && searchDestination()} placeholder="Endereço ou toque no mapa" aria-label="Destino" /><button onClick={searchDestination} disabled={searching} aria-label="Buscar destino">{searching ? "…" : "↵"}</button></div></div><div className="route-summary"><div><span className="summary-label">DESTINO</span><strong>{destinationText || "Nenhum destino fixado"}</strong></div>{route && <div className="summary-metric"><strong>{formatDistance(route.distance)}</strong><span>rota · {formatTime(route.duration)}</span></div>}</div><div className="action-row"><button className="primary-button" onClick={calculateRoute}><Navigation size={17} /> {route ? "Recalcular rota" : "Fixar e calcular"}</button><button className="secondary-button" onClick={() => setShowSettings(true)} aria-label="Configurações"><Settings2 size={18} /></button>{route && <><button className="start-button" onClick={() => enterAR(false)}><Play size={17} fill="currentColor" /> Iniciar AR</button><button className="secondary-button" onClick={() => enterAR(true)} title="Abrir simulação sem câmera"><RotateCcw size={17} /></button></>}</div></> : <><div className="active-instruction"><div className="instruction-icon" style={{ color: routeColor }}><Navigation size={26} fill="currentColor" /></div><div><span className="summary-label">PRÓXIMA INSTRUÇÃO · {formatDistance(currentTarget?.distance || 0)}</span><strong>{currentTarget?.text || "Siga a faixa de rota"}</strong></div></div><div className="ar-metrics"><div><strong>{formatDistance(remaining)}</strong><span>restante</span></div><div><strong>{formatTime(remaining / 8.3)}</strong><span>chegada estimada</span></div><button className="stop-button" onClick={exitAR}><Pause size={16} /> Pausar</button></div></>}
      <div className="deck-footer"><span><Signal size={13} /> {cameraState === "ready" ? "CÂMERA OK" : "CÂMERA EM ESPERA"}</span><span><Compass size={13} /> {headingQuality === "ready" ? "HEADING ESTÁVEL" : "CALIBRANDO"}</span><span><MapPin size={13} /> {offlineTiles} TILES</span></div>
    </section>

    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><aside className="settings-panel" onClick={event => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">SISTEMA</span><h2>Configurações</h2></div><button className="icon-button" onClick={() => setShowSettings(false)} aria-label="Fechar"><X size={18} /></button></div><label>Cor da faixa <input type="color" value={routeColor} onChange={event => setRouteColor(event.target.value)} /></label><label>Largura da rota <input type="range" min="2" max="8" value={routeWidth} onChange={event => setRouteWidth(Number(event.target.value))} /></label><label>Mapa<select value={mapNight ? "night" : "day"} onChange={event => setMapNight(event.target.value === "night")}><option value="night">Noite — contraste alto</option><option value="day">Dia — leitura aberta</option></select></label><div className="setting-row"><div><span className="summary-label">CACHE OFFLINE</span><strong>{offlineRegion}</strong><small>{offlineTiles} tiles persistidos</small></div><button className="secondary-button" onClick={() => startOfflineRegionDownload()} disabled={offlineProgress !== null}>{offlineProgress === null ? "Pré-carregar" : `${offlineProgress}%`}</button></div>{offlineProgress !== null && <div className="download-progress"><span style={{ width: `${offlineProgress}%` }} /></div>}{offlineDownloadStats.total > 0 && <div className="download-diagnostics mono">{offlineDownloadState === "paused" ? "PAUSADO" : offlineDownloadState === "done" ? "CONCLUÍDO" : "BAIXANDO"} · {offlineDownloadStats.completed}/{offlineDownloadStats.total} · {offlineDownloadStats.failed} falhas {offlineDownloadState === "paused" && <button className="inline-link" onClick={() => { const last = regions.find(region => region.status === "downloading" || region.status === "partial"); if (last) startOfflineRegionDownload(last); }}>retomar</button>}</div>}{regions.length > 0 && <div className="region-list"><span className="summary-label">REGIÕES NO APARELHO</span>{regions.map(region => <div className="region-item" key={region.id}><div><strong>{region.label}</strong><small>{region.downloaded}/{region.tiles} tiles · {region.failed ? `${region.failed} falhas` : region.status === "ready" ? "pronta" : region.status}</small></div><div className="region-actions"><button className="inline-link" onClick={() => startOfflineRegionDownload(region)}>retomar</button><button className="inline-danger" onClick={() => removeOfflineRegion(region.id)}>remover</button></div></div>)}</div>}<label>Motor de rota<select value={routeEngine} onChange={event => { const next = event.target.value as RouteEngine; setRouteEngine(next); localStorage.setItem("gps-ar-engine", next); }}><option value="local">Fallback local (demo)</option><option value="graphhopper">GraphHopper self-hosted</option><option value="valhalla">Valhalla self-hosted</option></select></label>{routeEngine !== "local" && <><label>Endpoint do motor<input className="endpoint-input" value={routingEndpoint} onChange={event => { setRoutingEndpoint(event.target.value); localStorage.setItem("gps-ar-endpoint", event.target.value); }} placeholder={routeEngine === "graphhopper" ? "https://host/route" : "https://host/route"} /></label><p className="settings-note compact">O endpoint deve estar acessível pelo navegador e permitir CORS. GraphHopper espera points_encoded=false; Valhalla recebe POST JSON.</p></>}<div className="calibration-card"><div><span className="summary-label">BÚSSOLA</span><strong>{calibration === "ready" ? "CALIBRADA" : calibration === "calibrating" ? "GIRANDO…" : "NÃO CALIBRADA"}</strong><small>offset {Math.round(headingOffset)}° · heading {Math.round(heading)}°</small></div><button className="secondary-button" onClick={calibrateHeading} disabled={calibration === "calibrating"}>{calibration === "calibrating" ? "Aguarde" : "Calibrar"}</button></div><div className="sensor-readout"><span className="summary-label">LEITURA BRUTA · α / β / γ</span><strong className="mono">{Math.round(sensorAngles.alpha)}° / {Math.round(sensorAngles.beta)}° / {Math.round(sensorAngles.gamma)}°</strong></div><p className="settings-note">Regiões usam IndexedDB e são mantidas no aparelho. Rotas locais são fallback demonstrativo; para ruas reais, configure um motor offline.</p><button className="primary-button full" onClick={() => enterAR(true)}> <Play size={16} fill="currentColor" /> Abrir laboratório de simulação</button></aside></div>}
    <div className="toast-status"><span className="status-dot on" />{toastMessage}</div>
  </main>;
}

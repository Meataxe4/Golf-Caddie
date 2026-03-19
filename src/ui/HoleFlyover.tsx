import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HoleLayout, ShotRecommendation, PlayerProfile, GPSCoordinate, ClubProfile } from '../models/types';
import type { DistanceUnit } from '../utils/units';
import { convertDistance, distanceAbbrev } from '../utils/units';

interface Props {
  hole: HoleLayout;
  currentHole: number;
  recommendation: ShotRecommendation | null;
  player: PlayerProfile;
  selectedClub?: string;
  gpsPosition?: GPSCoordinate | null;
  gpsAccuracy?: number | null;
  distanceToPin?: number | null;
  unit?: DistanceUnit;
  voiceText?: string;
  onClubSelect?: (club: string, clubProfile: ClubProfile) => void;
}

/* ---------- helpers ---------- */

const CLUB_LABELS: Record<string, string> = {
  driver: 'Driver', '3_wood': '3W', '5_wood': '5W', '7_wood': '7W',
  '2_hybrid': '2H', '3_hybrid': '3H', '4_hybrid': '4H', '5_hybrid': '5H',
  '3_iron': '3i', '4_iron': '4i', '5_iron': '5i', '6_iron': '6i',
  '7_iron': '7i', '8_iron': '8i', '9_iron': '9i',
  pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
};
function clubLabel(club: string) { return CLUB_LABELS[club] ?? club.replace(/_/g, ' '); }

function gpsToMeters(p: { lat: number; lng: number }, o: { lat: number; lng: number }) {
  const mLat = 111320, mLng = mLat * Math.cos(o.lat * Math.PI / 180);
  return { x: (p.lng - o.lng) * mLng, y: -(p.lat - o.lat) * mLat };
}

function metersToLatLng(mX: number, mY: number, origin: GPSCoordinate): [number, number] {
  return [
    origin.lat + (-mY) / 111320,
    origin.lng + (mX) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
  ];
}

function generateFairwayLatLngs(
  center: GPSCoordinate[], par: number, tee: GPSCoordinate, pin: GPSCoordinate,
): L.LatLngExpression[] {
  const all = [tee, ...center, pin];
  const left: L.LatLngExpression[] = [], right: L.LatLngExpression[] = [];
  for (let i = 0; i < all.length; i++) {
    const t = i / (all.length - 1);
    let hw: number;
    if (t < 0.05) hw = 4;
    else if (t < 0.15) hw = 4 + (t - 0.05) / 0.1 * 14;
    else if (t < 0.6) hw = 18 + Math.sin((t - 0.15) / 0.45 * Math.PI) * 6;
    else if (t < 0.85) hw = 16 - (t - 0.6) / 0.25 * 4;
    else hw = 12 - (t - 0.85) / 0.15 * 4;
    if (par === 5) hw *= 1.15;
    if (par === 3) hw *= 0.7;

    const pY = gpsToMeters(all[i], tee);
    let dx: number, dy: number;
    if (i === 0) { const n = gpsToMeters(all[1], tee); dx = n.x - pY.x; dy = n.y - pY.y; }
    else if (i === all.length - 1) { const p = gpsToMeters(all[i - 1], tee); dx = pY.x - p.x; dy = pY.y - p.y; }
    else { const n = gpsToMeters(all[i + 1], tee); const p = gpsToMeters(all[i - 1], tee); dx = n.x - p.x; dy = n.y - p.y; }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    left.push(metersToLatLng(pY.x + nx * hw, pY.y + ny * hw, tee));
    right.push(metersToLatLng(pY.x - nx * hw, pY.y - ny * hw, tee));
  }
  return [...left, ...right.reverse()];
}

function computeBallFlight(
  carry: number, aimRight: number, shape: string, origin: GPSCoordinate, pinPos: GPSCoordinate,
): { points: [number, number][]; landLL: [number, number] } {
  const pinY = gpsToMeters(pinPos, origin);
  const d = Math.sqrt(pinY.x * pinY.x + pinY.y * pinY.y) || 1;
  const dX = pinY.x / d, dY = pinY.y / d, pX = -dY, pYd = dX;
  const lX = dX * carry + pX * aimRight;
  const lY = dY * carry + pYd * aimRight;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    let fx = lX * t, fy = lY * t;
    if (shape === 'fade' || shape === 'draw') {
      const c = shape === 'fade' ? 8 : -8;
      fx += pX * c * t * t; fy += pYd * c * t * t;
    }
    pts.push(metersToLatLng(fx, fy, origin));
  }
  return { points: pts, landLL: metersToLatLng(lX, lY, origin) };
}

/* ---------- Component ---------- */

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'meters', voiceText, onClubSelect }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = useCallback((y: number) => convertDistance(y, unit), [unit]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const clubCtrlRef = useRef<L.Control | null>(null);

  const [activeClub, setActiveClub] = useState<string | null>(null);
  const effectiveClub = activeClub ?? recommendation?.club ?? null;

  useEffect(() => { setActiveClub(null); }, [recommendation?.club, currentHole]);

  const sortedClubs = useMemo(() =>
    [...player.clubs]
      .filter(c => c.club !== 'putter')
      .sort((a, b) => b.averageCarryMeters - a.averageCarryMeters),
    [player.clubs],
  );

  const activeClubProfile = useMemo(() =>
    sortedClubs.find(c => c.club === effectiveClub) ?? null,
    [sortedClubs, effectiveClub],
  );

  const holeBounds = useMemo(() => {
    const pts: [number, number][] = [
      [hole.teePosition.lat, hole.teePosition.lng],
      [hole.pinPosition.lat, hole.pinPosition.lng],
      [hole.greenContour.frontEdge.lat, hole.greenContour.frontEdge.lng],
      [hole.greenContour.backEdge.lat, hole.greenContour.backEdge.lng],
      ...hole.fairwayCenter.map(p => [p.lat, p.lng] as [number, number]),
      ...hole.hazards.map(h => [h.centerPoint.lat, h.centerPoint.lng] as [number, number]),
    ];
    return L.latLngBounds(pts).pad(0.08);
  }, [hole]);

  /* ─── EFFECT 1: Create map ─── */
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(el, { zoomControl: false, attributionControl: false });

    const esri = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19 },
    );
    const google = L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { maxZoom: 22, subdomains: '0123' },
    );
    const dark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd' },
    );

    let esriFails = 0, googleFails = 0;
    esri.on('tileerror', () => { esriFails++; if (esriFails >= 4 && map.hasLayer(esri)) { map.removeLayer(esri); google.addTo(map); } });
    google.on('tileerror', () => { googleFails++; if (googleFails >= 4 && map.hasLayer(google)) { map.removeLayer(google); dark.addTo(map); } });

    esri.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.fitBounds(holeBounds, { padding: [15, 10], animate: false, maxZoom: 19 });

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlayGroupRef.current = layers;

    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; overlayGroupRef.current = null; clubCtrlRef.current = null; };
  }, [hole, currentHole, holeBounds]);

  /* ─── EFFECT 2: Draw overlays ─── */
  useEffect(() => {
    const map = mapRef.current;
    const layers = overlayGroupRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    if (clubCtrlRef.current) { map.removeControl(clubCtrlRef.current); clubCtrlRef.current = null; }

    const origin = hole.teePosition;
    const pinPos: L.LatLngExpression = [hole.pinPosition.lat, hole.pinPosition.lng];

    // Fairway
    L.polygon(
      generateFairwayLatLngs(hole.fairwayCenter, hole.par, hole.teePosition, hole.pinPosition),
      { color: '#4ade80', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.12, dashArray: '6,4' },
    ).addTo(layers);

    // Hazards — minimal labels
    hole.hazards.forEach(h => {
      const pos: L.LatLngExpression = [h.centerPoint.lat, h.centerPoint.lng];
      if (h.type === 'water') L.circle(pos, { radius: 14, color: '#60a5fa', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.3 }).addTo(layers);
      else if (h.type === 'bunker' || h.type === 'fairway_bunker') L.circle(pos, { radius: h.type === 'fairway_bunker' ? 12 : 8, color: '#fbbf24', weight: 1.5, fillColor: '#f5e6b8', fillOpacity: 0.35 }).addTo(layers);
      else if (h.type === 'ob') L.circle(pos, { radius: 8, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.12, dashArray: '5,4' }).addTo(layers);
      else if (h.type === 'trees') L.circle(pos, { radius: 16, color: '#4ade80', weight: 1, fillColor: '#22c55e', fillOpacity: 0.12 }).addTo(layers);
    });

    // Yardage markers
    [100, 150, 200].filter(y => y < hole.lengthMeters * 0.85).forEach(yd => {
      const frac = 1 - yd / hole.lengthMeters;
      const spine = [hole.teePosition, ...hole.fairwayCenter, hole.pinPosition];
      const idx = Math.min(Math.floor(frac * (spine.length - 1)), spine.length - 1);
      const p = spine[idx]; if (!p) return;
      const pY = gpsToMeters(p, origin);
      const next = gpsToMeters(spine[Math.min(idx + 1, spine.length - 1)], origin);
      const dx = next.x - pY.x, dy = next.y - pY.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ll = metersToLatLng(pY.x + (-dy / len * 10), pY.y + (dx / len * 10), origin);
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div style="background:#0d1f17cc;color:#2dd4bf;font-size:10px;font-weight:800;font-family:system-ui;border-radius:10px;padding:2px 6px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${dist(yd)}</div>`, iconSize: [32, 18], iconAnchor: [16, 9] }) }).addTo(layers);
    });

    // Green
    const gPos: L.LatLngExpression = [hole.greenContour.centerGreen.lat, hole.greenContour.centerGreen.lng];
    const gf = gpsToMeters(hole.greenContour.frontEdge, hole.greenContour.centerGreen);
    const gb = gpsToMeters(hole.greenContour.backEdge, hole.greenContour.centerGreen);
    const gR = Math.sqrt((gf.x - gb.x) ** 2 + (gf.y - gb.y) ** 2) / 2;
    L.circle(gPos, { radius: gR * 1.3, color: '#4ade80', weight: 1, fillColor: '#22c55e', fillOpacity: 0.2 }).addTo(layers);
    L.circle(gPos, { radius: gR, color: '#4ade80', weight: 2, fillColor: '#4ade80', fillOpacity: 0.25 }).addTo(layers);

    // Pin
    L.marker(pinPos, { icon: L.divIcon({ className: '', html: `<div style="position:relative;width:20px;height:30px"><div style="position:absolute;left:9px;top:0;width:2px;height:26px;background:#fff;box-shadow:0 0 3px rgba(0,0,0,0.4)"></div><div style="position:absolute;left:11px;top:0;width:0;height:0;border-left:11px solid #ef4444;border-bottom:6px solid transparent"></div><div style="position:absolute;left:6px;top:23px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div></div>`, iconSize: [20, 30], iconAnchor: [10, 28] }) }).addTo(layers);

    // Tee
    L.marker([hole.teePosition.lat, hole.teePosition.lng] as L.LatLngExpression, { icon: L.divIcon({ className: '', html: `<div style="background:#4ade80;border:1.5px solid #fff;border-radius:4px;padding:2px 8px;color:#0d1f17;font-size:9px;font-weight:900;font-family:system-ui;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)">TEE</div>`, iconSize: [36, 20], iconAnchor: [18, 10] }) }).addTo(layers);

    // Ball flight
    if (activeClubProfile) {
      const carry = activeClubProfile.averageCarryMeters;
      const aimRight = recommendation && effectiveClub === recommendation.club ? (recommendation.aimOffset.metersRight ?? 0) : 0;
      const shape = recommendation && effectiveClub === recommendation.club ? recommendation.suggestedShape : 'straight';
      const dispersion = activeClubProfile.standardDeviationMeters;
      const { points, landLL } = computeBallFlight(carry, aimRight, shape, origin, hole.pinPosition);

      L.circle(landLL, { radius: dispersion, color: '#60a5fa', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.08, dashArray: '4,4' }).addTo(layers);
      L.polyline(points, { color: '#60a5fa', weight: 6, opacity: 0.2 }).addTo(layers);
      L.polyline(points, { color: '#ffffff', weight: 2, opacity: 0.9 }).addTo(layers);
      L.circleMarker(landLL, { radius: 5, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.9 }).addTo(layers);
      L.marker(landLL, { icon: L.divIcon({ className: '', html: `<div style="background:#0d1f17cc;color:#60a5fa;font-size:10px;font-weight:800;font-family:system-ui;padding:1px 6px;border-radius:4px;text-align:center;white-space:nowrap">${dist(carry)}${dAbbr}</div>`, iconSize: [60, 16], iconAnchor: [30, -8] }) }).addTo(layers);
    }

    // GPS
    if (gpsPosition) {
      const pp: L.LatLngExpression = [gpsPosition.lat, gpsPosition.lng];
      if (gpsAccuracy && gpsAccuracy < 50) L.circle(pp, { radius: gpsAccuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.06 }).addTo(layers);
      L.polyline([pp, pinPos], { color: '#60a5fa', weight: 1, dashArray: '5,4', opacity: 0.5 }).addTo(layers);
      if (distanceToPin) {
        const mid: L.LatLngExpression = [(gpsPosition.lat + hole.pinPosition.lat) / 2, (gpsPosition.lng + hole.pinPosition.lng) / 2];
        L.marker(mid, { icon: L.divIcon({ className: '', html: `<div style="background:#0d1f17dd;color:#60a5fa;font-size:11px;font-weight:900;font-family:system-ui;padding:2px 8px;border-radius:6px;text-align:center;white-space:nowrap">${dist(distanceToPin)}${dAbbr}</div>`, iconSize: [60, 20], iconAnchor: [30, 10] }) }).addTo(layers);
      }
      L.circleMarker(pp, { radius: 7, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(layers);
      L.circleMarker(pp, { radius: 2.5, color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: 1 }).addTo(layers);
    }
  }, [hole, currentHole, recommendation, effectiveClub, activeClubProfile, gpsPosition, gpsAccuracy, distanceToPin, unit, dist, dAbbr]);

  /* ─── Render ─── */
  const isAiPick = (c: ClubProfile) => recommendation && c.club === recommendation.club;
  const isAlt = (c: ClubProfile) => recommendation?.alternativeShots.some(a => a.club === c.club);

  return (
    <div style={styles.container}>
      {/* Compact header */}
      <div style={styles.header}>
        <span style={styles.holeLabel}>H{currentHole}</span>
        <span style={styles.parChip}>P{hole.par}</span>
        <span style={styles.mChip}>{dist(hole.lengthMeters)}{dAbbr}</span>
        {hole.handicapIndex && <span style={styles.hcpChip}>HC{hole.handicapIndex}</span>}
        {hole.doglegDirection && hole.doglegDirection !== 'straight' && (
          <span style={styles.doglegChip}>{hole.doglegDirection === 'left' ? '◄' : '►'} DL</span>
        )}
      </div>

      {/* Map */}
      <div ref={mapContainerRef} style={styles.mapContainer} />

      {/* Club selector */}
      <div style={styles.clubStrip}>
        <div style={styles.clubScroll}>
          {sortedClubs.map(c => {
            const active = effectiveClub === c.club;
            const aiPick = isAiPick(c);
            const alt = isAlt(c);
            return (
              <button
                key={c.club}
                onClick={() => { setActiveClub(c.club); onClubSelect?.(c.club, c); }}
                style={{
                  ...styles.clubBtn,
                  ...(active ? styles.clubBtnActive : {}),
                  ...(aiPick && !active ? styles.clubBtnAi : {}),
                  ...(alt && !active && !aiPick ? styles.clubBtnAlt : {}),
                }}
              >
                {aiPick && <span style={styles.aiTag}>AI</span>}
                <span style={{ ...styles.clubName, ...(active ? styles.clubNameActive : {}) }}>{clubLabel(c.club)}</span>
                <span style={{ ...styles.clubDist, ...(active ? styles.clubDistActive : {}) }}>{dist(c.averageCarryMeters)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Caddie advice — replaces green info / hazard legend */}
      {voiceText && (
        <div style={styles.caddieAdvice}>
          <span style={styles.caddieLabel}>CADDIE</span>
          <p style={styles.caddieText}>{voiceText}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  container: { marginBottom: 10, borderRadius: 12, overflow: 'hidden', background: '#091510', border: '1px solid #1e4d2b' },

  // Header — single compact row
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0d1f17', borderBottom: '1px solid #1e4d2b' },
  holeLabel: { fontSize: 16, fontWeight: 900, color: '#f1f5f9', letterSpacing: 0.5 },
  parChip: { fontSize: 11, fontWeight: 700, color: '#22c55e' },
  mChip: { fontSize: 11, fontWeight: 600, color: '#8faa97' },
  hcpChip: { fontSize: 10, color: '#5a7a65' },
  doglegChip: { fontSize: 9, fontWeight: 700, color: '#f59e0b', marginLeft: 'auto' as const },

  mapContainer: { width: '100%', height: 380, background: '#091510' },

  // Club strip
  clubStrip: { padding: '6px 8px', background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  clubScroll: { display: 'flex', gap: 4, overflowX: 'auto' as const, scrollbarWidth: 'none' as const },
  clubBtn: {
    flex: '0 0 auto', display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: '5px 10px', borderRadius: 8, border: '1px solid #1e4d2b', background: 'transparent',
    cursor: 'pointer', transition: 'all 0.15s', position: 'relative' as const, minWidth: 48,
  },
  clubBtnActive: { background: 'linear-gradient(135deg, #2dd4bf 0%, #22c55e 100%)', borderColor: '#2dd4bf', boxShadow: '0 2px 8px rgba(45,212,191,0.25)' },
  clubBtnAi: { borderColor: '#2dd4bf50', background: '#2dd4bf08' },
  clubBtnAlt: { borderColor: '#3b82f630', background: '#3b82f608' },
  aiTag: { position: 'absolute' as const, top: -5, right: -3, fontSize: 7, fontWeight: 900, color: '#0d1f17', background: '#2dd4bf', padding: '1px 3px', borderRadius: 3 },
  clubName: { fontSize: 11, fontWeight: 800, color: '#e8f0e8' },
  clubNameActive: { color: '#0d1f17' },
  clubDist: { fontSize: 8, fontWeight: 600, color: '#5a7a65', marginTop: 1 },
  clubDistActive: { color: '#0d1f17aa' },

  // Caddie advice
  caddieAdvice: { padding: '8px 12px', borderTop: '1px solid #1e4d2b', background: '#0d1f17' },
  caddieLabel: { fontSize: 8, fontWeight: 800, color: '#22c55e', letterSpacing: 1 },
  caddieText: { fontSize: 12, color: '#c5d8c5', lineHeight: '1.5', margin: '4px 0 0', fontStyle: 'italic' },
};

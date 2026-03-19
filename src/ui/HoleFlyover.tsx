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

function gpsToYards(p: { lat: number; lng: number }, o: { lat: number; lng: number }) {
  const mLat = 111320, mLng = mLat * Math.cos(o.lat * Math.PI / 180), mYd = 0.9144;
  return { x: (p.lng - o.lng) * mLng / mYd, y: -(p.lat - o.lat) * mLat / mYd };
}

function yardsToLatLng(yX: number, yY: number, origin: GPSCoordinate): [number, number] {
  const m = 0.9144;
  return [
    origin.lat + (-yY * m) / 111320,
    origin.lng + (yX * m) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
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

    const pY = gpsToYards(all[i], tee);
    let dx: number, dy: number;
    if (i === 0) { const n = gpsToYards(all[1], tee); dx = n.x - pY.x; dy = n.y - pY.y; }
    else if (i === all.length - 1) { const p = gpsToYards(all[i - 1], tee); dx = pY.x - p.x; dy = pY.y - p.y; }
    else { const n = gpsToYards(all[i + 1], tee); const p = gpsToYards(all[i - 1], tee); dx = n.x - p.x; dy = n.y - p.y; }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    left.push(yardsToLatLng(pY.x + nx * hw, pY.y + ny * hw, tee));
    right.push(yardsToLatLng(pY.x - nx * hw, pY.y - ny * hw, tee));
  }
  return [...left, ...right.reverse()];
}

function computeBallFlight(
  carry: number, aimRight: number, shape: string, origin: GPSCoordinate, pinPos: GPSCoordinate,
): { points: [number, number][]; landLL: [number, number] } {
  const pinY = gpsToYards(pinPos, origin);
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
    pts.push(yardsToLatLng(fx, fy, origin));
  }
  return { points: pts, landLL: yardsToLatLng(lX, lY, origin) };
}

/* ---------- Component ---------- */

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'yards' }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = useCallback((y: number) => convertDistance(y, unit), [unit]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const clubCtrlRef = useRef<L.Control | null>(null);

  // Club selector state — default to AI recommendation
  const [activeClub, setActiveClub] = useState<string | null>(null);
  const effectiveClub = activeClub ?? recommendation?.club ?? null;

  // Reset selected club when recommendation changes
  useEffect(() => { setActiveClub(null); }, [recommendation?.club, currentHole]);

  // Sorted clubs from player bag (longest to shortest, exclude putter)
  const sortedClubs = useMemo(() =>
    [...player.clubs]
      .filter(c => c.club !== 'putter')
      .sort((a, b) => b.averageCarryYards - a.averageCarryYards),
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
    return L.latLngBounds(pts).pad(0.2);
  }, [hole]);

  /* ─── EFFECT 1: Create map + tile layer (stable — only on hole change) ─── */
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(el, { zoomControl: false, attributionControl: false });

    // Try Esri satellite first
    const esri = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19 },
    );

    // Google satellite fallback
    const google = L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { maxZoom: 22, subdomains: '0123' },
    );

    // Dark mode tile as last resort (always works, CORS-friendly)
    const dark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd' },
    );

    // Waterfall: esri → google → carto dark
    let esriFails = 0, googleFails = 0;
    esri.on('tileerror', () => {
      esriFails++;
      if (esriFails >= 4 && map.hasLayer(esri)) {
        map.removeLayer(esri);
        google.addTo(map);
      }
    });
    google.on('tileerror', () => {
      googleFails++;
      if (googleFails >= 4 && map.hasLayer(google)) {
        map.removeLayer(google);
        dark.addTo(map);
      }
    });

    esri.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.fitBounds(holeBounds, { padding: [20, 20], animate: false });

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlayGroupRef.current = layers;

    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; overlayGroupRef.current = null; clubCtrlRef.current = null; };
  }, [hole, currentHole, holeBounds]);

  /* ─── EFFECT 2: Draw overlays (runs when data or selected club changes) ─── */
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
      { color: '#4ade80', weight: 2, fillColor: '#22c55e', fillOpacity: 0.15, dashArray: '6,4' },
    ).addTo(layers);

    // Hazards
    const mkLabel = (pos: L.LatLngExpression, text: string, color: string) =>
      L.marker(pos, { icon: L.divIcon({ className: '', html: `<div style="color:${color};font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">${text}</div>`, iconSize: [70, 16], iconAnchor: [35, -6] }) }).addTo(layers);

    hole.hazards.forEach(h => {
      const pos: L.LatLngExpression = [h.centerPoint.lat, h.centerPoint.lng];
      if (h.type === 'water') { L.circle(pos, { radius: 14, color: '#60a5fa', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.35 }).addTo(layers); mkLabel(pos, 'WATER', '#93c5fd'); }
      else if (h.type === 'bunker' || h.type === 'fairway_bunker') { L.circle(pos, { radius: h.type === 'fairway_bunker' ? 12 : 8, color: '#fbbf24', weight: 2, fillColor: '#f5e6b8', fillOpacity: 0.4 }).addTo(layers); mkLabel(pos, h.type === 'fairway_bunker' ? 'FW BUNKER' : 'BUNKER', '#fbbf24'); }
      else if (h.type === 'ob') { L.circle(pos, { radius: 8, color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5,4' }).addTo(layers); mkLabel(pos, 'OB', '#ef4444'); }
      else if (h.type === 'trees') { L.circle(pos, { radius: 16, color: '#4ade80', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.15 }).addTo(layers); mkLabel(pos, 'TREES', '#4ade80'); }
    });

    // Layup targets
    hole.layupTargets.forEach(l => {
      const pos: L.LatLngExpression = [l.position.lat, l.position.lng];
      L.circle(pos, { radius: 8, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.1, dashArray: '4,4' }).addTo(layers);
      L.marker(pos, { icon: L.divIcon({ className: '', html: `<div style="color:#f59e0b;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">LAYUP ${dist(l.distanceToGreen)}${dAbbr}</div>`, iconSize: [90, 16], iconAnchor: [45, 14] }) }).addTo(layers);
    });

    // Yardage markers
    [100, 150, 200, 250].filter(y => y < hole.lengthYards * 0.85).forEach(yd => {
      const frac = 1 - yd / hole.lengthYards;
      const spine = [hole.teePosition, ...hole.fairwayCenter, hole.pinPosition];
      const idx = Math.min(Math.floor(frac * (spine.length - 1)), spine.length - 1);
      const p = spine[idx]; if (!p) return;
      const pY = gpsToYards(p, origin);
      const next = gpsToYards(spine[Math.min(idx + 1, spine.length - 1)], origin);
      const dx = next.x - pY.x, dy = next.y - pY.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ll = yardsToLatLng(pY.x + (-dy / len * 12), pY.y + (dx / len * 12), origin);
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div style="background:#2dd4bf;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.7)">${dist(yd)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(layers);
    });

    // Green
    const gPos: L.LatLngExpression = [hole.greenContour.centerGreen.lat, hole.greenContour.centerGreen.lng];
    const gf = gpsToYards(hole.greenContour.frontEdge, hole.greenContour.centerGreen);
    const gb = gpsToYards(hole.greenContour.backEdge, hole.greenContour.centerGreen);
    const gR = Math.sqrt((gf.x - gb.x) ** 2 + (gf.y - gb.y) ** 2) / 2 * 0.9144;
    L.circle(gPos, { radius: gR * 1.4, color: '#4ade80', weight: 1, fillColor: '#22c55e', fillOpacity: 0.25 }).addTo(layers);
    L.circle(gPos, { radius: gR * 1.1, color: '#4ade80', weight: 2.5, fillColor: '#4ade80', fillOpacity: 0.3 }).addTo(layers);

    // Pin flag
    L.marker(pinPos, { icon: L.divIcon({ className: '', html: `<div style="position:relative;width:24px;height:36px"><div style="position:absolute;left:11px;top:0;width:2px;height:32px;background:#fff;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div><div style="position:absolute;left:13px;top:0;width:0;height:0;border-left:14px solid #ef4444;border-bottom:7px solid transparent"></div><div style="position:absolute;left:7px;top:28px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div></div>`, iconSize: [24, 38], iconAnchor: [12, 36] }) }).addTo(layers);

    // Tee
    L.marker([hole.teePosition.lat, hole.teePosition.lng] as L.LatLngExpression, { icon: L.divIcon({ className: '', html: `<div style="background:#4ade80;border:2px solid #fff;border-radius:6px;padding:4px 10px;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.6)">TEE</div>`, iconSize: [44, 26], iconAnchor: [22, 13] }) }).addTo(layers);

    // Ball flight for active club
    if (activeClubProfile) {
      const carry = activeClubProfile.averageCarryYards;
      const aimRight = recommendation && effectiveClub === recommendation.club
        ? (recommendation.aimOffset.yardsRight ?? 0) : 0;
      const shape = recommendation && effectiveClub === recommendation.club
        ? recommendation.suggestedShape : 'straight';
      const dispersion = activeClubProfile.standardDeviationYards;

      const { points, landLL } = computeBallFlight(carry, aimRight, shape, origin, hole.pinPosition);

      // Dispersion circle
      L.circle(landLL, { radius: dispersion * 0.9144, color: '#60a5fa', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.1, dashArray: '5,5' }).addTo(layers);
      // Glow + line
      L.polyline(points, { color: '#60a5fa', weight: 8, opacity: 0.25 }).addTo(layers);
      L.polyline(points, { color: '#ffffff', weight: 3, opacity: 0.95 }).addTo(layers);
      // Landing dot
      L.circleMarker(landLL, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.9 }).addTo(layers);

      // Carry distance label near landing
      L.marker(landLL, { icon: L.divIcon({ className: '', html: `<div style="background:#0d1f17dd;color:#60a5fa;font-size:11px;font-weight:900;font-family:system-ui;padding:2px 8px;border-radius:6px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.5);white-space:nowrap">${dist(carry)}${dAbbr} carry</div>`, iconSize: [90, 20], iconAnchor: [45, -12] }) }).addTo(layers);
    }

    // GPS player
    if (gpsPosition) {
      const pp: L.LatLngExpression = [gpsPosition.lat, gpsPosition.lng];
      if (gpsAccuracy && gpsAccuracy < 50) L.circle(pp, { radius: gpsAccuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.08 }).addTo(layers);
      L.polyline([pp, pinPos], { color: '#60a5fa', weight: 1.5, dashArray: '6,4', opacity: 0.6 }).addTo(layers);
      if (distanceToPin) {
        const mid: L.LatLngExpression = [(gpsPosition.lat + hole.pinPosition.lat) / 2, (gpsPosition.lng + hole.pinPosition.lng) / 2];
        L.marker(mid, { icon: L.divIcon({ className: '', html: `<div style="background:#0d1f17ee;color:#60a5fa;font-size:12px;font-weight:900;font-family:system-ui;padding:3px 10px;border-radius:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap">${dist(distanceToPin)}${dAbbr}</div>`, iconSize: [70, 24], iconAnchor: [35, 12] }) }).addTo(layers);
      }
      L.circleMarker(pp, { radius: 9, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(layers);
      L.circleMarker(pp, { radius: 3.5, color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: 1 }).addTo(layers);
    }
  }, [hole, currentHole, recommendation, effectiveClub, activeClubProfile, gpsPosition, gpsAccuracy, distanceToPin, unit, dist, dAbbr]);

  /* ─── Render ─── */
  const isAiPick = (c: ClubProfile) => recommendation && c.club === recommendation.club;
  const isAlt = (c: ClubProfile) => recommendation?.alternativeShots.some(a => a.club === c.club);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <span style={styles.holeLabel}>HOLE {currentHole}</span>
          <div style={styles.headerMeta}>
            <span style={styles.parLabel}>PAR {hole.par}</span>
            <span style={styles.divider}>/</span>
            <span style={styles.ydsLabel}>{dist(hole.lengthYards)} {dAbbr.toUpperCase()}</span>
            {hole.handicapIndex && (<><span style={styles.divider}>/</span><span style={styles.hcpLabel}>HCP {hole.handicapIndex}</span></>)}
          </div>
        </div>
        {hole.doglegDirection && hole.doglegDirection !== 'straight' && (
          <div style={styles.doglegBadge}>{hole.doglegDirection === 'left' ? '◄' : '►'} DOGLEG {hole.doglegDirection.toUpperCase()} ~{hole.doglegYards}Y</div>
        )}
      </div>

      {/* Leaflet Map */}
      <div ref={mapContainerRef} style={styles.mapContainer} />

      {/* Club Selector Strip */}
      <div style={styles.clubStrip}>
        <div style={styles.clubStripLabel}>SELECT CLUB</div>
        <div style={styles.clubScroll}>
          {sortedClubs.map(c => {
            const active = effectiveClub === c.club;
            const aiPick = isAiPick(c);
            const alt = isAlt(c);
            return (
              <button
                key={c.club}
                onClick={() => setActiveClub(c.club)}
                style={{
                  ...styles.clubBtn,
                  ...(active ? styles.clubBtnActive : {}),
                  ...(aiPick && !active ? styles.clubBtnAi : {}),
                  ...(alt && !active && !aiPick ? styles.clubBtnAlt : {}),
                }}
              >
                {aiPick && <span style={styles.aiTag}>AI</span>}
                <span style={{
                  ...styles.clubName,
                  ...(active ? styles.clubNameActive : {}),
                }}>{clubLabel(c.club)}</span>
                <span style={{
                  ...styles.clubDist,
                  ...(active ? styles.clubDistActive : {}),
                }}>{dist(c.averageCarryYards)}{dAbbr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active club info bar */}
      {activeClubProfile && (
        <div style={styles.clubInfo}>
          <div style={styles.clubInfoItem}>
            <span style={styles.clubInfoLabel}>CARRY</span>
            <span style={{ ...styles.clubInfoValue, color: '#2dd4bf' }}>{dist(activeClubProfile.averageCarryYards)}{dAbbr}</span>
          </div>
          <div style={styles.clubInfoItem}>
            <span style={styles.clubInfoLabel}>TOTAL</span>
            <span style={styles.clubInfoValue}>{dist(activeClubProfile.totalDistanceYards)}{dAbbr}</span>
          </div>
          <div style={styles.clubInfoItem}>
            <span style={styles.clubInfoLabel}>DISPERSION</span>
            <span style={styles.clubInfoValue}>±{dist(activeClubProfile.standardDeviationYards)}{dAbbr}</span>
          </div>
          <div style={styles.clubInfoItem}>
            <span style={styles.clubInfoLabel}>MISS</span>
            <span style={{ ...styles.clubInfoValue, color: '#f59e0b' }}>{activeClubProfile.primaryMiss}</span>
          </div>
        </div>
      )}

      {/* Hazard legend */}
      {hole.hazards.length > 0 && (
        <div style={styles.hazardLegend}>
          {hole.hazards.some(h => h.type === 'water') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#3b82f6' }} /> Water</span>}
          {hole.hazards.some(h => h.type === 'bunker' || h.type === 'fairway_bunker') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#fbbf24' }} /> Bunker</span>}
          {hole.hazards.some(h => h.type === 'ob') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#ef4444' }} /> OB</span>}
          {hole.hazards.some(h => h.type === 'trees') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#4ade80' }} /> Trees</span>}
        </div>
      )}

      {/* Green info strip */}
      <div style={styles.greenInfo}>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Green Speed</span><span style={styles.greenInfoValue}>{hole.greenContour.speed}</span></div>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Firmness</span><span style={styles.greenInfoValue}>{hole.greenContour.firmness}</span></div>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Slope</span><span style={styles.greenInfoValue}>{(hole.greenContour.slopeSeverity * 10).toFixed(1)}</span></div>
        {recommendation && effectiveClub === recommendation.club && (
          <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Green Hit</span><span style={{ ...styles.greenInfoValue, color: '#22c55e' }}>{Math.round(recommendation.expectedOutcome.hitGreenProbability * 100)}%</span></div>
        )}
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  container: { marginBottom: 16, borderRadius: 16, overflow: 'hidden', background: '#091510', border: '1px solid #1e4d2b' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px', background: 'linear-gradient(135deg, #0d1f17 0%, #1a3a28 100%)', borderBottom: '1px solid #1e4d2b' },
  holeLabel: { fontSize: 18, fontWeight: 900, color: '#f1f5f9', letterSpacing: 1 },
  headerMeta: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 },
  parLabel: { fontSize: 12, fontWeight: 700, color: '#22c55e' },
  divider: { fontSize: 10, color: '#1e4d2b' },
  ydsLabel: { fontSize: 12, fontWeight: 600, color: '#8faa97' },
  hcpLabel: { fontSize: 11, color: '#5a7a65' },
  doglegBadge: { padding: '4px 10px', borderRadius: 6, background: '#f59e0b20', color: '#f59e0b', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  mapContainer: { width: '100%', height: 420, background: '#091510' },

  // Club selector strip
  clubStrip: { padding: '10px 12px 8px', background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  clubStripLabel: { fontSize: 8, fontWeight: 800, color: '#5a7a65', letterSpacing: 1, marginBottom: 8 },
  clubScroll: { display: 'flex', gap: 6, overflowX: 'auto' as const, scrollbarWidth: 'none' as const, paddingBottom: 4 },
  clubBtn: {
    flex: '0 0 auto', display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: '8px 12px', borderRadius: 12, border: '1.5px solid #1e4d2b', background: 'transparent',
    cursor: 'pointer', transition: 'all 0.15s', position: 'relative' as const, minWidth: 56,
  },
  clubBtnActive: { background: 'linear-gradient(135deg, #2dd4bf 0%, #22c55e 100%)', borderColor: '#2dd4bf', boxShadow: '0 2px 12px rgba(45,212,191,0.3)' },
  clubBtnAi: { borderColor: '#2dd4bf60', background: '#2dd4bf10' },
  clubBtnAlt: { borderColor: '#3b82f640', background: '#3b82f610' },
  aiTag: { position: 'absolute' as const, top: -6, right: -4, fontSize: 7, fontWeight: 900, color: '#0d1f17', background: '#2dd4bf', padding: '1px 4px', borderRadius: 4, letterSpacing: 0.5 },
  clubName: { fontSize: 12, fontWeight: 800, color: '#e8f0e8' },
  clubNameActive: { color: '#0d1f17' },
  clubDist: { fontSize: 9, fontWeight: 600, color: '#5a7a65', marginTop: 2 },
  clubDistActive: { color: '#0d1f17cc' },

  // Club info bar
  clubInfo: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  clubInfoItem: { textAlign: 'center' as const, padding: '6px 4px', background: '#091510' },
  clubInfoLabel: { display: 'block', fontSize: 7, color: '#5a7a65', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  clubInfoValue: { display: 'block', fontSize: 12, fontWeight: 700, color: '#e8f0e8', marginTop: 1, textTransform: 'capitalize' as const },

  // Hazard + green info
  hazardLegend: { display: 'flex', gap: 12, justifyContent: 'center', padding: '8px 12px', background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  hazardChip: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8faa97', fontWeight: 600 },
  hazardDot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%' },
  greenInfo: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  greenInfoItem: { textAlign: 'center' as const, padding: '8px 4px', background: '#091510' },
  greenInfoLabel: { display: 'block', fontSize: 8, color: '#5a7a65', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  greenInfoValue: { display: 'block', fontSize: 13, fontWeight: 700, color: '#e8f0e8', marginTop: 1, textTransform: 'capitalize' as const },
};

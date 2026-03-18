import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HoleLayout, ShotRecommendation, PlayerProfile, GPSCoordinate } from '../models/types';
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

function clubLabel(club: string): string {
  const labels: Record<string, string> = {
    driver: 'Driver', '3_wood': '3W', '5_wood': '5W', '7_wood': '7W',
    '2_hybrid': '2H', '3_hybrid': '3H', '4_hybrid': '4H', '5_hybrid': '5H',
    '3_iron': '3i', '4_iron': '4i', '5_iron': '5i', '6_iron': '6i',
    '7_iron': '7i', '8_iron': '8i', '9_iron': '9i',
    pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
  };
  return labels[club] ?? club.replace(/_/g, ' ');
}

function gpsToYards(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number },
): { x: number; y: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  const metersPerYard = 0.9144;
  return {
    x: (point.lng - origin.lng) * metersPerDegLng / metersPerYard,
    y: -(point.lat - origin.lat) * metersPerDegLat / metersPerYard,
  };
}

function generateFairwayLatLngs(
  centerPoints: GPSCoordinate[], par: number, tee: GPSCoordinate, pin: GPSCoordinate,
): L.LatLngExpression[] {
  const origin = tee;
  const allPoints = [tee, ...centerPoints, pin];
  const left: L.LatLngExpression[] = [];
  const right: L.LatLngExpression[] = [];
  const metersPerYard = 0.9144;

  for (let i = 0; i < allPoints.length; i++) {
    const t = i / (allPoints.length - 1);
    let hw: number;
    if (t < 0.05) hw = 4;
    else if (t < 0.15) hw = 4 + (t - 0.05) / 0.1 * 14;
    else if (t < 0.6) hw = 18 + Math.sin((t - 0.15) / 0.45 * Math.PI) * 6;
    else if (t < 0.85) hw = 16 - (t - 0.6) / 0.25 * 4;
    else hw = 12 - (t - 0.85) / 0.15 * 4;
    if (par === 5) hw *= 1.15;
    if (par === 3) hw *= 0.7;

    const pY = gpsToYards(allPoints[i], origin);
    let dx: number, dy: number;
    if (i === 0) { const n = gpsToYards(allPoints[1], origin); dx = n.x - pY.x; dy = n.y - pY.y; }
    else if (i === allPoints.length - 1) { const p = gpsToYards(allPoints[i - 1], origin); dx = pY.x - p.x; dy = pY.y - p.y; }
    else { const n = gpsToYards(allPoints[i + 1], origin); const p = gpsToYards(allPoints[i - 1], origin); dx = n.x - p.x; dy = n.y - p.y; }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;

    for (const [arr, sign] of [[left, 1], [right, -1]] as [L.LatLngExpression[], number][]) {
      const yX = pY.x + nx * hw * sign, yY = pY.y + ny * hw * sign;
      arr.push([
        origin.lat + (-yY * metersPerYard) / 111320,
        origin.lng + (yX * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
      ]);
    }
  }
  return [...left, ...right.reverse()];
}

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'yards' }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = useCallback((yards: number) => convertDistance(yards, unit), [unit]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const clubCtrlRef = useRef<L.Control | null>(null);

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

  // ─── EFFECT 1: Create map + tile layer (only on hole change) ───
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Tear down previous
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
    });

    // Esri World Imagery satellite tiles
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19 },
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.fitBounds(holeBounds, { padding: [20, 20], animate: false });

    const overlays = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlayGroupRef.current = overlays;

    // Ensure container size is correct after paint
    const timer = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      overlayGroupRef.current = null;
      clubCtrlRef.current = null;
    };
  }, [hole, currentHole]); // Only recreate map when hole changes

  // ─── EFFECT 2: Draw overlays (runs on every data change, does NOT touch tiles) ───
  useEffect(() => {
    const map = mapRef.current;
    const layers = overlayGroupRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    // Remove old club control
    if (clubCtrlRef.current) {
      map.removeControl(clubCtrlRef.current);
      clubCtrlRef.current = null;
    }

    // --- Fairway ---
    const fwCoords = generateFairwayLatLngs(hole.fairwayCenter, hole.par, hole.teePosition, hole.pinPosition);
    L.polygon(fwCoords, { color: '#4ade80', weight: 2, fillColor: '#22c55e', fillOpacity: 0.15, dashArray: '6,4' }).addTo(layers);

    // --- Hazards ---
    hole.hazards.forEach(h => {
      const pos: L.LatLngExpression = [h.centerPoint.lat, h.centerPoint.lng];
      const mkLabel = (text: string, color: string) =>
        L.marker(pos, { icon: L.divIcon({ className: '', html: `<div style="color:${color};font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">${text}</div>`, iconSize: [70, 16], iconAnchor: [35, -6] }) }).addTo(layers);

      if (h.type === 'water') {
        L.circle(pos, { radius: 14, color: '#60a5fa', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.35 }).addTo(layers);
        mkLabel('WATER', '#93c5fd');
      } else if (h.type === 'bunker' || h.type === 'fairway_bunker') {
        L.circle(pos, { radius: h.type === 'fairway_bunker' ? 12 : 8, color: '#fbbf24', weight: 2, fillColor: '#f5e6b8', fillOpacity: 0.4 }).addTo(layers);
        mkLabel(h.type === 'fairway_bunker' ? 'FW BUNKER' : 'BUNKER', '#fbbf24');
      } else if (h.type === 'ob') {
        L.circle(pos, { radius: 8, color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5,4' }).addTo(layers);
        mkLabel('OB', '#ef4444');
      } else if (h.type === 'trees') {
        L.circle(pos, { radius: 16, color: '#4ade80', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.15 }).addTo(layers);
        mkLabel('TREES', '#4ade80');
      }
    });

    // --- Layup targets ---
    hole.layupTargets.forEach(l => {
      const pos: L.LatLngExpression = [l.position.lat, l.position.lng];
      L.circle(pos, { radius: 8, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.1, dashArray: '4,4' }).addTo(layers);
      L.marker(pos, { icon: L.divIcon({ className: '', html: `<div style="color:#f59e0b;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">LAYUP ${dist(l.distanceToGreen)}${dAbbr}</div>`, iconSize: [90, 16], iconAnchor: [45, 14] }) }).addTo(layers);
    });

    // --- Yardage markers ---
    const origin = hole.teePosition;
    [100, 150, 200, 250].filter(y => y < hole.lengthYards * 0.85).forEach(yd => {
      const frac = 1 - yd / hole.lengthYards;
      const spine = [hole.teePosition, ...hole.fairwayCenter, hole.pinPosition];
      const idx = Math.min(Math.floor(frac * (spine.length - 1)), spine.length - 1);
      const p = spine[idx]; if (!p) return;
      const pY = gpsToYards(p, origin);
      const next = gpsToYards(spine[Math.min(idx + 1, spine.length - 1)], origin);
      const dx = next.x - pY.x, dy = next.y - pY.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len * 12, py = dx / len * 12;
      const m = 0.9144;
      const lat = origin.lat + (-(pY.y + py) * m) / 111320;
      const lng = origin.lng + ((pY.x + px) * m) / (111320 * Math.cos(origin.lat * Math.PI / 180));
      L.marker([lat, lng], { icon: L.divIcon({ className: '', html: `<div style="background:#2dd4bf;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.7)">${dist(yd)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(layers);
    });

    // --- Green ---
    const greenPos: L.LatLngExpression = [hole.greenContour.centerGreen.lat, hole.greenContour.centerGreen.lng];
    const gf = gpsToYards(hole.greenContour.frontEdge, hole.greenContour.centerGreen);
    const gb = gpsToYards(hole.greenContour.backEdge, hole.greenContour.centerGreen);
    const greenR = Math.sqrt(Math.pow(gf.x - gb.x, 2) + Math.pow(gf.y - gb.y, 2)) / 2 * 0.9144;
    L.circle(greenPos, { radius: greenR * 1.4, color: '#4ade80', weight: 1, fillColor: '#22c55e', fillOpacity: 0.25 }).addTo(layers);
    L.circle(greenPos, { radius: greenR * 1.1, color: '#4ade80', weight: 2.5, fillColor: '#4ade80', fillOpacity: 0.3 }).addTo(layers);

    // --- Pin ---
    const pinPos: L.LatLngExpression = [hole.pinPosition.lat, hole.pinPosition.lng];
    L.marker(pinPos, { icon: L.divIcon({ className: '', html: `<div style="position:relative;width:24px;height:36px"><div style="position:absolute;left:11px;top:0;width:2px;height:32px;background:#fff;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div><div style="position:absolute;left:13px;top:0;width:0;height:0;border-left:14px solid #ef4444;border-bottom:7px solid transparent"></div><div style="position:absolute;left:7px;top:28px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div></div>`, iconSize: [24, 38], iconAnchor: [12, 36] }) }).addTo(layers);

    // --- Tee ---
    const teePos: L.LatLngExpression = [hole.teePosition.lat, hole.teePosition.lng];
    L.marker(teePos, { icon: L.divIcon({ className: '', html: `<div style="background:#4ade80;border:2px solid #fff;border-radius:6px;padding:4px 10px;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.6)">TEE</div>`, iconSize: [44, 26], iconAnchor: [22, 13] }) }).addTo(layers);

    // --- Ball flight ---
    if (recommendation) {
      const carry = recommendation.expectedOutcome.expectedCarryYards;
      const aimOff = recommendation.aimOffset;
      const shape = recommendation.suggestedShape;
      const disp = recommendation.expectedOutcome.landingZone.radiusYards;
      const pinY = gpsToYards(hole.pinPosition, origin);
      const d = Math.sqrt(pinY.x * pinY.x + pinY.y * pinY.y);
      const dX = pinY.x / d, dY = pinY.y / d, pX = -dY, pYd = dX;
      const lX = dX * carry + pX * (aimOff.yardsRight ?? 0);
      const lY = dY * carry + pYd * (aimOff.yardsRight ?? 0);
      const m = 0.9144;

      const flightPts: [number, number][] = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        let fx = lX * t, fy = lY * t;
        if (shape === 'fade' || shape === 'draw') { const c = shape === 'fade' ? 8 : -8; fx += pX * c * t * t; fy += pYd * c * t * t; }
        flightPts.push([origin.lat + (-fy * m) / 111320, origin.lng + (fx * m) / (111320 * Math.cos(origin.lat * Math.PI / 180))]);
      }
      const landLL: [number, number] = [origin.lat + (-lY * m) / 111320, origin.lng + (lX * m) / (111320 * Math.cos(origin.lat * Math.PI / 180))];

      L.circle(landLL, { radius: disp * m, color: '#60a5fa', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.1, dashArray: '5,5' }).addTo(layers);
      L.polyline(flightPts, { color: '#60a5fa', weight: 8, opacity: 0.25 }).addTo(layers);
      L.polyline(flightPts, { color: '#ffffff', weight: 3, opacity: 0.95 }).addTo(layers);
      L.circleMarker(landLL, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.9 }).addTo(layers);

      // Club badge
      const ClubControl = L.Control.extend({ onAdd() { const d = L.DomUtil.create('div'); d.innerHTML = `<div style="background:#2dd4bf;color:#0d1f17;font-size:14px;font-weight:900;font-family:system-ui;padding:6px 16px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.6)">${clubLabel(recommendation.club)}</div>`; return d; }, onRemove() {} });
      const ctrl = new ClubControl({ position: 'bottomright' });
      ctrl.addTo(map);
      clubCtrlRef.current = ctrl;
    }

    // --- GPS player ---
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
  }, [hole, currentHole, recommendation, gpsPosition, gpsAccuracy, distanceToPin, unit, dist, dAbbr]);

  return (
    <div style={styles.container}>
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

      <div ref={mapContainerRef} style={styles.mapContainer} />

      {hole.hazards.length > 0 && (
        <div style={styles.hazardLegend}>
          {hole.hazards.some(h => h.type === 'water') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#3b82f6' }} /> Water</span>}
          {hole.hazards.some(h => h.type === 'bunker' || h.type === 'fairway_bunker') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#fbbf24' }} /> Bunker</span>}
          {hole.hazards.some(h => h.type === 'ob') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#ef4444' }} /> OB</span>}
          {hole.hazards.some(h => h.type === 'trees') && <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#4ade80' }} /> Trees</span>}
        </div>
      )}

      <div style={styles.greenInfo}>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Green Speed</span><span style={styles.greenInfoValue}>{hole.greenContour.speed}</span></div>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Firmness</span><span style={styles.greenInfoValue}>{hole.greenContour.firmness}</span></div>
        <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Slope</span><span style={styles.greenInfoValue}>{(hole.greenContour.slopeSeverity * 10).toFixed(1)}</span></div>
        {recommendation && <div style={styles.greenInfoItem}><span style={styles.greenInfoLabel}>Carry</span><span style={{ ...styles.greenInfoValue, color: '#2dd4bf' }}>{dist(recommendation.expectedOutcome.expectedCarryYards)}{dAbbr}</span></div>}
      </div>
    </div>
  );
}

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
  hazardLegend: { display: 'flex', gap: 12, justifyContent: 'center', padding: '8px 12px', background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  hazardChip: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8faa97', fontWeight: 600 },
  hazardDot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%' },
  greenInfo: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#0d1f17', borderTop: '1px solid #1e4d2b' },
  greenInfoItem: { textAlign: 'center' as const, padding: '8px 4px', background: '#091510' },
  greenInfoLabel: { display: 'block', fontSize: 8, color: '#5a7a65', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  greenInfoValue: { display: 'block', fontSize: 13, fontWeight: 700, color: '#e8f0e8', marginTop: 1, textTransform: 'capitalize' as const },
};

import React, { useMemo, useEffect, useRef } from 'react';
import L from 'leaflet';
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

/** Convert GPS coordinates to relative yard positions */
function gpsToYards(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number },
): { x: number; y: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  const metersPerYard = 0.9144;
  const dy = (point.lat - origin.lat) * metersPerDegLat / metersPerYard;
  const dx = (point.lng - origin.lng) * metersPerDegLng / metersPerYard;
  return { x: dx, y: -dy };
}

/** Generate fairway boundary as lat/lng polygon */
function generateFairwayLatLngs(
  centerPoints: GPSCoordinate[],
  par: number,
  tee: GPSCoordinate,
  pin: GPSCoordinate,
): L.LatLngExpression[] {
  const origin = tee;
  const allPoints = [tee, ...centerPoints, pin];
  const left: L.LatLngExpression[] = [];
  const right: L.LatLngExpression[] = [];
  const metersPerYard = 0.9144;

  for (let i = 0; i < allPoints.length; i++) {
    const p = allPoints[i];
    const t = i / (allPoints.length - 1);

    let halfWidth: number;
    if (t < 0.05) halfWidth = 4;
    else if (t < 0.15) halfWidth = 4 + (t - 0.05) / 0.1 * 14;
    else if (t < 0.6) halfWidth = 18 + Math.sin((t - 0.15) / 0.45 * Math.PI) * 6;
    else if (t < 0.85) halfWidth = 16 - (t - 0.6) / 0.25 * 4;
    else halfWidth = 12 - (t - 0.85) / 0.15 * 4;

    if (par === 5) halfWidth *= 1.15;
    if (par === 3) halfWidth *= 0.7;

    const pY = gpsToYards(p, origin);
    let dx: number, dy: number;
    if (i === 0 && allPoints.length > 1) {
      const n = gpsToYards(allPoints[1], origin);
      dx = n.x - pY.x; dy = n.y - pY.y;
    } else if (i === allPoints.length - 1) {
      const pr = gpsToYards(allPoints[i - 1], origin);
      dx = pY.x - pr.x; dy = pY.y - pr.y;
    } else {
      const n = gpsToYards(allPoints[Math.min(i + 1, allPoints.length - 1)], origin);
      const pr = gpsToYards(allPoints[Math.max(i - 1, 0)], origin);
      dx = n.x - pr.x; dy = n.y - pr.y;
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;

    const lY = { x: pY.x + nx * halfWidth, y: pY.y + ny * halfWidth };
    const rY = { x: pY.x - nx * halfWidth, y: pY.y - ny * halfWidth };

    left.push([
      origin.lat + (-lY.y * metersPerYard) / 111320,
      origin.lng + (lY.x * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
    ]);
    right.push([
      origin.lat + (-rY.y * metersPerYard) / 111320,
      origin.lng + (rY.x * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
    ]);
  }

  return [...left, ...right.reverse()];
}

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'yards' }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = (yards: number) => convertDistance(yards, unit);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  const holeBounds = useMemo(() => {
    const points: [number, number][] = [
      [hole.teePosition.lat, hole.teePosition.lng],
      [hole.pinPosition.lat, hole.pinPosition.lng],
      [hole.greenContour.frontEdge.lat, hole.greenContour.frontEdge.lng],
      [hole.greenContour.backEdge.lat, hole.greenContour.backEdge.lng],
      ...hole.fairwayCenter.map(p => [p.lat, p.lng] as [number, number]),
      ...hole.hazards.map(h => [h.centerPoint.lat, h.centerPoint.lng] as [number, number]),
    ];
    return L.latLngBounds(points).pad(0.2);
  }, [hole]);

  const ballFlight = useMemo(() => {
    if (!recommendation) return null;
    const carry = recommendation.expectedOutcome.expectedCarryYards;
    const offset = recommendation.aimOffset;
    const shape = recommendation.suggestedShape;
    const dispersion = recommendation.expectedOutcome.landingZone.radiusYards;
    const origin = hole.teePosition;
    const pinYards = gpsToYards(hole.pinPosition, origin);
    const d = Math.sqrt(pinYards.x * pinYards.x + pinYards.y * pinYards.y);
    const dirX = pinYards.x / d, dirY = pinYards.y / d;
    const perpX = -dirY, perpY = dirX;
    const landX = dirX * carry + perpX * (offset.yardsRight ?? 0);
    const landY = dirY * carry + perpY * (offset.yardsRight ?? 0);
    const metersPerYard = 0.9144;

    const points: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      let px = landX * t, py = landY * t;
      if (shape === 'fade' || shape === 'draw') {
        const curve = shape === 'fade' ? 8 : -8;
        px += perpX * curve * t * t;
        py += perpY * curve * t * t;
      }
      points.push([
        origin.lat + (-py * metersPerYard) / 111320,
        origin.lng + (px * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
      ]);
    }

    return {
      landLatLng: [
        origin.lat + (-landY * metersPerYard) / 111320,
        origin.lng + (landX * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180)),
      ] as [number, number],
      points,
      dispersionYards: dispersion,
    };
  }, [recommendation, hole]);

  // Build the full map (tiles + overlays) each time the hole changes
  // Using a single effect avoids race conditions between init and overlay drawing
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Destroy previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
    });

    // Esri World Imagery — public, CORS-enabled, no API key needed
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19 },
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fit to hole bounds BEFORE adding overlays so tiles start loading immediately
    map.fitBounds(holeBounds, { padding: [20, 20], animate: false });

    mapRef.current = map;
    const layers = L.layerGroup().addTo(map);
    layersRef.current = layers;

    // Force recalc after the browser has painted the container
    setTimeout(() => { map.invalidateSize(); }, 100);

    // --- Fairway outline (semi-transparent so satellite shows through) ---
    const fairwayCoords = generateFairwayLatLngs(hole.fairwayCenter, hole.par, hole.teePosition, hole.pinPosition);
    L.polygon(fairwayCoords, {
      color: '#4ade80',
      weight: 2,
      fillColor: '#22c55e',
      fillOpacity: 0.15,
      dashArray: '6,4',
    }).addTo(layers);

    // --- Hazards ---
    hole.hazards.forEach(h => {
      const pos: L.LatLngExpression = [h.centerPoint.lat, h.centerPoint.lng];

      if (h.type === 'water') {
        L.circle(pos, {
          radius: 14,
          color: '#60a5fa',
          weight: 2.5,
          fillColor: '#3b82f6',
          fillOpacity: 0.35,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#93c5fd;font-size:11px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">WATER</div>',
            iconSize: [50, 16], iconAnchor: [25, -8],
          }),
        }).addTo(layers);

      } else if (h.type === 'bunker' || h.type === 'fairway_bunker') {
        L.circle(pos, {
          radius: h.type === 'fairway_bunker' ? 12 : 8,
          color: '#fbbf24',
          weight: 2,
          fillColor: '#f5e6b8',
          fillOpacity: 0.4,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: `<div style="color:#fbbf24;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">${h.type === 'fairway_bunker' ? 'FW BUNKER' : 'BUNKER'}</div>`,
            iconSize: [70, 16], iconAnchor: [35, -6],
          }),
        }).addTo(layers);

      } else if (h.type === 'ob') {
        L.circle(pos, {
          radius: 8,
          color: '#ef4444',
          weight: 2.5,
          fillColor: '#ef4444',
          fillOpacity: 0.15,
          dashArray: '5,4',
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#ef4444;font-size:11px;font-weight:900;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000">OB</div>',
            iconSize: [30, 16], iconAnchor: [15, -6],
          }),
        }).addTo(layers);

      } else if (h.type === 'trees') {
        L.circle(pos, {
          radius: 16,
          color: '#4ade80',
          weight: 1.5,
          fillColor: '#22c55e',
          fillOpacity: 0.15,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#4ade80;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000">TREES</div>',
            iconSize: [50, 16], iconAnchor: [25, -10],
          }),
        }).addTo(layers);
      }
    });

    // --- Layup targets ---
    hole.layupTargets.forEach(l => {
      const pos: L.LatLngExpression = [l.position.lat, l.position.lng];
      L.circle(pos, {
        radius: 8, color: '#f59e0b', weight: 2,
        fillColor: '#f59e0b', fillOpacity: 0.1, dashArray: '4,4',
      }).addTo(layers);
      L.marker(pos, {
        icon: L.divIcon({
          className: '',
          html: `<div style="color:#f59e0b;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 4px #000,0 0 8px #000;white-space:nowrap">LAYUP ${dist(l.distanceToGreen)}${dAbbr}</div>`,
          iconSize: [90, 16], iconAnchor: [45, 14],
        }),
      }).addTo(layers);
    });

    // --- Yardage markers ---
    const yardageMarkers = [100, 150, 200, 250].filter(y => y < hole.lengthYards * 0.85);
    const origin = hole.teePosition;

    yardageMarkers.forEach(yd => {
      const frac = 1 - yd / hole.lengthYards;
      const spine = [hole.teePosition, ...hole.fairwayCenter, hole.pinPosition];
      const idx = Math.min(Math.floor(frac * (spine.length - 1)), spine.length - 1);
      const p = spine[idx];
      if (!p) return;

      const pY = gpsToYards(p, origin);
      const nextIdx = Math.min(idx + 1, spine.length - 1);
      const next = gpsToYards(spine[nextIdx], origin);
      const dx = next.x - pY.x, dy = next.y - pY.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpXOff = -dy / len * 12, perpYOff = dx / len * 12;

      const metersPerYard = 0.9144;
      const lat = origin.lat + (-(pY.y + perpYOff) * metersPerYard) / 111320;
      const lng = origin.lng + ((pY.x + perpXOff) * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));

      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#2dd4bf;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.7)">${dist(yd)}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }),
      }).addTo(layers);
    });

    // --- Green ---
    const greenPos: L.LatLngExpression = [hole.greenContour.centerGreen.lat, hole.greenContour.centerGreen.lng];
    const gf = gpsToYards(hole.greenContour.frontEdge, hole.greenContour.centerGreen);
    const gb = gpsToYards(hole.greenContour.backEdge, hole.greenContour.centerGreen);
    const greenR = Math.sqrt(Math.pow(gf.x - gb.x, 2) + Math.pow(gf.y - gb.y, 2)) / 2 * 0.9144;

    L.circle(greenPos, { radius: greenR * 1.4, color: '#4ade80', weight: 1, fillColor: '#22c55e', fillOpacity: 0.25 }).addTo(layers);
    L.circle(greenPos, { radius: greenR * 1.1, color: '#4ade80', weight: 2.5, fillColor: '#4ade80', fillOpacity: 0.3 }).addTo(layers);

    // --- Pin flag ---
    const pinPos: L.LatLngExpression = [hole.pinPosition.lat, hole.pinPosition.lng];
    L.marker(pinPos, {
      icon: L.divIcon({
        className: '',
        html: `<div style="position:relative;width:24px;height:36px">
          <div style="position:absolute;left:11px;top:0;width:2px;height:32px;background:#fff;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div>
          <div style="position:absolute;left:13px;top:0;width:0;height:0;border-left:14px solid #ef4444;border-bottom:7px solid transparent"></div>
          <div style="position:absolute;left:7px;top:28px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>
        </div>`,
        iconSize: [24, 38], iconAnchor: [12, 36],
      }),
    }).addTo(layers);

    // --- Tee box ---
    const teePos: L.LatLngExpression = [hole.teePosition.lat, hole.teePosition.lng];
    L.marker(teePos, {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#4ade80;border:2px solid #fff;border-radius:6px;padding:4px 10px;color:#0d1f17;font-size:11px;font-weight:900;font-family:system-ui;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.6)">TEE</div>`,
        iconSize: [44, 26], iconAnchor: [22, 13],
      }),
    }).addTo(layers);

    // --- Ball flight ---
    if (ballFlight) {
      L.circle(ballFlight.landLatLng, {
        radius: ballFlight.dispersionYards * 0.9144,
        color: '#60a5fa', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.1, dashArray: '5,5',
      }).addTo(layers);

      // Glow
      L.polyline(ballFlight.points, { color: '#60a5fa', weight: 8, opacity: 0.25 }).addTo(layers);
      // Main line
      L.polyline(ballFlight.points, { color: '#ffffff', weight: 3, opacity: 0.95 }).addTo(layers);

      L.circleMarker(ballFlight.landLatLng, {
        radius: 7, color: '#fff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.9,
      }).addTo(layers);
    }

    // --- GPS player ---
    if (gpsPosition) {
      const playerPos: L.LatLngExpression = [gpsPosition.lat, gpsPosition.lng];

      if (gpsAccuracy && gpsAccuracy < 50) {
        L.circle(playerPos, { radius: gpsAccuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.08 }).addTo(layers);
      }

      L.polyline([playerPos, pinPos], { color: '#60a5fa', weight: 1.5, dashArray: '6,4', opacity: 0.6 }).addTo(layers);

      if (distanceToPin) {
        const mid: L.LatLngExpression = [(gpsPosition.lat + hole.pinPosition.lat) / 2, (gpsPosition.lng + hole.pinPosition.lng) / 2];
        L.marker(mid, {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:#0d1f17ee;color:#60a5fa;font-size:12px;font-weight:900;font-family:system-ui;padding:3px 10px;border-radius:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap">${dist(distanceToPin)}${dAbbr}</div>`,
            iconSize: [70, 24], iconAnchor: [35, 12],
          }),
        }).addTo(layers);
      }

      L.circleMarker(playerPos, { radius: 9, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(layers);
      L.circleMarker(playerPos, { radius: 3.5, color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: 1 }).addTo(layers);
    }

    // --- Club badge overlay (bottom-right of map) ---
    if (recommendation) {
      const ClubControl = L.Control.extend({
        onAdd() {
          const div = L.DomUtil.create('div');
          div.innerHTML = `<div style="background:#2dd4bf;color:#0d1f17;font-size:14px;font-weight:900;font-family:system-ui;padding:6px 16px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.6)">${clubLabel(recommendation.club)}</div>`;
          return div;
        },
        onRemove() {},
      });
      const clubCtrl = new ClubControl({ position: 'bottomright' });
      clubCtrl.addTo(map);
      (layers as any)._clubCtrl = clubCtrl;
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [hole, currentHole, ballFlight, gpsPosition, gpsAccuracy, distanceToPin, holeBounds, unit]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.holeLabel}>HOLE {currentHole}</span>
          <div style={styles.headerMeta}>
            <span style={styles.parLabel}>PAR {hole.par}</span>
            <span style={styles.divider}>/</span>
            <span style={styles.ydsLabel}>{dist(hole.lengthYards)} {dAbbr.toUpperCase()}</span>
            {hole.handicapIndex && (
              <>
                <span style={styles.divider}>/</span>
                <span style={styles.hcpLabel}>HCP {hole.handicapIndex}</span>
              </>
            )}
          </div>
        </div>
        {hole.doglegDirection && hole.doglegDirection !== 'straight' && (
          <div style={styles.doglegBadge}>
            {hole.doglegDirection === 'left' ? '◄' : '►'} DOGLEG {hole.doglegDirection.toUpperCase()} ~{hole.doglegYards}Y
          </div>
        )}
      </div>

      {/* Leaflet Map */}
      <div ref={mapContainerRef} style={styles.mapContainer} />

      {/* Hazard legend */}
      {hole.hazards.length > 0 && (
        <div style={styles.hazardLegend}>
          {hole.hazards.some(h => h.type === 'water') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#3b82f6' }} /> Water</span>
          )}
          {hole.hazards.some(h => h.type === 'bunker' || h.type === 'fairway_bunker') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#fbbf24' }} /> Bunker</span>
          )}
          {hole.hazards.some(h => h.type === 'ob') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#ef4444' }} /> OB</span>
          )}
          {hole.hazards.some(h => h.type === 'trees') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#4ade80' }} /> Trees</span>
          )}
        </div>
      )}

      {/* Green info strip */}
      <div style={styles.greenInfo}>
        <div style={styles.greenInfoItem}>
          <span style={styles.greenInfoLabel}>Green Speed</span>
          <span style={styles.greenInfoValue}>{hole.greenContour.speed}</span>
        </div>
        <div style={styles.greenInfoItem}>
          <span style={styles.greenInfoLabel}>Firmness</span>
          <span style={styles.greenInfoValue}>{hole.greenContour.firmness}</span>
        </div>
        <div style={styles.greenInfoItem}>
          <span style={styles.greenInfoLabel}>Slope</span>
          <span style={styles.greenInfoValue}>{(hole.greenContour.slopeSeverity * 10).toFixed(1)}</span>
        </div>
        {recommendation && (
          <div style={styles.greenInfoItem}>
            <span style={styles.greenInfoLabel}>Carry</span>
            <span style={{ ...styles.greenInfoValue, color: '#2dd4bf' }}>
              {dist(recommendation.expectedOutcome.expectedCarryYards)}{dAbbr}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    background: '#091510',
    border: '1px solid #1e4d2b',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px 10px',
    background: 'linear-gradient(135deg, #0d1f17 0%, #1a3a28 100%)',
    borderBottom: '1px solid #1e4d2b',
  },
  headerLeft: {},
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

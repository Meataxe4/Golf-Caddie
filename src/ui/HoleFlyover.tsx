import React, { useMemo, useEffect, useRef } from 'react';
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

/** Offset a GPS coordinate by yards north/east */
function offsetCoord(base: GPSCoordinate, ydsNorth: number, ydsEast: number): [number, number] {
  const metersPerYard = 0.9144;
  const lat = base.lat + (ydsNorth * metersPerYard) / 111320;
  const lng = base.lng + (ydsEast * metersPerYard) / (111320 * Math.cos(base.lat * Math.PI / 180));
  return [lat, lng];
}

/** Calculate bearing between two GPS points (in radians) */
function bearing(a: GPSCoordinate, b: GPSCoordinate): number {
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
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

/** Generate fairway polygon coordinates from center spine */
function generateFairwayCoords(
  centerPoints: GPSCoordinate[],
  holeLength: number,
  par: number,
  tee: GPSCoordinate,
  pin: GPSCoordinate,
): [number, number][] {
  const origin = tee;
  const allPoints = [tee, ...centerPoints, pin];
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < allPoints.length; i++) {
    const p = allPoints[i];
    const t = i / (allPoints.length - 1);

    let halfWidth: number;
    if (t < 0.05) {
      halfWidth = 4;
    } else if (t < 0.15) {
      halfWidth = 4 + (t - 0.05) / 0.1 * 14;
    } else if (t < 0.6) {
      halfWidth = 18 + Math.sin((t - 0.15) / 0.45 * Math.PI) * 6;
    } else if (t < 0.85) {
      halfWidth = 16 - (t - 0.6) / 0.25 * 4;
    } else {
      halfWidth = 12 - (t - 0.85) / 0.15 * 4;
    }

    if (par === 5) halfWidth *= 1.15;
    if (par === 3) halfWidth *= 0.7;

    // Get direction at this point
    let dx: number, dy: number;
    const pYards = gpsToYards(p, origin);
    if (i === 0 && allPoints.length > 1) {
      const next = gpsToYards(allPoints[1], origin);
      dx = next.x - pYards.x;
      dy = next.y - pYards.y;
    } else if (i === allPoints.length - 1) {
      const prev = gpsToYards(allPoints[i - 1], origin);
      dx = pYards.x - prev.x;
      dy = pYards.y - prev.y;
    } else {
      const next = gpsToYards(allPoints[Math.min(i + 1, allPoints.length - 1)], origin);
      const prev = gpsToYards(allPoints[Math.max(i - 1, 0)], origin);
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular in yard space: rotate 90 degrees
    const perpYdsX = -dy / len;
    const perpYdsY = dx / len;

    // Left side
    const lYards = { x: pYards.x + perpYdsX * halfWidth, y: pYards.y + perpYdsY * halfWidth };
    // Convert back to GPS
    const metersPerYard = 0.9144;
    const lLat = origin.lat + (-lYards.y * metersPerYard) / 111320;
    const lLng = origin.lng + (lYards.x * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));
    left.push([lLat, lLng]);

    // Right side
    const rYards = { x: pYards.x - perpYdsX * halfWidth, y: pYards.y - perpYdsY * halfWidth };
    const rLat = origin.lat + (-rYards.y * metersPerYard) / 111320;
    const rLng = origin.lng + (rYards.x * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));
    right.push([rLat, rLng]);
  }

  return [...left, ...right.reverse()];
}

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'yards' }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = (yards: number) => convertDistance(yards, unit);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Compute center and bounds for the hole
  const holeBounds = useMemo(() => {
    const points: [number, number][] = [
      [hole.teePosition.lat, hole.teePosition.lng],
      [hole.pinPosition.lat, hole.pinPosition.lng],
      [hole.greenContour.frontEdge.lat, hole.greenContour.frontEdge.lng],
      [hole.greenContour.backEdge.lat, hole.greenContour.backEdge.lng],
      ...hole.fairwayCenter.map(p => [p.lat, p.lng] as [number, number]),
      ...hole.hazards.map(h => [h.centerPoint.lat, h.centerPoint.lng] as [number, number]),
    ];
    return L.latLngBounds(points).pad(0.15);
  }, [hole]);

  // Ball flight data
  const ballFlight = useMemo(() => {
    if (!recommendation) return null;

    const carry = recommendation.expectedOutcome.expectedCarryYards;
    const offset = recommendation.aimOffset;
    const shape = recommendation.suggestedShape;
    const dispersion = recommendation.expectedOutcome.landingZone.radiusYards;

    const origin = hole.teePosition;
    const pinYards = gpsToYards(hole.pinPosition, origin);
    const d = Math.sqrt(pinYards.x * pinYards.x + pinYards.y * pinYards.y);
    const dirX = pinYards.x / d;
    const dirY = pinYards.y / d;
    const perpX = -dirY;
    const perpY = dirX;

    const landX = dirX * carry + perpX * (offset.yardsRight ?? 0);
    const landY = dirY * carry + perpY * (offset.yardsRight ?? 0);

    const points: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      let px = landX * t;
      let py = landY * t;

      if (shape === 'fade' || shape === 'draw') {
        const curveAmount = shape === 'fade' ? 8 : -8;
        px += perpX * curveAmount * t * t;
        py += perpY * curveAmount * t * t;
      }

      // Convert yard offsets to GPS
      const metersPerYard = 0.9144;
      const lat = origin.lat + (-py * metersPerYard) / 111320;
      const lng = origin.lng + (px * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));
      points.push([lat, lng]);
    }

    const metersPerYard = 0.9144;
    const landLat = origin.lat + (-landY * metersPerYard) / 111320;
    const landLng = origin.lng + (landX * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));

    return { landLatLng: [landLat, landLng] as [number, number], points, dispersionYards: dispersion };
  }, [recommendation, hole]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
    });

    // Satellite tile layer (Esri World Imagery - free, no API key)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
    }).addTo(map);

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Update map view and overlays when hole changes
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    map.fitBounds(holeBounds, { animate: true, duration: 0.5 });

    // --- Rough (wider polygon around fairway) ---
    const roughCoords = generateFairwayCoords(hole.fairwayCenter, hole.lengthYards, hole.par, hole.teePosition, hole.pinPosition);
    // Scale rough outward from center
    const roughCenter: [number, number] = [
      roughCoords.reduce((s, c) => s + c[0], 0) / roughCoords.length,
      roughCoords.reduce((s, c) => s + c[1], 0) / roughCoords.length,
    ];
    const roughExpanded = roughCoords.map(c => [
      roughCenter[0] + (c[0] - roughCenter[0]) * 1.6,
      roughCenter[1] + (c[1] - roughCenter[1]) * 1.6,
    ] as [number, number]);

    L.polygon(roughExpanded, {
      color: '#1a4d1a',
      weight: 0,
      fillColor: '#1f5c1f',
      fillOpacity: 0.35,
    }).addTo(layers);

    // --- Fairway polygon ---
    const fairwayCoords = generateFairwayCoords(hole.fairwayCenter, hole.lengthYards, hole.par, hole.teePosition, hole.pinPosition);

    L.polygon(fairwayCoords, {
      color: '#35883a',
      weight: 1,
      fillColor: '#2d7a2d',
      fillOpacity: 0.45,
    }).addTo(layers);

    // --- Hazards ---
    hole.hazards.forEach((h, i) => {
      const pos: [number, number] = [h.centerPoint.lat, h.centerPoint.lng];

      if (h.type === 'water') {
        L.circle(pos, {
          radius: 12,
          color: '#93c5fd',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 0.5,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#93c5fd;font-size:10px;font-weight:700;text-align:center;text-shadow:0 1px 3px #000;white-space:nowrap">WATER</div>',
            iconSize: [50, 16],
            iconAnchor: [25, -6],
          }),
        }).addTo(layers);
      } else if (h.type === 'bunker' || h.type === 'fairway_bunker') {
        L.circle(pos, {
          radius: h.type === 'fairway_bunker' ? 10 : 7,
          color: '#c9a84c',
          weight: 1.5,
          fillColor: '#f5e6b8',
          fillOpacity: 0.6,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: `<div style="color:#d4a644;font-size:9px;font-weight:700;text-align:center;text-shadow:0 1px 3px #000;white-space:nowrap">${h.type === 'fairway_bunker' ? 'FW BUNKER' : 'BUNKER'}</div>`,
            iconSize: [60, 14],
            iconAnchor: [30, -5],
          }),
        }).addTo(layers);
      } else if (h.type === 'ob') {
        L.circle(pos, {
          radius: 5,
          color: '#ef4444',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 0.2,
          dashArray: '4,3',
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#ef4444;font-size:10px;font-weight:800;text-align:center;text-shadow:0 1px 3px #000">OB</div>',
            iconSize: [30, 14],
            iconAnchor: [15, -4],
          }),
        }).addTo(layers);
      } else if (h.type === 'trees') {
        L.circle(pos, {
          radius: 14,
          color: '#22c55e',
          weight: 1,
          fillColor: '#15502a',
          fillOpacity: 0.4,
        }).addTo(layers);
        L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: '<div style="color:#22c55e;font-size:9px;font-weight:700;text-align:center;text-shadow:0 1px 3px #000">TREES</div>',
            iconSize: [40, 14],
            iconAnchor: [20, -8],
          }),
        }).addTo(layers);
      }
    });

    // --- Layup targets ---
    hole.layupTargets.forEach(l => {
      const pos: [number, number] = [l.position.lat, l.position.lng];
      L.circle(pos, {
        radius: 6,
        color: '#f59e0b',
        weight: 1.5,
        fillColor: '#f59e0b',
        fillOpacity: 0.15,
        dashArray: '3,3',
      }).addTo(layers);
      L.marker(pos, {
        icon: L.divIcon({
          className: '',
          html: `<div style="color:#f59e0b;font-size:9px;font-weight:700;text-align:center;text-shadow:0 1px 3px #000;white-space:nowrap">LAYUP ${dist(l.distanceToGreen)}${dAbbr}</div>`,
          iconSize: [80, 14],
          iconAnchor: [40, 12],
        }),
      }).addTo(layers);
    });

    // --- Yardage markers along the fairway spine ---
    const yardageMarkers = [100, 150, 200, 250].filter(y => y < hole.lengthYards * 0.85);
    const origin = hole.teePosition;
    const pinYards = gpsToYards(hole.pinPosition, origin);
    const holeDist = Math.sqrt(pinYards.x * pinYards.x + pinYards.y * pinYards.y);

    yardageMarkers.forEach(yd => {
      // Position along the fairway spine, yd yards from the pin
      const frac = 1 - yd / hole.lengthYards;
      const spine = [hole.teePosition, ...hole.fairwayCenter, hole.pinPosition];
      const idx = Math.floor(frac * (spine.length - 1));
      const p = spine[Math.min(idx, spine.length - 1)];
      if (!p) return;

      // Offset slightly to the side
      const pYards = gpsToYards(p, origin);
      const nextIdx = Math.min(idx + 1, spine.length - 1);
      const next = gpsToYards(spine[nextIdx], origin);
      const dx = next.x - pYards.x;
      const dy = next.y - pYards.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len * 10;
      const perpY = dx / len * 10;

      const metersPerYard = 0.9144;
      const markerLat = origin.lat + (-(pYards.y + perpY) * metersPerYard) / 111320;
      const markerLng = origin.lng + ((pYards.x + perpX) * metersPerYard) / (111320 * Math.cos(origin.lat * Math.PI / 180));

      L.marker([markerLat, markerLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            background:#2dd4bf;
            color:#0d1f17;
            font-size:11px;
            font-weight:800;
            font-family:system-ui;
            border-radius:50%;
            width:28px;
            height:28px;
            display:flex;
            align-items:center;
            justify-content:center;
            box-shadow:0 2px 6px rgba(0,0,0,0.5);
          ">${dist(yd)}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(layers);
    });

    // --- Green circle ---
    const greenPos: [number, number] = [hole.greenContour.centerGreen.lat, hole.greenContour.centerGreen.lng];
    const greenFront = gpsToYards(hole.greenContour.frontEdge, hole.greenContour.centerGreen);
    const greenBack = gpsToYards(hole.greenContour.backEdge, hole.greenContour.centerGreen);
    const greenRadiusYards = Math.sqrt(
      Math.pow(greenFront.x - greenBack.x, 2) + Math.pow(greenFront.y - greenBack.y, 2)
    ) / 2;
    const greenRadiusMeters = greenRadiusYards * 0.9144;

    // Green fringe
    L.circle(greenPos, {
      radius: greenRadiusMeters * 1.4,
      color: '#2d9d4a',
      weight: 1,
      fillColor: '#2d9d4a',
      fillOpacity: 0.4,
    }).addTo(layers);

    // Putting surface
    L.circle(greenPos, {
      radius: greenRadiusMeters * 1.1,
      color: '#34d06a',
      weight: 2,
      fillColor: '#4ade80',
      fillOpacity: 0.5,
    }).addTo(layers);

    // --- Pin flag marker ---
    const pinPos: [number, number] = [hole.pinPosition.lat, hole.pinPosition.lng];
    L.marker(pinPos, {
      icon: L.divIcon({
        className: '',
        html: `<div style="position:relative;width:20px;height:30px">
          <div style="position:absolute;left:9px;top:0;width:2px;height:28px;background:#e8f0e8"></div>
          <div style="position:absolute;left:11px;top:0;width:0;height:0;border-left:12px solid #ef4444;border-bottom:6px solid transparent;border-top:0"></div>
          <div style="position:absolute;left:6px;top:25px;width:8px;height:8px;border-radius:50%;background:#fff;border:1px solid #ccc"></div>
        </div>`,
        iconSize: [20, 34],
        iconAnchor: [10, 32],
      }),
    }).addTo(layers);

    // --- Tee box marker ---
    const teePos: [number, number] = [hole.teePosition.lat, hole.teePosition.lng];
    L.marker(teePos, {
      icon: L.divIcon({
        className: '',
        html: `<div style="
          background:#4ade80;
          border:2px solid #22c55e;
          border-radius:4px;
          padding:3px 8px;
          color:#0d1f17;
          font-size:10px;
          font-weight:800;
          font-family:system-ui;
          text-align:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
          white-space:nowrap;
        ">TEE</div>`,
        iconSize: [40, 22],
        iconAnchor: [20, 11],
      }),
    }).addTo(layers);

    // --- Ball flight trajectory ---
    if (ballFlight) {
      // Dispersion circle at landing point
      L.circle(ballFlight.landLatLng, {
        radius: ballFlight.dispersionYards * 0.9144,
        color: '#3b82f6',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        dashArray: '4,4',
      }).addTo(layers);

      // Flight path line
      L.polyline(ballFlight.points, {
        color: '#ffffff',
        weight: 3,
        opacity: 0.9,
      }).addTo(layers);

      // Glow effect
      L.polyline(ballFlight.points, {
        color: '#60a5fa',
        weight: 7,
        opacity: 0.2,
      }).addTo(layers);

      // Landing point
      L.circleMarker(ballFlight.landLatLng, {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.8,
      }).addTo(layers);
    }

    // --- GPS Player Position ---
    if (gpsPosition) {
      const playerPos: [number, number] = [gpsPosition.lat, gpsPosition.lng];

      // Accuracy circle
      if (gpsAccuracy && gpsAccuracy < 50) {
        L.circle(playerPos, {
          radius: gpsAccuracy,
          color: '#3b82f6',
          weight: 1,
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
        }).addTo(layers);
      }

      // Distance line to pin
      L.polyline([playerPos, pinPos], {
        color: '#60a5fa',
        weight: 1.5,
        dashArray: '6,4',
        opacity: 0.6,
      }).addTo(layers);

      // Distance label
      if (distanceToPin) {
        const midLat = (playerPos[0] + pinPos[0]) / 2;
        const midLng = (playerPos[1] + pinPos[1]) / 2;
        L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              background:#0d1f17ee;
              color:#60a5fa;
              font-size:11px;
              font-weight:800;
              font-family:system-ui;
              padding:2px 8px;
              border-radius:6px;
              text-align:center;
              box-shadow:0 2px 6px rgba(0,0,0,0.5);
              white-space:nowrap;
            ">${dist(distanceToPin)}${dAbbr}</div>`,
            iconSize: [60, 20],
            iconAnchor: [30, 10],
          }),
        }).addTo(layers);
      }

      // Player dot
      L.circleMarker(playerPos, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      }).addTo(layers);
      // Inner dot
      L.circleMarker(playerPos, {
        radius: 3,
        color: '#ffffff',
        weight: 0,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }).addTo(layers);
    }

    // --- Recommended club badge (as map control) ---
    if (recommendation) {
      L.marker([holeBounds.getSouth(), holeBounds.getEast()], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            background:#2dd4bf;
            color:#0d1f17;
            font-size:13px;
            font-weight:800;
            font-family:system-ui;
            padding:5px 14px;
            border-radius:8px;
            text-align:center;
            box-shadow:0 2px 8px rgba(0,0,0,0.5);
            white-space:nowrap;
          ">${clubLabel(recommendation.club)}</div>`,
          iconSize: [70, 28],
          iconAnchor: [70, 28],
        }),
      }).addTo(layers);
    }
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
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#d4a644' }} /> Bunker</span>
          )}
          {hole.hazards.some(h => h.type === 'ob') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#ef4444' }} /> OB</span>
          )}
          {hole.hazards.some(h => h.type === 'trees') && (
            <span style={styles.hazardChip}><span style={{ ...styles.hazardDot, background: '#22c55e' }} /> Trees</span>
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
  holeLabel: {
    fontSize: 18,
    fontWeight: 900,
    color: '#f1f5f9',
    letterSpacing: 1,
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  parLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#22c55e',
  },
  divider: {
    fontSize: 10,
    color: '#1e4d2b',
  },
  ydsLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#8faa97',
  },
  hcpLabel: {
    fontSize: 11,
    color: '#5a7a65',
  },
  doglegBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    background: '#f59e0b20',
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  mapContainer: {
    width: '100%',
    height: 400,
    background: '#0d1f17',
  },
  hazardLegend: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '8px 12px',
    background: '#0d1f17',
    borderTop: '1px solid #1e4d2b',
  },
  hazardChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: '#8faa97',
    fontWeight: 600,
  },
  hazardDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  greenInfo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 1,
    background: '#0d1f17',
    borderTop: '1px solid #1e4d2b',
  },
  greenInfoItem: {
    textAlign: 'center' as const,
    padding: '8px 4px',
    background: '#091510',
  },
  greenInfoLabel: {
    display: 'block',
    fontSize: 8,
    color: '#5a7a65',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  greenInfoValue: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: '#e8f0e8',
    marginTop: 1,
    textTransform: 'capitalize' as const,
  },
};

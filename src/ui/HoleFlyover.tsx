import React, { useMemo } from 'react';
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

// Convert GPS coordinates to relative yard positions
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

function getBounds(points: { x: number; y: number }[], padding: number = 50) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX: minX - padding, maxX: maxX + padding,
    minY: minY - padding, maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// Generate smooth fairway polygon from center spine
function generateFairwayShape(
  centerPoints: { x: number; y: number }[],
  holeLength: number,
  par: number,
): { left: { x: number; y: number }[]; right: { x: number; y: number }[] } {
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];

  for (let i = 0; i < centerPoints.length; i++) {
    const p = centerPoints[i];
    const t = i / (centerPoints.length - 1); // 0 to 1 along hole

    // Fairway width varies: narrow at tee, wide in landing zone, narrows to green
    let halfWidth: number;
    if (t < 0.05) {
      halfWidth = 4; // Tee area
    } else if (t < 0.15) {
      halfWidth = 4 + (t - 0.05) / 0.1 * 14; // Widen out
    } else if (t < 0.6) {
      halfWidth = 18 + Math.sin((t - 0.15) / 0.45 * Math.PI) * 6; // Landing zone - widest
    } else if (t < 0.85) {
      halfWidth = 16 - (t - 0.6) / 0.25 * 4; // Approach - narrowing
    } else {
      halfWidth = 12 - (t - 0.85) / 0.15 * 4; // Near green - narrow
    }

    // Par 5s have wider fairways
    if (par === 5) halfWidth *= 1.15;
    // Par 3s have narrower
    if (par === 3) halfWidth *= 0.7;

    // Calculate perpendicular direction
    let dx: number, dy: number;
    if (i === 0 && centerPoints.length > 1) {
      dx = centerPoints[1].x - p.x;
      dy = centerPoints[1].y - p.y;
    } else if (i === centerPoints.length - 1 && centerPoints.length > 1) {
      dx = p.x - centerPoints[i - 1].x;
      dy = p.y - centerPoints[i - 1].y;
    } else if (centerPoints.length > 2) {
      dx = centerPoints[Math.min(i + 1, centerPoints.length - 1)].x - centerPoints[Math.max(i - 1, 0)].x;
      dy = centerPoints[Math.min(i + 1, centerPoints.length - 1)].y - centerPoints[Math.max(i - 1, 0)].y;
    } else {
      dx = 1; dy = 0;
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // Add slight natural waviness
    const wave = Math.sin(t * Math.PI * 3) * 1.5;
    left.push({ x: p.x + nx * (halfWidth + wave), y: p.y + ny * (halfWidth + wave) });
    right.push({ x: p.x - nx * (halfWidth - wave), y: p.y - ny * (halfWidth - wave) });
  }

  return { left, right };
}

// Generate tree positions along the rough
function generateTrees(
  fairwayLeft: { x: number; y: number }[],
  fairwayRight: { x: number; y: number }[],
  count: number,
  seed: number,
): { x: number; y: number; r: number }[] {
  const trees: { x: number; y: number; r: number }[] = [];
  const rng = (s: number) => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const side = rng(s + i * 17) > 0.5 ? 'left' : 'right';
    const edge = side === 'left' ? fairwayLeft : fairwayRight;
    const idx = Math.floor(rng(s + i * 31) * (edge.length - 1));
    const p = edge[idx];
    if (!p) continue;

    s = (s * 9301 + 49297) % 233280;
    const offset = 8 + rng(s + i * 47) * 18;
    const perpDir = side === 'left' ? 1 : -1;

    // Offset away from fairway
    const nextIdx = Math.min(idx + 1, edge.length - 1);
    const dx = edge[nextIdx].x - p.x;
    const dy = edge[nextIdx].y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * perpDir;
    const ny = (dx / len) * perpDir;

    trees.push({
      x: p.x + nx * offset,
      y: p.y + ny * offset,
      r: 2.5 + rng(s + i * 73) * 3,
    });
  }
  return trees;
}

// Generate bunker shape (irregular ellipse)
function bunkerPath(cx: number, cy: number, rx: number, ry: number, rotation: number, seed: number): string {
  const points: string[] = [];
  const numPoints = 12;
  const rng = (s: number) => ((s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const wobble = 0.75 + rng(seed + i * 37) * 0.5;
    const r = rotation * Math.PI / 180;
    const px = cx + (Math.cos(angle) * rx * wobble) * Math.cos(r) - (Math.sin(angle) * ry * wobble) * Math.sin(r);
    const py = cy + (Math.cos(angle) * rx * wobble) * Math.sin(r) + (Math.sin(angle) * ry * wobble) * Math.cos(r);
    points.push(`${i === 0 ? 'M' : 'L'}${px},${py}`);
  }
  return points.join(' ') + 'Z';
}

// Generate water shape (larger, more irregular)
function waterPath(cx: number, cy: number, size: number, seed: number): string {
  const points: string[] = [];
  const numPoints = 16;
  const rng = (s: number) => ((s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const r = size * (0.6 + rng(seed + i * 41) * 0.8);
    const px = cx + Math.cos(angle) * r * 1.4;
    const py = cy + Math.sin(angle) * r;
    points.push(`${i === 0 ? 'M' : 'L'}${px},${py}`);
  }
  return points.join(' ') + 'Z';
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    const cpy = (prev.y + curr.y) / 2;
    d += ` Q${prev.x},${prev.y} ${cpx},${cpy}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
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

export function HoleFlyover({ hole, currentHole, recommendation, player, gpsPosition, gpsAccuracy, distanceToPin, unit = 'yards' }: Props) {
  const dAbbr = distanceAbbrev(unit);
  const dist = (yards: number) => convertDistance(yards, unit);
  const layout = useMemo(() => {
    const origin = hole.teePosition;
    const tee = gpsToYards(hole.teePosition, origin);
    const pin = gpsToYards(hole.pinPosition, origin);
    const green = {
      front: gpsToYards(hole.greenContour.frontEdge, origin),
      back: gpsToYards(hole.greenContour.backEdge, origin),
      center: gpsToYards(hole.greenContour.centerGreen, origin),
    };

    // Build full center spine: tee → fairway points → green
    const fairwayRaw = hole.fairwayCenter.map(p => gpsToYards(p, origin));

    // For doglegs, insert a bend point
    let fairwaySpine = [tee, ...fairwayRaw, green.center];

    // Interpolate more points for smoother fairway
    const interpolated: { x: number; y: number }[] = [];
    for (let i = 0; i < fairwaySpine.length - 1; i++) {
      const a = fairwaySpine[i];
      const b = fairwaySpine[i + 1];
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        interpolated.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    interpolated.push(fairwaySpine[fairwaySpine.length - 1]);

    const fairwayShape = generateFairwayShape(interpolated, hole.lengthYards, hole.par);

    const hazards = hole.hazards.map(h => ({
      ...h,
      pos: gpsToYards(h.centerPoint, origin),
    }));

    const layups = hole.layupTargets.map(l => ({
      ...l,
      pos: gpsToYards(l.position, origin),
    }));

    // Calculate hole direction angle for bunker rotation
    const holeAngle = Math.atan2(pin.x - tee.x, pin.y - tee.y) * 180 / Math.PI;

    // Generate trees
    const trees = generateTrees(
      fairwayShape.left, fairwayShape.right,
      hole.par === 3 ? 12 : hole.par === 5 ? 28 : 20,
      currentHole * 1000,
    );

    // All points for bounds
    const allPoints = [
      tee, pin, green.front, green.back,
      ...fairwayShape.left, ...fairwayShape.right,
      ...hazards.map(h => h.pos),
      ...trees,
    ];
    const bounds = getBounds(allPoints, 45);

    return { tee, pin, green, fairwaySpine: interpolated, fairwayShape, hazards, layups, trees, bounds, holeAngle };
  }, [hole, currentHole]);

  // Ball flight path from recommendation
  const ballFlight = useMemo(() => {
    if (!recommendation) return null;

    const carry = recommendation.expectedOutcome.expectedCarryYards;
    const offset = recommendation.aimOffset;
    const shape = recommendation.suggestedShape;
    const dispersion = recommendation.expectedOutcome.landingZone.radiusYards;

    const dx = layout.pin.x - layout.tee.x;
    const dy = layout.pin.y - layout.tee.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / dist;
    const dirY = dy / dist;
    const perpX = -dirY;
    const perpY = dirX;

    const landX = layout.tee.x + dirX * carry + perpX * (offset.yardsRight ?? 0);
    const landY = layout.tee.y + dirY * carry + perpY * (offset.yardsRight ?? 0);

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      let px = layout.tee.x + (landX - layout.tee.x) * t;
      let py = layout.tee.y + (landY - layout.tee.y) * t;

      if (shape === 'fade' || shape === 'draw') {
        const curveAmount = shape === 'fade' ? 8 : -8;
        px += perpX * curveAmount * t * t;
        py += perpY * curveAmount * t * t;
      }
      points.push({ x: px, y: py });
    }

    return { land: { x: landX, y: landY }, points, dispersion };
  }, [recommendation, layout]);

  const { bounds } = layout;

  const svgWidth = 400;
  const svgHeight = Math.max(450, (bounds.height / bounds.width) * svgWidth);
  const scale = svgWidth / bounds.width;

  const toSvg = (p: { x: number; y: number }) => ({
    x: (p.x - bounds.minX) * scale,
    y: (p.y - bounds.minY) * scale,
  });

  const teeSvg = toSvg(layout.tee);
  const pinSvg = toSvg(layout.pin);
  const greenCenter = toSvg(layout.green.center);
  const greenFront = toSvg(layout.green.front);
  const greenBack = toSvg(layout.green.back);
  const greenRadius = Math.sqrt(
    Math.pow(greenFront.x - greenBack.x, 2) + Math.pow(greenFront.y - greenBack.y, 2)
  ) / 2;

  // Fairway polygon SVG path
  const fwLeft = layout.fairwayShape.left.map(toSvg);
  const fwRight = layout.fairwayShape.right.map(toSvg);
  const fairwayPolygon = [
    ...fwLeft.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`),
    ...fwRight.reverse().map((p) => `L${p.x},${p.y}`),
    'Z',
  ].join(' ');

  // Rough/fringe polygon (wider than fairway)
  const roughLeft = layout.fairwayShape.left.map((p, i) => {
    const s = toSvg(p);
    const c = toSvg(layout.fairwaySpine[Math.min(i, layout.fairwaySpine.length - 1)] ?? layout.fairwaySpine[0]);
    const dx = s.x - c.x;
    const dy = s.y - c.y;
    return { x: s.x + dx * 0.7, y: s.y + dy * 0.7 };
  });
  const roughRight = layout.fairwayShape.right.map((p, i) => {
    const s = toSvg(p);
    const c = toSvg(layout.fairwaySpine[Math.min(i, layout.fairwaySpine.length - 1)] ?? layout.fairwaySpine[0]);
    const dx = s.x - c.x;
    const dy = s.y - c.y;
    return { x: s.x + dx * 0.7, y: s.y + dy * 0.7 };
  });
  const roughPolygon = [
    ...roughLeft.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`),
    ...roughRight.reverse().map((p) => `L${p.x},${p.y}`),
    'Z',
  ].join(' ');

  // Trees in SVG space
  const treeSvg = layout.trees.map(t => ({ ...toSvg(t), r: t.r * scale * 0.8 }));

  // Yardage markers (from pin)
  const yardageMarkers = [100, 150, 200, 250].filter(y => y < hole.lengthYards * 0.85);

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

      {/* SVG Course Map */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={styles.svg}
      >
        <defs>
          {/* Grass gradient for rough */}
          <radialGradient id={`rough-${currentHole}`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1a3a1a" />
            <stop offset="100%" stopColor="#0d260d" />
          </radialGradient>

          {/* Fairway gradient */}
          <linearGradient id={`fairway-${currentHole}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2d7a2d" />
            <stop offset="50%" stopColor="#35883a" />
            <stop offset="100%" stopColor="#2d7a2d" />
          </linearGradient>

          {/* Light rough */}
          <linearGradient id={`lightrough-${currentHole}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1f5c1f" />
            <stop offset="100%" stopColor="#1a4d1a" />
          </linearGradient>

          {/* Green gradient */}
          <radialGradient id={`green-${currentHole}`} cx="45%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="60%" stopColor="#34d06a" />
            <stop offset="100%" stopColor="#22c55e" />
          </radialGradient>

          {/* Sand gradient */}
          <radialGradient id={`sand-${currentHole}`} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#f5e6b8" />
            <stop offset="100%" stopColor="#d4b96a" />
          </radialGradient>

          {/* Water gradient */}
          <radialGradient id={`water-${currentHole}`} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </radialGradient>

          {/* Ball glow */}
          <filter id="ballGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Drop shadow for elements */}
          <filter id="shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Background - rough */}
        <rect x="0" y="0" width={svgWidth} height={svgHeight} fill={`url(#rough-${currentHole})`} />

        {/* Background rough texture - small dots */}
        {Array.from({ length: 60 }, (_, i) => {
          const s = ((i * 7919 + currentHole * 1009) % 233280) / 233280;
          const s2 = ((i * 4567 + currentHole * 2003) % 233280) / 233280;
          return (
            <circle
              key={`roughtex-${i}`}
              cx={s * svgWidth}
              cy={s2 * svgHeight}
              r={0.8}
              fill="#0f3d0f"
              opacity={0.3}
            />
          );
        })}

        {/* Light rough / first cut */}
        <path d={roughPolygon} fill={`url(#lightrough-${currentHole})`} opacity={0.9} />

        {/* Fairway */}
        <path d={fairwayPolygon} fill={`url(#fairway-${currentHole})`} />

        {/* Fairway mowing stripes */}
        {layout.fairwaySpine.filter((_, i) => i % 3 === 0).map((p, i) => {
          const s = toSvg(p);
          const next = layout.fairwaySpine[Math.min(i * 3 + 1, layout.fairwaySpine.length - 1)];
          const nextSvg = toSvg(next);
          const dx = nextSvg.x - s.x;
          const dy = nextSvg.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const w = 8 * scale;
          return (
            <line
              key={`stripe-${i}`}
              x1={s.x + nx * w} y1={s.y + ny * w}
              x2={s.x - nx * w} y2={s.y - ny * w}
              stroke={i % 2 === 0 ? '#3a9943' : '#2d8535'}
              strokeWidth={1}
              opacity={0.25}
            />
          );
        })}

        {/* Fairway center line (subtle) */}
        <polyline
          points={layout.fairwaySpine.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' ')}
          fill="none"
          stroke="#4ade80"
          strokeWidth={0.5}
          strokeDasharray="2,6"
          opacity={0.2}
        />

        {/* Trees */}
        {treeSvg.map((t, i) => (
          <g key={`tree-${i}`}>
            {/* Shadow */}
            <ellipse cx={t.x + 1} cy={t.y + 1.5} rx={t.r * 1.1} ry={t.r * 0.7} fill="#000" opacity={0.15} />
            {/* Tree canopy */}
            <circle
              cx={t.x} cy={t.y}
              r={t.r}
              fill={`hsl(${130 + (i % 5) * 4}, ${50 + (i % 3) * 8}%, ${18 + (i % 4) * 3}%)`}
            />
            {/* Highlight */}
            <circle
              cx={t.x - t.r * 0.25} cy={t.y - t.r * 0.25}
              r={t.r * 0.4}
              fill="#2d8a2d"
              opacity={0.3}
            />
          </g>
        ))}

        {/* Hazards */}
        {layout.hazards.map((h, i) => {
          const pos = toSvg(h.pos);
          const isWater = h.type === 'water';
          const isBunker = h.type === 'bunker' || h.type === 'fairway_bunker';
          const isOB = h.type === 'ob';
          const isTrees = h.type === 'trees';

          if (isWater) {
            const path = waterPath(pos.x, pos.y, 14 * scale * 0.3, currentHole * 100 + i * 50);
            return (
              <g key={`hazard-${i}`}>
                <path d={path} fill={`url(#water-${currentHole})`} opacity={0.8} />
                <path d={path} fill="none" stroke="#93c5fd" strokeWidth={1} opacity={0.5} />
                {/* Water shimmer */}
                <circle cx={pos.x - 3} cy={pos.y - 2} r={1.5} fill="#93c5fd" opacity={0.4} />
                <circle cx={pos.x + 4} cy={pos.y + 1} r={1} fill="#93c5fd" opacity={0.3} />
                {/* Label */}
                <text x={pos.x} y={pos.y + 16 * scale * 0.3} textAnchor="middle"
                  fill="#93c5fd" fontSize={7} fontWeight={700} fontFamily="system-ui">
                  WATER
                </text>
              </g>
            );
          }

          if (isBunker) {
            const rx = (h.type === 'fairway_bunker' ? 10 : 7) * scale * 0.3;
            const ry = rx * 0.7;
            const path = bunkerPath(pos.x, pos.y, rx, ry, layout.holeAngle + i * 30, currentHole * 100 + i * 70);
            return (
              <g key={`hazard-${i}`}>
                {/* Shadow */}
                <path d={bunkerPath(pos.x + 1, pos.y + 1.5, rx * 1.05, ry * 1.05, layout.holeAngle + i * 30, currentHole * 100 + i * 70)}
                  fill="#000" opacity={0.15} />
                {/* Sand */}
                <path d={path} fill={`url(#sand-${currentHole})`} />
                <path d={path} fill="none" stroke="#c9a84c" strokeWidth={0.8} opacity={0.6} />
                {/* Label */}
                <text x={pos.x} y={pos.y + ry + 8} textAnchor="middle"
                  fill="#d4a644" fontSize={6} fontWeight={600} fontFamily="system-ui" opacity={0.8}>
                  {h.type === 'fairway_bunker' ? 'FW BUNKER' : 'BUNKER'}
                </text>
              </g>
            );
          }

          if (isOB) {
            return (
              <g key={`hazard-${i}`}>
                <circle cx={pos.x} cy={pos.y} r={3} fill="none" stroke="#ef4444" strokeWidth={1.5} />
                <line x1={pos.x - 8} y1={pos.y} x2={pos.x + 8} y2={pos.y}
                  stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
                <text x={pos.x} y={pos.y + 12} textAnchor="middle"
                  fill="#ef4444" fontSize={6} fontWeight={700} fontFamily="system-ui">
                  OB
                </text>
              </g>
            );
          }

          if (isTrees) {
            // Cluster of trees
            return (
              <g key={`hazard-${i}`}>
                {[-4, 0, 4, -2, 2].map((ox, j) => (
                  <circle key={j}
                    cx={pos.x + ox} cy={pos.y + (j % 2 === 0 ? -2 : 2)}
                    r={3.5} fill="#15502a" />
                ))}
                <text x={pos.x} y={pos.y + 14} textAnchor="middle"
                  fill="#22c55e" fontSize={6} fontWeight={600} fontFamily="system-ui" opacity={0.7}>
                  TREES
                </text>
              </g>
            );
          }

          return null;
        })}

        {/* Layup targets */}
        {layout.layups.map((l, i) => {
          const pos = toSvg(l.pos);
          return (
            <g key={`layup-${i}`}>
              <circle cx={pos.x} cy={pos.y} r={6} fill="none"
                stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
              <line x1={pos.x - 3} y1={pos.y} x2={pos.x + 3} y2={pos.y}
                stroke="#f59e0b" strokeWidth={0.8} opacity={0.5} />
              <line x1={pos.x} y1={pos.y - 3} x2={pos.x} y2={pos.y + 3}
                stroke="#f59e0b" strokeWidth={0.8} opacity={0.5} />
              <text x={pos.x} y={pos.y - 9} textAnchor="middle"
                fill="#f59e0b" fontSize={6} fontWeight={600} fontFamily="system-ui" opacity={0.7}>
                LAYUP {dist(l.distanceToGreen)}{dAbbr}
              </text>
            </g>
          );
        })}

        {/* Yardage markers */}
        {yardageMarkers.map(yd => {
          const frac = 1 - yd / hole.lengthYards;
          const spineIdx = Math.floor(frac * (layout.fairwaySpine.length - 1));
          const p = layout.fairwaySpine[spineIdx];
          if (!p) return null;
          const s = toSvg(p);

          // Perpendicular markers
          const nextIdx = Math.min(spineIdx + 1, layout.fairwaySpine.length - 1);
          const next = toSvg(layout.fairwaySpine[nextIdx]);
          const dx = next.x - s.x;
          const dy = next.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;

          return (
            <g key={`yd-${yd}`}>
              <line
                x1={s.x + nx * 6} y1={s.y + ny * 6}
                x2={s.x - nx * 6} y2={s.y - ny * 6}
                stroke="#ffffff" strokeWidth={0.8} opacity={0.25}
              />
              <rect x={s.x + nx * 8 - 10} y={s.y + ny * 8 - 5} width={20} height={10}
                rx={3} fill="#0f172a" opacity={0.7} />
              <text x={s.x + nx * 8} y={s.y + ny * 8 + 3}
                textAnchor="middle" fill="#94a3b8" fontSize={7} fontWeight={700} fontFamily="system-ui">
                {dist(yd)}
              </text>
            </g>
          );
        })}

        {/* Green */}
        <g filter="url(#shadow)">
          {/* Green fringe */}
          <ellipse
            cx={greenCenter.x} cy={greenCenter.y}
            rx={greenRadius * 1.6} ry={greenRadius * 1.3}
            fill="#2d9d4a" opacity={0.5}
          />
          {/* Putting surface */}
          <ellipse
            cx={greenCenter.x} cy={greenCenter.y}
            rx={greenRadius * 1.35} ry={greenRadius * 1.05}
            fill={`url(#green-${currentHole})`}
          />
          {/* Green contour lines */}
          <ellipse
            cx={greenCenter.x - 1} cy={greenCenter.y + 1}
            rx={greenRadius * 0.8} ry={greenRadius * 0.6}
            fill="none" stroke="#5eeb8c" strokeWidth={0.5} opacity={0.3}
          />
          <ellipse
            cx={greenCenter.x - 2} cy={greenCenter.y + 2}
            rx={greenRadius * 0.45} ry={greenRadius * 0.35}
            fill="none" stroke="#5eeb8c" strokeWidth={0.4} opacity={0.2}
          />
        </g>

        {/* Slope arrow on green */}
        {hole.greenContour.slopeSeverity > 0.2 && (() => {
          const slopeRad = (hole.greenContour.slopeDirection * Math.PI) / 180;
          const arrowLen = greenRadius * 0.5;
          const sx = greenCenter.x;
          const sy = greenCenter.y;
          const ex = sx + Math.sin(slopeRad) * arrowLen;
          const ey = sy - Math.cos(slopeRad) * arrowLen;
          return (
            <g opacity={0.4}>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#fff" strokeWidth={1} />
              <polygon
                points={`${ex},${ey} ${ex - 2},${ey + 3} ${ex + 2},${ey + 3}`}
                fill="#fff"
              />
            </g>
          );
        })()}

        {/* Pin flag */}
        <g filter="url(#shadow)">
          {/* Flagstick */}
          <line x1={pinSvg.x} y1={pinSvg.y + 2} x2={pinSvg.x} y2={pinSvg.y - 18}
            stroke="#e2e8f0" strokeWidth={1.2} />
          {/* Flag */}
          <polygon
            points={`${pinSvg.x},${pinSvg.y - 18} ${pinSvg.x + 10},${pinSvg.y - 14} ${pinSvg.x},${pinSvg.y - 10}`}
            fill="#ef4444"
          />
          {/* Pin base */}
          <circle cx={pinSvg.x} cy={pinSvg.y} r={2.5} fill="#ffffff" />
        </g>

        {/* Tee box */}
        <g filter="url(#shadow)">
          {/* Tee ground */}
          <rect
            x={teeSvg.x - 10} y={teeSvg.y - 5}
            width={20} height={10} rx={3}
            fill="#4ade80" stroke="#22c55e" strokeWidth={0.8}
          />
          {/* Tee markers */}
          <circle cx={teeSvg.x - 4} cy={teeSvg.y} r={1.5} fill="#ffffff" />
          <circle cx={teeSvg.x + 4} cy={teeSvg.y} r={1.5} fill="#ffffff" />
          {/* Label */}
          <text x={teeSvg.x} y={teeSvg.y + 16} textAnchor="middle"
            fill="#e2e8f0" fontSize={8} fontWeight={800} fontFamily="system-ui">
            TEE
          </text>
        </g>

        {/* Ball flight trajectory */}
        {ballFlight && (
          <g>
            {/* Dispersion zone */}
            {(() => {
              const land = toSvg(ballFlight.land);
              const r = ballFlight.dispersion * scale;
              return (
                <>
                  <circle cx={land.x} cy={land.y} r={r}
                    fill="#3b82f610" stroke="#3b82f6" strokeWidth={0.8}
                    strokeDasharray="3,3" opacity={0.5} />
                </>
              );
            })()}

            {/* Flight path shadow */}
            <polyline
              points={ballFlight.points.map(p => {
                const s = toSvg(p);
                return `${s.x + 1},${s.y + 1.5}`;
              }).join(' ')}
              fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" opacity={0.15}
            />

            {/* Flight path */}
            <polyline
              points={ballFlight.points.map(p => {
                const s = toSvg(p);
                return `${s.x},${s.y}`;
              }).join(' ')}
              fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" opacity={0.9}
            />

            {/* Glow effect on path */}
            <polyline
              points={ballFlight.points.map(p => {
                const s = toSvg(p);
                return `${s.x},${s.y}`;
              }).join(' ')}
              fill="none" stroke="#60a5fa" strokeWidth={5} strokeLinecap="round" opacity={0.15}
            />

            {/* Animated dot */}
            <circle r={4} fill="#ffffff" filter="url(#ballGlow)">
              <animateMotion
                dur="2.5s" repeatCount="indefinite"
                path={ballFlight.points.map((p, i) => {
                  const s = toSvg(p);
                  return `${i === 0 ? 'M' : 'L'}${s.x},${s.y}`;
                }).join(' ')}
              />
            </circle>

            {/* Landing point */}
            {(() => {
              const land = toSvg(ballFlight.land);
              return (
                <g>
                  <circle cx={land.x} cy={land.y} r={5} fill="#3b82f6" opacity={0.3} />
                  <circle cx={land.x} cy={land.y} r={3} fill="#3b82f6" stroke="#fff" strokeWidth={1} />
                </g>
              );
            })()}
          </g>
        )}

        {/* Recommended club badge */}
        {recommendation && (
          <g>
            <rect x={svgWidth - 78} y={svgHeight - 34} width={70} height={26} rx={8}
              fill="#22c55e" filter="url(#shadow)" />
            <text x={svgWidth - 43} y={svgHeight - 17} textAnchor="middle"
              fill="#0f172a" fontSize={11} fontWeight={800} fontFamily="system-ui">
              {clubLabel(recommendation.club)}
            </text>
          </g>
        )}

        {/* Dogleg indicator */}
        {hole.doglegDirection && hole.doglegDirection !== 'straight' && hole.doglegYards && (
          <g>
            <rect x={6} y={6} width={110} height={18} rx={4} fill="#0f172a" opacity={0.7} />
            <text x={61} y={18} textAnchor="middle"
              fill="#f59e0b" fontSize={7} fontWeight={700} fontFamily="system-ui">
              DOGLEG {hole.doglegDirection.toUpperCase()} ~{dist(hole.doglegYards)}{dAbbr}
            </text>
          </g>
        )}

        {/* GPS Player Position */}
        {gpsPosition && (() => {
          const playerYards = gpsToYards(gpsPosition, hole.teePosition);
          const playerSvg = toSvg(playerYards);
          // Check if position is within reasonable bounds
          if (playerSvg.x < -20 || playerSvg.x > svgWidth + 20 ||
              playerSvg.y < -20 || playerSvg.y > svgHeight + 20) return null;

          return (
            <g>
              {/* Accuracy circle */}
              {gpsAccuracy && gpsAccuracy < 50 && (
                <circle cx={playerSvg.x} cy={playerSvg.y}
                  r={Math.max(4, (gpsAccuracy / 0.9144) * scale)}
                  fill="#3b82f610" stroke="#3b82f630" strokeWidth={0.5} />
              )}
              {/* Distance line to pin */}
              <line x1={playerSvg.x} y1={playerSvg.y} x2={pinSvg.x} y2={pinSvg.y}
                stroke="#60a5fa" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
              {/* Distance label */}
              {distanceToPin && (() => {
                const mx = (playerSvg.x + pinSvg.x) / 2;
                const my = (playerSvg.y + pinSvg.y) / 2;
                return (
                  <g>
                    <rect x={mx - 18} y={my - 7} width={36} height={14} rx={4}
                      fill="#0f172a" opacity={0.85} />
                    <text x={mx} y={my + 3.5} textAnchor="middle"
                      fill="#60a5fa" fontSize={8} fontWeight={800} fontFamily="system-ui">
                      {dist(distanceToPin)}{dAbbr}
                    </text>
                  </g>
                );
              })()}
              {/* Pulsing player dot */}
              <circle cx={playerSvg.x} cy={playerSvg.y} r={8}
                fill="#3b82f6" opacity={0.2}>
                <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={playerSvg.x} cy={playerSvg.y} r={5}
                fill="#3b82f6" stroke="#ffffff" strokeWidth={2} />
              <circle cx={playerSvg.x} cy={playerSvg.y} r={2} fill="#ffffff" />
            </g>
          );
        })()}
      </svg>

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
            <span style={{ ...styles.greenInfoValue, color: '#22c55e' }}>
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
    background: '#0f1d0f',
    border: '1px solid #1e3a1e',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px 10px',
    background: 'linear-gradient(135deg, #0f172a 0%, #1a2e1a 100%)',
    borderBottom: '1px solid #1e3a1e',
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
    color: '#334155',
  },
  ydsLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
  },
  hcpLabel: {
    fontSize: 11,
    color: '#64748b',
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
  svg: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  hazardLegend: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '8px 12px',
    background: '#0f172a',
    borderTop: '1px solid #1e3a1e',
  },
  hazardChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: '#94a3b8',
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
    background: '#0f172a',
    borderTop: '1px solid #1e3a1e',
  },
  greenInfoItem: {
    textAlign: 'center' as const,
    padding: '8px 4px',
    background: '#0f1d0f',
  },
  greenInfoLabel: {
    display: 'block',
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  greenInfoValue: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: '#e2e8f0',
    marginTop: 1,
    textTransform: 'capitalize' as const,
  },
};

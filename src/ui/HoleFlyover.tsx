import React, { useMemo } from 'react';
import type { HoleLayout, ShotRecommendation, PlayerProfile, ClubProfile } from '../models/types';

interface Props {
  hole: HoleLayout;
  currentHole: number;
  recommendation: ShotRecommendation | null;
  player: PlayerProfile;
  selectedClub?: string;
}

// Convert GPS coordinates to relative yard positions for SVG rendering
function gpsToYards(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number },
): { x: number; y: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  const metersPerYard = 0.9144;

  const dy = (point.lat - origin.lat) * metersPerDegLat / metersPerYard;
  const dx = (point.lng - origin.lng) * metersPerDegLng / metersPerYard;

  return { x: dx, y: -dy }; // flip Y so north is up
}

// Get the bounding box of all points with padding
function getBounds(points: { x: number; y: number }[], padding: number = 30) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minY: minY - padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

const HAZARD_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  water: { fill: '#3b82f640', stroke: '#3b82f6', label: 'Water' },
  bunker: { fill: '#fbbf2440', stroke: '#fbbf24', label: 'Bunker' },
  fairway_bunker: { fill: '#f59e0b40', stroke: '#f59e0b', label: 'FW Bunker' },
  ob: { fill: '#ef444430', stroke: '#ef4444', label: 'OB' },
  trees: { fill: '#16a34a30', stroke: '#16a34a', label: 'Trees' },
  waste_area: { fill: '#78716c30', stroke: '#78716c', label: 'Waste' },
};

export function HoleFlyover({ hole, currentHole, recommendation, player }: Props) {
  const layout = useMemo(() => {
    const origin = hole.teePosition;
    const tee = gpsToYards(hole.teePosition, origin);
    const pin = gpsToYards(hole.pinPosition, origin);
    const green = {
      front: gpsToYards(hole.greenContour.frontEdge, origin),
      back: gpsToYards(hole.greenContour.backEdge, origin),
      center: gpsToYards(hole.greenContour.centerGreen, origin),
    };
    const fairway = hole.fairwayCenter.map(p => gpsToYards(p, origin));
    const hazards = hole.hazards.map(h => ({
      ...h,
      pos: gpsToYards(h.centerPoint, origin),
    }));
    const layups = hole.layupTargets.map(l => ({
      ...l,
      pos: gpsToYards(l.position, origin),
    }));

    // All points for bounds calculation
    const allPoints = [tee, pin, green.front, green.back, ...fairway, ...hazards.map(h => h.pos)];
    const bounds = getBounds(allPoints, 40);

    return { tee, pin, green, fairway, hazards, layups, bounds };
  }, [hole]);

  // Calculate ball flight from recommendation
  const ballFlight = useMemo(() => {
    if (!recommendation) return null;

    const carry = recommendation.expectedOutcome.expectedCarryYards;
    const offset = recommendation.aimOffset;
    const shape = recommendation.suggestedShape;
    const dispersion = recommendation.expectedOutcome.landingZone.radiusYards;

    // Direction from tee to pin
    const dx = layout.pin.x - layout.tee.x;
    const dy = layout.pin.y - layout.tee.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Perpendicular (right is positive)
    const perpX = -dirY;
    const perpY = dirX;

    // Landing point: along direction + offsets
    const landX = layout.tee.x + dirX * carry + perpX * (offset.yardsRight ?? 0);
    const landY = layout.tee.y + dirY * carry + perpY * (offset.yardsRight ?? 0);

    // Generate curved flight path
    const points: { x: number; y: number }[] = [];
    const numPoints = 30;
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      // Base straight line
      let px = layout.tee.x + (landX - layout.tee.x) * t;
      let py = layout.tee.y + (landY - layout.tee.y) * t;

      // Add curve for shot shape
      const curveFactor = 4 * t * (1 - t); // peaks at midpoint
      if (shape === 'fade' || shape === 'draw') {
        const curveAmount = shape === 'fade' ? 8 : -8;
        px += perpX * curveAmount * t * t; // curve increases toward end
        py += perpY * curveAmount * t * t;
      }

      points.push({ x: px, y: py });
    }

    return { land: { x: landX, y: landY }, points, dispersion };
  }, [recommendation, layout]);

  // Club distance rings from tee
  const clubRings = useMemo(() => {
    const driver = player.clubs.find(c => c.club === 'driver');
    const mid = player.clubs.find(c => c.club === '7_iron') ?? player.clubs.find(c => c.club === '8_iron');
    const wedge = player.clubs.find(c => c.club === 'pw') ?? player.clubs.find(c => c.club === 'gw');

    const rings: { club: string; distance: number; color: string }[] = [];
    if (driver) rings.push({ club: 'Driver', distance: driver.averageCarryYards, color: '#ef4444' });
    if (mid) rings.push({ club: clubLabel(mid.club), distance: mid.averageCarryYards, color: '#eab308' });
    if (wedge) rings.push({ club: clubLabel(wedge.club), distance: wedge.averageCarryYards, color: '#22c55e' });

    return rings;
  }, [player]);

  const { bounds } = layout;

  // SVG coordinate transform: map yard coords to viewBox
  const svgWidth = 400;
  const svgHeight = Math.max(400, (bounds.height / bounds.width) * svgWidth);
  const scale = svgWidth / bounds.width;

  const toSvg = (p: { x: number; y: number }) => ({
    x: (p.x - bounds.minX) * scale,
    y: (p.y - bounds.minY) * scale,
  });

  const teeSvg = toSvg(layout.tee);
  const pinSvg = toSvg(layout.pin);
  const greenFront = toSvg(layout.green.front);
  const greenBack = toSvg(layout.green.back);
  const greenCenter = toSvg(layout.green.center);
  const greenRadius = Math.sqrt(
    Math.pow(greenFront.x - greenBack.x, 2) + Math.pow(greenFront.y - greenBack.y, 2)
  ) / 2;

  // Fairway path (thick line through waypoints)
  const fairwayPoints = [teeSvg, ...layout.fairway.map(toSvg), greenCenter];
  const fairwayPath = fairwayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Hole {currentHole} Flyover</span>
        <span style={styles.headerInfo}>Par {hole.par} · {hole.lengthYards} yds</span>
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: '100%', height: 'auto', borderRadius: 12, background: '#0a1628' }}
      >
        {/* Fairway */}
        <path
          d={fairwayPath}
          fill="none"
          stroke="#22c55e"
          strokeWidth={28 * scale / svgWidth * bounds.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.15}
        />
        <path
          d={fairwayPath}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          strokeDasharray="4,4"
          opacity={0.3}
        />

        {/* Club distance arcs from tee */}
        {clubRings.map((ring, i) => {
          const r = ring.distance * scale;
          return (
            <g key={i}>
              <circle
                cx={teeSvg.x}
                cy={teeSvg.y}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={1}
                strokeDasharray="3,6"
                opacity={0.3}
              />
              {/* Label */}
              <text
                x={teeSvg.x + r * 0.7}
                y={teeSvg.y - r * 0.7}
                fill={ring.color}
                fontSize={8}
                fontWeight={600}
                opacity={0.6}
              >
                {ring.club} {ring.distance}y
              </text>
            </g>
          );
        })}

        {/* Hazards */}
        {layout.hazards.map((h, i) => {
          const pos = toSvg(h.pos);
          const colors = HAZARD_COLORS[h.type] ?? HAZARD_COLORS.bunker;
          const r = (h.type === 'water' || h.type === 'ob') ? 14 : 10;
          return (
            <g key={`hazard-${i}`}>
              <circle cx={pos.x} cy={pos.y} r={r} fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5} />
              <text
                x={pos.x}
                y={pos.y + r + 10}
                textAnchor="middle"
                fill={colors.stroke}
                fontSize={7}
                fontWeight={600}
              >
                {colors.label}
              </text>
            </g>
          );
        })}

        {/* Layup targets */}
        {layout.layups.map((l, i) => {
          const pos = toSvg(l.pos);
          return (
            <g key={`layup-${i}`}>
              <circle cx={pos.x} cy={pos.y} r={5} fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2,2" />
              <line x1={pos.x - 3} y1={pos.y} x2={pos.x + 3} y2={pos.y} stroke="#94a3b8" strokeWidth={1} />
              <line x1={pos.x} y1={pos.y - 3} x2={pos.x} y2={pos.y + 3} stroke="#94a3b8" strokeWidth={1} />
            </g>
          );
        })}

        {/* Green */}
        <ellipse
          cx={greenCenter.x}
          cy={greenCenter.y}
          rx={greenRadius * 1.2}
          ry={greenRadius}
          fill="#22c55e30"
          stroke="#22c55e"
          strokeWidth={1.5}
        />

        {/* Ball flight trajectory */}
        {ballFlight && (
          <g>
            {/* Dispersion circle at landing */}
            {(() => {
              const land = toSvg(ballFlight.land);
              const r = ballFlight.dispersion * scale;
              return (
                <>
                  <circle
                    cx={land.x}
                    cy={land.y}
                    r={r}
                    fill="#3b82f615"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <text
                    x={land.x}
                    y={land.y + r + 10}
                    textAnchor="middle"
                    fill="#3b82f6"
                    fontSize={7}
                    opacity={0.7}
                  >
                    68% landing zone
                  </text>
                </>
              );
            })()}

            {/* Flight path */}
            <polyline
              points={ballFlight.points.map(p => {
                const s = toSvg(p);
                return `${s.x},${s.y}`;
              }).join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.9}
            />

            {/* Animated dot along path */}
            <circle r={4} fill="#ffffff">
              <animateMotion
                dur="2s"
                repeatCount="indefinite"
                path={ballFlight.points.map((p, i) => {
                  const s = toSvg(p);
                  return `${i === 0 ? 'M' : 'L'}${s.x},${s.y}`;
                }).join(' ')}
              />
            </circle>

            {/* Landing dot */}
            {(() => {
              const land = toSvg(ballFlight.land);
              return <circle cx={land.x} cy={land.y} r={4} fill="#3b82f6" stroke="#ffffff" strokeWidth={1.5} />;
            })()}
          </g>
        )}

        {/* Pin flag */}
        <g>
          <line x1={pinSvg.x} y1={pinSvg.y} x2={pinSvg.x} y2={pinSvg.y - 16} stroke="#ffffff" strokeWidth={1.5} />
          <polygon
            points={`${pinSvg.x},${pinSvg.y - 16} ${pinSvg.x + 8},${pinSvg.y - 12} ${pinSvg.x},${pinSvg.y - 8}`}
            fill="#ef4444"
          />
          <circle cx={pinSvg.x} cy={pinSvg.y} r={3} fill="#ef4444" stroke="#ffffff" strokeWidth={1} />
        </g>

        {/* Tee box */}
        <rect
          x={teeSvg.x - 8}
          y={teeSvg.y - 4}
          width={16}
          height={8}
          rx={2}
          fill="#94a3b8"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
        <text
          x={teeSvg.x}
          y={teeSvg.y + 16}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={9}
          fontWeight={700}
        >
          TEE
        </text>

        {/* Dogleg indicator */}
        {hole.doglegDirection && hole.doglegDirection !== 'straight' && hole.doglegYards && (
          <text
            x={svgWidth / 2}
            y={14}
            textAnchor="middle"
            fill="#eab308"
            fontSize={8}
            fontWeight={600}
          >
            Dogleg {hole.doglegDirection} at ~{hole.doglegYards}y
          </text>
        )}

        {/* Yardage markers along fairway */}
        {[100, 150, 200].map(yd => {
          if (yd >= hole.lengthYards) return null;
          // Position yd yards from the pin along the fairway line
          const frac = 1 - yd / hole.lengthYards;
          const mx = layout.tee.x + (layout.pin.x - layout.tee.x) * frac;
          const my = layout.tee.y + (layout.pin.y - layout.tee.y) * frac;
          const s = toSvg({ x: mx, y: my });
          return (
            <g key={yd}>
              <line x1={s.x - 6} y1={s.y} x2={s.x + 6} y2={s.y} stroke="#64748b" strokeWidth={1} />
              <text x={s.x + 9} y={s.y + 3} fill="#64748b" fontSize={7}>{yd}</text>
            </g>
          );
        })}

        {/* Recommended club badge */}
        {recommendation && (
          <g>
            <rect
              x={svgWidth - 80}
              y={svgHeight - 32}
              width={72}
              height={24}
              rx={6}
              fill="#22c55e"
            />
            <text
              x={svgWidth - 44}
              y={svgHeight - 16}
              textAnchor="middle"
              fill="#0f172a"
              fontSize={10}
              fontWeight={800}
            >
              {clubLabel(recommendation.club)}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div style={styles.legend}>
        <LegendItem color="#ffffff" label="Ball flight" type="line" />
        <LegendItem color="#3b82f6" label="Landing zone" type="circle" />
        <LegendItem color="#22c55e" label="Green" type="fill" />
        <LegendItem color="#ef4444" label="Pin" type="dot" />
      </div>

      {/* Shot info */}
      {recommendation && (
        <div style={styles.shotInfo}>
          <div style={styles.shotInfoItem}>
            <span style={styles.shotInfoLabel}>Club</span>
            <span style={styles.shotInfoValue}>{clubLabel(recommendation.club)}</span>
          </div>
          <div style={styles.shotInfoItem}>
            <span style={styles.shotInfoLabel}>Carry</span>
            <span style={styles.shotInfoValue}>{recommendation.expectedOutcome.expectedCarryYards}y</span>
          </div>
          <div style={styles.shotInfoItem}>
            <span style={styles.shotInfoLabel}>Shape</span>
            <span style={styles.shotInfoValue}>{recommendation.suggestedShape}</span>
          </div>
          <div style={styles.shotInfoItem}>
            <span style={styles.shotInfoLabel}>Green %</span>
            <span style={styles.shotInfoValue}>{Math.round(recommendation.expectedOutcome.hitGreenProbability * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, type }: { color: string; label: string; type: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {type === 'line' && <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />}
      {type === 'circle' && <div style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${color}` }} />}
      {type === 'fill' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.4 }} />}
      {type === 'dot' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
      <span style={{ fontSize: 9, color: '#64748b' }}>{label}</span>
    </div>
  );
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

const styles: Record<string, React.CSSProperties> = {
  container: { marginBottom: 14 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  headerInfo: { fontSize: 12, color: '#64748b' },
  legend: {
    display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' as const,
  },
  shotInfo: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10,
  },
  shotInfoItem: {
    background: '#1e293b', borderRadius: 8, padding: '8px 4px',
    textAlign: 'center' as const,
  },
  shotInfoLabel: { display: 'block', fontSize: 9, color: '#64748b', textTransform: 'uppercase' as const },
  shotInfoValue: { display: 'block', fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginTop: 2, textTransform: 'capitalize' as const },
};

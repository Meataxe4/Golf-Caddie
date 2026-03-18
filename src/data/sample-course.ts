// ============================================================================
// Sample Course Data — Pine Valley Municipal (Fictional)
// ============================================================================
// A realistic 18-hole course layout for simulation and demo purposes.
// Includes hazards, GPS coordinates, green contours, and layup targets.

import type { CourseData, HoleLayout, Hazard, GreenContour, LayupTarget } from '../models/types';

// Helper to create GPS coordinates relative to a base point
function coord(baseLat: number, baseLng: number, ydsNorth: number, ydsEast: number) {
  const metersPerYard = 0.9144;
  const latOffset = (ydsNorth * metersPerYard) / 111320;
  const lngOffset = (ydsEast * metersPerYard) / (111320 * Math.cos(baseLat * Math.PI / 180));
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

const BASE_LAT = 33.45;
const BASE_LNG = -84.35;

// ---------------------------------------------------------------------------
// Hazard descriptor used during hole construction.  distancePct (0-1) places
// the hazard along the tee-to-pin path and sideOffset (yards, + right / - left
// relative to the direction of play) shifts it laterally.
// ---------------------------------------------------------------------------
interface HazardSpec {
  type: Hazard['type'];
  distancePct: number;
  sideOffset: number;         // yards, + right, - left
  penaltyStrokes?: number;
  recoveryDifficulty?: number;
}

interface HoleOpts {
  hazards?: HazardSpec[];
  dogleg?: 'left' | 'right';
  doglegYards?: number;
  layups?: Partial<LayupTarget>[];
  green?: {
    slopeDirection: number;
    slopeSeverity: number;
    speed: number;
    firmness: 'soft' | 'medium' | 'firm';
  };
}

// ---------------------------------------------------------------------------
// pointAlongPath — given a distance along the (possibly bent) path, return
// the (northYds, eastYds) offset from base, plus the local heading at that
// point.  For straight holes the path is one segment.  For dogleg holes the
// path has two segments: tee→bend→pin.
// ---------------------------------------------------------------------------
interface PathInfo {
  teeN: number; teeE: number;
  bendN: number; bendE: number;
  pinN: number; pinE: number;
  seg1Len: number;           // tee → bend distance
  seg2Len: number;           // bend → pin distance
  totalLen: number;
  headingRad1: number;       // heading tee → bend
  headingRad2: number;       // heading bend → pin
  isDogleg: boolean;
}

function buildPath(
  teeN: number,
  teeE: number,
  length: number,
  directionDeg: number,
  dogleg?: 'left' | 'right',
  doglegYards?: number,
): PathInfo {
  const rad = (directionDeg * Math.PI) / 180;

  if (!dogleg || !doglegYards) {
    // Straight hole
    const pinN = teeN + length * Math.cos(rad);
    const pinE = teeE + length * Math.sin(rad);
    return {
      teeN, teeE,
      bendN: pinN, bendE: pinE,       // no real bend — set to pin
      pinN, pinE,
      seg1Len: length,
      seg2Len: 0,
      totalLen: length,
      headingRad1: rad,
      headingRad2: rad,
      isDogleg: false,
    };
  }

  // Dogleg hole — bend the path
  const turnDeg = dogleg === 'left' ? -30 : 30;   // 30 degrees turn
  const turnRad = (turnDeg * Math.PI) / 180;
  const rad2 = rad + turnRad;

  const bendN = teeN + doglegYards * Math.cos(rad);
  const bendE = teeE + doglegYards * Math.sin(rad);

  const remainDist = length - doglegYards;
  const pinN = bendN + remainDist * Math.cos(rad2);
  const pinE = bendE + remainDist * Math.sin(rad2);

  return {
    teeN, teeE,
    bendN, bendE,
    pinN, pinE,
    seg1Len: doglegYards,
    seg2Len: remainDist,
    totalLen: length,
    headingRad1: rad,
    headingRad2: rad2,
    isDogleg: true,
  };
}

function pointOnPath(path: PathInfo, dist: number): { n: number; e: number; heading: number } {
  if (!path.isDogleg || dist <= path.seg1Len) {
    const d = Math.min(dist, path.seg1Len);
    return {
      n: path.teeN + d * Math.cos(path.headingRad1),
      e: path.teeE + d * Math.sin(path.headingRad1),
      heading: path.headingRad1,
    };
  }
  const d2 = dist - path.seg1Len;
  return {
    n: path.bendN + d2 * Math.cos(path.headingRad2),
    e: path.bendE + d2 * Math.sin(path.headingRad2),
    heading: path.headingRad2,
  };
}

// Offset a point laterally (perpendicular to heading). Positive = right.
function lateralOffset(
  n: number, e: number, heading: number, offsetYds: number,
): { n: number; e: number } {
  const perpHeading = heading + Math.PI / 2; // right of travel
  return {
    n: n + offsetYds * Math.cos(perpHeading),
    e: e + offsetYds * Math.sin(perpHeading),
  };
}

// ---------------------------------------------------------------------------
// makeHole — builds a full HoleLayout with dogleg-aware fairway, pin,
// hazard placement, and per-hole green characteristics.
// ---------------------------------------------------------------------------
function makeHole(
  num: number,
  par: number,
  length: number,
  hcap: number,
  direction: number,
  opts: HoleOpts = {},
): HoleLayout {
  const teeN = num * 50;
  const teeE = num * 30;

  const path = buildPath(teeN, teeE, length, direction, opts.dogleg, opts.doglegYards);

  const tee = coord(BASE_LAT, BASE_LNG, path.teeN, path.teeE);
  const pin = coord(BASE_LAT, BASE_LNG, path.pinN, path.pinE);

  // --- Fairway center points along the (curved) path ---
  const fairwayPoints = [];
  for (let d = 100; d < length; d += 80) {
    const pt = pointOnPath(path, d);
    fairwayPoints.push(coord(BASE_LAT, BASE_LNG, pt.n, pt.e));
  }

  // --- Hazards placed using distancePct and sideOffset ---
  const hazards: Hazard[] = (opts.hazards ?? []).map((h, i) => {
    const dist = h.distancePct * length;
    const pt = pointOnPath(path, dist);
    const off = lateralOffset(pt.n, pt.e, pt.heading, h.sideOffset);
    return {
      id: `h${num}-${i}`,
      type: h.type,
      boundary: [],
      centerPoint: coord(BASE_LAT, BASE_LNG, off.n, off.e),
      penaltyStrokes: h.penaltyStrokes ?? (h.type === 'water' || h.type === 'ob' ? 1 : 0),
      recoveryDifficulty: h.recoveryDifficulty ?? 0.5,
    };
  });

  // --- Green contour — oriented perpendicular to approach direction ---
  const approachHeading = path.isDogleg ? path.headingRad2 : path.headingRad1;
  const greenDefaults = {
    slopeDirection: 180,
    slopeSeverity: 0.3,
    speed: 10,
    firmness: 'medium' as const,
  };
  const g = { ...greenDefaults, ...opts.green };

  // Front/back edges perpendicular to the approach direction
  const frontN = path.pinN - 12 * Math.cos(approachHeading);
  const frontE = path.pinE - 12 * Math.sin(approachHeading);
  const backN = path.pinN + 12 * Math.cos(approachHeading);
  const backE = path.pinE + 12 * Math.sin(approachHeading);

  const greenContour: GreenContour = {
    frontEdge: coord(BASE_LAT, BASE_LNG, frontN, frontE),
    backEdge: coord(BASE_LAT, BASE_LNG, backN, backE),
    centerGreen: pin,
    slopeDirection: g.slopeDirection,
    slopeSeverity: g.slopeSeverity,
    firmness: g.firmness,
    speed: g.speed,
  };

  // --- Layup targets ---
  const layupTargets: LayupTarget[] = (opts.layups ?? []).map(l => {
    const layupDist = length - (l.distanceToGreen ?? 100);
    const pt = pointOnPath(path, layupDist);
    return {
      position: l.position ?? coord(BASE_LAT, BASE_LNG, pt.n, pt.e),
      distanceToGreen: l.distanceToGreen ?? 100,
      safetyRating: l.safetyRating ?? 0.8,
      fairwayWidth: l.fairwayWidth ?? 35,
      description: l.description ?? 'Center fairway layup',
    };
  });

  return {
    holeNumber: num,
    par,
    handicapIndex: hcap,
    lengthYards: length,
    teePosition: tee,
    pinPosition: pin,
    fairwayCenter: fairwayPoints,
    hazards,
    greenContour,
    layupTargets,
    doglegDirection: opts.dogleg ?? 'straight',
    doglegYards: opts.doglegYards,
  };
}

// ============================================================================
// 18 Holes — Front 9: 4,5,3,4,4,3,4,5,4 = 36  Back 9: 4,3,5,4,4,3,4,4,5 = 36
// ============================================================================

export const SAMPLE_COURSE: CourseData = {
  id: 'pine-valley-muni',
  name: 'Pine Valley Municipal Golf Club',
  location: { lat: BASE_LAT, lng: BASE_LNG },
  holes: [
    // ====================== FRONT 9 ======================

    // Hole 1 — Par 4, 385 yds, Hcap 7 — Gentle opener, fairway bunker right
    makeHole(1, 4, 385, 7, 0, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.62, sideOffset: 20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -16, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 200, slopeSeverity: 0.25, speed: 10, firmness: 'medium' },
    }),

    // Hole 2 — Par 5, 520 yds, Hcap 11 — Reachable par 5, water crossing at 55%
    makeHole(2, 5, 520, 11, 45, {
      hazards: [
        { type: 'water', distancePct: 0.55, sideOffset: 0, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.52, sideOffset: 22, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 18, recoveryDifficulty: 0.4 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Short of the pond, 100 yards out' }],
      green: { slopeDirection: 160, slopeSeverity: 0.35, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 3 — Par 3, 165 yds, Hcap 15 — Short iron, greenside bunkers both sides
    makeHole(3, 3, 165, 15, 90, {
      hazards: [
        { type: 'bunker', distancePct: 0.92, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.95, sideOffset: 17, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 90, slopeSeverity: 0.3, speed: 11, firmness: 'firm' },
    }),

    // Hole 4 — Par 4, 420 yds, Hcap 1 — Dogleg left, water along left, OB right
    makeHole(4, 4, 420, 1, 135, {
      hazards: [
        { type: 'water', distancePct: 0.45, sideOffset: -30, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'ob', distancePct: 0.50, sideOffset: 35, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.55, sideOffset: -18, recoveryDifficulty: 0.6 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 15, recoveryDifficulty: 0.5 },
      ],
      dogleg: 'left',
      doglegYards: 230,
      green: { slopeDirection: 310, slopeSeverity: 0.4, speed: 11.5, firmness: 'firm' },
    }),

    // Hole 5 — Par 4, 355 yds, Hcap 13 — Short par 4, risk/reward off the tee
    makeHole(5, 4, 355, 13, 180, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.65, sideOffset: -20, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.91, sideOffset: 16, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.40, sideOffset: 35, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 45, slopeSeverity: 0.2, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 6 — Par 3, 195 yds, Hcap 9 — Long par 3, water front-left
    makeHole(6, 3, 195, 9, 225, {
      hazards: [
        { type: 'water', distancePct: 0.88, sideOffset: -20, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.95, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.90, sideOffset: -8, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 270, slopeSeverity: 0.35, speed: 11, firmness: 'medium' },
    }),

    // Hole 7 — Par 4, 405 yds, Hcap 3 — Dogleg right, bunkers at the turn
    makeHole(7, 4, 405, 3, 270, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.56, sideOffset: 22, recoveryDifficulty: 0.4 },
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -15, recoveryDifficulty: 0.6 },
        { type: 'trees', distancePct: 0.50, sideOffset: -35, recoveryDifficulty: 0.7 },
      ],
      dogleg: 'right',
      doglegYards: 240,
      green: { slopeDirection: 135, slopeSeverity: 0.3, speed: 10, firmness: 'medium' },
    }),

    // Hole 8 — Par 5, 545 yds, Hcap 5 — Long par 5, creek crossing, bunkers near green
    makeHole(8, 5, 545, 5, 315, {
      hazards: [
        { type: 'water', distancePct: 0.48, sideOffset: 0, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.52, sideOffset: -20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 17, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.95, sideOffset: -16, recoveryDifficulty: 0.4 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Left of creek, 90 yards' }],
      green: { slopeDirection: 350, slopeSeverity: 0.25, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 9 — Par 4, 440 yds, Hcap 2 — Tough finishing hole front 9, OB left
    makeHole(9, 4, 440, 2, 0, {
      hazards: [
        { type: 'ob', distancePct: 0.50, sideOffset: -38, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.58, sideOffset: 22, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -17, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 15, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 225, slopeSeverity: 0.35, speed: 11.5, firmness: 'firm' },
    }),

    // ====================== BACK 9 ======================

    // Hole 10 — Par 4, 370 yds, Hcap 10 — Straightforward, bunker right of green
    makeHole(10, 4, 370, 10, 45, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -22, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.93, sideOffset: 18, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.45, sideOffset: 32, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 120, slopeSeverity: 0.2, speed: 10, firmness: 'medium' },
    }),

    // Hole 11 — Par 3, 150 yds, Hcap 16 — Short par 3, well-bunkered
    makeHole(11, 3, 150, 16, 90, {
      hazards: [
        { type: 'bunker', distancePct: 0.90, sideOffset: -17, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 15, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.98, sideOffset: 0, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.3, speed: 12, firmness: 'firm' },
    }),

    // Hole 12 — Par 5, 530 yds, Hcap 8 — Dogleg right, water near green, fairway bunker
    makeHole(12, 5, 530, 8, 135, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 24, recoveryDifficulty: 0.4 },
        { type: 'water', distancePct: 0.88, sideOffset: -15, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'trees', distancePct: 0.48, sideOffset: -30, recoveryDifficulty: 0.6 },
      ],
      dogleg: 'right',
      doglegYards: 250,
      layups: [{ distanceToGreen: 110, description: 'Right of fairway bunker, 110 out' }],
      green: { slopeDirection: 240, slopeSeverity: 0.4, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 13 — Par 4, 395 yds, Hcap 6 — Straight, greenside bunkers pinch the entrance
    makeHole(13, 4, 395, 6, 180, {
      hazards: [
        { type: 'bunker', distancePct: 0.91, sideOffset: -16, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 17, recoveryDifficulty: 0.5 },
        { type: 'fairway_bunker', distancePct: 0.62, sideOffset: 20, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.35, sideOffset: -33, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 315, slopeSeverity: 0.25, speed: 9, firmness: 'soft' },
    }),

    // Hole 14 — Par 4, 430 yds, Hcap 4 — Long par 4, water right of green
    makeHole(14, 4, 430, 4, 225, {
      hazards: [
        { type: 'water', distancePct: 0.90, sideOffset: 22, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: -20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -15, recoveryDifficulty: 0.6 },
        { type: 'ob', distancePct: 0.50, sideOffset: 38, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
      ],
      green: { slopeDirection: 70, slopeSeverity: 0.3, speed: 11, firmness: 'firm' },
    }),

    // Hole 15 — Par 3, 180 yds, Hcap 14 — Mid-length par 3, deep bunkers
    makeHole(15, 3, 180, 14, 270, {
      hazards: [
        { type: 'bunker', distancePct: 0.90, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 16, recoveryDifficulty: 0.4 },
        { type: 'waste_area', distancePct: 0.85, sideOffset: 25, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.35, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 16 — Par 4, 375 yds, Hcap 12 — Short par 4, fairway bunker in landing zone
    makeHole(16, 4, 375, 12, 315, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -18, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 16, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.42, sideOffset: 30, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 155, slopeSeverity: 0.2, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 17 — Par 4, 380 yds, Hcap 17 — Water guarding green, island-style approach
    makeHole(17, 4, 380, 17, 0, {
      hazards: [
        { type: 'water', distancePct: 0.87, sideOffset: 0, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.95, sideOffset: -17, recoveryDifficulty: 0.6 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 18, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 260, slopeSeverity: 0.4, speed: 12, firmness: 'firm' },
    }),

    // Hole 18 — Par 5, 555 yds, Hcap 18 — Dogleg left, water before green, dramatic finish
    makeHole(18, 5, 555, 18, 45, {
      hazards: [
        { type: 'water', distancePct: 0.85, sideOffset: -10, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.50, sideOffset: -22, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'ob', distancePct: 0.45, sideOffset: 36, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'trees', distancePct: 0.55, sideOffset: 32, recoveryDifficulty: 0.6 },
      ],
      dogleg: 'left',
      doglegYards: 260,
      layups: [{ distanceToGreen: 100, description: 'Short of the water, 100 yards' }],
      green: { slopeDirection: 100, slopeSeverity: 0.3, speed: 11, firmness: 'medium' },
    }),
  ],
  slopeRating: 128,
  courseRating: 72.1,
  altitudeEffect: 1.0,
};

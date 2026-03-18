// ============================================================================
// Course Library — Multiple courses for selection
// ============================================================================

import type { CourseData, HoleLayout, Hazard, GreenContour, LayupTarget } from '../models/types';
import { SAMPLE_COURSE } from './sample-course';

function coord(baseLat: number, baseLng: number, ydsNorth: number, ydsEast: number) {
  const metersPerYard = 0.9144;
  const latOffset = (ydsNorth * metersPerYard) / 111320;
  const lngOffset = (ydsEast * metersPerYard) / (111320 * Math.cos(baseLat * Math.PI / 180));
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

/** Given a distance along the hole path (0..length), return the N/E offsets from tee origin. */
function pathPoint(
  distance: number,
  direction: number,
  length: number,
  dogleg?: 'left' | 'right',
  doglegYards?: number,
): { n: number; e: number } {
  const rad = (direction * Math.PI) / 180;
  if (!dogleg || !doglegYards || doglegYards <= 0) {
    return { n: distance * Math.cos(rad), e: distance * Math.sin(rad) };
  }

  const turnSign = dogleg === 'right' ? 1 : -1;
  const turnAngle = 28 * (Math.PI / 180) * turnSign;
  const rad2 = rad + turnAngle;

  if (distance <= doglegYards) {
    return { n: distance * Math.cos(rad), e: distance * Math.sin(rad) };
  }

  const firstN = doglegYards * Math.cos(rad);
  const firstE = doglegYards * Math.sin(rad);
  const remaining = distance - doglegYards;
  return {
    n: firstN + remaining * Math.cos(rad2),
    e: firstE + remaining * Math.sin(rad2),
  };
}

/** Return the direction angle (radians) of the path at a given distance. */
function pathDirection(
  distance: number,
  direction: number,
  dogleg?: 'left' | 'right',
  doglegYards?: number,
): number {
  const rad = (direction * Math.PI) / 180;
  if (!dogleg || !doglegYards || distance <= doglegYards) {
    return rad;
  }
  const turnSign = dogleg === 'right' ? 1 : -1;
  return rad + 28 * (Math.PI / 180) * turnSign;
}

function makeHole(
  baseLat: number, baseLng: number,
  num: number, par: number, length: number, hcap: number, direction: number,
  opts: {
    hazards?: (Partial<Hazard> & { distancePct?: number; sideOffset?: number })[];
    dogleg?: 'left' | 'right';
    doglegYards?: number;
    layups?: Partial<LayupTarget>[];
    greenSpeed?: number;
    greenFirmness?: 'soft' | 'medium' | 'firm';
    greenSlope?: number;
  } = {},
): HoleLayout {
  const teeN = num * 50;
  const teeE = num * 30;
  const tee = coord(baseLat, baseLng, teeN, teeE);

  // Pin follows the curved path
  const pinOffset = pathPoint(length, direction, length, opts.dogleg, opts.doglegYards);
  const pin = coord(baseLat, baseLng, teeN + pinOffset.n, teeE + pinOffset.e);

  // Fairway center points follow the actual path (curved for doglegs)
  const fairwayPoints = [];
  for (let d = 100; d < length; d += 80) {
    const pt = pathPoint(d, direction, length, opts.dogleg, opts.doglegYards);
    fairwayPoints.push(coord(baseLat, baseLng, teeN + pt.n, teeE + pt.e));
  }

  // Hazards placed along the actual path using distancePct and sideOffset
  const hazards: Hazard[] = (opts.hazards ?? []).map((h, i) => {
    let center = h.centerPoint;
    if (!center) {
      const pct = h.distancePct ?? 0.7;
      const side = h.sideOffset ?? (i % 2 === 0 ? 15 : -15);
      const dist = pct * length;
      const pt = pathPoint(dist, direction, length, opts.dogleg, opts.doglegYards);
      const dir = pathDirection(dist, direction, opts.dogleg, opts.doglegYards);
      // sideOffset: positive = right of path direction, negative = left
      const perpN = -Math.sin(dir) * side;
      const perpE = Math.cos(dir) * side;
      center = coord(baseLat, baseLng, teeN + pt.n + perpN, teeE + pt.e + perpE);
    }
    return {
      id: `h${num}-${i}`,
      type: h.type ?? 'bunker',
      boundary: [],
      centerPoint: center,
      penaltyStrokes: h.penaltyStrokes ?? (h.type === 'water' ? 1 : 0),
      recoveryDifficulty: h.recoveryDifficulty ?? 0.5,
    };
  });

  // Green varies per hole
  const approachDir = pathDirection(length, direction, opts.dogleg, opts.doglegYards);
  const greenSpeed = opts.greenSpeed ?? (9 + ((num * 7 + 3) % 4)); // varies 9-12
  const firmnesses: Array<'soft' | 'medium' | 'firm'> = ['soft', 'medium', 'firm'];
  const greenFirmness = opts.greenFirmness ?? firmnesses[num % 3];
  const greenSlope = opts.greenSlope ?? (2 + ((num * 3 + 1) % 5)); // varies 2-6 degrees
  const slopeDir = ((approachDir * 180 / Math.PI) + 90 + (num % 2 === 0 ? 0 : 180)) % 360;

  // Front/back edges perpendicular to approach direction
  const frontN = -Math.cos(approachDir) * 12;
  const frontE = -Math.sin(approachDir) * 12;
  const backN = Math.cos(approachDir) * 12;
  const backE = Math.sin(approachDir) * 12;

  const greenContour: GreenContour = {
    frontEdge: coord(pin.lat, pin.lng, frontN, frontE),
    backEdge: coord(pin.lat, pin.lng, backN, backE),
    centerGreen: pin,
    slopeDirection: slopeDir,
    slopeSeverity: Math.min(1, greenSlope / 10),
    firmness: greenFirmness,
    speed: greenSpeed,
  };

  // Layup targets placed along the actual path
  const rad = (direction * Math.PI) / 180;
  const layupTargets: LayupTarget[] = (opts.layups ?? []).map(l => {
    const dtg = l.distanceToGreen ?? 100;
    const layupDist = length - dtg;
    const pt = pathPoint(layupDist, direction, length, opts.dogleg, opts.doglegYards);
    return {
      position: l.position ?? coord(baseLat, baseLng, teeN + pt.n, teeE + pt.e),
      distanceToGreen: dtg,
      safetyRating: l.safetyRating ?? 0.8,
      fairwayWidth: l.fairwayWidth ?? 35,
      description: l.description ?? 'Center fairway layup',
    };
  });

  return {
    holeNumber: num, par, handicapIndex: hcap, lengthYards: length,
    teePosition: tee, pinPosition: pin, fairwayCenter: fairwayPoints,
    hazards, greenContour, layupTargets,
    doglegDirection: opts.dogleg, doglegYards: opts.doglegYards,
  };
}

// --- Marrickville Golf Club ---
// Historic par 60, 18-hole course along the Cooks River, Marrickville, Sydney
// Established 1941 | Bent Grass greens, Kikuyu Grass fairways
// Blue tees: 3,993 yards | Slope 99 | Rating 60.0
const MKV_LAT = -33.9105;
const MKV_LNG = 151.1548;

const MARRICKVILLE: CourseData = {
  id: 'marrickville',
  name: 'Marrickville Golf Club',
  location: { lat: MKV_LAT, lng: MKV_LNG },
  holes: [
    // Hole 1 — Par 3, 228 yards, HC 2
    // Long par 3, protected by bunkers
    makeHole(MKV_LAT, MKV_LNG, 1, 3, 228, 2, 350, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 2 — Par 3, 183 yards, HC 9
    // Mid-length, small elevated green — take extra club
    makeHole(MKV_LAT, MKV_LNG, 2, 3, 183, 9, 30, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 3 — Par 4, 276 yards, HC 17
    // Straight tee shot, OB on left side, trees right
    makeHole(MKV_LAT, MKV_LNG, 3, 4, 276, 17, 80, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -30 },
        { type: 'trees', distancePct: 0.5, sideOffset: 25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 15 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 80, description: 'Center fairway, short of green bunkers' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 2,
    }),

    // Hole 4 — Par 3, 200 yards, HC 7
    // Tough par 3, sloping green back to front, bunkers both sides
    makeHole(MKV_LAT, MKV_LNG, 4, 3, 200, 7, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -16 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 5,
    }),

    // Hole 5 — Par 4, 289 yards, HC 14
    // Signature hole — difficult driving hole, OB right, water (red penalty area) left
    makeHole(MKV_LAT, MKV_LNG, 5, 4, 289, 14, 220, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: 30 },
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 0.8, distancePct: 0.5, sideOffset: -25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Center fairway, avoid OB right and water left' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 6 — Par 3, 232 yards, HC 1
    // #1 handicap — long par 3, OB right masked by trees, hardest hole
    makeHole(MKV_LAT, MKV_LNG, 6, 3, 232, 1, 290, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.6, sideOffset: 30 },
        { type: 'trees', distancePct: 0.55, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 7 — Par 3, 158 yards, HC 11
    // Short par 3, bunkers protect the green
    makeHole(MKV_LAT, MKV_LNG, 7, 3, 158, 11, 10, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -14 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 8 — Par 3, 188 yards, HC 6
    // Blind par 3, take one more club
    makeHole(MKV_LAT, MKV_LNG, 8, 3, 188, 6, 110, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 3,
    }),

    // Hole 9 — Par 3, 179 yards, HC 10
    // Mid-length par 3 with elevated green
    makeHole(MKV_LAT, MKV_LNG, 9, 3, 179, 10, 190, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: -12 },
      ],
      greenSpeed: 11, greenFirmness: 'medium', greenSlope: 4,
    }),

    // Hole 10 — Par 4, 358 yards, HC 5
    // Longest hole, OB left (Cooks River), two-tier green, grass bunker left of green
    makeHole(MKV_LAT, MKV_LNG, 10, 4, 358, 5, 260, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.45, sideOffset: -32 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: -18 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 12 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Right side of fairway, away from Cooks River OB' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 5,
    }),

    // Hole 11 — Par 3, 149 yards, HC 15
    // Short par 3
    makeHole(MKV_LAT, MKV_LNG, 11, 3, 149, 15, 340, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 12 — Par 3, 182 yards, HC 8
    // Par 3 with bunkers
    makeHole(MKV_LAT, MKV_LNG, 12, 3, 182, 8, 60, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.8, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 13 — Par 3, 188 yards, HC 4
    // Mid-length par 3
    makeHole(MKV_LAT, MKV_LNG, 13, 3, 188, 4, 140, {
      hazards: [
        { type: 'bunker', distancePct: 0.86, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.82, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 14 — Par 4, 284 yards, HC 18
    // Short par 4
    makeHole(MKV_LAT, MKV_LNG, 14, 4, 284, 18, 310, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 85, description: 'Center fairway layup' }],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 15 — Par 3, 162 yards, HC 13
    // Par 3 with green protection
    makeHole(MKV_LAT, MKV_LNG, 15, 3, 162, 13, 40, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 16 — Par 4, 287 yards, HC 12
    // Par 4 with trees
    makeHole(MKV_LAT, MKV_LNG, 16, 4, 287, 12, 170, {
      hazards: [
        { type: 'trees', distancePct: 0.45, sideOffset: -22 },
        { type: 'trees', distancePct: 0.5, sideOffset: 24 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 12 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Between the tree lines' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 17 — Par 4, 317 yards, HC 3
    // Strong par 4, #3 handicap
    makeHole(MKV_LAT, MKV_LNG, 17, 4, 317, 3, 240, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 95, description: 'Center fairway, avoid right bunker' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 18 — Par 3, 133 yards, HC 16
    // Shortest hole on course, finishing par 3
    makeHole(MKV_LAT, MKV_LNG, 18, 3, 133, 16, 320, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 10 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 2,
    }),
  ],
  slopeRating: 99,
  courseRating: 60.0,
  altitudeEffect: 1.0,
};

export const COURSE_LIBRARY: CourseData[] = [
  SAMPLE_COURSE,
  MARRICKVILLE,
];

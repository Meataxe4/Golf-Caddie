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

interface PathInfo {
  teeN: number; teeE: number;
  bendN: number; bendE: number;
  pinN: number; pinE: number;
  seg1Len: number; seg2Len: number; totalLen: number;
  headingRad1: number; headingRad2: number;
  isDogleg: boolean;
}

function buildPath(
  teeN: number, teeE: number, length: number, directionDeg: number,
  dogleg?: 'left' | 'right', doglegYards?: number,
): PathInfo {
  const rad = (directionDeg * Math.PI) / 180;
  if (!dogleg || !doglegYards) {
    const pinN = teeN + length * Math.cos(rad);
    const pinE = teeE + length * Math.sin(rad);
    return { teeN, teeE, bendN: pinN, bendE: pinE, pinN, pinE, seg1Len: length, seg2Len: 0, totalLen: length, headingRad1: rad, headingRad2: rad, isDogleg: false };
  }
  const turnRad = ((dogleg === 'left' ? -25 : 25) * Math.PI) / 180;
  const rad2 = rad + turnRad;
  const bendN = teeN + doglegYards * Math.cos(rad);
  const bendE = teeE + doglegYards * Math.sin(rad);
  const remainDist = length - doglegYards;
  const pinN = bendN + remainDist * Math.cos(rad2);
  const pinE = bendE + remainDist * Math.sin(rad2);
  return { teeN, teeE, bendN, bendE, pinN, pinE, seg1Len: doglegYards, seg2Len: remainDist, totalLen: length, headingRad1: rad, headingRad2: rad2, isDogleg: true };
}

function pointOnPath(path: PathInfo, dist: number): { n: number; e: number; heading: number } {
  if (!path.isDogleg || dist <= path.seg1Len) {
    const d = Math.min(dist, path.seg1Len);
    return { n: path.teeN + d * Math.cos(path.headingRad1), e: path.teeE + d * Math.sin(path.headingRad1), heading: path.headingRad1 };
  }
  const d2 = dist - path.seg1Len;
  return { n: path.bendN + d2 * Math.cos(path.headingRad2), e: path.bendE + d2 * Math.sin(path.headingRad2), heading: path.headingRad2 };
}

function lateralOffset(n: number, e: number, heading: number, offsetYds: number): { n: number; e: number } {
  const perpHeading = heading + Math.PI / 2;
  return { n: n + offsetYds * Math.cos(perpHeading), e: e + offsetYds * Math.sin(perpHeading) };
}

interface HazardSpec {
  type: Hazard['type'];
  distancePct: number;
  sideOffset: number;
  penaltyStrokes?: number;
  recoveryDifficulty?: number;
}

interface HoleOpts {
  hazards?: HazardSpec[];
  dogleg?: 'left' | 'right';
  doglegYards?: number;
  layups?: Partial<LayupTarget>[];
  greenSpeed?: number;
  greenFirmness?: 'soft' | 'medium' | 'firm';
  greenSlope?: number;
}

function makeHole(
  baseLat: number, baseLng: number,
  teeN: number, teeE: number,
  num: number, par: number, length: number, hcap: number, direction: number,
  opts: HoleOpts = {},
): HoleLayout {
  const path = buildPath(teeN, teeE, length, direction, opts.dogleg, opts.doglegYards);
  const tee = coord(baseLat, baseLng, path.teeN, path.teeE);
  const pin = coord(baseLat, baseLng, path.pinN, path.pinE);

  const fairwayPoints = [];
  for (let d = 60; d < length; d += 50) {
    const pt = pointOnPath(path, d);
    fairwayPoints.push(coord(baseLat, baseLng, pt.n, pt.e));
  }

  const hazards: Hazard[] = (opts.hazards ?? []).map((h, i) => {
    const dist = h.distancePct * length;
    const pt = pointOnPath(path, dist);
    const off = lateralOffset(pt.n, pt.e, pt.heading, h.sideOffset);
    return {
      id: `h${num}-${i}`,
      type: h.type,
      boundary: [],
      centerPoint: coord(baseLat, baseLng, off.n, off.e),
      penaltyStrokes: h.penaltyStrokes ?? (h.type === 'water' || h.type === 'ob' ? 1 : 0),
      recoveryDifficulty: h.recoveryDifficulty ?? 0.5,
    };
  });

  const approachHeading = path.isDogleg ? path.headingRad2 : path.headingRad1;
  const greenSpeed = opts.greenSpeed ?? 10;
  const greenFirmness = opts.greenFirmness ?? 'medium';
  const greenSlope = opts.greenSlope ?? 3;
  const slopeDir = ((approachHeading * 180 / Math.PI) + 90 + (num % 2 === 0 ? 0 : 180)) % 360;

  const frontN = path.pinN - 12 * Math.cos(approachHeading);
  const frontE = path.pinE - 12 * Math.sin(approachHeading);
  const backN = path.pinN + 12 * Math.cos(approachHeading);
  const backE = path.pinE + 12 * Math.sin(approachHeading);

  const greenContour: GreenContour = {
    frontEdge: coord(baseLat, baseLng, frontN, frontE),
    backEdge: coord(baseLat, baseLng, backN, backE),
    centerGreen: pin,
    slopeDirection: slopeDir,
    slopeSeverity: Math.min(1, greenSlope / 10),
    firmness: greenFirmness,
    speed: greenSpeed,
  };

  const layupTargets: LayupTarget[] = (opts.layups ?? []).map(l => {
    const dtg = l.distanceToGreen ?? 100;
    const layupDist = length - dtg;
    const pt = pointOnPath(path, layupDist);
    return {
      position: l.position ?? coord(baseLat, baseLng, pt.n, pt.e),
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

// ---------------------------------------------------------------------------
// Marrickville Golf Club — GPS-aligned along the Cooks River
// Par 60 (men), 18 holes, ~3993 yards. Course axis runs NW–SE (~325°/145°).
// Base point at the centre of the course (BOM station: -33.919, 151.140).
// All tee offsets verified to keep tees AND greens within the ~650×400 yd
// course footprint.  Holes zigzag NW/SE; green → next tee ≈ 3-35 yd walk.
// ---------------------------------------------------------------------------
const MKV_LAT = -33.9190;
const MKV_LNG = 151.1400;

// Tee offsets [northYards, eastYards] from course centre.
// Positive N = north, positive E = east.
// Course runs NW (≈325°) from the clubhouse at the SE corner.
const MKV_TEES: [number, number][] = [
  [-270,  170],  //  1 — near clubhouse (SE), plays NW
  [ -80,   45],  //  2 — mid-SE, plays SE
  [-240,  140],  //  3 — near clubhouse, plays NNW
  [  20,   40],  //  4 — centre, plays SSE
  [-175,  100],  //  5 — mid-SE, plays NW
  [  65,  -60],  //  6 — centre-west, plays SE
  [-120,   70],  //  7 — mid-SE, plays NNW
  [  30,   20],  //  8 — centre, plays NW
  [ 185,  -85],  //  9 — mid-NW, plays SE
  [  20,  -10],  // 10 — centre, plays NW (longest hole)
  [ 310, -210],  // 11 — NW end, plays SE
  [ 185, -120],  // 12 — mid-NW, plays NW
  [ 330, -220],  // 13 — NW end, plays SSE
  [ 150, -155],  // 14 — mid-W, plays SE
  [ -80,   10],  // 15 — centre-SE, plays NW
  [  55,  -80],  // 16 — centre-W, plays SE
  [-185,   90],  // 17 — SE area, plays NW
  [  70,  -90],  // 18 — centre-W, plays SE toward clubhouse
];

// Hole directions: mostly 325° (NW) or 145° (SE) along the course axis,
// with 340°/160° variants for cross-play.
const MARRICKVILLE: CourseData = {
  id: 'marrickville',
  name: 'Marrickville Golf Club',
  location: { lat: MKV_LAT, lng: MKV_LNG },
  holes: [
    // Hole 1 — Par 3, 228 yards, HC 2 — Long par 3 heading NW from clubhouse
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[0][0], MKV_TEES[0][1], 1, 3, 228, 2, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 2 — Par 3, 183 yards, HC 9 — Plays SE back toward clubhouse
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[1][0], MKV_TEES[1][1], 2, 3, 183, 9, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 3 — Par 4, 276 yards, HC 17 — NNW, OB left along river
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[2][0], MKV_TEES[2][1], 3, 4, 276, 17, 340, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -30 },
        { type: 'trees', distancePct: 0.5, sideOffset: 25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 15 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 80, description: 'Center fairway, short of green bunkers' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 2,
    }),

    // Hole 4 — Par 3, 200 yards, HC 7 — SSE, bunkers both sides
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[3][0], MKV_TEES[3][1], 4, 3, 200, 7, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -16 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 5,
    }),

    // Hole 5 — Par 4, 289 yards, HC 14 — NW, OB right, water left (Cooks River)
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[4][0], MKV_TEES[4][1], 5, 4, 289, 14, 325, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: 30 },
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 0.8, distancePct: 0.5, sideOffset: -25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Center fairway, avoid OB right and water left' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 6 — Par 3, 232 yards, HC 1 — #1 handicap, SE back, OB right
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[5][0], MKV_TEES[5][1], 6, 3, 232, 1, 145, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.6, sideOffset: 30 },
        { type: 'trees', distancePct: 0.55, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 7 — Par 3, 158 yards, HC 11 — NNW
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[6][0], MKV_TEES[6][1], 7, 3, 158, 11, 340, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -14 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 8 — Par 3, 188 yards, HC 6 — NW
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[7][0], MKV_TEES[7][1], 8, 3, 188, 6, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 3,
    }),

    // Hole 9 — Par 3, 179 yards, HC 10 — SE, back toward centre
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[8][0], MKV_TEES[8][1], 9, 3, 179, 10, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: -12 },
      ],
      greenSpeed: 11, greenFirmness: 'medium', greenSlope: 4,
    }),

    // Hole 10 — Par 4, 358 yards, HC 5 — Longest hole, NW, OB left (Cooks River)
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[9][0], MKV_TEES[9][1], 10, 4, 358, 5, 325, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.45, sideOffset: -32 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: -18 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 12 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Right side of fairway, away from Cooks River OB' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 5,
    }),

    // Hole 11 — Par 3, 149 yards, HC 15 — SE from NW end
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[10][0], MKV_TEES[10][1], 11, 3, 149, 15, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 12 — Par 3, 182 yards, HC 8 — NW
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[11][0], MKV_TEES[11][1], 12, 3, 182, 8, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.8, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 13 — Par 3, 188 yards, HC 4 — SSE from NW end
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[12][0], MKV_TEES[12][1], 13, 3, 188, 4, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.86, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.82, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 14 — Par 4, 284 yards, HC 18 — SE toward clubhouse end
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[13][0], MKV_TEES[13][1], 14, 4, 284, 18, 145, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 85, description: 'Center fairway layup' }],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 15 — Par 3, 162 yards, HC 13 — NW
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[14][0], MKV_TEES[14][1], 15, 3, 162, 13, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 16 — Par 4, 287 yards, HC 12 — SE
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[15][0], MKV_TEES[15][1], 16, 4, 287, 12, 145, {
      hazards: [
        { type: 'trees', distancePct: 0.45, sideOffset: -22 },
        { type: 'trees', distancePct: 0.5, sideOffset: 24 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 12 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Between the tree lines' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 17 — Par 4, 317 yards, HC 3 — NW
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[16][0], MKV_TEES[16][1], 17, 4, 317, 3, 325, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 95, description: 'Center fairway, avoid right bunker' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 18 — Par 3, 133 yards, HC 16 — SE toward clubhouse, shortest hole
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[17][0], MKV_TEES[17][1], 18, 3, 133, 16, 145, {
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

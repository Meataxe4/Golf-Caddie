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
// Marrickville Golf Club — real coordinates on the actual course
// Historic par 60 along Cooks River, Marrickville, Sydney
// Base point at the clubhouse/1st tee area
// ---------------------------------------------------------------------------
const MKV_LAT = -33.9108;
const MKV_LNG = 151.1555;

// Custom tee positions creating a realistic loop across the course property
// Marrickville is compact (~300x400m), so offsets are tight
const MKV_TEES: [number, number][] = [
  [0, 0],           // 1
  [200, 40],        // 2
  [350, 120],       // 3
  [340, 300],       // 4
  [200, 350],       // 5
  [40, 280],        // 6
  [-80, 150],       // 7
  [50, 50],         // 8
  [180, 180],       // 9
  [320, 250],       // 10
  [150, 320],       // 11
  [30, 230],        // 12
  [100, 100],       // 13
  [260, 160],       // 14
  [220, 310],       // 15
  [80, 320],        // 16
  [50, 180],        // 17
  [150, 60],        // 18
];

const MARRICKVILLE: CourseData = {
  id: 'marrickville',
  name: 'Marrickville Golf Club',
  location: { lat: MKV_LAT, lng: MKV_LNG },
  holes: [
    // Hole 1 — Par 3, 228 yards, HC 2 — Long par 3
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[0][0], MKV_TEES[0][1], 1, 3, 228, 2, 15, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 2 — Par 3, 183 yards, HC 9 — Elevated green
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[1][0], MKV_TEES[1][1], 2, 3, 183, 9, 50, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 3 — Par 4, 276 yards, HC 17 — OB left, trees right
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[2][0], MKV_TEES[2][1], 3, 4, 276, 17, 120, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -30 },
        { type: 'trees', distancePct: 0.5, sideOffset: 25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 15 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 80, description: 'Center fairway, short of green bunkers' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 2,
    }),

    // Hole 4 — Par 3, 200 yards, HC 7 — Bunkers both sides
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[3][0], MKV_TEES[3][1], 4, 3, 200, 7, 210, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -16 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 5,
    }),

    // Hole 5 — Par 4, 289 yards, HC 14 — OB right, water left
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[4][0], MKV_TEES[4][1], 5, 4, 289, 14, 250, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: 30 },
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 0.8, distancePct: 0.5, sideOffset: -25 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Center fairway, avoid OB right and water left' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 6 — Par 3, 232 yards, HC 1 — #1 handicap, OB right
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[5][0], MKV_TEES[5][1], 6, 3, 232, 1, 320, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.6, sideOffset: 30 },
        { type: 'trees', distancePct: 0.55, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 7 — Par 3, 158 yards, HC 11
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[6][0], MKV_TEES[6][1], 7, 3, 158, 11, 30, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -14 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 8 — Par 3, 188 yards, HC 6 — Blind par 3
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[7][0], MKV_TEES[7][1], 8, 3, 188, 6, 80, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 3,
    }),

    // Hole 9 — Par 3, 179 yards, HC 10
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[8][0], MKV_TEES[8][1], 9, 3, 179, 10, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: -12 },
      ],
      greenSpeed: 11, greenFirmness: 'medium', greenSlope: 4,
    }),

    // Hole 10 — Par 4, 358 yards, HC 5 — Longest hole, OB left (Cooks River)
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[9][0], MKV_TEES[9][1], 10, 4, 358, 5, 280, {
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
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[10][0], MKV_TEES[10][1], 11, 3, 149, 15, 340, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 12 — Par 3, 182 yards, HC 8
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[11][0], MKV_TEES[11][1], 12, 3, 182, 8, 60, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.8, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 13 — Par 3, 188 yards, HC 4
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[12][0], MKV_TEES[12][1], 13, 3, 188, 4, 140, {
      hazards: [
        { type: 'bunker', distancePct: 0.86, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.82, sideOffset: -14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 14 — Par 4, 284 yards, HC 18
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[13][0], MKV_TEES[13][1], 14, 4, 284, 18, 310, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 85, description: 'Center fairway layup' }],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),

    // Hole 15 — Par 3, 162 yards, HC 13
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[14][0], MKV_TEES[14][1], 15, 3, 162, 13, 40, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),

    // Hole 16 — Par 4, 287 yards, HC 12
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[15][0], MKV_TEES[15][1], 16, 4, 287, 12, 170, {
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
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[16][0], MKV_TEES[16][1], 17, 4, 317, 3, 100, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 10 },
      ],
      layups: [{ distanceToGreen: 95, description: 'Center fairway, avoid right bunker' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),

    // Hole 18 — Par 3, 133 yards, HC 16 — Shortest hole
    makeHole(MKV_LAT, MKV_LNG, MKV_TEES[17][0], MKV_TEES[17][1], 18, 3, 133, 16, 300, {
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

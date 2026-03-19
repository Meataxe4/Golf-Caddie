// ============================================================================
// Sample Course Data — Marrickville Golf Club
// ============================================================================
// Par 60 (men), 18 holes, ~3650 metres. Along the Cooks River, inner-west Sydney.
// Course axis runs NW–SE (~325°/145°). All distances in METRES.
// Base point at the centre of the course.

import type { CourseData, HoleLayout, Hazard, GreenContour, LayupTarget } from '../models/types';

function coord(baseLat: number, baseLng: number, mNorth: number, mEast: number) {
  const latOffset = mNorth / 111320;
  const lngOffset = mEast / (111320 * Math.cos(baseLat * Math.PI / 180));
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

// Marrickville Golf Club — centre of course
const BASE_LAT = -33.9190;
const BASE_LNG = 151.1400;

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
  doglegMeters?: number;
  layups?: Partial<LayupTarget>[];
  green?: {
    slopeDirection: number;
    slopeSeverity: number;
    speed: number;
    firmness: 'soft' | 'medium' | 'firm';
  };
}

interface PathInfo {
  teeN: number; teeE: number;
  bendN: number; bendE: number;
  pinN: number; pinE: number;
  seg1Len: number;
  seg2Len: number;
  totalLen: number;
  headingRad1: number;
  headingRad2: number;
  isDogleg: boolean;
}

function buildPath(
  teeN: number, teeE: number, length: number, directionDeg: number,
  dogleg?: 'left' | 'right', doglegMeters?: number,
): PathInfo {
  const rad = (directionDeg * Math.PI) / 180;
  if (!dogleg || !doglegMeters) {
    const pinN = teeN + length * Math.cos(rad);
    const pinE = teeE + length * Math.sin(rad);
    return { teeN, teeE, bendN: pinN, bendE: pinE, pinN, pinE, seg1Len: length, seg2Len: 0, totalLen: length, headingRad1: rad, headingRad2: rad, isDogleg: false };
  }
  const turnRad = ((dogleg === 'left' ? -25 : 25) * Math.PI) / 180;
  const rad2 = rad + turnRad;
  const bendN = teeN + doglegMeters * Math.cos(rad);
  const bendE = teeE + doglegMeters * Math.sin(rad);
  const remainDist = length - doglegMeters;
  const pinN = bendN + remainDist * Math.cos(rad2);
  const pinE = bendE + remainDist * Math.sin(rad2);
  return { teeN, teeE, bendN, bendE, pinN, pinE, seg1Len: doglegMeters, seg2Len: remainDist, totalLen: length, headingRad1: rad, headingRad2: rad2, isDogleg: true };
}

function pointOnPath(path: PathInfo, dist: number): { n: number; e: number; heading: number } {
  if (!path.isDogleg || dist <= path.seg1Len) {
    const d = Math.min(dist, path.seg1Len);
    return { n: path.teeN + d * Math.cos(path.headingRad1), e: path.teeE + d * Math.sin(path.headingRad1), heading: path.headingRad1 };
  }
  const d2 = dist - path.seg1Len;
  return { n: path.bendN + d2 * Math.cos(path.headingRad2), e: path.bendE + d2 * Math.sin(path.headingRad2), heading: path.headingRad2 };
}

function lateralOffset(n: number, e: number, heading: number, offsetM: number): { n: number; e: number } {
  const perpHeading = heading + Math.PI / 2;
  return { n: n + offsetM * Math.cos(perpHeading), e: e + offsetM * Math.sin(perpHeading) };
}

// ---------------------------------------------------------------------------
// Tee positions — [northMeters, eastMeters] from course centre.
// Course runs NW (≈325°) from the clubhouse at the SE corner.
// ---------------------------------------------------------------------------
const TEE_OFFSETS: [number, number][] = [
  [-247,  155],  //  1 — near clubhouse (SE), plays NW
  [ -73,   41],  //  2 — mid-SE, plays SE
  [-219,  128],  //  3 — near clubhouse, plays NNW
  [  18,   37],  //  4 — centre, plays SSE
  [-160,   91],  //  5 — mid-SE, plays NW
  [  59,  -55],  //  6 — centre-west, plays SE
  [-110,   64],  //  7 — mid-SE, plays NNW
  [  27,   18],  //  8 — centre, plays NW
  [ 169,  -78],  //  9 — mid-NW, plays SE
  [  18,   -9],  // 10 — centre, plays NW (longest hole)
  [ 283, -192],  // 11 — NW end, plays SE
  [ 169, -110],  // 12 — mid-NW, plays NW
  [ 302, -201],  // 13 — NW end, plays SSE
  [ 137, -142],  // 14 — mid-W, plays SE
  [ -73,    9],  // 15 — centre-SE, plays NW
  [  50,  -73],  // 16 — centre-W, plays SE
  [-169,   82],  // 17 — SE area, plays NW
  [  64,  -82],  // 18 — centre-W, plays SE toward clubhouse
];

function makeHole(
  num: number, par: number, length: number, hcap: number,
  direction: number, opts: HoleOpts = {},
): HoleLayout {
  const [teeN, teeE] = TEE_OFFSETS[num - 1];
  const path = buildPath(teeN, teeE, length, direction, opts.dogleg, opts.doglegMeters);
  const tee = coord(BASE_LAT, BASE_LNG, path.teeN, path.teeE);
  const pin = coord(BASE_LAT, BASE_LNG, path.pinN, path.pinE);

  const fairwayPoints = [];
  for (let d = 50; d < length; d += 40) {
    const pt = pointOnPath(path, d);
    fairwayPoints.push(coord(BASE_LAT, BASE_LNG, pt.n, pt.e));
  }

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

  const approachHeading = path.isDogleg ? path.headingRad2 : path.headingRad1;
  const g = { slopeDirection: 180, slopeSeverity: 0.3, speed: 10, firmness: 'medium' as const, ...opts.green };
  const frontN = path.pinN - 10 * Math.cos(approachHeading);
  const frontE = path.pinE - 10 * Math.sin(approachHeading);
  const backN = path.pinN + 10 * Math.cos(approachHeading);
  const backE = path.pinE + 10 * Math.sin(approachHeading);

  const greenContour: GreenContour = {
    frontEdge: coord(BASE_LAT, BASE_LNG, frontN, frontE),
    backEdge: coord(BASE_LAT, BASE_LNG, backN, backE),
    centerGreen: pin,
    slopeDirection: g.slopeDirection,
    slopeSeverity: g.slopeSeverity,
    firmness: g.firmness,
    speed: g.speed,
  };

  const layupTargets: LayupTarget[] = (opts.layups ?? []).map(l => {
    const layupDist = length - (l.distanceToGreen ?? 90);
    const pt = pointOnPath(path, layupDist);
    return {
      position: l.position ?? coord(BASE_LAT, BASE_LNG, pt.n, pt.e),
      distanceToGreen: l.distanceToGreen ?? 90,
      safetyRating: l.safetyRating ?? 0.8,
      fairwayWidth: l.fairwayWidth ?? 30,
      description: l.description ?? 'Centre fairway layup',
    };
  });

  return {
    holeNumber: num, par, handicapIndex: hcap, lengthMeters: length,
    teePosition: tee, pinPosition: pin, fairwayCenter: fairwayPoints,
    hazards, greenContour, layupTargets,
    doglegDirection: opts.dogleg ?? 'straight',
    doglegMeters: opts.doglegMeters,
  };
}

// ============================================================================
// 18 Holes — Front 9: 3,3,4,3,4,3,3,3,3 = 29  Back 9: 4,3,3,3,4,3,4,4,3 = 31
// Par 60, ~3650 metres (blue tees)
// ============================================================================

export const SAMPLE_COURSE: CourseData = {
  id: 'marrickville',
  name: 'Marrickville Golf Club',
  location: { lat: BASE_LAT, lng: BASE_LNG },
  holes: [
    // ====================== FRONT 9 — Par 29, 1767m ======================

    // Hole 1 — Par 3, 209m, HC 2 — Long par 3 heading NW from clubhouse
    makeHole(1, 3, 209, 2, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 13 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -11 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.3, speed: 10, firmness: 'medium' },
    }),

    // Hole 2 — Par 3, 167m, HC 9 — Plays SE back toward clubhouse
    makeHole(2, 3, 167, 9, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 9 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.35, speed: 11, firmness: 'firm' },
    }),

    // Hole 3 — Par 4, 252m, HC 17 — Signature hole, NNW, OB left along river
    makeHole(3, 4, 252, 17, 340, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -27 },
        { type: 'trees', distancePct: 0.5, sideOffset: 23 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -9 },
      ],
      layups: [{ distanceToGreen: 73, description: 'Centre fairway, short of green bunkers' }],
      green: { slopeDirection: 90, slopeSeverity: 0.2, speed: 10, firmness: 'medium' },
    }),

    // Hole 4 — Par 3, 183m, HC 7 — SSE, bunkers both sides
    makeHole(4, 3, 183, 7, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 15 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -15 },
      ],
      green: { slopeDirection: 270, slopeSeverity: 0.4, speed: 11, firmness: 'firm' },
    }),

    // Hole 5 — Par 4, 264m, HC 14 — NW, OB right, water left (Cooks River)
    makeHole(5, 4, 264, 14, 325, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: 27 },
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 0.8, distancePct: 0.5, sideOffset: -23 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: 11 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -9 },
      ],
      layups: [{ distanceToGreen: 82, description: 'Centre fairway, avoid OB right and water left' }],
      green: { slopeDirection: 45, slopeSeverity: 0.25, speed: 10, firmness: 'medium' },
    }),

    // Hole 6 — Par 3, 212m, HC 1 — #1 handicap, SE back, OB right
    makeHole(6, 3, 212, 1, 145, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.6, sideOffset: 27 },
        { type: 'trees', distancePct: 0.55, sideOffset: 20 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -13 },
      ],
      green: { slopeDirection: 315, slopeSeverity: 0.35, speed: 11, firmness: 'firm' },
    }),

    // Hole 7 — Par 3, 144m, HC 11 — Short par 3, small elevated green, NNW
    makeHole(7, 3, 144, 11, 340, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 11 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -13 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.3, speed: 10, firmness: 'medium' },
    }),

    // Hole 8 — Par 3, 172m, HC 6 — Tough par 3, bunkers both sides, NW
    makeHole(8, 3, 172, 6, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 13 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -11 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.3, speed: 10, firmness: 'soft' },
    }),

    // Hole 9 — Par 3, 164m, HC 10 — SE, back toward centre
    makeHole(9, 3, 164, 10, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: -11 },
      ],
      green: { slopeDirection: 90, slopeSeverity: 0.35, speed: 11, firmness: 'medium' },
    }),

    // ====================== BACK 9 — Par 31, 1883m ======================

    // Hole 10 — Par 4, 327m, HC 5 — Longest hole, NW, OB left (Cooks River)
    makeHole(10, 4, 327, 5, 325, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.45, sideOffset: -29 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: -16 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -13 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 11 },
      ],
      layups: [{ distanceToGreen: 91, description: 'Right side of fairway, away from Cooks River OB' }],
      green: { slopeDirection: 225, slopeSeverity: 0.4, speed: 11, firmness: 'firm' },
    }),

    // Hole 11 — Par 3, 136m, HC 15 — Shortest par 3 on back, SE from NW end
    makeHole(11, 3, 136, 15, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 9 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.2, speed: 9, firmness: 'soft' },
    }),

    // Hole 12 — Par 3, 166m, HC 8 — NW
    makeHole(12, 3, 166, 8, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.84, sideOffset: 13 },
        { type: 'bunker', distancePct: 0.8, sideOffset: -11 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.25, speed: 10, firmness: 'medium' },
    }),

    // Hole 13 — Par 3, 172m, HC 4 — SSE from NW end
    makeHole(13, 3, 172, 4, 160, {
      hazards: [
        { type: 'bunker', distancePct: 0.86, sideOffset: 11 },
        { type: 'bunker', distancePct: 0.82, sideOffset: -13 },
      ],
      green: { slopeDirection: 270, slopeSeverity: 0.35, speed: 11, firmness: 'firm' },
    }),

    // Hole 14 — Par 4, 260m, HC 18 — SE toward clubhouse end
    makeHole(14, 4, 260, 18, 145, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 15 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -11 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 9 },
      ],
      layups: [{ distanceToGreen: 78, description: 'Centre fairway layup' }],
      green: { slopeDirection: 90, slopeSeverity: 0.2, speed: 9, firmness: 'soft' },
    }),

    // Hole 15 — Par 3, 148m, HC 13 — NW
    makeHole(15, 3, 148, 13, 325, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 13 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -11 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.3, speed: 10, firmness: 'medium' },
    }),

    // Hole 16 — Par 4, 262m, HC 12 — SE, tree-lined
    makeHole(16, 4, 262, 12, 145, {
      hazards: [
        { type: 'trees', distancePct: 0.45, sideOffset: -20 },
        { type: 'trees', distancePct: 0.5, sideOffset: 22 },
        { type: 'fairway_bunker', distancePct: 0.6, sideOffset: -13 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 11 },
      ],
      layups: [{ distanceToGreen: 82, description: 'Between the tree lines' }],
      green: { slopeDirection: 45, slopeSeverity: 0.25, speed: 10, firmness: 'medium' },
    }),

    // Hole 17 — Par 4, 290m, HC 3 — NW, hardest par 4
    makeHole(17, 4, 290, 3, 325, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -13 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 9 },
      ],
      layups: [{ distanceToGreen: 87, description: 'Centre fairway, avoid right bunker' }],
      green: { slopeDirection: 315, slopeSeverity: 0.35, speed: 11, firmness: 'firm' },
    }),

    // Hole 18 — Par 3, 122m, HC 16 — Shortest hole, SE toward clubhouse
    makeHole(18, 3, 122, 16, 145, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 9 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.2, speed: 10, firmness: 'medium' },
    }),
  ],
  slopeRating: 99,
  courseRating: 60.1,
  altitudeEffect: 1.0,
};

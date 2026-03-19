// ============================================================================
// Sample Course Data — Torrey Pines South Course
// ============================================================================
// Real pars: Front 4-4-3-4-4-5-4-3-5 = 36, Back 4-3-4-5-4-4-3-4-5 = 36
// Base point at the 1st tee near the pro shop (south end of course).
// Tee offsets centered so holes span both east and west of the base,
// keeping overlays on the actual course property in satellite view.

import type { CourseData, HoleLayout, Hazard, GreenContour, LayupTarget } from '../models/types';

function coord(baseLat: number, baseLng: number, ydsNorth: number, ydsEast: number) {
  const metersPerYard = 0.9144;
  const latOffset = (ydsNorth * metersPerYard) / 111320;
  const lngOffset = (ydsEast * metersPerYard) / (111320 * Math.cos(baseLat * Math.PI / 180));
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

// Torrey Pines South Course — 1st tee near pro shop at south end
const BASE_LAT = 32.8995;
const BASE_LNG = -117.2430;

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

// ---------------------------------------------------------------------------
// Tee positions — [northYards, eastYards] from base.
// Course runs N–S along the coast. Ocean is WEST (negative E).
// Offsets create two corridors (east & west) with holes zigzagging between them.
// ---------------------------------------------------------------------------
const TEE_OFFSETS: [number, number][] = [
  [0,      50],    //  1: Near pro shop, east corridor, plays N
  [455,    55],    //  2: North of H1 green, plays N
  [840,    40],    //  3: Far north, par 3 plays W toward ocean
  [825,  -170],    //  4: West corridor, plays S
  [345,  -165],    //  5: Mid west, plays N
  [795,  -160],    //  6: North west, long par 5 plays S
  [240,  -260],    //  7: SW area, plays N
  [700,  -250],    //  8: NW, par 3 plays E
  [720,   -50],    //  9: North centre, long par 5 plays S
  [50,    -80],    // 10: Near clubhouse west, plays N
  [468,   -90],    // 11: Mid west, par 3 plays W
  [450,  -280],    // 12: West corridor, plays N
  [950,  -270],    // 13: Far NW, long par 5 plays S
  [340,  -260],    // 14: Mid west, plays N
  [780,  -255],    // 15: NW, plays S
  [350,  -120],    // 16: Mid, par 3 plays E
  [380,   100],    // 17: Mid east, plays N
  [820,    90],    // 18: North east, par 5 plays S toward clubhouse
];

function makeHole(
  num: number, par: number, length: number, hcap: number,
  direction: number, opts: HoleOpts = {},
): HoleLayout {
  const [teeN, teeE] = TEE_OFFSETS[num - 1];
  const path = buildPath(teeN, teeE, length, direction, opts.dogleg, opts.doglegYards);
  const tee = coord(BASE_LAT, BASE_LNG, path.teeN, path.teeE);
  const pin = coord(BASE_LAT, BASE_LNG, path.pinN, path.pinE);

  const fairwayPoints = [];
  for (let d = 80; d < length; d += 60) {
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
    holeNumber: num, par, handicapIndex: hcap, lengthYards: length,
    teePosition: tee, pinPosition: pin, fairwayCenter: fairwayPoints,
    hazards, greenContour, layupTargets,
    doglegDirection: opts.dogleg ?? 'straight',
    doglegYards: opts.doglegYards,
  };
}

// ============================================================================
// 18 Holes — Front 9: 4,4,3,4,4,5,4,3,5 = 36  Back 9: 4,3,4,5,4,4,3,4,5 = 36
// ============================================================================

export const SAMPLE_COURSE: CourseData = {
  id: 'torrey-pines-south',
  name: 'Torrey Pines South',
  location: { lat: BASE_LAT, lng: BASE_LNG },
  holes: [
    // ====================== FRONT 9 ======================

    // Hole 1 — Par 4, 451 yds — Favor left side; green guarded by bunkers both sides
    makeHole(1, 4, 451, 7, 5, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.62, sideOffset: 20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -16, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 200, slopeSeverity: 0.25, speed: 10, firmness: 'medium' },
    }),

    // Hole 2 — Par 4, 389 yds — Short par 4, Torrey Pines grove right
    makeHole(2, 4, 389, 11, 355, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.58, sideOffset: -18, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 17, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 160, slopeSeverity: 0.35, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 3 — Par 3, 201 yds — Signature hole overlooking La Jolla, downhill
    makeHole(3, 3, 201, 15, 265, {
      hazards: [
        { type: 'bunker', distancePct: 0.92, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.95, sideOffset: 17, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 90, slopeSeverity: 0.3, speed: 11, firmness: 'firm' },
    }),

    // Hole 4 — Par 4, 490 yds — Dramatic cliffs left (ocean), fairway bunkers right
    makeHole(4, 4, 490, 1, 185, {
      hazards: [
        { type: 'ob', distancePct: 0.50, sideOffset: -35, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -15, recoveryDifficulty: 0.6 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 15, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 310, slopeSeverity: 0.4, speed: 11.5, firmness: 'firm' },
    }),

    // Hole 5 — Par 4, 454 yds — Plays back inland uphill, bunkers both sides
    makeHole(5, 4, 454, 13, 0, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -20, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.91, sideOffset: 16, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.40, sideOffset: 30, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 45, slopeSeverity: 0.2, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 6 — Par 5, 564 yds — Dogleg right, favor right side off tee
    makeHole(6, 5, 564, 9, 5, {
      dogleg: 'right',
      doglegYards: 280,
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.52, sideOffset: 22, recoveryDifficulty: 0.3 },
        { type: 'water', distancePct: 0.85, sideOffset: -15, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 18, recoveryDifficulty: 0.4 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Short of the water, 100 yards out' }],
      green: { slopeDirection: 270, slopeSeverity: 0.35, speed: 11, firmness: 'medium' },
    }),

    // Hole 7 — Par 4, 462 yds — Dogleg right, favor left side off tee, elevated green
    makeHole(7, 4, 462, 3, 345, {
      dogleg: 'right',
      doglegYards: 240,
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.56, sideOffset: 22, recoveryDifficulty: 0.4 },
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -15, recoveryDifficulty: 0.6 },
        { type: 'trees', distancePct: 0.50, sideOffset: -35, recoveryDifficulty: 0.7 },
      ],
      green: { slopeDirection: 135, slopeSeverity: 0.3, speed: 10, firmness: 'medium' },
    }),

    // Hole 8 — Par 3, 177 yds — Uphill, add extra club
    makeHole(8, 3, 177, 5, 80, {
      hazards: [
        { type: 'bunker', distancePct: 0.92, sideOffset: 17, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.95, sideOffset: -16, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 350, slopeSeverity: 0.25, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 9 — Par 5, 615 yds — Straightaway par 5, six fairway bunkers
    makeHole(9, 5, 615, 2, 185, {
      hazards: [
        { type: 'ob', distancePct: 0.50, sideOffset: -38, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.52, sideOffset: 20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -17, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 15, recoveryDifficulty: 0.4 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Left of creek, 90 yards' }],
      green: { slopeDirection: 225, slopeSeverity: 0.35, speed: 11.5, firmness: 'firm' },
    }),

    // ====================== BACK 9 ======================

    // Hole 10 — Par 4, 454 yds — Good birdie opportunity, aim left-center
    makeHole(10, 4, 454, 10, 0, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -22, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.93, sideOffset: 18, recoveryDifficulty: 0.4 },
        { type: 'trees', distancePct: 0.45, sideOffset: 32, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 120, slopeSeverity: 0.2, speed: 10, firmness: 'medium' },
    }),

    // Hole 11 — Par 3, 225 yds — Downhill, prevailing wind makes it play longer
    makeHole(11, 3, 225, 16, 260, {
      hazards: [
        { type: 'bunker', distancePct: 0.90, sideOffset: -17, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 15, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.98, sideOffset: 0, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 0, slopeSeverity: 0.3, speed: 12, firmness: 'firm' },
    }),

    // Hole 12 — Par 4, 505 yds — Canyon left, must play right
    makeHole(12, 4, 505, 8, 0, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: 24, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'trees', distancePct: 0.48, sideOffset: -30, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 240, slopeSeverity: 0.4, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 13 — Par 5, 621 yds — Longest hole, dogleg left, eucalyptus both sides
    makeHole(13, 5, 621, 6, 185, {
      dogleg: 'left',
      doglegYards: 300,
      hazards: [
        { type: 'water', distancePct: 0.88, sideOffset: -15, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.50, sideOffset: -22, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'trees', distancePct: 0.55, sideOffset: 32, recoveryDifficulty: 0.6 },
      ],
      layups: [{ distanceToGreen: 110, description: 'Right of fairway bunker, 110 out' }],
      green: { slopeDirection: 315, slopeSeverity: 0.25, speed: 9, firmness: 'soft' },
    }),

    // Hole 14 — Par 4, 437 yds — Canyon left, two tees change strategy
    makeHole(14, 4, 437, 4, 0, {
      hazards: [
        { type: 'water', distancePct: 0.90, sideOffset: 22, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.55, sideOffset: -20, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: -15, recoveryDifficulty: 0.6 },
        { type: 'ob', distancePct: 0.50, sideOffset: 38, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
      ],
      green: { slopeDirection: 70, slopeSeverity: 0.3, speed: 11, firmness: 'firm' },
    }),

    // Hole 15 — Par 4, 480 yds — Eucalyptus both sides, slightly uphill green
    makeHole(15, 4, 480, 14, 185, {
      hazards: [
        { type: 'bunker', distancePct: 0.90, sideOffset: -18, recoveryDifficulty: 0.5 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 16, recoveryDifficulty: 0.4 },
        { type: 'waste_area', distancePct: 0.85, sideOffset: 25, recoveryDifficulty: 0.6 },
      ],
      green: { slopeDirection: 180, slopeSeverity: 0.35, speed: 10.5, firmness: 'medium' },
    }),

    // Hole 16 — Par 3, 227 yds — Multiple teeing grounds, wind complicates
    makeHole(16, 3, 227, 12, 80, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.60, sideOffset: -18, recoveryDifficulty: 0.3 },
        { type: 'bunker', distancePct: 0.94, sideOffset: 16, recoveryDifficulty: 0.4 },
      ],
      green: { slopeDirection: 155, slopeSeverity: 0.2, speed: 9.5, firmness: 'soft' },
    }),

    // Hole 17 — Par 4, 443 yds — High draw avoids fairway bunkers right, canyon left
    makeHole(17, 4, 443, 17, 0, {
      hazards: [
        { type: 'water', distancePct: 0.87, sideOffset: 0, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', distancePct: 0.95, sideOffset: -17, recoveryDifficulty: 0.6 },
        { type: 'bunker', distancePct: 0.96, sideOffset: 18, recoveryDifficulty: 0.5 },
      ],
      green: { slopeDirection: 260, slopeSeverity: 0.4, speed: 12, firmness: 'firm' },
    }),

    // Hole 18 — Par 5, 570 yds — Iconic finish (Tiger 2008), ocean left, pond guards green
    makeHole(18, 5, 570, 18, 185, {
      hazards: [
        { type: 'water', distancePct: 0.85, sideOffset: -10, penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', distancePct: 0.50, sideOffset: -22, recoveryDifficulty: 0.4 },
        { type: 'bunker', distancePct: 0.93, sideOffset: 18, recoveryDifficulty: 0.5 },
        { type: 'ob', distancePct: 0.45, sideOffset: 36, penaltyStrokes: 2, recoveryDifficulty: 1.0 },
        { type: 'trees', distancePct: 0.55, sideOffset: 32, recoveryDifficulty: 0.6 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Short of the water, 100 yards' }],
      green: { slopeDirection: 100, slopeSeverity: 0.3, speed: 11, firmness: 'medium' },
    }),
  ],
  slopeRating: 143,
  courseRating: 78.1,
  altitudeEffect: 1.0,
};

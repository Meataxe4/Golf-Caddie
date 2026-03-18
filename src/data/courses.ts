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

// --- Ocean Links Golf Club ---
const OCEAN_LAT = 36.57;
const OCEAN_LNG = -121.95;

const OCEAN_LINKS: CourseData = {
  id: 'ocean-links',
  name: 'Ocean Links Golf Club',
  location: { lat: OCEAN_LAT, lng: OCEAN_LNG },
  holes: [
    makeHole(OCEAN_LAT, OCEAN_LNG, 1, 4, 410, 5, 10, {
      hazards: [
        { type: 'bunker', distancePct: 0.65, sideOffset: 20 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 2, 3, 175, 13, 80, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -25 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 3, 5, 540, 1, 45, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.55, sideOffset: -18 },
        { type: 'fairway_bunker', distancePct: 0.42, sideOffset: 22 },
      ],
      layups: [{ distanceToGreen: 110, description: 'Short of creek crossing' }],
      dogleg: 'right', doglegYards: 260,
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 4, 4, 375, 11, 170, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 15 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 5, 4, 445, 3, 200, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -35 },
        { type: 'bunker', distancePct: 0.78, sideOffset: 18 },
      ],
      dogleg: 'left', doglegYards: 245,
      greenSpeed: 11, greenFirmness: 'firm',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 6, 3, 210, 15, 290, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.82, sideOffset: -16 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 5,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 7, 4, 390, 9, 350, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.58, sideOffset: -20 },
      ],
      greenSpeed: 9, greenFirmness: 'soft',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 8, 5, 560, 7, 30, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.62, sideOffset: -15 },
        { type: 'bunker', distancePct: 0.88, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.92, sideOffset: -10 },
      ],
      layups: [{ distanceToGreen: 95, description: 'Left side, short of water' }],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 3,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 9, 4, 425, 2, 120, {
      hazards: [
        { type: 'bunker', distancePct: 0.75, sideOffset: 16 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.45, sideOffset: -30 },
      ],
      greenSpeed: 11, greenFirmness: 'medium',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 10, 4, 395, 8, 180, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: -14 },
      ],
      greenSpeed: 10, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 11, 3, 160, 18, 270, {
      hazards: [
        { type: 'bunker', distancePct: 0.78, sideOffset: 12 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 12, 5, 510, 6, 0, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.6, sideOffset: 20 },
        { type: 'fairway_bunker', distancePct: 0.45, sideOffset: -18 },
      ],
      dogleg: 'left', doglegYards: 235,
      layups: [{ distanceToGreen: 100, description: 'Right side of fairway' }],
      greenSpeed: 11, greenFirmness: 'medium',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 13, 4, 435, 4, 90, {
      hazards: [
        { type: 'bunker', distancePct: 0.72, sideOffset: 20 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -15 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 14, 4, 360, 12, 150, {
      hazards: [
        { type: 'bunker', distancePct: 0.85, sideOffset: 12 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 15, 3, 190, 16, 250, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1, distancePct: 0.45, sideOffset: -20 },
        { type: 'bunker', distancePct: 0.85, sideOffset: 14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 16, 5, 530, 10, 310, {
      hazards: [
        { type: 'bunker', distancePct: 0.5, sideOffset: 22 },
        { type: 'water', penaltyStrokes: 1, distancePct: 0.72, sideOffset: -12 },
      ],
      layups: [{ distanceToGreen: 105, description: 'Short of pond' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 17, 4, 415, 14, 20, {
      hazards: [
        { type: 'bunker', distancePct: 0.68, sideOffset: -18 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.35, sideOffset: 30 },
      ],
      greenSpeed: 9, greenFirmness: 'medium',
    }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 18, 4, 450, 17, 80, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.55, sideOffset: -22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.92, sideOffset: -10 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
  ],
  slopeRating: 139,
  courseRating: 73.4,
  altitudeEffect: 1.0,
};

// --- Mountain Ridge Country Club ---
const MTN_LAT = 39.74;
const MTN_LNG = -104.99;

const MOUNTAIN_RIDGE: CourseData = {
  id: 'mountain-ridge',
  name: 'Mountain Ridge Country Club',
  location: { lat: MTN_LAT, lng: MTN_LNG },
  holes: [
    makeHole(MTN_LAT, MTN_LNG, 1, 4, 365, 9, 20, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
      ],
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(MTN_LAT, MTN_LNG, 2, 5, 555, 3, 60, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.58, sideOffset: -20 },
        { type: 'bunker', distancePct: 0.86, sideOffset: 16 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Flat area before ravine' }],
      dogleg: 'right', doglegYards: 270,
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(MTN_LAT, MTN_LNG, 3, 4, 400, 5, 110, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.52, sideOffset: 24 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(MTN_LAT, MTN_LNG, 4, 3, 185, 11, 200, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 16 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -18 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(MTN_LAT, MTN_LNG, 5, 4, 440, 1, 250, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.4, sideOffset: -32 },
        { type: 'water', penaltyStrokes: 1, distancePct: 0.68, sideOffset: 18 },
      ],
      dogleg: 'left', doglegYards: 230,
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(MTN_LAT, MTN_LNG, 6, 4, 380, 13, 310, {
      hazards: [
        { type: 'bunker', distancePct: 0.75, sideOffset: -15 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),
    makeHole(MTN_LAT, MTN_LNG, 7, 3, 155, 17, 0, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 10 },
      ],
      greenSpeed: 11, greenFirmness: 'medium', greenSlope: 4,
    }),
    makeHole(MTN_LAT, MTN_LNG, 8, 5, 525, 7, 80, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.6, sideOffset: -16 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 14 },
        { type: 'fairway_bunker', distancePct: 0.38, sideOffset: 20 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Before the stream' }],
      greenSpeed: 10, greenFirmness: 'firm', greenSlope: 3,
    }),
    makeHole(MTN_LAT, MTN_LNG, 9, 4, 415, 15, 140, {
      hazards: [
        { type: 'bunker', distancePct: 0.72, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -14 },
      ],
      greenSpeed: 12, greenFirmness: 'medium', greenSlope: 5,
    }),
    makeHole(MTN_LAT, MTN_LNG, 10, 4, 405, 6, 180, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.48, sideOffset: -22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: 12 },
      ],
      greenSpeed: 10, greenFirmness: 'soft',
    }),
    makeHole(MTN_LAT, MTN_LNG, 11, 5, 570, 2, 230, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.62, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -14 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.35, sideOffset: -35 },
      ],
      dogleg: 'right', doglegYards: 280,
      layups: [{ distanceToGreen: 115, description: 'Wide area before creek' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(MTN_LAT, MTN_LNG, 12, 3, 200, 14, 300, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -25 },
        { type: 'bunker', distancePct: 0.85, sideOffset: 15 },
      ],
      greenSpeed: 9, greenFirmness: 'medium', greenSlope: 3,
    }),
    makeHole(MTN_LAT, MTN_LNG, 13, 4, 350, 10, 350, {
      hazards: [
        { type: 'bunker', distancePct: 0.78, sideOffset: -16 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 2,
    }),
    makeHole(MTN_LAT, MTN_LNG, 14, 4, 430, 4, 40, {
      hazards: [
        { type: 'bunker', distancePct: 0.7, sideOffset: 20 },
        { type: 'water', penaltyStrokes: 1, distancePct: 0.55, sideOffset: -18 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(MTN_LAT, MTN_LNG, 15, 5, 545, 8, 100, {
      hazards: [
        { type: 'fairway_bunker', distancePct: 0.45, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -12 },
      ],
      layups: [{ distanceToGreen: 95, description: 'Center fairway' }],
      greenSpeed: 11, greenFirmness: 'medium',
    }),
    makeHole(MTN_LAT, MTN_LNG, 16, 3, 170, 16, 220, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.78, sideOffset: -16 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(MTN_LAT, MTN_LNG, 17, 4, 395, 12, 280, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 18 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 4,
    }),
    makeHole(MTN_LAT, MTN_LNG, 18, 4, 455, 18, 330, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.6, sideOffset: -20 },
        { type: 'bunker', distancePct: 0.88, sideOffset: 14 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.3, sideOffset: 32 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
  ],
  slopeRating: 134,
  courseRating: 71.8,
  altitudeEffect: 1.12, // Denver altitude — ball goes ~12% farther
};

// --- Magnolia Pines Golf Resort ---
const MAG_LAT = 30.40;
const MAG_LNG = -87.21;

const MAGNOLIA_PINES: CourseData = {
  id: 'magnolia-pines',
  name: 'Magnolia Pines Golf Resort',
  location: { lat: MAG_LAT, lng: MAG_LNG },
  holes: [
    makeHole(MAG_LAT, MAG_LNG, 1, 4, 370, 7, 0, {
      hazards: [
        { type: 'bunker', distancePct: 0.78, sideOffset: 16 },
      ],
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(MAG_LAT, MAG_LNG, 2, 4, 415, 3, 50, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.55, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
      ],
      dogleg: 'right', doglegYards: 225,
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(MAG_LAT, MAG_LNG, 3, 3, 145, 15, 120, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -12 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 2,
    }),
    makeHole(MAG_LAT, MAG_LNG, 4, 5, 535, 1, 180, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.58, sideOffset: -20 },
        { type: 'fairway_bunker', distancePct: 0.4, sideOffset: 24 },
        { type: 'bunker', distancePct: 0.9, sideOffset: 12 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Short of bayou crossing' }],
      dogleg: 'left', doglegYards: 240,
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(MAG_LAT, MAG_LNG, 5, 4, 345, 13, 250, {
      hazards: [
        { type: 'trees', distancePct: 0.5, sideOffset: -28 },
        { type: 'bunker', distancePct: 0.82, sideOffset: 15 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),
    makeHole(MAG_LAT, MAG_LNG, 6, 3, 190, 9, 310, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1, distancePct: 0.5, sideOffset: -22 },
      ],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(MAG_LAT, MAG_LNG, 7, 4, 400, 5, 10, {
      hazards: [
        { type: 'bunker', distancePct: 0.72, sideOffset: 18 },
        { type: 'trees', distancePct: 0.45, sideOffset: -25 },
      ],
      greenSpeed: 9, greenFirmness: 'soft',
    }),
    makeHole(MAG_LAT, MAG_LNG, 8, 5, 515, 11, 70, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.65, sideOffset: 18 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -14 },
      ],
      layups: [{ distanceToGreen: 85, description: 'Safe layup right of pond' }],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 3,
    }),
    makeHole(MAG_LAT, MAG_LNG, 9, 4, 435, 2, 140, {
      hazards: [
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.4, sideOffset: -30 },
        { type: 'bunker', distancePct: 0.85, sideOffset: 16 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(MAG_LAT, MAG_LNG, 10, 4, 390, 8, 200, {
      hazards: [
        { type: 'bunker', distancePct: 0.76, sideOffset: -16 },
        { type: 'trees', distancePct: 0.5, sideOffset: 28 },
      ],
      greenSpeed: 10, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(MAG_LAT, MAG_LNG, 11, 3, 165, 16, 270, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: 12 },
        { type: 'bunker', distancePct: 0.78, sideOffset: -14 },
      ],
      greenSpeed: 9, greenFirmness: 'medium', greenSlope: 2,
    }),
    makeHole(MAG_LAT, MAG_LNG, 12, 5, 550, 6, 330, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.6, sideOffset: -18 },
        { type: 'fairway_bunker', distancePct: 0.42, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.92, sideOffset: 10 },
      ],
      dogleg: 'right', doglegYards: 255,
      layups: [{ distanceToGreen: 105, description: 'Before the water' }],
      greenSpeed: 11, greenFirmness: 'firm', greenSlope: 4,
    }),
    makeHole(MAG_LAT, MAG_LNG, 13, 4, 380, 10, 30, {
      hazards: [
        { type: 'bunker', distancePct: 0.82, sideOffset: -15 },
      ],
      greenSpeed: 10, greenFirmness: 'medium',
    }),
    makeHole(MAG_LAT, MAG_LNG, 14, 4, 425, 4, 100, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.58, sideOffset: 20 },
        { type: 'bunker', distancePct: 0.9, sideOffset: -12 },
      ],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
    makeHole(MAG_LAT, MAG_LNG, 15, 3, 175, 14, 220, {
      hazards: [
        { type: 'bunker', distancePct: 0.8, sideOffset: 14 },
        { type: 'bunker', distancePct: 0.85, sideOffset: -16 },
      ],
      greenSpeed: 9, greenFirmness: 'soft', greenSlope: 3,
    }),
    makeHole(MAG_LAT, MAG_LNG, 16, 4, 355, 12, 290, {
      hazards: [
        { type: 'trees', distancePct: 0.48, sideOffset: -26 },
        { type: 'bunker', distancePct: 0.82, sideOffset: 15 },
      ],
      greenSpeed: 10, greenFirmness: 'medium', greenSlope: 4,
    }),
    makeHole(MAG_LAT, MAG_LNG, 17, 4, 370, 18, 350, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1, distancePct: 0.55, sideOffset: -20 },
        { type: 'bunker', distancePct: 0.88, sideOffset: 14 },
      ],
      greenSpeed: 11, greenFirmness: 'firm',
    }),
    makeHole(MAG_LAT, MAG_LNG, 18, 5, 545, 17, 50, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, distancePct: 0.6, sideOffset: 22 },
        { type: 'bunker', distancePct: 0.88, sideOffset: -14 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1, distancePct: 0.3, sideOffset: -32 },
      ],
      dogleg: 'left', doglegYards: 265,
      layups: [{ distanceToGreen: 100, description: 'Safe side of fairway' }],
      greenSpeed: 12, greenFirmness: 'firm', greenSlope: 5,
    }),
  ],
  slopeRating: 131,
  courseRating: 72.3,
  altitudeEffect: 1.0,
};

export const COURSE_LIBRARY: CourseData[] = [
  SAMPLE_COURSE,
  OCEAN_LINKS,
  MOUNTAIN_RIDGE,
  MAGNOLIA_PINES,
];

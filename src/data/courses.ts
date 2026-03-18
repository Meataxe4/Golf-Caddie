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

function makeHole(
  baseLat: number, baseLng: number,
  num: number, par: number, length: number, hcap: number, direction: number,
  opts: {
    hazards?: Partial<Hazard>[];
    dogleg?: 'left' | 'right';
    doglegYards?: number;
    layups?: Partial<LayupTarget>[];
  } = {},
): HoleLayout {
  const rad = (direction * Math.PI) / 180;
  const teeN = num * 50;
  const teeE = num * 30;
  const tee = coord(baseLat, baseLng, teeN, teeE);
  const pin = coord(baseLat, baseLng, teeN + length * Math.cos(rad), teeE + length * Math.sin(rad));

  const fairwayPoints = [];
  for (let d = 100; d < length; d += 80) {
    fairwayPoints.push(coord(baseLat, baseLng, teeN + d * Math.cos(rad), teeE + d * Math.sin(rad)));
  }

  const hazards: Hazard[] = (opts.hazards ?? []).map((h, i) => ({
    id: `h${num}-${i}`,
    type: h.type ?? 'bunker',
    boundary: [],
    centerPoint: h.centerPoint ?? coord(baseLat, baseLng,
      teeN + (length * 0.7) * Math.cos(rad) + (i % 2 === 0 ? 15 : -15) * Math.sin(rad),
      teeE + (length * 0.7) * Math.sin(rad) + (i % 2 === 0 ? 15 : -15) * Math.cos(rad),
    ),
    penaltyStrokes: h.penaltyStrokes ?? (h.type === 'water' ? 1 : 0),
    recoveryDifficulty: h.recoveryDifficulty ?? 0.5,
  }));

  const greenContour: GreenContour = {
    frontEdge: coord(pin.lat, pin.lng, -12, 0),
    backEdge: coord(pin.lat, pin.lng, 12, 0),
    centerGreen: pin,
    slopeDirection: 180,
    slopeSeverity: 0.3,
    firmness: 'medium',
    speed: 10,
  };

  const layupTargets: LayupTarget[] = (opts.layups ?? []).map(l => ({
    position: l.position ?? coord(baseLat, baseLng,
      teeN + (length - 100) * Math.cos(rad), teeE + (length - 100) * Math.sin(rad)),
    distanceToGreen: l.distanceToGreen ?? 100,
    safetyRating: l.safetyRating ?? 0.8,
    fairwayWidth: l.fairwayWidth ?? 35,
    description: l.description ?? 'Center fairway layup',
  }));

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
    makeHole(OCEAN_LAT, OCEAN_LNG, 1, 4, 410, 5, 10, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 2, 3, 175, 13, 80, { hazards: [{ type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1 }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 3, 5, 540, 1, 45, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'fairway_bunker' }], layups: [{ distanceToGreen: 110, description: 'Short of creek crossing' }], dogleg: 'right', doglegYards: 260 }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 4, 4, 375, 11, 170, { hazards: [{ type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 5, 4, 445, 3, 200, { hazards: [{ type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }, { type: 'bunker' }], dogleg: 'left', doglegYards: 245 }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 6, 3, 210, 15, 290, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 7, 4, 390, 9, 350, { hazards: [{ type: 'fairway_bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 8, 5, 560, 7, 30, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'bunker' }], layups: [{ distanceToGreen: 95, description: 'Left side, short of water' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 9, 4, 425, 2, 120, { hazards: [{ type: 'bunker' }, { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 10, 4, 395, 8, 180, { hazards: [{ type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 11, 3, 160, 18, 270, { hazards: [{ type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 12, 5, 510, 6, 0, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'fairway_bunker' }], dogleg: 'left', doglegYards: 235, layups: [{ distanceToGreen: 100, description: 'Right side of fairway' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 13, 4, 435, 4, 90, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 14, 4, 360, 12, 150, { hazards: [{ type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 15, 3, 190, 16, 250, { hazards: [{ type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1 }, { type: 'bunker' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 16, 5, 530, 10, 310, { hazards: [{ type: 'bunker' }, { type: 'water', penaltyStrokes: 1 }], layups: [{ distanceToGreen: 105, description: 'Short of pond' }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 17, 4, 415, 14, 20, { hazards: [{ type: 'bunker' }, { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }] }),
    makeHole(OCEAN_LAT, OCEAN_LNG, 18, 4, 450, 17, 80, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'bunker' }] }),
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
    makeHole(MTN_LAT, MTN_LNG, 1, 4, 365, 9, 20, { hazards: [{ type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 2, 5, 555, 3, 60, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }], layups: [{ distanceToGreen: 90, description: 'Flat area before ravine' }], dogleg: 'right', doglegYards: 270 }),
    makeHole(MTN_LAT, MTN_LNG, 3, 4, 400, 5, 110, { hazards: [{ type: 'fairway_bunker' }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 4, 3, 185, 11, 200, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 5, 4, 440, 1, 250, { hazards: [{ type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }, { type: 'water', penaltyStrokes: 1 }], dogleg: 'left', doglegYards: 230 }),
    makeHole(MTN_LAT, MTN_LNG, 6, 4, 380, 13, 310, { hazards: [{ type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 7, 3, 155, 17, 0, { hazards: [{ type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 8, 5, 525, 7, 80, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'fairway_bunker' }], layups: [{ distanceToGreen: 100, description: 'Before the stream' }] }),
    makeHole(MTN_LAT, MTN_LNG, 9, 4, 415, 15, 140, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 10, 4, 405, 6, 180, { hazards: [{ type: 'fairway_bunker' }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 11, 5, 570, 2, 230, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }], dogleg: 'right', doglegYards: 280, layups: [{ distanceToGreen: 115, description: 'Wide area before creek' }] }),
    makeHole(MTN_LAT, MTN_LNG, 12, 3, 200, 14, 300, { hazards: [{ type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1 }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 13, 4, 350, 10, 350, { hazards: [{ type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 14, 4, 430, 4, 40, { hazards: [{ type: 'bunker' }, { type: 'water', penaltyStrokes: 1 }] }),
    makeHole(MTN_LAT, MTN_LNG, 15, 5, 545, 8, 100, { hazards: [{ type: 'fairway_bunker' }, { type: 'bunker' }], layups: [{ distanceToGreen: 95, description: 'Center fairway' }] }),
    makeHole(MTN_LAT, MTN_LNG, 16, 3, 170, 16, 220, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 17, 4, 395, 12, 280, { hazards: [{ type: 'bunker' }] }),
    makeHole(MTN_LAT, MTN_LNG, 18, 4, 455, 18, 330, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }] }),
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
    makeHole(MAG_LAT, MAG_LNG, 1, 4, 370, 7, 0, { hazards: [{ type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 2, 4, 415, 3, 50, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }], dogleg: 'right', doglegYards: 225 }),
    makeHole(MAG_LAT, MAG_LNG, 3, 3, 145, 15, 120, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 4, 5, 535, 1, 180, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'fairway_bunker' }, { type: 'bunker' }], layups: [{ distanceToGreen: 100, description: 'Short of bayou crossing' }], dogleg: 'left', doglegYards: 240 }),
    makeHole(MAG_LAT, MAG_LNG, 5, 4, 345, 13, 250, { hazards: [{ type: 'trees' }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 6, 3, 190, 9, 310, { hazards: [{ type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1 }] }),
    makeHole(MAG_LAT, MAG_LNG, 7, 4, 400, 5, 10, { hazards: [{ type: 'bunker' }, { type: 'trees' }] }),
    makeHole(MAG_LAT, MAG_LNG, 8, 5, 515, 11, 70, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }], layups: [{ distanceToGreen: 85, description: 'Safe layup right of pond' }] }),
    makeHole(MAG_LAT, MAG_LNG, 9, 4, 435, 2, 140, { hazards: [{ type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 10, 4, 390, 8, 200, { hazards: [{ type: 'bunker' }, { type: 'trees' }] }),
    makeHole(MAG_LAT, MAG_LNG, 11, 3, 165, 16, 270, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 12, 5, 550, 6, 330, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'fairway_bunker' }, { type: 'bunker' }], dogleg: 'right', doglegYards: 255, layups: [{ distanceToGreen: 105, description: 'Before the water' }] }),
    makeHole(MAG_LAT, MAG_LNG, 13, 4, 380, 10, 30, { hazards: [{ type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 14, 4, 425, 4, 100, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 15, 3, 175, 14, 220, { hazards: [{ type: 'bunker' }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 16, 4, 355, 12, 290, { hazards: [{ type: 'trees' }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 17, 3, 195, 18, 350, { hazards: [{ type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1 }, { type: 'bunker' }] }),
    makeHole(MAG_LAT, MAG_LNG, 18, 5, 545, 17, 50, { hazards: [{ type: 'water', penaltyStrokes: 1 }, { type: 'bunker' }, { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1 }], dogleg: 'left', doglegYards: 265, layups: [{ distanceToGreen: 100, description: 'Safe side of fairway' }] }),
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

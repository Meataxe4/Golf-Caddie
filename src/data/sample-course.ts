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

function makeHole(
  num: number,
  par: number,
  length: number,
  hcap: number,
  direction: number, // degrees from north
  opts: {
    hazards?: Partial<Hazard>[];
    dogleg?: 'left' | 'right';
    doglegYards?: number;
    layups?: Partial<LayupTarget>[];
  } = {},
): HoleLayout {
  const rad = (direction * Math.PI) / 180;
  const teeN = num * 50; // spread holes out
  const teeE = num * 30;

  const tee = coord(BASE_LAT, BASE_LNG, teeN, teeE);
  const pin = coord(BASE_LAT, BASE_LNG,
    teeN + length * Math.cos(rad),
    teeE + length * Math.sin(rad),
  );

  const fairwayPoints = [];
  for (let d = 100; d < length; d += 80) {
    fairwayPoints.push(coord(BASE_LAT, BASE_LNG,
      teeN + d * Math.cos(rad),
      teeE + d * Math.sin(rad),
    ));
  }

  const hazards: Hazard[] = (opts.hazards ?? []).map((h, i) => ({
    id: `h${num}-${i}`,
    type: h.type ?? 'bunker',
    boundary: [],
    centerPoint: h.centerPoint ?? coord(BASE_LAT, BASE_LNG,
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
    position: l.position ?? coord(BASE_LAT, BASE_LNG,
      teeN + (length - 100) * Math.cos(rad),
      teeE + (length - 100) * Math.sin(rad),
    ),
    distanceToGreen: l.distanceToGreen ?? 100,
    safetyRating: l.safetyRating ?? 0.8,
    fairwayWidth: l.fairwayWidth ?? 35,
    description: l.description ?? 'Center fairway layup',
  }));

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
    doglegDirection: opts.dogleg,
    doglegYards: opts.doglegYards,
  };
}

export const SAMPLE_COURSE: CourseData = {
  id: 'pine-valley-muni',
  name: 'Pine Valley Municipal Golf Club',
  location: { lat: BASE_LAT, lng: BASE_LNG },
  holes: [
    // Front 9
    makeHole(1, 4, 385, 7, 0, {
      hazards: [{ type: 'bunker', recoveryDifficulty: 0.4 }],
    }),
    makeHole(2, 5, 520, 11, 45, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', recoveryDifficulty: 0.3 },
      ],
      layups: [{ distanceToGreen: 100, description: 'Short of the pond, 100 yards out' }],
    }),
    makeHole(3, 3, 165, 15, 90, {
      hazards: [
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'bunker', recoveryDifficulty: 0.4 },
      ],
    }),
    makeHole(4, 4, 420, 1, 135, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1.0 },
      ],
      dogleg: 'left',
      doglegYards: 230,
    }),
    makeHole(5, 4, 355, 13, 180, {
      hazards: [{ type: 'bunker', recoveryDifficulty: 0.3 }],
    }),
    makeHole(6, 3, 195, 9, 225, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
      ],
    }),
    makeHole(7, 4, 405, 3, 270, {
      hazards: [
        { type: 'fairway_bunker', recoveryDifficulty: 0.4 },
        { type: 'bunker', recoveryDifficulty: 0.6 },
      ],
      dogleg: 'right',
      doglegYards: 240,
    }),
    makeHole(8, 5, 545, 5, 315, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'bunker', recoveryDifficulty: 0.4 },
      ],
      layups: [{ distanceToGreen: 90, description: 'Left of creek, 90 yards' }],
    }),
    makeHole(9, 4, 440, 2, 0, {
      hazards: [
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1.0 },
      ],
    }),
    // Back 9
    makeHole(10, 4, 370, 10, 45, {
      hazards: [{ type: 'bunker', recoveryDifficulty: 0.3 }],
    }),
    makeHole(11, 3, 150, 16, 90, {
      hazards: [{ type: 'bunker', recoveryDifficulty: 0.4 }],
    }),
    makeHole(12, 5, 530, 8, 135, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'fairway_bunker', recoveryDifficulty: 0.4 },
      ],
      dogleg: 'right',
      doglegYards: 250,
      layups: [{ distanceToGreen: 110, description: 'Right of fairway bunker, 110 out' }],
    }),
    makeHole(13, 4, 395, 6, 180, {
      hazards: [
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'bunker', recoveryDifficulty: 0.5 },
      ],
    }),
    makeHole(14, 4, 430, 4, 225, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', recoveryDifficulty: 0.6 },
      ],
    }),
    makeHole(15, 3, 180, 14, 270, {
      hazards: [
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'bunker', recoveryDifficulty: 0.4 },
      ],
    }),
    makeHole(16, 4, 375, 12, 315, {
      hazards: [{ type: 'fairway_bunker', recoveryDifficulty: 0.3 }],
    }),
    makeHole(17, 4, 380, 17, 0, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', recoveryDifficulty: 0.6 },
      ],
    }),
    makeHole(18, 5, 555, 18, 45, {
      hazards: [
        { type: 'water', penaltyStrokes: 1, recoveryDifficulty: 1.0 },
        { type: 'bunker', recoveryDifficulty: 0.5 },
        { type: 'ob', penaltyStrokes: 2, recoveryDifficulty: 1.0 },
      ],
      dogleg: 'left',
      doglegYards: 260,
      layups: [{ distanceToGreen: 100, description: 'Short of the water, 100 yards' }],
    }),
  ],
  slopeRating: 128,
  courseRating: 72.1,
  altitudeEffect: 1.0,
};

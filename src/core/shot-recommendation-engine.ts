// ============================================================================
// Shot Recommendation Engine — The Brain of the AI Caddie
// ============================================================================
// Evaluates all viable shot options and recommends the highest expected-value
// play based on player ability, conditions, hazards, and risk tolerance.

import type {
  Club, ClubProfile, ShotRecommendation, ExpectedOutcome,
  AlternativeShot, WeatherConditions, LieCondition, Hazard,
  GPSCoordinate, ShotShape, RiskLevel, PressureContext,
} from '../models/types';
import { PlayerModel } from '../models/player-model';
import {
  weatherDistanceMultiplier, windEffect, lieModifiers,
  elevationAdjustedDistance, bearingBetween, distanceYards,
} from '../utils/physics';
import {
  normalProbBetween, expectedValue, type DispersionEllipse,
} from '../utils/statistics';

export interface ShotContext {
  currentPosition: GPSCoordinate;
  targetPosition: GPSCoordinate;
  pinPosition: GPSCoordinate;
  lie: LieCondition;
  weather: WeatherConditions;
  hazards: Hazard[];
  elevationChangeFt: number;
  holeNumber: number;
  par: number;
  strokeNumber: number;
  greenFrontYards?: number;
  greenBackYards?: number;
  greenWidthYards?: number;
  pressure?: PressureContext;
}

interface ScoredOption {
  club: Club;
  profile: ClubProfile;
  adjustedCarry: number;
  adjustedTotal: number;
  dispersion: DispersionEllipse;
  windLateral: number;
  windDistance: number;
  hazardPenalty: number;
  greenHitProb: number;
  hazardAvoidProb: number;
  expectedStrokes: number;
  riskLevel: RiskLevel;
  suggestedShape: ShotShape;
  targetOffset: { yardsRight: number; yardsLong: number };
  reasoning: string[];
}

// PGA Tour average strokes from various distances (used for EV calculations)
const STROKES_FROM_DISTANCE: [number, number][] = [
  [0, 1.0],    // on the green (1 putt average simplified)
  [10, 2.2],   // just off green
  [20, 2.4],
  [50, 2.7],
  [75, 2.8],
  [100, 2.85],
  [125, 2.9],
  [150, 2.95],
  [175, 3.05],
  [200, 3.15],
  [225, 3.3],
  [250, 3.5],
  [300, 3.8],
  [400, 4.1],
  [500, 4.5],
];

/**
 * Interpolate expected strokes remaining from a given distance.
 * Based on PGA Tour averages, adjusted for player handicap.
 */
function strokesFromDistance(yards: number, handicapAdjustment: number): number {
  if (yards <= 0) return 1.0 + handicapAdjustment * 0.02;

  for (let i = 1; i < STROKES_FROM_DISTANCE.length; i++) {
    const [d0, s0] = STROKES_FROM_DISTANCE[i - 1];
    const [d1, s1] = STROKES_FROM_DISTANCE[i];
    if (yards <= d1) {
      const t = (yards - d0) / (d1 - d0);
      return (s0 + t * (s1 - s0)) + handicapAdjustment * 0.03;
    }
  }
  return 4.5 + handicapAdjustment * 0.04;
}

export class ShotRecommendationEngine {
  private playerModel: PlayerModel;

  constructor(playerModel: PlayerModel) {
    this.playerModel = playerModel;
  }

  /**
   * Primary recommendation method.
   * Evaluates all viable clubs and returns the best option with alternatives.
   */
  recommend(context: ShotContext): ShotRecommendation {
    const distToTarget = distanceYards(context.currentPosition, context.targetPosition);
    const distToPin = distanceYards(context.currentPosition, context.pinPosition);
    const shotBearing = bearingBetween(context.currentPosition, context.targetPosition);

    // Get all viable club options
    const allClubs = this.playerModel.getAllClubProfiles();
    const viableClubs = this.filterViableClubs(allClubs, distToPin, context.lie);

    if (viableClubs.length === 0) {
      return this.fallbackRecommendation(context, distToPin);
    }

    // Score each option
    const scored = viableClubs.map(profile =>
      this.scoreClubOption(profile, context, distToTarget, distToPin, shotBearing)
    );

    // Sort by expected strokes (lower is better)
    scored.sort((a, b) => a.expectedStrokes - b.expectedStrokes);

    // Apply pressure adjustments if in competition
    if (context.pressure) {
      this.applyPressureAdjustments(scored, context.pressure);
    }

    const best = scored[0];
    const alternatives = scored.slice(1, 4).map(opt => this.toAlternative(opt, best));

    return {
      club: best.club,
      targetPosition: this.offsetTarget(context.targetPosition, best.targetOffset, shotBearing),
      targetDescription: this.describeTarget(best, context),
      aimOffset: best.targetOffset,
      suggestedShape: best.suggestedShape,
      riskLevel: best.riskLevel,
      expectedOutcome: this.buildExpectedOutcome(best, context),
      reasoning: best.reasoning,
      alternativeShots: alternatives,
      confidenceScore: best.profile.confidenceLevel,
    };
  }

  /**
   * Score a single club option across all decision factors.
   */
  private scoreClubOption(
    profile: ClubProfile,
    context: ShotContext,
    distToTarget: number,
    distToPin: number,
    shotBearing: number,
  ): ScoredOption {
    const reasoning: string[] = [];
    const lieMod = lieModifiers(context.lie);
    const weatherMult = weatherDistanceMultiplier(context.weather);
    const wind = windEffect(shotBearing, context.weather, profile.launchAngleDeg);

    // Adjusted distances
    const adjustedCarry = elevationAdjustedDistance(
      profile.averageCarryYards * lieMod.distanceMultiplier * weatherMult,
      context.elevationChangeFt,
      profile.launchAngleDeg,
    ) + wind.distanceAdjustYards;

    const adjustedTotal = adjustedCarry + (profile.totalDistanceYards - profile.averageCarryYards);

    // Dispersion (worsened by lie)
    const baseDispersion = this.playerModel.getDispersionEllipse(profile.club);
    const dispersion: DispersionEllipse = {
      ...baseDispersion,
      distanceSdYards: baseDispersion.distanceSdYards * lieMod.dispersionMultiplier,
      lateralSdYards: baseDispersion.lateralSdYards * lieMod.dispersionMultiplier,
    };

    // Smart targeting: calculate optimal aim point
    const targetOffset = this.calculateOptimalAimPoint(
      profile, dispersion, context, distToPin, wind.lateralAdjustYards,
    );

    // Green hit probability
    const greenFront = context.greenFrontYards ?? (distToPin - 12);
    const greenBack = context.greenBackYards ?? (distToPin + 12);
    const greenHalfWidth = (context.greenWidthYards ?? 25) / 2;

    const distanceToAimPoint = distToPin + targetOffset.yardsLong;
    const greenHitProb = normalProbBetween(
      adjustedCarry, dispersion.distanceSdYards,
      greenFront - distToPin + distanceToAimPoint,
      greenBack - distToPin + distanceToAimPoint,
    ) * normalProbBetween(
      targetOffset.yardsRight + wind.lateralAdjustYards,
      dispersion.lateralSdYards,
      -greenHalfWidth, greenHalfWidth,
    );

    // Hazard avoidance probability
    let hazardPenalty = 0;
    let hazardAvoidProb = 1;
    for (const hazard of context.hazards) {
      const hazardDist = distanceYards(context.currentPosition, hazard.centerPoint);
      const hazardProb = this.hazardHitProbability(
        adjustedCarry, dispersion, hazardDist, hazard, shotBearing, wind.lateralAdjustYards,
      );
      hazardAvoidProb *= (1 - hazardProb);
      hazardPenalty += hazardProb * hazard.penaltyStrokes * (1 + hazard.recoveryDifficulty);
    }

    // Expected strokes calculation
    const handicap = this.playerModel.getProfile().handicap;
    const handicapAdj = handicap / 18; // per-hole adjustment

    // Weighted outcome scenarios
    const remainingDist = Math.abs(distToPin - adjustedCarry);
    const outcomes = [
      { probability: greenHitProb, value: strokesFromDistance(0, handicapAdj) },
      { probability: (1 - greenHitProb) * hazardAvoidProb, value: strokesFromDistance(remainingDist * 0.4, handicapAdj) },
      { probability: (1 - hazardAvoidProb), value: strokesFromDistance(remainingDist, handicapAdj) + hazardPenalty },
    ];
    const expectedStrokes = expectedValue(outcomes) + 1; // +1 for this shot

    // Risk classification
    const riskLevel = this.classifyRisk(greenHitProb, hazardAvoidProb, context);

    // Shot shape suggestion
    const suggestedShape = this.suggestShotShape(profile, context, wind, lieMod.canShape);

    // Build reasoning
    const distDelta = Math.round(adjustedCarry - distToPin);
    if (Math.abs(distDelta) <= 3) {
      reasoning.push(`Your ${this.clubName(profile.club)} carries ${Math.round(adjustedCarry)} yards — ideal for the ${Math.round(distToPin)} yard shot.`);
    } else if (distDelta > 0) {
      reasoning.push(`Your ${this.clubName(profile.club)} carries ${Math.round(adjustedCarry)} yards, ${distDelta} more than needed — gives margin past front hazards.`);
    } else {
      reasoning.push(`Your ${this.clubName(profile.club)} carries ${Math.round(adjustedCarry)} yards, ${Math.abs(distDelta)} short of the pin — accounts for rollout.`);
    }

    if (Math.abs(wind.distanceAdjustYards) > 2) {
      const windDir = wind.distanceAdjustYards > 0 ? 'helping' : 'hurting';
      reasoning.push(`Wind ${windDir} by ~${Math.abs(Math.round(wind.distanceAdjustYards))} yards.`);
    }

    if (wind.lateralAdjustYards > 2) {
      reasoning.push(`Crosswind pushing ball ~${Math.round(wind.lateralAdjustYards)} yards right — aiming left to compensate.`);
    } else if (wind.lateralAdjustYards < -2) {
      reasoning.push(`Crosswind pushing ball ~${Math.abs(Math.round(wind.lateralAdjustYards))} yards left — aiming right to compensate.`);
    }

    if (context.lie !== 'tee' && context.lie !== 'fairway') {
      reasoning.push(`From ${context.lie.replace(/_/g, ' ')}: expect ${Math.round((1 - lieMod.distanceMultiplier) * 100)}% distance loss and wider dispersion.`);
    }

    if (hazardPenalty > 0.3) {
      const hazardNames = context.hazards
        .filter(h => this.hazardHitProbability(adjustedCarry, dispersion, distanceYards(context.currentPosition, h.centerPoint), h, shotBearing, wind.lateralAdjustYards) > 0.05)
        .map(h => h.type.replace(/_/g, ' '));
      reasoning.push(`Hazard risk: ${hazardNames.join(', ')} in play — ${Math.round(hazardAvoidProb * 100)}% chance of avoiding.`);
    }

    if (profile.primaryMiss === 'left' || profile.primaryMiss === 'right') {
      reasoning.push(`Your typical ${profile.primaryMiss} miss is accounted for in the aim point.`);
    }

    return {
      club: profile.club,
      profile,
      adjustedCarry,
      adjustedTotal,
      dispersion,
      windLateral: wind.lateralAdjustYards,
      windDistance: wind.distanceAdjustYards,
      hazardPenalty,
      greenHitProb,
      hazardAvoidProb,
      expectedStrokes,
      riskLevel,
      suggestedShape,
      targetOffset,
      reasoning,
    };
  }

  /**
   * Calculate the optimal aim point factoring in miss tendencies and hazards.
   * This is "play for the miss, not perfection."
   */
  private calculateOptimalAimPoint(
    profile: ClubProfile,
    dispersion: DispersionEllipse,
    context: ShotContext,
    distToPin: number,
    windLateral: number,
  ): { yardsRight: number; yardsLong: number } {
    let lateralOffset = 0;
    let distanceOffset = 0;

    // Compensate for systematic bias in the player's game
    lateralOffset -= dispersion.centerLateralYards;

    // Compensate for wind
    lateralOffset -= windLateral * 0.5; // don't fully compensate — leave buffer

    // Avoid hazards: shift away from hazards on the miss side
    for (const hazard of context.hazards) {
      const hazardBearing = bearingBetween(context.currentPosition, hazard.centerPoint);
      const targetBearing = bearingBetween(context.currentPosition, context.targetPosition);
      const relAngle = hazardBearing - targetBearing;

      const hazardDist = distanceYards(context.currentPosition, hazard.centerPoint);
      const isInRange = Math.abs(hazardDist - distToPin) < 30;

      if (isInRange) {
        const hazardIsRight = relAngle > 0 && relAngle < 90;
        const hazardIsLeft = relAngle < 0 && relAngle > -90;

        // If hazard is on our miss side, shift away more aggressively
        if (hazardIsRight && profile.primaryMiss === 'right') {
          lateralOffset -= (5 + hazard.penaltyStrokes * 2);
        } else if (hazardIsLeft && profile.primaryMiss === 'left') {
          lateralOffset += (5 + hazard.penaltyStrokes * 2);
        } else if (hazardIsRight) {
          lateralOffset -= 2;
        } else if (hazardIsLeft) {
          lateralOffset += 2;
        }

        // Avoid front/back hazards
        if (hazardDist < distToPin - 5 && profile.primaryMiss === 'short') {
          distanceOffset += 5;
        } else if (hazardDist > distToPin + 5 && profile.primaryMiss === 'long') {
          distanceOffset -= 5;
        }
      }
    }

    // Apply player's aggression preference
    const aggressionScale = this.playerModel.getProfile().aggressionPreference;
    lateralOffset *= (1.5 - aggressionScale); // conservative players get more offset
    distanceOffset *= (1.5 - aggressionScale);

    return {
      yardsRight: Math.round(lateralOffset * 10) / 10,
      yardsLong: Math.round(distanceOffset * 10) / 10,
    };
  }

  private hazardHitProbability(
    adjustedCarry: number,
    dispersion: DispersionEllipse,
    hazardDist: number,
    hazard: Hazard,
    shotBearing: number,
    windLateral: number,
  ): number {
    // Simplified: check if landing zone overlaps with hazard area
    const distDelta = hazardDist - adjustedCarry;
    const distProb = normalProbBetween(
      0, dispersion.distanceSdYards,
      distDelta - 10, distDelta + 10,
    );

    // Lateral check
    const hazardBearing = bearingBetween(
      { lat: 0, lng: 0 }, // simplified
      hazard.centerPoint,
    );
    const lateralDist = Math.sin((hazardBearing - shotBearing) * Math.PI / 180) * hazardDist;
    const latProb = normalProbBetween(
      windLateral, dispersion.lateralSdYards,
      lateralDist - 8, lateralDist + 8,
    );

    return Math.min(distProb * latProb * 2, 0.5); // cap at 50%
  }

  private classifyRisk(greenHitProb: number, hazardAvoidProb: number, context: ShotContext): RiskLevel {
    if (greenHitProb > 0.6 && hazardAvoidProb > 0.9) return 'safe';
    if (greenHitProb < 0.3 || hazardAvoidProb < 0.75) return 'aggressive';
    return 'moderate';
  }

  private suggestShotShape(
    profile: ClubProfile,
    context: ShotContext,
    wind: { lateralAdjustYards: number },
    canShape: boolean,
  ): ShotShape {
    if (!canShape) return 'straight';

    const player = this.playerModel.getProfile();

    // In heavy wind, play a knockdown
    if (context.weather.windSpeedMph > 20) return 'low';

    // If player has a preferred shape and conditions suit it, use it
    if (player.preferredShotShape !== 'straight') {
      // If wind is against the shape, might be better to go straight
      if (player.preferredShotShape === 'fade' && wind.lateralAdjustYards > 5) return 'straight';
      if (player.preferredShotShape === 'draw' && wind.lateralAdjustYards < -5) return 'straight';
      return player.preferredShotShape;
    }

    return 'straight';
  }

  private filterViableClubs(clubs: ClubProfile[], distance: number, lie: LieCondition): ClubProfile[] {
    const lieMod = lieModifiers(lie);

    return clubs.filter(c => {
      // Can't use certain clubs from heavy rough/bunkers
      if (lieMod.maxClubRestriction) {
        const clubLoftOrder = this.clubLoftOrder(c.club);
        if (clubLoftOrder < lieMod.maxClubRestriction) return false;
      }

      // Filter by reasonable distance range
      const adjusted = c.averageCarryYards * lieMod.distanceMultiplier;
      return adjusted > distance * 0.5 && adjusted < distance * 1.3;
    });
  }

  private clubLoftOrder(club: Club): number {
    const order: Record<string, number> = {
      driver: 1, '3_wood': 2, '5_wood': 3, '7_wood': 4,
      '2_hybrid': 3, '3_hybrid': 4, '4_hybrid': 5, '5_hybrid': 6,
      '3_iron': 4, '4_iron': 5, '5_iron': 6, '6_iron': 7,
      '7_iron': 8, '8_iron': 9, '9_iron': 10,
      pw: 11, gw: 12, sw: 13, lw: 14,
      putter: 15,
    };
    return order[club] ?? 10;
  }

  private clubName(club: Club): string {
    const names: Record<string, string> = {
      driver: 'Driver', '3_wood': '3 Wood', '5_wood': '5 Wood', '7_wood': '7 Wood',
      '2_hybrid': '2 Hybrid', '3_hybrid': '3 Hybrid', '4_hybrid': '4 Hybrid', '5_hybrid': '5 Hybrid',
      '3_iron': '3 Iron', '4_iron': '4 Iron', '5_iron': '5 Iron', '6_iron': '6 Iron',
      '7_iron': '7 Iron', '8_iron': '8 Iron', '9_iron': '9 Iron',
      pw: 'Pitching Wedge', gw: 'Gap Wedge', sw: 'Sand Wedge', lw: 'Lob Wedge',
      putter: 'Putter',
    };
    return names[club] ?? club;
  }

  private toAlternative(opt: ScoredOption, best: ScoredOption): AlternativeShot {
    const sgDiff = best.expectedStrokes - opt.expectedStrokes;
    let strategy: string;

    if (opt.riskLevel === 'aggressive') {
      strategy = `Aggressive: go for the pin with ${this.clubName(opt.club)}`;
    } else if (opt.riskLevel === 'safe') {
      strategy = `Safe play: ${this.clubName(opt.club)} to avoid trouble`;
    } else {
      strategy = `${this.clubName(opt.club)} — middle ground option`;
    }

    return {
      club: opt.club,
      strategy,
      riskLevel: opt.riskLevel,
      expectedStrokesGained: Math.round(sgDiff * 100) / 100,
      reasoning: opt.reasoning[0] ?? '',
    };
  }

  private buildExpectedOutcome(opt: ScoredOption, context: ShotContext): ExpectedOutcome {
    return {
      expectedCarryYards: Math.round(opt.adjustedCarry),
      expectedTotalYards: Math.round(opt.adjustedTotal),
      landingZone: {
        center: context.targetPosition,
        radiusYards: Math.round(opt.dispersion.distanceSdYards),
      },
      hitGreenProbability: Math.round(opt.greenHitProb * 100) / 100,
      avoidHazardProbability: Math.round(opt.hazardAvoidProb * 100) / 100,
      expectedStrokesFromResult: Math.round(opt.expectedStrokes * 100) / 100,
      bestCasePct: Math.round(opt.greenHitProb * opt.hazardAvoidProb * 100),
      worstCasePct: Math.round((1 - opt.hazardAvoidProb) * 100),
    };
  }

  private offsetTarget(
    target: GPSCoordinate,
    offset: { yardsRight: number; yardsLong: number },
    bearing: number,
  ): GPSCoordinate {
    // Convert yard offsets to GPS coordinate adjustments
    const metersPerYard = 0.9144;
    const metersPerDegLat = 111320;
    const metersPerDegLng = metersPerDegLat * Math.cos((target.lat * Math.PI) / 180);

    const bearingRad = (bearing * Math.PI) / 180;

    const dNorth = offset.yardsLong * Math.cos(bearingRad) - offset.yardsRight * Math.sin(bearingRad);
    const dEast = offset.yardsLong * Math.sin(bearingRad) + offset.yardsRight * Math.cos(bearingRad);

    return {
      lat: target.lat + (dNorth * metersPerYard) / metersPerDegLat,
      lng: target.lng + (dEast * metersPerYard) / metersPerDegLng,
      elevationMeters: target.elevationMeters,
    };
  }

  private describeTarget(opt: ScoredOption, context: ShotContext): string {
    const parts: string[] = [];
    const { yardsRight, yardsLong } = opt.targetOffset;

    if (Math.abs(yardsRight) > 2 || Math.abs(yardsLong) > 2) {
      if (yardsRight > 2) parts.push(`${Math.round(yardsRight)} yards right of pin`);
      else if (yardsRight < -2) parts.push(`${Math.abs(Math.round(yardsRight))} yards left of pin`);

      if (yardsLong > 2) parts.push(`${Math.round(yardsLong)} yards past`);
      else if (yardsLong < -2) parts.push(`${Math.abs(Math.round(yardsLong))} yards short`);
    } else {
      parts.push('at the pin');
    }

    return `Aim ${parts.join(', ')}`;
  }

  /**
   * Apply pressure-based adjustments to recommendations.
   * Under pressure: favor safer plays, add distance for "protect" scenarios.
   */
  private applyPressureAdjustments(options: ScoredOption[], pressure: PressureContext): void {
    const stressFactor = pressure.stressLevel;
    const playerPressureResponse = this.playerModel.getProfile().pressureAdjustment;
    const combinedPressure = stressFactor * playerPressureResponse;

    for (const opt of options) {
      // Under pressure, dispersion typically increases 10-20%
      const dispersionPenalty = 1 + combinedPressure * 0.2;
      opt.dispersion = {
        ...opt.dispersion,
        distanceSdYards: opt.dispersion.distanceSdYards * dispersionPenalty,
        lateralSdYards: opt.dispersion.lateralSdYards * dispersionPenalty,
      };

      // Boost safe options, penalize aggressive ones under pressure
      if (pressure.competitionLevel === 'tournament' || pressure.competitionLevel === 'match_play') {
        if (opt.riskLevel === 'aggressive') {
          opt.expectedStrokes += combinedPressure * 0.3;
          opt.reasoning.push('⚠️ Aggressive play under pressure — increased miss probability factored in.');
        } else if (opt.riskLevel === 'safe') {
          opt.expectedStrokes -= combinedPressure * 0.1;
          opt.reasoning.push('Safe play recommended given competitive pressure.');
        }
      }

      // Match play: if down, may need to be more aggressive
      if (pressure.matchPlayStatus === 'down' && pressure.holesRemaining <= 3) {
        if (opt.riskLevel === 'aggressive') {
          opt.expectedStrokes -= 0.2;
          opt.reasoning.push('Match play: need to press — aggressive play justified.');
        }
      }
    }

    // Re-sort after adjustments
    options.sort((a, b) => a.expectedStrokes - b.expectedStrokes);
  }

  private fallbackRecommendation(context: ShotContext, distance: number): ShotRecommendation {
    const clubs = this.playerModel.getAllClubProfiles();
    const closest = clubs.reduce((best, c) =>
      Math.abs(c.averageCarryYards - distance) < Math.abs(best.averageCarryYards - distance) ? c : best
    );

    return {
      club: closest.club,
      targetPosition: context.targetPosition,
      targetDescription: 'Aim at the target',
      aimOffset: { yardsRight: 0, yardsLong: 0 },
      suggestedShape: 'straight',
      riskLevel: 'moderate',
      expectedOutcome: {
        expectedCarryYards: closest.averageCarryYards,
        expectedTotalYards: closest.totalDistanceYards,
        landingZone: { center: context.targetPosition, radiusYards: 15 },
        hitGreenProbability: 0.3,
        avoidHazardProbability: 0.8,
        expectedStrokesFromResult: 3.5,
        bestCasePct: 25,
        worstCasePct: 15,
      },
      reasoning: [`${this.clubName(closest.club)} is the closest match for ${Math.round(distance)} yards.`],
      alternativeShots: [],
      confidenceScore: 0.3,
    };
  }
}

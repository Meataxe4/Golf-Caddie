// ============================================================================
// Risk Heatmap Engine — Visual Shot Strategy Overlay
// ============================================================================
// Generates a spatial risk heatmap showing expected strokes from every
// position around a hole. Highlights danger zones, optimal landing areas,
// and the ideal shot path — a feature beyond any current consumer golf app.

import type {
  HoleLayout, WeatherConditions, GPSCoordinate,
  RiskHeatmap, RiskHeatmapCell,
} from '../models/types';
import { PlayerModel } from '../models/player-model';
import { distanceYards, bearingBetween } from '../utils/physics';

// Strokes gained baseline lookup for heatmap coloring
function expectedStrokesFrom(
  distToPin: number,
  onGreen: boolean,
  inHazard: boolean,
  handicap: number,
): number {
  const handicapMult = 1 + handicap * 0.012;

  if (inHazard) return (2.5 + distToPin * 0.005) * handicapMult;
  if (onGreen) return (1.0 + distToPin * 0.02) * handicapMult;
  if (distToPin < 20) return 2.3 * handicapMult;
  if (distToPin < 50) return 2.6 * handicapMult;
  if (distToPin < 100) return 2.8 * handicapMult;
  if (distToPin < 150) return 2.95 * handicapMult;
  if (distToPin < 200) return 3.1 * handicapMult;
  return (3.2 + (distToPin - 200) * 0.004) * handicapMult;
}

/**
 * Maps expected strokes to a color (green=good, red=bad).
 */
function strokesColor(strokes: number, baseline: number): string {
  const delta = strokes - baseline;
  if (delta < -0.3) return '#22c55e'; // bright green — great position
  if (delta < -0.1) return '#86efac'; // light green
  if (delta < 0.1) return '#fbbf24';  // yellow — neutral
  if (delta < 0.3) return '#f97316';  // orange — trouble
  if (delta < 0.6) return '#ef4444';  // red — danger
  return '#991b1b';                     // dark red — severe penalty
}

export class RiskHeatmapEngine {
  private playerModel: PlayerModel;

  constructor(playerModel: PlayerModel) {
    this.playerModel = playerModel;
  }

  /**
   * Generate a risk heatmap for a given hole.
   * Creates a grid of positions around the hole and calculates
   * expected strokes from each position.
   */
  generateHeatmap(
    hole: HoleLayout,
    weather: WeatherConditions,
    gridResolutionYards: number = 10,
  ): RiskHeatmap {
    const handicap = this.playerModel.getProfile().handicap;
    const cells: RiskHeatmapCell[] = [];

    // Determine bounding box around the hole
    const allPoints = [
      hole.teePosition,
      hole.pinPosition,
      ...hole.fairwayCenter,
      ...hole.hazards.map(h => h.centerPoint),
    ];

    const lats = allPoints.map(p => p.lat);
    const lngs = allPoints.map(p => p.lng);
    const minLat = Math.min(...lats) - 0.001;
    const maxLat = Math.max(...lats) + 0.001;
    const minLng = Math.min(...lngs) - 0.001;
    const maxLng = Math.max(...lngs) + 0.001;

    // Convert grid resolution to approximate lat/lng steps
    const latStep = (gridResolutionYards * 0.9144) / 111320;
    const lngStep = (gridResolutionYards * 0.9144) / (111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180));

    const baselineStrokes = expectedStrokesFrom(
      hole.lengthYards, false, false, handicap,
    );

    for (let lat = minLat; lat <= maxLat; lat += latStep) {
      for (let lng = minLng; lng <= maxLng; lng += lngStep) {
        const pos: GPSCoordinate = { lat, lng };
        const distToPin = distanceYards(pos, hole.pinPosition);

        // Check if position is in a hazard
        const inHazard = this.isInHazard(pos, hole);

        // Check if position is on the green (simplified)
        const onGreen = distToPin < 15;

        // Calculate expected strokes from this position
        const strokes = expectedStrokesFrom(distToPin, onGreen, inHazard, handicap);

        // Hazard proximity penalty
        const hazardProximity = this.nearestHazardDistance(pos, hole);
        const proximityPenalty = hazardProximity < 10
          ? (10 - hazardProximity) * 0.05
          : 0;

        const totalStrokes = strokes + proximityPenalty;

        // Risk score: 0 = safest, 1 = most dangerous
        const riskScore = Math.min(1, Math.max(0,
          (totalStrokes - 1.5) / 3.5, // normalize to 0-1 range
        ));

        cells.push({
          position: pos,
          expectedStrokes: Math.round(totalStrokes * 100) / 100,
          hazardProximity,
          riskScore: Math.round(riskScore * 100) / 100,
          color: strokesColor(totalStrokes, baselineStrokes / 2),
        });
      }
    }

    // Calculate optimal path (waypoints of lowest risk from tee to pin)
    const optimalPath = this.calculateOptimalPath(hole, cells, gridResolutionYards);

    // Identify danger zones
    const dangerZones = this.identifyDangerZones(hole, cells);

    return {
      holeNumber: hole.holeNumber,
      cells,
      optimalPath,
      dangerZones,
    };
  }

  private isInHazard(pos: GPSCoordinate, hole: HoleLayout): boolean {
    for (const hazard of hole.hazards) {
      const dist = distanceYards(pos, hazard.centerPoint);
      // Simplified: treat hazards as circles
      if (dist < 15) return true;
    }
    return false;
  }

  private nearestHazardDistance(pos: GPSCoordinate, hole: HoleLayout): number {
    if (hole.hazards.length === 0) return 999;
    return Math.min(
      ...hole.hazards.map(h => distanceYards(pos, h.centerPoint)),
    );
  }

  /**
   * Calculate the optimal path from tee to pin using a greedy
   * lowest-risk waypoint approach.
   */
  private calculateOptimalPath(
    hole: HoleLayout,
    cells: RiskHeatmapCell[],
    resolution: number,
  ): GPSCoordinate[] {
    const path: GPSCoordinate[] = [hole.teePosition];
    const totalDist = distanceYards(hole.teePosition, hole.pinPosition);
    const driver = this.playerModel.getClubProfile('driver');
    const driverDist = driver?.averageCarryYards ?? 220;

    // Create waypoints at each shot distance interval
    const numWaypoints = Math.ceil(totalDist / driverDist);
    const bearing = bearingBetween(hole.teePosition, hole.pinPosition);

    for (let i = 1; i <= numWaypoints; i++) {
      const fraction = Math.min(i / numWaypoints, 1);
      const targetLat = hole.teePosition.lat + (hole.pinPosition.lat - hole.teePosition.lat) * fraction;
      const targetLng = hole.teePosition.lng + (hole.pinPosition.lng - hole.teePosition.lng) * fraction;

      // Find the lowest-risk cell near this target point
      const searchRadius = resolution * 3;
      const nearbyCells = cells.filter(c =>
        distanceYards(c.position, { lat: targetLat, lng: targetLng }) < searchRadius
      );

      if (nearbyCells.length > 0) {
        const best = nearbyCells.reduce((a, b) =>
          a.expectedStrokes < b.expectedStrokes ? a : b
        );
        path.push(best.position);
      } else {
        path.push({ lat: targetLat, lng: targetLng });
      }
    }

    path.push(hole.pinPosition);
    return path;
  }

  private identifyDangerZones(
    hole: HoleLayout,
    cells: RiskHeatmapCell[],
  ): { center: GPSCoordinate; radiusYards: number; description: string }[] {
    const zones: { center: GPSCoordinate; radiusYards: number; description: string }[] = [];

    for (const hazard of hole.hazards) {
      const highRiskCells = cells.filter(c =>
        c.riskScore > 0.6 &&
        distanceYards(c.position, hazard.centerPoint) < 25
      );

      if (highRiskCells.length > 0) {
        const maxDist = Math.max(
          ...highRiskCells.map(c => distanceYards(c.position, hazard.centerPoint))
        );

        zones.push({
          center: hazard.centerPoint,
          radiusYards: Math.round(maxDist),
          description: `${hazard.type.replace(/_/g, ' ')} — ${Math.round(hazard.recoveryDifficulty * 100)}% recovery difficulty`,
        });
      }
    }

    return zones;
  }
}

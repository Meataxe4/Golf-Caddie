// ============================================================================
// Player Model — Adaptive Learning System
// ============================================================================
// Tracks and models a player's performance, learning true distances,
// dispersion patterns, and miss tendencies from shot history.

import type {
  Club, ClubProfile, PlayerProfile, ShotRecord,
  LieCondition, MissTendency,
} from './types';
import { RunningStats, type DispersionEllipse } from '../utils/statistics';

interface ClubStats {
  carry: RunningStats;
  total: RunningStats;
  lateral: RunningStats;
  missLeft: number;
  missRight: number;
  missShort: number;
  missLong: number;
}

/**
 * Adaptive player model that continuously learns from shot data.
 * Uses Welford's algorithm for online mean/variance updates.
 */
export class PlayerModel {
  private clubStats: Map<Club, ClubStats> = new Map();
  private shotHistory: ShotRecord[] = [];
  private profile: PlayerProfile;

  constructor(profile: PlayerProfile) {
    this.profile = profile;
    this.initializeFromProfile();
  }

  /**
   * Seed the model with the player's declared club distances.
   * These serve as priors until enough real data is collected.
   */
  private initializeFromProfile(): void {
    for (const clubProfile of this.profile.clubs) {
      const stats = this.getOrCreateStats(clubProfile.club);
      // Add synthetic data points based on profile to seed the model
      const syntheticCount = Math.max(3, Math.round(clubProfile.confidenceLevel * 10));
      for (let i = 0; i < syntheticCount; i++) {
        stats.carry.add(clubProfile.averageCarryYards +
          (Math.random() - 0.5) * clubProfile.standardDeviationYards * 2);
        stats.total.add(clubProfile.totalDistanceYards +
          (Math.random() - 0.5) * clubProfile.standardDeviationYards * 2);
        stats.lateral.add((Math.random() - 0.5) * clubProfile.lateralDispersionYards * 2);
      }
      stats.missLeft = clubProfile.missLeftPct;
      stats.missRight = clubProfile.missRightPct;
      stats.missShort = clubProfile.missShortPct;
      stats.missLong = clubProfile.missLongPct;
    }
  }

  private getOrCreateStats(club: Club): ClubStats {
    if (!this.clubStats.has(club)) {
      this.clubStats.set(club, {
        carry: new RunningStats(),
        total: new RunningStats(),
        lateral: new RunningStats(),
        missLeft: 25,
        missRight: 25,
        missShort: 25,
        missLong: 25,
      });
    }
    return this.clubStats.get(club)!;
  }

  /**
   * Record a new shot and update the model.
   * This is the core learning loop.
   */
  recordShot(shot: ShotRecord): void {
    this.shotHistory.push(shot);
    const stats = this.getOrCreateStats(shot.club);

    stats.carry.add(shot.carryYards);
    stats.total.add(shot.totalYards);
    stats.lateral.add(shot.lateralMissYards);

    // Update miss tendencies with exponential decay (recent shots matter more)
    const alpha = 0.1; // learning rate
    const isLeft = shot.lateralMissYards < -3;
    const isRight = shot.lateralMissYards > 3;
    const isShort = shot.carryYards < stats.carry.mean - stats.carry.standardDeviation * 0.5;
    const isLong = shot.totalYards > stats.total.mean + stats.total.standardDeviation * 0.5;

    stats.missLeft = stats.missLeft * (1 - alpha) + (isLeft ? 100 : 0) * alpha;
    stats.missRight = stats.missRight * (1 - alpha) + (isRight ? 100 : 0) * alpha;
    stats.missShort = stats.missShort * (1 - alpha) + (isShort ? 100 : 0) * alpha;
    stats.missLong = stats.missLong * (1 - alpha) + (isLong ? 100 : 0) * alpha;
  }

  /**
   * Get the current club profile with learned data.
   */
  getClubProfile(club: Club): ClubProfile | null {
    const stats = this.clubStats.get(club);
    if (!stats || stats.carry.count === 0) return null;

    const primaryMiss = this.getPrimaryMiss(stats);
    const secondaryMiss = this.getSecondaryMiss(stats, primaryMiss);

    return {
      club,
      averageCarryYards: Math.round(stats.carry.mean),
      totalDistanceYards: Math.round(stats.total.mean),
      standardDeviationYards: Math.round(stats.carry.standardDeviation * 10) / 10,
      lateralDispersionYards: Math.round(stats.lateral.standardDeviation * 10) / 10,
      launchAngleDeg: this.estimateLaunchAngle(club),
      primaryMiss,
      secondaryMiss,
      missLeftPct: Math.round(stats.missLeft),
      missRightPct: Math.round(stats.missRight),
      missShortPct: Math.round(stats.missShort),
      missLongPct: Math.round(stats.missLong),
      confidenceLevel: stats.carry.confidence,
      shotCount: stats.carry.count,
    };
  }

  /**
   * Get the 2D dispersion ellipse for a club.
   * This is the key input for smart targeting.
   */
  getDispersionEllipse(club: Club): DispersionEllipse {
    const stats = this.clubStats.get(club);
    if (!stats || stats.carry.count < 3) {
      // Return generous defaults for unknown clubs
      return {
        centerOffsetYards: 0,
        centerLateralYards: 0,
        distanceSdYards: 12,
        lateralSdYards: 15,
        correlation: 0,
      };
    }

    // Calculate systematic bias
    const declaredProfile = this.profile.clubs.find(c => c.club === club);
    const expectedCarry = declaredProfile?.averageCarryYards ?? stats.carry.mean;

    return {
      centerOffsetYards: stats.carry.mean - expectedCarry,
      centerLateralYards: stats.lateral.mean,
      distanceSdYards: stats.carry.standardDeviation,
      lateralSdYards: stats.lateral.standardDeviation,
      correlation: this.calculateCorrelation(club),
    };
  }

  /**
   * Get the best club for a given target distance.
   * Returns clubs sorted by suitability.
   */
  getClubsForDistance(targetYards: number, lie: LieCondition = 'fairway'): ClubProfile[] {
    const candidates: (ClubProfile & { suitability: number })[] = [];

    for (const [club] of this.clubStats) {
      const profile = this.getClubProfile(club);
      if (!profile) continue;

      // How close is this club's average to the target?
      const distanceDelta = Math.abs(profile.averageCarryYards - targetYards);
      const withinRange = distanceDelta < profile.standardDeviationYards * 2.5;

      if (withinRange) {
        // Suitability: prefer clubs where target is slightly less than average
        // (most golfers miss short, so "enough club" is better)
        const shortBias = profile.averageCarryYards >= targetYards ? 5 : 0;
        const suitability = 100 - distanceDelta * 2 + shortBias -
          profile.standardDeviationYards; // prefer consistent clubs

        candidates.push({ ...profile, suitability });
      }
    }

    return candidates
      .sort((a, b) => b.suitability - a.suitability)
      .map(({ suitability: _, ...profile }) => profile);
  }

  /**
   * Get all available club profiles.
   */
  getAllClubProfiles(): ClubProfile[] {
    const profiles: ClubProfile[] = [];
    for (const [club] of this.clubStats) {
      const profile = this.getClubProfile(club);
      if (profile) profiles.push(profile);
    }
    return profiles.sort((a, b) => b.averageCarryYards - a.averageCarryYards);
  }

  getProfile(): PlayerProfile {
    return this.profile;
  }

  getShotHistory(): ShotRecord[] {
    return [...this.shotHistory];
  }

  getRecentShots(count: number): ShotRecord[] {
    return this.shotHistory.slice(-count);
  }

  private getPrimaryMiss(stats: ClubStats): MissTendency {
    const misses = [
      { type: 'left' as const, pct: stats.missLeft },
      { type: 'right' as const, pct: stats.missRight },
      { type: 'short' as const, pct: stats.missShort },
      { type: 'long' as const, pct: stats.missLong },
    ];
    return misses.sort((a, b) => b.pct - a.pct)[0].type;
  }

  private getSecondaryMiss(stats: ClubStats, primary: MissTendency): MissTendency {
    const misses = [
      { type: 'left' as const, pct: stats.missLeft },
      { type: 'right' as const, pct: stats.missRight },
      { type: 'short' as const, pct: stats.missShort },
      { type: 'long' as const, pct: stats.missLong },
    ];
    return misses
      .filter(m => m.type !== primary)
      .sort((a, b) => b.pct - a.pct)[0].type;
  }

  private calculateCorrelation(club: Club): number {
    const shots = this.shotHistory.filter(s => s.club === club);
    if (shots.length < 5) return 0;

    const carries = shots.map(s => s.carryYards);
    const laterals = shots.map(s => s.lateralMissYards);
    const n = carries.length;

    const meanC = carries.reduce((a, b) => a + b) / n;
    const meanL = laterals.reduce((a, b) => a + b) / n;

    let cov = 0, varC = 0, varL = 0;
    for (let i = 0; i < n; i++) {
      const dc = carries[i] - meanC;
      const dl = laterals[i] - meanL;
      cov += dc * dl;
      varC += dc * dc;
      varL += dl * dl;
    }

    const denom = Math.sqrt(varC * varL);
    return denom > 0 ? cov / denom : 0;
  }

  private estimateLaunchAngle(club: Club): number {
    const angles: Record<string, number> = {
      driver: 12, '3_wood': 14, '5_wood': 16, '7_wood': 18,
      '2_hybrid': 17, '3_hybrid': 19, '4_hybrid': 21, '5_hybrid': 23,
      '3_iron': 20, '4_iron': 23, '5_iron': 25, '6_iron': 28,
      '7_iron': 31, '8_iron': 34, '9_iron': 37,
      pw: 40, gw: 43, sw: 48, lw: 52,
      putter: 3,
    };
    return angles[club] ?? 30;
  }
}

// ============================================================================
// Post-Round Analysis — Strokes Gained & Performance Insights
// ============================================================================
// Analyzes round data to provide strokes-gained breakdowns and actionable
// insights for improvement. Modeled after Mark Broadie's methodology.

import type {
  RoundSummary, ShotRecord, StrokesGainedBreakdown,
  PerformanceInsight, PlayerProfile,
} from '../models/types';

// Baseline expected strokes from various positions (PGA Tour benchmarks)
// Adjusted for amateur play via handicap scaling
const BASELINE_STROKES: Record<string, (dist: number) => number> = {
  tee: (d) => 0.0045 * d + 1.3,         // from tee, by remaining distance
  fairway: (d) => 0.0042 * d + 1.15,     // approach from fairway
  rough: (d) => 0.0046 * d + 1.35,       // approach from rough
  bunker: (d) => d > 40 ? 0.005 * d + 1.5 : 2.4,
  green: (d) => d <= 0 ? 1.0 : 1.0 + 0.02 * d + 0.00015 * d * d, // putting by feet
  recovery: (d) => 0.005 * d + 2.0,
};

function baselineStrokes(category: string, distYards: number, handicap: number): number {
  const baseFn = BASELINE_STROKES[category] ?? BASELINE_STROKES.fairway;
  const tourBaseline = baseFn(distYards);
  // Handicap adjustment: amateurs take more strokes proportionally
  const handicapMult = 1 + handicap * 0.012;
  return tourBaseline * handicapMult;
}

export class PostRoundAnalyzer {
  /**
   * Calculate strokes gained breakdown for a full round.
   */
  calculateStrokesGained(
    round: RoundSummary,
    handicap: number,
  ): StrokesGainedBreakdown {
    const shots = round.shots;
    let sgOffTee = 0;
    let sgApproach = 0;
    let sgAroundGreen = 0;
    let sgPutting = 0;
    const byHole: { hole: number; sg: number }[] = [];

    // Group shots by hole
    const holeShots = new Map<number, ShotRecord[]>();
    for (const shot of shots) {
      const hole = shot.holeNumber ?? 0;
      if (!holeShots.has(hole)) holeShots.set(hole, []);
      holeShots.get(hole)!.push(shot);
    }

    for (const [holeNum, holeShotList] of holeShots) {
      let holeSG = 0;

      for (let i = 0; i < holeShotList.length; i++) {
        const shot = holeShotList[i];
        const nextShot = holeShotList[i + 1];

        const category = this.categorizeShot(shot, i, holeShotList.length);
        const distBefore = shot.totalYards > 0 ? shot.totalYards : shot.carryYards;
        const distAfter = nextShot
          ? this.estimateRemainingDistance(nextShot)
          : 0; // holed out

        const expectedBefore = baselineStrokes(category, distBefore + distAfter, handicap);
        const expectedAfter = nextShot
          ? baselineStrokes(this.categorizePosition(nextShot.lie), distAfter, handicap)
          : 0;

        // SG = expected_before - expected_after - 1
        const sg = expectedBefore - expectedAfter - 1;

        switch (category) {
          case 'tee':
            sgOffTee += sg;
            break;
          case 'fairway':
          case 'rough':
            if (distBefore + distAfter > 50) sgApproach += sg;
            else sgAroundGreen += sg;
            break;
          case 'bunker':
            sgAroundGreen += sg;
            break;
          case 'green':
            sgPutting += sg;
            break;
          default:
            sgApproach += sg;
        }

        holeSG += sg;
      }

      byHole.push({ hole: holeNum, sg: Math.round(holeSG * 100) / 100 });
    }

    return {
      total: Math.round((sgOffTee + sgApproach + sgAroundGreen + sgPutting) * 100) / 100,
      offTee: Math.round(sgOffTee * 100) / 100,
      approach: Math.round(sgApproach * 100) / 100,
      aroundGreen: Math.round(sgAroundGreen * 100) / 100,
      putting: Math.round(sgPutting * 100) / 100,
      byHole,
    };
  }

  /**
   * Generate actionable performance insights from round data.
   */
  generateInsights(
    rounds: RoundSummary[],
    profile: PlayerProfile,
  ): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (rounds.length === 0) return insights;

    // Aggregate strokes gained across rounds
    const sgTotals = {
      offTee: 0, approach: 0, aroundGreen: 0, putting: 0, count: 0,
    };

    for (const round of rounds) {
      if (round.strokesGained) {
        sgTotals.offTee += round.strokesGained.offTee;
        sgTotals.approach += round.strokesGained.approach;
        sgTotals.aroundGreen += round.strokesGained.aroundGreen;
        sgTotals.putting += round.strokesGained.putting;
        sgTotals.count++;
      }
    }

    if (sgTotals.count > 0) {
      const avg = {
        offTee: sgTotals.offTee / sgTotals.count,
        approach: sgTotals.approach / sgTotals.count,
        aroundGreen: sgTotals.aroundGreen / sgTotals.count,
        putting: sgTotals.putting / sgTotals.count,
      };

      // Find weakest area
      const areas = [
        { name: 'Off the Tee', value: avg.offTee, area: 'driving' },
        { name: 'Approach', value: avg.approach, area: 'approach' },
        { name: 'Around the Green', value: avg.aroundGreen, area: 'short_game' },
        { name: 'Putting', value: avg.putting, area: 'putting' },
      ] as const;

      const sorted = [...areas].sort((a, b) => a.value - b.value);
      const weakest = sorted[0];
      const strongest = sorted[sorted.length - 1];

      insights.push({
        category: 'weakness',
        area: weakest.name,
        description: `Your biggest area for improvement is ${weakest.name.toLowerCase()} (${weakest.value > 0 ? '+' : ''}${weakest.value.toFixed(2)} strokes gained per round).`,
        actionableAdvice: this.getAdviceForArea(weakest.area),
        priority: 'high',
        dataPoints: sgTotals.count,
      });

      insights.push({
        category: 'strength',
        area: strongest.name,
        description: `${strongest.name} is your strongest area (${strongest.value > 0 ? '+' : ''}${strongest.value.toFixed(2)} strokes gained per round).`,
        actionableAdvice: `Keep doing what you're doing ${strongest.name.toLowerCase()}. Focus practice time on weaker areas for maximum improvement.`,
        priority: 'low',
        dataPoints: sgTotals.count,
      });
    }

    // Scoring pattern analysis
    if (rounds.length >= 3) {
      const recentScores = rounds.slice(-5).map(r => r.scoreToPar);
      const trend = this.detectTrend(recentScores);

      if (trend !== 'stable') {
        insights.push({
          category: 'trend',
          area: 'Scoring',
          description: `Your scoring is trending ${trend} over the last ${recentScores.length} rounds.`,
          actionableAdvice: trend === 'improving'
            ? 'Great momentum! Keep your current practice routine and course management approach.'
            : 'Consider focusing on fundamentals and playing more conservative course strategy.',
          priority: trend === 'declining' ? 'high' : 'medium',
          dataPoints: recentScores.length,
        });
      }
    }

    // GIR analysis
    const totalGIR = rounds.reduce((sum, r) => sum + r.greensInRegulation, 0);
    const totalHoles = rounds.length * 18;
    const girPct = (totalGIR / totalHoles) * 100;

    if (girPct < 30) {
      insights.push({
        category: 'weakness',
        area: 'Greens in Regulation',
        description: `You're hitting only ${girPct.toFixed(0)}% of greens in regulation.`,
        actionableAdvice: 'Focus on approach shot consistency. Consider clubbing up — most amateurs miss short. Aim for the center of greens rather than pins.',
        priority: 'high',
        dataPoints: totalHoles,
      });
    }

    // Penalty analysis
    const totalPenalties = rounds.reduce((sum, r) => sum + r.penalties, 0);
    const penaltiesPerRound = totalPenalties / rounds.length;

    if (penaltiesPerRound > 2) {
      insights.push({
        category: 'pattern',
        area: 'Penalty Shots',
        description: `Averaging ${penaltiesPerRound.toFixed(1)} penalty strokes per round — this is costing you ${(penaltiesPerRound * 1.5).toFixed(0)}+ strokes.`,
        actionableAdvice: 'Hit less driver on tight holes. Use the club that keeps you in play, even if it means a longer approach. A 150-yard approach from the fairway beats a 100-yard recovery from trouble.',
        priority: 'high',
        dataPoints: rounds.length,
      });
    }

    // Putting analysis
    const avgPutts = rounds.reduce((sum, r) => sum + r.totalPutts, 0) / rounds.length;
    if (avgPutts > 34) {
      insights.push({
        category: 'weakness',
        area: 'Putting',
        description: `Averaging ${avgPutts.toFixed(1)} putts per round. Tour average is 29.`,
        actionableAdvice: 'Focus on lag putting — getting your first putt within 3 feet. Practice the 6-10 foot range which is where scoring happens. Speed control matters more than line.',
        priority: 'high',
        dataPoints: rounds.length,
      });
    }

    // Miss pattern detection
    const allShots = rounds.flatMap(r => r.shots);
    const missPattern = this.detectMissPattern(allShots);
    if (missPattern) {
      insights.push(missPattern);
    }

    return insights.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  private categorizeShot(shot: ShotRecord, index: number, totalShots: number): string {
    if (index === 0 && shot.lie === 'tee') return 'tee';
    if (shot.lie === 'green') return 'green';
    if (shot.lie === 'greenside_bunker' || shot.lie === 'fairway_bunker') return 'bunker';
    if (shot.lie === 'heavy_rough') return 'rough';
    return 'fairway';
  }

  private categorizePosition(lie: string): string {
    if (lie === 'green') return 'green';
    if (lie.includes('bunker')) return 'bunker';
    if (lie.includes('rough')) return 'rough';
    return 'fairway';
  }

  private estimateRemainingDistance(shot: ShotRecord): number {
    // Estimate how far from the hole the next shot is
    // In a real implementation, this would use GPS coordinates
    return shot.totalYards || shot.carryYards || 0;
  }

  private getAdviceForArea(area: string): string {
    switch (area) {
      case 'driving':
        return 'Work on tee shot accuracy over distance. Consider hitting 3-wood on holes where driver brings hazards into play. Practice finding the fairway — it\'s the #1 predictor of score for amateurs.';
      case 'approach':
        return 'Club selection is key — take one more club than you think you need. 80% of amateur approach misses are short. Aim for the center of greens, not pins tucked behind bunkers.';
      case 'short_game':
        return 'Develop a reliable chip shot with one club (typically a gap wedge or 52°). Practice from 10-30 yards — this is where amateurs waste the most strokes.';
      case 'putting':
        return 'Speed control is everything. Practice lag putts from 20-40 feet to eliminate 3-putts. For short putts, pick a spot on your line and commit — doubt causes more misses than bad reads.';
      default:
        return 'Focus on the weakest part of your game for the biggest improvement.';
    }
  }

  private detectTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';

    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

    const diff = avgSecond - avgFirst;
    if (diff < -1.5) return 'improving'; // score going down = improving
    if (diff > 1.5) return 'declining';
    return 'stable';
  }

  private detectMissPattern(shots: ShotRecord[]): PerformanceInsight | null {
    const approachShots = shots.filter(s =>
      s.lie === 'fairway' && s.carryYards > 80 && s.carryYards < 220
    );

    if (approachShots.length < 10) return null;

    const leftMisses = approachShots.filter(s => s.lateralMissYards < -5).length;
    const rightMisses = approachShots.filter(s => s.lateralMissYards > 5).length;
    const shortMisses = approachShots.filter(s => s.result === 'poor' && s.carryYards < s.totalYards * 0.85).length;

    const total = approachShots.length;
    const leftPct = (leftMisses / total) * 100;
    const rightPct = (rightMisses / total) * 100;
    const shortPct = (shortMisses / total) * 100;

    if (leftPct > 40) {
      return {
        category: 'pattern',
        area: 'Miss Pattern — Left',
        description: `${leftPct.toFixed(0)}% of your approach shots miss left. This is a significant pattern.`,
        actionableAdvice: 'Check your alignment — most golfers who miss left are aiming left without realizing it. Also check for an over-the-top swing path. Consider aiming slightly right of target to play your natural shape.',
        priority: 'high',
        dataPoints: total,
      };
    }

    if (rightPct > 40) {
      return {
        category: 'pattern',
        area: 'Miss Pattern — Right',
        description: `${rightPct.toFixed(0)}% of your approach shots miss right. This is a significant pattern.`,
        actionableAdvice: 'Check for an open clubface at impact — this is the #1 cause of right misses. Strengthen your grip slightly and focus on face control through impact.',
        priority: 'high',
        dataPoints: total,
      };
    }

    if (shortPct > 35) {
      return {
        category: 'pattern',
        area: 'Miss Pattern — Short',
        description: `${shortPct.toFixed(0)}% of your approach shots come up short. You\'re consistently under-clubbing.`,
        actionableAdvice: 'Take one more club on every approach shot. Your "average" distance is your best strike — most shots won\'t reach it. There\'s almost always more trouble short of the green than long.',
        priority: 'high',
        dataPoints: total,
      };
    }

    return null;
  }
}

// ============================================================================
// Course Strategy Engine — Pre-Round Hole-by-Hole Planning
// ============================================================================
// Generates a full course strategy like a professional caddie doing a
// course walk-through before a tournament round.

import type {
  CourseData, HoleLayout, HoleStrategy, ShotPlan,
  WeatherConditions, RiskLevel,
} from '../models/types';
import { PlayerModel } from '../models/player-model';
import { distanceMeters } from '../utils/physics';

export class CourseStrategyEngine {
  private playerModel: PlayerModel;

  constructor(playerModel: PlayerModel) {
    this.playerModel = playerModel;
  }

  /**
   * Generate a complete course strategy for all 18 holes.
   */
  generateCourseStrategy(
    course: CourseData,
    weather: WeatherConditions,
  ): HoleStrategy[] {
    return course.holes.map(hole => this.planHole(hole, weather, course));
  }

  /**
   * Plan strategy for a single hole.
   */
  planHole(
    hole: HoleLayout,
    weather: WeatherConditions,
    course: CourseData,
  ): HoleStrategy {
    const player = this.playerModel.getProfile();
    const holeLength = hole.lengthMeters;
    const par = hole.par;

    // Determine overall approach based on hole difficulty vs player ability
    const difficultyRating = this.assessHoleDifficulty(hole, player.handicap);
    const overallApproach = this.determineApproach(difficultyRating, player.aggressionPreference, hole);
    const targetScore = this.calculateTargetScore(hole, player.handicap, difficultyRating);

    let shots: ShotPlan[];

    switch (par) {
      case 3:
        shots = this.planPar3(hole, weather, overallApproach);
        break;
      case 4:
        shots = this.planPar4(hole, weather, overallApproach);
        break;
      case 5:
        shots = this.planPar5(hole, weather, overallApproach);
        break;
      default:
        shots = this.planPar4(hole, weather, overallApproach);
    }

    const keyInsight = this.generateKeyInsight(hole, overallApproach, difficultyRating);

    return {
      holeNumber: hole.holeNumber,
      par,
      overallApproach,
      targetScore,
      shots,
      keyInsight,
    };
  }

  private planPar3(
    hole: HoleLayout,
    weather: WeatherConditions,
    approach: 'attack' | 'manage' | 'conservative',
  ): ShotPlan[] {
    const distance = hole.lengthMeters;
    const clubs = this.playerModel.getClubsForDistance(distance);
    const bestClub = clubs[0];

    if (!bestClub) {
      return [{
        shotNumber: 1,
        club: '7_iron',
        target: 'Center of green',
        reasoning: 'Play to the middle and take your par.',
        riskLevel: 'safe',
      }];
    }

    const hasWater = hole.hazards.some(h => h.type === 'water');
    const hasFrontBunker = hole.hazards.some(h =>
      h.type === 'bunker' &&
      distanceMeters(hole.teePosition, h.centerPoint) < distance - 5
    );

    const plans: ShotPlan[] = [];

    if (approach === 'attack' && !hasWater) {
      plans.push({
        shotNumber: 1,
        club: bestClub.club,
        target: 'Pin high, favoring the safe side',
        reasoning: `${distance} metres — your ${bestClub.club.replace(/_/g, ' ')} averages ${bestClub.averageCarryMeters}. Attack the pin but leave room for your typical ${bestClub.primaryMiss} miss.`,
        riskLevel: 'moderate',
      });
    } else if (hasFrontBunker || hasWater) {
      // Take one extra club to ensure clearing front trouble
      const saferClub = clubs.find(c => c.averageCarryMeters > distance + 5) ?? bestClub;
      plans.push({
        shotNumber: 1,
        club: saferClub.club,
        target: 'Middle to back of green',
        reasoning: `Front trouble demands enough club. Your ${saferClub.club.replace(/_/g, ' ')} clears the ${hasWater ? 'water' : 'bunker'} even on a slight mishit.`,
        riskLevel: 'safe',
      });
    } else {
      plans.push({
        shotNumber: 1,
        club: bestClub.club,
        target: 'Center of green',
        reasoning: `Play the center and let your short game handle the rest. A green in regulation is always a good result on a par 3.`,
        riskLevel: 'safe',
      });
    }

    return plans;
  }

  private planPar4(
    hole: HoleLayout,
    weather: WeatherConditions,
    approach: 'attack' | 'manage' | 'conservative',
  ): ShotPlan[] {
    const plans: ShotPlan[] = [];
    const distance = hole.lengthMeters;
    const driver = this.playerModel.getClubProfile('driver');
    const driverDist = driver?.averageCarryMeters ?? 220;

    const isDogleg = hole.doglegDirection && hole.doglegDirection !== 'straight';
    const hasWaterOffTee = hole.hazards.some(h =>
      h.type === 'water' && distanceMeters(hole.teePosition, h.centerPoint) < driverDist + 30
    );

    // Shot 1: Tee shot
    if (distance < 340 && approach !== 'attack') {
      // Short par 4 — positioning is everything
      const layup = this.findBestLayup(hole, 100);
      const clubsFor = this.playerModel.getClubsForDistance(layup?.distanceToGreen ? distance - layup.distanceToGreen : distance * 0.6);
      const teeClub = clubsFor[0];

      plans.push({
        shotNumber: 1,
        club: teeClub?.club ?? '5_iron',
        target: layup?.description ?? 'Fairway, leaving full wedge in',
        reasoning: `Short par 4 — position beats power. Leave yourself a comfortable approach distance rather than a tricky half-wedge.`,
        riskLevel: 'safe',
      });
    } else if (hasWaterOffTee || (isDogleg && approach === 'conservative')) {
      const safeDist = this.findSafeTeeShotDistance(hole);
      const clubs = this.playerModel.getClubsForDistance(safeDist);

      plans.push({
        shotNumber: 1,
        club: clubs[0]?.club ?? '3_wood',
        target: isDogleg ? `${hole.doglegDirection} side of fairway` : 'Center of fairway',
        reasoning: `${hasWaterOffTee ? 'Water in play off the tee. ' : ''}${isDogleg ? `Dogleg ${hole.doglegDirection} — position on the correct side opens up the green. ` : ''}Take the trouble out of play.`,
        riskLevel: 'safe',
      });
    } else {
      plans.push({
        shotNumber: 1,
        club: 'driver',
        target: isDogleg ? `${hole.doglegDirection === 'left' ? 'Left-center' : 'Right-center'} of fairway` : 'Center of fairway',
        reasoning: isDogleg
          ? `Favor the ${hole.doglegDirection} side to shorten your approach.`
          : `Full driver. Get as close as possible to leave a shorter approach.`,
        riskLevel: approach === 'attack' ? 'moderate' : 'safe',
      });
    }

    // Shot 2: Approach
    const approachDist = distance - driverDist;
    const approachClubs = this.playerModel.getClubsForDistance(Math.max(approachDist, 50));
    const approachClub = approachClubs[0];

    const greenGuarded = hole.hazards.some(h =>
      h.type === 'bunker' &&
      distanceMeters(h.centerPoint, hole.pinPosition) < 20
    );

    if (approach === 'attack' && !greenGuarded) {
      plans.push({
        shotNumber: 2,
        club: approachClub?.club ?? '8_iron',
        target: 'At the flag',
        reasoning: `From the fairway, attack the pin. Your ${approachClub?.club.replace(/_/g, ' ') ?? '8 iron'} is the right distance.`,
        riskLevel: 'moderate',
      });
    } else {
      plans.push({
        shotNumber: 2,
        club: approachClub?.club ?? '8_iron',
        target: 'Center of green, away from trouble',
        reasoning: `Play to the fat part of the green. ${greenGuarded ? 'Greenside bunkers guard the pin — center green is smarter.' : 'Two putts from the middle is never a bad play.'}`,
        riskLevel: 'safe',
      });
    }

    return plans;
  }

  private planPar5(
    hole: HoleLayout,
    weather: WeatherConditions,
    approach: 'attack' | 'manage' | 'conservative',
  ): ShotPlan[] {
    const plans: ShotPlan[] = [];
    const distance = hole.lengthMeters;
    const driver = this.playerModel.getClubProfile('driver');
    const fairwayWood = this.playerModel.getClubProfile('3_wood');
    const driverDist = driver?.averageCarryMeters ?? 220;
    const woodDist = fairwayWood?.averageCarryMeters ?? 200;

    const canReachInTwo = (driverDist + woodDist) >= distance - 10;

    // Shot 1: Tee shot
    plans.push({
      shotNumber: 1,
      club: 'driver',
      target: 'Center-left of fairway',
      reasoning: canReachInTwo
        ? 'Need full distance off the tee to set up a go-for-it second shot.'
        : 'Maximize distance to leave a comfortable layup and wedge in.',
      riskLevel: 'moderate',
    });

    if (canReachInTwo && approach === 'attack') {
      // Go for the green in two
      const secondShotDist = distance - driverDist;
      const clubs = this.playerModel.getClubsForDistance(secondShotDist);

      plans.push({
        shotNumber: 2,
        club: clubs[0]?.club ?? '3_wood',
        target: 'Front edge of green or just short',
        reasoning: `Reachable in two! Even if you miss the green, you'll have a simple chip for birdie. ${clubs[0]?.club.replace(/_/g, ' ') ?? '3 wood'} gets you there.`,
        riskLevel: 'aggressive',
      });
    } else {
      // Layup strategy
      const idealLayupDist = 90; // metres to green
      const layupTarget = this.findBestLayup(hole, idealLayupDist);
      const layupShotDist = distance - driverDist - idealLayupDist;
      const layupClubs = this.playerModel.getClubsForDistance(layupShotDist);

      plans.push({
        shotNumber: 2,
        club: layupClubs[0]?.club ?? '7_iron',
        target: layupTarget?.description ?? `Fairway, leaving ~${idealLayupDist} metres`,
        reasoning: `Layup to your favorite wedge distance. Don't leave an awkward in-between distance.`,
        riskLevel: 'safe',
      });

      const wedgeClubs = this.playerModel.getClubsForDistance(idealLayupDist);
      plans.push({
        shotNumber: 3,
        club: wedgeClubs[0]?.club ?? 'pw',
        target: 'Pin or safe zone on green',
        reasoning: `This is your scoring shot. Full ${wedgeClubs[0]?.club.replace(/_/g, ' ') ?? 'pitching wedge'} to set up a birdie putt.`,
        riskLevel: 'moderate',
      });
    }

    return plans;
  }

  private assessHoleDifficulty(hole: HoleLayout, handicap: number): number {
    let difficulty = 0;

    // Length relative to par
    const expectedLength = { 3: 170, 4: 400, 5: 520 }[hole.par] ?? 400;
    difficulty += (hole.lengthMeters - expectedLength) / 50;

    // Hazards
    difficulty += hole.hazards.length * 0.5;
    difficulty += hole.hazards.filter(h => h.type === 'water').length * 1.0;
    difficulty += hole.hazards.filter(h => h.type === 'ob').length * 1.5;

    // Handicap index (lower = harder)
    difficulty += (18 - hole.handicapIndex) / 6;

    // Player's ability to handle this hole
    difficulty += handicap * 0.1;

    return Math.max(0, Math.min(10, difficulty));
  }

  private determineApproach(
    difficulty: number,
    aggression: number,
    hole: HoleLayout,
  ): 'attack' | 'manage' | 'conservative' {
    if (difficulty < 3 && aggression > 0.5) return 'attack';
    if (difficulty > 6 || aggression < 0.3) return 'conservative';
    return 'manage';
  }

  private calculateTargetScore(hole: HoleLayout, handicap: number, difficulty: number): number {
    const base = hole.par;
    // Players get strokes on harder holes
    const strokesReceived = handicap > hole.handicapIndex ? 1 : 0;
    const difficultyAdj = difficulty > 6 ? 0.5 : difficulty < 3 ? -0.3 : 0;
    return Math.round((base + strokesReceived + difficultyAdj) * 10) / 10;
  }

  private findBestLayup(hole: HoleLayout, targetDistanceToGreen: number): { distanceToGreen: number; description: string } | null {
    if (hole.layupTargets.length > 0) {
      const best = hole.layupTargets.reduce((a, b) =>
        Math.abs(a.distanceToGreen - targetDistanceToGreen) < Math.abs(b.distanceToGreen - targetDistanceToGreen) ? a : b
      );
      return { distanceToGreen: best.distanceToGreen, description: best.description };
    }
    return { distanceToGreen: targetDistanceToGreen, description: `Fairway, ${targetDistanceToGreen} metres out` };
  }

  private findSafeTeeShotDistance(hole: HoleLayout): number {
    // Find the distance that avoids all tee-shot hazards
    const teeHazards = hole.hazards.filter(h =>
      distanceMeters(hole.teePosition, h.centerPoint) < 280
    );

    if (teeHazards.length === 0) return 250;

    const minHazardDist = Math.min(
      ...teeHazards.map(h => distanceMeters(hole.teePosition, h.centerPoint))
    );

    return Math.max(180, minHazardDist - 20);
  }

  private generateKeyInsight(
    hole: HoleLayout,
    approach: 'attack' | 'manage' | 'conservative',
    difficulty: number,
  ): string {
    const hasWater = hole.hazards.some(h => h.type === 'water');
    const hasOB = hole.hazards.some(h => h.type === 'ob');
    const isDogleg = hole.doglegDirection && hole.doglegDirection !== 'straight';

    if (approach === 'attack') {
      return `Birdie opportunity. Play aggressive but smart — ${hole.par === 5 ? 'reachable in two with a good drive' : 'short iron approach if you hit the fairway'}.`;
    }

    if (hasWater && hasOB) {
      return `Danger hole. Water AND OB in play — keep the ball in the fairway at all costs. Bogey is better than double.`;
    }

    if (hasWater) {
      return `Respect the water. ${isDogleg ? `Dogleg ${hole.doglegDirection} with water — favor the safe side.` : 'Take enough club to clear any water, every time.'}`;
    }

    if (isDogleg) {
      return `Play the angle. Position your tee shot on the ${hole.doglegDirection} side to open up the green.`;
    }

    if (difficulty > 6) {
      return `Tough hole — the field gives strokes here. Par is a great score; don't force anything.`;
    }

    return `Straightforward hole. Fairway first, then attack with a full approach.`;
  }
}

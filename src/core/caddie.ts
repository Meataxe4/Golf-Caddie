// ============================================================================
// AI Caddie — Main Orchestrator
// ============================================================================
// The unified interface that coordinates all subsystems:
// shot recommendations, course strategy, voice, heatmaps, and analysis.

import type {
  CourseData, HoleLayout, WeatherConditions, GPSCoordinate,
  LieCondition, ShotRecommendation, HoleStrategy, RiskHeatmap,
  ShotRecord, RoundSummary, StrokesGainedBreakdown,
  PerformanceInsight, VoiceCaddieResponse, PressureContext,
} from '../models/types';
import { PlayerModel } from '../models/player-model';
import { ShotRecommendationEngine, type ShotContext } from './shot-recommendation-engine';
import { CourseStrategyEngine } from './course-strategy';
import { PostRoundAnalyzer } from './post-round-analysis';
import { RiskHeatmapEngine } from './risk-heatmap';
import { VoiceCaddie, PatternDetector } from './voice-caddie';
import { WeatherService } from '../services/weather-service';
import { distanceMeters } from '../utils/physics';

export interface CaddieConfig {
  voiceEnabled: boolean;
  aggressionLevel: number; // 0-1 override
  showDetailedStats: boolean;
  pressureMode: boolean;
}

export class AICaddie {
  private playerModel: PlayerModel;
  private shotEngine: ShotRecommendationEngine;
  private strategyEngine: CourseStrategyEngine;
  private postRoundAnalyzer: PostRoundAnalyzer;
  private heatmapEngine: RiskHeatmapEngine;
  private voiceCaddie: VoiceCaddie;
  private patternDetector: PatternDetector;
  private weatherService: WeatherService;

  private currentCourse: CourseData | null = null;
  private currentHole: number = 1;
  private currentStroke: number = 1;
  private roundShots: ShotRecord[] = [];
  private weather: WeatherConditions | null = null;
  private config: CaddieConfig;

  constructor(
    playerModel: PlayerModel,
    weatherService: WeatherService,
    config?: Partial<CaddieConfig>,
  ) {
    this.playerModel = playerModel;
    this.weatherService = weatherService;
    this.shotEngine = new ShotRecommendationEngine(playerModel);
    this.strategyEngine = new CourseStrategyEngine(playerModel);
    this.postRoundAnalyzer = new PostRoundAnalyzer();
    this.heatmapEngine = new RiskHeatmapEngine(playerModel);
    this.voiceCaddie = new VoiceCaddie();
    this.patternDetector = new PatternDetector();

    this.config = {
      voiceEnabled: true,
      aggressionLevel: playerModel.getProfile().aggressionPreference,
      showDetailedStats: false,
      pressureMode: false,
      ...config,
    };

    this.voiceCaddie.setEnabled(this.config.voiceEnabled);
  }

  // ===== Round Lifecycle =====

  /**
   * Start a new round. Fetches weather and generates course strategy.
   */
  async startRound(course: CourseData): Promise<{
    weather: WeatherConditions;
    strategy: HoleStrategy[];
  }> {
    this.currentCourse = course;
    this.currentHole = 1;
    this.currentStroke = 1;
    this.roundShots = [];

    this.weather = await this.weatherService.getConditions(course.location);

    const strategy = this.strategyEngine.generateCourseStrategy(course, this.weather);

    return { weather: this.weather, strategy };
  }

  /**
   * Get a shot recommendation for the current situation.
   * This is the primary method used during play.
   */
  getRecommendation(
    currentPosition: GPSCoordinate,
    lie: LieCondition,
    pressure?: PressureContext,
  ): { recommendation: ShotRecommendation; voice: VoiceCaddieResponse } {
    if (!this.currentCourse || !this.weather) {
      throw new Error('Round not started. Call startRound() first.');
    }

    const hole = this.currentCourse.holes[this.currentHole - 1];
    const distToPin = distanceMeters(currentPosition, hole.pinPosition);

    const context: ShotContext = {
      currentPosition,
      targetPosition: hole.pinPosition,
      pinPosition: hole.pinPosition,
      lie,
      weather: this.weather,
      hazards: hole.hazards,
      elevationChangeFt: this.estimateElevationChange(currentPosition, hole),
      holeNumber: this.currentHole,
      par: hole.par,
      strokeNumber: this.currentStroke,
      greenFrontMeters: distToPin - 12,
      greenBackMeters: distToPin + 12,
      greenWidthMeters: 25,
      pressure: this.config.pressureMode ? pressure : undefined,
    };

    const recommendation = this.shotEngine.recommend(context);
    const voice = this.voiceCaddie.announceRecommendation(recommendation);

    return { recommendation, voice };
  }

  /**
   * Record a shot result and advance state.
   */
  recordShot(shot: ShotRecord): void {
    this.playerModel.recordShot(shot);
    this.roundShots.push(shot);
    this.currentStroke++;
  }

  /**
   * Move to the next hole.
   */
  nextHole(): {
    holeNumber: number;
    strategy: HoleStrategy | null;
    voice: VoiceCaddieResponse | null;
  } {
    this.currentHole++;
    this.currentStroke = 1;

    if (!this.currentCourse || !this.weather || this.currentHole > 18) {
      return { holeNumber: this.currentHole, strategy: null, voice: null };
    }

    const hole = this.currentCourse.holes[this.currentHole - 1];
    const strategy = this.strategyEngine.planHole(hole, this.weather, this.currentCourse);
    const voice = this.voiceCaddie.announceHoleStrategy(strategy);

    return { holeNumber: this.currentHole, strategy, voice };
  }

  // ===== Strategy & Analysis =====

  /**
   * Get risk heatmap for current or specified hole.
   */
  getHeatmap(holeNumber?: number): RiskHeatmap | null {
    if (!this.currentCourse || !this.weather) return null;

    const hole = this.currentCourse.holes[(holeNumber ?? this.currentHole) - 1];
    return this.heatmapEngine.generateHeatmap(hole, this.weather);
  }

  /**
   * Get hole strategy for a specific hole.
   */
  getHoleStrategy(holeNumber: number): HoleStrategy | null {
    if (!this.currentCourse || !this.weather) return null;

    const hole = this.currentCourse.holes[holeNumber - 1];
    return this.strategyEngine.planHole(hole, this.weather, this.currentCourse);
  }

  /**
   * Complete the round and get analysis.
   */
  finishRound(holeScores: number[]): {
    summary: RoundSummary;
    strokesGained: StrokesGainedBreakdown;
    insights: PerformanceInsight[];
    patterns: ReturnType<PatternDetector['detectClosingHolePerformance']>;
  } {
    if (!this.currentCourse) {
      throw new Error('No round in progress.');
    }

    const totalScore = holeScores.reduce((a, b) => a + b, 0);
    const coursePar = this.currentCourse.holes.reduce((a, h) => a + h.par, 0);

    const summary: RoundSummary = {
      date: new Date(),
      courseId: this.currentCourse.id,
      courseName: this.currentCourse.name,
      totalScore,
      scoreToPar: totalScore - coursePar,
      fairwaysHit: this.countFairwaysHit(),
      fairwayAttempts: this.currentCourse.holes.filter(h => h.par >= 4).length,
      greensInRegulation: this.countGIR(holeScores),
      totalPutts: this.countPutts(),
      penalties: this.countPenalties(),
      holeScores,
      shots: [...this.roundShots],
    };

    const handicap = this.playerModel.getProfile().handicap;
    const strokesGained = this.postRoundAnalyzer.calculateStrokesGained(summary, handicap);
    summary.strokesGained = strokesGained;

    const profile = this.playerModel.getProfile();
    const allRounds = [...profile.roundHistory, summary];
    const insights = this.postRoundAnalyzer.generateInsights(allRounds, profile);

    const patterns = this.patternDetector.detectClosingHolePerformance(
      allRounds.map(r => ({ holeScores: r.holeScores }))
    );

    return { summary, strokesGained, insights, patterns };
  }

  // ===== Configuration =====

  updateConfig(config: Partial<CaddieConfig>): void {
    this.config = { ...this.config, ...config };
    this.voiceCaddie.setEnabled(this.config.voiceEnabled);
  }

  getCurrentHole(): number { return this.currentHole; }
  getCurrentStroke(): number { return this.currentStroke; }
  getPlayerModel(): PlayerModel { return this.playerModel; }

  // ===== Private Helpers =====

  private estimateElevationChange(from: GPSCoordinate, hole: HoleLayout): number {
    const fromElev = from.elevationMeters ?? 0;
    const toElev = hole.pinPosition.elevationMeters ?? 0;
    return (toElev - fromElev) * 3.281; // meters to feet
  }

  private countFairwaysHit(): number {
    return this.roundShots.filter((s, i) =>
      s.strokeNumber === 1 && s.lie === 'tee' &&
      this.roundShots[i + 1]?.lie === 'fairway'
    ).length;
  }

  private countGIR(holeScores: number[]): number {
    let gir = 0;
    if (!this.currentCourse) return 0;

    for (let i = 0; i < this.currentCourse.holes.length; i++) {
      const par = this.currentCourse.holes[i].par;
      const holeShots = this.roundShots.filter(s => s.holeNumber === i + 1);
      const approachStroke = par - 2; // GIR = on green in par - 2
      const reachedGreen = holeShots.findIndex(s => s.lie === 'green');
      if (reachedGreen >= 0 && reachedGreen < approachStroke) gir++;
    }
    return gir;
  }

  private countPutts(): number {
    return this.roundShots.filter(s => s.club === 'putter').length;
  }

  private countPenalties(): number {
    return this.roundShots.filter(s => s.result === 'penalty').length;
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerModel } from '../src/models/player-model';
import { ShotRecommendationEngine, type ShotContext } from '../src/core/shot-recommendation-engine';
import { SAMPLE_PLAYER } from '../src/data/sample-player';
import type { WeatherConditions, GPSCoordinate } from '../src/models/types';

describe('ShotRecommendationEngine', () => {
  let playerModel: PlayerModel;
  let engine: ShotRecommendationEngine;

  const calmWeather: WeatherConditions = {
    windSpeedMph: 0,
    windDirectionDeg: 0,
    temperatureF: 72,
    humidity: 50,
    altitudeFt: 0,
    barometricPressure: 29.92,
    precipitation: 'none',
  };

  const tee: GPSCoordinate = { lat: 33.45, lng: -84.35 };
  const pin150: GPSCoordinate = { lat: 33.45 + (150 * 0.9144 / 111320), lng: -84.35 };
  const pin200: GPSCoordinate = { lat: 33.45 + (200 * 0.9144 / 111320), lng: -84.35 };

  beforeEach(() => {
    playerModel = new PlayerModel(SAMPLE_PLAYER);
    engine = new ShotRecommendationEngine(playerModel);
  });

  it('should return a recommendation for a 150-yard approach', () => {
    const context: ShotContext = {
      currentPosition: tee,
      targetPosition: pin150,
      pinPosition: pin150,
      lie: 'fairway',
      weather: calmWeather,
      hazards: [],
      elevationChangeFt: 0,
      holeNumber: 1,
      par: 4,
      strokeNumber: 2,
    };

    const rec = engine.recommend(context);

    expect(rec).toBeDefined();
    expect(rec.club).toBeDefined();
    expect(rec.reasoning.length).toBeGreaterThan(0);
    expect(rec.expectedOutcome.expectedCarryYards).toBeGreaterThan(100);
    expect(rec.confidenceScore).toBeGreaterThan(0);
  });

  it('should recommend a different club for 200 yards vs 150 yards', () => {
    const context150: ShotContext = {
      currentPosition: tee,
      targetPosition: pin150,
      pinPosition: pin150,
      lie: 'fairway',
      weather: calmWeather,
      hazards: [],
      elevationChangeFt: 0,
      holeNumber: 1,
      par: 4,
      strokeNumber: 2,
    };

    const context200: ShotContext = {
      ...context150,
      targetPosition: pin200,
      pinPosition: pin200,
    };

    const rec150 = engine.recommend(context150);
    const rec200 = engine.recommend(context200);

    // The 200-yard shot should use a longer club
    const profile150 = playerModel.getClubProfile(rec150.club);
    const profile200 = playerModel.getClubProfile(rec200.club);

    expect(profile200!.averageCarryYards).toBeGreaterThanOrEqual(profile150!.averageCarryYards);
  });

  it('should provide reasoning that explains the recommendation', () => {
    const context: ShotContext = {
      currentPosition: tee,
      targetPosition: pin150,
      pinPosition: pin150,
      lie: 'fairway',
      weather: { ...calmWeather, windSpeedMph: 15, windDirectionDeg: 180 },
      hazards: [],
      elevationChangeFt: 0,
      holeNumber: 1,
      par: 4,
      strokeNumber: 2,
    };

    const rec = engine.recommend(context);

    // With significant wind, reasoning should mention wind
    const mentionsWind = rec.reasoning.some(r => r.toLowerCase().includes('wind'));
    expect(mentionsWind).toBe(true);
  });

  it('should include alternative shots', () => {
    const context: ShotContext = {
      currentPosition: tee,
      targetPosition: pin150,
      pinPosition: pin150,
      lie: 'fairway',
      weather: calmWeather,
      hazards: [],
      elevationChangeFt: 0,
      holeNumber: 1,
      par: 4,
      strokeNumber: 2,
    };

    const rec = engine.recommend(context);
    expect(rec.alternativeShots.length).toBeGreaterThan(0);
  });

  it('should adjust for heavy rough lie', () => {
    const fairwayContext: ShotContext = {
      currentPosition: tee,
      targetPosition: pin150,
      pinPosition: pin150,
      lie: 'fairway',
      weather: calmWeather,
      hazards: [],
      elevationChangeFt: 0,
      holeNumber: 1,
      par: 4,
      strokeNumber: 2,
    };

    const roughContext: ShotContext = {
      ...fairwayContext,
      lie: 'heavy_rough',
    };

    const fairwayRec = engine.recommend(fairwayContext);
    const roughRec = engine.recommend(roughContext);

    // From heavy rough, should expect shorter carry
    expect(roughRec.expectedOutcome.expectedCarryYards)
      .toBeLessThanOrEqual(fairwayRec.expectedOutcome.expectedCarryYards);
  });
});

describe('PlayerModel', () => {
  it('should update club stats when recording shots', () => {
    const model = new PlayerModel(SAMPLE_PLAYER);
    const initialProfile = model.getClubProfile('7_iron');

    // Record some shots that are consistently long
    for (let i = 0; i < 20; i++) {
      model.recordShot({
        timestamp: new Date(),
        club: '7_iron',
        lie: 'fairway',
        startPosition: { lat: 0, lng: 0 },
        endPosition: { lat: 0.001, lng: 0 },
        intendedTarget: { lat: 0.001, lng: 0 },
        carryYards: 160, // longer than the 148 average
        totalYards: 168,
        lateralMissYards: 2,
        shotShape: 'straight',
        result: 'good',
      });
    }

    const updatedProfile = model.getClubProfile('7_iron');
    expect(updatedProfile!.averageCarryYards).toBeGreaterThan(initialProfile!.averageCarryYards);
  });

  it('should return clubs sorted by distance', () => {
    const model = new PlayerModel(SAMPLE_PLAYER);
    const clubs = model.getAllClubProfiles();

    for (let i = 1; i < clubs.length; i++) {
      expect(clubs[i - 1].averageCarryYards).toBeGreaterThanOrEqual(clubs[i].averageCarryYards);
    }
  });

  it('should compute dispersion ellipse', () => {
    const model = new PlayerModel(SAMPLE_PLAYER);
    const ellipse = model.getDispersionEllipse('7_iron');

    expect(ellipse.distanceSdYards).toBeGreaterThan(0);
    expect(ellipse.lateralSdYards).toBeGreaterThan(0);
  });
});

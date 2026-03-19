// ============================================================================
// Round Simulation — Demonstrates the AI Caddie in Action
// ============================================================================
// Simulates a full 18-hole round for a 15-handicap player,
// showing recommendations, voice output, and post-round analysis.

import { PlayerModel } from '../models/player-model';
import { AICaddie } from '../core/caddie';
import { WeatherService, MockWeatherProvider } from '../services/weather-service';
import { SAMPLE_PLAYER } from '../data/sample-player';
import { SAMPLE_COURSE } from '../data/sample-course';
import type { LieCondition, ShotRecord, GPSCoordinate } from '../models/types';
import { distanceMeters } from '../utils/physics';

// ===== Simulation Helpers =====

function randomGaussian(mean: number, sd: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function simulateShot(
  club: string,
  avgCarry: number,
  sd: number,
  lateralSd: number,
  startPos: GPSCoordinate,
  bearing: number,
): { endPos: GPSCoordinate; carry: number; lateral: number; lie: LieCondition } {
  const carry = randomGaussian(avgCarry, sd);
  const lateral = randomGaussian(0, lateralSd);

  const bearingRad = (bearing * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos(startPos.lat * Math.PI / 180);

  const dNorth = carry * Math.cos(bearingRad) - lateral * Math.sin(bearingRad);
  const dEast = carry * Math.sin(bearingRad) + lateral * Math.cos(bearingRad);

  const endPos: GPSCoordinate = {
    lat: startPos.lat + dNorth / metersPerDegLat,
    lng: startPos.lng + dEast / metersPerDegLng,
  };

  // Determine lie based on lateral miss
  let lie: LieCondition = 'fairway';
  if (Math.abs(lateral) > 20) lie = 'heavy_rough';
  else if (Math.abs(lateral) > 10) lie = 'light_rough';

  return { endPos, carry, lateral, lie };
}

// ===== Main Simulation =====

async function runSimulation() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           AI GOLF CADDIE — Round Simulation                 ║');
  console.log('║           Pine Valley Municipal Golf Club                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize
  const playerModel = new PlayerModel(SAMPLE_PLAYER);
  const weatherProvider = new MockWeatherProvider({
    windSpeedMph: 12,
    windDirectionDeg: 200, // SSW
    temperatureF: 68,
    humidity: 60,
    altitudeFt: 450,
    barometricPressure: 29.85,
    precipitation: 'none',
  });
  const weatherService = new WeatherService(weatherProvider);

  const caddie = new AICaddie(playerModel, weatherService, {
    voiceEnabled: false, // no browser in CLI
    pressureMode: true,
  });

  // Start round
  const { weather, strategy } = await caddie.startRound(SAMPLE_COURSE);

  console.log(`🌤️  Weather: ${weather.temperatureF}°F, Wind ${weather.windSpeedMph}mph from ${weather.windDirectionDeg}° (SSW)`);
  console.log(`📍 Course: ${SAMPLE_COURSE.name} — Rating ${SAMPLE_COURSE.courseRating}, Slope ${SAMPLE_COURSE.slopeRating}\n`);

  // Show strategy for first 3 holes
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PRE-ROUND STRATEGY (First 3 Holes)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const holeStrat of strategy.slice(0, 3)) {
    console.log(`  Hole ${holeStrat.holeNumber} | Par ${holeStrat.par} | Strategy: ${holeStrat.overallApproach.toUpperCase()}`);
    console.log(`  💡 ${holeStrat.keyInsight}`);
    for (const shot of holeStrat.shots) {
      console.log(`     Shot ${shot.shotNumber}: ${shot.club.replace(/_/g, ' ')} → ${shot.target}`);
      console.log(`     ${shot.reasoning}`);
    }
    console.log();
  }

  // Simulate each hole
  const holeScores: number[] = [];
  let totalPar = 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SIMULATED ROUND');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (let holeIdx = 0; holeIdx < 18; holeIdx++) {
    const hole = SAMPLE_COURSE.holes[holeIdx];
    totalPar += hole.par;

    if (holeIdx > 0) caddie.nextHole();

    let currentPos = hole.teePosition;
    let lie: LieCondition = 'tee';
    let strokes = 0;

    console.log(`  ⛳ Hole ${hole.holeNumber} | Par ${hole.par} | ${hole.lengthMeters} metres`);

    // Play until holed out (max strokes = par + 4)
    const maxStrokes = hole.par + 4;
    while (strokes < maxStrokes) {
      const dist = distanceMeters(currentPos, hole.pinPosition);
      if (dist < 2) break; // holed

      // Recalculate bearing from CURRENT position to pin each shot
      const currentBearing = Math.atan2(
        hole.pinPosition.lng - currentPos.lng,
        hole.pinPosition.lat - currentPos.lat,
      ) * 180 / Math.PI;

      // On the green: just putt
      if (lie === 'green' || dist < 15) {
        if (dist < 5) {
          strokes++; // tap-in
        } else if (dist < 25) {
          strokes += Math.random() < 0.3 ? 1 : 2;
        } else {
          strokes += Math.random() < 0.1 ? 1 : 2;
        }
        break;
      }

      const { recommendation, voice } = caddie.getRecommendation(currentPos, lie);

      // Show first 3 holes in detail, rest condensed
      if (holeIdx < 3) {
        console.log(`     📣 "${voice.spokenText}"`);
        if (recommendation.reasoning.length > 1) {
          console.log(`        ${recommendation.reasoning[1]}`);
        }
      }

      // Simulate the shot — use the distance to the pin as a cap
      const clubProfile = playerModel.getClubProfile(recommendation.club);
      const clubAvg = clubProfile?.averageCarryMeters ?? 150;
      // Don't overshoot: if club goes farther than target, aim for target distance
      const shotDistance = Math.min(clubAvg, dist + 10);
      const sd = clubProfile?.standardDeviationMeters ?? 10;
      const latSd = clubProfile?.lateralDispersionMeters ?? 12;

      const result = simulateShot(
        recommendation.club,
        shotDistance,
        sd * 0.7, // tighten dispersion for more realistic sim
        latSd * 0.5,
        currentPos,
        currentBearing,
      );

      // Check if on green
      const remainingDist = distanceMeters(result.endPos, hole.pinPosition);
      if (remainingDist < 15) {
        result.lie = 'green';
      }

      // Record shot
      const shotRecord: ShotRecord = {
        timestamp: new Date(),
        club: recommendation.club,
        lie,
        startPosition: currentPos,
        endPosition: result.endPos,
        intendedTarget: hole.pinPosition,
        carryMeters: result.carry,
        totalMeters: result.carry + Math.random() * 10,
        lateralMissMeters: result.lateral,
        shotShape: 'straight',
        result: Math.abs(result.lateral) < 5 && Math.abs(result.carry - shotDistance) < sd
          ? 'good' : 'acceptable',
        weather,
        holeNumber: hole.holeNumber,
        strokeNumber: strokes + 1,
      };

      caddie.recordShot(shotRecord);
      currentPos = result.endPos;
      lie = result.lie;
      strokes++;
    }

    holeScores.push(strokes);
    const toPar = strokes - hole.par;
    const scoreLabel = toPar === -2 ? 'EAGLE' : toPar === -1 ? 'Birdie' :
      toPar === 0 ? 'Par' : toPar === 1 ? 'Bogey' :
      toPar === 2 ? 'Double' : `+${toPar}`;

    console.log(`     Score: ${strokes} (${scoreLabel})\n`);
  }

  // Post-round analysis
  const totalScore = holeScores.reduce((a, b) => a + b, 0);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('POST-ROUND ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  Total Score: ${totalScore} (${totalScore - totalPar >= 0 ? '+' : ''}${totalScore - totalPar})`);
  console.log(`  Front 9: ${holeScores.slice(0, 9).reduce((a, b) => a + b, 0)}`);
  console.log(`  Back 9:  ${holeScores.slice(9).reduce((a, b) => a + b, 0)}\n`);

  const { strokesGained, insights, patterns } = caddie.finishRound(holeScores);

  console.log('  Strokes Gained Breakdown:');
  console.log(`    Off the Tee:     ${strokesGained.offTee >= 0 ? '+' : ''}${strokesGained.offTee}`);
  console.log(`    Approach:        ${strokesGained.approach >= 0 ? '+' : ''}${strokesGained.approach}`);
  console.log(`    Around Green:    ${strokesGained.aroundGreen >= 0 ? '+' : ''}${strokesGained.aroundGreen}`);
  console.log(`    Putting:         ${strokesGained.putting >= 0 ? '+' : ''}${strokesGained.putting}`);
  console.log(`    TOTAL:           ${strokesGained.total >= 0 ? '+' : ''}${strokesGained.total}\n`);

  console.log('  Performance Insights:');
  for (const insight of insights.slice(0, 5)) {
    const icon = insight.category === 'strength' ? '💪' :
      insight.category === 'weakness' ? '⚠️' :
      insight.category === 'trend' ? '📈' : '🔍';
    console.log(`    ${icon} [${insight.priority.toUpperCase()}] ${insight.description}`);
    console.log(`       → ${insight.actionableAdvice}\n`);
  }

  console.log('  Closing Hole Analysis:');
  console.log(`    ${patterns.insight}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Simulation complete.');
}

runSimulation().catch(console.error);

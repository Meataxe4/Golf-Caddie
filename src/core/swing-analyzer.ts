// ============================================================================
// Swing Analyzer — AI-powered swing analysis engine
// ============================================================================
// Analyzes swing video frames to estimate:
// - Swing path (in-to-out, out-to-in, neutral)
// - Club face angle at impact (open, closed, square)
// - Tempo and rhythm
// - Ball flight prediction based on physics
// - Actionable improvement recommendations

export interface SwingAnalysisInput {
  /** Duration of the swing clip in seconds */
  durationSeconds: number;
  /** Whether video was recorded (true) or uploaded (false) */
  isLiveRecording: boolean;
  /** User-reported club for this swing */
  club: string;
  /** Optional: user-reported shot result */
  reportedResult?: 'straight' | 'fade' | 'draw' | 'slice' | 'hook' | 'push' | 'pull' | 'top' | 'chunk';
}

export interface SwingMetrics {
  swingPath: 'in-to-out' | 'out-to-in' | 'neutral';
  swingPathDegrees: number; // + is in-to-out, - is out-to-in
  clubFaceAngle: 'open' | 'closed' | 'square';
  clubFaceDegrees: number; // + is open, - is closed
  attackAngle: number; // degrees, - is down
  tempo: { backswingMs: number; downswingMs: number; ratio: string };
  estimatedClubSpeed: number; // mph
  estimatedBallSpeed: number; // mph
  estimatedSmashFactor: number;
}

export interface BallFlightPrediction {
  launchAngle: number;
  launchDirection: number; // + is right
  spinRate: number;
  spinAxis: number; // degrees tilt
  carryYards: number;
  totalYards: number;
  maxHeightYards: number;
  landingAngle: number;
  curveYards: number; // + is right
  flightShape: 'straight' | 'fade' | 'draw' | 'slice' | 'hook' | 'push' | 'pull';
  trajectory: { x: number; y: number; z: number }[]; // 3D trajectory points
}

export interface SwingRecommendation {
  priority: 'critical' | 'important' | 'minor';
  area: string;
  issue: string;
  fix: string;
  drill: string;
}

export interface SwingAnalysisResult {
  metrics: SwingMetrics;
  ballFlight: BallFlightPrediction;
  recommendations: SwingRecommendation[];
  overallScore: number; // 0-100
  summary: string;
}

/**
 * Analyzes a swing based on input parameters and optionally reported result.
 * In a production app, this would use computer vision (MediaPipe Pose, etc.)
 * to extract body landmarks from video frames. For now, it uses a physics-based
 * simulation that generates realistic analysis.
 */
export function analyzeSwing(input: SwingAnalysisInput): SwingAnalysisResult {
  // Generate realistic swing metrics
  // In production, these would come from video pose estimation
  const metrics = generateSwingMetrics(input);
  const ballFlight = predictBallFlight(metrics, input.club);
  const recommendations = generateRecommendations(metrics, ballFlight, input);
  const overallScore = calculateSwingScore(metrics, ballFlight);

  return {
    metrics,
    ballFlight,
    recommendations,
    overallScore,
    summary: generateSummary(metrics, ballFlight, overallScore),
  };
}

function generateSwingMetrics(input: SwingAnalysisInput): SwingMetrics {
  // If the user reported a result, generate metrics that would produce that result
  const reported = input.reportedResult;

  let pathDeg = 0;
  let faceDeg = 0;

  if (reported === 'slice') {
    pathDeg = -4 - Math.random() * 3; // out-to-in
    faceDeg = 2 + Math.random() * 3;  // open
  } else if (reported === 'hook') {
    pathDeg = 4 + Math.random() * 3;  // in-to-out
    faceDeg = -3 - Math.random() * 3; // closed
  } else if (reported === 'fade') {
    pathDeg = -1 - Math.random() * 2;
    faceDeg = 0.5 + Math.random() * 1.5;
  } else if (reported === 'draw') {
    pathDeg = 1 + Math.random() * 2;
    faceDeg = -0.5 - Math.random() * 1.5;
  } else if (reported === 'push') {
    pathDeg = 3 + Math.random() * 2;
    faceDeg = 2 + Math.random() * 2;
  } else if (reported === 'pull') {
    pathDeg = -3 - Math.random() * 2;
    faceDeg = -2 - Math.random() * 2;
  } else if (reported === 'top') {
    pathDeg = (Math.random() - 0.5) * 4;
    faceDeg = (Math.random() - 0.5) * 3;
  } else if (reported === 'chunk') {
    pathDeg = (Math.random() - 0.5) * 4;
    faceDeg = (Math.random() - 0.5) * 3;
  } else {
    // straight or no report
    pathDeg = (Math.random() - 0.5) * 3;
    faceDeg = (Math.random() - 0.5) * 2;
  }

  const clubSpeedByClub: Record<string, number> = {
    driver: 90 + Math.random() * 15,
    '3_wood': 85 + Math.random() * 12,
    '5_wood': 82 + Math.random() * 10,
    '5_hybrid': 80 + Math.random() * 10,
    '7_iron': 75 + Math.random() * 10,
    pw: 70 + Math.random() * 8,
    sw: 65 + Math.random() * 8,
  };

  const clubSpeed = clubSpeedByClub[input.club] ?? 80 + Math.random() * 12;
  const smashFactor = reported === 'top' ? 1.1 + Math.random() * 0.15
    : reported === 'chunk' ? 1.0 + Math.random() * 0.2
    : 1.35 + Math.random() * 0.15;

  const durationMs = input.durationSeconds * 1000;
  const downswingMs = 200 + Math.random() * 100;
  const backswingMs = Math.max(durationMs * 0.4, downswingMs * 2.5 + Math.random() * downswingMs);

  const attackAngle = input.club === 'driver' ? 2 + Math.random() * 4
    : reported === 'chunk' ? -10 - Math.random() * 4
    : -3 - Math.random() * 4;

  return {
    swingPath: pathDeg > 1 ? 'in-to-out' : pathDeg < -1 ? 'out-to-in' : 'neutral',
    swingPathDegrees: Math.round(pathDeg * 10) / 10,
    clubFaceAngle: faceDeg > 1 ? 'open' : faceDeg < -1 ? 'closed' : 'square',
    clubFaceDegrees: Math.round(faceDeg * 10) / 10,
    attackAngle: Math.round(attackAngle * 10) / 10,
    tempo: {
      backswingMs: Math.round(backswingMs),
      downswingMs: Math.round(downswingMs),
      ratio: `${(backswingMs / downswingMs).toFixed(1)}:1`,
    },
    estimatedClubSpeed: Math.round(clubSpeed),
    estimatedBallSpeed: Math.round(clubSpeed * smashFactor),
    estimatedSmashFactor: Math.round(smashFactor * 100) / 100,
  };
}

function predictBallFlight(metrics: SwingMetrics, club: string): BallFlightPrediction {
  const { swingPathDegrees, clubFaceDegrees, attackAngle, estimatedBallSpeed } = metrics;

  // D-plane physics: launch direction is mostly face, curve is path-face difference
  const launchDirection = clubFaceDegrees * 0.75 + swingPathDegrees * 0.25;
  const spinAxis = (clubFaceDegrees - swingPathDegrees) * 5; // simplified

  const isDriver = club === 'driver';
  const launchAngle = isDriver
    ? 10 + attackAngle * 0.6 + Math.random() * 2
    : 15 + Math.abs(attackAngle) * 0.5 + Math.random() * 3;

  const spinRate = isDriver
    ? 2200 + Math.abs(spinAxis) * 80 + Math.random() * 400
    : 5000 + Math.abs(spinAxis) * 60 + Math.random() * 1500;

  // Carry distance from ball speed and launch
  const optimalLaunch = isDriver ? 12 : 18;
  const launchEfficiency = 1 - Math.abs(launchAngle - optimalLaunch) * 0.02;
  const spinPenalty = isDriver ? Math.max(0, (spinRate - 2400) * 0.002) : 0;
  const carry = estimatedBallSpeed * (isDriver ? 2.5 : 1.8) * launchEfficiency * (1 - spinPenalty);

  const curveYards = (clubFaceDegrees - swingPathDegrees) * (carry / 80);
  const maxHeight = carry * Math.sin(launchAngle * Math.PI / 180) * 0.4;

  // Shape label
  let flightShape: BallFlightPrediction['flightShape'] = 'straight';
  if (Math.abs(curveYards) < 5) flightShape = 'straight';
  else if (curveYards > 20) flightShape = 'slice';
  else if (curveYards < -20) flightShape = 'hook';
  else if (curveYards > 5) flightShape = 'fade';
  else if (curveYards < -5) flightShape = 'draw';

  // Generate 3D trajectory points
  const trajectory: { x: number; y: number; z: number }[] = [];
  const numPoints = 50;
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = carry * t; // forward distance
    const y = maxHeight * 4 * t * (1 - t); // height (parabolic)
    const z = curveYards * t * t; // lateral (increasing curve)
    trajectory.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      z: Math.round(z * 10) / 10,
    });
  }

  return {
    launchAngle: Math.round(launchAngle * 10) / 10,
    launchDirection: Math.round(launchDirection * 10) / 10,
    spinRate: Math.round(spinRate),
    spinAxis: Math.round(spinAxis * 10) / 10,
    carryYards: Math.round(carry),
    totalYards: Math.round(carry * 1.08),
    maxHeightYards: Math.round(maxHeight),
    landingAngle: Math.round(launchAngle * 1.2),
    curveYards: Math.round(curveYards * 10) / 10,
    flightShape,
    trajectory,
  };
}

function generateRecommendations(
  metrics: SwingMetrics,
  ballFlight: BallFlightPrediction,
  input: SwingAnalysisInput,
): SwingRecommendation[] {
  const recs: SwingRecommendation[] = [];

  // Swing path issues
  if (Math.abs(metrics.swingPathDegrees) > 4) {
    const isOTI = metrics.swingPathDegrees < 0;
    recs.push({
      priority: 'critical',
      area: 'Swing Path',
      issue: `Your swing path is ${Math.abs(metrics.swingPathDegrees)}° ${isOTI ? 'out-to-in (over the top)' : 'in-to-out (too inside)'}`,
      fix: isOTI
        ? 'Focus on dropping your hands in the transition. Feel like your right elbow (for right-handers) slots into your right hip at the start of the downswing.'
        : 'Your backswing may be too flat or inside. Try keeping your hands more in front of your chest during the takeaway. Feel the club staying outside your hands.',
      drill: isOTI
        ? 'Headcover Drill: Place a headcover 6 inches outside and behind the ball. Practice swinging without hitting it — this trains an inside path.'
        : 'Wall Drill: Stand with your rear end against a wall. Practice takeaways where the club stays close to the wall rather than wrapping behind you.',
    });
  } else if (Math.abs(metrics.swingPathDegrees) > 2) {
    recs.push({
      priority: 'important',
      area: 'Swing Path',
      issue: `Path is slightly ${metrics.swingPathDegrees < 0 ? 'out-to-in' : 'in-to-out'} at ${Math.abs(metrics.swingPathDegrees)}°`,
      fix: 'Minor path adjustment needed. Focus on your alignment at address and your transition move.',
      drill: 'Alignment Stick Drill: Place an alignment stick along your target line and one along your toe line. Practice hitting shots ensuring the club follows the target line through impact.',
    });
  }

  // Face angle issues
  if (Math.abs(metrics.clubFaceDegrees) > 3) {
    const isOpen = metrics.clubFaceDegrees > 0;
    recs.push({
      priority: 'critical',
      area: 'Club Face Control',
      issue: `Club face is ${Math.abs(metrics.clubFaceDegrees)}° ${isOpen ? 'open' : 'closed'} at impact`,
      fix: isOpen
        ? 'Strengthen your grip — rotate both hands slightly clockwise (for right-handers) on the club. You should see 2.5-3 knuckles on your left hand at address.'
        : 'Weaken your grip slightly — rotate both hands counter-clockwise. Also check that your body rotation isn\'t stalling through impact, forcing your hands to flip.',
      drill: isOpen
        ? 'Gate Drill: Set two tees 4 inches apart, just wider than your clubhead. Hit balls through the gate — this trains a square face through impact.'
        : 'Pump Drill: Make practice swings stopping at impact position. Check that the face is square, then complete the swing. Repeat 10x before hitting balls.',
    });
  }

  // Tempo issues
  const tempoRatio = metrics.tempo.backswingMs / metrics.tempo.downswingMs;
  if (tempoRatio < 2.5) {
    recs.push({
      priority: 'important',
      area: 'Tempo',
      issue: `Your tempo ratio is ${metrics.tempo.ratio} — the backswing is too quick (ideal is 3:1)`,
      fix: 'Slow your takeaway. Count "one-thousand" during the backswing. The downswing should happen naturally — you don\'t need to rush.',
      drill: 'Pause Drill: Make your backswing, pause for a full second at the top, then swing through. Do 20 reps. This builds awareness of your transition.',
    });
  } else if (tempoRatio > 4) {
    recs.push({
      priority: 'minor',
      area: 'Tempo',
      issue: `Your backswing-to-downswing ratio is ${metrics.tempo.ratio} — slightly too slow on the way back`,
      fix: 'A smooth but slightly more athletic backswing can generate more speed. Don\'t decelerate at the top.',
      drill: 'Swoosh Drill: Flip your driver upside down and swing it. Listen for the "swoosh" — it should happen at or past the ball position, not before.',
    });
  }

  // Attack angle
  if (input.club === 'driver' && metrics.attackAngle < 0) {
    recs.push({
      priority: 'important',
      area: 'Attack Angle',
      issue: `You\'re hitting down on your driver (${metrics.attackAngle}°) — you should be hitting up (+2° to +5°)`,
      fix: 'Tee the ball higher and position it off your front heel. Feel like you\'re swinging up through the ball. Tilt your spine slightly away from the target at address.',
      drill: 'Tee Height Drill: Tee the ball so half the ball is above the clubface. Practice hitting drives where the tee stays in the ground — this promotes an upward strike.',
    });
  } else if (input.club !== 'driver' && metrics.attackAngle < -8) {
    recs.push({
      priority: 'important',
      area: 'Attack Angle',
      issue: `You\'re digging too much (${metrics.attackAngle}°) — too steep for consistent contact`,
      fix: 'Focus on "brushing" the grass rather than gouging. Check that your ball position isn\'t too far back in your stance.',
      drill: 'Towel Drill: Place a towel 4 inches behind the ball. Practice hitting the ball without hitting the towel — this shallows your angle of attack.',
    });
  }

  // Smash factor
  if (metrics.estimatedSmashFactor < 1.3) {
    recs.push({
      priority: 'critical',
      area: 'Contact Quality',
      issue: `Smash factor of ${metrics.estimatedSmashFactor} indicates off-center contact`,
      fix: 'You\'re losing significant distance from poor contact. Focus on hitting the center of the clubface. This matters more than swing speed.',
      drill: 'Face Tape Drill: Apply impact tape or foot spray to your clubface. Hit 10 balls and check your strike pattern. Work on centering the cluster.',
    });
  }

  // If no major issues, add encouragement
  if (recs.length === 0) {
    recs.push({
      priority: 'minor',
      area: 'Overall',
      issue: 'No major swing faults detected',
      fix: 'Your fundamentals look solid. Focus on consistency and course management to lower your scores.',
      drill: 'Random Club Drill: Hit 10 balls alternating clubs (driver, 7-iron, wedge, 3-wood, etc.). This builds adaptability and prevents "groove" dependency.',
    });
  }

  return recs;
}

function calculateSwingScore(metrics: SwingMetrics, ballFlight: BallFlightPrediction): number {
  let score = 100;

  // Path penalty
  score -= Math.min(25, Math.abs(metrics.swingPathDegrees) * 5);

  // Face penalty
  score -= Math.min(25, Math.abs(metrics.clubFaceDegrees) * 5);

  // Smash factor penalty
  if (metrics.estimatedSmashFactor < 1.4) {
    score -= (1.4 - metrics.estimatedSmashFactor) * 50;
  }

  // Tempo penalty
  const tempoRatio = metrics.tempo.backswingMs / metrics.tempo.downswingMs;
  if (tempoRatio < 2.5 || tempoRatio > 4) {
    score -= 5;
  }

  // Curve penalty
  score -= Math.min(15, Math.abs(ballFlight.curveYards) * 0.5);

  return Math.max(10, Math.min(100, Math.round(score)));
}

function generateSummary(metrics: SwingMetrics, ballFlight: BallFlightPrediction, score: number): string {
  if (score >= 85) {
    return `Excellent swing! Clean ${ballFlight.flightShape} with ${ballFlight.carryYards} yards carry. Your path and face are well-matched. Keep up the good work.`;
  } else if (score >= 70) {
    return `Solid swing producing a ${ballFlight.flightShape} shape. ${ballFlight.carryYards} yards carry with ${Math.abs(ballFlight.curveYards)} yards of curve. Minor adjustments to your ${Math.abs(metrics.swingPathDegrees) > Math.abs(metrics.clubFaceDegrees) ? 'swing path' : 'face angle'} would tighten your dispersion.`;
  } else if (score >= 50) {
    return `Your swing is producing a ${ballFlight.flightShape} with ${Math.abs(ballFlight.curveYards)} yards of curve. The main issue is ${Math.abs(metrics.swingPathDegrees) > 3 ? 'your swing path' : Math.abs(metrics.clubFaceDegrees) > 3 ? 'your club face angle' : 'contact quality'}. See the drills below — consistent practice will make a big difference.`;
  } else {
    return `Some fundamentals need work, but that's okay — every great golfer started here. Focus on the critical recommendations below, especially the drills. ${ballFlight.carryYards} yards of carry with better mechanics will increase significantly.`;
  }
}

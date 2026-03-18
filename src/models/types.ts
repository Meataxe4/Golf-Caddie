// ============================================================================
// AI GOLF CADDIE — Core Type Definitions
// ============================================================================

// --- Geographic & Course Types ---

export interface GPSCoordinate {
  lat: number;
  lng: number;
  elevationMeters?: number;
}

export interface HoleLayout {
  holeNumber: number;
  par: number;
  handicapIndex: number;
  lengthYards: number;
  teePosition: GPSCoordinate;
  pinPosition: GPSCoordinate;
  fairwayCenter: GPSCoordinate[];
  hazards: Hazard[];
  greenContour: GreenContour;
  layupTargets: LayupTarget[];
  doglegDirection?: 'left' | 'right' | 'straight';
  doglegYards?: number;
}

export interface Hazard {
  id: string;
  type: 'water' | 'bunker' | 'ob' | 'trees' | 'fairway_bunker' | 'waste_area';
  boundary: GPSCoordinate[];
  centerPoint: GPSCoordinate;
  penaltyStrokes: number;
  recoveryDifficulty: number; // 0-1 scale
}

export interface GreenContour {
  frontEdge: GPSCoordinate;
  backEdge: GPSCoordinate;
  centerGreen: GPSCoordinate;
  slopeDirection: number; // degrees, 0 = front-to-back
  slopeSeverity: number; // 0-1 scale
  firmness: 'soft' | 'medium' | 'firm';
  speed: number; // stimpmeter reading
}

export interface LayupTarget {
  position: GPSCoordinate;
  distanceToGreen: number;
  safetyRating: number; // 0-1
  fairwayWidth: number; // yards
  description: string;
}

export interface CourseData {
  id: string;
  name: string;
  location: GPSCoordinate;
  holes: HoleLayout[];
  slopeRating: number;
  courseRating: number;
  altitudeEffect: number; // multiplier, e.g. 1.1 for Denver
}

// --- Weather Types ---

export interface WeatherConditions {
  windSpeedMph: number;
  windDirectionDeg: number; // 0=N, 90=E, 180=S, 270=W
  temperatureF: number;
  humidity: number; // 0-100
  altitudeFt: number;
  barometricPressure: number; // inHg
  precipitation: 'none' | 'light_rain' | 'heavy_rain' | 'mist';
  gustFactor?: number; // multiplier for gust peaks
}

// --- Player Types ---

export type Club =
  | 'driver' | '3_wood' | '5_wood' | '7_wood'
  | '2_hybrid' | '3_hybrid' | '4_hybrid' | '5_hybrid'
  | '3_iron' | '4_iron' | '5_iron' | '6_iron' | '7_iron' | '8_iron' | '9_iron'
  | 'pw' | 'gw' | 'sw' | 'lw'
  | 'putter';

export type LieCondition =
  | 'tee' | 'fairway' | 'light_rough' | 'heavy_rough'
  | 'fairway_bunker' | 'greenside_bunker' | 'hardpan'
  | 'divot' | 'pine_straw' | 'wet' | 'uphill' | 'downhill'
  | 'sidehill_above' | 'sidehill_below' | 'green';

export type ShotShape = 'straight' | 'fade' | 'draw' | 'high' | 'low' | 'punch' | 'flop';

export type MissTendency = 'left' | 'right' | 'short' | 'long' | 'thin' | 'fat';

export interface ClubProfile {
  club: Club;
  averageCarryYards: number;
  totalDistanceYards: number;
  standardDeviationYards: number; // distance consistency
  lateralDispersionYards: number; // left-right spread (1 SD)
  launchAngleDeg: number;
  spinRpm?: number;
  primaryMiss: MissTendency;
  secondaryMiss?: MissTendency;
  missLeftPct: number; // % of shots missing left
  missRightPct: number;
  missShortPct: number;
  missLongPct: number;
  confidenceLevel: number; // 0-1 based on sample size
  shotCount: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  handicap: number;
  clubs: ClubProfile[];
  preferredShotShape: ShotShape;
  strengthAreas: ('driving' | 'approach' | 'short_game' | 'putting')[];
  weaknessAreas: ('driving' | 'approach' | 'short_game' | 'putting')[];
  pressureAdjustment: number; // 0-1, how much performance degrades under pressure
  aggressionPreference: number; // 0-1, 0=conservative 1=aggressive
  roundHistory: RoundSummary[];
}

export interface ShotRecord {
  timestamp: Date;
  club: Club;
  lie: LieCondition;
  startPosition: GPSCoordinate;
  endPosition: GPSCoordinate;
  intendedTarget: GPSCoordinate;
  carryYards: number;
  totalYards: number;
  lateralMissYards: number; // + is right, - is left
  shotShape: ShotShape;
  result: 'great' | 'good' | 'acceptable' | 'poor' | 'penalty';
  weather?: WeatherConditions;
  holeNumber?: number;
  strokeNumber?: number;
}

// --- Decision / Recommendation Types ---

export type RiskLevel = 'safe' | 'moderate' | 'aggressive';

export interface ShotRecommendation {
  club: Club;
  targetPosition: GPSCoordinate;
  targetDescription: string;
  aimOffset: { yardsRight: number; yardsLong: number };
  suggestedShape: ShotShape;
  riskLevel: RiskLevel;
  expectedOutcome: ExpectedOutcome;
  reasoning: string[];
  alternativeShots: AlternativeShot[];
  confidenceScore: number; // 0-1
}

export interface ExpectedOutcome {
  expectedCarryYards: number;
  expectedTotalYards: number;
  landingZone: {
    center: GPSCoordinate;
    radiusYards: number; // 68% confidence
  };
  hitGreenProbability: number;
  avoidHazardProbability: number;
  expectedStrokesFromResult: number; // strokes gained baseline
  bestCasePct: number;
  worstCasePct: number;
}

export interface AlternativeShot {
  club: Club;
  strategy: string;
  riskLevel: RiskLevel;
  expectedStrokesGained: number;
  reasoning: string;
}

export interface HoleStrategy {
  holeNumber: number;
  par: number;
  overallApproach: 'attack' | 'manage' | 'conservative';
  targetScore: number;
  shots: ShotPlan[];
  keyInsight: string;
}

export interface ShotPlan {
  shotNumber: number;
  club: Club;
  target: string;
  reasoning: string;
  riskLevel: RiskLevel;
}

// --- Round & Analysis Types ---

export interface RoundSummary {
  date: Date;
  courseId: string;
  courseName: string;
  totalScore: number;
  scoreToPar: number;
  fairwaysHit: number;
  fairwayAttempts: number;
  greensInRegulation: number;
  totalPutts: number;
  penalties: number;
  holeScores: number[];
  strokesGained?: StrokesGainedBreakdown;
  shots: ShotRecord[];
}

export interface StrokesGainedBreakdown {
  total: number;
  offTee: number;
  approach: number;
  aroundGreen: number;
  putting: number;
  byHole: { hole: number; sg: number }[];
}

export interface PerformanceInsight {
  category: 'strength' | 'weakness' | 'trend' | 'pattern';
  area: string;
  description: string;
  actionableAdvice: string;
  priority: 'high' | 'medium' | 'low';
  dataPoints: number; // how many data points support this
}

// --- Risk Heatmap ---

export interface RiskHeatmapCell {
  position: GPSCoordinate;
  expectedStrokes: number;
  hazardProximity: number;
  riskScore: number; // 0-1
  color: string; // hex for visualization
}

export interface RiskHeatmap {
  holeNumber: number;
  cells: RiskHeatmapCell[];
  optimalPath: GPSCoordinate[];
  dangerZones: { center: GPSCoordinate; radiusYards: number; description: string }[];
}

// --- Pressure Mode ---

export interface PressureContext {
  matchPlayStatus?: 'up' | 'down' | 'even';
  holesRemaining: number;
  strokesBehind?: number;
  isClosingHoles: boolean;
  competitionLevel: 'casual' | 'club_comp' | 'tournament' | 'match_play';
  stressLevel: number; // 0-1 estimated from context
}

// --- Voice Caddie ---

export interface VoiceCaddieResponse {
  spokenText: string;
  detailedText: string;
  recommendation: ShotRecommendation;
  followUpPrompts: string[];
}

// ============================================================================
// Golf Ball Physics & Environmental Adjustments
// ============================================================================
// Real-world physics models for distance/trajectory adjustments based on
// weather, altitude, lie, and course conditions.

import type { WeatherConditions, LieCondition } from '../models/types';

/**
 * Calculate air density ratio vs standard conditions.
 * Standard: 59°F, 29.92 inHg, sea level, 0% humidity.
 * Lower density = ball flies farther.
 */
export function airDensityRatio(weather: WeatherConditions): number {
  const stdTempR = 518.67; // 59°F in Rankine
  const stdPressure = 29.92;

  const tempRankine = weather.temperatureF + 459.67;
  const pressureRatio = weather.barometricPressure / stdPressure;
  const tempRatio = stdTempR / tempRankine;

  // Humidity reduces air density (water vapor is lighter than N2/O2)
  const humidityFactor = 1 - 0.00378 * (weather.humidity / 100) *
    saturationVaporPressure(weather.temperatureF);

  return pressureRatio * tempRatio * humidityFactor;
}

function saturationVaporPressure(tempF: number): number {
  const tempC = (tempF - 32) * 5 / 9;
  // Magnus formula approximation
  return 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC)) / 29.92;
}

/**
 * Distance adjustment multiplier from weather conditions.
 * Returns a multiplier (e.g., 1.05 = 5% farther, 0.95 = 5% shorter).
 */
export function weatherDistanceMultiplier(weather: WeatherConditions): number {
  const density = airDensityRatio(weather);

  // Air density effect: ~2% distance change per 10% density change
  const densityEffect = 1 + (1 - density) * 0.2;

  // Altitude effect: ~2% per 1000ft above sea level (thinner air)
  const altitudeEffect = 1 + (weather.altitudeFt / 1000) * 0.02;

  // Temperature effect on ball compression: cold balls don't compress as well
  const tempEffect = weather.temperatureF < 50
    ? 1 - (50 - weather.temperatureF) * 0.002
    : 1;

  // Rain reduces carry
  const rainEffect = weather.precipitation === 'heavy_rain' ? 0.95
    : weather.precipitation === 'light_rain' ? 0.98
    : 1;

  return densityEffect * altitudeEffect * tempEffect * rainEffect;
}

/**
 * Calculate wind effect on distance and lateral displacement.
 * Uses the shot's direction vs wind direction to decompose into head/tail and crosswind.
 */
export function windEffect(
  shotDirectionDeg: number,
  weather: WeatherConditions,
  clubLaunchAngle: number,
): { distanceAdjustYards: number; lateralAdjustYards: number } {
  const windAngle = weather.windDirectionDeg;
  // Wind direction is where wind comes FROM; shot impact is the relative angle
  const relativeAngleDeg = ((windAngle - shotDirectionDeg + 180) % 360) - 180;
  const relativeAngleRad = (relativeAngleDeg * Math.PI) / 180;

  const headwindComponent = weather.windSpeedMph * Math.cos(relativeAngleRad);
  const crosswindComponent = weather.windSpeedMph * Math.sin(relativeAngleRad);

  // Higher launch = more wind effect
  const launchFactor = Math.sin((clubLaunchAngle * Math.PI) / 180);
  const windSensitivity = 0.4 + launchFactor * 0.8; // wedges affected more

  // Headwind hurts more than tailwind helps (asymmetric)
  const distanceAdjust = headwindComponent > 0
    ? -headwindComponent * windSensitivity * 1.5  // headwind: ~1.5 yards per mph
    : -headwindComponent * windSensitivity * 0.8; // tailwind: ~0.8 yards per mph

  // Crosswind lateral displacement
  const lateralAdjust = crosswindComponent * windSensitivity * 1.0; // ~1 yard per mph

  // Apply gust factor uncertainty
  const gustMultiplier = weather.gustFactor ?? 1.0;

  return {
    distanceAdjustYards: distanceAdjust * gustMultiplier,
    lateralAdjustYards: lateralAdjust * gustMultiplier,
  };
}

/**
 * Lie condition modifiers — affect distance, accuracy, and shot options.
 */
export function lieModifiers(lie: LieCondition): {
  distanceMultiplier: number;
  dispersionMultiplier: number;
  maxClubRestriction?: number; // max loft available (lower = more restricted)
  canShape: boolean;
} {
  switch (lie) {
    case 'tee':
      return { distanceMultiplier: 1.0, dispersionMultiplier: 0.9, canShape: true };
    case 'fairway':
      return { distanceMultiplier: 1.0, dispersionMultiplier: 1.0, canShape: true };
    case 'light_rough':
      return { distanceMultiplier: 0.95, dispersionMultiplier: 1.3, canShape: false };
    case 'heavy_rough':
      return { distanceMultiplier: 0.85, dispersionMultiplier: 1.8, maxClubRestriction: 7, canShape: false };
    case 'fairway_bunker':
      return { distanceMultiplier: 0.90, dispersionMultiplier: 1.5, canShape: false };
    case 'greenside_bunker':
      return { distanceMultiplier: 0.60, dispersionMultiplier: 2.0, canShape: false };
    case 'hardpan':
      return { distanceMultiplier: 0.95, dispersionMultiplier: 1.4, canShape: false };
    case 'divot':
      return { distanceMultiplier: 0.90, dispersionMultiplier: 1.6, canShape: false };
    case 'pine_straw':
      return { distanceMultiplier: 0.92, dispersionMultiplier: 1.4, canShape: false };
    case 'wet':
      return { distanceMultiplier: 0.93, dispersionMultiplier: 1.2, canShape: true };
    case 'uphill':
      return { distanceMultiplier: 0.93, dispersionMultiplier: 1.1, canShape: true };
    case 'downhill':
      return { distanceMultiplier: 1.07, dispersionMultiplier: 1.2, canShape: true };
    case 'sidehill_above':
      return { distanceMultiplier: 0.97, dispersionMultiplier: 1.3, canShape: false };
    case 'sidehill_below':
      return { distanceMultiplier: 0.97, dispersionMultiplier: 1.3, canShape: false };
    case 'green':
      return { distanceMultiplier: 1.0, dispersionMultiplier: 1.0, canShape: false };
    default:
      return { distanceMultiplier: 1.0, dispersionMultiplier: 1.0, canShape: true };
  }
}

/**
 * Calculate elevation-adjusted distance.
 * Rule of thumb: +/- 1 yard per foot of elevation change for mid irons.
 * Adjust scaling by club type.
 */
export function elevationAdjustedDistance(
  flatDistance: number,
  elevationChangeFt: number,
  clubLaunchAngle: number,
): number {
  // Higher launch angles are more affected by elevation
  const sensitivity = 0.5 + (clubLaunchAngle / 45) * 0.5;
  const adjustment = elevationChangeFt * sensitivity;
  return flatDistance + adjustment;
}

/**
 * Calculate the bearing (direction) between two GPS coordinates.
 */
export function bearingBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Distance between two GPS coordinates in yards.
 */
export function distanceYards(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;
  return meters * 1.09361;
}

// ============================================================================
// Distance Unit Utilities — Internal unit is METERS
// ============================================================================

export type DistanceUnit = 'yards' | 'meters';

const METERS_TO_YARDS = 1.09361;

export function convertDistance(meters: number, unit: DistanceUnit): number {
  if (unit === 'yards') return Math.round(meters * METERS_TO_YARDS);
  return Math.round(meters);
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  const value = convertDistance(meters, unit);
  return `${value}`;
}

export function distanceLabel(unit: DistanceUnit): string {
  return unit === 'meters' ? 'm' : 'yds';
}

export function distanceAbbrev(unit: DistanceUnit): string {
  return unit === 'meters' ? 'm' : 'y';
}

export function loadUnitPreference(): DistanceUnit {
  try {
    const saved = localStorage.getItem('golf-caddie-units');
    if (saved === 'meters' || saved === 'yards') return saved;
  } catch { /* ignore */ }
  return 'meters';
}

export function saveUnitPreference(unit: DistanceUnit): void {
  try {
    localStorage.setItem('golf-caddie-units', unit);
  } catch { /* ignore */ }
}

// ============================================================================
// Distance Unit Utilities
// ============================================================================

export type DistanceUnit = 'yards' | 'meters';

const YARDS_TO_METERS = 0.9144;

export function convertDistance(yards: number, unit: DistanceUnit): number {
  if (unit === 'meters') return Math.round(yards * YARDS_TO_METERS);
  return yards;
}

export function formatDistance(yards: number, unit: DistanceUnit): string {
  const value = convertDistance(yards, unit);
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
  return 'yards';
}

export function saveUnitPreference(unit: DistanceUnit): void {
  try {
    localStorage.setItem('golf-caddie-units', unit);
  } catch { /* ignore */ }
}

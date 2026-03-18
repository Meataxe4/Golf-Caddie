import React from 'react';
import type { HoleLayout } from '../models/types';

interface Props {
  hole: HoleLayout;
  currentHole: number;
}

export function HoleInfo({ hole, currentHole }: Props) {
  const hazardIcons: Record<string, string> = {
    water: '💧',
    bunker: '🏖️',
    ob: '🚫',
    trees: '🌲',
    fairway_bunker: '⚠️',
    waste_area: '🏜️',
  };

  return (
    <div style={styles.container}>
      <div style={styles.topRow}>
        <div>
          <div style={styles.holeNumber}>Hole {currentHole}</div>
          <div style={styles.holeDetails}>
            Par {hole.par} · {hole.lengthYards} yards · HCP {hole.handicapIndex}
          </div>
        </div>
        <div style={styles.parBadge}>
          PAR {hole.par}
        </div>
      </div>

      {hole.hazards.length > 0 && (
        <div style={styles.hazardRow}>
          {hole.hazards.map((h, i) => (
            <span key={i} style={styles.hazardChip}>
              {hazardIcons[h.type] ?? '⚠️'} {h.type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {hole.doglegDirection && hole.doglegDirection !== 'straight' && (
        <div style={styles.doglegInfo}>
          {hole.doglegDirection === 'left' ? '↩️' : '↪️'} Dogleg {hole.doglegDirection} at ~{hole.doglegYards} yards
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1e293b',
    borderRadius: 12,
    padding: '16px',
    marginBottom: 16,
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  holeNumber: {
    fontSize: 22,
    fontWeight: 800,
    color: '#f1f5f9',
  },
  holeDetails: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  parBadge: {
    padding: '6px 14px',
    borderRadius: 8,
    background: '#22c55e',
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 800,
  },
  hazardRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 12,
  },
  hazardChip: {
    padding: '3px 8px',
    borderRadius: 6,
    background: '#0f172a',
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: 600,
  },
  doglegInfo: {
    marginTop: 10,
    fontSize: 12,
    color: '#94a3b8',
  },
};

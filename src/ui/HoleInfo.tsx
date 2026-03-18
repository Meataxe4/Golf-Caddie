import React from 'react';
import type { HoleLayout } from '../models/types';

interface Props {
  hole: HoleLayout;
  currentHole: number;
}

export function HoleInfo({ hole, currentHole }: Props) {
  const hazardIcons: Record<string, { icon: string; color: string }> = {
    water: { icon: '~', color: '#3b82f6' },
    bunker: { icon: 'B', color: '#d4a644' },
    ob: { icon: '!', color: '#ef4444' },
    trees: { icon: 'T', color: '#22c55e' },
    fairway_bunker: { icon: 'FB', color: '#f59e0b' },
    waste_area: { icon: 'W', color: '#78716c' },
  };

  const hazardTypes = [...new Set(hole.hazards.map(h => h.type))];

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.leftSection}>
          <div style={styles.holeNumber}>{currentHole}</div>
          <div style={styles.holeMeta}>
            <div style={styles.holeTitle}>Hole {currentHole}</div>
            <div style={styles.holeStats}>
              {hole.lengthYards} yds
              <span style={styles.dot}> &middot; </span>
              HCP {hole.handicapIndex}
            </div>
          </div>
        </div>

        <div style={styles.rightSection}>
          <div style={styles.parBadge}>
            <div style={styles.parValue}>{hole.par}</div>
            <div style={styles.parText}>PAR</div>
          </div>
        </div>
      </div>

      {/* Hazard + Dogleg row */}
      {(hazardTypes.length > 0 || (hole.doglegDirection && hole.doglegDirection !== 'straight')) && (
        <div style={styles.infoRow}>
          {hazardTypes.length > 0 && (
            <div style={styles.hazardRow}>
              {hazardTypes.map((type) => {
                const info = hazardIcons[type] ?? { icon: '?', color: '#8faa97' };
                const count = hole.hazards.filter(h => h.type === type).length;
                return (
                  <span key={type} style={{ ...styles.hazardChip, borderColor: `${info.color}40`, color: info.color }}>
                    {type.replace(/_/g, ' ')}{count > 1 ? ` x${count}` : ''}
                  </span>
                );
              })}
            </div>
          )}
          {hole.doglegDirection && hole.doglegDirection !== 'straight' && (
            <span style={styles.doglegChip}>
              {hole.doglegDirection === 'left' ? '◄' : '►'} Dogleg {hole.doglegDirection} ~{hole.doglegYards}y
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    border: '1px solid #1e4d2b',
  },
  content: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  holeNumber: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #0d1f17 0%, #132e1f 100%)',
    border: '2px solid #1e4d2b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 900,
    color: '#f1f5f9',
  },
  holeMeta: {},
  holeTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  holeStats: {
    fontSize: 12,
    color: '#8faa97',
    marginTop: 2,
  },
  dot: {
    color: '#1e4d2b',
  },
  rightSection: {},
  parBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parValue: {
    fontSize: 20,
    fontWeight: 900,
    color: '#0d1f17',
    lineHeight: 1,
  },
  parText: {
    fontSize: 8,
    fontWeight: 700,
    color: '#0d1f17',
    letterSpacing: 1,
    opacity: 0.7,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px 12px',
    flexWrap: 'wrap' as const,
  },
  hazardRow: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap' as const,
  },
  hazardChip: {
    padding: '3px 8px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
  },
  doglegChip: {
    padding: '3px 8px',
    borderRadius: 6,
    background: '#f59e0b15',
    border: '1px solid #f59e0b30',
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 600,
  },
};

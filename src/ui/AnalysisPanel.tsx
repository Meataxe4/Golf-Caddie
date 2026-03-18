import React from 'react';
import type { PlayerProfile } from '../models/types';

interface Props {
  player: PlayerProfile;
}

export function AnalysisPanel({ player }: Props) {
  // Show player profile stats and club distances
  const sortedClubs = [...player.clubs].sort((a, b) => b.averageCarryYards - a.averageCarryYards);

  return (
    <div>
      <h2 style={styles.title}>Player Profile</h2>
      <p style={styles.subtitle}>{player.name} · Handicap {player.handicap}</p>

      {/* Club Distances */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Club Distances</div>
        <div style={styles.clubTable}>
          <div style={styles.clubHeader}>
            <span style={styles.clubCol}>Club</span>
            <span style={styles.distCol}>Carry</span>
            <span style={styles.distCol}>Total</span>
            <span style={styles.distCol}>SD</span>
            <span style={styles.distCol}>Miss</span>
          </div>
          {sortedClubs.map(c => (
            <div key={c.club} style={styles.clubRow}>
              <span style={styles.clubCol}>{clubLabel(c.club)}</span>
              <span style={styles.distCol}>{c.averageCarryYards}</span>
              <span style={styles.distCol}>{c.totalDistanceYards}</span>
              <span style={styles.distCol}>±{c.standardDeviationYards}</span>
              <span style={{ ...styles.distCol, color: missColor(c.primaryMiss) }}>
                {c.primaryMiss}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Game Assessment</div>
        <div style={styles.assessmentGrid}>
          <div style={styles.assessCard}>
            <div style={styles.assessLabel}>Strengths</div>
            {player.strengthAreas.map(s => (
              <div key={s} style={styles.strengthItem}>✓ {formatArea(s)}</div>
            ))}
          </div>
          <div style={styles.assessCard}>
            <div style={styles.assessLabel}>Weaknesses</div>
            {player.weaknessAreas.map(w => (
              <div key={w} style={styles.weaknessItem}>✗ {formatArea(w)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Player Tendencies */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Tendencies</div>
        <div style={styles.tendencyGrid}>
          <TendencyBar label="Aggression" value={player.aggressionPreference} />
          <TendencyBar label="Pressure Sensitivity" value={player.pressureAdjustment} />
        </div>
        <div style={styles.shotShape}>
          Preferred shot shape: <strong>{player.preferredShotShape}</strong>
        </div>
      </div>

      {/* Post-Round Placeholder */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Post-Round Analysis</div>
        <div style={styles.placeholder}>
          Complete a round to see your strokes gained breakdown, miss patterns,
          scoring trends, and personalized improvement recommendations.
        </div>
      </div>
    </div>
  );
}

function TendencyBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{Math.round(value * 100)}%</span>
      </div>
      <div style={{ height: 6, background: '#0f172a', borderRadius: 3 }}>
        <div style={{
          height: '100%',
          width: `${value * 100}%`,
          background: value > 0.6 ? '#ef4444' : value > 0.3 ? '#eab308' : '#22c55e',
          borderRadius: 3,
        }} />
      </div>
    </div>
  );
}

function clubLabel(club: string): string {
  const labels: Record<string, string> = {
    driver: 'Driver', '3_wood': '3 Wood', '5_wood': '5 Wood',
    '5_hybrid': '5 Hybrid', '6_iron': '6 Iron', '7_iron': '7 Iron',
    '8_iron': '8 Iron', '9_iron': '9 Iron', pw: 'PW', gw: 'GW',
    sw: 'SW', lw: 'LW',
  };
  return labels[club] ?? club.replace(/_/g, ' ');
}

function missColor(miss: string): string {
  if (miss === 'left' || miss === 'right') return '#f59e0b';
  if (miss === 'short') return '#ef4444';
  return '#94a3b8';
}

function formatArea(area: string): string {
  return area.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#22c55e',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  clubTable: {
    background: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  clubHeader: {
    display: 'flex',
    padding: '10px 14px',
    background: '#0f172a',
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  clubRow: {
    display: 'flex',
    padding: '10px 14px',
    borderBottom: '1px solid #0f172a',
    fontSize: 13,
    color: '#e2e8f0',
  },
  clubCol: { flex: 2, fontWeight: 600 },
  distCol: { flex: 1, textAlign: 'center' as const },
  assessmentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  assessCard: {
    background: '#1e293b',
    borderRadius: 10,
    padding: 14,
  },
  assessLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#94a3b8',
    marginBottom: 8,
  },
  strengthItem: { fontSize: 13, color: '#22c55e', marginBottom: 4 },
  weaknessItem: { fontSize: 13, color: '#ef4444', marginBottom: 4 },
  tendencyGrid: {
    background: '#1e293b',
    borderRadius: 10,
    padding: 14,
  },
  shotShape: {
    marginTop: 12,
    fontSize: 13,
    color: '#94a3b8',
  },
  placeholder: {
    background: '#1e293b',
    borderRadius: 10,
    padding: 20,
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#64748b',
    lineHeight: '1.6',
  },
};

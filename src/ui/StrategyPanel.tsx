import React, { useState } from 'react';
import type { HoleStrategy } from '../models/types';

interface Props {
  strategies: HoleStrategy[];
  currentHole: number;
}

const CLUB_DISPLAY: Record<string, string> = {
  driver: 'Driver', '3_wood': '3W', '5_wood': '5W', '7_wood': '7W',
  '2_hybrid': '2H', '3_hybrid': '3H', '4_hybrid': '4H', '5_hybrid': '5H',
  '3_iron': '3i', '4_iron': '4i', '5_iron': '5i', '6_iron': '6i',
  '7_iron': '7i', '8_iron': '8i', '9_iron': '9i',
  pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
};

export function StrategyPanel({ strategies, currentHole }: Props) {
  const [selectedHole, setSelectedHole] = useState(currentHole);

  return (
    <div>
      <h2 style={styles.title}>Course Strategy</h2>
      <p style={styles.subtitle}>Hole-by-hole game plan based on your abilities and conditions</p>

      {/* Hole Selector */}
      <div style={styles.holeGrid}>
        {strategies.map((s) => (
          <button
            key={s.holeNumber}
            onClick={() => setSelectedHole(s.holeNumber)}
            style={{
              ...styles.holeBtn,
              ...(selectedHole === s.holeNumber ? styles.holeBtnActive : {}),
              ...(s.overallApproach === 'attack' ? { borderColor: '#22c55e' } :
                s.overallApproach === 'conservative' ? { borderColor: '#ef4444' } :
                { borderColor: '#eab308' }),
            }}
          >
            {s.holeNumber}
          </button>
        ))}
      </div>

      {/* Selected Hole Strategy */}
      {strategies[selectedHole - 1] && (
        <HoleStrategyCard strategy={strategies[selectedHole - 1]} />
      )}
    </div>
  );
}

function HoleStrategyCard({ strategy }: { strategy: HoleStrategy }) {
  const approachColor = strategy.overallApproach === 'attack' ? '#22c55e'
    : strategy.overallApproach === 'conservative' ? '#ef4444'
    : '#eab308';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.cardHole}>Hole {strategy.holeNumber}</div>
          <div style={styles.cardPar}>Par {strategy.par} · Target: {strategy.targetScore}</div>
        </div>
        <div style={{ ...styles.approachBadge, background: approachColor }}>
          {strategy.overallApproach.toUpperCase()}
        </div>
      </div>

      <div style={styles.keyInsight}>
        💡 {strategy.keyInsight}
      </div>

      <div style={styles.shotPlan}>
        {strategy.shots.map((shot) => (
          <div key={shot.shotNumber} style={styles.shotStep}>
            <div style={styles.shotNumber}>{shot.shotNumber}</div>
            <div style={styles.shotContent}>
              <div style={styles.shotClub}>
                {CLUB_DISPLAY[shot.club] ?? shot.club} → {shot.target}
              </div>
              <div style={styles.shotReasoning}>{shot.reasoning}</div>
              <span style={{
                ...styles.riskTag,
                background: shot.riskLevel === 'safe' ? '#22c55e20' : shot.riskLevel === 'aggressive' ? '#ef444420' : '#eab30820',
                color: shot.riskLevel === 'safe' ? '#22c55e' : shot.riskLevel === 'aggressive' ? '#ef4444' : '#eab308',
              }}>
                {shot.riskLevel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: '#f1f5f9',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 20,
  },
  holeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(9, 1fr)',
    gap: 6,
    marginBottom: 20,
  },
  holeBtn: {
    padding: '8px 0',
    borderRadius: 8,
    border: '2px solid #334155',
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  holeBtnActive: {
    background: '#1e293b',
    color: '#f1f5f9',
    borderWidth: 2,
  },
  card: {
    background: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px',
  },
  cardHole: { fontSize: 18, fontWeight: 800, color: '#f1f5f9' },
  cardPar: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  approachBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
  },
  keyInsight: {
    padding: '12px 16px',
    background: '#0f172a',
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: '1.5',
  },
  shotPlan: {
    padding: '16px',
  },
  shotStep: {
    display: 'flex',
    gap: 12,
    marginBottom: 14,
  },
  shotNumber: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#334155',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  shotContent: { flex: 1 },
  shotClub: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f1f5f9',
    marginBottom: 4,
  },
  shotReasoning: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: '1.5',
    marginBottom: 6,
  },
  riskTag: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
  },
};

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

  const totalPar = strategies.reduce((s, h) => s + h.par, 0);
  const totalTarget = strategies.reduce((s, h) => s + h.targetScore, 0);
  const targetDiff = totalTarget - totalPar;

  return (
    <div>
      <div style={styles.headerSection}>
        <div>
          <h2 style={styles.title}>Course Strategy</h2>
          <p style={styles.subtitle}>Hole-by-hole game plan based on your abilities</p>
        </div>
        <div style={styles.targetBadge}>
          <div style={styles.targetValue}>
            {targetDiff === 0 ? 'E' : targetDiff > 0 ? `+${targetDiff}` : targetDiff}
          </div>
          <div style={styles.targetLabel}>TARGET</div>
        </div>
      </div>

      {/* Hole Grid */}
      <div style={styles.holeGrid}>
        {strategies.map((s) => {
          const isActive = selectedHole === s.holeNumber;
          const approachColor = s.overallApproach === 'attack' ? '#3b82f6'
            : s.overallApproach === 'conservative' ? '#22c55e'
            : '#eab308';

          return (
            <button
              key={s.holeNumber}
              onClick={() => setSelectedHole(s.holeNumber)}
              style={{
                ...styles.holeBtn,
                ...(isActive ? styles.holeBtnActive : {}),
                borderBottomColor: approachColor,
              }}
            >
              <span style={{
                ...styles.holeBtnNum,
                ...(isActive ? styles.holeBtnNumActive : {}),
              }}>
                {s.holeNumber}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#3b82f6' }} /> Attack</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#eab308' }} /> Manage</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#22c55e' }} /> Conservative</span>
      </div>

      {/* Selected Hole Strategy */}
      {strategies[selectedHole - 1] && (
        <HoleStrategyCard strategy={strategies[selectedHole - 1]} />
      )}
    </div>
  );
}

function HoleStrategyCard({ strategy }: { strategy: HoleStrategy }) {
  const approachColor = strategy.overallApproach === 'attack' ? '#3b82f6'
    : strategy.overallApproach === 'conservative' ? '#22c55e'
    : '#eab308';

  const targetDiff = strategy.targetScore - strategy.par;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardHeaderLeft}>
          <div style={styles.cardHoleNum}>{strategy.holeNumber}</div>
          <div>
            <div style={styles.cardHole}>Hole {strategy.holeNumber}</div>
            <div style={styles.cardPar}>
              Par {strategy.par}
              <span style={{
                marginLeft: 8,
                color: targetDiff <= 0 ? '#22c55e' : '#f59e0b',
                fontWeight: 700,
              }}>
                Target: {strategy.targetScore}
              </span>
            </div>
          </div>
        </div>
        <div style={{ ...styles.approachBadge, background: `${approachColor}20`, color: approachColor, borderColor: `${approachColor}40` }}>
          {strategy.overallApproach.toUpperCase()}
        </div>
      </div>

      <div style={styles.keyInsight}>
        <span style={styles.insightLabel}>KEY INSIGHT</span>
        <p style={styles.insightText}>{strategy.keyInsight}</p>
      </div>

      <div style={styles.shotPlan}>
        <div style={styles.shotPlanLabel}>SHOT PLAN</div>
        {strategy.shots.map((shot, i) => {
          const riskColor = shot.riskLevel === 'safe' ? '#22c55e'
            : shot.riskLevel === 'aggressive' ? '#ef4444'
            : '#eab308';
          const isLast = i === strategy.shots.length - 1;

          return (
            <div key={shot.shotNumber} style={styles.shotStep}>
              <div style={styles.shotTimeline}>
                <div style={{ ...styles.shotDot, background: riskColor }} />
                {!isLast && <div style={styles.shotLine} />}
              </div>
              <div style={styles.shotContent}>
                <div style={styles.shotHeader}>
                  <span style={styles.shotClub}>
                    {CLUB_DISPLAY[shot.club] ?? shot.club}
                  </span>
                  <span style={styles.shotTarget}>{shot.target}</span>
                </div>
                <div style={styles.shotReasoning}>{shot.reasoning}</div>
                <span style={{
                  ...styles.riskTag,
                  background: `${riskColor}15`,
                  color: riskColor,
                  borderColor: `${riskColor}30`,
                }}>
                  {shot.riskLevel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    color: '#f1f5f9',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#5a7a65',
    margin: 0,
  },
  targetBadge: {
    textAlign: 'center' as const,
    padding: '8px 14px',
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 12,
    border: '1px solid #1e4d2b',
  },
  targetValue: {
    fontSize: 18,
    fontWeight: 900,
    color: '#22c55e',
  },
  targetLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: '#5a7a65',
    letterSpacing: 1,
  },
  holeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(9, 1fr)',
    gap: 4,
    marginBottom: 12,
  },
  holeBtn: {
    padding: '8px 0',
    borderRadius: 8,
    border: 'none',
    borderBottom: '3px solid',
    background: '#0d1f17',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s',
  },
  holeBtnActive: {
    background: '#132e1f',
  },
  holeBtnNum: {
    fontSize: 12,
    fontWeight: 700,
    color: '#5a7a65',
  },
  holeBtnNumActive: {
    color: '#f1f5f9',
  },
  legend: {
    display: 'flex',
    gap: 14,
    justifyContent: 'center',
    marginBottom: 16,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: '#5a7a65',
  },
  legendDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  card: {
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid #1e4d2b',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  cardHoleNum: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#0d1f17',
    border: '1.5px solid #1e4d2b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 900,
    color: '#f1f5f9',
  },
  cardHole: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  cardPar: { fontSize: 12, color: '#8faa97', marginTop: 2 },
  approachBadge: {
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.8,
    border: '1px solid',
  },
  keyInsight: {
    padding: '14px 16px',
    background: '#0d1f17',
    borderTop: '1px solid #132e1f',
    borderBottom: '1px solid #132e1f',
  },
  insightLabel: {
    fontSize: 8,
    fontWeight: 800,
    color: '#f59e0b',
    letterSpacing: 1.5,
    display: 'block',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    color: '#c5d8c5',
    lineHeight: '1.5',
    margin: 0,
  },
  shotPlan: {
    padding: '16px',
  },
  shotPlanLabel: {
    fontSize: 8,
    fontWeight: 800,
    color: '#22c55e',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  shotStep: {
    display: 'flex',
    gap: 12,
    marginBottom: 4,
  },
  shotTimeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: 16,
    flexShrink: 0,
  },
  shotDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  shotLine: {
    width: 2,
    flex: 1,
    background: '#1e4d2b',
    marginTop: 2,
    marginBottom: 2,
  },
  shotContent: {
    flex: 1,
    paddingBottom: 14,
  },
  shotHeader: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  shotClub: {
    fontSize: 14,
    fontWeight: 800,
    color: '#f1f5f9',
  },
  shotTarget: {
    fontSize: 12,
    color: '#8faa97',
  },
  shotReasoning: {
    fontSize: 12,
    color: '#8faa97',
    lineHeight: '1.5',
    marginBottom: 6,
  },
  riskTag: {
    padding: '2px 8px',
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    border: '1px solid',
  },
};

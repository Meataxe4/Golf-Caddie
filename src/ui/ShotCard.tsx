import React, { useState } from 'react';
import type { ShotRecommendation } from '../models/types';

interface Props {
  recommendation: ShotRecommendation;
  voiceText: string;
}

const CLUB_DISPLAY: Record<string, string> = {
  driver: 'Driver', '3_wood': '3W', '5_wood': '5W', '7_wood': '7W',
  '2_hybrid': '2H', '3_hybrid': '3H', '4_hybrid': '4H', '5_hybrid': '5H',
  '3_iron': '3i', '4_iron': '4i', '5_iron': '5i', '6_iron': '6i',
  '7_iron': '7i', '8_iron': '8i', '9_iron': '9i',
  pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter',
};

export function ShotCard({ recommendation: rec, voiceText }: Props) {
  const [expanded, setExpanded] = useState(false);

  const riskColor = rec.riskLevel === 'safe' ? '#22c55e'
    : rec.riskLevel === 'moderate' ? '#eab308'
    : '#ef4444';

  const riskLabel = rec.riskLevel === 'safe' ? 'SAFE PLAY'
    : rec.riskLevel === 'moderate' ? 'MODERATE'
    : 'AGGRESSIVE';

  return (
    <div style={styles.card}>
      {/* Voice Summary */}
      <div style={styles.voiceBanner}>
        <span style={styles.voiceIcon}>🎙️</span>
        <span style={styles.voiceText}>{voiceText}</span>
      </div>

      {/* Main Recommendation */}
      <div style={styles.mainRec}>
        <div style={styles.clubBadge}>
          {CLUB_DISPLAY[rec.club] ?? rec.club}
        </div>
        <div style={styles.recDetails}>
          <div style={styles.targetText}>{rec.targetDescription}</div>
          <div style={styles.metaRow}>
            <span style={{ ...styles.riskBadge, background: riskColor }}>
              {riskLabel}
            </span>
            {rec.suggestedShape !== 'straight' && (
              <span style={styles.shapeBadge}>
                {rec.suggestedShape.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statValue}>{rec.expectedOutcome.expectedCarryYards}</div>
          <div style={styles.statLabel}>Carry (yds)</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>{Math.round(rec.expectedOutcome.hitGreenProbability * 100)}%</div>
          <div style={styles.statLabel}>Green Hit</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>{Math.round(rec.expectedOutcome.avoidHazardProbability * 100)}%</div>
          <div style={styles.statLabel}>Avoid Hazard</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>{rec.expectedOutcome.expectedStrokesFromResult}</div>
          <div style={styles.statLabel}>Exp. Strokes</div>
        </div>
      </div>

      {/* Expand/Collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.expandBtn}
      >
        {expanded ? 'Less detail ▲' : 'More detail ▼'}
      </button>

      {expanded && (
        <div style={styles.expandedSection}>
          {/* Reasoning */}
          <div style={styles.sectionTitle}>Why this shot?</div>
          {rec.reasoning.map((r, i) => (
            <div key={i} style={styles.reasonItem}>• {r}</div>
          ))}

          {/* Alternatives */}
          {rec.alternativeShots.length > 0 && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 16 }}>Alternatives</div>
              {rec.alternativeShots.map((alt, i) => (
                <div key={i} style={styles.altCard}>
                  <div style={styles.altClub}>{CLUB_DISPLAY[alt.club] ?? alt.club}</div>
                  <div style={styles.altDetails}>
                    <div style={styles.altStrategy}>{alt.strategy}</div>
                    <div style={styles.altSg}>
                      {alt.expectedStrokesGained >= 0 ? '+' : ''}{alt.expectedStrokesGained} strokes
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Dispersion */}
          <div style={{ ...styles.sectionTitle, marginTop: 16 }}>Landing Zone</div>
          <div style={styles.dispersionInfo}>
            68% of your shots will land within {rec.expectedOutcome.landingZone.radiusYards} yards
            of the target. Best case: {rec.expectedOutcome.bestCasePct}% | Worst case: {rec.expectedOutcome.worstCasePct}%
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  voiceBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '12px 16px',
    background: '#0f172a',
    borderBottom: '1px solid #334155',
  },
  voiceIcon: { fontSize: 16, flexShrink: 0, marginTop: 2 },
  voiceText: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: '1.5',
    fontStyle: 'italic',
  },
  mainRec: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '20px 16px',
  },
  clubBadge: {
    width: 64,
    height: 64,
    borderRadius: 12,
    background: '#22c55e',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 800,
    flexShrink: 0,
  },
  recDetails: { flex: 1 },
  targetText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#f1f5f9',
    marginBottom: 8,
  },
  metaRow: { display: 'flex', gap: 8, alignItems: 'center' },
  riskBadge: {
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  shapeBadge: {
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    background: '#3b82f6',
    color: 'white',
    letterSpacing: 0.5,
  },
  statsRow: {
    display: 'flex',
    borderTop: '1px solid #334155',
    borderBottom: '1px solid #334155',
  },
  stat: {
    flex: 1,
    padding: '12px 8px',
    textAlign: 'center' as const,
    borderRight: '1px solid #334155',
  },
  statValue: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase' as const },
  expandBtn: {
    width: '100%',
    padding: '10px',
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  expandedSection: {
    padding: '0 16px 16px',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#22c55e',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  reasonItem: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: '1.6',
    marginBottom: 4,
  },
  altCard: {
    display: 'flex',
    gap: 12,
    padding: '10px 12px',
    background: '#0f172a',
    borderRadius: 8,
    marginBottom: 6,
  },
  altClub: {
    fontSize: 14,
    fontWeight: 700,
    color: '#94a3b8',
    minWidth: 40,
  },
  altDetails: { flex: 1 },
  altStrategy: { fontSize: 13, color: '#cbd5e1' },
  altSg: { fontSize: 11, color: '#64748b', marginTop: 2 },
  dispersionInfo: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: '1.5',
  },
};

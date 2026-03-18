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

  const riskLabel = rec.riskLevel === 'safe' ? 'SAFE'
    : rec.riskLevel === 'moderate' ? 'MODERATE'
    : 'AGGRESSIVE';

  const confPct = Math.round(rec.confidenceScore * 100);

  return (
    <div style={styles.card}>
      {/* Caddie advice */}
      <div style={styles.voiceBanner}>
        <div style={styles.voiceHeader}>
          <span style={styles.voiceLabel}>CADDIE</span>
          <span style={styles.confBadge}>{confPct}% confidence</span>
        </div>
        <p style={styles.voiceText}>{voiceText}</p>
      </div>

      {/* Main Recommendation */}
      <div style={styles.mainRec}>
        <div style={styles.clubSection}>
          <div style={styles.clubBadge}>
            {CLUB_DISPLAY[rec.club] ?? rec.club}
          </div>
          <div style={{ ...styles.riskDot, background: riskColor }} />
        </div>
        <div style={styles.recDetails}>
          <div style={styles.targetText}>{rec.targetDescription}</div>
          <div style={styles.metaRow}>
            <span style={{ ...styles.riskBadge, background: `${riskColor}20`, color: riskColor, borderColor: `${riskColor}40` }}>
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

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <StatCell label="CARRY" value={`${rec.expectedOutcome.expectedCarryYards}`} unit="yds" />
        <StatCell
          label="GREEN HIT"
          value={`${Math.round(rec.expectedOutcome.hitGreenProbability * 100)}`}
          unit="%"
          color={rec.expectedOutcome.hitGreenProbability > 0.6 ? '#22c55e' : rec.expectedOutcome.hitGreenProbability > 0.3 ? '#eab308' : '#ef4444'}
        />
        <StatCell
          label="AVOID HAZ"
          value={`${Math.round(rec.expectedOutcome.avoidHazardProbability * 100)}`}
          unit="%"
          color={rec.expectedOutcome.avoidHazardProbability > 0.8 ? '#22c55e' : '#eab308'}
        />
        <StatCell label="EXP STRK" value={`${rec.expectedOutcome.expectedStrokesFromResult}`} />
      </div>

      {/* Expand toggle */}
      <button onClick={() => setExpanded(!expanded)} style={styles.expandBtn}>
        <span style={styles.expandText}>{expanded ? 'Less detail' : 'More detail'}</span>
        <span style={{ ...styles.expandArrow, transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
          &#9660;
        </span>
      </button>

      {expanded && (
        <div style={styles.expandedSection}>
          {/* Reasoning */}
          <div style={styles.sectionHeader}>WHY THIS SHOT</div>
          <div style={styles.reasoningList}>
            {rec.reasoning.map((r, i) => (
              <div key={i} style={styles.reasonItem}>
                <span style={styles.reasonBullet} />
                <span>{r}</span>
              </div>
            ))}
          </div>

          {/* Alternatives */}
          {rec.alternativeShots.length > 0 && (
            <>
              <div style={{ ...styles.sectionHeader, marginTop: 16 }}>ALTERNATIVES</div>
              {rec.alternativeShots.map((alt, i) => {
                const altRiskColor = alt.riskLevel === 'safe' ? '#22c55e'
                  : alt.riskLevel === 'aggressive' ? '#ef4444' : '#eab308';
                return (
                  <div key={i} style={styles.altCard}>
                    <div style={styles.altClub}>{CLUB_DISPLAY[alt.club] ?? alt.club}</div>
                    <div style={styles.altDetails}>
                      <div style={styles.altStrategy}>{alt.strategy}</div>
                      <div style={styles.altMeta}>
                        <span style={{ ...styles.altRisk, color: altRiskColor }}>
                          {alt.riskLevel}
                        </span>
                        <span style={styles.altSg}>
                          {alt.expectedStrokesGained >= 0 ? '+' : ''}{alt.expectedStrokesGained} strokes
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Dispersion */}
          <div style={{ ...styles.sectionHeader, marginTop: 16 }}>LANDING ZONE</div>
          <div style={styles.dispersion}>
            <div style={styles.dispersionBar}>
              <div style={{ ...styles.dispersionFill, width: `${Math.min(100, rec.expectedOutcome.bestCasePct)}%` }} />
            </div>
            <div style={styles.dispersionText}>
              68% of shots land within <strong>{rec.expectedOutcome.landingZone.radiusYards} yards</strong> of target
            </div>
            <div style={styles.dispersionStats}>
              <span>Best: {rec.expectedOutcome.bestCasePct}%</span>
              <span>Worst: {rec.expectedOutcome.worstCasePct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={styles.statCell}>
      <div style={{ ...styles.statValue, color: color ?? '#f1f5f9' }}>
        {value}
        {unit && <span style={styles.statUnit}>{unit}</span>}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    border: '1px solid #1e4d2b',
  },
  voiceBanner: {
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #0d1f17 0%, #0f2018 100%)',
    borderBottom: '1px solid #132e1f',
  },
  voiceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  voiceLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#22c55e',
    letterSpacing: 1.5,
  },
  confBadge: {
    fontSize: 10,
    color: '#5a7a65',
  },
  voiceText: {
    fontSize: 13,
    color: '#c5d8c5',
    lineHeight: '1.6',
    margin: 0,
    fontStyle: 'italic',
  },
  mainRec: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px',
  },
  clubSection: {
    position: 'relative' as const,
  },
  clubBadge: {
    width: 60,
    height: 60,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 900,
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
  },
  riskDot: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid #132e1f',
  },
  recDetails: { flex: 1 },
  targetText: {
    fontSize: 15,
    fontWeight: 600,
    color: '#f1f5f9',
    marginBottom: 8,
    lineHeight: '1.3',
  },
  metaRow: { display: 'flex', gap: 8, alignItems: 'center' },
  riskBadge: {
    padding: '3px 8px',
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.8,
    border: '1px solid',
  },
  shapeBadge: {
    padding: '3px 8px',
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 800,
    background: '#3b82f620',
    color: '#60a5fa',
    border: '1px solid #3b82f640',
    letterSpacing: 0.8,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    borderTop: '1px solid #0d1f17',
    borderBottom: '1px solid #0d1f17',
  },
  statCell: {
    padding: '12px 6px',
    textAlign: 'center' as const,
    borderRight: '1px solid #0d1f17',
    background: '#0d1f1740',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f1f5f9',
  },
  statUnit: {
    fontSize: 11,
    fontWeight: 600,
    opacity: 0.6,
    marginLeft: 1,
  },
  statLabel: {
    fontSize: 8,
    color: '#5a7a65',
    marginTop: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: 600,
  },
  expandBtn: {
    width: '100%',
    padding: '10px',
    border: 'none',
    background: 'transparent',
    color: '#5a7a65',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  expandText: {},
  expandArrow: {
    fontSize: 8,
    transition: 'transform 0.2s ease',
  },
  expandedSection: {
    padding: '0 16px 16px',
  },
  sectionHeader: {
    fontSize: 9,
    fontWeight: 800,
    color: '#22c55e',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  reasoningList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  reasonItem: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    fontSize: 12,
    color: '#c5d8c5',
    lineHeight: '1.5',
  },
  reasonBullet: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#1e4d2b',
    flexShrink: 0,
    marginTop: 7,
  },
  altCard: {
    display: 'flex',
    gap: 12,
    padding: '10px 12px',
    background: '#0d1f17',
    borderRadius: 10,
    marginBottom: 6,
    border: '1px solid #132e1f',
  },
  altClub: {
    fontSize: 14,
    fontWeight: 800,
    color: '#8faa97',
    minWidth: 36,
    paddingTop: 2,
  },
  altDetails: { flex: 1 },
  altStrategy: { fontSize: 12, color: '#c5d8c5', lineHeight: '1.4' },
  altMeta: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
  },
  altRisk: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'capitalize' as const,
  },
  altSg: {
    fontSize: 10,
    color: '#5a7a65',
  },
  dispersion: {},
  dispersionBar: {
    width: '100%',
    height: 4,
    background: '#0d1f17',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  dispersionFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #22c55e, #3b82f6)',
    borderRadius: 2,
  },
  dispersionText: {
    fontSize: 12,
    color: '#8faa97',
    lineHeight: '1.5',
    marginBottom: 4,
  },
  dispersionStats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#5a7a65',
  },
};

import React, { useState } from 'react';
import type { CourseData } from '../models/types';

interface Props {
  course: CourseData;
  scores: (number | null)[];
  onScoreChange: (hole: number, score: number | null) => void;
  currentHole: number;
  onNavigateHole: (hole: number) => void;
}

export function Scorecard({ course, scores, onScoreChange, currentHole, onNavigateHole }: Props) {
  const [expandedHole, setExpandedHole] = useState<number | null>(null);

  const frontNine = course.holes.slice(0, 9);
  const backNine = course.holes.slice(9, 18);
  const frontPar = frontNine.reduce((s, h) => s + h.par, 0);
  const backPar = backNine.reduce((s, h) => s + h.par, 0);
  const frontScore = scores.slice(0, 9).reduce((s: number, v) => s + (v ?? 0), 0);
  const backScore = scores.slice(9, 18).reduce((s: number, v) => s + (v ?? 0), 0);
  const totalPar = frontPar + backPar;
  const totalScore = frontScore + backScore;
  const holesPlayed = scores.filter(s => s !== null).length;
  const playedPar = scores.reduce((sum: number, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);
  const displayScoreToPar = holesPlayed > 0 ? totalScore - playedPar : 0;

  // Count score types
  const birdies = scores.filter((s, i) => s !== null && s < course.holes[i].par).length;
  const pars = scores.filter((s, i) => s !== null && s === course.holes[i].par).length;
  const bogeys = scores.filter((s, i) => s !== null && s === course.holes[i].par + 1).length;
  const doubles = scores.filter((s, i) => s !== null && s > course.holes[i].par + 1).length;

  return (
    <div>
      <h2 style={styles.title}>Scorecard</h2>
      <div style={styles.courseName}>{course.name}</div>

      {/* Summary */}
      <div style={styles.summaryBar}>
        <div style={styles.summaryItem}>
          <div style={styles.summaryValue}>{holesPlayed > 0 ? totalScore : '-'}</div>
          <div style={styles.summaryLabel}>Score</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={{
            ...styles.summaryValue,
            color: displayScoreToPar === 0 ? '#22c55e' : displayScoreToPar > 0 ? '#ef4444' : '#3b82f6',
          }}>
            {holesPlayed === 0 ? '-' : displayScoreToPar === 0 ? 'E' : displayScoreToPar > 0 ? `+${displayScoreToPar}` : displayScoreToPar}
          </div>
          <div style={styles.summaryLabel}>To Par</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryValue}>{holesPlayed}</div>
          <div style={styles.summaryLabel}>Played</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryValue}>{holesPlayed > 0 ? (totalScore / holesPlayed).toFixed(1) : '-'}</div>
          <div style={styles.summaryLabel}>Avg</div>
        </div>
      </div>

      {/* Score Distribution */}
      {holesPlayed > 0 && (
        <div style={styles.distRow}>
          {birdies > 0 && <span style={{ ...styles.distChip, background: '#22c55e20', color: '#22c55e' }}>Birdie- {birdies}</span>}
          {pars > 0 && <span style={{ ...styles.distChip, background: '#94a3b815', color: '#94a3b8' }}>Par {pars}</span>}
          {bogeys > 0 && <span style={{ ...styles.distChip, background: '#f59e0b20', color: '#f59e0b' }}>Bogey {bogeys}</span>}
          {doubles > 0 && <span style={{ ...styles.distChip, background: '#ef444420', color: '#ef4444' }}>Dbl+ {doubles}</span>}
        </div>
      )}

      {/* Front 9 */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>FRONT 9</div>
        <ScoreGrid
          holes={frontNine}
          scores={scores.slice(0, 9)}
          startIdx={0}
          totalPar={frontPar}
          totalScore={frontScore}
          currentHole={currentHole}
          expandedHole={expandedHole}
          onExpand={setExpandedHole}
          onScoreChange={onScoreChange}
          onNavigateHole={onNavigateHole}
        />
      </div>

      {/* Back 9 */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>BACK 9</div>
        <ScoreGrid
          holes={backNine}
          scores={scores.slice(9, 18)}
          startIdx={9}
          totalPar={backPar}
          totalScore={backScore}
          currentHole={currentHole}
          expandedHole={expandedHole}
          onExpand={setExpandedHole}
          onScoreChange={onScoreChange}
          onNavigateHole={onNavigateHole}
        />
      </div>

      {/* Total */}
      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>Total</span>
        <span style={styles.totalPar}>Par {totalPar}</span>
        <span style={{
          ...styles.totalScore,
          color: displayScoreToPar === 0 ? '#22c55e' : displayScoreToPar > 0 ? '#ef4444' : '#3b82f6',
        }}>
          {holesPlayed > 0 ? totalScore : '-'}
        </span>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <LegendItem color="#3b82f6" label="Eagle-" />
        <LegendItem color="#22c55e" label="Birdie" />
        <LegendItem color="#94a3b8" label="Par" />
        <LegendItem color="#f59e0b" label="Bogey" />
        <LegendItem color="#ef4444" label="Dbl+" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
    </div>
  );
}

interface ScoreGridProps {
  holes: { holeNumber: number; par: number; lengthYards: number; handicapIndex: number }[];
  scores: (number | null)[];
  startIdx: number;
  totalPar: number;
  totalScore: number;
  currentHole: number;
  expandedHole: number | null;
  onExpand: (hole: number | null) => void;
  onScoreChange: (hole: number, score: number | null) => void;
  onNavigateHole: (hole: number) => void;
}

function ScoreGrid({ holes, scores, startIdx, totalPar, totalScore, currentHole, expandedHole, onExpand, onScoreChange, onNavigateHole }: ScoreGridProps) {
  return (
    <div style={styles.grid}>
      {/* Header Row */}
      <div style={styles.gridHeaderRow}>
        <div style={styles.gridHeaderLabel}>Hole</div>
        {holes.map(h => (
          <div key={h.holeNumber} style={{
            ...styles.gridHeaderCell,
            ...(currentHole === h.holeNumber ? styles.currentHoleHeader : {}),
          }}>
            {h.holeNumber}
          </div>
        ))}
        <div style={styles.gridHeaderLabel}>Tot</div>
      </div>

      {/* Par Row */}
      <div style={styles.gridRow}>
        <div style={styles.gridLabelCell}>Par</div>
        {holes.map(h => (
          <div key={h.holeNumber} style={styles.gridParCell}>{h.par}</div>
        ))}
        <div style={styles.gridTotalCell}>{totalPar}</div>
      </div>

      {/* Yardage Row */}
      <div style={styles.gridRow}>
        <div style={styles.gridLabelCell}>Yds</div>
        {holes.map(h => (
          <div key={h.holeNumber} style={styles.gridYdsCell}>{h.lengthYards}</div>
        ))}
        <div style={styles.gridTotalCell}>{holes.reduce((s, h) => s + h.lengthYards, 0)}</div>
      </div>

      {/* Score Row */}
      <div style={styles.gridRow}>
        <div style={styles.gridLabelCell}>Scr</div>
        {holes.map((h, i) => {
          const score = scores[i];
          const diff = score !== null ? score - h.par : null;
          return (
            <div
              key={h.holeNumber}
              onClick={() => onExpand(expandedHole === h.holeNumber ? null : h.holeNumber)}
              style={{
                ...styles.gridScoreCell,
                ...(currentHole === h.holeNumber ? styles.currentHoleScore : {}),
                background: score === null ? 'transparent'
                  : diff !== null && diff <= -2 ? '#3b82f620'
                  : diff === -1 ? '#22c55e20'
                  : diff === 0 ? '#94a3b810'
                  : diff === 1 ? '#f59e0b20'
                  : '#ef444420',
                color: score === null ? '#334155'
                  : diff !== null && diff <= -2 ? '#3b82f6'
                  : diff === -1 ? '#22c55e'
                  : diff === 0 ? '#e2e8f0'
                  : diff === 1 ? '#f59e0b'
                  : '#ef4444',
              }}
            >
              {score ?? '-'}
            </div>
          );
        })}
        <div style={{
          ...styles.gridTotalCell,
          fontWeight: 900,
        }}>
          {scores.some(s => s !== null) ? totalScore : '-'}
        </div>
      </div>

      {/* Expanded Entry */}
      {holes.map((h, i) => {
        if (expandedHole !== h.holeNumber) return null;
        return (
          <div key={`expand-${h.holeNumber}`} style={styles.expandedEntry}>
            <div style={styles.expandedHeader}>
              <span style={styles.expandedTitle}>Hole {h.holeNumber} — Par {h.par} — {h.lengthYards} yds</span>
              <button style={styles.goToBtn} onClick={() => { onNavigateHole(h.holeNumber); onExpand(null); }}>
                Go to hole
              </button>
            </div>
            <div style={styles.scoreButtons}>
              {Array.from({ length: 8 }, (_, j) => j + 1).map(s => {
                const isActive = scores[i] === s;
                const diff = s - h.par;
                let activeColor = '#3b82f6';
                if (diff === -1) activeColor = '#22c55e';
                else if (diff === 0) activeColor = '#94a3b8';
                else if (diff === 1) activeColor = '#f59e0b';
                else if (diff > 1) activeColor = '#ef4444';

                return (
                  <button
                    key={s}
                    onClick={() => { onScoreChange(h.holeNumber, s); onExpand(null); }}
                    style={{
                      ...styles.scoreBtn,
                      ...(isActive ? { background: activeColor, color: '#0f172a', borderColor: activeColor } : {}),
                      ...(s === h.par && !isActive ? { borderColor: '#22c55e40' } : {}),
                    }}
                  >
                    {s}
                  </button>
                );
              })}
              <button
                style={styles.clearBtn}
                onClick={() => { onScoreChange(h.holeNumber, null); onExpand(null); }}
              >
                Clear
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, fontWeight: 900, color: '#f1f5f9', marginBottom: 2, letterSpacing: -0.3 },
  courseName: { fontSize: 12, color: '#64748b', marginBottom: 20 },
  summaryBar: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16,
  },
  summaryItem: {
    background: 'linear-gradient(135deg, #1e293b 0%, #1a2332 100%)',
    borderRadius: 12, padding: '14px 8px',
    textAlign: 'center' as const, border: '1px solid #334155',
  },
  summaryValue: { fontSize: 22, fontWeight: 900, color: '#f1f5f9' },
  summaryLabel: {
    fontSize: 9, color: '#64748b', marginTop: 2,
    textTransform: 'uppercase' as const, letterSpacing: 0.5, fontWeight: 600,
  },
  distRow: {
    display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  distChip: {
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 9, fontWeight: 800, color: '#22c55e',
    letterSpacing: 1.5, marginBottom: 6,
  },
  grid: {
    background: 'linear-gradient(135deg, #1e293b 0%, #1a2332 100%)',
    borderRadius: 12, overflow: 'hidden', border: '1px solid #334155',
  },
  gridHeaderRow: {
    display: 'grid', gridTemplateColumns: '36px repeat(9, 1fr) 36px',
    background: '#0f172a',
  },
  gridHeaderLabel: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 9, fontWeight: 700, color: '#64748b',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  gridHeaderCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 11, fontWeight: 700, color: '#64748b',
  },
  currentHoleHeader: {
    color: '#22c55e', fontWeight: 800,
  },
  gridRow: {
    display: 'grid', gridTemplateColumns: '36px repeat(9, 1fr) 36px',
  },
  gridLabelCell: {
    padding: '7px 3px', fontSize: 9, fontWeight: 700,
    color: '#64748b', display: 'flex', alignItems: 'center',
    justifyContent: 'center',
    textTransform: 'uppercase' as const,
  },
  gridParCell: {
    padding: '7px 2px', textAlign: 'center' as const,
    fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #0f172a',
  },
  gridYdsCell: {
    padding: '6px 1px', textAlign: 'center' as const,
    fontSize: 8, color: '#64748b', borderBottom: '1px solid #0f172a',
  },
  gridScoreCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    borderRadius: 4, margin: '2px 1px',
    transition: 'all 0.15s',
  },
  currentHoleScore: {
    outline: '2px solid #22c55e',
    outlineOffset: -1,
  },
  gridTotalCell: {
    padding: '7px 2px', textAlign: 'center' as const,
    fontSize: 12, fontWeight: 800, color: '#e2e8f0',
    background: '#0f172a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  expandedEntry: {
    padding: '12px', background: '#0f172a', borderTop: '1px solid #334155',
  },
  expandedHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  expandedTitle: { fontSize: 13, fontWeight: 700, color: '#e2e8f0' },
  goToBtn: {
    padding: '5px 12px', borderRadius: 8, border: '1px solid #22c55e',
    background: '#22c55e15', color: '#22c55e', fontSize: 11,
    fontWeight: 700, cursor: 'pointer',
  },
  scoreButtons: { display: 'flex', gap: 5, flexWrap: 'wrap' as const },
  scoreBtn: {
    width: 36, height: 36, borderRadius: 10, border: '1.5px solid #334155',
    background: '#1e293b', color: '#94a3b8', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  clearBtn: {
    padding: '6px 14px', borderRadius: 10, border: '1px solid #334155',
    background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer',
    fontWeight: 600,
  },
  totalRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #1e293b 0%, #1a2332 100%)',
    borderRadius: 12, marginBottom: 14, border: '1px solid #334155',
  },
  totalLabel: { fontSize: 15, fontWeight: 900, color: '#f1f5f9' },
  totalPar: { fontSize: 13, color: '#64748b' },
  totalScore: { fontSize: 24, fontWeight: 900 },
  legend: {
    display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 16,
  },
};

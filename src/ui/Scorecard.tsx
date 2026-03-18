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
  const scoreToPar = totalScore - scores.filter((s, i) => s !== null).reduce((sum, _, i) => {
    const idx = scores.findIndex((_, j) => j === i && scores[j] !== null);
    return sum;
  }, 0);

  // Calculate score to par only for played holes
  const playedPar = scores.reduce((sum, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);
  const displayScoreToPar = holesPlayed > 0 ? totalScore - playedPar : 0;

  return (
    <div>
      <h2 style={styles.title}>Scorecard</h2>
      <div style={styles.courseName}>{course.name}</div>

      {/* Summary Bar */}
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

      {/* Scorecard Grid */}
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
        <span style={styles.totalScore}>{holesPlayed > 0 ? totalScore : '-'}</span>
      </div>

      {/* Quick Score Legend */}
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
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
    </div>
  );
}

interface ScoreGridProps {
  holes: typeof SAMPLE_HOLES;
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

type SAMPLE_HOLES = { holeNumber: number; par: number; lengthYards: number; handicapIndex: number }[];

function ScoreGrid({ holes, scores, startIdx, totalPar, totalScore, currentHole, expandedHole, onExpand, onScoreChange, onNavigateHole }: ScoreGridProps) {
  return (
    <div style={styles.grid}>
      {/* Header Row */}
      <div style={styles.gridHeaderRow}>
        <div style={styles.gridHeaderCell}>Hole</div>
        {holes.map(h => (
          <div
            key={h.holeNumber}
            style={{
              ...styles.gridHeaderCell,
              ...(currentHole === h.holeNumber ? styles.currentHoleHeader : {}),
            }}
          >
            {h.holeNumber}
          </div>
        ))}
        <div style={styles.gridHeaderCell}>Out</div>
      </div>

      {/* Par Row */}
      <div style={styles.gridRow}>
        <div style={styles.gridLabelCell}>Par</div>
        {holes.map(h => (
          <div key={h.holeNumber} style={styles.gridParCell}>{h.par}</div>
        ))}
        <div style={styles.gridTotalCell}>{totalPar}</div>
      </div>

      {/* Score Row */}
      <div style={styles.gridRow}>
        <div style={styles.gridLabelCell}>Score</div>
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
        <div style={styles.gridTotalCell}>
          {scores.some(s => s !== null) ? totalScore : '-'}
        </div>
      </div>

      {/* Expanded Score Entry */}
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
              {Array.from({ length: 8 }, (_, j) => j + 1).map(s => (
                <button
                  key={s}
                  onClick={() => { onScoreChange(h.holeNumber, s); onExpand(null); }}
                  style={{
                    ...styles.scoreBtn,
                    ...(scores[i] === s ? styles.scoreBtnActive : {}),
                    ...(s === h.par ? styles.scoreBtnPar : {}),
                  }}
                >
                  {s}
                </button>
              ))}
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
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 2 },
  courseName: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  summaryBar: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24,
  },
  summaryItem: {
    background: '#1e293b', borderRadius: 12, padding: '14px 8px',
    textAlign: 'center' as const,
  },
  summaryValue: { fontSize: 24, fontWeight: 800, color: '#f1f5f9' },
  summaryLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
    letterSpacing: 1.5, marginBottom: 8,
  },
  grid: {
    background: '#1e293b', borderRadius: 12, overflow: 'hidden',
  },
  gridHeaderRow: {
    display: 'grid', gridTemplateColumns: '40px repeat(9, 1fr) 40px',
    background: '#0f172a',
  },
  gridHeaderCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 11, fontWeight: 700, color: '#64748b',
  },
  currentHoleHeader: {
    color: '#22c55e', fontWeight: 800,
  },
  gridRow: {
    display: 'grid', gridTemplateColumns: '40px repeat(9, 1fr) 40px',
  },
  gridLabelCell: {
    padding: '8px 4px', fontSize: 10, fontWeight: 700,
    color: '#64748b', display: 'flex', alignItems: 'center',
    textTransform: 'uppercase' as const,
  },
  gridParCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #0f172a',
  },
  gridScoreCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    borderRadius: 4, margin: '2px 1px',
  },
  currentHoleScore: {
    outline: '2px solid #22c55e',
  },
  gridTotalCell: {
    padding: '8px 2px', textAlign: 'center' as const,
    fontSize: 13, fontWeight: 800, color: '#e2e8f0',
    background: '#0f172a',
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
    padding: '4px 10px', borderRadius: 6, border: '1px solid #22c55e',
    background: 'transparent', color: '#22c55e', fontSize: 11,
    fontWeight: 700, cursor: 'pointer',
  },
  scoreButtons: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  scoreBtn: {
    width: 36, height: 36, borderRadius: 8, border: '1px solid #334155',
    background: '#1e293b', color: '#94a3b8', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  scoreBtnActive: {
    background: '#22c55e', color: '#0f172a', borderColor: '#22c55e',
  },
  scoreBtnPar: { borderColor: '#22c55e40' },
  clearBtn: {
    padding: '6px 12px', borderRadius: 8, border: '1px solid #334155',
    background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer',
  },
  totalRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#1e293b', borderRadius: 12, marginBottom: 16,
  },
  totalLabel: { fontSize: 14, fontWeight: 800, color: '#f1f5f9' },
  totalPar: { fontSize: 13, color: '#64748b' },
  totalScore: { fontSize: 22, fontWeight: 900, color: '#22c55e' },
  legend: {
    display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 16,
  },
};

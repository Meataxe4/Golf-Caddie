import React from 'react';
import { getAllAchievements, loadRoundHistory, type RoundRecord, type Achievement } from '../core/achievements';

export function AchievementsPanel() {
  const achievements = getAllAchievements();
  const rounds = loadRoundHistory();
  const unlocked = achievements.filter(a => a.unlockedAt);
  const locked = achievements.filter(a => !a.unlockedAt);

  const tierColors: Record<string, string> = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
  };

  return (
    <div>
      <h2 style={styles.title}>Achievements</h2>
      <p style={styles.subtitle}>
        {unlocked.length} of {achievements.length} unlocked
      </p>

      {/* Progress Bar */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${(unlocked.length / achievements.length) * 100}%` }} />
      </div>

      {/* Round History Summary */}
      {rounds.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Round History</div>
          <div style={styles.historyList}>
            {rounds.slice(-5).reverse().map((r, i) => (
              <div key={i} style={styles.historyItem}>
                <div>
                  <div style={styles.historyCourseName}>{r.courseName}</div>
                  <div style={styles.historyDate}>{new Date(r.date).toLocaleDateString()}</div>
                </div>
                <div style={styles.historyScore}>
                  <div style={styles.historyScoreValue}>{r.totalScore}</div>
                  <div style={{
                    ...styles.historyScoreToPar,
                    color: r.scoreToPar === 0 ? '#22c55e' : r.scoreToPar > 0 ? '#ef4444' : '#3b82f6',
                  }}>
                    {r.scoreToPar === 0 ? 'E' : r.scoreToPar > 0 ? `+${r.scoreToPar}` : r.scoreToPar}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rounds.length > 5 && (
            <div style={styles.moreRounds}>{rounds.length - 5} more rounds played</div>
          )}
        </div>
      )}

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Unlocked</div>
          <div style={styles.achievementGrid}>
            {unlocked.map(a => (
              <div key={a.id} style={{ ...styles.achievementCard, borderColor: tierColors[a.tier] + '60' }}>
                <div style={{ ...styles.achievementIcon, background: tierColors[a.tier] + '30', color: tierColors[a.tier] }}>
                  {a.icon}
                </div>
                <div style={styles.achievementName}>{a.name}</div>
                <div style={styles.achievementDesc}>{a.description}</div>
                <div style={{ ...styles.tierBadge, color: tierColors[a.tier] }}>{a.tier}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Locked</div>
        <div style={styles.achievementGrid}>
          {locked.map(a => (
            <div key={a.id} style={{ ...styles.achievementCard, opacity: 0.5 }}>
              <div style={{ ...styles.achievementIcon, background: '#334155', color: '#64748b' }}>
                ?
              </div>
              <div style={styles.achievementName}>{a.name}</div>
              <div style={styles.achievementDesc}>{a.requirement}</div>
              <div style={{ ...styles.tierBadge, color: tierColors[a.tier] }}>{a.tier}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 2 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  progressBar: {
    height: 6, background: '#1e293b', borderRadius: 3, marginBottom: 24, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)',
    borderRadius: 3, transition: 'width 0.3s',
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
    letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 12,
  },
  historyList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  historyItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', background: '#1e293b', borderRadius: 10,
  },
  historyCourseName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  historyDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  historyScore: { textAlign: 'right' as const },
  historyScoreValue: { fontSize: 20, fontWeight: 800, color: '#f1f5f9' },
  historyScoreToPar: { fontSize: 12, fontWeight: 700 },
  moreRounds: { fontSize: 12, color: '#64748b', textAlign: 'center' as const, marginTop: 8 },
  achievementGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
  },
  achievementCard: {
    background: '#1e293b', borderRadius: 12, padding: 14,
    border: '1px solid #334155', textAlign: 'center' as const,
  },
  achievementIcon: {
    width: 44, height: 44, borderRadius: 12,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 900, marginBottom: 8,
  },
  achievementName: { fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 },
  achievementDesc: { fontSize: 11, color: '#94a3b8', lineHeight: '1.4' },
  tierBadge: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: 0.5, marginTop: 8,
  },
};

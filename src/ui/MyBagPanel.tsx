import React, { useState } from 'react';
import type { PlayerProfile, ClubProfile, Club, ShotShape, MissTendency } from '../models/types';

interface Props {
  player: PlayerProfile;
  onSave: (updated: PlayerProfile) => void;
}

const ALL_CLUBS: { value: Club; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: '3_wood', label: '3 Wood' },
  { value: '5_wood', label: '5 Wood' },
  { value: '7_wood', label: '7 Wood' },
  { value: '2_hybrid', label: '2 Hybrid' },
  { value: '3_hybrid', label: '3 Hybrid' },
  { value: '4_hybrid', label: '4 Hybrid' },
  { value: '5_hybrid', label: '5 Hybrid' },
  { value: '3_iron', label: '3 Iron' },
  { value: '4_iron', label: '4 Iron' },
  { value: '5_iron', label: '5 Iron' },
  { value: '6_iron', label: '6 Iron' },
  { value: '7_iron', label: '7 Iron' },
  { value: '8_iron', label: '8 Iron' },
  { value: '9_iron', label: '9 Iron' },
  { value: 'pw', label: 'PW' },
  { value: 'gw', label: 'GW' },
  { value: 'sw', label: 'SW' },
  { value: 'lw', label: 'LW' },
];

const SHOT_SHAPES: ShotShape[] = ['straight', 'fade', 'draw', 'high', 'low'];
const MISS_TENDENCIES: MissTendency[] = ['left', 'right', 'short', 'long', 'thin', 'fat'];
const GAME_AREAS = ['driving', 'approach', 'short_game', 'putting'] as const;

function defaultClub(club: Club): ClubProfile {
  return {
    club,
    averageCarryYards: 150,
    totalDistanceYards: 160,
    standardDeviationYards: 10,
    lateralDispersionYards: 12,
    launchAngleDeg: 25,
    primaryMiss: 'right',
    missLeftPct: 20,
    missRightPct: 30,
    missShortPct: 30,
    missLongPct: 20,
    confidenceLevel: 0.5,
    shotCount: 0,
  };
}

export function MyBagPanel({ player, onSave }: Props) {
  const [editingPlayer, setEditingPlayer] = useState<PlayerProfile>(() => JSON.parse(JSON.stringify(player)));
  const [editingClubIdx, setEditingClubIdx] = useState<number | null>(null);
  const [showAddClub, setShowAddClub] = useState(false);
  const [saved, setSaved] = useState(false);

  const sortedClubs = [...editingPlayer.clubs].sort((a, b) => b.averageCarryYards - a.averageCarryYards);

  const handleSave = () => {
    // Persist to localStorage
    localStorage.setItem('golf-caddie-player', JSON.stringify(editingPlayer));
    onSave(editingPlayer);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateClub = (idx: number, field: keyof ClubProfile, value: number | string) => {
    const updated = { ...editingPlayer };
    const clubs = [...updated.clubs];
    clubs[idx] = { ...clubs[idx], [field]: value };
    updated.clubs = clubs;
    setEditingPlayer(updated);
  };

  const addClub = (club: Club) => {
    const exists = editingPlayer.clubs.find(c => c.club === club);
    if (exists) return;
    const updated = { ...editingPlayer, clubs: [...editingPlayer.clubs, defaultClub(club)] };
    setEditingPlayer(updated);
    setShowAddClub(false);
  };

  const removeClub = (idx: number) => {
    const updated = { ...editingPlayer, clubs: editingPlayer.clubs.filter((_, i) => i !== idx) };
    setEditingPlayer(updated);
    setEditingClubIdx(null);
  };

  const clubsInBag = new Set(editingPlayer.clubs.map(c => c.club));
  const availableClubs = ALL_CLUBS.filter(c => !clubsInBag.has(c.value));

  return (
    <div>
      <h2 style={styles.title}>My Bag</h2>
      <p style={styles.subtitle}>Set your club distances so the AI caddie knows your game</p>

      {/* Player Info */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Player Info</div>
        <div style={styles.infoGrid}>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Name</label>
            <input
              style={styles.input}
              value={editingPlayer.name}
              onChange={e => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Handicap</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              max={54}
              value={editingPlayer.handicap}
              onChange={e => setEditingPlayer({ ...editingPlayer, handicap: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Preferred Shot Shape</label>
          <div style={styles.chipRow}>
            {SHOT_SHAPES.map(s => (
              <button
                key={s}
                onClick={() => setEditingPlayer({ ...editingPlayer, preferredShotShape: s })}
                style={{
                  ...styles.chip,
                  ...(editingPlayer.preferredShotShape === s ? styles.chipActive : {}),
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Strengths</label>
          <div style={styles.chipRow}>
            {GAME_AREAS.map(a => (
              <button
                key={a}
                onClick={() => {
                  const has = editingPlayer.strengthAreas.includes(a);
                  setEditingPlayer({
                    ...editingPlayer,
                    strengthAreas: has
                      ? editingPlayer.strengthAreas.filter(x => x !== a)
                      : [...editingPlayer.strengthAreas, a],
                  });
                }}
                style={{
                  ...styles.chip,
                  ...(editingPlayer.strengthAreas.includes(a) ? styles.chipStrength : {}),
                }}
              >
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Weaknesses</label>
          <div style={styles.chipRow}>
            {GAME_AREAS.map(a => (
              <button
                key={a}
                onClick={() => {
                  const has = editingPlayer.weaknessAreas.includes(a);
                  setEditingPlayer({
                    ...editingPlayer,
                    weaknessAreas: has
                      ? editingPlayer.weaknessAreas.filter(x => x !== a)
                      : [...editingPlayer.weaknessAreas, a],
                  });
                }}
                style={{
                  ...styles.chip,
                  ...(editingPlayer.weaknessAreas.includes(a) ? styles.chipWeakness : {}),
                }}
              >
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Aggression ({Math.round(editingPlayer.aggressionPreference * 100)}%)</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(editingPlayer.aggressionPreference * 100)}
            onChange={e => setEditingPlayer({ ...editingPlayer, aggressionPreference: Number(e.target.value) / 100 })}
            style={styles.slider}
          />
          <div style={styles.sliderLabels}>
            <span>Conservative</span><span>Aggressive</span>
          </div>
        </div>
      </div>

      {/* Club Distances */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Club Distances</div>
        <p style={styles.hint}>Tap a club to edit carry, total distance, dispersion, and miss tendencies</p>

        <div style={styles.clubTable}>
          <div style={styles.clubHeader}>
            <span style={styles.clubCol}>Club</span>
            <span style={styles.distCol}>Carry</span>
            <span style={styles.distCol}>Total</span>
            <span style={styles.distCol}>SD</span>
            <span style={styles.distCol}>Miss</span>
          </div>
          {sortedClubs.map((c) => {
            const realIdx = editingPlayer.clubs.findIndex(x => x.club === c.club);
            const isEditing = editingClubIdx === realIdx;
            return (
              <div key={c.club}>
                <div
                  style={{ ...styles.clubRow, ...(isEditing ? styles.clubRowActive : {}), cursor: 'pointer' }}
                  onClick={() => setEditingClubIdx(isEditing ? null : realIdx)}
                >
                  <span style={styles.clubCol}>{clubLabel(c.club)}</span>
                  <span style={styles.distCol}>{c.averageCarryYards}</span>
                  <span style={styles.distCol}>{c.totalDistanceYards}</span>
                  <span style={styles.distCol}>{c.standardDeviationYards}</span>
                  <span style={{ ...styles.distCol, color: missColor(c.primaryMiss) }}>
                    {c.primaryMiss}
                  </span>
                </div>
                {isEditing && (
                  <div style={styles.clubEdit}>
                    <div style={styles.editRow}>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Carry (yds)</label>
                        <input
                          style={styles.editInput}
                          type="number"
                          value={c.averageCarryYards}
                          onChange={e => updateClub(realIdx, 'averageCarryYards', Number(e.target.value))}
                        />
                      </div>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Total (yds)</label>
                        <input
                          style={styles.editInput}
                          type="number"
                          value={c.totalDistanceYards}
                          onChange={e => updateClub(realIdx, 'totalDistanceYards', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div style={styles.editRow}>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Std Dev (yds)</label>
                        <input
                          style={styles.editInput}
                          type="number"
                          value={c.standardDeviationYards}
                          onChange={e => updateClub(realIdx, 'standardDeviationYards', Number(e.target.value))}
                        />
                      </div>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Lateral Disp.</label>
                        <input
                          style={styles.editInput}
                          type="number"
                          value={c.lateralDispersionYards}
                          onChange={e => updateClub(realIdx, 'lateralDispersionYards', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div style={styles.editRow}>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Launch Angle</label>
                        <input
                          style={styles.editInput}
                          type="number"
                          value={c.launchAngleDeg}
                          onChange={e => updateClub(realIdx, 'launchAngleDeg', Number(e.target.value))}
                        />
                      </div>
                      <div style={styles.editField}>
                        <label style={styles.editLabel}>Primary Miss</label>
                        <select
                          style={styles.editInput}
                          value={c.primaryMiss}
                          onChange={e => updateClub(realIdx, 'primaryMiss', e.target.value)}
                        >
                          {MISS_TENDENCIES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <button
                      style={styles.removeBtn}
                      onClick={(e) => { e.stopPropagation(); removeClub(realIdx); }}
                    >
                      Remove Club
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Club */}
        {availableClubs.length > 0 && (
          <>
            <button
              style={styles.addClubBtn}
              onClick={() => setShowAddClub(!showAddClub)}
            >
              + Add Club
            </button>
            {showAddClub && (
              <div style={styles.addClubList}>
                {availableClubs.map(c => (
                  <button
                    key={c.value}
                    style={styles.addClubItem}
                    onClick={() => addClub(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Save */}
      <button style={styles.saveBtn} onClick={handleSave}>
        {saved ? 'Saved!' : 'Save My Bag'}
      </button>
    </div>
  );
}

function clubLabel(club: string): string {
  const labels: Record<string, string> = {
    driver: 'Driver', '3_wood': '3 Wood', '5_wood': '5 Wood', '7_wood': '7 Wood',
    '2_hybrid': '2 Hybrid', '3_hybrid': '3 Hybrid', '4_hybrid': '4 Hybrid', '5_hybrid': '5 Hybrid',
    '3_iron': '3 Iron', '4_iron': '4 Iron', '5_iron': '5 Iron', '6_iron': '6 Iron',
    '7_iron': '7 Iron', '8_iron': '8 Iron', '9_iron': '9 Iron',
    pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW',
  };
  return labels[club] ?? club.replace(/_/g, ' ');
}

function missColor(miss: string): string {
  if (miss === 'left' || miss === 'right') return '#f59e0b';
  if (miss === 'short') return '#ef4444';
  return '#8faa97';
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#5a7a65', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: '#22c55e',
    textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 12,
  },
  hint: { fontSize: 12, color: '#5a7a65', marginBottom: 12, marginTop: -4 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#8faa97', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #1e4d2b', background: '#0d1f17', color: '#f1f5f9',
    fontSize: 14, boxSizing: 'border-box' as const,
  },
  chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  chip: {
    padding: '6px 12px', borderRadius: 16, border: '1px solid #1e4d2b',
    background: 'transparent', color: '#8faa97', fontSize: 12, cursor: 'pointer',
    textTransform: 'capitalize' as const,
  },
  chipActive: { background: '#3b82f6', color: 'white', borderColor: '#3b82f6', fontWeight: 700 },
  chipStrength: { background: '#22c55e', color: '#0d1f17', borderColor: '#22c55e', fontWeight: 700 },
  chipWeakness: { background: '#ef4444', color: 'white', borderColor: '#ef4444', fontWeight: 700 },
  slider: { width: '100%', accentColor: '#22c55e' },
  sliderLabels: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, color: '#5a7a65', marginTop: 4,
  },
  clubTable: { background: '#132e1f', borderRadius: 12, overflow: 'hidden' },
  clubHeader: {
    display: 'flex', padding: '10px 14px', background: '#0d1f17',
    fontSize: 10, fontWeight: 700, color: '#5a7a65',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  clubRow: {
    display: 'flex', padding: '10px 14px', borderBottom: '1px solid #0d1f17',
    fontSize: 13, color: '#e8f0e8',
  },
  clubRowActive: { background: '#1e4d2b' },
  clubCol: { flex: 2, fontWeight: 600 },
  distCol: { flex: 1, textAlign: 'center' as const },
  clubEdit: {
    padding: '12px 14px', background: '#0d1f17', borderBottom: '1px solid #1e4d2b',
  },
  editRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  editField: {},
  editLabel: { display: 'block', fontSize: 10, color: '#5a7a65', marginBottom: 4 },
  editInput: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #1e4d2b', background: '#132e1f', color: '#f1f5f9',
    fontSize: 13, boxSizing: 'border-box' as const,
  },
  removeBtn: {
    padding: '6px 12px', borderRadius: 6, border: '1px solid #ef444440',
    background: 'transparent', color: '#ef4444', fontSize: 12,
    cursor: 'pointer', marginTop: 4,
  },
  addClubBtn: {
    width: '100%', padding: '12px', marginTop: 12, borderRadius: 10,
    border: '2px dashed #1e4d2b', background: 'transparent',
    color: '#22c55e', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  addClubList: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 10,
    padding: 12, background: '#132e1f', borderRadius: 10,
  },
  addClubItem: {
    padding: '6px 12px', borderRadius: 16, border: '1px solid #1e4d2b',
    background: '#0d1f17', color: '#8faa97', fontSize: 12, cursor: 'pointer',
  },
  saveBtn: {
    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
    background: '#22c55e', color: '#0d1f17', fontSize: 16, fontWeight: 800,
    cursor: 'pointer', marginBottom: 24,
  },
};

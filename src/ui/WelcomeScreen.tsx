import React, { useState } from 'react';
import type { PlayerProfile, Club, ClubProfile, ShotShape } from '../models/types';
import { SAMPLE_CLUBS } from '../data/sample-player';

interface Props {
  onComplete: (player: PlayerProfile) => void;
}

const HANDICAP_PRESETS = [
  { label: 'Beginner', range: '25-36', value: 30, desc: 'New to golf or play casually' },
  { label: 'High', range: '18-24', value: 20, desc: 'Developing your game' },
  { label: 'Mid', range: '10-17', value: 15, desc: 'Solid fundamentals, scoring consistently' },
  { label: 'Low', range: '5-9', value: 7, desc: 'Strong all-around game' },
  { label: 'Scratch', range: '0-4', value: 2, desc: 'Competitive player' },
];

const DISTANCE_PRESETS: Record<string, { driver: number; '7_iron': number; pw: number }> = {
  'beginner': { driver: 180, '7_iron': 120, pw: 90 },
  'high': { driver: 200, '7_iron': 135, pw: 100 },
  'mid': { driver: 220, '7_iron': 150, pw: 115 },
  'low': { driver: 250, '7_iron': 165, pw: 130 },
  'scratch': { driver: 275, '7_iron': 175, pw: 140 },
};

function scaleClubs(baseClubs: ClubProfile[], driverCarry: number, ironCarry: number, wedgeCarry: number): ClubProfile[] {
  const baseDriver = 215;
  const baseIron = 148;
  const baseWedge = 112;

  return baseClubs.map(c => {
    let scale: number;
    if (c.averageCarryYards >= 180) {
      scale = driverCarry / baseDriver;
    } else if (c.averageCarryYards >= 120) {
      const t = (c.averageCarryYards - 120) / (180 - 120);
      scale = (1 - t) * (ironCarry / baseIron) + t * (driverCarry / baseDriver);
    } else {
      const t = (c.averageCarryYards - 60) / (120 - 60);
      scale = (1 - t) * (wedgeCarry / baseWedge) + t * (ironCarry / baseIron);
    }
    const carry = Math.round(c.averageCarryYards * scale);
    const total = Math.round(c.totalDistanceYards * scale);
    return { ...c, averageCarryYards: carry, totalDistanceYards: total };
  });
}

export function WelcomeScreen({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [handicapPreset, setHandicapPreset] = useState<string | null>(null);
  const [handicap, setHandicap] = useState(15);
  const [shotShape, setShotShape] = useState<ShotShape>('fade');
  const [driverDist, setDriverDist] = useState(220);
  const [ironDist, setIronDist] = useState(150);
  const [wedgeDist, setWedgeDist] = useState(115);

  const selectPreset = (label: string, value: number) => {
    setHandicapPreset(label);
    setHandicap(value);
    const key = label.toLowerCase();
    const dists = DISTANCE_PRESETS[key];
    if (dists) {
      setDriverDist(dists.driver);
      setIronDist(dists['7_iron']);
      setWedgeDist(dists.pw);
    }
  };

  const finish = () => {
    const clubs = scaleClubs(SAMPLE_CLUBS, driverDist, ironDist, wedgeDist);
    const player: PlayerProfile = {
      id: `player-${Date.now()}`,
      name: name || 'Golfer',
      handicap,
      clubs,
      preferredShotShape: shotShape,
      strengthAreas: [],
      weaknessAreas: [],
      pressureAdjustment: 0.4,
      aggressionPreference: 0.5,
      roundHistory: [],
    };
    localStorage.setItem('golf-caddie-player', JSON.stringify(player));
    localStorage.setItem('golf-caddie-onboarded', 'true');
    onComplete(player);
  };

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* Brand */}
        <div style={styles.brand}>
          <div style={styles.logoMark}>⛳</div>
          <div style={styles.brandName}>AI Golf Caddie</div>
          <div style={styles.tagline}>Your AI-powered caddie</div>
        </div>

        {step === 0 && (
          <div style={styles.stepContent}>
            <div style={styles.stepLabel}>STEP 1 OF 3</div>
            <h2 style={styles.stepTitle}>What's your name?</h2>
            <input
              style={styles.nameInput}
              placeholder="Enter your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <button style={styles.nextBtn} onClick={() => setStep(1)}>
              Next
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={styles.stepContent}>
            <div style={styles.stepLabel}>STEP 2 OF 3</div>
            <h2 style={styles.stepTitle}>What's your level?</h2>
            <div style={styles.presetList}>
              {HANDICAP_PRESETS.map(p => (
                <div
                  key={p.label}
                  onClick={() => selectPreset(p.label, p.value)}
                  style={{
                    ...styles.presetCard,
                    ...(handicapPreset === p.label ? styles.presetCardActive : {}),
                  }}
                >
                  <div style={styles.presetHeader}>
                    <span style={styles.presetLabel}>{p.label}</span>
                    <span style={styles.presetRange}>HCP {p.range}</span>
                  </div>
                  <div style={styles.presetDesc}>{p.desc}</div>
                </div>
              ))}
            </div>
            <div style={styles.navRow}>
              <button style={styles.backBtn} onClick={() => setStep(0)}>Back</button>
              <button style={styles.nextBtn} onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={styles.stepContent}>
            <div style={styles.stepLabel}>STEP 3 OF 3</div>
            <h2 style={styles.stepTitle}>Your distances</h2>
            <p style={styles.stepHint}>We've estimated based on your level. Adjust if you know your numbers.</p>

            <div style={styles.distanceInputGroup}>
              <label style={styles.distLabel}>Driver carry</label>
              <div style={styles.distRow}>
                <input
                  style={styles.distInput}
                  type="number"
                  value={driverDist}
                  onChange={e => setDriverDist(Number(e.target.value))}
                />
                <span style={styles.distUnit}>yds</span>
              </div>
            </div>

            <div style={styles.distanceInputGroup}>
              <label style={styles.distLabel}>7 Iron carry</label>
              <div style={styles.distRow}>
                <input
                  style={styles.distInput}
                  type="number"
                  value={ironDist}
                  onChange={e => setIronDist(Number(e.target.value))}
                />
                <span style={styles.distUnit}>yds</span>
              </div>
            </div>

            <div style={styles.distanceInputGroup}>
              <label style={styles.distLabel}>PW carry</label>
              <div style={styles.distRow}>
                <input
                  style={styles.distInput}
                  type="number"
                  value={wedgeDist}
                  onChange={e => setWedgeDist(Number(e.target.value))}
                />
                <span style={styles.distUnit}>yds</span>
              </div>
            </div>

            <div style={styles.shapeSection}>
              <label style={styles.distLabel}>Shot shape</label>
              <div style={styles.shapeRow}>
                {(['fade', 'draw', 'straight'] as ShotShape[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setShotShape(s)}
                    style={{
                      ...styles.shapeBtn,
                      ...(shotShape === s ? styles.shapeBtnActive : {}),
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.navRow}>
              <button style={styles.backBtn} onClick={() => setStep(1)}>Back</button>
              <button style={styles.startBtn} onClick={finish}>
                Start Playing
              </button>
            </div>
          </div>
        )}

        {/* Progress dots */}
        <div style={styles.dots}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ ...styles.dot, ...(step === i ? styles.dotActive : {}) }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #1a1a2e 50%, #0f172a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 440,
    padding: '40px 24px',
  },
  brand: { textAlign: 'center' as const, marginBottom: 40 },
  logoMark: {
    fontSize: 56,
    marginBottom: 16,
  },
  brandName: { fontSize: 28, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#64748b', marginTop: 4 },
  stepContent: { marginBottom: 32 },
  stepLabel: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
    letterSpacing: 1.5, marginBottom: 8,
  },
  stepTitle: { fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 16 },
  stepHint: { fontSize: 13, color: '#64748b', marginBottom: 20, marginTop: -8 },
  nameInput: {
    width: '100%', padding: '16px 18px', borderRadius: 12,
    border: '2px solid #334155', background: '#1e293b', color: '#f1f5f9',
    fontSize: 18, fontWeight: 600, boxSizing: 'border-box' as const,
    outline: 'none',
  },
  presetList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  presetCard: {
    padding: '14px 16px', borderRadius: 12,
    border: '2px solid #1e293b', background: '#1e293b',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  presetCardActive: {
    borderColor: '#22c55e',
    background: '#22c55e10',
  },
  presetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  presetLabel: { fontSize: 15, fontWeight: 700, color: '#f1f5f9' },
  presetRange: { fontSize: 12, color: '#64748b', fontWeight: 600 },
  presetDesc: { fontSize: 12, color: '#94a3b8' },
  distanceInputGroup: { marginBottom: 16 },
  distLabel: { display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  distRow: { display: 'flex', alignItems: 'center', gap: 8 },
  distInput: {
    flex: 1, padding: '12px 14px', borderRadius: 10,
    border: '2px solid #334155', background: '#1e293b', color: '#f1f5f9',
    fontSize: 18, fontWeight: 700, boxSizing: 'border-box' as const,
    textAlign: 'center' as const,
  },
  distUnit: { fontSize: 14, color: '#64748b', fontWeight: 600, width: 30 },
  shapeSection: { marginTop: 20 },
  shapeRow: { display: 'flex', gap: 8 },
  shapeBtn: {
    flex: 1, padding: '10px', borderRadius: 10,
    border: '2px solid #334155', background: 'transparent',
    color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    textTransform: 'capitalize' as const,
  },
  shapeBtnActive: {
    borderColor: '#22c55e', background: '#22c55e15', color: '#22c55e', fontWeight: 700,
  },
  navRow: { display: 'flex', gap: 10, marginTop: 24 },
  backBtn: {
    padding: '14px 24px', borderRadius: 12, border: '1px solid #334155',
    background: 'transparent', color: '#94a3b8', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  nextBtn: {
    flex: 1, padding: '14px', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  startBtn: {
    flex: 1, padding: '16px', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer',
    letterSpacing: 0.3,
  },
  dots: { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, background: '#334155' },
  dotActive: { background: '#22c55e', width: 24 },
};

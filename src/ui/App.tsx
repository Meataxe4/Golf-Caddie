import React, { useState, useEffect, useCallback } from 'react';
import { PlayerModel } from '../models/player-model';
import { AICaddie } from '../core/caddie';
import { WeatherService, MockWeatherProvider } from '../services/weather-service';
import { SAMPLE_PLAYER } from '../data/sample-player';
import { SAMPLE_COURSE } from '../data/sample-course';
import type {
  ShotRecommendation, HoleStrategy, WeatherConditions,
  LieCondition, VoiceCaddieResponse, PlayerProfile, CourseData,
} from '../models/types';
import { ShotCard } from './ShotCard';
import { StrategyPanel } from './StrategyPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { MyBagPanel } from './MyBagPanel';
import { CourseSelectPanel } from './CourseSelectPanel';
import { PracticeMode } from './PracticeMode';
import { WelcomeScreen } from './WelcomeScreen';
import { Scorecard } from './Scorecard';
import { AchievementsPanel } from './AchievementsPanel';
import { HoleFlyover } from './HoleFlyover';
import {
  saveRound, loadRoundHistory, checkAchievements, loadPracticeCount,
  type RoundRecord,
} from '../core/achievements';
import { useGPSTracking } from '../hooks/useGPSTracking';
import type { DistanceUnit } from '../utils/units';
import { loadUnitPreference, saveUnitPreference, convertDistance, distanceAbbrev } from '../utils/units';

type View = 'caddie' | 'strategy' | 'scorecard' | 'practice' | 'mybag' | 'course' | 'analysis' | 'achievements';

const LIE_OPTIONS: { value: LieCondition; label: string; icon: string }[] = [
  { value: 'tee', label: 'Tee', icon: 'T' },
  { value: 'fairway', label: 'Fairway', icon: 'FW' },
  { value: 'light_rough', label: 'Lt Rough', icon: 'LR' },
  { value: 'heavy_rough', label: 'Hv Rough', icon: 'HR' },
  { value: 'fairway_bunker', label: 'FW Bnk', icon: 'FB' },
  { value: 'greenside_bunker', label: 'GS Bnk', icon: 'GB' },
  { value: 'hardpan', label: 'Hardpan', icon: 'HP' },
  { value: 'uphill', label: 'Uphill', icon: 'UH' },
  { value: 'downhill', label: 'Downhill', icon: 'DH' },
];

const NAV_ITEMS: { key: View; label: string; icon: string }[] = [
  { key: 'caddie', label: 'Caddie', icon: 'C' },
  { key: 'strategy', label: 'Strategy', icon: 'S' },
  { key: 'scorecard', label: 'Score', icon: '#' },
  { key: 'practice', label: 'Practice', icon: 'P' },
  { key: 'mybag', label: 'Bag', icon: 'B' },
  { key: 'course', label: 'Course', icon: 'G' },
  { key: 'analysis', label: 'Stats', icon: 'A' },
  { key: 'achievements', label: 'Badges', icon: 'W' },
];

function migrateClubProfile(c: Record<string, unknown>): Record<string, unknown> {
  // Migrate old *Yards properties to *Meters (values stay as-is since they were already approximate)
  const renames: [string, string][] = [
    ['averageCarryYards', 'averageCarryMeters'],
    ['totalDistanceYards', 'totalDistanceMeters'],
    ['standardDeviationYards', 'standardDeviationMeters'],
    ['lateralDispersionYards', 'lateralDispersionMeters'],
  ];
  for (const [old, next] of renames) {
    if (old in c && !(next in c)) {
      c[next] = Math.round((c[old] as number) * 0.9144);
      delete c[old];
    }
  }
  return c;
}

function loadSavedPlayer(): PlayerProfile | null {
  try {
    const saved = localStorage.getItem('golf-caddie-player');
    if (!saved) return null;
    const data = JSON.parse(saved);
    // Migrate old yard-based club data to metres
    if (data.clubs?.length > 0 && 'averageCarryYards' in data.clubs[0]) {
      data.clubs = data.clubs.map((c: Record<string, unknown>) => migrateClubProfile(c));
      localStorage.setItem('golf-caddie-player', JSON.stringify(data));
    }
    return data;
  } catch { /* ignore */ }
  return null;
}

function isOnboarded(): boolean {
  return localStorage.getItem('golf-caddie-onboarded') === 'true';
}

export function App() {
  const [showWelcome, setShowWelcome] = useState(!isOnboarded());
  const [player, setPlayer] = useState<PlayerProfile>(loadSavedPlayer() ?? SAMPLE_PLAYER);
  const [course, setCourse] = useState<CourseData>(SAMPLE_COURSE);
  const [caddie, setCaddie] = useState<AICaddie | null>(null);
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  const [strategies, setStrategies] = useState<HoleStrategy[]>([]);
  const [currentRec, setCurrentRec] = useState<ShotRecommendation | null>(null);
  const [voiceResponse, setVoiceResponse] = useState<VoiceCaddieResponse | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [lie, setLie] = useState<LieCondition>('tee');
  const [view, setView] = useState<View>('caddie');
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<(number | null)[]>(Array(18).fill(null));
  const [roundSaved, setRoundSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(loadUnitPreference());

  // GPS tracking
  const currentHoleData = course.holes[(currentHole ?? 1) - 1] ?? null;
  const gps = useGPSTracking(currentHoleData, gpsEnabled);

  const toggleUnit = useCallback(() => {
    setDistanceUnit(prev => {
      const next = prev === 'yards' ? 'meters' : 'yards';
      saveUnitPreference(next);
      return next;
    });
  }, []);

  const toggleGPS = useCallback(() => {
    setGpsEnabled(prev => !prev);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const initCaddie = useCallback(async (playerProfile: PlayerProfile, courseData: CourseData) => {
    setLoading(true);
    const playerModel = new PlayerModel(playerProfile);
    const weatherProvider = new MockWeatherProvider({
      windSpeedMph: 8 + Math.round(Math.random() * 12),
      windDirectionDeg: Math.round(Math.random() * 360),
      temperatureF: 62 + Math.round(Math.random() * 20),
      humidity: 40 + Math.round(Math.random() * 30),
    });
    const weatherService = new WeatherService(weatherProvider);
    const ai = new AICaddie(playerModel, weatherService, {
      voiceEnabled: false,
      pressureMode: true,
    });

    const result = await ai.startRound(courseData);
    setWeather(result.weather);
    setStrategies(result.strategy);
    setCaddie(ai);
    setCurrentHole(1);
    setLie('tee');
    setScores(Array(18).fill(null));
    setRoundSaved(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!showWelcome) initCaddie(player, course);
  }, [showWelcome]);

  const handleWelcomeComplete = useCallback((newPlayer: PlayerProfile) => {
    setPlayer(newPlayer);
    setShowWelcome(false);
  }, []);

  const handlePlayerSave = useCallback((updated: PlayerProfile) => {
    setPlayer(updated);
    initCaddie(updated, course);
    showToast('Bag saved — caddie updated');
  }, [course, initCaddie, showToast]);

  const handleCourseSelect = useCallback((selected: CourseData) => {
    setCourse(selected);
    initCaddie(player, selected);
    setView('caddie');
    showToast(`Playing ${selected.name}`);
  }, [player, initCaddie, showToast]);

  const handleScoreChange = useCallback((hole: number, score: number | null) => {
    setScores(prev => {
      const next = [...prev];
      next[hole - 1] = score;
      return next;
    });
    setRoundSaved(false);
  }, []);

  const handleSaveRound = useCallback(() => {
    const holesPlayed = scores.filter(s => s !== null).length;
    if (holesPlayed === 0) return;

    const totalScore = scores.reduce((s: number, v) => s + (v ?? 0), 0);
    const playedPar = scores.reduce((sum: number, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);

    const record: RoundRecord = {
      id: `round-${Date.now()}`,
      date: new Date().toISOString(),
      courseId: course.id,
      courseName: course.name,
      scores,
      totalScore,
      scoreToPar: totalScore - playedPar,
      holesPlayed,
    };

    saveRound(record);
    setRoundSaved(true);

    const rounds = loadRoundHistory();
    const practiceCount = loadPracticeCount();
    const newBadges = checkAchievements(rounds, practiceCount);
    if (newBadges.length > 0) {
      showToast(`Achievement unlocked: ${newBadges[0].name}!`);
    } else {
      showToast('Round saved!');
    }
  }, [scores, course, showToast]);

  const handleNavigateHole = useCallback((hole: number) => {
    setCurrentHole(hole);
    setLie('tee');
    setView('caddie');
  }, []);

  const getRecommendation = useCallback(() => {
    if (!caddie) return;
    const hole = course.holes[currentHole - 1];

    // Use GPS position when tracking, otherwise estimate
    let pos;
    if (gps.position && gps.status === 'tracking') {
      pos = gps.position;
    } else if (lie === 'tee') {
      pos = hole.teePosition;
    } else {
      pos = {
        lat: (hole.teePosition.lat + hole.pinPosition.lat) / 2,
        lng: (hole.teePosition.lng + hole.pinPosition.lng) / 2,
      };
    }

    const { recommendation, voice } = caddie.getRecommendation(pos, lie);
    setCurrentRec(recommendation);
    setVoiceResponse(voice);
  }, [caddie, currentHole, lie, course, gps.position, gps.status]);

  useEffect(() => {
    if (caddie) getRecommendation();
  }, [caddie, currentHole, lie, getRecommendation]);

  const handleNextHole = () => {
    if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
      setLie('tee');
      caddie?.nextHole();
    }
  };

  const handlePrevHole = () => {
    if (currentHole > 1) {
      setCurrentHole(currentHole - 1);
      setLie('tee');
    }
  };

  if (showWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingContent}>
          <div style={styles.loadingIcon}>
            <div style={styles.loadingSpinner} />
          </div>
          <div style={styles.loadingTitle}>AI Golf Caddie</div>
          <div style={styles.loadingBar}>
            <div style={styles.loadingBarFill} />
          </div>
          <div style={styles.loadingSubtext}>Analyzing course conditions...</div>
        </div>
      </div>
    );
  }

  const hole = course.holes[currentHole - 1];
  const holesPlayed = scores.filter(s => s !== null).length;
  const currentScore = scores.reduce((s: number, v) => s + (v ?? 0), 0);
  const currentPar = scores.reduce((sum: number, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);
  const scoreToPar = holesPlayed > 0 ? currentScore - currentPar : 0;

  return (
    <div style={styles.app}>
      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Compact Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>{course.name}</span>
          <div style={styles.headerMeta}>
            {weather && (
              <span style={styles.weatherInline}>{weather.temperatureF}°F / {weather.windSpeedMph}mph {windDirection(weather.windDirectionDeg)}</span>
            )}
            <button onClick={toggleGPS} style={{
              ...styles.gpsPill,
              ...(gpsEnabled ? styles.gpsPillActive : {}),
            }}>
              {gps.status === 'tracking' ? '● GPS' : '○ GPS'}
            </button>
            <button onClick={toggleUnit} style={styles.gpsPill}>
              {distanceUnit === 'yards' ? 'YD' : 'M'}
            </button>
          </div>
        </div>
        {holesPlayed > 0 && (
          <div style={styles.liveScore}>
            <div style={{
              ...styles.liveScoreValue,
              color: scoreToPar === 0 ? '#22c55e' : scoreToPar > 0 ? '#ef4444' : '#3b82f6',
            }}>
              {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
            </div>
            <div style={styles.liveScoreLabel}>thru {holesPlayed}</div>
          </div>
        )}
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        <div style={styles.navScroll}>
          {NAV_ITEMS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                ...styles.navBtn,
                ...(view === v.key ? styles.navBtnActive : {}),
              }}
            >
              <span style={{
                ...styles.navLabel,
                ...(view === v.key ? styles.navLabelActive : {}),
              }}>
                {v.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'caddie' && (
          <>
            {/* Hole Navigation — top, compact */}
            <div style={styles.holeNav}>
              <button
                onClick={handlePrevHole}
                style={{ ...styles.holeNavBtn, ...(currentHole <= 1 ? styles.holeNavBtnDisabled : {}) }}
                disabled={currentHole <= 1}
              >
                &#9664;
              </button>

              <div style={styles.holeNavCenter}>
                <div style={styles.holeNavDots}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <div
                      key={i}
                      onClick={() => { setCurrentHole(i + 1); setLie('tee'); caddie?.nextHole(); }}
                      style={{
                        ...styles.holeDot,
                        ...(i + 1 === currentHole ? styles.holeDotActive : {}),
                        ...(scores[i] !== null ? styles.holeDotPlayed : {}),
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleNextHole}
                style={{ ...styles.holeNavBtn, ...(currentHole >= 18 ? styles.holeNavBtnDisabled : {}) }}
                disabled={currentHole >= 18}
              >
                &#9654;
              </button>
            </div>

            {/* Hole Flyover (includes its own hole info header) */}
            <HoleFlyover
              hole={hole}
              currentHole={currentHole}
              recommendation={currentRec}
              player={player}
              gpsPosition={gps.position}
              gpsAccuracy={gps.accuracy}
              distanceToPin={gps.distanceToPin}
              unit={distanceUnit}
              voiceText={voiceResponse?.spokenText}
            />

            {/* Shot Recommendation — above score */}
            {currentRec && voiceResponse && (
              <ShotCard
                recommendation={currentRec}
                voiceText={voiceResponse.spokenText}
              />
            )}

            {/* Combined Score + Lie row */}
            <div style={styles.scoreAndLie}>
              <div style={styles.scoreSide}>
                <div style={styles.scoreSideHeader}>
                  <span style={styles.scoreSideLabel}>SCORE</span>
                  {scores[currentHole - 1] !== null && (
                    <span style={{
                      ...styles.quickScoreResult,
                      color: scores[currentHole - 1]! < hole.par ? '#22c55e'
                        : scores[currentHole - 1]! === hole.par ? '#8faa97'
                        : scores[currentHole - 1]! === hole.par + 1 ? '#f59e0b'
                        : '#ef4444',
                    }}>
                      {scores[currentHole - 1]! < hole.par ? scoreLabel(scores[currentHole - 1]! - hole.par)
                        : scores[currentHole - 1]! === hole.par ? 'Par'
                        : scores[currentHole - 1]! === hole.par + 1 ? 'Bogey'
                        : `+${scores[currentHole - 1]! - hole.par}`}
                    </span>
                  )}
                </div>
                <div style={styles.quickScoreRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => {
                    const isActive = scores[currentHole - 1] === s;
                    const isPar = s === hole.par;
                    const diff = s - hole.par;
                    let btnColor = '#1e4d2b';
                    if (isActive) {
                      btnColor = diff < 0 ? '#22c55e' : diff === 0 ? '#3b82f6' : diff === 1 ? '#f59e0b' : '#ef4444';
                    }
                    return (
                      <button
                        key={s}
                        onClick={() => handleScoreChange(currentHole, isActive ? null : s)}
                        style={{
                          ...styles.quickScoreBtn,
                          ...(isActive ? { background: btnColor, color: '#0d1f17', borderColor: btnColor } : {}),
                          ...(isPar && !isActive ? { borderColor: '#22c55e50' } : {}),
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={styles.lieSide}>
                <div style={styles.scoreSideLabel}>LIE</div>
                <div style={styles.lieOptions}>
                  {LIE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setLie(opt.value)}
                      style={{
                        ...styles.lieBtn,
                        ...(lie === opt.value ? styles.lieBtnActive : {}),
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {view === 'strategy' && (
          <StrategyPanel strategies={strategies} currentHole={currentHole} />
        )}

        {view === 'scorecard' && (
          <>
            <Scorecard
              course={course}
              scores={scores}
              onScoreChange={handleScoreChange}
              currentHole={currentHole}
              onNavigateHole={handleNavigateHole}
            />
            {holesPlayed > 0 && (
              <button
                style={{
                  ...styles.saveRoundBtn,
                  ...(roundSaved ? styles.saveRoundBtnSaved : {}),
                }}
                onClick={handleSaveRound}
                disabled={roundSaved}
              >
                {roundSaved ? 'Round Saved' : 'Save Round'}
              </button>
            )}
          </>
        )}

        {view === 'practice' && <PracticeMode />}
        {view === 'mybag' && <MyBagPanel player={player} onSave={handlePlayerSave} />}
        {view === 'course' && <CourseSelectPanel selectedCourseId={course.id} onSelect={handleCourseSelect} />}
        {view === 'analysis' && <AnalysisPanel player={player} />}
        {view === 'achievements' && <AchievementsPanel />}
      </main>
    </div>
  );
}

function windDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function scoreLabel(diff: number): string {
  if (diff === -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  return '';
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    maxWidth: 480,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#0d1f17',
    position: 'relative' as const,
  },
  toast: {
    position: 'fixed' as const,
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 20px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    fontSize: 12,
    fontWeight: 700,
    zIndex: 200,
    boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
    animation: 'slideDown 0.3s ease',
  },
  loadingScreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(180deg, #0d1f17 0%, #091510 100%)',
  },
  loadingContent: { textAlign: 'center' as const },
  loadingIcon: { width: 56, height: 56, margin: '0 auto 16px', position: 'relative' as const },
  loadingSpinner: { width: 56, height: 56, border: '3px solid #132e1f', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingTitle: { fontSize: 22, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.5 },
  loadingBar: { width: 180, height: 3, background: '#132e1f', borderRadius: 2, marginTop: 16, overflow: 'hidden' },
  loadingBarFill: { width: '60%', height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 2, animation: 'loadingPulse 1.5s ease infinite' },
  loadingSubtext: { fontSize: 11, color: '#5a7a65', marginTop: 10 },

  // Compact header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #132e1f',
    background: '#0d1f17',
  },
  headerLeft: {},
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: -0.3,
  },
  weatherInline: {
    fontSize: 10,
    color: '#5a7a65',
    fontWeight: 500,
  },
  gpsPill: {
    padding: '2px 7px',
    borderRadius: 6,
    border: '1px solid #1e4d2b',
    background: 'transparent',
    color: '#5a7a65',
    fontSize: 9,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
  gpsPillActive: {
    background: '#22c55e18',
    borderColor: '#22c55e50',
    color: '#22c55e',
  },
  liveScore: { textAlign: 'right' as const },
  liveScoreValue: { fontSize: 22, fontWeight: 900, lineHeight: 1 },
  liveScoreLabel: { fontSize: 9, color: '#5a7a65', textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  // Nav
  nav: { borderBottom: '1px solid #132e1f', background: '#0d1f17' },
  navScroll: { display: 'flex', overflowX: 'auto' as const, gap: 1, padding: '4px 6px', scrollbarWidth: 'none' as const },
  navBtn: { flex: '0 0 auto', padding: '6px 10px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', transition: 'all 0.15s', minWidth: 0 },
  navBtnActive: { background: '#22c55e18' },
  navLabel: { fontSize: 11, fontWeight: 600, color: '#5a7a65', whiteSpace: 'nowrap' as const },
  navLabelActive: { color: '#22c55e', fontWeight: 700 },
  main: { padding: '10px 10px 20px' },

  // Hole navigation — compact row at top
  holeNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  holeNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid #1e4d2b',
    background: '#132e1f',
    color: '#8faa97',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  holeNavBtnDisabled: { opacity: 0.25, cursor: 'default' },
  holeNavCenter: { flex: 1, display: 'flex', justifyContent: 'center' },
  holeNavDots: { display: 'flex', gap: 4, justifyContent: 'center' },
  holeDot: { width: 8, height: 8, borderRadius: '50%', background: '#1e4d2b', cursor: 'pointer', transition: 'all 0.15s' },
  holeDotActive: { background: '#22c55e', transform: 'scale(1.3)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' },
  holeDotPlayed: { background: '#5a7a65' },

  // Combined score + lie section
  scoreAndLie: {
    background: '#091510',
    borderRadius: 14,
    border: '1px solid #1e4d2b',
    marginBottom: 10,
    overflow: 'hidden',
  },
  scoreSide: {
    padding: '10px 12px',
    borderBottom: '1px solid #132e1f',
  },
  scoreSideHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreSideLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#5a7a65',
    letterSpacing: 1,
  },
  quickScoreResult: { fontSize: 11, fontWeight: 700 },
  quickScoreRow: { display: 'flex', gap: 4 },
  quickScoreBtn: {
    flex: 1,
    padding: '8px 0',
    borderRadius: 8,
    border: '1.5px solid #1e4d2b',
    background: 'transparent',
    color: '#8faa97',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s',
  },
  lieSide: {
    padding: '8px 12px 10px',
  },
  lieOptions: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6 },
  lieBtn: {
    padding: '4px 10px',
    borderRadius: 16,
    border: '1px solid #1e4d2b',
    background: 'transparent',
    color: '#8faa97',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  lieBtnActive: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    borderColor: '#22c55e',
    fontWeight: 700,
    boxShadow: '0 2px 6px rgba(34,197,94,0.3)',
  },

  // Save round
  saveRoundBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 12,
    boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
    transition: 'all 0.15s',
  },
  saveRoundBtnSaved: {
    background: '#1e4d2b',
    color: '#8faa97',
    cursor: 'default',
    boxShadow: 'none',
  },
};

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
import { HoleInfo } from './HoleInfo';
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

function loadSavedPlayer(): PlayerProfile | null {
  try {
    const saved = localStorage.getItem('golf-caddie-player');
    if (saved) return JSON.parse(saved);
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

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoContainer}>
            <div style={styles.logoCircle} />
            <span style={styles.logoText}>AI</span>
          </div>
          <div style={styles.headerInfo}>
            <span style={styles.title}>Golf Caddie</span>
            <div style={styles.courseLabel}>{course.name}</div>
          </div>
        </div>
        <div style={styles.headerRight}>
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
          {weather && (
            <div style={styles.weatherBadge}>
              <div style={styles.weatherTemp}>{weather.temperatureF}°F</div>
              <div style={styles.weatherWind}>
                {weather.windSpeedMph}mph {windDirection(weather.windDirectionDeg)}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Controls Bar */}
      <div style={styles.controlsBar}>
        <button onClick={toggleGPS} style={{
          ...styles.controlBtn,
          ...(gpsEnabled ? styles.controlBtnActive : {}),
        }}>
          <span style={styles.controlIcon}>{gps.status === 'tracking' ? '●' : '○'}</span>
          <span>{gpsEnabled ? (gps.status === 'tracking' ? 'GPS Live' : gps.status === 'acquiring' ? 'Acquiring...' : 'GPS Error') : 'GPS Off'}</span>
        </button>

        {gps.status === 'tracking' && gps.distanceToPin !== null && (
          <div style={styles.gpsDistBadge}>
            <span style={styles.gpsDistLabel}>TO PIN</span>
            <span style={styles.gpsDistValue}>
              {convertDistance(gps.distanceToPin, distanceUnit)} {distanceAbbrev(distanceUnit)}
            </span>
          </div>
        )}

        <button onClick={toggleUnit} style={styles.controlBtn}>
          <span style={styles.controlIcon}>↔</span>
          <span>{distanceUnit === 'yards' ? 'Yards' : 'Meters'}</span>
        </button>
      </div>

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
            {/* Hole Info */}
            <HoleInfo hole={hole} currentHole={currentHole} />

            {/* Hole Flyover */}
            <HoleFlyover
              hole={hole}
              currentHole={currentHole}
              recommendation={currentRec}
              player={player}
              gpsPosition={gps.position}
              gpsAccuracy={gps.accuracy}
              distanceToPin={gps.distanceToPin}
              unit={distanceUnit}
            />

            {/* Quick Score */}
            <div style={styles.quickScore}>
              <div style={styles.quickScoreHeader}>
                <span style={styles.quickScoreLabel}>SCORE — HOLE {currentHole}</span>
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

            {/* Lie Selector */}
            <div style={styles.lieSelector}>
              <div style={styles.lieSelectorLabel}>CURRENT LIE</div>
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

            {/* Shot Recommendation */}
            {currentRec && voiceResponse && (
              <ShotCard
                recommendation={currentRec}
                voiceText={voiceResponse.spokenText}
              />
            )}

            {/* Hole Navigation */}
            <div style={styles.holeNav}>
              <button
                onClick={handlePrevHole}
                style={{ ...styles.holeNavBtn, ...(currentHole <= 1 ? styles.holeNavBtnDisabled : {}) }}
                disabled={currentHole <= 1}
              >
                <span style={styles.navArrow}>&#9664;</span> Prev
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
                <span style={styles.holeNavLabel}>{currentHole} / 18</span>
              </div>

              <button
                onClick={handleNextHole}
                style={{ ...styles.holeNavBtn, ...(currentHole >= 18 ? styles.holeNavBtnDisabled : {}) }}
                disabled={currentHole >= 18}
              >
                Next <span style={styles.navArrow}>&#9654;</span>
              </button>
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
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 24px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    fontSize: 13,
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
  loadingContent: {
    textAlign: 'center' as const,
  },
  loadingIcon: {
    width: 64,
    height: 64,
    margin: '0 auto 20px',
    position: 'relative' as const,
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    border: '3px solid #132e1f',
    borderTopColor: '#22c55e',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: '#f1f5f9',
    letterSpacing: -0.5,
  },
  loadingBar: {
    width: 200,
    height: 3,
    background: '#132e1f',
    borderRadius: 2,
    marginTop: 20,
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: '60%',
    height: '100%',
    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
    borderRadius: 2,
    animation: 'loadingPulse 1.5s ease infinite',
  },
  loadingSubtext: {
    fontSize: 12,
    color: '#5a7a65',
    marginTop: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #132e1f',
    background: 'linear-gradient(180deg, #0d1f17 0%, #0f2018 100%)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoContainer: {
    position: 'relative' as const,
    width: 36,
    height: 36,
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  },
  logoText: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 14,
    fontWeight: 900,
    color: '#0d1f17',
  },
  headerInfo: {},
  title: {
    fontSize: 16,
    fontWeight: 800,
    color: '#f1f5f9',
    display: 'block',
    letterSpacing: -0.3,
  },
  courseLabel: {
    fontSize: 10,
    color: '#5a7a65',
    marginTop: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  liveScore: {
    textAlign: 'right' as const,
  },
  liveScoreValue: {
    fontSize: 20,
    fontWeight: 900,
    lineHeight: 1,
  },
  liveScoreLabel: {
    fontSize: 9,
    color: '#5a7a65',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  weatherBadge: {
    padding: '6px 10px',
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 10,
    border: '1px solid #1e4d2b',
    flexShrink: 0,
  },
  weatherTemp: {
    fontSize: 12,
    fontWeight: 700,
    color: '#e8f0e8',
  },
  weatherWind: {
    fontSize: 9,
    color: '#5a7a65',
    marginTop: 1,
  },
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    background: '#091510',
    borderBottom: '1px solid #132e1f',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid #1e4d2b',
    background: 'transparent',
    color: '#5a7a65',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  controlBtnActive: {
    background: '#22c55e15',
    borderColor: '#22c55e40',
    color: '#22c55e',
  },
  controlIcon: {
    fontSize: 8,
  },
  gpsDistBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 8,
    background: 'linear-gradient(135deg, #3b82f620 0%, #2563eb15 100%)',
    border: '1px solid #3b82f640',
    marginLeft: 'auto' as const,
  },
  gpsDistLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: '#5a7a65',
    letterSpacing: 0.5,
  },
  gpsDistValue: {
    fontSize: 14,
    fontWeight: 900,
    color: '#60a5fa',
  },
  nav: {
    borderBottom: '1px solid #132e1f',
    background: '#0d1f17',
  },
  navScroll: {
    display: 'flex',
    overflowX: 'auto' as const,
    gap: 2,
    padding: '6px 8px',
    scrollbarWidth: 'none' as const,
  },
  navBtn: {
    flex: '0 0 auto',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: 0,
  },
  navBtnActive: {
    background: 'linear-gradient(135deg, #22c55e20 0%, #16a34a15 100%)',
  },
  navLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#5a7a65',
    whiteSpace: 'nowrap' as const,
  },
  navLabelActive: {
    color: '#22c55e',
    fontWeight: 700,
  },
  main: {
    padding: '14px 14px 24px',
  },
  quickScore: {
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    borderRadius: 14,
    padding: '12px 14px',
    marginBottom: 12,
    border: '1px solid #1e4d2b',
  },
  quickScoreHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickScoreLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#5a7a65',
    letterSpacing: 1,
  },
  quickScoreResult: {
    fontSize: 12,
    fontWeight: 700,
  },
  quickScoreRow: {
    display: 'flex',
    gap: 5,
  },
  quickScoreBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    border: '1.5px solid #1e4d2b',
    background: 'transparent',
    color: '#8faa97',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s',
  },
  lieSelector: {
    marginBottom: 14,
  },
  lieSelectorLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#5a7a65',
    marginBottom: 8,
    letterSpacing: 1,
  },
  lieOptions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 5,
  },
  lieBtn: {
    padding: '6px 12px',
    borderRadius: 20,
    border: '1px solid #1e4d2b',
    background: 'transparent',
    color: '#8faa97',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  lieBtnActive: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    borderColor: '#22c55e',
    fontWeight: 700,
    boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
  },
  holeNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: '14px 0',
    borderTop: '1px solid #132e1f',
  },
  holeNavBtn: {
    padding: '10px 16px',
    borderRadius: 10,
    border: '1px solid #1e4d2b',
    background: 'linear-gradient(135deg, #132e1f 0%, #1a3a28 100%)',
    color: '#e8f0e8',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
  },
  holeNavBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  navArrow: {
    fontSize: 8,
  },
  holeNavCenter: {
    textAlign: 'center' as const,
  },
  holeNavDots: {
    display: 'flex',
    gap: 3,
    justifyContent: 'center',
    marginBottom: 4,
  },
  holeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#1e4d2b',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  holeDotActive: {
    background: '#22c55e',
    transform: 'scale(1.4)',
  },
  holeDotPlayed: {
    background: '#5a7a65',
  },
  holeNavLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8faa97',
  },
  saveRoundBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0d1f17',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 16,
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

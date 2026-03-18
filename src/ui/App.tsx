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
import {
  saveRound, loadRoundHistory, checkAchievements, loadPracticeCount,
  type RoundRecord,
} from '../core/achievements';

type View = 'caddie' | 'strategy' | 'scorecard' | 'practice' | 'mybag' | 'course' | 'analysis' | 'achievements';

const LIE_OPTIONS: { value: LieCondition; label: string }[] = [
  { value: 'tee', label: 'Tee' },
  { value: 'fairway', label: 'Fairway' },
  { value: 'light_rough', label: 'Light Rough' },
  { value: 'heavy_rough', label: 'Heavy Rough' },
  { value: 'fairway_bunker', label: 'FW Bunker' },
  { value: 'greenside_bunker', label: 'GS Bunker' },
  { value: 'hardpan', label: 'Hardpan' },
  { value: 'uphill', label: 'Uphill' },
  { value: 'downhill', label: 'Downhill' },
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
  const [showMore, setShowMore] = useState(false);

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
    const playedPar = scores.reduce((sum, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);

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

    // Check achievements
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
    const pos = lie === 'tee' ? hole.teePosition : {
      lat: (hole.teePosition.lat + hole.pinPosition.lat) / 2,
      lng: (hole.teePosition.lng + hole.pinPosition.lng) / 2,
    };
    const { recommendation, voice } = caddie.getRecommendation(pos, lie);
    setCurrentRec(recommendation);
    setVoiceResponse(voice);
  }, [caddie, currentHole, lie, course]);

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

  // Welcome screen
  if (showWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingLogo}>⛳</div>
        <div style={styles.loadingText}>AI Golf Caddie</div>
        <div style={styles.loadingBar}>
          <div style={styles.loadingBarFill} />
        </div>
        <div style={styles.loadingSubtext}>Analyzing course conditions...</div>
      </div>
    );
  }

  const hole = course.holes[currentHole - 1];
  const holesPlayed = scores.filter(s => s !== null).length;
  const currentScore = scores.reduce((s: number, v) => s + (v ?? 0), 0);
  const currentPar = scores.reduce((sum, s, i) => s !== null ? sum + course.holes[i].par : sum, 0);
  const scoreToPar = holesPlayed > 0 ? currentScore - currentPar : 0;

  const PRIMARY_NAV: { key: View; label: string }[] = [
    { key: 'caddie', label: 'Caddie' },
    { key: 'strategy', label: 'Strategy' },
    { key: 'scorecard', label: 'Scorecard' },
    { key: 'practice', label: 'Practice' },
  ];

  const SECONDARY_NAV: { key: View; label: string }[] = [
    { key: 'mybag', label: 'My Bag' },
    { key: 'course', label: 'Course' },
    { key: 'analysis', label: 'Stats' },
    { key: 'achievements', label: 'Badges' },
  ];

  const isSecondary = SECONDARY_NAV.some(n => n.key === view);

  return (
    <div style={styles.app}>
      {/* Toast */}
      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>⛳</div>
          <div>
            <span style={styles.title}>AI Golf Caddie</span>
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
              {weather.temperatureF}° · {weather.windSpeedMph}mph {windDirection(weather.windDirectionDeg)}
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {PRIMARY_NAV.map(v => (
          <button
            key={v.key}
            onClick={() => { setView(v.key); setShowMore(false); }}
            style={{
              ...styles.navBtn,
              ...(view === v.key ? styles.navBtnActive : {}),
            }}
          >
            {v.label}
          </button>
        ))}
        <button
          onClick={() => setShowMore(!showMore)}
          style={{
            ...styles.navBtn,
            ...(isSecondary || showMore ? styles.navBtnActive : {}),
          }}
        >
          More
        </button>
      </nav>

      {/* Secondary Nav Dropdown */}
      {showMore && (
        <div style={styles.moreNav}>
          {SECONDARY_NAV.map(v => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setShowMore(false); }}
              style={{
                ...styles.moreNavBtn,
                ...(view === v.key ? styles.moreNavBtnActive : {}),
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'caddie' && (
          <>
            <HoleInfo hole={hole} currentHole={currentHole} />

            {/* Quick Score Entry */}
            <div style={styles.quickScore}>
              <span style={styles.quickScoreLabel}>Score for Hole {currentHole}:</span>
              <div style={styles.quickScoreRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <button
                    key={s}
                    onClick={() => handleScoreChange(currentHole, scores[currentHole - 1] === s ? null : s)}
                    style={{
                      ...styles.quickScoreBtn,
                      ...(scores[currentHole - 1] === s ? styles.quickScoreBtnActive : {}),
                      ...(s === hole.par ? styles.quickScoreBtnPar : {}),
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Lie Selector */}
            <div style={styles.lieSelector}>
              <div style={styles.lieSelectorLabel}>Current Lie:</div>
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
              <button onClick={handlePrevHole} style={styles.holeNavBtn} disabled={currentHole <= 1}>
                ← Prev
              </button>
              <span style={styles.holeNavLabel}>Hole {currentHole} / 18</span>
              <button onClick={handleNextHole} style={styles.holeNavBtn} disabled={currentHole >= 18}>
                Next →
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

const styles: Record<string, React.CSSProperties> = {
  app: {
    maxWidth: 480,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#0f172a',
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
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 700,
    zIndex: 200,
    boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
    animation: 'slideDown 0.3s ease',
  },
  loadingScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #1a1a2e 100%)',
  },
  loadingLogo: { fontSize: 64, marginBottom: 16 },
  loadingText: { fontSize: 24, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.3 },
  loadingBar: {
    width: 200, height: 3, background: '#1e293b', borderRadius: 2,
    marginTop: 20, overflow: 'hidden',
  },
  loadingBarFill: {
    width: '60%', height: '100%',
    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
    borderRadius: 2,
    animation: 'loadingPulse 1.5s ease infinite',
  },
  loadingSubtext: { fontSize: 13, color: '#64748b', marginTop: 12 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e293b',
    background: 'linear-gradient(180deg, #0f172a 0%, #0f172aee 100%)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: {
    fontSize: 28,
    flexShrink: 0,
    lineHeight: 1,
  },
  title: { fontSize: 15, fontWeight: 800, color: '#f1f5f9', display: 'block', letterSpacing: -0.2 },
  courseLabel: { fontSize: 10, color: '#64748b', marginTop: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  liveScore: {
    textAlign: 'right' as const,
    paddingRight: 8,
  },
  liveScoreValue: { fontSize: 18, fontWeight: 900 },
  liveScoreLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase' as const },
  weatherBadge: {
    fontSize: 10,
    padding: '4px 8px',
    background: '#1e293b',
    borderRadius: 8,
    color: '#94a3b8',
    flexShrink: 0,
  },
  nav: {
    display: 'flex',
    gap: 2,
    padding: '6px 8px',
    borderBottom: '1px solid #1e293b',
  },
  navBtn: {
    flex: 1,
    padding: '9px 4px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.15s',
  },
  navBtnActive: {
    background: '#1e293b',
    color: '#22c55e',
  },
  moreNav: {
    display: 'flex',
    gap: 4,
    padding: '8px 12px',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
  },
  moreNavBtn: {
    flex: 1,
    padding: '8px 4px',
    border: 'none',
    borderRadius: 8,
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  moreNavBtnActive: {
    background: '#22c55e20',
    color: '#22c55e',
  },
  main: {
    padding: '14px 14px',
  },
  quickScore: {
    background: '#1e293b',
    borderRadius: 10,
    padding: '10px 12px',
    marginBottom: 12,
  },
  quickScoreLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 8,
    display: 'block',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  quickScoreRow: {
    display: 'flex',
    gap: 4,
  },
  quickScoreBtn: {
    flex: 1,
    padding: '8px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.1s',
  },
  quickScoreBtnActive: {
    background: '#22c55e',
    color: '#0f172a',
    borderColor: '#22c55e',
  },
  quickScoreBtnPar: {
    borderColor: '#22c55e40',
  },
  lieSelector: {
    marginBottom: 14,
  },
  lieSelectorLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  lieOptions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 5,
  },
  lieBtn: {
    padding: '5px 10px',
    borderRadius: 14,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  lieBtnActive: {
    background: '#22c55e',
    color: '#0f172a',
    borderColor: '#22c55e',
    fontWeight: 700,
  },
  holeNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: '10px 0',
    borderTop: '1px solid #1e293b',
  },
  holeNavBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  holeNavLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  saveRoundBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 16,
    transition: 'all 0.15s',
  },
  saveRoundBtnSaved: {
    background: '#334155',
    color: '#94a3b8',
    cursor: 'default',
  },
};

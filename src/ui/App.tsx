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

type View = 'caddie' | 'strategy' | 'analysis' | 'mybag' | 'course' | 'practice';

const LIE_OPTIONS: { value: LieCondition; label: string }[] = [
  { value: 'tee', label: 'Tee' },
  { value: 'fairway', label: 'Fairway' },
  { value: 'light_rough', label: 'Light Rough' },
  { value: 'heavy_rough', label: 'Heavy Rough' },
  { value: 'fairway_bunker', label: 'Fairway Bunker' },
  { value: 'greenside_bunker', label: 'Greenside Bunker' },
  { value: 'hardpan', label: 'Hardpan' },
  { value: 'uphill', label: 'Uphill' },
  { value: 'downhill', label: 'Downhill' },
];

function loadSavedPlayer(): PlayerProfile {
  try {
    const saved = localStorage.getItem('golf-caddie-player');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return SAMPLE_PLAYER;
}

export function App() {
  const [player, setPlayer] = useState<PlayerProfile>(loadSavedPlayer);
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

  const initCaddie = useCallback(async (playerProfile: PlayerProfile, courseData: CourseData) => {
    setLoading(true);
    const playerModel = new PlayerModel(playerProfile);
    const weatherProvider = new MockWeatherProvider({
      windSpeedMph: 10,
      windDirectionDeg: 200,
      temperatureF: 72,
      humidity: 55,
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
    setLoading(false);
  }, []);

  useEffect(() => {
    initCaddie(player, course);
  }, []);

  const handlePlayerSave = useCallback((updated: PlayerProfile) => {
    setPlayer(updated);
    initCaddie(updated, course);
  }, [course, initCaddie]);

  const handleCourseSelect = useCallback((selected: CourseData) => {
    setCourse(selected);
    initCaddie(player, selected);
    setView('caddie');
  }, [player, initCaddie]);

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

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingLogo}>⛳</div>
        <div style={styles.loadingText}>AI Golf Caddie</div>
        <div style={styles.loadingSubtext}>Analyzing course conditions...</div>
      </div>
    );
  }

  const hole = course.holes[currentHole - 1];

  const NAV_ITEMS: { key: View; label: string }[] = [
    { key: 'caddie', label: 'Caddie' },
    { key: 'strategy', label: 'Strategy' },
    { key: 'practice', label: 'Practice' },
    { key: 'mybag', label: 'My Bag' },
    { key: 'course', label: 'Course' },
    { key: 'analysis', label: 'Stats' },
  ];

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⛳</span>
          <div>
            <span style={styles.title}>AI Caddie</span>
            <div style={styles.courseBadge}>{course.name}</div>
          </div>
        </div>
        {weather && (
          <div style={styles.weatherBadge}>
            {weather.temperatureF}°F · {weather.windSpeedMph}mph {windDirection(weather.windDirectionDeg)}
          </div>
        )}
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {NAV_ITEMS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            style={{
              ...styles.navBtn,
              ...(view === v.key ? styles.navBtnActive : {}),
            }}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'caddie' && (
          <>
            <HoleInfo hole={hole} currentHole={currentHole} />

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
                ← Prev Hole
              </button>
              <span style={styles.holeNavLabel}>Hole {currentHole} of 18</span>
              <button onClick={handleNextHole} style={styles.holeNavBtn} disabled={currentHole >= 18}>
                Next Hole →
              </button>
            </div>
          </>
        )}

        {view === 'strategy' && (
          <StrategyPanel strategies={strategies} currentHole={currentHole} />
        )}

        {view === 'analysis' && (
          <AnalysisPanel player={player} />
        )}

        {view === 'mybag' && (
          <MyBagPanel player={player} onSave={handlePlayerSave} />
        )}

        {view === 'course' && (
          <CourseSelectPanel selectedCourseId={course.id} onSelect={handleCourseSelect} />
        )}

        {view === 'practice' && (
          <PracticeMode />
        )}
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
  },
  loadingScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0f172a',
  },
  loadingLogo: { fontSize: 64, marginBottom: 16 },
  loadingText: { fontSize: 24, fontWeight: 700, color: '#e2e8f0' },
  loadingSubtext: { fontSize: 14, color: '#64748b', marginTop: 8 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1e293b',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { fontSize: 24 },
  title: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', display: 'block' },
  courseBadge: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  weatherBadge: {
    fontSize: 11,
    padding: '4px 10px',
    background: '#1e293b',
    borderRadius: 12,
    color: '#94a3b8',
    flexShrink: 0,
  },
  nav: {
    display: 'flex',
    gap: 2,
    padding: '6px 8px',
    borderBottom: '1px solid #1e293b',
    overflowX: 'auto' as const,
  },
  navBtn: {
    flex: '0 0 auto',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  navBtnActive: {
    background: '#1e293b',
    color: '#22c55e',
  },
  main: {
    padding: '16px 16px',
  },
  lieSelector: {
    marginBottom: 16,
  },
  lieSelectorLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  lieOptions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  lieBtn: {
    padding: '6px 12px',
    borderRadius: 16,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
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
    marginTop: 20,
    padding: '12px 0',
    borderTop: '1px solid #1e293b',
  },
  holeNavBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
  },
  holeNavLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e2e8f0',
  },
};

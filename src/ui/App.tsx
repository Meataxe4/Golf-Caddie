import React, { useState, useEffect, useCallback } from 'react';
import { PlayerModel } from '../models/player-model';
import { AICaddie } from '../core/caddie';
import { WeatherService, MockWeatherProvider } from '../services/weather-service';
import { SAMPLE_PLAYER } from '../data/sample-player';
import { SAMPLE_COURSE } from '../data/sample-course';
import type {
  ShotRecommendation, HoleStrategy, WeatherConditions,
  LieCondition, VoiceCaddieResponse,
} from '../models/types';
import { ShotCard } from './ShotCard';
import { HoleInfo } from './HoleInfo';
import { StrategyPanel } from './StrategyPanel';
import { AnalysisPanel } from './AnalysisPanel';

type View = 'caddie' | 'strategy' | 'analysis';

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

export function App() {
  const [caddie, setCaddie] = useState<AICaddie | null>(null);
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  const [strategies, setStrategies] = useState<HoleStrategy[]>([]);
  const [currentRec, setCurrentRec] = useState<ShotRecommendation | null>(null);
  const [voiceResponse, setVoiceResponse] = useState<VoiceCaddieResponse | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [lie, setLie] = useState<LieCondition>('tee');
  const [view, setView] = useState<View>('caddie');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const playerModel = new PlayerModel(SAMPLE_PLAYER);
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

      const result = await ai.startRound(SAMPLE_COURSE);
      setWeather(result.weather);
      setStrategies(result.strategy);
      setCaddie(ai);
      setLoading(false);
    }
    init();
  }, []);

  const getRecommendation = useCallback(() => {
    if (!caddie) return;

    const hole = SAMPLE_COURSE.holes[currentHole - 1];
    const pos = lie === 'tee' ? hole.teePosition : {
      lat: (hole.teePosition.lat + hole.pinPosition.lat) / 2,
      lng: (hole.teePosition.lng + hole.pinPosition.lng) / 2,
    };

    const { recommendation, voice } = caddie.getRecommendation(pos, lie);
    setCurrentRec(recommendation);
    setVoiceResponse(voice);
  }, [caddie, currentHole, lie]);

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

  const hole = SAMPLE_COURSE.holes[currentHole - 1];

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⛳</span>
          <span style={styles.title}>AI Caddie</span>
        </div>
        {weather && (
          <div style={styles.weatherBadge}>
            {weather.temperatureF}°F · {weather.windSpeedMph}mph {windDirection(weather.windDirectionDeg)}
          </div>
        )}
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {(['caddie', 'strategy', 'analysis'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...styles.navBtn,
              ...(view === v ? styles.navBtnActive : {}),
            }}
          >
            {v === 'caddie' ? '🎯 Caddie' : v === 'strategy' ? '📋 Strategy' : '📊 Analysis'}
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
          <AnalysisPanel player={SAMPLE_PLAYER} />
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
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  weatherBadge: {
    fontSize: 12,
    padding: '4px 10px',
    background: '#1e293b',
    borderRadius: 12,
    color: '#94a3b8',
  },
  nav: {
    display: 'flex',
    gap: 4,
    padding: '8px 16px',
    borderBottom: '1px solid #1e293b',
  },
  navBtn: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  navBtnActive: {
    background: '#1e293b',
    color: '#22c55e',
  },
  main: {
    padding: '16px 20px',
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

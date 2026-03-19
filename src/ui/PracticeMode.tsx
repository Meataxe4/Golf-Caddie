import React, { useState, useRef, useCallback } from 'react';
import type { Club } from '../models/types';
import { analyzeSwing, type SwingAnalysisResult, type SwingAnalysisInput } from '../core/swing-analyzer';

type PracticeView = 'home' | 'record' | 'upload' | 'results';
type ShotResult = 'straight' | 'fade' | 'draw' | 'slice' | 'hook' | 'push' | 'pull' | 'top' | 'chunk';

const CLUB_OPTIONS: { value: string; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: '3_wood', label: '3 Wood' },
  { value: '5_wood', label: '5 Wood' },
  { value: '5_hybrid', label: '5 Hybrid' },
  { value: '6_iron', label: '6 Iron' },
  { value: '7_iron', label: '7 Iron' },
  { value: '8_iron', label: '8 Iron' },
  { value: '9_iron', label: '9 Iron' },
  { value: 'pw', label: 'PW' },
  { value: 'gw', label: 'GW' },
  { value: 'sw', label: 'SW' },
  { value: 'lw', label: 'LW' },
];

const SHOT_RESULTS: { value: ShotResult; label: string; color: string }[] = [
  { value: 'straight', label: 'Straight', color: '#22c55e' },
  { value: 'fade', label: 'Fade', color: '#3b82f6' },
  { value: 'draw', label: 'Draw', color: '#8b5cf6' },
  { value: 'slice', label: 'Slice', color: '#ef4444' },
  { value: 'hook', label: 'Hook', color: '#f59e0b' },
  { value: 'push', label: 'Push', color: '#f97316' },
  { value: 'pull', label: 'Pull', color: '#ec4899' },
  { value: 'top', label: 'Topped', color: '#5a7a65' },
  { value: 'chunk', label: 'Chunk/Fat', color: '#78716c' },
];

export function PracticeMode() {
  const [view, setView] = useState<PracticeView>('home');
  const [selectedClub, setSelectedClub] = useState('driver');
  const [shotResult, setShotResult] = useState<ShotResult | undefined>(undefined);
  const [analysis, setAnalysis] = useState<SwingAnalysisResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = URL.createObjectURL(blob);
        }
        stream.getTracks().forEach(t => t.stop());
        setHasVideo(true);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch {
      alert('Camera access is required to record your swing. Please allow camera permissions and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [isRecording]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoRef.current) {
      videoRef.current.src = URL.createObjectURL(file);
      setHasVideo(true);
    }
  }, []);

  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    // Simulate processing time for realism
    setTimeout(() => {
      const input: SwingAnalysisInput = {
        durationSeconds: view === 'record' ? Math.max(2, recordingTime) : 3,
        isLiveRecording: view === 'record',
        club: selectedClub,
        reportedResult: shotResult,
      };
      const result = analyzeSwing(input);
      setAnalysis(result);
      setAnalyzing(false);
      setView('results');
    }, 1500);
  }, [selectedClub, shotResult, view, recordingTime]);

  const resetPractice = useCallback(() => {
    setView('home');
    setAnalysis(null);
    setHasVideo(false);
    setShotResult(undefined);
    setRecordingTime(0);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); }
  }, []);

  if (view === 'results' && analysis) {
    return <AnalysisResults analysis={analysis} onBack={resetPractice} />;
  }

  return (
    <div>
      <h2 style={styles.title}>Practice Mode</h2>
      <p style={styles.subtitle}>Record or upload your swing for AI analysis</p>

      {view === 'home' && (
        <>
          {/* Club Selection */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Select Club</div>
            <div style={styles.clubGrid}>
              {CLUB_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setSelectedClub(c.value)}
                  style={{
                    ...styles.clubBtn,
                    ...(selectedClub === c.value ? styles.clubBtnActive : {}),
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shot Result (optional) */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>What did the ball do? (optional)</div>
            <p style={styles.hint}>Telling us your shot result improves the analysis accuracy</p>
            <div style={styles.resultGrid}>
              {SHOT_RESULTS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setShotResult(shotResult === r.value ? undefined : r.value)}
                  style={{
                    ...styles.resultBtn,
                    ...(shotResult === r.value ? { background: r.color, color: '#0d1f17', borderColor: r.color } : {}),
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={styles.section}>
            <button style={styles.primaryBtn} onClick={() => setView('record')}>
              Record My Swing
            </button>
            <button style={styles.secondaryBtn} onClick={() => setView('upload')}>
              Upload Video
            </button>
            {/* Quick analysis without video */}
            <button
              style={styles.quickBtn}
              onClick={() => {
                if (!shotResult) {
                  alert('Please select what the ball did above for a quick analysis without video.');
                  return;
                }
                runAnalysis();
              }}
            >
              Quick Analysis (no video)
            </button>
          </div>
        </>
      )}

      {view === 'record' && (
        <div style={styles.section}>
          <div style={styles.videoContainer}>
            <video
              ref={videoRef}
              style={styles.video}
              playsInline
              muted
            />
            {isRecording && (
              <div style={styles.recordingIndicator}>
                <div style={styles.recordDot} /> REC {recordingTime}s
              </div>
            )}
          </div>

          <div style={styles.recordingTips}>
            <div style={styles.tipsTitle}>Tips for best results:</div>
            <div style={styles.tip}>- Film from the "down the line" or "face on" angle</div>
            <div style={styles.tip}>- Keep your full body in frame</div>
            <div style={styles.tip}>- Ensure good lighting</div>
            <div style={styles.tip}>- Record the full swing (address through finish)</div>
          </div>

          <div style={styles.recordControls}>
            {!isRecording && !hasVideo && (
              <button style={styles.recordBtn} onClick={startRecording}>
                Start Recording
              </button>
            )}
            {isRecording && (
              <button style={styles.stopBtn} onClick={stopRecording}>
                Stop Recording
              </button>
            )}
            {hasVideo && !isRecording && (
              <>
                <button style={styles.primaryBtn} onClick={runAnalysis}>
                  {analyzing ? 'Analyzing...' : 'Analyze My Swing'}
                </button>
                <button style={styles.secondaryBtn} onClick={() => { setHasVideo(false); }}>
                  Re-record
                </button>
              </>
            )}
          </div>

          <button style={styles.backLink} onClick={() => setView('home')}>Back</button>
        </div>
      )}

      {view === 'upload' && (
        <div style={styles.section}>
          <div style={styles.uploadZone}>
            <div style={styles.uploadIcon}>+</div>
            <div style={styles.uploadText}>Tap to select video</div>
            <div style={styles.uploadHint}>MP4, MOV, or WebM</div>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              style={styles.fileInput}
            />
          </div>

          {hasVideo && (
            <>
              <div style={styles.videoContainer}>
                <video ref={videoRef} style={styles.video} controls playsInline />
              </div>
              <button style={styles.primaryBtn} onClick={runAnalysis}>
                {analyzing ? 'Analyzing...' : 'Analyze My Swing'}
              </button>
            </>
          )}

          <button style={styles.backLink} onClick={() => setView('home')}>Back</button>
        </div>
      )}

      {analyzing && (
        <div style={styles.analyzingOverlay}>
          <div style={styles.analyzingContent}>
            <div style={styles.spinner} />
            <div style={styles.analyzingText}>Analyzing your swing...</div>
            <div style={styles.analyzingSubtext}>Detecting swing path, face angle, and tempo</div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Analysis Results Component ---

function AnalysisResults({ analysis, onBack }: { analysis: SwingAnalysisResult; onBack: () => void }) {
  const { metrics, ballFlight, recommendations, overallScore, summary } = analysis;
  const [showTrajectory, setShowTrajectory] = useState(true);

  const scoreColor = overallScore >= 80 ? '#22c55e' : overallScore >= 60 ? '#eab308' : '#ef4444';

  return (
    <div>
      <button style={styles.backLink} onClick={onBack}>New Swing</button>

      <h2 style={styles.title}>Swing Analysis</h2>

      {/* Overall Score */}
      <div style={styles.scoreCard}>
        <div style={{ ...styles.scoreCircle, borderColor: scoreColor }}>
          <div style={{ ...styles.scoreValue, color: scoreColor }}>{overallScore}</div>
          <div style={styles.scoreLabel}>/ 100</div>
        </div>
        <div style={styles.scoreSummary}>{summary}</div>
      </div>

      {/* Ball Flight Trajectory */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Ball Flight
          <button
            style={styles.toggleBtn}
            onClick={() => setShowTrajectory(!showTrajectory)}
          >
            {showTrajectory ? 'Hide' : 'Show'}
          </button>
        </div>

        {showTrajectory && <TrajectoryView ballFlight={ballFlight} />}

        <div style={styles.flightStats}>
          <div style={styles.flightStat}>
            <div style={styles.flightStatValue}>{ballFlight.carryMeters}</div>
            <div style={styles.flightStatLabel}>Carry (m)</div>
          </div>
          <div style={styles.flightStat}>
            <div style={styles.flightStatValue}>{ballFlight.totalMeters}</div>
            <div style={styles.flightStatLabel}>Total (m)</div>
          </div>
          <div style={styles.flightStat}>
            <div style={styles.flightStatValue}>{ballFlight.maxHeightMeters}</div>
            <div style={styles.flightStatLabel}>Max Height</div>
          </div>
          <div style={styles.flightStat}>
            <div style={{ ...styles.flightStatValue, color: getShapeColor(ballFlight.flightShape) }}>
              {ballFlight.flightShape}
            </div>
            <div style={styles.flightStatLabel}>Shape</div>
          </div>
        </div>

        <div style={styles.detailGrid}>
          <DetailRow label="Launch Angle" value={`${ballFlight.launchAngle}°`} />
          <DetailRow label="Launch Direction" value={`${ballFlight.launchDirection > 0 ? '+' : ''}${ballFlight.launchDirection}° ${ballFlight.launchDirection > 0 ? 'right' : ballFlight.launchDirection < 0 ? 'left' : ''}`} />
          <DetailRow label="Spin Rate" value={`${ballFlight.spinRate.toLocaleString()} rpm`} />
          <DetailRow label="Curve" value={`${Math.abs(ballFlight.curveMeters)} m ${ballFlight.curveMeters > 0 ? 'right' : 'left'}`} />
          <DetailRow label="Landing Angle" value={`${ballFlight.landingAngle}°`} />
        </div>
      </div>

      {/* Swing Metrics */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Swing Metrics</div>
        <div style={styles.metricsGrid}>
          <MetricCard
            label="Swing Path"
            value={`${metrics.swingPathDegrees > 0 ? '+' : ''}${metrics.swingPathDegrees}°`}
            subtitle={metrics.swingPath.replace(/-/g, ' ')}
            color={Math.abs(metrics.swingPathDegrees) > 3 ? '#ef4444' : Math.abs(metrics.swingPathDegrees) > 1.5 ? '#eab308' : '#22c55e'}
          />
          <MetricCard
            label="Face Angle"
            value={`${metrics.clubFaceDegrees > 0 ? '+' : ''}${metrics.clubFaceDegrees}°`}
            subtitle={metrics.clubFaceAngle}
            color={Math.abs(metrics.clubFaceDegrees) > 3 ? '#ef4444' : Math.abs(metrics.clubFaceDegrees) > 1.5 ? '#eab308' : '#22c55e'}
          />
          <MetricCard
            label="Attack Angle"
            value={`${metrics.attackAngle > 0 ? '+' : ''}${metrics.attackAngle}°`}
            subtitle={metrics.attackAngle > 0 ? 'upward' : 'downward'}
            color="#3b82f6"
          />
          <MetricCard
            label="Club Speed"
            value={`${metrics.estimatedClubSpeed}`}
            subtitle="mph"
            color="#8b5cf6"
          />
          <MetricCard
            label="Ball Speed"
            value={`${metrics.estimatedBallSpeed}`}
            subtitle="mph"
            color="#8b5cf6"
          />
          <MetricCard
            label="Smash Factor"
            value={`${metrics.estimatedSmashFactor}`}
            subtitle={metrics.estimatedSmashFactor >= 1.4 ? 'solid' : 'needs work'}
            color={metrics.estimatedSmashFactor >= 1.4 ? '#22c55e' : '#ef4444'}
          />
        </div>

        <div style={styles.tempoCard}>
          <div style={styles.tempoTitle}>Tempo</div>
          <div style={styles.tempoBar}>
            <div style={{
              ...styles.tempoBackswing,
              width: `${(metrics.tempo.backswingMs / (metrics.tempo.backswingMs + metrics.tempo.downswingMs)) * 100}%`,
            }}>
              {metrics.tempo.backswingMs}ms
            </div>
            <div style={styles.tempoDownswing}>
              {metrics.tempo.downswingMs}ms
            </div>
          </div>
          <div style={styles.tempoRatio}>Ratio: {metrics.tempo.ratio} (ideal: 3:1)</div>
        </div>
      </div>

      {/* Recommendations */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recommendations</div>
        {recommendations.map((rec, i) => (
          <div key={i} style={styles.recCard}>
            <div style={styles.recHeader}>
              <span style={{
                ...styles.priorityBadge,
                background: rec.priority === 'critical' ? '#ef4444' : rec.priority === 'important' ? '#eab308' : '#22c55e',
              }}>
                {rec.priority.toUpperCase()}
              </span>
              <span style={styles.recArea}>{rec.area}</span>
            </div>
            <div style={styles.recIssue}>{rec.issue}</div>
            <div style={styles.recFix}>{rec.fix}</div>
            <div style={styles.drillCard}>
              <div style={styles.drillTitle}>Practice Drill</div>
              <div style={styles.drillText}>{rec.drill}</div>
            </div>
          </div>
        ))}
      </div>

      <button style={styles.primaryBtn} onClick={onBack}>
        Analyze Another Swing
      </button>
    </div>
  );
}

// --- Ball Flight Trajectory Visualization ---

function TrajectoryView({ ballFlight }: { ballFlight: SwingAnalysisResult['ballFlight'] }) {
  const { trajectory, carryMeters, maxHeightMeters, curveMeters } = ballFlight;
  if (!trajectory.length) return null;

  const svgWidth = 400;
  const svgHeight = 180;
  const padding = { top: 15, right: 30, bottom: 25, left: 30 };

  const plotW = svgWidth - padding.left - padding.right;
  const plotH = svgHeight - padding.top - padding.bottom;

  // Side view (distance vs height)
  const maxX = Math.max(...trajectory.map(p => p.x), 1);
  const maxY = Math.max(...trajectory.map(p => p.y), 1);

  const sidePoints = trajectory.map(p => {
    const x = padding.left + (p.x / maxX) * plotW;
    const y = svgHeight - padding.bottom - (p.y / maxY) * plotH;
    return `${x},${y}`;
  }).join(' ');

  // Top-down view (distance vs lateral)
  const maxZ = Math.max(Math.abs(curveMeters), 20);
  const topPoints = trajectory.map(p => {
    const x = padding.left + (p.x / maxX) * plotW;
    const y = svgHeight / 2 - (p.z / maxZ) * (plotH / 3);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      {/* Side View */}
      <div style={styles.trajectoryCard}>
        <div style={styles.trajectoryLabel}>Side View</div>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto' }}>
          {/* Ground line */}
          <line
            x1={padding.left} y1={svgHeight - padding.bottom}
            x2={svgWidth - padding.right} y2={svgHeight - padding.bottom}
            stroke="#1e4d2b" strokeWidth="1"
          />
          {/* Trajectory */}
          <polyline
            points={sidePoints}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
          />
          {/* Landing dot */}
          <circle
            cx={svgWidth - padding.right}
            cy={svgHeight - padding.bottom}
            r="4"
            fill="#22c55e"
          />
          {/* Labels */}
          <text x={padding.left} y={svgHeight - 5} fill="#5a7a65" fontSize="10">0</text>
          <text x={svgWidth - padding.right} y={svgHeight - 5} fill="#5a7a65" fontSize="10" textAnchor="end">
            {carryMeters} m
          </text>
          <text x={padding.left - 5} y={padding.top + 5} fill="#5a7a65" fontSize="10" textAnchor="end">
            {maxHeightMeters}
          </text>
        </svg>
      </div>

      {/* Top-Down View */}
      <div style={styles.trajectoryCard}>
        <div style={styles.trajectoryLabel}>Top View (curve)</div>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto' }}>
          {/* Center line */}
          <line
            x1={padding.left} y1={svgHeight / 2}
            x2={svgWidth - padding.right} y2={svgHeight / 2}
            stroke="#1e4d2b" strokeWidth="1" strokeDasharray="4,4"
          />
          {/* Labels */}
          <text x={svgWidth - padding.right + 5} y={svgHeight / 2 - 10} fill="#5a7a65" fontSize="9">
            Right
          </text>
          <text x={svgWidth - padding.right + 5} y={svgHeight / 2 + 15} fill="#5a7a65" fontSize="9">
            Left
          </text>
          {/* Trajectory */}
          <polyline
            points={topPoints}
            fill="none"
            stroke={getShapeColor(ballFlight.flightShape)}
            strokeWidth="2.5"
          />
          {/* Start dot */}
          <circle cx={padding.left} cy={svgHeight / 2} r="4" fill="#f1f5f9" />
          {/* End dot */}
          {trajectory.length > 0 && (() => {
            const last = trajectory[trajectory.length - 1];
            const endX = padding.left + (last.x / maxX) * plotW;
            const endY = svgHeight / 2 - (last.z / maxZ) * (plotH / 3);
            return <circle cx={endX} cy={endY} r="4" fill={getShapeColor(ballFlight.flightShape)} />;
          })()}
          <text x={padding.left} y={svgHeight - 5} fill="#5a7a65" fontSize="10">Tee</text>
          <text x={svgWidth - padding.right} y={svgHeight - 5} fill="#5a7a65" fontSize="10" textAnchor="end">
            {Math.abs(curveMeters)} m {curveMeters > 0 ? 'right' : 'left'}
          </text>
        </svg>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtitle, color }: { label: string; value: string; subtitle: string; color: string }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color }}>{value}</div>
      <div style={styles.metricSub}>{subtitle}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

function getShapeColor(shape: string): string {
  const colors: Record<string, string> = {
    straight: '#22c55e', fade: '#3b82f6', draw: '#8b5cf6',
    slice: '#ef4444', hook: '#f59e0b', push: '#f97316', pull: '#ec4899',
  };
  return colors[shape] ?? '#8faa97';
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#5a7a65', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: '#22c55e',
    textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 12,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  hint: { fontSize: 12, color: '#5a7a65', marginBottom: 10, marginTop: -4 },
  clubGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  clubBtn: {
    padding: '8px 14px', borderRadius: 8, border: '1px solid #1e4d2b',
    background: 'transparent', color: '#8faa97', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  clubBtnActive: { background: '#22c55e', color: '#0d1f17', borderColor: '#22c55e', fontWeight: 700 },
  resultGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  resultBtn: {
    padding: '6px 12px', borderRadius: 16, border: '1px solid #1e4d2b',
    background: 'transparent', color: '#8faa97', fontSize: 12, cursor: 'pointer',
  },
  primaryBtn: {
    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
    background: '#22c55e', color: '#0d1f17', fontSize: 16, fontWeight: 800,
    cursor: 'pointer', marginBottom: 10,
  },
  secondaryBtn: {
    width: '100%', padding: '12px', borderRadius: 12,
    border: '2px solid #1e4d2b', background: 'transparent',
    color: '#8faa97', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
  },
  quickBtn: {
    width: '100%', padding: '10px', borderRadius: 10, border: 'none',
    background: '#132e1f', color: '#5a7a65', fontSize: 13, cursor: 'pointer',
  },
  videoContainer: {
    position: 'relative' as const, borderRadius: 12, overflow: 'hidden',
    background: '#000', marginBottom: 16, aspectRatio: '16/9',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' as const },
  recordingIndicator: {
    position: 'absolute' as const, top: 12, left: 12,
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 6,
    background: 'rgba(239,68,68,0.9)', color: 'white',
    fontSize: 12, fontWeight: 700,
  },
  recordDot: {
    width: 8, height: 8, borderRadius: '50%', background: 'white',
    animation: 'pulse 1s infinite',
  },
  recordingTips: {
    background: '#132e1f', borderRadius: 10, padding: 14, marginBottom: 16,
  },
  tipsTitle: { fontSize: 13, fontWeight: 700, color: '#e8f0e8', marginBottom: 8 },
  tip: { fontSize: 12, color: '#8faa97', marginBottom: 4 },
  recordControls: { marginBottom: 16 },
  recordBtn: {
    width: '100%', padding: '16px', borderRadius: 12, border: 'none',
    background: '#ef4444', color: 'white', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  stopBtn: {
    width: '100%', padding: '16px', borderRadius: 12, border: 'none',
    background: '#1e4d2b', color: '#f1f5f9', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  backLink: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: 'transparent', color: '#5a7a65', fontSize: 13,
    cursor: 'pointer', marginTop: 8,
  },
  uploadZone: {
    position: 'relative' as const, padding: '40px 20px',
    border: '2px dashed #1e4d2b', borderRadius: 14,
    textAlign: 'center' as const, marginBottom: 16, cursor: 'pointer',
  },
  uploadIcon: { fontSize: 36, color: '#1e4d2b', marginBottom: 8 },
  uploadText: { fontSize: 15, fontWeight: 600, color: '#8faa97' },
  uploadHint: { fontSize: 12, color: '#5a7a65', marginTop: 4 },
  fileInput: {
    position: 'absolute' as const, inset: 0, opacity: 0, cursor: 'pointer',
    width: '100%', height: '100%',
  },
  analyzingOverlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  analyzingContent: { textAlign: 'center' as const },
  spinner: {
    width: 48, height: 48, border: '4px solid #1e4d2b',
    borderTopColor: '#22c55e', borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite',
  },
  analyzingText: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  analyzingSubtext: { fontSize: 13, color: '#5a7a65', marginTop: 8 },
  toggleBtn: {
    padding: '3px 10px', borderRadius: 6, border: '1px solid #1e4d2b',
    background: 'transparent', color: '#5a7a65', fontSize: 11, cursor: 'pointer',
  },

  // Results styles
  scoreCard: {
    background: '#132e1f', borderRadius: 14, padding: 20,
    display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24,
  },
  scoreCircle: {
    width: 80, height: 80, borderRadius: '50%', border: '4px solid',
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  scoreValue: { fontSize: 28, fontWeight: 800 },
  scoreLabel: { fontSize: 11, color: '#5a7a65' },
  scoreSummary: { fontSize: 13, color: '#c5d8c5', lineHeight: '1.6' },

  flightStats: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14,
  },
  flightStat: {
    background: '#0d1f17', borderRadius: 8, padding: '10px 4px',
    textAlign: 'center' as const,
  },
  flightStatValue: { fontSize: 16, fontWeight: 700, color: '#e8f0e8', textTransform: 'capitalize' as const },
  flightStatLabel: { fontSize: 10, color: '#5a7a65', marginTop: 2, textTransform: 'uppercase' as const },

  detailGrid: { background: '#132e1f', borderRadius: 10, overflow: 'hidden' },
  detailRow: {
    display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
    borderBottom: '1px solid #0d1f17',
  },
  detailLabel: { fontSize: 13, color: '#8faa97' },
  detailValue: { fontSize: 13, fontWeight: 600, color: '#e8f0e8' },

  metricsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14,
  },
  metricCard: {
    background: '#0d1f17', borderRadius: 10, padding: '12px 8px',
    textAlign: 'center' as const,
  },
  metricLabel: { fontSize: 10, color: '#5a7a65', textTransform: 'uppercase' as const, marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: 800 },
  metricSub: { fontSize: 11, color: '#8faa97', marginTop: 2, textTransform: 'capitalize' as const },

  tempoCard: { background: '#132e1f', borderRadius: 10, padding: 14 },
  tempoTitle: { fontSize: 12, fontWeight: 700, color: '#8faa97', marginBottom: 10 },
  tempoBar: { display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 6 },
  tempoBackswing: {
    background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'white',
  },
  tempoDownswing: {
    flex: 1, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#0d1f17',
  },
  tempoRatio: { fontSize: 12, color: '#5a7a65' },

  recCard: {
    background: '#132e1f', borderRadius: 12, padding: 16, marginBottom: 12,
  },
  recHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  priorityBadge: {
    padding: '3px 8px', borderRadius: 4, fontSize: 10,
    fontWeight: 800, color: '#0d1f17', letterSpacing: 0.5,
  },
  recArea: { fontSize: 14, fontWeight: 700, color: '#e8f0e8' },
  recIssue: { fontSize: 13, color: '#f59e0b', marginBottom: 8, fontWeight: 600 },
  recFix: { fontSize: 13, color: '#c5d8c5', lineHeight: '1.6', marginBottom: 12 },
  drillCard: {
    background: '#0d1f17', borderRadius: 8, padding: 12,
  },
  drillTitle: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
    textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6,
  },
  drillText: { fontSize: 13, color: '#8faa97', lineHeight: '1.5' },

  trajectoryCard: {
    background: '#0d1f17', borderRadius: 10, padding: '12px 8px', marginBottom: 10,
  },
  trajectoryLabel: {
    fontSize: 11, color: '#5a7a65', marginBottom: 8, fontWeight: 600,
    textTransform: 'uppercase' as const, letterSpacing: 0.5, paddingLeft: 4,
  },
};

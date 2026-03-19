import React, { useState, useCallback } from 'react';
import type { CourseData } from '../models/types';
import { COURSE_LIBRARY } from '../data/courses';
import { findNearbyCourses, getUserPosition, type NearbyCourse } from '../services/course-finder';

interface Props {
  selectedCourseId: string;
  onSelect: (course: CourseData) => void;
}

function courseSummary(course: CourseData) {
  const pars = course.holes.map(h => h.par);
  const totalPar = pars.reduce((a, b) => a + b, 0);
  const totalMeters = course.holes.reduce((a, h) => a + h.lengthMeters, 0);
  const par3s = pars.filter(p => p === 3).length;
  const par4s = pars.filter(p => p === 4).length;
  const par5s = pars.filter(p => p === 5).length;
  const waterHoles = course.holes.filter(h => h.hazards.some(z => z.type === 'water')).length;
  return { totalPar, totalMeters, par3s, par4s, par5s, waterHoles };
}

function courseLocation(course: CourseData): string {
  const locations: Record<string, string> = {
    'torrey-pines-south': 'La Jolla, CA',
    'pine-valley-muni': 'Peachtree City, GA',
    'marrickville': 'Marrickville, Sydney, NSW',
  };
  return locations[course.id] ?? '';
}

function courseDescription(course: CourseData): string {
  const descriptions: Record<string, string> = {
    'torrey-pines-south': 'Iconic coastal municipal course overlooking the Pacific. Home of the US Open. Challenging layout with ocean views and canyon carries.',
    'pine-valley-muni': 'A classic municipal layout with gentle doglegs and well-placed hazards. Great for all skill levels.',
    'marrickville': 'Historic par 60 course along the Cooks River. Est. 1941. Bent grass greens, Kikuyu fairways. Tight layout rewards accuracy over power.',
  };
  return descriptions[course.id] ?? '';
}

// Generate a playable CourseData from a nearby OSM result
// Uses the course's real GPS coordinates as the base point and creates
// a loop routing so holes stay within the course property.
function generateCourseFromNearby(nearby: NearbyCourse): CourseData {
  const coordFn = (baseLat: number, baseLng: number, mNorth: number, mEast: number) => {
    return {
      lat: baseLat + mNorth / 111320,
      lng: baseLng + mEast / (111320 * Math.cos(baseLat * Math.PI / 180)),
    };
  };

  // Tee positions creating a loop across ~800x600 yard footprint
  const teeOffsets: [number, number][] = [
    [0, 0], [370, 80], [720, 370], [750, 530], [480, 600],
    [200, 430], [30, 280], [280, 100], [730, 200], [600, 550],
    [380, 480], [250, 300], [650, 350], [820, 580], [550, 650],
    [400, 500], [580, 320], [350, 550],
  ];

  const holeTemplates = [
    { par: 4, length: 385, dir: 10, hcap: 7 },
    { par: 5, length: 520, dir: 50, hcap: 3 },
    { par: 3, length: 165, dir: 110, hcap: 15 },
    { par: 4, length: 420, dir: 160, hcap: 1 },
    { par: 4, length: 355, dir: 220, hcap: 13 },
    { par: 3, length: 195, dir: 250, hcap: 9 },
    { par: 4, length: 405, dir: 350, hcap: 5 },
    { par: 5, length: 545, dir: 40, hcap: 11 },
    { par: 4, length: 440, dir: 200, hcap: 2 },
    { par: 4, length: 370, dir: 230, hcap: 10 },
    { par: 3, length: 150, dir: 280, hcap: 16 },
    { par: 5, length: 530, dir: 30, hcap: 6 },
    { par: 4, length: 395, dir: 100, hcap: 8 },
    { par: 4, length: 430, dir: 190, hcap: 4 },
    { par: 3, length: 180, dir: 320, hcap: 14 },
    { par: 4, length: 375, dir: 5, hcap: 12 },
    { par: 3, length: 205, dir: 140, hcap: 18 },
    { par: 5, length: 555, dir: 240, hcap: 17 },
  ];

  const numHoles = nearby.holes ?? 18;
  const templates = holeTemplates.slice(0, numHoles);

  const holes = templates.map((t, i) => {
    const num = i + 1;
    const rad = (t.dir * Math.PI) / 180;
    const [teeN, teeE] = teeOffsets[i] ?? [i * 50, i * 30];
    const tee = coordFn(nearby.lat, nearby.lng, teeN, teeE);
    const pin = coordFn(nearby.lat, nearby.lng, teeN + t.length * Math.cos(rad), teeE + t.length * Math.sin(rad));

    const fairwayPoints = [];
    for (let d = 60; d < t.length; d += 50) {
      fairwayPoints.push(coordFn(nearby.lat, nearby.lng, teeN + d * Math.cos(rad), teeE + d * Math.sin(rad)));
    }

    const hazards = [];
    if (t.par >= 4) {
      hazards.push({
        id: `h${num}-0`, type: 'bunker' as const, boundary: [],
        centerPoint: coordFn(nearby.lat, nearby.lng,
          teeN + (t.length * 0.7) * Math.cos(rad) + 15 * Math.sin(rad),
          teeE + (t.length * 0.7) * Math.sin(rad) + 15 * Math.cos(rad)),
        penaltyStrokes: 0, recoveryDifficulty: 0.4,
      });
    }
    if (num % 3 === 0) {
      hazards.push({
        id: `h${num}-1`, type: 'water' as const, boundary: [],
        centerPoint: coordFn(nearby.lat, nearby.lng,
          teeN + (t.length * 0.6) * Math.cos(rad) - 20 * Math.sin(rad),
          teeE + (t.length * 0.6) * Math.sin(rad) - 20 * Math.cos(rad)),
        penaltyStrokes: 1, recoveryDifficulty: 1.0,
      });
    }

    return {
      holeNumber: num, par: t.par, handicapIndex: t.hcap, lengthMeters: t.length,
      teePosition: tee, pinPosition: pin, fairwayCenter: fairwayPoints, hazards,
      greenContour: {
        frontEdge: coordFn(pin.lat, pin.lng, -12, 0),
        backEdge: coordFn(pin.lat, pin.lng, 12, 0),
        centerGreen: pin,
        slopeDirection: 180, slopeSeverity: 0.3, firmness: 'medium' as const, speed: 10,
      },
      layupTargets: t.par === 5 ? [{
        position: coordFn(nearby.lat, nearby.lng,
          teeN + (t.length - 100) * Math.cos(rad),
          teeE + (t.length - 100) * Math.sin(rad)),
        distanceToGreen: 100, safetyRating: 0.8, fairwayWidth: 35,
        description: 'Layup zone, 90 metres out',
      }] : [],
    };
  });

  return {
    id: nearby.id,
    name: nearby.name,
    location: { lat: nearby.lat, lng: nearby.lng },
    holes,
    slopeRating: 125 + Math.round(Math.random() * 15),
    courseRating: 70 + Math.round(Math.random() * 40) / 10,
    altitudeEffect: 1.0,
  };
}

export function CourseSelectPanel({ selectedCourseId, onSelect }: Props) {
  const [nearbyCourses, setNearbyCourses] = useState<NearbyCourse[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'locating' | 'searching' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const searchNearby = useCallback(async () => {
    try {
      setSearchStatus('locating');
      setErrorMsg('');
      const pos = await getUserPosition();
      setUserLocation(pos);

      setSearchStatus('searching');
      const courses = await findNearbyCourses(pos.lat, pos.lng, 10);
      setNearbyCourses(courses);
      setSearchStatus('done');
    } catch (err: any) {
      setSearchStatus('error');
      setErrorMsg(err.message ?? 'Failed to find courses');
    }
  }, []);

  const selectNearby = useCallback((nearby: NearbyCourse) => {
    const courseData = generateCourseFromNearby(nearby);
    onSelect(courseData);
  }, [onSelect]);

  return (
    <div>
      <h2 style={styles.title}>Select Course</h2>
      <p style={styles.subtitle}>Choose a course for your round</p>

      {/* GPS Nearby Search */}
      <div style={styles.gpsSection}>
        <div style={styles.gpsSectionTitle}>FIND NEARBY</div>
        {searchStatus === 'idle' && (
          <button style={styles.gpsBtn} onClick={searchNearby}>
            <span style={styles.gpsIcon}>📍</span>
            Find Golf Courses Within 10km
          </button>
        )}

        {searchStatus === 'locating' && (
          <div style={styles.gpsStatus}>
            <div style={styles.spinner} />
            <span>Getting your location...</span>
          </div>
        )}

        {searchStatus === 'searching' && (
          <div style={styles.gpsStatus}>
            <div style={styles.spinner} />
            <span>Searching for golf courses nearby...</span>
          </div>
        )}

        {searchStatus === 'error' && (
          <div style={styles.gpsError}>
            <div style={styles.errorText}>{errorMsg}</div>
            <button style={styles.retryBtn} onClick={searchNearby}>Try Again</button>
          </div>
        )}

        {searchStatus === 'done' && nearbyCourses.length === 0 && (
          <div style={styles.gpsEmpty}>
            <div style={styles.emptyText}>No golf courses found within 10km</div>
            <button style={styles.retryBtn} onClick={searchNearby}>Search Again</button>
          </div>
        )}

        {searchStatus === 'done' && nearbyCourses.length > 0 && (
          <div style={styles.nearbyList}>
            <div style={styles.nearbyCount}>
              {nearbyCourses.length} course{nearbyCourses.length !== 1 ? 's' : ''} found nearby
            </div>
            {nearbyCourses.map(c => (
              <div key={c.id} style={styles.nearbyCard} onClick={() => selectNearby(c)}>
                <div style={styles.nearbyTop}>
                  <div>
                    <div style={styles.nearbyName}>{c.name}</div>
                    {c.operator && <div style={styles.nearbyOperator}>{c.operator}</div>}
                  </div>
                  <div style={styles.nearbyDistance}>
                    <div style={styles.nearbyDistValue}>{c.distanceKm}</div>
                    <div style={styles.nearbyDistUnit}>km</div>
                  </div>
                </div>
                <div style={styles.nearbyMeta}>
                  {c.holes && <span style={styles.nearbyChip}>{c.holes} holes</span>}
                  <span style={styles.nearbyChip}>{c.distanceMiles} mi</span>
                  {c.website && <span style={styles.nearbyChip}>Has website</span>}
                </div>
                <div style={styles.nearbyAction}>Tap to play this course →</div>
              </div>
            ))}
            <button
              style={styles.searchAgainBtn}
              onClick={searchNearby}
            >
              Search Again
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>OR CHOOSE BUILT-IN</span>
        <div style={styles.dividerLine} />
      </div>

      {/* Built-in courses */}
      <div style={styles.courseList}>
        {COURSE_LIBRARY.map(course => {
          const info = courseSummary(course);
          const isSelected = course.id === selectedCourseId;

          return (
            <div
              key={course.id}
              style={{
                ...styles.courseCard,
                ...(isSelected ? styles.courseCardSelected : {}),
              }}
              onClick={() => onSelect(course)}
            >
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.courseName}>{course.name}</div>
                  <div style={styles.courseLocation}>{courseLocation(course)}</div>
                </div>
                {isSelected && <div style={styles.selectedBadge}>SELECTED</div>}
              </div>

              <div style={styles.courseDesc}>{courseDescription(course)}</div>

              <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{info.totalPar}</div>
                  <div style={styles.statLabel}>Par</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{info.totalMeters.toLocaleString()}</div>
                  <div style={styles.statLabel}>Metres</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{course.slopeRating}</div>
                  <div style={styles.statLabel}>Slope</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{course.courseRating}</div>
                  <div style={styles.statLabel}>Rating</div>
                </div>
              </div>

              <div style={styles.holeBreakdown}>
                <span style={styles.breakdownItem}>{info.par3s} Par 3s</span>
                <span style={styles.breakdownDot}>&middot;</span>
                <span style={styles.breakdownItem}>{info.par4s} Par 4s</span>
                <span style={styles.breakdownDot}>&middot;</span>
                <span style={styles.breakdownItem}>{info.par5s} Par 5s</span>
                <span style={styles.breakdownDot}>&middot;</span>
                <span style={{ ...styles.breakdownItem, color: '#3b82f6' }}>{info.waterHoles} Water Holes</span>
              </div>

              {course.altitudeEffect > 1.0 && (
                <div style={styles.altitudeNote}>
                  Altitude bonus: +{Math.round((course.altitudeEffect - 1) * 100)}% distance
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#5a7a65', marginBottom: 20 },

  // GPS section
  gpsSection: { marginBottom: 20 },
  gpsSectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
    letterSpacing: 1.5, marginBottom: 10,
  },
  gpsBtn: {
    width: '100%', padding: '16px', borderRadius: 12,
    border: '2px dashed #22c55e40', background: '#22c55e08',
    color: '#22c55e', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  gpsIcon: { fontSize: 20 },
  gpsStatus: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 16, background: '#132e1f', borderRadius: 12,
    fontSize: 13, color: '#8faa97',
  },
  spinner: {
    width: 20, height: 20, border: '2px solid #1e4d2b',
    borderTopColor: '#22c55e', borderRadius: '50%',
    animation: 'spin 1s linear infinite', flexShrink: 0,
  },
  gpsError: {
    padding: 16, background: '#ef444415', borderRadius: 12,
    border: '1px solid #ef444440',
  },
  errorText: { fontSize: 13, color: '#ef4444', marginBottom: 10 },
  retryBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #1e4d2b',
    background: '#132e1f', color: '#8faa97', fontSize: 12,
    fontWeight: 600, cursor: 'pointer',
  },
  gpsEmpty: {
    padding: 20, background: '#132e1f', borderRadius: 12,
    textAlign: 'center' as const,
  },
  emptyText: { fontSize: 13, color: '#5a7a65', marginBottom: 12 },

  // Nearby results
  nearbyList: {},
  nearbyCount: { fontSize: 12, color: '#5a7a65', marginBottom: 10 },
  nearbyCard: {
    background: '#132e1f', borderRadius: 12, padding: 14, marginBottom: 8,
    cursor: 'pointer', border: '2px solid transparent',
    transition: 'border-color 0.15s',
  },
  nearbyTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 8,
  },
  nearbyName: { fontSize: 15, fontWeight: 700, color: '#f1f5f9' },
  nearbyOperator: { fontSize: 11, color: '#5a7a65', marginTop: 2 },
  nearbyDistance: { textAlign: 'right' as const, flexShrink: 0 },
  nearbyDistValue: { fontSize: 22, fontWeight: 800, color: '#22c55e' },
  nearbyDistUnit: { fontSize: 10, color: '#5a7a65', fontWeight: 600, textTransform: 'uppercase' as const },
  nearbyMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 8 },
  nearbyChip: {
    padding: '2px 8px', borderRadius: 6, background: '#0d1f17',
    color: '#8faa97', fontSize: 11,
  },
  nearbyAction: { fontSize: 12, color: '#22c55e', fontWeight: 600 },
  searchAgainBtn: {
    width: '100%', padding: '10px', marginTop: 8, borderRadius: 8,
    border: '1px solid #1e4d2b', background: 'transparent',
    color: '#5a7a65', fontSize: 12, cursor: 'pointer',
  },

  // Divider
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0',
  },
  dividerLine: { flex: 1, height: 1, background: '#1e4d2b' },
  dividerText: { fontSize: 10, fontWeight: 700, color: '#5a7a65', letterSpacing: 1 },

  // Built-in courses
  courseList: { display: 'flex', flexDirection: 'column', gap: 14 },
  courseCard: {
    background: '#132e1f', borderRadius: 14, padding: 18,
    border: '2px solid transparent', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  courseCardSelected: { borderColor: '#22c55e' },
  cardTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 8,
  },
  courseName: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  courseLocation: { fontSize: 12, color: '#5a7a65', marginTop: 2 },
  selectedBadge: {
    padding: '3px 10px', borderRadius: 6, background: '#22c55e',
    color: '#0d1f17', fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
    flexShrink: 0,
  },
  courseDesc: { fontSize: 13, color: '#8faa97', lineHeight: '1.5', marginBottom: 14 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  statBox: {
    background: '#0d1f17', borderRadius: 8, padding: '10px 0',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 16, fontWeight: 700, color: '#e8f0e8' },
  statLabel: { fontSize: 10, color: '#5a7a65', marginTop: 2, textTransform: 'uppercase' as const },
  holeBreakdown: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  breakdownItem: { fontSize: 12, color: '#8faa97' },
  breakdownDot: { color: '#1e4d2b' },
  altitudeNote: {
    marginTop: 10, fontSize: 12, color: '#eab308',
    padding: '6px 10px', background: '#eab30810', borderRadius: 6,
  },
};

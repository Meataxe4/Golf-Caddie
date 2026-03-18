import React from 'react';
import type { CourseData } from '../models/types';
import { COURSE_LIBRARY } from '../data/courses';

interface Props {
  selectedCourseId: string;
  onSelect: (course: CourseData) => void;
}

function courseSummary(course: CourseData) {
  const pars = course.holes.map(h => h.par);
  const totalPar = pars.reduce((a, b) => a + b, 0);
  const totalYards = course.holes.reduce((a, h) => a + h.lengthYards, 0);
  const par3s = pars.filter(p => p === 3).length;
  const par4s = pars.filter(p => p === 4).length;
  const par5s = pars.filter(p => p === 5).length;
  const waterHoles = course.holes.filter(h => h.hazards.some(z => z.type === 'water')).length;
  return { totalPar, totalYards, par3s, par4s, par5s, waterHoles };
}

function courseLocation(course: CourseData): string {
  const locations: Record<string, string> = {
    'pine-valley-muni': 'Peachtree City, GA',
    'ocean-links': 'Monterey, CA',
    'mountain-ridge': 'Denver, CO',
    'magnolia-pines': 'Gulf Shores, AL',
  };
  return locations[course.id] ?? '';
}

function courseDescription(course: CourseData): string {
  const descriptions: Record<string, string> = {
    'pine-valley-muni': 'A classic municipal layout with gentle doglegs and well-placed hazards. Great for all skill levels.',
    'ocean-links': 'Coastal links-style course with ocean breezes, firm fairways, and challenging par 3s over water.',
    'mountain-ridge': 'Elevation changes and thin mountain air add 12% distance. Technical layout rewards course management.',
    'magnolia-pines': 'Southern resort course winding through magnolia and pine trees with bayou water hazards throughout.',
  };
  return descriptions[course.id] ?? '';
}

export function CourseSelectPanel({ selectedCourseId, onSelect }: Props) {
  return (
    <div>
      <h2 style={styles.title}>Select Course</h2>
      <p style={styles.subtitle}>Choose a course for your round</p>

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
                  <div style={styles.statValue}>{info.totalYards.toLocaleString()}</div>
                  <div style={styles.statLabel}>Yards</div>
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
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  courseList: { display: 'flex', flexDirection: 'column', gap: 14 },
  courseCard: {
    background: '#1e293b', borderRadius: 14, padding: 18,
    border: '2px solid transparent', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  courseCardSelected: { borderColor: '#22c55e' },
  cardTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 8,
  },
  courseName: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  courseLocation: { fontSize: 12, color: '#64748b', marginTop: 2 },
  selectedBadge: {
    padding: '3px 10px', borderRadius: 6, background: '#22c55e',
    color: '#0f172a', fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
    flexShrink: 0,
  },
  courseDesc: { fontSize: 13, color: '#94a3b8', lineHeight: '1.5', marginBottom: 14 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  statBox: {
    background: '#0f172a', borderRadius: 8, padding: '10px 0',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase' as const },
  holeBreakdown: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  breakdownItem: { fontSize: 12, color: '#94a3b8' },
  breakdownDot: { color: '#334155' },
  altitudeNote: {
    marginTop: 10, fontSize: 12, color: '#eab308',
    padding: '6px 10px', background: '#eab30810', borderRadius: 6,
  },
};

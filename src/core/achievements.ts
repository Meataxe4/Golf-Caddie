// ============================================================================
// Achievements & Badges System — Gamification for Tangent Golf
// ============================================================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlockedAt?: string; // ISO date
  progress?: number; // 0-1 for partial progress
  requirement: string;
}

export interface RoundRecord {
  id: string;
  date: string;
  courseId: string;
  courseName: string;
  scores: (number | null)[];
  totalScore: number;
  scoreToPar: number;
  holesPlayed: number;
}

const ACHIEVEMENT_DEFS: Omit<Achievement, 'unlockedAt' | 'progress'>[] = [
  { id: 'first_round', name: 'First Tee', description: 'Complete your first round', icon: '1', tier: 'bronze', requirement: 'Complete 1 round' },
  { id: 'five_rounds', name: 'Regular', description: 'Complete 5 rounds', icon: '5', tier: 'silver', requirement: 'Complete 5 rounds' },
  { id: 'birdie', name: 'Birdie Hunter', description: 'Make your first birdie', icon: '-1', tier: 'bronze', requirement: 'Score a birdie' },
  { id: 'eagle', name: 'Eagle Eye', description: 'Make an eagle', icon: '-2', tier: 'gold', requirement: 'Score an eagle' },
  { id: 'par_round', name: 'Even Steven', description: 'Shoot even par or better', icon: 'E', tier: 'gold', requirement: 'Score even par or better for 18 holes' },
  { id: 'no_doubles', name: 'Clean Card', description: 'Complete a round with no doubles or worse', icon: '!', tier: 'silver', requirement: 'No double bogeys or worse in 18 holes' },
  { id: 'front_nine', name: 'Strong Start', description: 'Score under 40 on the front 9', icon: '<', tier: 'silver', requirement: 'Front 9 score under 40' },
  { id: 'back_nine', name: 'Closer', description: 'Score under 40 on the back 9', icon: '>', tier: 'silver', requirement: 'Back 9 score under 40' },
  { id: 'three_birdies', name: 'Bird Watcher', description: 'Make 3 birdies in one round', icon: '3', tier: 'gold', requirement: '3 birdies in a single round' },
  { id: 'bogey_free_nine', name: 'Bogey Free', description: 'Play 9 holes without a bogey', icon: '9', tier: 'gold', requirement: '9 consecutive holes at par or better' },
  { id: 'practice_5', name: 'Range Rat', description: 'Analyze 5 swings in practice mode', icon: 'P', tier: 'bronze', requirement: 'Use practice mode 5 times' },
  { id: 'three_courses', name: 'Explorer', description: 'Play 3 different courses', icon: 'M', tier: 'silver', requirement: 'Complete rounds on 3 different courses' },
  { id: 'streak_3', name: 'Hot Streak', description: 'Play 3 rounds in a row', icon: 'S', tier: 'bronze', requirement: 'Log rounds on 3 different days' },
  { id: 'sub_90', name: 'Breaking 90', description: 'Shoot under 90', icon: '90', tier: 'silver', requirement: 'Total score under 90' },
  { id: 'sub_80', name: 'Breaking 80', description: 'Shoot under 80', icon: '80', tier: 'gold', requirement: 'Total score under 80' },
  { id: 'consistency', name: 'Consistent', description: 'Score within 3 strokes of your average', icon: '~', tier: 'silver', requirement: 'Score within 3 of your 5-round average' },
];

export function getAllAchievements(): Achievement[] {
  const saved = loadSavedAchievements();
  return ACHIEVEMENT_DEFS.map(def => ({
    ...def,
    unlockedAt: saved[def.id],
    progress: undefined,
  }));
}

export function checkAchievements(rounds: RoundRecord[], practiceCount: number): Achievement[] {
  const saved = loadSavedAchievements();
  const newlyUnlocked: Achievement[] = [];

  const check = (id: string, condition: boolean) => {
    if (condition && !saved[id]) {
      saved[id] = new Date().toISOString();
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      if (def) newlyUnlocked.push({ ...def, unlockedAt: saved[id] });
    }
  };

  const fullRounds = rounds.filter(r => r.holesPlayed >= 18);

  check('first_round', fullRounds.length >= 1);
  check('five_rounds', fullRounds.length >= 5);
  check('practice_5', practiceCount >= 5);

  const uniqueCourses = new Set(fullRounds.map(r => r.courseId));
  check('three_courses', uniqueCourses.size >= 3);

  for (const round of fullRounds) {
    const scores = round.scores.filter((s): s is number => s !== null);
    if (scores.length < 18) continue;

    check('par_round', round.scoreToPar <= 0);
    check('sub_90', round.totalScore < 90);
    check('sub_80', round.totalScore < 80);

    // Birdie/eagle check (need course par data - approximate with 4)
    const birdies = scores.filter(s => s <= 3).length; // rough check
    check('birdie', birdies > 0);
    check('three_birdies', birdies >= 3);

    const eagles = scores.filter(s => s <= 2).length;
    check('eagle', eagles > 0);

    const maxScore = Math.max(...scores);
    check('no_doubles', maxScore <= 5); // no score > bogey on a par 4

    const front = scores.slice(0, 9).reduce((a, b) => a + b, 0);
    const back = scores.slice(9).reduce((a, b) => a + b, 0);
    check('front_nine', front < 40);
    check('back_nine', back < 40);
  }

  // Streak check
  const dates = new Set(rounds.map(r => r.date.split('T')[0]));
  check('streak_3', dates.size >= 3);

  // Consistency check
  if (fullRounds.length >= 5) {
    const last5 = fullRounds.slice(-5).map(r => r.totalScore);
    const avg = last5.reduce((a, b) => a + b) / last5.length;
    const latest = last5[last5.length - 1];
    check('consistency', Math.abs(latest - avg) <= 3);
  }

  saveSavedAchievements(saved);
  return newlyUnlocked;
}

function loadSavedAchievements(): Record<string, string> {
  try {
    const data = localStorage.getItem('golf-caddie-achievements');
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveSavedAchievements(data: Record<string, string>) {
  localStorage.setItem('golf-caddie-achievements', JSON.stringify(data));
}

// Round History persistence
export function saveRound(round: RoundRecord) {
  const history = loadRoundHistory();
  history.push(round);
  localStorage.setItem('golf-caddie-rounds', JSON.stringify(history));
}

export function loadRoundHistory(): RoundRecord[] {
  try {
    const data = localStorage.getItem('golf-caddie-rounds');
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function loadPracticeCount(): number {
  try {
    return Number(localStorage.getItem('golf-caddie-practice-count') ?? '0');
  } catch { return 0; }
}

export function incrementPracticeCount(): number {
  const count = loadPracticeCount() + 1;
  localStorage.setItem('golf-caddie-practice-count', String(count));
  return count;
}

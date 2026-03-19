// ============================================================================
// Voice Caddie — Natural Language Interface
// ============================================================================
// Converts shot recommendations into natural, conversational caddie advice.
// Designed for hands-free use during a round — short, confident, actionable.
// Uses the Web Speech API for text-to-speech in the browser.

import type {
  ShotRecommendation, VoiceCaddieResponse, HoleStrategy,
  Club, RiskLevel,
} from '../models/types';

const CLUB_SPOKEN_NAMES: Record<string, string> = {
  driver: 'Driver',
  '3_wood': '3 wood',
  '5_wood': '5 wood',
  '7_wood': '7 wood',
  '2_hybrid': '2 hybrid',
  '3_hybrid': '3 hybrid',
  '4_hybrid': '4 hybrid',
  '5_hybrid': '5 hybrid',
  '3_iron': '3 iron',
  '4_iron': '4 iron',
  '5_iron': '5 iron',
  '6_iron': '6 iron',
  '7_iron': '7 iron',
  '8_iron': '8 iron',
  '9_iron': '9 iron',
  pw: 'pitching wedge',
  gw: 'gap wedge',
  sw: 'sand wedge',
  lw: 'lob wedge',
  putter: 'putter',
};

function clubSpoken(club: Club): string {
  return CLUB_SPOKEN_NAMES[club] ?? club.replace(/_/g, ' ');
}

function riskPhrase(risk: RiskLevel): string {
  switch (risk) {
    case 'safe': return 'Smart play';
    case 'moderate': return 'Good look here';
    case 'aggressive': return 'This is aggressive';
  }
}

export class VoiceCaddie {
  private synthesis: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synthesis = window.speechSynthesis;
      // Try to find a natural-sounding voice
      this.loadVoice();
    }
  }

  private loadVoice(): void {
    if (!this.synthesis) return;

    const setVoice = () => {
      const voices = this.synthesis!.getVoices();
      // Prefer: English, male (caddie feel), high quality
      this.voice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Male')) ??
        voices.find(v => v.lang.startsWith('en-US')) ??
        voices.find(v => v.lang.startsWith('en')) ??
        voices[0] ?? null;
    };

    if (this.synthesis.getVoices().length > 0) {
      setVoice();
    } else {
      this.synthesis.addEventListener('voiceschanged', setVoice, { once: true });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  stop(): void {
    this.synthesis?.cancel();
  }

  /**
   * Generate and speak a caddie recommendation.
   */
  announceRecommendation(rec: ShotRecommendation): VoiceCaddieResponse {
    const response = this.formatRecommendation(rec);

    if (this.enabled && this.synthesis) {
      this.speak(response.spokenText);
    }

    return response;
  }

  /**
   * Announce hole strategy at the tee.
   */
  announceHoleStrategy(strategy: HoleStrategy): VoiceCaddieResponse {
    const response = this.formatHoleStrategy(strategy);

    if (this.enabled && this.synthesis) {
      this.speak(response.spokenText);
    }

    return response;
  }

  /**
   * Format a shot recommendation into spoken and detailed text.
   */
  formatRecommendation(rec: ShotRecommendation): VoiceCaddieResponse {
    const club = clubSpoken(rec.club);
    const shape = rec.suggestedShape !== 'straight' ? `, play a ${rec.suggestedShape}` : '';
    const target = rec.targetDescription;
    const prob = Math.round(rec.expectedOutcome.hitGreenProbability * 100);
    const risk = riskPhrase(rec.riskLevel);

    // Spoken text: concise, <5 seconds
    let spoken = `${club}. ${target}${shape}.`;

    // Add one key insight
    if (rec.reasoning.length > 0) {
      const shortReason = rec.reasoning[0].split('.')[0];
      if (shortReason.length < 60) {
        spoken += ` ${shortReason}.`;
      }
    }

    // Detailed text: full breakdown
    const detailed = [
      `**${club}** — ${target}`,
      shape ? `Shot shape: ${rec.suggestedShape}` : null,
      `Green hit probability: ${prob}%`,
      `Risk level: ${rec.riskLevel}`,
      `Expected outcome: ${rec.expectedOutcome.expectedCarryMeters} metres carry`,
      '',
      '**Reasoning:**',
      ...rec.reasoning.map(r => `• ${r}`),
    ].filter(Boolean).join('\n');

    // Follow-up prompts for voice interaction
    const followUps = [
      'What are my other options?',
      'What if I hit it safe?',
      'What about the wind?',
      'Where should I miss?',
    ];

    return {
      spokenText: spoken,
      detailedText: detailed,
      recommendation: rec,
      followUpPrompts: followUps,
    };
  }

  private formatHoleStrategy(strategy: HoleStrategy): VoiceCaddieResponse {
    const approach = strategy.overallApproach === 'attack'
      ? 'Let\'s be aggressive here'
      : strategy.overallApproach === 'conservative'
        ? 'Let\'s play this one safe'
        : 'Manage this hole smartly';

    const firstShot = strategy.shots[0];
    const spoken = `Hole ${strategy.holeNumber}, par ${strategy.par}. ${approach}. ${clubSpoken(firstShot.club)} off the tee, ${firstShot.target}.`;

    const detailed = [
      `## Hole ${strategy.holeNumber} — Par ${strategy.par}`,
      `**Strategy:** ${strategy.overallApproach}`,
      `**Target score:** ${strategy.targetScore}`,
      `**Key insight:** ${strategy.keyInsight}`,
      '',
      ...strategy.shots.map(s =>
        `**Shot ${s.shotNumber}:** ${clubSpoken(s.club)} → ${s.target}\n${s.reasoning}`
      ),
    ].join('\n');

    return {
      spokenText: spoken,
      detailedText: detailed,
      recommendation: {
        club: firstShot.club,
        targetPosition: { lat: 0, lng: 0 },
        targetDescription: firstShot.target,
        aimOffset: { metersRight: 0, metersLong: 0 },
        suggestedShape: 'straight',
        riskLevel: firstShot.riskLevel,
        expectedOutcome: {
          expectedCarryMeters: 0,
          expectedTotalMeters: 0,
          landingZone: { center: { lat: 0, lng: 0 }, radiusMeters: 0 },
          hitGreenProbability: 0,
          avoidHazardProbability: 0,
          expectedStrokesFromResult: 0,
          bestCasePct: 0,
          worstCasePct: 0,
        },
        reasoning: [firstShot.reasoning],
        alternativeShots: [],
        confidenceScore: 0.8,
      },
      followUpPrompts: [
        'Tell me more about this hole',
        'What are the dangers?',
        'What\'s the backup plan?',
      ],
    };
  }

  private speak(text: string): void {
    if (!this.synthesis) return;

    this.synthesis.cancel(); // cancel any current speech

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) utterance.voice = this.voice;
    utterance.rate = 1.05; // slightly faster — caddie is confident
    utterance.pitch = 0.95; // slightly lower — authoritative
    utterance.volume = 1.0;

    this.synthesis.speak(utterance);
  }
}

/**
 * Pattern detection engine — identifies recurring swing/game patterns.
 * This is a differentiating feature that goes beyond basic stats.
 */
export class PatternDetector {
  /**
   * Detect if the player performs differently on certain hole types.
   */
  detectHoleTypePatterns(
    scores: { par: number; score: number; holeNumber: number }[],
  ): { par: number; avgOverPar: number; insight: string }[] {
    const byPar = new Map<number, number[]>();

    for (const s of scores) {
      if (!byPar.has(s.par)) byPar.set(s.par, []);
      byPar.get(s.par)!.push(s.score - s.par);
    }

    const results: { par: number; avgOverPar: number; insight: string }[] = [];

    for (const [par, overPars] of byPar) {
      const avg = overPars.reduce((a, b) => a + b, 0) / overPars.length;
      let insight: string;

      if (avg < 0.2) {
        insight = `You handle par ${par}s well — scoring near par on average.`;
      } else if (avg > 1.0) {
        insight = `Par ${par}s are costing you. Focus on strategy — ${
          par === 3 ? 'aim for the center of greens, not pins'
          : par === 5 ? 'smart layups beat hero shots'
          : 'find the fairway off the tee'
        }.`;
      } else {
        insight = `Solid on par ${par}s — room for improvement but not a weakness.`;
      }

      results.push({
        par,
        avgOverPar: Math.round(avg * 100) / 100,
        insight,
      });
    }

    return results;
  }

  /**
   * Detect "hot" and "cold" streaks within a round.
   */
  detectStreaks(
    holeScores: { hole: number; scoreToPar: number }[],
  ): { type: 'hot' | 'cold'; startHole: number; endHole: number; totalOverPar: number }[] {
    const streaks: { type: 'hot' | 'cold'; startHole: number; endHole: number; totalOverPar: number }[] = [];
    let streakStart = 0;
    let streakTotal = 0;
    let streakType: 'hot' | 'cold' | null = null;

    for (let i = 0; i < holeScores.length; i++) {
      const s = holeScores[i];
      const isGood = s.scoreToPar <= 0;
      const isBad = s.scoreToPar >= 2;
      const currentType = isGood ? 'hot' : isBad ? 'cold' : null;

      if (currentType === streakType && streakType !== null) {
        streakTotal += s.scoreToPar;
      } else {
        // End previous streak if significant
        if (streakType && i - streakStart >= 3) {
          streaks.push({
            type: streakType,
            startHole: holeScores[streakStart].hole,
            endHole: holeScores[i - 1].hole,
            totalOverPar: streakTotal,
          });
        }
        streakStart = i;
        streakTotal = s.scoreToPar;
        streakType = currentType;
      }
    }

    // Close final streak
    if (streakType && holeScores.length - streakStart >= 3) {
      streaks.push({
        type: streakType,
        startHole: holeScores[streakStart].hole,
        endHole: holeScores[holeScores.length - 1].hole,
        totalOverPar: streakTotal,
      });
    }

    return streaks;
  }

  /**
   * Detect if performance degrades on closing holes (pressure detection).
   */
  detectClosingHolePerformance(
    rounds: { holeScores: number[] }[],
  ): { earlyAvg: number; lateAvg: number; collapseRisk: number; insight: string } {
    let earlyTotal = 0;
    let lateTotal = 0;
    let count = 0;

    for (const round of rounds) {
      if (round.holeScores.length < 18) continue;
      const earlyScore = round.holeScores.slice(0, 9).reduce((a, b) => a + b, 0);
      const lateScore = round.holeScores.slice(9, 18).reduce((a, b) => a + b, 0);
      earlyTotal += earlyScore;
      lateTotal += lateScore;
      count++;
    }

    if (count === 0) {
      return { earlyAvg: 0, lateAvg: 0, collapseRisk: 0, insight: 'Not enough data.' };
    }

    const earlyAvg = earlyTotal / count;
    const lateAvg = lateTotal / count;
    const diff = lateAvg - earlyAvg;
    const collapseRisk = Math.min(1, Math.max(0, diff / 5));

    let insight: string;
    if (diff > 3) {
      insight = `You tend to fade on the back nine (+${diff.toFixed(1)} strokes vs front). Consider mental game strategies: stay process-focused, don't scoreboard-watch, and commit to your pre-shot routine on every shot.`;
    } else if (diff < -2) {
      insight = `You actually play better on the back nine! You warm up as the round goes on. Consider a more thorough warm-up to unlock front-nine potential.`;
    } else {
      insight = `Consistent performance across both nines — a sign of good mental game.`;
    }

    return {
      earlyAvg: Math.round(earlyAvg * 10) / 10,
      lateAvg: Math.round(lateAvg * 10) / 10,
      collapseRisk: Math.round(collapseRisk * 100) / 100,
      insight,
    };
  }
}

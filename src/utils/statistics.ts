// ============================================================================
// Statistical Utilities for Player Modeling & Decision Engine
// ============================================================================

/**
 * Standard normal CDF (cumulative distribution function).
 * Uses Abramowitz & Stegun approximation.
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Probability that a value falls within [low, high] given a normal distribution.
 */
export function normalProbBetween(mean: number, sd: number, low: number, high: number): number {
  if (sd <= 0) return (mean >= low && mean <= high) ? 1 : 0;
  return normalCDF((high - mean) / sd) - normalCDF((low - mean) / sd);
}

/**
 * Probability that a value exceeds threshold.
 */
export function normalProbAbove(mean: number, sd: number, threshold: number): number {
  if (sd <= 0) return mean > threshold ? 1 : 0;
  return 1 - normalCDF((threshold - mean) / sd);
}

/**
 * Running statistics tracker using Welford's algorithm.
 * Incrementally computes mean and standard deviation.
 */
export class RunningStats {
  private n = 0;
  private mean_ = 0;
  private m2 = 0;
  private min_ = Infinity;
  private max_ = -Infinity;

  add(value: number): void {
    this.n++;
    const delta = value - this.mean_;
    this.mean_ += delta / this.n;
    const delta2 = value - this.mean_;
    this.m2 += delta * delta2;
    this.min_ = Math.min(this.min_, value);
    this.max_ = Math.max(this.max_, value);
  }

  get count(): number { return this.n; }
  get mean(): number { return this.mean_; }
  get variance(): number { return this.n > 1 ? this.m2 / (this.n - 1) : 0; }
  get standardDeviation(): number { return Math.sqrt(this.variance); }
  get min(): number { return this.min_; }
  get max(): number { return this.max_; }

  /**
   * Confidence score based on sample size.
   * Uses a sigmoid — approaches 1.0 around 30+ data points.
   */
  get confidence(): number {
    return 1 / (1 + Math.exp(-0.2 * (this.n - 15)));
  }
}

/**
 * 2D dispersion ellipse model.
 * Models where shots land relative to target (distance x lateral).
 */
export interface DispersionEllipse {
  centerOffsetMeters: number;     // systematic distance bias (+ = long)
  centerLateralMeters: number;    // systematic lateral bias (+ = right)
  distanceSdMeters: number;       // distance standard deviation
  lateralSdMeters: number;        // lateral standard deviation
  correlation: number;           // correlation between distance and lateral miss
}

/**
 * Probability that a shot lands within a rectangular zone,
 * given a 2D dispersion ellipse.
 */
export function probLandsInZone(
  ellipse: DispersionEllipse,
  zone: { minDist: number; maxDist: number; minLateral: number; maxLateral: number },
): number {
  // Approximate with independent marginals (ignoring correlation for simplicity)
  const pDist = normalProbBetween(
    ellipse.centerOffsetMeters,
    ellipse.distanceSdMeters,
    zone.minDist,
    zone.maxDist,
  );
  const pLat = normalProbBetween(
    ellipse.centerLateralMeters,
    ellipse.lateralSdMeters,
    zone.minLateral,
    zone.maxLateral,
  );
  return pDist * pLat;
}

/**
 * Expected value calculation for shot options.
 * Combines probability-weighted outcomes.
 */
export function expectedValue(
  outcomes: { probability: number; value: number }[],
): number {
  return outcomes.reduce((sum, o) => sum + o.probability * o.value, 0);
}

/**
 * Weighted exponential moving average for adaptive learning.
 * More recent data points have higher weight.
 */
export function exponentialMovingAverage(
  values: number[],
  alpha: number = 0.15,
): number {
  if (values.length === 0) return 0;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

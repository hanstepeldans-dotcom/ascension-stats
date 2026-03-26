/**
 * AdaptiveLimiter — a global semaphore that controls how many Fanvue HTTP
 * requests may be in-flight at once.
 *
 * Concurrency adapts automatically:
 *   • after N consecutive successes → add one slot (up to maxConcurrency)
 *   • on a throttle signal (429/502/503/504) → cut slots by ~40% (down to minConcurrency)
 *
 * Usage:
 *   const limiter = new AdaptiveLimiter();
 *   const data = await limiter.run(() => fanvueFetch(endpoint, token, {
 *     onThrottle: () => limiter.onThrottleSignal(),
 *   }));
 */

export interface LimiterDiagnostics {
  startConcurrency: number;
  maxConcurrencyReached: number;
  finalConcurrency: number;
  throttleSignalsReceived: number;
  concurrencyWasReduced: boolean;
}

export interface AdaptiveLimiterOptions {
  /** Starting number of concurrent slots. Default: 4 */
  initial?: number;
  /** Hard ceiling for concurrency. Default: 8 */
  max?: number;
  /** Hard floor for concurrency. Default: 1 */
  min?: number;
  /** Consecutive successes needed to add one slot. Default: 10 */
  successesNeededToIncrease?: number;
}

export class AdaptiveLimiter {
  private concurrency: number;
  private readonly maxConcurrency: number;
  private readonly minConcurrency: number;
  private readonly successesNeededToIncrease: number;

  private activeCount = 0;
  private readonly queue: Array<() => void> = [];
  private successStreak = 0;
  private throttleSignals = 0;
  private maxReached: number;

  readonly startConcurrency: number;

  constructor(options?: AdaptiveLimiterOptions) {
    this.concurrency = options?.initial ?? 4;
    this.maxConcurrency = options?.max ?? 8;
    this.minConcurrency = options?.min ?? 1;
    this.successesNeededToIncrease = options?.successesNeededToIncrease ?? 10;
    this.startConcurrency = this.concurrency;
    this.maxReached = this.concurrency;
  }

  /**
   * Gate fn() through the concurrency semaphore.
   * Acquires a slot before calling fn(), releases it when fn() settles.
   * Records the outcome to drive adaptive concurrency changes.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      // Permanent failure after all retries — the onThrottle callback will have
      // already fired for transient errors, so just re-throw here.
      throw err;
    } finally {
      this.release();
    }
  }

  /**
   * Signal that a retryable throttle response (429/502/503/504) was detected.
   * Called by the fanvueFetch onThrottle callback before the internal retry delay.
   * Immediately reduces concurrency so no new requests pile on while back-off runs.
   */
  onThrottleSignal(): void {
    this.throttleSignals++;
    this.successStreak = 0;
    // Back off by ~40%, floor at minConcurrency
    this.concurrency = Math.max(this.minConcurrency, Math.floor(this.concurrency * 0.6));
  }

  get diagnostics(): LimiterDiagnostics {
    return {
      startConcurrency: this.startConcurrency,
      maxConcurrencyReached: this.maxReached,
      finalConcurrency: this.concurrency,
      throttleSignalsReceived: this.throttleSignals,
      concurrencyWasReduced: this.throttleSignals > 0,
    };
  }

  // ─── Private semaphore mechanics ─────────────────────────────────────────

  private acquire(): Promise<void> {
    if (this.activeCount < this.concurrency) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    this.activeCount--;
    this.drain();
  }

  /**
   * Wake queued waiters up to the current concurrency ceiling.
   * Called after release() and after concurrency is increased.
   */
  private drain(): void {
    while (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const next = this.queue.shift()!;
      this.activeCount++;
      next();
    }
  }

  private recordSuccess(): void {
    this.successStreak++;
    if (
      this.successStreak >= this.successesNeededToIncrease &&
      this.concurrency < this.maxConcurrency
    ) {
      this.concurrency = Math.min(this.concurrency + 1, this.maxConcurrency);
      this.maxReached = Math.max(this.maxReached, this.concurrency);
      this.successStreak = 0;
      // Immediately fill the newly opened slot if anything is queued
      this.drain();
    }
  }
}

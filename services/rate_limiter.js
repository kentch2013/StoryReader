/**
 * Strict Rate Limiter & Resilience Coordinator for Gemini API
 * Quota Rules:
 * - 15 RPM cap -> Throttled strictly to <= 14 RPM using a sliding 60s window.
 * - 500 RPD cap -> Daily usage counter with warnings.
 * - Automatic exponential backoff and jitter on 429 (ResourceExhausted) / 503 (Unavailable).
 */

class GeminiRateLimiter {
  constructor(options = {}) {
    this.maxRpm = options.maxRpm || 14; // Strictly under 15 RPM
    this.maxDaily = options.maxDaily || 500;
    this.requestTimestamps = [];
    this.dailyCounts = { date: this.getTodayUtc(), count: 0 };
    this.queue = Promise.resolve();
  }

  getTodayUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  getDailyCount() {
    const today = this.getTodayUtc();
    if (this.dailyCounts.date !== today) {
      this.dailyCounts = { date: today, count: 0 };
    }
    return this.dailyCounts.count;
  }

  incrementDailyCount() {
    const count = this.getDailyCount() + 1;
    this.dailyCounts.count = count;
    if (count > this.maxDaily * 0.9) {
      console.warn(`⚠️ [RATE LIMIT ALERT] Gemini daily usage at ${count}/${this.maxDaily} requests.`);
    }
    return count;
  }

  async throttle() {
    const ticket = this.queue.then(async () => {
      const now = Date.now();
      const windowStart = now - 60000;

      // Prune timestamps older than 60 seconds
      this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);

      // If at or above limit, wait until oldest call exits window
      if (this.requestTimestamps.length >= this.maxRpm) {
        const oldest = this.requestTimestamps[0];
        const waitMs = oldest + 60050 - now;
        if (waitMs > 0) {
          console.log(`[RATE LIMIT] Throttling request for ${(waitMs / 1000).toFixed(2)}s to respect 15 RPM limit...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }

      this.requestTimestamps.push(Date.now());
      this.incrementDailyCount();
    });

    this.queue = ticket.catch(() => {});
    return ticket;
  }

  async executeWithRetry(apiFn, maxRetries = 3) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await this.throttle();
        return await apiFn();
      } catch (err) {
        attempt++;
        const status = err.status || (err.error && err.error.code);
        const isRetryable = status === 429 || status === 503 || (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('high demand')));

        if (isRetryable && attempt <= maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
          console.warn(`⚠️ [RATE LIMIT RETRY] Transient ${status || 'API error'}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw err;
        }
      }
    }
  }
}

export const rateLimiter = new GeminiRateLimiter();
export default rateLimiter;

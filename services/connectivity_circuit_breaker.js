/**
 * Connectivity Circuit Breaker
 * Provides fault-tolerant wrapping for cloud Gemini calls.
 * Fast abort (default 400ms) prevents child-facing dead air.
 * Automatically trips to OPEN on failures or when OFFLINE_MODE is set.
 */

export class CloudCircuitBreaker {
  constructor({
    timeoutMs = 400,
    maxFailures = 2,
    coolDownMs = 15000,
    name = 'GeminiDecisionCircuit',
  } = {}) {
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.maxFailures = maxFailures;
    this.coolDownMs = coolDownMs;
    this.failureCount = 0;
    this.state = 'CLOSED'; // 'CLOSED' (healthy), 'OPEN' (offline/tripped), 'HALF_OPEN'
    this.lastStateChange = Date.now();
    this.stats = {
      calls: 0,
      successes: 0,
      timeouts: 0,
      failures: 0,
      circuitOpenSkips: 0,
    };
  }

  isOpen() {
    if (process.env.OFFLINE_MODE === 'true' || !process.env.GEMINI_API_KEY) {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange > this.coolDownMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  async execute(cloudFn, fallbackFn = () => null) {
    this.stats.calls += 1;
    if (this.isOpen()) {
      this.stats.circuitOpenSkips += 1;
      return typeof fallbackFn === 'function' ? fallbackFn('OFFLINE_OR_CIRCUIT_OPEN') : null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const result = await cloudFn(controller.signal);
      clearTimeout(timer);
      this.recordSuccess();
      return result;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      if (isAbort) {
        this.stats.timeouts += 1;
      } else {
        this.stats.failures += 1;
      }
      this.recordFailure(isAbort ? 'TIMEOUT_EXCEEDED' : err.message);
      return typeof fallbackFn === 'function' ? fallbackFn(isAbort ? 'TIMEOUT_EXCEEDED' : err.message) : null;
    }
  }

  recordSuccess() {
    this.stats.successes += 1;
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(reason) {
    this.failureCount += 1;
    if (this.failureCount >= this.maxFailures) {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      console.warn(`⚡ [${this.name}] Circuit tripped to OPEN (${reason}). Cooling down for ${this.coolDownMs}ms.`);
    }
  }

  getStats() {
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
    };
  }

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
    this.stats = {
      calls: 0,
      successes: 0,
      timeouts: 0,
      failures: 0,
      circuitOpenSkips: 0,
    };
  }
}

export const defaultDecisionBreaker = new CloudCircuitBreaker({
  timeoutMs: parseInt(process.env.DECISION_TIMEOUT_MS || '1800', 10),
  maxFailures: 2,
  coolDownMs: 15000,
  name: 'GeminiDecisionBreaker',
});

export default defaultDecisionBreaker;

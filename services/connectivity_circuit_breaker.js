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

  async execute(cloudFn, fallbackFn) {
    if (this.isOpen()) {
      return fallbackFn('OFFLINE_OR_CIRCUIT_OPEN');
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
      this.recordFailure(isAbort ? 'TIMEOUT_EXCEEDED' : err.message);
      return fallbackFn(isAbort ? 'TIMEOUT_EXCEEDED' : err.message);
    }
  }

  recordSuccess() {
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

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
  }
}

export const defaultDecisionBreaker = new CloudCircuitBreaker({
  timeoutMs: parseInt(process.env.DECISION_TIMEOUT_MS || '800', 10),
  maxFailures: 2,
  coolDownMs: 15000,
  name: 'GeminiDecisionBreaker',
});

export default defaultDecisionBreaker;

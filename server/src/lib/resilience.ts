type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
    name: string;
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxCalls?: number;
}

export class ServiceUnavailableError extends Error {
    code = 'SERVICE_UNAVAILABLE';

    constructor(message: string) {
        super(message);
        this.name = 'ServiceUnavailableError';
    }
}

export class TimeoutError extends Error {
    code = 'TIMEOUT';

    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failures = 0;
    private openedAt = 0;
    private halfOpenCalls = 0;

    constructor(private readonly options: CircuitBreakerOptions) {}

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.openedAt < this.options.resetTimeoutMs) {
                throw new ServiceUnavailableError(`${this.options.name} circuit is open`);
            }
            this.state = 'HALF_OPEN';
            this.halfOpenCalls = 0;
        }

        if (this.state === 'HALF_OPEN') {
            const maxCalls = this.options.halfOpenMaxCalls ?? 1;
            if (this.halfOpenCalls >= maxCalls) {
                throw new ServiceUnavailableError(`${this.options.name} circuit is half-open`);
            }
            this.halfOpenCalls++;
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    snapshot() {
        return {
            name: this.options.name,
            state: this.state,
            failures: this.failures,
            opened_at: this.openedAt ? new Date(this.openedAt).toISOString() : null,
        };
    }

    private onSuccess() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.halfOpenCalls = 0;
    }

    private onFailure() {
        this.failures++;
        if (this.state === 'HALF_OPEN' || this.failures >= this.options.failureThreshold) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
            this.halfOpenCalls = 0;
        }
    }
}

export class Bulkhead {
    private active = 0;

    constructor(
        private readonly name: string,
        private readonly maxConcurrent: number,
    ) {}

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            throw new ServiceUnavailableError(`${this.name} bulkhead is full`);
        }

        this.active++;
        try {
            return await operation();
        } finally {
            this.active--;
        }
    }

    snapshot() {
        return {
            name: this.name,
            active: this.active,
            max_concurrent: this.maxConcurrent,
        };
    }
}

export async function fetchWithTimeout(input: string | URL | Request, init: RequestInit = {}, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: init.signal ?? controller.signal,
        });
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

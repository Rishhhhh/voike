import pino from 'pino';
import EventEmitter from 'eventemitter3';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true },
        },
});

export type MetricSample = Record<string, number>;

class MetricCollector extends EventEmitter {
  private gauges: Record<string, number> = {};

  setGauge(name: string, value: number) {
    this.gauges[name] = value;
    this.emit('metric', { type: 'gauge', name, value, ts: Date.now() });
  }

  incrementCounter(name: string, delta = 1) {
    this.gauges[name] = (this.gauges[name] || 0) + delta;
    this.emit('metric', { type: 'counter', name, value: this.gauges[name], ts: Date.now() });
  }

  snapshot() {
    return { ...this.gauges };
  }
}

export const metrics = new MetricCollector();

export type TelemetryEvent =
  | { type: 'ingest.completed'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'query.executed'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'kernel.energyUpdated'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'dai.updateSuggested'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'blob.created'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'grid.job.submitted'; payload: Record<string, unknown> & { projectId?: string } }
  | { type: 'ledger.appended'; payload: Record<string, unknown> & { projectId?: string } };

class TelemetryBus extends EventEmitter {
  publish(event: TelemetryEvent) {
    this.emit(event.type, event);
  }
}

export const telemetryBus = new TelemetryBus();

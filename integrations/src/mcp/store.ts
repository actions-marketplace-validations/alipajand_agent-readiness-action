import { randomUUID } from 'node:crypto';
import type { CombinedReport, EngineKey } from '../runtime/types.js';

export interface StoredReport {
  id: string;
  engine: EngineKey;
  createdAt: string;
  report: CombinedReport;
}

/**
 * Reports from this server process, newest last. Nothing is written to disk;
 * the oldest report is dropped once `capacity` is reached.
 */
export class ReportStore {
  private readonly reports = new Map<string, StoredReport>();

  constructor(private readonly capacity = 20) {}

  add(engine: EngineKey, report: CombinedReport): StoredReport {
    const stored = { id: randomUUID(), engine, createdAt: new Date().toISOString(), report };
    this.reports.set(stored.id, stored);
    while (this.reports.size > this.capacity) {
      const oldest = this.reports.keys().next().value as string;
      this.reports.delete(oldest);
    }
    return stored;
  }

  get(id: string): StoredReport | undefined {
    return this.reports.get(id);
  }
}

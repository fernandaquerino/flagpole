import { z } from 'zod';
import {
  contextSchema,
  valueSchema,
  type Context,
  type FlagValue,
} from '@flagpole/shared';
export type Flags = Record<string, FlagValue>;
export type Snapshot = { flags: Flags; loaded: boolean; error: Error | null };
export type ClientOptions = {
  clientKey: string;
  apiUrl: string;
  context: Context;
  pollInterval?: number;
  initialFlags?: Flags;
  fetch?: typeof globalThis.fetch;
  requestTimeout?: number;
};
const responseSchema = z.object({
  flags: z.record(
    z.object({
      value: valueSchema.nullable(),
      reason: z.enum([
        'OFF',
        'RULE_MATCH',
        'FALLTHROUGH',
        'FLAG_NOT_FOUND',
        'INVALID_CONFIG',
      ]),
    }),
  ),
});
export class FlagpoleClient {
  private context: Context;
  private snapshot: Snapshot;
  private readonly initial: Snapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private started = false;
  constructor(private readonly options: ClientOptions) {
    this.context = { ...options.context };
    this.initial = {
      flags: { ...options.initialFlags },
      loaded: options.initialFlags !== undefined,
      error: null,
    };
    this.snapshot = this.initial;
  }
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((fn) => fn());
  }
  start() {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    const interval = this.options.pollInterval ?? 30000;
    if (interval > 0)
      this.timer = setInterval(() => {
        if (!this.controller) void this.refresh();
      }, interval);
  }
  stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
  }
  setContext(context: Context) {
    if (JSON.stringify(context) === JSON.stringify(this.context)) return;
    this.context = { ...context };
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    // Do not expose values belonging to the previous identity while a new context loads.
    this.emit({ flags: {}, loaded: false, error: null });
    if (this.started) void this.refresh();
  }
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeout ?? 10000,
    );
    try {
      const context = contextSchema.parse(this.context);
      const response = await (this.options.fetch ?? globalThis.fetch)(
        `${this.options.apiUrl.replace(/\/$/, '')}/sdk/v1/evaluate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.clientKey}`,
          },
          body: JSON.stringify({ context }),
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      if (!response.ok)
        throw new Error(`Flagpole evaluation failed (${response.status})`);
      const parsed = responseSchema.parse(await response.json());
      const flags: Flags = Object.fromEntries(
        Object.entries(parsed.flags)
          .filter(([, r]) => r.value !== null)
          .map(([key, r]) => [key, r.value as FlagValue]),
      );
      if (generation === this.generation)
        this.emit({ flags, loaded: true, error: null });
    } catch (error) {
      if (generation === this.generation)
        this.emit({
          ...this.snapshot,
          error:
            error instanceof Error
              ? error
              : new Error('Flagpole request failed'),
        });
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) this.controller = undefined;
    }
  }
  getFlag(key: string, defaultValue: boolean): boolean;
  getFlag(key: string, defaultValue: string): string;
  getFlag(key: string, defaultValue: FlagValue): FlagValue {
    const value = this.snapshot.flags[key];
    return typeof value === typeof defaultValue ? value! : defaultValue;
  }
}

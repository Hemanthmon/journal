export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave for free-text fields. Typing schedules a save after `delayMs` of
 * quiet; `flush()` saves immediately (on blur, date change, app backgrounding, unmount).
 * Saves never overlap: a change made during a save is saved right after it.
 */
export class Autosaver<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: { value: T } | null = null;
  private inFlight: Promise<void> | null = null;
  private status: SaveStatus = 'idle';
  private listeners = new Set<(s: SaveStatus) => void>();

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly delayMs = 800,
  ) {}

  getStatus(): SaveStatus {
    return this.status;
  }

  subscribe(fn: (s: SaveStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: SaveStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  update(value: T): void {
    this.latest = { value };
    this.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight;
    const next = this.latest;
    if (!next) return;
    this.latest = null;
    this.set('saving');
    let failed = false;
    this.inFlight = this.save(next.value)
      .then(() => {
        if (!this.latest) this.set('saved');
      })
      .catch(() => {
        // Keep the unsaved value so the next edit or flush retries it (no retry loop).
        failed = true;
        this.latest ??= next;
        this.set('error');
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
    // A newer edit arrived during the save and has no timer pending: save it now.
    if (!failed && this.latest && !this.timer) await this.flush();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}

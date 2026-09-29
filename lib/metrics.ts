/**
 * Minimal Prometheus text exposition (NFR-010) without dependencies: an in-process latency
 * histogram for the slot API plus gauges computed on scrape by the metrics route.
 */

const BUCKETS = [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1, 2, 5];

export class Histogram {
  private readonly counts = new Array<number>(BUCKETS.length).fill(0);
  private sum = 0;
  private count = 0;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  observe(seconds: number): void {
    this.sum += seconds;
    this.count += 1;
    BUCKETS.forEach((le, i) => {
      if (seconds <= le) this.counts[i] += 1;
    });
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    BUCKETS.forEach((le, i) => lines.push(`${this.name}_bucket{le="${le}"} ${this.counts[i]}`));
    lines.push(`${this.name}_bucket{le="+Inf"} ${this.count}`, `${this.name}_sum ${this.sum}`, `${this.name}_count ${this.count}`);
    return lines.join("\n");
  }
}

const escapeLabel = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

export function gauge(name: string, help: string, samples: { labels?: Record<string, string>; value: number }[]): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const s of samples) {
    const labels = s.labels ? `{${Object.entries(s.labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",")}}` : "";
    lines.push(`${name}${labels} ${s.value}`);
  }
  return lines.join("\n");
}

const globalForMetrics = globalThis as unknown as { __opencalSlotLatency?: Histogram };

/** Latency of GET/POST /api/public/slots, observed by the route. */
export function slotLatency(): Histogram {
  globalForMetrics.__opencalSlotLatency ??= new Histogram("opencalendar_slot_request_duration_seconds", "Slot API request duration");
  return globalForMetrics.__opencalSlotLatency;
}

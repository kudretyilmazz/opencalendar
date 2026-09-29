import { describe, expect, it } from "vitest";
import { gauge, Histogram } from "./metrics";

describe("metrics", () => {
  it("renders a cumulative Prometheus histogram", () => {
    const h = new Histogram("x_seconds", "X");
    h.observe(0.04);
    h.observe(0.25);
    h.observe(7);
    const text = h.render();
    expect(text).toContain('x_seconds_bucket{le="0.05"} 1');
    expect(text).toContain('x_seconds_bucket{le="0.3"} 2');
    expect(text).toContain('x_seconds_bucket{le="+Inf"} 3');
    expect(text).toContain("x_seconds_count 3");
    expect(text).toContain("# TYPE x_seconds histogram");
  });

  it("renders gauges with escaped labels", () => {
    expect(gauge("q", "Queue", [{ labels: { name: 'a"b' }, value: 2 }, { value: 1 }])).toBe(
      ['# HELP q Queue', "# TYPE q gauge", 'q{name="a\\"b"} 2', "q 1"].join("\n"),
    );
  });
});

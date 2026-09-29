import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

function capture() {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  return { out, err };
}

describe("logger", () => {
  it("writes JSON lines with level, event and fields", () => {
    process.env = { ...env, NODE_ENV: "production", LOG_LEVEL: "debug" };
    const { out } = capture();
    logger.info("thing.happened", { id: 1 });
    const line = JSON.parse(String(out.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "info", event: "thing.happened", id: 1 });
    expect(line.time).toBeTypeOf("string");
  });

  it("sends warnings and errors to stderr", () => {
    process.env = { ...env, NODE_ENV: "production", LOG_LEVEL: "debug" };
    const { out, err } = capture();
    logger.warn("w");
    logger.error("e");
    logger.debug("d");
    expect(err).toHaveBeenCalledTimes(2);
    expect(out).toHaveBeenCalledTimes(1);
  });

  it("respects LOG_LEVEL", () => {
    process.env = { ...env, NODE_ENV: "production", LOG_LEVEL: "warn" };
    const { out, err } = capture();
    logger.info("hidden");
    logger.debug("hidden");
    logger.error("shown");
    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("is silent under test", () => {
    process.env = { ...env, NODE_ENV: "test" };
    const { out, err } = capture();
    logger.error("x");
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
});

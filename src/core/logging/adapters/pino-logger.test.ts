import pino from "pino";
import { describe, expect, it } from "vitest";

import { PinoLoggerAdapter } from "./pino-logger";

function captureLogger(lines: string[]): pino.Logger {
  return pino(
    { level: "trace", base: undefined },
    {
      write(chunk: string | Uint8Array) {
        lines.push(String(chunk));
      },
    },
  );
}

describe("PinoLoggerAdapter", () => {
  it("copies only error and fatal events to the dedicated logger", () => {
    const mainLines: string[] = [];
    const errorLines: string[] = [];
    const logger = new PinoLoggerAdapter(
      captureLogger(mainLines),
      "test.scope",
      undefined,
      captureLogger(errorLines),
    ).child({ requestId: "request-1" });

    logger.warn("warning");
    logger.error("failure", { status: 500 });
    logger.fatal("fatal failure");

    expect(mainLines).toHaveLength(3);
    expect(errorLines).toHaveLength(2);
    expect(errorLines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        level: 50,
        msg: "failure",
        requestId: "request-1",
        scope: "test.scope",
        status: 500,
      }),
      expect.objectContaining({
        level: 60,
        msg: "fatal failure",
        requestId: "request-1",
        scope: "test.scope",
      }),
    ]);
  });
});

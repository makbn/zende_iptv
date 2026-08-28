import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RotatingFileDestination } from "./rotating-file-destination";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createTempPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "zende-error-log-"));
  tempDirectories.push(directory);
  return join(directory, "nested", "errors.ndjson");
}

describe("RotatingFileDestination", () => {
  it("creates parent directories and appends log lines", () => {
    const filePath = createTempPath();
    const destination = new RotatingFileDestination({
      filePath,
      maxBytes: 100,
      maxFiles: 3,
    });

    destination.write("first\n");
    destination.write("second\n");

    expect(readFileSync(filePath, "utf8")).toBe("first\nsecond\n");
  });

  it("retains only the configured number of files", () => {
    const filePath = createTempPath();
    const destination = new RotatingFileDestination({
      filePath,
      maxBytes: 10,
      maxFiles: 3,
    });

    destination.write("one\ntwo\n");
    destination.write("333\n");
    destination.write("444444\n");
    destination.write("5555\n");

    expect(readFileSync(filePath, "utf8")).toBe("5555\n");
    expect(readFileSync(`${filePath}.1`, "utf8")).toBe("444444\n");
    expect(readFileSync(`${filePath}.2`, "utf8")).toBe("333\n");
  });

  it("rotates without history when maxFiles is one", () => {
    const filePath = createTempPath();
    const destination = new RotatingFileDestination({
      filePath,
      maxBytes: 5,
      maxFiles: 1,
    });

    destination.write("old\n");
    destination.write("new\n");

    expect(readFileSync(filePath, "utf8")).toBe("new\n");
  });
});

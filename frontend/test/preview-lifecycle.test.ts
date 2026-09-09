import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  createPreviewChildIsolation,
  finishPreviewLifecycle,
  preparePreviewStdin,
  waitForChildTermination,
} from "./preview/preview-lifecycle.mjs";

describe("preview launcher lifecycle", () => {
  it("uses platform-safe Next.js process-group behavior", () => {
    expect(createPreviewChildIsolation("win32")).toMatchObject({
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    expect(createPreviewChildIsolation("linux").detached).toBe(true);
  });

  it("uses raw input for ETX and restores stdin during cleanup", () => {
    const stdin = new EventEmitter() as EventEmitter & {
      isRaw: boolean;
      isTTY: boolean;
      pause: () => void;
      resume: () => void;
      setRawMode: (enabled: boolean) => void;
    };
    stdin.isRaw = false;
    stdin.isTTY = true;
    stdin.pause = vi.fn();
    stdin.resume = vi.fn();
    stdin.setRawMode = vi.fn();
    const stdinDataHandler = vi.fn();

    const release = preparePreviewStdin(stdin, stdinDataHandler);
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(stdin.resume).toHaveBeenCalledOnce();
    expect(stdin.listenerCount("data")).toBe(1);

    release();
    release();

    expect(stdin.listenerCount("data")).toBe(0);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdin.pause).toHaveBeenCalledOnce();
  });

  it("cleans up after the Next.js child exits", async () => {
    const child = new EventEmitter();
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const result = finishPreviewLifecycle({
      child,
      cleanup,
    });
    child.emit("exit", 0, null);

    await expect(result).resolves.toBe(0);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("waits for the child exit event before cache cleanup continues", async () => {
    const child = Object.assign(new EventEmitter(), { exitCode: null as number | null });
    const result = waitForChildTermination(child, 1_000);

    child.exitCode = 0;
    child.emit("exit", 0, null);

    await expect(result).resolves.toBe(true);
  });
});

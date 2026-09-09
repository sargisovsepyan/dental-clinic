export const createPreviewChildIsolation = (platform = process.platform) => ({
  detached: platform !== "win32",
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

/**
 * @param {{
 *   isRaw?: boolean,
 *   isTTY?: boolean,
 *   off: (event: string, listener: (...args: any[]) => void) => unknown,
 *   on: (event: string, listener: (...args: any[]) => void) => unknown,
 *   pause: () => unknown,
 *   resume: () => unknown,
 *   setRawMode?: (enabled: boolean) => unknown,
 * }} stdin
 * @param {(...args: any[]) => void} stdinDataHandler
 */
export const preparePreviewStdin = (stdin, stdinDataHandler) => {
  const canUseRawMode = stdin.isTTY && typeof stdin.setRawMode === "function";
  const wasRaw = Boolean(stdin.isRaw);
  if (canUseRawMode) stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", stdinDataHandler);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    stdin.off("data", stdinDataHandler);
    if (canUseRawMode) stdin.setRawMode?.(wasRaw);
    stdin.pause();
  };
};

/**
 * @param {{
 *   exitCode: number | null,
 *   off: (event: string, listener: (...args: any[]) => void) => unknown,
 *   once: (event: string, listener: (...args: any[]) => void) => unknown,
 * }} child
 * @param {number} timeoutMs
 */
export const waitForChildTermination = (child, timeoutMs = 2_000) => {
  if (child.exitCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onExit = () => settle(true);
    const timeout = setTimeout(() => settle(false), timeoutMs);
    const settle = (exited) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    child.once("exit", onExit);
  });
};

/**
 * Wait for the Next.js child and perform the launcher's cleanup.
 *
 * @param {{
 *   child: { once: (event: string, listener: (...args: any[]) => void) => unknown },
 *   cleanup: () => Promise<void>,
 * }} options
 */
export const finishPreviewLifecycle = async ({
  child,
  cleanup,
}) => {
  const exitCode = await new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });

  await cleanup();
  return exitCode;
};

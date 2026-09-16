// Keep the request deadline through body consumption, including stalled bodies.
export async function readJsonWithSignal(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

let draining = false;
const isProcessDraining = () => draining;

// One deadline covers in-flight work AND dependency/reporting cleanup.
const createShutdownHandler = ({
  cleanup,
  onStop = () => {},
  onExit = (code) => process.exit(code),
  timeoutMs,
  onDeadline = () => {},
}) => {
  let completion;
  let finalCode = 0;
  let exited = false;
  const exitOnce = (code) => {
    if (exited) return;
    exited = true;
    onExit(code);
  };
  return (signal, code = 0) => {
    if (code) finalCode = 1;
    if (completion) return completion;
    draining = true;
    onStop(signal);
    const deadline = setTimeout(() => { onDeadline(); exitOnce(1); }, timeoutMs);
    completion = Promise.resolve().then(cleanup)
      .then(() => exitOnce(finalCode), () => exitOnce(1))
      .finally(() => clearTimeout(deadline));
    return completion;
  };
};

export { createShutdownHandler, isProcessDraining };

// The deadline covers the whole operation, not only connection establishment.
const withDeadline = async (operation, timeoutMs, message = 'Operation timed out') => {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }
  finally {
    clearTimeout(timer);
  }
};

export { withDeadline };

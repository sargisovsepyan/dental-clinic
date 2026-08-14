import logger from '../observability/logger.js';


const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const metadata = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };

    if (res.statusCode >= 500) {
      logger.error('http_request_completed', metadata);
    }
    else if (res.statusCode >= 400) {
      logger.warn('http_request_completed', metadata);
    }
    else {
      logger.info('http_request_completed', metadata);
    }
  });

  next();
};


export default requestLogger;

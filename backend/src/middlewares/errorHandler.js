import env from '../config/env.js';
import logger from '../observability/logger.js';
import { reportError } from '../observability/errorMonitor.js';


const normalizeError = (err) => {
  const errorStatus = err.statusCode || err.status;
  let statusCode = Number.isInteger(errorStatus) &&
    errorStatus >= 400 && errorStatus <= 599
    ? errorStatus
    : 500;
  let message = err.message || 'Internal server error';

  if (err.code === 11000) {
    statusCode = 409;
    message = 'A record with this value already exists';
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID';
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((error) => error.message)
      .join(', ');
  }
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
  }
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  }

  return { statusCode, message };
};


const buildErrorBody = (err, production = env.NODE_ENV === 'production') => {
  const { statusCode, message } = normalizeError(err);
  return {
    statusCode,
    body: {
      success: false,
      message: production && statusCode >= 500
        ? 'Internal server error'
        : message,
      ...(!production && { stack: err.stack }),
    },
  };
};


const errorHandler = (err, req, res, _next) => {
  const { statusCode, body } = buildErrorBody(err);

  if (statusCode >= 500 || env.NODE_ENV === 'development') {
    const context = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode,
    };
    logger.error('request_error', { ...context, error: err });
    if (statusCode >= 500) {
      reportError(err, context);
    }
  }

  res.status(statusCode).json(body);
};


export { buildErrorBody };
export default errorHandler;

import env from '../config/env.js';
import logger from '../observability/logger.js';
import { reportError } from '../observability/errorMonitor.js';
import ApiError from '../utils/ApiError.js';


const normalizeError = (err) => {
  const isApiError = err instanceof ApiError;
  let statusCode = isApiError ? err.statusCode : 500;
  let message = isApiError
    ? err.message
    : 'Internal server error';
  let code = isApiError ? err.code : undefined;
  let details = isApiError ? err.details : undefined;

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
    message = 'Invalid request data';
  }
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
  }
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  }

  if (!isApiError) {
    code = undefined;
    details = undefined;
  }

  return { statusCode, message, code, details };
};


const buildErrorBody = (err, production = env.NODE_ENV === 'production') => {
  const {
    statusCode,
    message,
    code,
    details,
  } = normalizeError(err);
  return {
    statusCode,
    body: {
      success: false,
      message: production && statusCode >= 500
        ? 'Internal server error'
        : message,
      ...(code && statusCode < 500 ? { code } : {}),
      ...(details && statusCode < 500 ? { details } : {}),
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

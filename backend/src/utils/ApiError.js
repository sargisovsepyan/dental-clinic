class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);

    this.statusCode = statusCode;
    this.code = options.code;
    this.details = options.details;
    this.name = 'ApiError';

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;

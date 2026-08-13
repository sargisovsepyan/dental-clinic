const errorHandler = (err, req, res, next) => {
  const errorStatus =
    err.statusCode || err.status;

  let statusCode =
    Number.isInteger(errorStatus) &&
    errorStatus >= 400 &&
    errorStatus <= 599
      ? errorStatus
      : 500;

  let message =
    err.message ||
    'Internal server error';


  // MongoDB duplicate key
  if (err.code === 11000) {
    statusCode = 409;

    message =
      'A record with this value already exists';
  }


  // Invalid MongoDB ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;

    message =
      'Invalid resource ID';
  }


  // Mongoose validation
  if (err.name === 'ValidationError') {
    statusCode = 400;

    message = Object.values(
      err.errors
    )
      .map(
        (error) =>
          error.message
      )
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

  const responseMessage =
    process.env.NODE_ENV === 'production' &&
    statusCode >= 500
      ? 'Internal server error'
      : message;


  if (
    statusCode >= 500 ||
    process.env.NODE_ENV ===
      'development'
  ) {
    console.error({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      error: err.message,
      code: err.code,
    });
  }


  res.status(statusCode).json({
    success: false,
    message: responseMessage,

    ...(process.env.NODE_ENV !==
      'production' && {
      stack: err.stack,
    }),
  });
};


export default errorHandler;

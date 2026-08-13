const errorHandler = (err, req, res, next) => {
  let statusCode =
    err.statusCode || 500;

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


  console.error({
    method: req.method,
    url: req.originalUrl,
    statusCode,
    error: err.message,
    code: err.code,
  });


  res.status(statusCode).json({
    success: false,
    message,

    ...(process.env.NODE_ENV !==
      'production' && {
      stack: err.stack,
    }),
  });
};


export default errorHandler;

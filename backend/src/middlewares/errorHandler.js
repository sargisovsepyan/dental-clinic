const errorHandler = (err, req, res, next) => {
    const statusCode =
        res.statusCode >= 400 ? res.statusCode : 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        stack:
            process.env.NODE_ENV === 'production'
                ? undefined
                : err.stack,
    });
};

export default errorHandler;
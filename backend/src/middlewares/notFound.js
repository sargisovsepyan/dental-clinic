const notFound = (req, res, next) => {
    res.status(404);

    next(
        new Error(`Route not found: ${req.method} ${req.originalUrl}`)
    );
};

export default notFound;
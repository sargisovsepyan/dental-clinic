import ApiError from '../utils/ApiError.js';

const containsDangerousKey = (value) => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    if (Array.isArray(value)) {
        return value.some(containsDangerousKey);
    }

    for (const [key, childValue] of Object.entries(value)) {
        if (
            key.startsWith('$') ||
            key.includes('.')
        ) {
            return true;
        }

        if (containsDangerousKey(childValue)) {
            return true;
        }
    }

    return false;
};

const rejectNoSqlOperators = (
    req,
    res,
    next
) => {
    if (
        containsDangerousKey(req.body) ||
        containsDangerousKey(req.query) ||
        containsDangerousKey(req.params)
    ) {
        return next(
            new ApiError(
                400,
                'Invalid request data'
            )
        );
    }

    next();
};

export default rejectNoSqlOperators;
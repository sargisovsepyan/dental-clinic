import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import env from './config/env.js';

import apiRoutes from './routes/index.js';

import {
    apiLimiter,
} from './middlewares/rateLimiter.js';

import rejectNoSqlOperators from './middlewares/security.js';

import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';

import ApiError from './utils/ApiError.js';
import requestId from './middlewares/requestId.js';

const app = express();

app.disable('x-powered-by');

app.use(requestId);

app.use(helmet());

const allowedOrigins =
    env.CLIENT_URL
        .split(',')
        .map((origin) =>
            origin.trim()
        );

app.use(
    cors({
        origin: (origin, callback) => {
            if (
                !origin ||
                allowedOrigins.includes(origin)
            ) {
                return callback(
                    null,
                    true
                );
            }

            return callback(
                new ApiError(
                    403,
                    'Origin is not allowed'
                )
            );
        },

        credentials: true,

        methods: [
            'GET',
            'POST',
            'PATCH',
            'DELETE',
        ],

        allowedHeaders: [
            'Content-Type',
            'Authorization',
        ],
    })
);

app.use(cookieParser());

app.use(
    express.json({
        limit: '100kb',
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: '100kb',
    })
);

app.use(
    rejectNoSqlOperators
);

if (
    env.NODE_ENV !== 'production'
) {
    app.use(morgan('dev'));
}

app.use(
    '/api',
    apiLimiter
);

app.get(
    '/api/v1/health',
    (req, res) => {
        res.status(200).json({
            success: true,

            message:
                'Dental clinic API is running',

            environment:
                env.NODE_ENV,

            timestamp:
                new Date().toISOString(),
        });
    }
);

app.use(
    '/api/v1',
    apiRoutes
);

app.use(notFound);
app.use(errorHandler);

export default app;

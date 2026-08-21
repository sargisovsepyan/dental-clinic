import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import apiRoutes from './routes/index.js';
import {
  apiLimiter,
  readinessLimiter,
} from './middlewares/rateLimiter.js';
import rejectNoSqlOperators from './middlewares/security.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';
import ApiError from './utils/ApiError.js';
import requestId from './middlewares/requestId.js';
import requestLogger from './middlewares/requestLogger.js';
import { enforceHttps } from './middlewares/transportSecurity.js';
import { checkReadiness } from './infrastructure/readiness.js';


const app = express();

app.disable('x-powered-by');
app.set(
  'trust proxy',
  env.TRUST_PROXY_CIDRS.length
    ? env.TRUST_PROXY_CIDRS
    : env.TRUST_PROXY_HOPS
);

app.use(requestId);
app.use(requestLogger);
app.use(helmet({
  strictTransportSecurity: env.NODE_ENV === 'production'
    ? undefined
    : false,
}));
app.use(enforceHttps);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new ApiError(403, 'Origin is not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
  ],
  maxAge: 600,
}));

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(rejectNoSqlOperators);

const liveResponse = (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'live',
  });
};

app.get('/api/v1/health', liveResponse);
app.get('/api/v1/health/live', liveResponse);
app.get('/api/v1/health/ready', readinessLimiter, async (_req, res) => {
  const { ready } = await checkReadiness();
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'not_ready',
  });
});

app.use('/api', apiLimiter);
app.use('/api/v1', apiRoutes);
app.use(notFound);
app.use(errorHandler);


export default app;

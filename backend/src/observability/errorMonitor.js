import env from '../config/env.js';
import logger, { redactText } from './logger.js';


const pendingReports = new Set();
let testReporter = null;


const setErrorReporterForTests = (reporter) => {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Error reporter injection is only allowed in tests');
  }
  testReporter = reporter;
};


const resetErrorReporterForTests = () => {
  testReporter = null;
};


const deliver = async (payload) => {
  if (testReporter) {
    await testReporter(payload);
    return;
  }
  if (env.NODE_ENV !== 'production' || !env.ERROR_MONITOR_WEBHOOK_URL) {
    return;
  }

  const response = await fetch(env.ERROR_MONITOR_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`Monitoring endpoint returned HTTP ${response.status}`);
  }
};


const reportError = (error, context = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    service: 'dental-clinic-api',
    environment: env.NODE_ENV,
    error: {
      name: redactText(error?.name || 'Error'),
      message: 'Internal error',
    },
    context: {
      requestId: context.requestId || '',
      method: context.method || '',
      path: context.path || '',
      statusCode: context.statusCode || 500,
    },
  };

  const report = deliver(payload)
    .catch((reportingError) => {
      logger.warn('error_monitor_delivery_failed', {
        error: reportingError,
        requestId: context.requestId,
      });
    })
    .finally(() => pendingReports.delete(report));
  pendingReports.add(report);
};


const flushErrorReports = async () => {
  await Promise.allSettled([...pendingReports]);
};


export {
  reportError,
  flushErrorReports,
  setErrorReporterForTests,
  resetErrorReporterForTests,
};

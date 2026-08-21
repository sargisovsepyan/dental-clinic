import env from '../config/env.js';


const ACKNOWLEDGEMENT = 'confirmed-backup-and-write-window';


const isLocalMongo = (uri) => {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'mongodb:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    );
  }
  catch {
    return false;
  }
};


const SAFE_ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{6,199}$/;
const SAFE_OPERATOR = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,99}$/;


const assertMaintenanceSafety = ({
  requiresWriteWindow = false,
  releaseArtifact,
  operatorId,
} = {}) => {
  const local = isLocalMongo(env.MONGO_URI);
  if (!local && env.NODE_ENV !== 'production') {
    throw new Error(
      'Remote database maintenance requires explicit NODE_ENV=production'
    );
  }
  if (
    env.NODE_ENV === 'production' &&
    process.env.PRODUCTION_MAINTENANCE_ACK !== ACKNOWLEDGEMENT
  ) {
    throw new Error(
      'Production maintenance requires the documented acknowledgement'
    );
  }
  if (env.NODE_ENV === 'production' && requiresWriteWindow) {
    if (process.env.PRODUCTION_WRITES_DRAINED !== 'true') {
      throw new Error(
        'Production migration apply requires a verified stopped-write window'
      );
    }
    if (!SAFE_ARTIFACT.test(releaseArtifact || '')) {
      throw new Error(
        'Production migration apply requires a safe release artifact identifier'
      );
    }
    if (!SAFE_OPERATOR.test(operatorId || '')) {
      throw new Error(
        'Production migration apply requires a safe operator identifier'
      );
    }
  }
};


export {
  ACKNOWLEDGEMENT,
  assertMaintenanceSafety,
};

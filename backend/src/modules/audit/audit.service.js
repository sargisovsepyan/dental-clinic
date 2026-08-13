import AuditLog from './audit.model.js';


const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'patientphone',
  'patientemail',
  'patientname',
  'patientcomment',
  'internalnote',
]);


const sanitizeValue = (
  value,
  depth = 0
) => {
  if (depth > 4) {
    return undefined;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === 'string'
  ) {
    return value.slice(0, 500);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map(
        (item) =>
          sanitizeValue(
            item,
            depth + 1
          )
      )
      .filter(
        (item) =>
          item !== undefined
      );
  }

  if (
    typeof value === 'object'
  ) {
    const clean = {};

    for (
      const [key, child]
      of Object.entries(value)
    ) {
      const normalizedKey =
        key
          .replace(
            /[^a-z0-9]/gi,
            ''
          )
          .toLowerCase();


      if (
        SENSITIVE_KEYS.has(
          normalizedKey
        )
      ) {
        continue;
      }


      if (
        key.startsWith('$') ||
        key.includes('.')
      ) {
        continue;
      }


      const sanitized =
        sanitizeValue(
          child,
          depth + 1
        );


      if (
        sanitized !== undefined
      ) {
        clean[key] =
          sanitized;
      }
    }

    return clean;
  }

  return undefined;
};


const logAuditEvent = async ({
  req,
  actorId = null,
  action,
  entityType,
  entityId = '',
  metadata = {},
}) => {
  try {
    await AuditLog.create({
      requestId:
        req.id || 'unknown',

      actor:
        actorId || null,

      action,

      entityType,

      entityId:
        String(
          entityId || ''
        ),

      method:
        req.method,

      path:
        req.originalUrl,

      ip:
        req.ip || '',

      userAgent:
        req.get(
          'user-agent'
        ) || '',

      metadata:
        sanitizeValue(
          metadata
        ) || {},
    });
  }
  catch (error) {
    console.error(
      'AUDIT_LOG_WRITE_FAILED',
      {
        message:
          error.message,

        action,

        requestId:
          req.id,
      }
    );
  }
};


const getAuditLogs = async (
  query
) => {
  const filter = {};


  if (query.action) {
    filter.action =
      query.action;
  }


  if (query.entityType) {
    filter.entityType =
      query.entityType;
  }


  if (query.entityId) {
    filter.entityId =
      query.entityId;
  }


  if (query.actorId) {
    filter.actor =
      query.actorId;
  }


  if (
    query.from ||
    query.to
  ) {
    filter.createdAt = {};

    if (query.from) {
      filter.createdAt.$gte =
        new Date(
          query.from
        );
    }

    if (query.to) {
      filter.createdAt.$lte =
        new Date(
          query.to
        );
    }
  }


  const page =
    query.page || 1;

  const limit =
    query.limit || 50;

  const skip =
    (page - 1) *
    limit;


  const [
    logs,
    total,
  ] = await Promise.all([
    AuditLog.find(filter)
      .populate(
        'actor',
        'name email role'
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    AuditLog.countDocuments(
      filter
    ),
  ]);


  return {
    logs,

    pagination: {
      page,
      limit,
      total,

      pages:
        Math.ceil(
          total / limit
        ),
    },
  };
};


export {
  logAuditEvent,
  getAuditLogs,
};

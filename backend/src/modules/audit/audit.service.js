import crypto from 'crypto';

import AuditLog from './audit.model.js';
import env from '../../config/env.js';

import logger from '../../observability/logger.js';


const pseudonymize = (value) => value
  ? crypto
    .createHmac('sha256', env.AUDIT_PSEUDONYM_SECRET)
    .update(String(value))
    .digest('hex')
  : '';


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
  'jwt',
  'setcookie',
]);


const isSensitiveKey = (
  normalizedKey
) => {
  return (
    SENSITIVE_KEYS.has(
      normalizedKey
    ) ||
    normalizedKey.includes(
      'password'
    ) ||
    normalizedKey.endsWith(
      'token'
    ) ||
    normalizedKey.includes(
      'secret'
    ) ||
    normalizedKey.includes(
      'authorization'
    ) ||
    normalizedKey.includes(
      'cookie'
    ) ||
    normalizedKey.includes(
      'email'
    ) ||
    normalizedKey.includes(
      'phone'
    ) ||
    normalizedKey.includes(
      'patient'
    ) ||
    normalizedKey.includes(
      'internalnote'
    ) ||
    normalizedKey.includes(
      'jwt'
    ) ||
    normalizedKey.includes(
      'requestbody'
    ) ||
    normalizedKey === 'body'
  );
};


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
        .slice(0, 50)
    ) {
      if (
        !key ||
        key.length > 80
      ) {
        continue;
      }

      const normalizedKey =
        key
          .replace(
            /[^a-z0-9]/gi,
            ''
          )
          .toLowerCase();


      if (
        isSensitiveKey(
          normalizedKey
        )
      ) {
        continue;
      }


      if (
        key.startsWith('$') ||
        key.includes('.') ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
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


const hasControlCharacters =
  (value) =>
    /[\u0000-\u001f\u007f]/u
      .test(value);


const safeText = (
  value,
  maxLength
) => {
  if (
    typeof value !== 'string' ||
    hasControlCharacters(value)
  ) {
    return '';
  }

  return value.slice(
    0,
    maxLength
  );
};


const safeActor = (
  actor
) => {
  if (
    !actor ||
    typeof actor !== 'object'
  ) {
    return null;
  }

  const id =
    actor._id?.toString?.();

  const name = safeText(
    actor.name,
    100
  );

  const email = safeText(
    actor.email,
    254
  );

  const allowedRoles =
    new Set([
      'admin',
      'receptionist',
      'dentist',
    ]);

  if (
    !/^[a-f\d]{24}$/iu.test(
      id || ''
    ) ||
    !name ||
    !email ||
    !allowedRoles.has(
      actor.role
    )
  ) {
    return null;
  }

  return {
    _id: id,
    name,
    email,
    role: actor.role,
  };
};


const safeAuditLog = (
  log
) => {
  const id =
    log._id?.toString?.() || '';

  return {
    _id: id,

    requestId: safeText(
      log.requestId,
      100
    ),

    actor: safeActor(
      log.actor
    ),

    action: safeText(
      log.action,
      120
    ),

    entityType: safeText(
      log.entityType,
      80
    ),

    entityId: safeText(
      log.entityId,
      150
    ),

    method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/u.test(log.method || '')
      ? log.method
      : '',

    path: typeof log.path === 'string' && log.path.startsWith('/')
      ? safeText(log.path.split(/[?#]/u)[0], 500)
      : '',

    metadata:
      sanitizeValue(
        log.metadata
      ) || {},

    createdAt:
      log.createdAt,
  };
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
        req.path || new URL(
          req.originalUrl,
          'http://internal.invalid'
        ).pathname,

      ip:
        pseudonymize(req.ip),

      userAgent:
        pseudonymize(req.get('user-agent')),

      metadata:
        sanitizeValue(
          metadata
        ) || {},
    });
  }
  catch (error) {
    logger.error(
      'audit_log_write_failed',
      {
        error,

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
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    AuditLog.countDocuments(
      filter
    ),
  ]);


  return {
    logs: logs.map(
      safeAuditLog
    ),

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
  sanitizeValue,
  safeAuditLog,
  logAuditEvent,
  getAuditLogs,
};

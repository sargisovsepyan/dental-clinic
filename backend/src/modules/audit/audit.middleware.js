import {
  logAuditEvent,
} from './audit.service.js';


const RESPONSE_ENTITY_KEYS = [
  'appointment',
  'case',
  'image',
  'service',
  'category',
  'dentist',
  'clinic',
  'closure',
  'exception',
  'user',
];


const findEntityId = (
  req,
  responseBody
) => {
  const data =
    responseBody?.data;


  if (data) {
    for (
      const key
      of RESPONSE_ENTITY_KEYS
    ) {
      const entity =
        data[key];

      if (
        entity?.id ||
        entity?._id
      ) {
        return (
          entity.id ||
          entity._id
        );
      }
    }
  }


  if (
    req.params?.id &&
    req.params?.date
  ) {
    return `${req.params.id}:${req.params.date}`;
  }


  if (req.params?.id) {
    return req.params.id;
  }


  if (req.params?.date) {
    return req.params.date;
  }


  return '';
};


const auditAction = (
  {
    action,
    entityType,
    metadata,
    actorFromResponse = false,
    failureAction = '',
  },
  handler
) => {
  return async (
    req,
    res,
    next
  ) => {
    let responseBody;

    const originalJson =
      res.json;


    res.json = function (
      body
    ) {
      responseBody = body;

      return originalJson.call(
        this,
        body
      );
    };


    try {
      await handler(
        req,
        res,
        next
      );


      if (
        res.statusCode >= 400
      ) {
        return;
      }


      const actorId =
        req.user?.id ||
        (
          actorFromResponse
            ? responseBody
                ?.data
                ?.user
                ?.id
            : null
        );


      const entityId =
        findEntityId(
          req,
          responseBody
        );


      const safeMetadata =
        typeof metadata ===
        'function'
          ? metadata(
              req,
              responseBody
            )
          : {};


      await logAuditEvent({
        req,

        actorId,

        action,

        entityType,

        entityId,

        metadata:
          safeMetadata,
      });
    }
    catch (error) {
      if (failureAction) {
        await logAuditEvent({
          req,
          actorId: req.user?.id || null,
          action: failureAction,
          entityType,
          entityId: findEntityId(req),
          metadata: {
            outcome: 'rejected',
            errorCode: error.code || error.name || 'Error',
          },
        });
      }
      next(error);
    }
    finally {
      res.json =
        originalJson;
    }
  };
};


export default auditAction;


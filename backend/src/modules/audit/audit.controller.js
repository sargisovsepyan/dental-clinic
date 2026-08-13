import {
  getAuditLogs as getAuditLogsService,
} from './audit.service.js';


const getAuditLogs = async (
  req,
  res
) => {
  const result =
    await getAuditLogsService(
      req.validatedQuery ||
      req.query
    );


  res.status(200).json({
    success: true,

    data: result,
  });
};


export {
  getAuditLogs,
};

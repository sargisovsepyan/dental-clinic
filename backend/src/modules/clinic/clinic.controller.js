import * as clinicService from './clinic.service.js';


const getClinic = async (
  req,
  res
) => {
  const clinic =
    await clinicService.getClinic();

  res.status(200).json({
    success: true,

    data: {
      clinic,
    },
  });
};


const updateClinic = async (
  req,
  res
) => {
  const clinic =
    await clinicService.updateClinic(
      req.body
    );

  res.status(200).json({
    success: true,

    data: {
      clinic,
    },
  });
};


const getClosures = async (
  req,
  res
) => {
  const closures =
    await clinicService.getClosures(
      req.validatedQuery ||
        req.query
    );

  res.status(200).json({
    success: true,

    data: {
      closures,
    },
  });
};


const setClosure = async (
  req,
  res
) => {
  const closure =
    await clinicService.upsertClosure(
      req.params.date,
      req.body
    );

  res.status(200).json({
    success: true,

    data: {
      closure,
    },
  });
};


const deleteClosure = async (
  req,
  res
) => {
  await clinicService.deleteClosure(
    req.params.date,
    req.validatedQuery || req.query
  );

  res.status(200).json({
    success: true,

    message:
      'Clinic schedule exception removed',
  });
};


export {
  getClinic,
  updateClinic,
  getClosures,
  setClosure,
  deleteClosure,
};

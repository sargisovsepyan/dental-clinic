import * as dentistService from './dentist.service.js';


const createDentist = async (
  req,
  res
) => {
  const dentist =
    await dentistService.createDentist(
      req.body
    );

  res.status(201).json({
    success: true,
    data: {
      dentist,
    },
  });
};


const getDentists = async (
  req,
  res
) => {
  const dentists =
    await dentistService.getPublicDentists(
      req.validatedQuery ||
        req.query
    );

  res.status(200).json({
    success: true,
    data: {
      dentists,
    },
  });
};


const getAdminDentists = async (
  req,
  res
) => {
  const dentists =
    await dentistService.getAdminDentists();

  res.status(200).json({
    success: true,
    data: {
      dentists,
    },
  });
};


const getDentist = async (
  req,
  res
) => {
  const dentist =
    await dentistService.getDentistBySlug(
      req.params.slug
    );

  res.status(200).json({
    success: true,
    data: {
      dentist,
    },
  });
};


const updateDentist = async (
  req,
  res
) => {
  const dentist =
    await dentistService.updateDentist(
      req.params.id,
      req.body
    );

  res.status(200).json({
    success: true,
    data: {
      dentist,
    },
  });
};


const disableDentist = async (
  req,
  res
) => {
  await dentistService.disableDentist(
    req.params.id
  );

  res.status(200).json({
    success: true,
    message:
      'Dentist disabled successfully',
  });
};


const restoreDentist = async (
  req,
  res
) => {
  const dentist =
    await dentistService.restoreDentist(
      req.params.id
    );

  res.status(200).json({
    success: true,
    data: {
      dentist,
    },
  });
};


const setScheduleException =
  async (
    req,
    res
  ) => {
    const exception =
      await dentistService
        .upsertScheduleException(
          req.params.id,
          req.params.date,
          req.body
        );

    res.status(200).json({
      success: true,
      data: {
        exception,
      },
    });
  };


const getScheduleExceptions =
  async (
    req,
    res
  ) => {
    const exceptions =
      await dentistService
        .getScheduleExceptions(
          req.params.id,
          req.validatedQuery ||
            req.query
        );

    res.status(200).json({
      success: true,
      data: {
        exceptions,
      },
    });
  };


const deleteScheduleException =
  async (
    req,
    res
  ) => {
    await dentistService
      .deleteScheduleException(
        req.params.id,
        req.params.date,
        req.validatedQuery || req.query
      );

    res.status(200).json({
      success: true,
      message:
        'Schedule exception removed',
    });
  };


export {
  createDentist,
  getDentists,
  getAdminDentists,
  getDentist,
  updateDentist,
  disableDentist,
  restoreDentist,
  setScheduleException,
  getScheduleExceptions,
  deleteScheduleException,
};

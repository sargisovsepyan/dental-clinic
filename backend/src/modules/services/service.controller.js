import * as serviceService from './service.service.js';

const createService = async (
  req,
  res
) => {
  const service =
    await serviceService.createService(
      req.body
    );

  res.status(201).json({
    success: true,
    data: { service },
  });
};

const getServices = async (
  req,
  res
) => {
  const services =
    await serviceService.getPublicServices(
      (req.validatedQuery || req.query)
    );

  res.status(200).json({
    success: true,
    data: { services },
  });
};

const getAdminServices = async (
  req,
  res
) => {
  const services =
    await serviceService.getAdminServices();

  res.status(200).json({
    success: true,
    data: { services },
  });
};

const getService = async (
  req,
  res
) => {
  const service =
    await serviceService.getServiceBySlug(
      req.params.slug
    );

  res.status(200).json({
    success: true,
    data: { service },
  });
};

const updateService = async (
  req,
  res
) => {
  const service =
    await serviceService.updateService(
      req.params.id,
      req.body
    );

  res.status(200).json({
    success: true,
    data: { service },
  });
};

const deleteService = async (
  req,
  res
) => {
  await serviceService.deleteService(
    req.params.id
  );

  res.status(200).json({
    success: true,
    message:
      'Service disabled successfully',
  });
};

const restoreService = async (
  req,
  res
) => {
  const service =
    await serviceService.restoreService(
      req.params.id
    );

  res.status(200).json({
    success: true,
    data: { service },
  });
};

export {
  createService,
  getServices,
  getAdminServices,
  getService,
  updateService,
  deleteService,
  restoreService,
};


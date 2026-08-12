import * as availabilityService from './availability.service.js';


const getAvailability = async (
  req,
  res
) => {
  const query =
    req.validatedQuery ||
    req.query;


  const availability =
    await availabilityService
      .getAvailability({
        dentistId:
          query.dentistId,

        serviceId:
          query.serviceId,

        date:
          query.date,
      });


  res.status(200).json({
    success: true,

    data: {
      availability,
    },
  });
};


export {
  getAvailability,
};

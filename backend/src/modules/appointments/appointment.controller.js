import * as appointmentService from './appointment.service.js';


const createAppointment = async (
  req,
  res
) => {
  const appointment =
    await appointmentService
      .createAppointment(
        req.body
      );


  res.status(201).json({
    success: true,

    message:
      'Appointment created successfully',

    data: {
      appointment: {
        id:
          appointment._id,

        confirmationCode:
          appointment
            .confirmationCode,

        patientName:
          appointment
            .patientName,

        date:
          appointment.date,

        startTime:
          appointment.startTime,

        endTime:
          appointment.endTime,

        status:
          appointment.status,

        dentist:
          appointment.dentist,

        service:
          appointment.service,

        price:
          appointment
            .priceSnapshot,
      },
    },
  });
};


const getAppointments = async (
  req,
  res
) => {
  const result =
    await appointmentService
      .getAppointments(
        req.validatedQuery ||
          req.query
      );


  res.status(200).json({
    success: true,

    data: result,
  });
};


const getAppointment = async (
  req,
  res
) => {
  const appointment =
    await appointmentService
      .getAppointmentById(
        req.params.id
      );


  res.status(200).json({
    success: true,

    data: {
      appointment,
    },
  });
};


const updateStatus = async (
  req,
  res
) => {
  const appointment =
    await appointmentService
      .updateStatus(
        req.params.id,
        req.body.status,
        req.body.internalNote
      );


  res.status(200).json({
    success: true,

    data: {
      appointment,
    },
  });
};


const cancelAppointment = async (
  req,
  res
) => {
  const appointment =
    await appointmentService
      .cancelAppointment(
        req.params.id,
        req.user.id,
        req.body.reason
      );


  res.status(200).json({
    success: true,

    message:
      'Appointment cancelled successfully',

    data: {
      appointment,
    },
  });
};


export {
  createAppointment,
  getAppointments,
  getAppointment,
  updateStatus,
  cancelAppointment,
};

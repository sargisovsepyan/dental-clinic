import * as appointmentService from './appointment.service.js';

import {
  verifyPublicBookingChallenge,
} from '../../security/botChallenge.js';


const createAppointment = async (
  req,
  res
) => {
  const idempotencyKey =
    appointmentService.validateBookingIdempotencyKey(
      req.get('Idempotency-Key'),
      { required: true }
    );

  await verifyPublicBookingChallenge({
    token: req.body.challengeToken,
    idempotencyKey,
  });

  const appointment =
    await appointmentService
      .createAppointment({
        ...req.body,
        challengeToken: undefined,
      }, {
        idempotencyKey:
          idempotencyKey,
      });

  res.locals.bookingIdempotencyReplay =
    appointmentService.wasIdempotentBookingReplay(appointment);
  const publicResult =
    appointmentService.getPublicBookingResult(appointment);


  res.status(201).json({
    success: true,

    message:
      'Appointment created successfully',

    data: {
      appointment: {
        ...publicResult,
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



const createAdminAppointment =
  async (
    req,
    res
  ) => {
    const appointment =
      await appointmentService
        .createAdminAppointment(
          req.body,
          req.user.id
        );


    res.status(201).json({
      success: true,

      message:
        'Appointment created successfully',

      data: {
        appointment,
      },
    });
  };


const rescheduleAppointment =
  async (
    req,
    res
  ) => {
    const appointment =
      await appointmentService
        .rescheduleAppointment(
          req.params.id,
          req.body,
          req.user.id
        );


    res.status(200).json({
      success: true,

      message:
        'Appointment rescheduled successfully',

      data: {
        appointment,
      },
    });
  };


export {
  createAppointment,
  createAdminAppointment,
  rescheduleAppointment,
  getAppointments,
  getAppointment,
  updateStatus,
  cancelAppointment,
};


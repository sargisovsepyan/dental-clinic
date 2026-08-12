import Joi from 'joi';

const time = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/);


const shiftSchema = Joi.object({
  start: time.required(),
  end: time.required(),
});


const workingDaySchema = Joi.object({
  dayOfWeek: Joi.number()
    .integer()
    .min(1)
    .max(7)
    .required(),

  isOpen: Joi.boolean()
    .required(),

  shifts: Joi.array()
    .items(shiftSchema)
    .max(6)
    .default([]),
});


const bookingSettingsSchema =
  Joi.object({
    isBookingEnabled:
      Joi.boolean(),

    slotIntervalMinutes:
      Joi.number()
        .integer()
        .valid(
          10,
          15,
          20,
          30,
          60
        ),

    minBookingNoticeMinutes:
      Joi.number()
        .integer()
        .min(0)
        .max(10080),

    maxBookingDaysAhead:
      Joi.number()
        .integer()
        .min(1)
        .max(365),

    bufferMinutes:
      Joi.number()
        .integer()
        .min(0)
        .max(120),

    allowSameDayBooking:
      Joi.boolean(),

    requireEmail:
      Joi.boolean(),

    autoConfirmAppointments:
      Joi.boolean(),

    cancellationNoticeHours:
      Joi.number()
        .integer()
        .min(0)
        .max(168),

    maxAppointmentsPerPhonePerDay:
      Joi.number()
        .integer()
        .min(1)
        .max(20),
  });


const socialLinksSchema =
  Joi.object({
    instagram:
      Joi.string()
        .uri()
        .allow(''),

    facebook:
      Joi.string()
        .uri()
        .allow(''),

    whatsapp:
      Joi.string()
        .allow(''),

    telegram:
      Joi.string()
        .allow(''),
  });


const updateClinicSchema = {
  body: Joi.object({
    clinicName:
      Joi.string()
        .trim()
        .min(2)
        .max(150),

    tagline:
      Joi.string()
        .trim()
        .max(250)
        .allow(''),

    description:
      Joi.string()
        .trim()
        .max(5000)
        .allow(''),

    phone:
      Joi.string()
        .trim()
        .max(30)
        .allow(''),

    secondaryPhone:
      Joi.string()
        .trim()
        .max(30)
        .allow(''),

    email:
      Joi.string()
        .trim()
        .lowercase()
        .email()
        .max(254)
        .allow(''),

    address:
      Joi.string()
        .trim()
        .max(300)
        .allow(''),

    mapUrl:
      Joi.string()
        .uri()
        .allow(''),

    latitude:
      Joi.number()
        .min(-90)
        .max(90)
        .allow(null),

    longitude:
      Joi.number()
        .min(-180)
        .max(180)
        .allow(null),

    socialLinks:
      socialLinksSchema,

    weeklySchedule:
      Joi.array()
        .items(
          workingDaySchema
        )
        .max(7),

    bookingSettings:
      bookingSettingsSchema,
  })
    .min(1),
};


const closureSchema = {
  params: Joi.object({
    date: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      )
      .required(),
  }),

  body: Joi.object({
    isOpen:
      Joi.boolean()
        .required(),

    shifts:
      Joi.array()
        .items(shiftSchema)
        .max(6)
        .default([]),

    note:
      Joi.string()
        .trim()
        .max(300)
        .allow('')
        .default(''),
  }),
};


const closureDateSchema = {
  params: Joi.object({
    date: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      )
      .required(),
  }),
};


const listClosuresSchema = {
  query: Joi.object({
    from: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      ),

    to: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      ),
  }),
};


export {
  updateClinicSchema,
  closureSchema,
  closureDateSchema,
  listClosuresSchema,
};

import express from 'express';

import authRoutes from '../modules/auth/auth.routes.js';

import serviceCategoryRoutes from '../modules/serviceCategories/serviceCategory.routes.js';

import serviceRoutes from '../modules/services/service.routes.js';

import dentistRoutes from '../modules/dentists/dentist.routes.js';

import clinicRoutes from '../modules/clinic/clinic.routes.js';

import availabilityRoutes from '../modules/availability/availability.routes.js';

import appointmentRoutes from '../modules/appointments/appointment.routes.js';


const router =
  express.Router();


router.use(
  '/auth',
  authRoutes
);

router.use(
  '/service-categories',
  serviceCategoryRoutes
);

router.use(
  '/services',
  serviceRoutes
);

router.use(
  '/dentists',
  dentistRoutes
);

router.use(
  '/clinic',
  clinicRoutes
);

router.use(
  '/availability',
  availabilityRoutes
);

router.use(
  '/appointments',
  appointmentRoutes
);


export default router;

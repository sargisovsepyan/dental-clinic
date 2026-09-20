import ApiError from './ApiError.js';
import { canonicalPhone } from '../../../shared/booking-input.mjs';


const normalizePhone = (value) => {
  const canonical = canonicalPhone(value);
  if (!canonical) throw new ApiError(400, 'Invalid phone number');
  return canonical;
};


export default normalizePhone;

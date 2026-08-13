import ApiError from './ApiError.js';


const normalizePhone = (value) => {
  if (!value) {
    throw new ApiError(
      400,
      'Phone number is required'
    );
  }

  let digits =
    String(value).replace(
      /\D/g,
      ''
    );


  if (
    digits.length === 9 &&
    digits.startsWith('0')
  ) {
    digits =
      `374${digits.slice(1)}`;
  }

  else if (
    digits.length === 8
  ) {
    digits =
      `374${digits}`;
  }

  else if (
    digits.startsWith('374') &&
    digits.length === 11
  ) {
    // Already Armenian international format
  }

  else if (
    digits.length < 8 ||
    digits.length > 15
  ) {
    throw new ApiError(
      400,
      'Invalid phone number'
    );
  }


  return `+${digits}`;
};


export default normalizePhone;

import Joi from 'joi';


const mailboxSchema = Joi.string()
  .email({ tlds: { allow: false } })
  .max(254)
  .required();


const isSafeSingleMailbox = (value) => (
  typeof value === 'string' &&
  !/[\r\n\u0000,;]/.test(value) &&
  !mailboxSchema.validate(value).error
);


const assertSafeSingleMailbox = (value) => {
  if (!isSafeSingleMailbox(value)) {
    const error = new Error('Invalid single-mailbox recipient');
    error.code = 'INVALID_MESSAGE';
    error.permanent = true;
    throw error;
  }
};


export { isSafeSingleMailbox, assertSafeSingleMailbox };

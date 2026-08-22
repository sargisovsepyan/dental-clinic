import { sendNotificationEmail } from '../../../mail/mail.service.js';


const unsupportedChannel = () => {
  const error = new Error('Notification channel is not configured');
  error.code = 'UNSUPPORTED_CHANNEL';
  error.permanent = true;
  return error;
};


const createChannelRegistry = ({
  emailDelivery = sendNotificationEmail,
} = {}) => Object.freeze({
  email: Object.freeze({
    deliver: async (message) => emailDelivery(message),
  }),
  sms: Object.freeze({
    deliver: async () => {
      throw unsupportedChannel();
    },
  }),
});


export { createChannelRegistry };

import nodemailer from 'nodemailer';

import env from '../config/env.js';

const getSmtpTransportOptions = () => ({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  requireTLS: env.SMTP_REQUIRE_TLS,
  connectionTimeout:
    env.SMTP_CONNECTION_TIMEOUT_MS,
  socketTimeout:
    env.SMTP_SOCKET_TIMEOUT_MS,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
  disableFileAccess: true,
  disableUrlAccess: true,
});

const createSmtpAdapter = () => {
  const transporter = nodemailer.createTransport(
    getSmtpTransportOptions()
  );

  return {
    async send({ to, subject, text }) {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
      });
    },
  };
};

export { getSmtpTransportOptions };
export default createSmtpAdapter;

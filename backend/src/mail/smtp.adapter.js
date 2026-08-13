import nodemailer from 'nodemailer';

import env from '../config/env.js';

const createSmtpAdapter = () => {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });

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

export default createSmtpAdapter;

import nodemailer from 'nodemailer';

import env from '../config/env.js';
import { assertSafeSingleMailbox } from './mail.validation.js';


const invalidMessage = (message) => {
  const error = new Error(message);
  error.code = 'INVALID_MESSAGE';
  error.permanent = true;
  return error;
};


const assertSafeMailMessage = ({ to, subject, text, html, messageId }) => {
  assertSafeSingleMailbox(to);
  if (
    typeof subject !== 'string' ||
    subject.length < 1 ||
    subject.length > 200 ||
    /[\r\n\u0000]/.test(subject)
  ) {
    throw invalidMessage('Invalid mail subject');
  }
  if (
    typeof text !== 'string' ||
    text.length < 1 ||
    text.length > 100_000
  ) {
    throw invalidMessage('Invalid plain-text mail body');
  }
  if (
    html !== undefined &&
    (typeof html !== 'string' || html.length > 200_000)
  ) {
    throw invalidMessage('Invalid HTML mail body');
  }
  if (
    messageId !== undefined &&
    !/^<[a-f0-9]{64}@[a-z0-9.-]{1,253}>$/i.test(messageId)
  ) {
    throw invalidMessage('Invalid deterministic message identifier');
  }
};

const getSmtpTransportOptions = () => ({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  requireTLS: env.SMTP_REQUIRE_TLS,
  dnsTimeout:
    env.SMTP_CONNECTION_TIMEOUT_MS,
  connectionTimeout:
    env.SMTP_CONNECTION_TIMEOUT_MS,
  greetingTimeout:
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
    async send({ to, subject, text, html, messageId }) {
      assertSafeMailMessage({ to, subject, text, html, messageId });
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(messageId ? { messageId } : {}),
      });
    },
  };
};

export { getSmtpTransportOptions, assertSafeMailMessage };
export default createSmtpAdapter;

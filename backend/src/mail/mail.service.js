import env from '../config/env.js';
import createSmtpAdapter from './smtp.adapter.js';

let testAdapter = null;
let smtpAdapter = null;

const setMailAdapterForTests = (adapter) => {
  if (env.NODE_ENV !== 'test') {
    throw new Error(
      'Mail adapter injection is only allowed in tests'
    );
  }

  testAdapter = adapter;
};

const resetMailAdapterForTests = () => {
  testAdapter = null;
};

const getMailAdapter = () => {
  if (testAdapter) {
    return testAdapter;
  }

  if (env.NODE_ENV === 'test') {
    throw new Error(
      'Tests must inject a fake mail adapter'
    );
  }

  smtpAdapter ||= createSmtpAdapter();
  return smtpAdapter;
};

const sendStaffInvitation = async ({
  email,
  token,
}) => {
  const link = new URL(
    '/staff/setup-password',
    env.FRONTEND_URL
  );
  link.searchParams.set('token', token);

  await getMailAdapter().send({
    to: email,
    subject: 'Set up your dental clinic staff account',
    text:
      `Use this one-time link to set your password: ${link.toString()}`,
  });
};

const sendPasswordReset = async ({
  email,
  token,
}) => {
  const link = new URL(
    '/staff/reset-password',
    env.FRONTEND_URL
  );
  link.searchParams.set('token', token);

  await getMailAdapter().send({
    to: email,
    subject: 'Reset your dental clinic staff password',
    text:
      `Use this one-time link to reset your password: ${link.toString()}`,
  });
};

export {
  setMailAdapterForTests,
  resetMailAdapterForTests,
  sendStaffInvitation,
  sendPasswordReset,
};

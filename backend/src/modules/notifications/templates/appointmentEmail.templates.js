import { PRIMARY_LOCALE, SUPPORTED_LOCALES } from '../../../i18n/localization.js';


const LOCALE_TAGS = Object.freeze({
  hy: 'hy-AM',
  ru: 'ru-RU',
  en: 'en-GB',
});


const singleLine = (value, maxLength = 500) => String(value ?? '')
  .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);


const escapeHtml = (value) => singleLine(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');


const normalizeLocale = (locale) => (
  SUPPORTED_LOCALES.includes(locale) ? locale : PRIMARY_LOCALE
);


const formatOccurrence = (occurrence, locale, timeZone) => {
  const formatter = new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  });
  return formatter.format(new Date(occurrence.startAt));
};


const serviceName = (occurrence, locale) => singleLine(
  occurrence.serviceNames?.[locale] ||
  occurrence.serviceNames?.[PRIMARY_LOCALE] ||
  occurrence.serviceName
);


const COPY = Object.freeze({
  hy: {
    greeting: (name) => `Բարև, ${name}:`,
    appointment_received: {
      subject: 'Ստացվել է ձեր այցի հայտը',
      intro: 'Մենք ստացել ենք ձեր այցի հայտը։ Այն դեռ հաստատված չէ։',
    },
    appointment_confirmed: {
      subject: 'Ձեր այցը հաստատված է',
      intro: 'Ձեր այցը հաստատված է։',
    },
    appointment_rescheduled: {
      subject: 'Ձեր այցը տեղափոխվել է',
      intro: 'Ձեր այցի ժամանակը փոխվել է։',
      previous: 'Նախկին ժամանակ',
      current: 'Նոր ժամանակ',
    },
    appointment_cancelled: {
      subject: 'Ձեր այցը չեղարկվել է',
      intro: 'Ձեր այցը չեղարկվել է։',
    },
    appointment_reminder: {
      subject: 'Ձեր առաջիկա այցի հիշեցում',
      intro: 'Հիշեցնում ենք ձեր առաջիկա հաստատված այցի մասին։',
    },
    code: 'Հաստատման կոդ',
    time: 'Ժամանակ',
    service: 'Ծառայություն',
    dentist: 'Ատամնաբույժ',
    clinic: 'Կլինիկա',
    phone: 'Հեռախոս',
    address: 'Հասցե',
  },
  ru: {
    greeting: (name) => `Здравствуйте, ${name}.`,
    appointment_received: {
      subject: 'Ваша заявка на приём получена',
      intro: 'Мы получили вашу заявку на приём. Она ещё не подтверждена.',
    },
    appointment_confirmed: {
      subject: 'Ваш приём подтверждён',
      intro: 'Ваш приём подтверждён.',
    },
    appointment_rescheduled: {
      subject: 'Ваш приём перенесён',
      intro: 'Время вашего приёма изменено.',
      previous: 'Прежнее время',
      current: 'Новое время',
    },
    appointment_cancelled: {
      subject: 'Ваш приём отменён',
      intro: 'Ваш приём отменён.',
    },
    appointment_reminder: {
      subject: 'Напоминание о предстоящем приёме',
      intro: 'Напоминаем о вашем предстоящем подтверждённом приёме.',
    },
    code: 'Код подтверждения',
    time: 'Время',
    service: 'Услуга',
    dentist: 'Стоматолог',
    clinic: 'Клиника',
    phone: 'Телефон',
    address: 'Адрес',
  },
  en: {
    greeting: (name) => `Hello ${name},`,
    appointment_received: {
      subject: 'Your appointment request was received',
      intro: 'We received your appointment request. It is not confirmed yet.',
    },
    appointment_confirmed: {
      subject: 'Your appointment is confirmed',
      intro: 'Your appointment is confirmed.',
    },
    appointment_rescheduled: {
      subject: 'Your appointment was rescheduled',
      intro: 'Your appointment time has changed.',
      previous: 'Previous time',
      current: 'New time',
    },
    appointment_cancelled: {
      subject: 'Your appointment was cancelled',
      intro: 'Your appointment was cancelled.',
    },
    appointment_reminder: {
      subject: 'Reminder for your upcoming appointment',
      intro: 'This is a reminder for your upcoming confirmed appointment.',
    },
    code: 'Confirmation code',
    time: 'Time',
    service: 'Service',
    dentist: 'Dentist',
    clinic: 'Clinic',
    phone: 'Phone',
    address: 'Address',
  },
});


const detailRows = ({
  copy,
  occurrence,
  locale,
  timeZone,
  confirmationCode,
  clinic,
}) => [
  [copy.code, singleLine(confirmationCode, 100)],
  [copy.time, formatOccurrence(occurrence, locale, timeZone)],
  [copy.service, serviceName(occurrence, locale)],
  [copy.dentist, singleLine(occurrence.dentistName, 301)],
  [copy.clinic, singleLine(clinic.name, 150)],
  ...(clinic.phone ? [[copy.phone, singleLine(clinic.phone, 30)]] : []),
  ...(clinic.address ? [[copy.address, singleLine(clinic.address, 300)]] : []),
];


const renderPatientEmail = ({
  eventType,
  locale: requestedLocale,
  patientName,
  confirmationCode,
  eventSnapshot,
  clinic,
  timeZone,
}) => {
  const locale = normalizeLocale(requestedLocale);
  const copy = COPY[locale];
  const eventCopy = copy[eventType];
  if (!eventCopy) {
    throw new Error('Unsupported patient notification template');
  }

  const after = eventSnapshot.after;
  const rows = detailRows({
    copy,
    occurrence: after,
    locale,
    timeZone,
    confirmationCode,
    clinic,
  });
  if (eventType === 'appointment_rescheduled') {
    rows.splice(1, 1,
      [eventCopy.previous, formatOccurrence(eventSnapshot.before, locale, timeZone)],
      [eventCopy.current, formatOccurrence(after, locale, timeZone)]
    );
  }

  const greeting = copy.greeting(singleLine(patientName, 120));
  const text = [
    greeting,
    '',
    eventCopy.intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(eventCopy.intro)}</p>`,
    '<dl>',
    ...rows.flatMap(([label, value]) => [
      `<dt><strong>${escapeHtml(label)}</strong></dt>`,
      `<dd>${escapeHtml(value)}</dd>`,
    ]),
    '</dl>',
  ].join('');

  return {
    locale,
    subject: eventCopy.subject,
    text,
    html,
  };
};


const renderClinicBookingEmail = ({
  patientName,
  patientPhone,
  confirmationCode,
  eventSnapshot,
  timeZone,
}) => {
  const occurrence = eventSnapshot.after;
  const rows = [
    ['Confirmation code', singleLine(confirmationCode, 100)],
    ['Patient', singleLine(patientName, 120)],
    ['Phone', singleLine(patientPhone, 30)],
    ['Time', formatOccurrence(occurrence, 'en', timeZone)],
    ['Service', serviceName(occurrence, 'hy')],
    ['Dentist', singleLine(occurrence.dentistName, 301)],
  ];
  return {
    locale: 'en',
    subject: 'New online booking',
    text: [
      'A new online booking was committed.',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join('\n'),
    html: [
      '<p>A new online booking was committed.</p>',
      '<dl>',
      ...rows.flatMap(([label, value]) => [
        `<dt><strong>${escapeHtml(label)}</strong></dt>`,
        `<dd>${escapeHtml(value)}</dd>`,
      ]),
      '</dl>',
    ].join(''),
  };
};


export {
  singleLine,
  escapeHtml,
  normalizeLocale,
  formatOccurrence,
  renderPatientEmail,
  renderClinicBookingEmail,
};

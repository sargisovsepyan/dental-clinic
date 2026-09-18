import { buildCatalog, id, dated, translations } from './arelis-catalog.mjs';
import { buildTeam, weeklySchedule, staffDisplay } from './arelis-team.mjs';

export const illustration = (name) => ({
  publicId: `tests/arelis/${name}`, secureUrl: `/illustrations/${name}.svg`,
  width: 1200, height: 800, format: 'svg', bytes: 1000,
});

export function buildArelisContent(accounts) {
  const { categories, services } = buildCatalog();
  const dentists = buildTeam(services);
  const clinicTranslations = translations(['clinicName', 'tagline', 'description', 'address'], [
    ['Arelis Dental', 'Ատամնաբուժություն Երևանի կենտրոնում', 'Arelis Dental-ը միավորում է ատամնաբուժության հիմնական ուղղությունները՝ կանխարգելումից և բուժումից մինչև էսթետիկ ստոմատոլոգիա, օրթոդոնտիա, պրոթեզավորում և իմպլանտացիա։ Բուժումից առաջ բժիշկը բացատրում է տարբերակները, փուլերը և մոտավոր արժեքը։ Ընտրեք ծառայությունը, ծանոթացեք բժիշկներին և ամրագրեք ձեզ հարմար այցի ժամանակը։', 'Կենտրոն, Երևան՝ Հանրապետության հրապարակի մոտ'],
    ['Arelis Dental', 'Стоматология в центре Еревана', 'Arelis Dental объединяет основные направления стоматологической помощи: от профилактики и лечения до эстетической стоматологии, ортодонтии, протезирования и имплантации. Перед началом лечения врач объясняет варианты, этапы и ориентировочную стоимость. Выберите услугу, познакомьтесь с врачами и найдите удобное время для визита.', 'Кентрон, Ереван — рядом с площадью Республики'],
    ['Arelis Dental', 'Dentistry in central Yerevan', 'Arelis Dental brings together preventive care, tooth treatment, aesthetic dentistry, orthodontics, prosthetics and implant care. Before treatment, your dentist explains the options, stages and estimated costs. Explore our services, meet the team and choose a convenient time for your visit.', 'Kentron, Yerevan — near Republic Square'],
  ]);
  const clinic = {
    _id: id(300), ...clinicTranslations.hy, translations: clinicTranslations,
    phone: '+37410000000', secondaryPhone: '', email: '',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Republic+Square%2C+Yerevan',
    socialLinks: { instagram: '', facebook: '', whatsapp: '', telegram: '' },
    weeklySchedule: weeklySchedule('isOpen'), timezone: 'Asia/Yerevan', scheduleRevision: 0,
    bookingSettings: { isBookingEnabled: true, slotIntervalMinutes: 30, minBookingNoticeMinutes: 120,
      maxBookingDaysAhead: 60, bufferMinutes: 0, allowSameDayBooking: false, requireEmail: false,
      autoConfirmAppointments: true, maxAppointmentsPerPhonePerDay: 3 }, ...dated,
  };
  const spaces = [
    ['waiting', ['Սպասասրահ', 'Зона ожидания', 'Waiting area']],
    ['treatment', ['Բուժման սենյակ', 'Кабинет лечения', 'Treatment room']],
    ['diagnostics', ['Ախտորոշման սենյակ', 'Кабинет диагностики', 'Diagnostic room']],
    ['consultation', ['Խորհրդատվության տարածք', 'Пространство для консультаций', 'Consultation space']],
  ];
  const gallery = spaces.map(([asset, names], index) => ({
    _id: id(400 + index), type: 'gallery', image: illustration(asset),
    altText: names[0], caption: names[0],
    translations: translations(['altText', 'caption'], names.map((name) => [name, name])),
    isActive: true, sortOrder: index, ...dated,
  }));
  const examples = [
    ['hygiene', 2, 0, ['Պրոֆեսիոնալ հիգիենա', 'Профессиональная гигиена', 'Professional hygiene']],
    ['restoration', 5, 0, ['Առջևի ատամի էսթետիկ վերականգնում', 'Эстетическая реставрация переднего зуба', 'Front-tooth aesthetic restoration']],
    ['whitening', 14, 0, ['Ատամների սպիտակեցում', 'Отбеливание', 'Tooth whitening']],
  ];
  const disclaimers = [
    'Սխեմատիկ նկարազարդում է, ոչ թե պացիենտի լուսանկար կամ բուժման արդյունք։ Անհատական բուժման տարբերակները քննարկվում են զննումից հետո։',
    'Схематичная иллюстрация, а не фотография пациента или результат лечения. Индивидуальные варианты обсуждают после осмотра.',
    'A schematic illustration, not a patient photograph or a treatment outcome. Individual options are discussed after examination.',
  ];
  const cases = examples.map(([asset, service, doctor, names], index) => ({
    _id: id(500 + index), title: names[0], description: disclaimers[0],
    translations: translations(['title', 'description'], names.map((name, locale) => [name, disclaimers[locale]])),
    service: services[service], dentist: dentists[doctor],
    beforeImage: illustration(`${asset}-before`), afterImage: illustration(`${asset}-after`),
    isFeatured: true, isActive: true, sortOrder: index, ...dated,
  }));
  const staff = Object.fromEntries(Object.entries(accounts).map(([key, value]) => [key, {
    ...value, name: staffDisplay[key].en, nameTranslations: staffDisplay[key],
    ...(key === 'dentist' ? { dentistProfile: dentists[3]._id } : {}),
  }]));
  return { categories, services, dentists, clinic, gallery, cases, staff };
}

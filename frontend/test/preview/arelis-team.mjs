import { id, dated, translations } from './arelis-catalog.mjs';

const doctors = [
  ['mariam-hakobyan', [0, 1, 2, 3, 4, 5, 7, 11, 12, 13, 14],
    ['Մարիամ', 'Հակոբյան', 'Վերականգնողական և էսթետիկ ստոմատոլոգիա', 'Մարիամը զբաղվում է ատամների բուժմամբ և էսթետիկ վերականգնմամբ։ Խորհրդատվության ընթացքում բացատրում է վերականգնման տարբերակները և օգնում հասկանալ հաջորդ քայլերը։'],
    ['Мариам', 'Акопян', 'Лечение и эстетическая реставрация зубов', 'Мариам занимается лечением зубов и эстетическими реставрациями. На консультации объясняет варианты восстановления и помогает разобраться в следующих этапах.'],
    ['Mariam', 'Hakobyan', 'Restorative and aesthetic dentistry', 'Mariam focuses on tooth treatment and aesthetic restorations. During consultations, she explains restoration options and helps patients understand the next steps.']],
  ['aram-sargsyan', [0, 1, 8, 9, 10],
    ['Արամ', 'Սարգսյան', 'Ատամնաբուժական վիրաբուժություն և իմպլանտացիա', 'Արամը զբաղվում է ատամնաբուժական վիրաբուժությամբ և իմպլանտացիայի պլանավորմամբ։ Նախապես քննարկում է միջամտության ծավալը, հնարավոր այլընտրանքները և հետագա խնամքը։'],
    ['Арам', 'Саргсян', 'Хирургия и имплантация', 'Арам занимается стоматологической хирургией и планированием имплантации. Заранее обсуждает объём вмешательства, возможные альтернативы и дальнейший уход.'],
    ['Aram', 'Sargsyan', 'Oral surgery and implant dentistry', 'Aram focuses on oral surgery and implant planning. He discusses procedure scope, possible alternatives and aftercare before treatment.']],
  ['lilit-grigoryan', [0, 15, 16],
    ['Լիլիթ', 'Գրիգորյան', 'Օրթոդոնտիա', 'Լիլիթը գնահատում է ատամների դիրքն ու կծվածքը և քննարկում օրթոդոնտիկ բուժման տարբերակները։ Բուժման պլանում պարզ ներկայացնում է փուլերը և վերահսկիչ այցերի դերը։'],
    ['Лилит', 'Григорян', 'Ортодонтия', 'Лилит оценивает положение зубов и прикус и обсуждает варианты ортодонтического лечения. В плане лечения понятно объясняет этапы и роль контрольных визитов.'],
    ['Lilit', 'Grigoryan', 'Orthodontics', 'Lilit assesses tooth alignment and bite and discusses orthodontic options. Her treatment plans explain the stages of care and the role of review visits.']],
  ['davit-petrosyan', [0, 1, 2, 3, 4, 5, 6, 7, 11, 12],
    ['Դավիթ', 'Պետրոսյան', 'Արմատախողովակների բուժում և ատամների վերականգնում', 'Դավիթը զբաղվում է արմատախողովակների բուժմամբ և ատամների վերականգնմամբ։ Բացատրում է հետազոտության արդյունքները, բուժման անհրաժեշտությունը և հնարավոր այցերի հաջորդականությունը։'],
    ['Давид', 'Петросян', 'Эндодонтия и восстановление зубов', 'Давид занимается лечением корневых каналов и восстановлением зубов. Объясняет результаты обследования, необходимость лечения и возможную последовательность визитов.'],
    ['Davit', 'Petrosyan', 'Endodontics and restorative dentistry', 'Davit focuses on root canal treatment and tooth restoration. He explains examination findings, treatment needs and the likely sequence of appointments.']],
  ['nare-mkrtchyan', [0, 1, 3, 17, 18],
    ['Նարե', 'Մկրտչյան', 'Մանկական ստոմատոլոգիա', 'Նարեն ընդունում է երեխաներին և ծնողներին՝ ուշադրություն դարձնելով այցի հանգիստ ընթացքին։ Երեխային հասկանալի ձևով ներկայացնում է խնամքն ու բուժման քայլերը։'],
    ['Наре', 'Мкртчян', 'Детская стоматология', 'Наре принимает детей и родителей, уделяя внимание спокойному ходу визита. Объясняет уход и лечение понятными ребёнку словами.'],
    ['Nare', 'Mkrtchyan', 'Pediatric dentistry', 'Nare welcomes children and their parents with attention to a calm visit. She explains dental care and treatment steps in child-friendly language.']],
];

export const weeklySchedule = (flag) => Array.from({ length: 7 }, (_, index) => ({
  dayOfWeek: index + 1, [flag]: index < 6,
  shifts: index < 6 ? [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }] : [],
}));

export function buildTeam(services) {
  return doctors.map(([slug, assigned, ...rows], index) => {
    const localized = translations(['firstName', 'lastName', 'title', 'bio'], rows);
    for (const entry of Object.values(localized)) entry.specializations = [entry.title];
    return {
      _id: id(200 + index), slug, ...localized.hy, translations: localized,
      photo: null, photoUrl: '', experienceYears: 0, languages: ['hy', 'ru', 'en'],
      services: assigned.map((service) => services[service]), weeklySchedule: weeklySchedule('isWorking'),
      scheduleRevision: 0, isFeatured: true, bookingEnabled: true, isActive: true, sortOrder: index, ...dated,
    };
  });
}

export const staffDisplay = {
  admin: { hy: 'Աննա Մարտիրոսյան', ru: 'Анна Мартиросян', en: 'Anna Martirosyan' },
  receptionist: { hy: 'Լուսինե Գրիգորյան', ru: 'Лусине Григорян', en: 'Lusine Grigoryan' },
  dentist: { hy: 'Դավիթ Պետրոսյան', ru: 'Давид Петросян', en: 'Davit Petrosyan' },
  secondAdmin: { hy: 'Սոնա Ավետիսյան', ru: 'Сона Аветисян', en: 'Sona Avetisyan' },
};

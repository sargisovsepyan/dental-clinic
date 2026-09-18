// Fictional, intentionally authored HY/RU/EN content for manual product review.
// This module is never imported by application or production seed code.
export const locales = ['hy', 'ru', 'en'];
export const id = (number) => `66a${number.toString(16).padStart(21, '0')}`;
export const translations = (fields, rows) => Object.fromEntries(locales.map((locale, index) => [locale,
  Object.fromEntries(fields.map((field, column) => [field, rows[index][column]])),
]));
const timestamp = '2026-09-01T08:00:00.000Z';
export const dated = { createdAt: timestamp, updatedAt: timestamp };

const sectionNames = [
  ['hygiene-prevention', 'Հիգիենա և կանխարգելում', 'Гигиена и профилактика', 'Hygiene and prevention'],
  ['tooth-restoration', 'Ատամների բուժում և վերականգնում', 'Лечение и реставрация зубов', 'Tooth treatment and restoration'],
  ['root-canals', 'Արմատախողովակների բուժում', 'Лечение корневых каналов', 'Root canal treatment'],
  ['surgery-implants', 'Վիրաբուժություն և իմպլանտացիա', 'Хирургия и имплантация', 'Surgery and implants'],
  ['prosthetics', 'Պրոթեզավորում', 'Протезирование', 'Prosthetic dentistry'],
  ['aesthetic-dentistry', 'Էսթետիկ ստոմատոլոգիա', 'Эстетическая стоматология', 'Aesthetic dentistry'],
  ['orthodontics', 'Օրթոդոնտիա', 'Ортодонтия', 'Orthodontics'],
  ['gum-care', 'Լնդերի բուժում', 'Лечение дёсен', 'Gum care'],
  ['pediatric-dentistry', 'Մանկական ստոմատոլոգիա', 'Детская стоматология', 'Pediatric dentistry'],
];

// slug, section index, starting AMD price, appointment minutes, localized name/body.
const serviceCopy = [
  ['consultation', 0, 0, 30,
    ['Խորհրդատվություն և բուժման պլան', 'Առաջին այցի ընթացքում բժիշկը քննարկում է ձեր հարցերը և զննում բերանի խոռոչը։ Միասին կքննարկեք հնարավոր տարբերակները, բուժման փուլերը և մոտավոր արժեքը։'],
    ['Консультация и план лечения', 'На первой встрече врач выслушивает ваши вопросы и проводит осмотр. Вместе вы обсуждаете варианты, этапы лечения и ориентировочную стоимость; консультация не включает дополнительные исследования.'],
    ['Consultation and treatment plan', 'Your first visit starts with your questions and an oral examination. The dentist explains possible options, treatment stages and estimated costs; additional investigations are priced separately.']],
  ['tooth-xray', 0, 3000, 15,
    ['Ատամի նպատակային ռենտգեն նկար', 'Նպատակային նկարը օգնում է բժշկին գնահատել առանձին ատամը և հարակից հյուսվածքները։ Հետազոտության անհրաժեշտությունը որոշվում է զննումից հետո, իսկ արդյունքը բացատրվում է այցի ընթացքում։'],
    ['Прицельный снимок зуба', 'Прицельный снимок помогает врачу оценить отдельный зуб и окружающие ткани. Необходимость исследования определяют после осмотра, а результат объясняют во время визита.'],
    ['Targeted tooth X-ray', 'A targeted image helps the dentist assess an individual tooth and nearby tissue. The need for imaging is discussed after examination, and the dentist explains the findings during your visit.']],
  ['professional-hygiene', 0, 20000, 60,
    ['Բերանի խոռոչի պրոֆեսիոնալ հիգիենա', 'Պրոֆեսիոնալ հիգիենայի ընթացքում հեռացվում են փափուկ փառը, ատամնաքարը և մակերեսային գունավորումը։ Զննումից հետո բժիշկը ընտրում է համապատասխան ծավալը և քննարկում տնային խնամքի խորհուրդները։'],
    ['Профессиональная гигиена полости рта', 'Профессиональная гигиена помогает удалить мягкий налёт, зубной камень и поверхностную пигментацию. После осмотра врач подбирает объём процедуры и объясняет рекомендации по домашнему уходу.'],
    ['Professional oral hygiene', 'Professional hygiene removes soft plaque, tartar and surface staining. After examining your teeth and gums, the dentist discusses the appropriate procedure and practical home-care advice.']],
  ['fluoride-care', 0, 10000, 30,
    ['Ֆտորացում և զգայունության կանխարգելում', 'Բժիշկը գնահատում է էմալի վիճակը և ատամների զգայունության հնարավոր պատճառները։ Անհրաժեշտության դեպքում ընտրվում է ֆտոր պարունակող միջոց և քննարկվում անհատական կանխարգելիչ խնամքը։'],
    ['Фторирование и профилактика чувствительности', 'Врач оценивает состояние эмали и возможные причины чувствительности зубов. При необходимости подбирает фторсодержащее средство и обсуждает индивидуальный профилактический уход.'],
    ['Fluoride and sensitivity care', 'The dentist assesses enamel condition and possible reasons for tooth sensitivity. Where appropriate, a fluoride treatment and an individual prevention routine are discussed.']],
  ['caries-filling', 1, 20000, 60,
    ['Կարիեսի բուժում և պլոմբավորում', 'Զննումից հետո բժիշկը քննարկում է վնասված հատվածի վերականգնման տարբերակները։ Այցը ներառում է ատամի պատրաստում և լցոնանյութով վերականգնում՝ ըստ գնահատված ծավալի։'],
    ['Лечение кариеса и пломба', 'После осмотра врач обсуждает восстановление повреждённой части зуба. Приём включает подготовку зуба и восстановление пломбировочным материалом в согласованном объёме.'],
    ['Caries treatment and filling', 'After examination, the dentist explains how the damaged area could be restored. The appointment includes tooth preparation and a filling within the agreed treatment scope.']],
  ['aesthetic-restoration', 1, 35000, 90,
    ['Ատամի էսթետիկ վերականգնում', 'Վերականգնումը նախատեսվում է՝ հաշվի առնելով ատամի ձևը, գույնը և պահպանված հյուսվածքները։ Բժիշկը քննարկում է նյութի ընտրությունը, այցի փուլերը և խնամքի առանձնահատկությունները։'],
    ['Эстетическая реставрация зуба', 'Реставрацию планируют с учётом формы, оттенка и сохранённых тканей зуба. Врач обсуждает выбор материала, этапы приёма и особенности дальнейшего ухода.'],
    ['Aesthetic tooth restoration', 'Restoration is planned around tooth shape, shade and remaining tissue. The dentist discusses the material, appointment stages and care considerations before proceeding.']],
  ['root-canal-treatment', 2, 30000, 90,
    ['Արմատախողովակների բուժում', 'Բժիշկը գնահատում է ատամի և արմատախողովակների վիճակը ու բացատրում բուժման անհրաժեշտությունը։ Բուժումը կարող է պահանջել մի քանի այց. խողովակների քանակը և վերջնական վերականգնումը քննարկվում են առանձին։'],
    ['Лечение корневых каналов', 'Врач оценивает состояние зуба и корневых каналов и объясняет показания к лечению. Может потребоваться несколько визитов; число каналов и окончательное восстановление обсуждают отдельно.'],
    ['Root canal treatment', 'The dentist assesses the tooth and root canals and explains why treatment may be needed. Several visits may be required; the number of canals and final restoration are discussed separately.']],
  ['gum-treatment', 7, 25000, 60,
    ['Լնդերի բուժում', 'Լնդերի խնամքը սկսվում է զննմամբ և բորբոքման հնարավոր պատճառների քննարկմամբ։ Բժիշկը կազմում է փուլային խնամքի պլան և անհրաժեշտության դեպքում նշանակում վերահսկիչ այցեր։'],
    ['Лечение дёсен', 'Уход за дёснами начинается с осмотра и обсуждения возможных причин воспаления. Врач составляет поэтапный план ухода и при необходимости назначает контрольные визиты.'],
    ['Gum treatment', 'Gum care starts with examination and a discussion of possible causes of inflammation. The dentist proposes a staged care plan and follow-up visits where appropriate.']],
  ['simple-extraction', 3, 15000, 45,
    ['Ատամի պարզ հեռացում', 'Ատամի հեռացման որոշումը կայացվում է զննումից և հնարավոր այլընտրանքների քննարկումից հետո։ Բժիշկը բացատրում է միջամտության ընթացքը, անզգայացման տարբերակները և հետայցային խնամքը։'],
    ['Простое удаление зуба', 'Решение об удалении принимают после осмотра и обсуждения возможных альтернатив. Врач объясняет ход вмешательства, варианты обезболивания и уход после визита.'],
    ['Simple tooth extraction', 'Extraction is considered after examination and a discussion of alternatives. The dentist explains the procedure, anaesthesia options and aftercare before treatment.']],
  ['wisdom-extraction', 3, 40000, 60,
    ['Իմաստության ատամի հեռացում', 'Բժիշկը գնահատում է իմաստության ատամի դիրքը և հեռացման բարդությունը։ Միջամտության ծավալը, անհրաժեշտ հետազոտությունները և հետագա խնամքը քննարկվում են նախապես։'],
    ['Удаление зуба мудрости', 'Врач оценивает положение зуба мудрости и сложность удаления. Объём вмешательства, необходимые исследования и последующий уход обсуждают заранее.'],
    ['Wisdom tooth extraction', 'The dentist assesses wisdom tooth position and extraction complexity. The procedure scope, any required investigations and aftercare are discussed in advance.']],
  ['dental-implant', 3, 180000, 60,
    ['Ատամնային իմպլանտի տեղադրում', 'Իմպլանտացիան սկսվում է անհատական պլանավորումից և անհրաժեշտ հետազոտություններից։ Նշված մեկնարկային արժեքը վերաբերում է տեղադրմանը. հետագա պրոթեզավորումն ու հնարավոր լրացուցիչ փուլերը քննարկվում են առանձին։'],
    ['Установка импланта', 'Имплантация начинается с индивидуального планирования и необходимых исследований. Начальная цена относится к установке; протезирование и возможные дополнительные этапы обсуждают отдельно.'],
    ['Dental implant placement', 'Implant care starts with individual planning and the required investigations. The starting price covers placement; prosthetic work and any additional stages are discussed separately.']],
  ['metal-ceramic-crown', 4, 50000, 60,
    ['Մետաղակերամիկական պսակ', 'Մետաղակերամիկական պսակը քննարկվում է որպես վնասված ատամի վերականգնման տարբերակ։ Բժիշկը բացատրում է պատրաստման, չափագրման և տեղադրման փուլերը. սովորաբար անհրաժեշտ է մեկից ավելի այց։'],
    ['Металлокерамическая коронка', 'Металлокерамическую коронку обсуждают как вариант восстановления повреждённого зуба. Врач объясняет подготовку, снятие оттисков и установку; обычно требуется больше одного визита.'],
    ['Metal-ceramic crown', 'A metal-ceramic crown may be considered for a damaged tooth. The dentist explains preparation, impressions and fitting; the process usually involves more than one visit.']],
  ['zirconia-crown', 4, 85000, 90,
    ['Ցիրկոնիումե պսակ', 'Ցիրկոնիումե պսակի ընտրությունը քննարկվում է՝ հաշվի առնելով ատամի դիրքն ու վերականգնման պահանջները։ Այցերի ընթացքում նախատեսվում են պատրաստում, չափագրում և պսակի համապատասխանության ստուգում։'],
    ['Циркониевая коронка', 'Выбор циркониевой коронки обсуждают с учётом положения зуба и задач восстановления. Визиты включают подготовку, измерения и проверку соответствия коронки.'],
    ['Zirconia crown', 'A zirconia crown is discussed in relation to tooth position and restoration needs. Appointments cover preparation, measurements and checking the fit of the crown.']],
  ['ceramic-veneer', 5, 110000, 90,
    ['Կերամիկական վինիր', 'Վինիրի հնարավորությունը գնահատվում է՝ հաշվի առնելով էմալի վիճակը և ձեր ակնկալիքները։ Բժիշկը բացատրում է սահմանափակումները, պատրաստման ծավալը և մի քանի այցով իրականացվող փուլերը։'],
    ['Керамический винир', 'Возможность установки винира оценивают с учётом состояния эмали и ваших ожиданий. Врач объясняет ограничения, объём подготовки и этапы, которые занимают несколько визитов.'],
    ['Ceramic veneer', 'Veneer suitability is assessed against enamel condition and your expectations. The dentist explains limitations, preparation requirements and the stages across several appointments.']],
  ['professional-whitening', 5, 90000, 90,
    ['Ատամների պրոֆեսիոնալ սպիտակեցում', 'Սպիտակեցումից առաջ բժիշկը զննում է ատամները և քննարկում ցանկալի փոփոխությունն ու հնարավոր զգայունությունը։ Ընտրվում է համապատասխան եղանակը, իսկ արդյունքը կախված է ատամների անհատական վիճակից։'],
    ['Профессиональное отбеливание', 'Перед отбеливанием врач осматривает зубы и обсуждает желаемое изменение и возможную чувствительность. Подбирают подходящий метод; результат зависит от индивидуального состояния зубов.'],
    ['Professional whitening', 'Before whitening, the dentist examines your teeth and discusses your goals and possible sensitivity. A suitable method is selected; outcomes depend on individual tooth condition.']],
  ['metal-braces', 6, 220000, 60,
    ['Մետաղական բրեկետներ', 'Օրթոդոնտիկ խորհրդատվության ընթացքում գնահատվում է ատամների դիրքն ու կծվածքը։ Մեկնարկային արժեքը նշված է մեկ ծնոտի համար. բուժման ընթացքը, վերահսկիչ այցերն ու ընդհանուր ծախսերը քննարկվում են պլանավորման ժամանակ։'],
    ['Металлические брекеты', 'На ортодонтической консультации оценивают положение зубов и прикус. Начальная цена указана за одну челюсть; ход лечения, контрольные визиты и общую стоимость обсуждают при планировании.'],
    ['Metal braces', 'An orthodontic consultation assesses tooth alignment and bite. The starting price is per jaw; treatment stages, review appointments and overall costs are discussed during planning.']],
  ['aligners', 6, 900000, 60,
    ['Էլայներներ', 'Էլայներների կիրառման հնարավորությունը որոշվում է օրթոդոնտիկ զննումից հետո։ Մեկնարկային արժեքը վերաբերում է բուժման կուրսին. ծավալը, կրելու կարգը և վերահսկիչ այցերը համաձայնեցվում են անհատական պլանով։'],
    ['Элайнеры', 'Возможность лечения элайнерами определяют после ортодонтического осмотра. Начальная цена относится к курсу; объём, режим ношения и контрольные визиты согласуют в индивидуальном плане.'],
    ['Aligners', 'Aligner suitability is determined after an orthodontic assessment. The starting price is for a course; its scope, wear routine and review visits are agreed in an individual plan.']],
  ['child-caries', 8, 15000, 45,
    ['Կարիեսի բուժում երեխաների մոտ', 'Մանկական այցի ընթացքում բժիշկը երեխային հասկանալի ձևով բացատրում է զննումն ու բուժման քայլերը։ Ծնողի հետ քննարկվում են վնասված ատամի վերականգնման տարբերակները և տնային խնամքը։'],
    ['Лечение кариеса у детей', 'На детском приёме врач объясняет осмотр и лечение понятными ребёнку словами. С родителем обсуждают варианты восстановления повреждённого зуба и домашний уход.'],
    ['Caries treatment for children', 'During a child’s visit, the dentist explains examination and treatment in age-appropriate language. Restoration options and home care are discussed with the parent.']],
  ['fissure-sealing', 8, 10000, 30,
    ['Ֆիսուրների հերմետիկացում', 'Բժիշկը գնահատում է ծամող ատամների ակոսները և կանխարգելիչ ծածկույթի անհրաժեշտությունը։ Հերմետիկացման հնարավորությունը, կիրառման քայլերը և հետագա ստուգումները քննարկվում են ծնողի հետ։'],
    ['Герметизация фиссур', 'Врач оценивает бороздки жевательных зубов и необходимость защитного покрытия. Возможность герметизации, этапы нанесения и последующие проверки обсуждают с родителем.'],
    ['Fissure sealing', 'The dentist assesses the grooves of chewing teeth and whether a protective sealant is appropriate. Suitability, application stages and future checks are discussed with the parent.']],
];

export function buildCatalog() {
  const categories = sectionNames.map(([slug, ...names], index) => ({
    _id: id(index + 1), slug, name: names[0], description: '',
    translations: translations(['name', 'description'], names.map((name) => [name, name])),
    imageUrl: '', isActive: true, sortOrder: index, ...dated,
  }));
  const services = serviceCopy.map(([slug, section, price, duration, ...rows], index) => {
    const localized = translations(['name', 'shortDescription', 'description'], rows.map(([name, body]) => [name, body.split('։')[0].split('. ')[0].replace(/\.$/, '') + (body.includes('։') ? '։' : '.'), body]));
    return {
      _id: id(100 + index), slug, category: categories[section],
      ...localized.hy, translations: localized,
      priceType: price === 0 ? 'fixed' : 'from', priceFrom: price, priceTo: null, currency: 'AMD', durationMinutes: duration,
      imageUrl: '', image: null, isFeatured: [0, 2, 4, 14].includes(index), bookingEnabled: true, isActive: true, sortOrder: index, ...dated,
    };
  });
  return { categories, services };
}

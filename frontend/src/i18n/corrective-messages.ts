import type { Locale } from './locales';
const copy = {
  "en": {
    "invalidDate": "Choose a valid date within the available booking period.",
    "invalidName": "Use at least two letters; spaces, hyphens and apostrophes are allowed.",
    "invalidPhone": "Enter digits, an optional leading +, and standard phone spacing, parentheses or hyphens.",
    "invalidEmail": "Enter a valid email address.",
    "invalidComment": "Use no more than 1000 characters.",
    "break": "Break",
    "bookingUnavailable": "Not available for booking",
    "language": "Interface language",
    "current": "Current staff",
    "all": "All staff",
    "resend": "Resend invitation",
    "cancelInvitation": "Cancel invitation",
    "resendHelp": "Send a new one-time setup link. The previous link will stop working. Their name and role will not change.",
    "visitStatus": "Visit status",
    "applyStatus": "Apply status",
    "chooseStatus": "Choose the next status"
  },
  "ru": {
    "invalidDate": "Выберите корректную дату в доступном периоде записи.",
    "invalidName": "Введите не менее двух букв. Допустимы пробелы, дефис и апостроф.",
    "invalidPhone": "Введите цифры, необязательный + в начале и используйте стандартное оформление номера с пробелами, скобками или дефисами.",
    "invalidEmail": "Введите корректный адрес электронной почты.",
    "invalidComment": "Не более 1000 символов.",
    "break": "Перерыв",
    "bookingUnavailable": "Недоступно для записи",
    "language": "Язык интерфейса",
    "current": "Текущие сотрудники",
    "all": "Все сотрудники",
    "resend": "Повторно отправить приглашение",
    "cancelInvitation": "Отменить приглашение",
    "resendHelp": "Отправить новую одноразовую ссылку настройки. Предыдущая ссылка перестанет работать. Имя и роль не изменятся.",
    "visitStatus": "Статус визита",
    "applyStatus": "Применить статус",
    "chooseStatus": "Выберите следующий статус"
  },
  "hy": {
    "invalidDate": "Ընտրեք վավեր օր՝ ամրագրման հասանելի ժամանակահատվածում։",
    "invalidName": "Մուտքագրեք առնվազն երկու տառ։ Թույլատրվում են բացատը, գծիկը և ապաթարցը։",
    "invalidPhone": "Մուտքագրեք թվեր, սկզբի ոչ պարտադիր + նշան և համարի սովորական ձևաչափ՝ բացատներով, փակագծերով կամ գծիկներով։",
    "invalidEmail": "Մուտքագրեք վավեր էլեկտրոնային հասցե։",
    "invalidComment": "Առավելագույնը 1000 նիշ։",
    "break": "Ընդմիջում",
    "bookingUnavailable": "Ամրագրման համար անհասանելի է",
    "language": "Միջերեսի լեզու",
    "current": "Ընթացիկ աշխատակիցներ",
    "all": "Բոլոր աշխատակիցները",
    "resend": "Կրկին ուղարկել հրավերը",
    "cancelInvitation": "Չեղարկել հրավերը",
    "resendHelp": "Ուղարկել կարգավորման նոր մեկանգամյա հղակ։ Նախորդ հղակը կդադարի գործել։ Անունն ու դերը չեն փոխվի։",
    "visitStatus": "Այցի կարգավիճակ",
    "applyStatus": "Կիրառել կարգավիճակը",
    "chooseStatus": "Ընտրեք հաջորդ կարգավիճակը"
  }
} as const;
export const correctiveMessages: Record<Locale, Record<keyof typeof copy.en, string>> = copy;

import type { Locale } from "@/i18n/locales";

const en = {
  teamNav: "Team", auditNav: "Audit history", teamTitle: "Staff governance",
  teamIntro: "Manage clinic staff access. The server protects the last active administrator and confirms every change.",
  auditTitle: "Audit history", auditIntro: "Read who changed what and when. Security hashes and patient information are not part of this workspace.",
  staffName: "Staff name", invite: "Invite staff", inviteTitle: "Invite a staff member", inviteHelp: "A one-time setup link is sent by email. No link or token is shown here. Inviting a pending email again does not change its existing name or role.",
  invited: "Invitation confirmed. The staff member must complete the emailed setup flow.",
  inviteConflict: "An established staff account already uses this email. Review the refreshed team list.",
  inviteUncertain: "Invitation outcome is uncertain: an account or email may already have been created. The team list is being refreshed. Check it and contact the employee before explicitly inviting again.",
  active: "Active", inactive: "Deactivated", pending: "Invitation pending", setup: "Account setup", setupComplete: "Setup complete", setupPending: "Setup incomplete", allSetup: "All setup states", allRoles: "All roles",
  loadingTeam: "Loading staff…", emptyTeam: "No staff match these filters.", loadError: "This administration data could not be loaded. Refresh to try a new read.",
  forbidden: "The server refused this operation. Your signed-in session is preserved if still authorized.",
  mutationError: "No change was confirmed. Review refreshed server state before acting again.",
  mutationUncertain: "The change may have committed, but its outcome is uncertain. Server state is being refreshed; do not repeat the action until you have reviewed it.",
  changed: "The server confirmed the change. The authoritative team state is being refreshed.",
  governanceConflict: "The server refused the change to protect self-access or the last active administrator. The latest team state is being refreshed; review it before acting again.",
  pendingConflict: "Account setup must be completed before reactivation. Review the latest staff state.",
  details: "Staff detail", changeRole: "Change role", deactivate: "Deactivate staff", reactivate: "Reactivate staff", revoke: "Revoke all sessions",
  roleHelp: "This exact staff member's role will change and all their sessions will be invalidated. The server decides whether the change is allowed.",
  deactivateHelp: "Disables this staff member, invalidates authorization and all sessions, and consumes outstanding one-time authentication links.",
  reactivateHelp: "Re-enables this established account. Setup must already be complete; the employee must authenticate again.",
  revokeHelp: "Revokes every session for this staff member. They must authenticate again. No per-device session data is available.",
  selfRevokeHelp: "This includes your current session. On success you will be signed out immediately and returned to login.",
  selfAction: "You cannot change your own role or deactivate yourself.", confirm: "Confirm change", you: "You", deactivatedAt: "Deactivated at", staffId: "Staff ID",
  action: "Action code", actor: "Actor", actorId: "Actor ID (24 hex characters)", entity: "Entity", entityType: "Entity type", entityId: "Entity ID",
  fromUtc: "From (UTC)", toUtc: "To (UTC)", utcHelp: "Range fields and timestamps use UTC, not your browser timezone. Both boundaries are inclusive.",
  invalidRange: "Enter valid UTC instants with From not later than To, and a valid actor ID if supplied.",
  loadingAudit: "Loading audit history…", emptyAudit: "No audit events match these filters.", auditDetail: "Audit event detail", unknownActor: "System or unavailable staff", metadata: "Sanitized metadata", noMetadata: "No metadata", methodPath: "HTTP method / path", rows: "Rows per page", total: "Total records", auditReadOnly: "Read only", none: "None",
} as const;
export type StaffGovernanceMessages = { [K in keyof typeof en]: string };
const ru: StaffGovernanceMessages = {
  teamNav: "Команда", auditNav: "История аудита", teamTitle: "Управление сотрудниками",
  teamIntro: "Управляйте доступом сотрудников клиники. Сервер защищает последнего активного администратора и подтверждает каждое изменение.",
  auditTitle: "История аудита", auditIntro: "Просматривайте, кто, что и когда изменил. Хеши безопасности и данные пациентов здесь не показываются.",
  staffName: "Имя сотрудника", invite: "Пригласить сотрудника", inviteTitle: "Приглашение сотрудника", inviteHelp: "Одноразовая ссылка настройки отправляется по почте. Ссылка и токен здесь не показываются. Повторное приглашение ожидающего аккаунта не меняет его имя или роль.",
  invited: "Приглашение подтверждено. Сотрудник должен завершить настройку по ссылке из письма.",
  inviteConflict: "Эту почту уже использует настроенный аккаунт. Проверьте обновленный список команды.",
  inviteUncertain: "Результат приглашения неизвестен: аккаунт или письмо уже могли быть созданы. Список обновляется. Проверьте его и свяжитесь с сотрудником перед новым явным приглашением.",
  active: "Активен", inactive: "Деактивирован", pending: "Ожидает приглашения", setup: "Настройка аккаунта", setupComplete: "Настройка завершена", setupPending: "Настройка не завершена", allSetup: "Все состояния настройки", allRoles: "Все роли",
  loadingTeam: "Загрузка сотрудников…", emptyTeam: "Нет сотрудников с такими фильтрами.", loadError: "Не удалось загрузить данные управления. Обновите для нового запроса.",
  forbidden: "Сервер отказал в операции. Действующая авторизованная сессия сохраняется.",
  mutationError: "Изменение не подтверждено. Проверьте обновленное состояние сервера перед новым действием.",
  mutationUncertain: "Изменение могло сохраниться, но результат неизвестен. Состояние сервера обновляется; не повторяйте действие до проверки.",
  changed: "Сервер подтвердил изменение. Состояние команды обновляется.",
  governanceConflict: "Сервер отказал для защиты собственного доступа или последнего активного администратора. Список обновляется; проверьте его перед новым действием.",
  pendingConflict: "Перед активацией требуется завершить настройку. Проверьте актуальное состояние сотрудника.",
  details: "Сведения о сотруднике", changeRole: "Изменить роль", deactivate: "Деактивировать сотрудника", reactivate: "Активировать сотрудника", revoke: "Отозвать все сессии",
  roleHelp: "Роль именно этого сотрудника изменится, все его сессии станут недействительными. Допустимость определяет сервер.",
  deactivateHelp: "Отключает сотрудника, отзывает авторизацию и все сессии, погашает неиспользованные одноразовые ссылки входа.",
  reactivateHelp: "Включает настроенный аккаунт. Настройка должна быть завершена; потребуется новый вход.",
  revokeHelp: "Отзывает каждую сессию сотрудника. Потребуется новый вход. Данные отдельных устройств недоступны.",
  selfRevokeHelp: "Включая вашу текущую сессию. При успехе вы немедленно выйдете и вернетесь ко входу.",
  selfAction: "Нельзя менять собственную роль или деактивировать себя.", confirm: "Подтвердить изменение", you: "Вы", deactivatedAt: "Дата деактивации", staffId: "ID сотрудника",
  action: "Код действия", actor: "Исполнитель", actorId: "ID исполнителя (24 шестнадцатеричных символа)", entity: "Объект", entityType: "Тип объекта", entityId: "ID объекта",
  fromUtc: "С (UTC)", toUtc: "По (UTC)", utcHelp: "Диапазон и время показываются в UTC, не в часовом поясе браузера. Обе границы включены.",
  invalidRange: "Введите корректное время UTC: начало не позже конца; ID исполнителя должен быть корректным.",
  loadingAudit: "Загрузка аудита…", emptyAudit: "Нет событий с такими фильтрами.", auditDetail: "Сведения о событии", unknownActor: "Система или недоступный сотрудник", metadata: "Очищенные метаданные", noMetadata: "Нет метаданных", methodPath: "Метод HTTP / путь", rows: "Строк на странице", total: "Всего записей", auditReadOnly: "Только чтение", none: "Нет",
};
const hy: StaffGovernanceMessages = {
  teamNav: "Թիմ", auditNav: "Աուդիտի պատմություն", teamTitle: "Աշխատակիցների կառավարում",
  teamIntro: "Կառավարեք կլինիկայի աշխատակիցների հասանելիությունը։ Սերվերը պաշտպանում է վերջին ակտիվ ադմինիստրատորին և հաստատում յուրաքանչյուր փոփոխություն։",
  auditTitle: "Աուդիտի պատմություն", auditIntro: "Դիտեք՝ ով, ինչ և երբ է փոխել։ Անվտանգության հեշերն ու պացիենտների տվյալներն այստեղ չեն ցուցադրվում։",
  staffName: "Աշխատակցի անուն", invite: "Հրավիրել աշխատակցի", inviteTitle: "Աշխատակցի հրավեր", inviteHelp: "Կարգավորման մեկանգամյա հղակն ուղարկվում է էլ․ փոստով։ Հղակն ու թոքենն այստեղ չեն ցուցադրվում։ Սպասող հաշվի կրկնակի հրավերը չի փոխում դրա անունը կամ դերը։",
  invited: "Հրավերը հաստատված է։ Աշխատակիցը պետք է ավարտի կարգավորումը նամակի հղակով։",
  inviteConflict: "Այս էլ․ փոստն արդեն օգտագործվում է կարգավորված հաշվի կողմից։ Ստուգեք թարմացված թիմի ցանկը։",
  inviteUncertain: "Հրավերի արդյունքն անորոշ է․ հաշիվը կամ նամակն արդեն կարող էին ստեղծվել։ Ցանկը թարմացվում է։ Ստուգեք այն և կապվեք աշխատակցի հետ՝ նորից բացահայտ հրավիրելուց առաջ։",
  active: "Ակտիվ", inactive: "Ապաակտիվացված", pending: "Սպասող հրավեր", setup: "Հաշվի կարգավորում", setupComplete: "Կարգավորումն ավարտված է", setupPending: "Կարգավորումն ավարտված չէ", allSetup: "Կարգավորման բոլոր վիճակները", allRoles: "Բոլոր դերերը",
  loadingTeam: "Աշխատակիցները բեռնվում են…", emptyTeam: "Այս զտիչներով աշխատակիցներ չկան։", loadError: "Կառավարման տվյալները չբեռնվեցին։ Թարմացրեք՝ նոր հարցում կատարելու համար։",
  forbidden: "Սերվերը մերժել է գործողությունը։ Դեռ թույլատրված մուտքի նստաշրջանը պահպանվում է։",
  mutationError: "Փոփոխությունը չի հաստատվել։ Նոր գործողությունից առաջ ստուգեք սերվերի թարմացված վիճակը։",
  mutationUncertain: "Փոփոխությունը կարող էր պահպանվել, բայց արդյունքն անորոշ է։ Սերվերի վիճակը թարմացվում է․ մի կրկնեք գործողությունը մինչև ստուգելը։",
  changed: "Սերվերը հաստատել է փոփոխությունը։ Թիմի իրական վիճակը թարմացվում է։",
  governanceConflict: "Սերվերը մերժել է փոփոխությունը՝ սեփական հասանելիությունը կամ վերջին ակտիվ ադմինիստրատորին պաշտպանելու համար։ Ցանկը թարմացվում է․ ստուգեք այն նոր գործողությունից առաջ։",
  pendingConflict: "Վերաակտիվացումից առաջ հաշվի կարգավորումը պետք է ավարտված լինի։ Ստուգեք աշխատակցի ընթացիկ վիճակը։",
  details: "Աշխատակցի տվյալներ", changeRole: "Փոխել դերը", deactivate: "Ապաակտիվացնել աշխատակցին", reactivate: "Վերաակտիվացնել աշխատակցին", revoke: "Չեղարկել բոլոր նստաշրջանները",
  roleHelp: "Կփոխվի հենց այս աշխատակցի դերը, և նրա բոլոր նստաշրջանները կդառնան անվավեր։ Սերվերն է որոշում՝ փոփոխությունը թույլատրված է, թե ոչ։",
  deactivateHelp: "Անջատում է աշխատակցի հաշիվը, անվավեր դարձնում հասանելիությունն ու բոլոր նստաշրջանները և սպառում չօգտագործված մեկանգամյա նույնականացման հղակները։",
  reactivateHelp: "Միացնում է արդեն կարգավորված հաշիվը։ Կարգավորումը պետք է ավարտված լինի․ աշխատակիցը պետք է նորից մուտք գործի։",
  revokeHelp: "Չեղարկում է աշխատակցի յուրաքանչյուր նստաշրջանը։ Անհրաժեշտ կլինի նորից մուտք գործել։ Առանձին սարքերի տվյալներ հասանելի չեն։",
  selfRevokeHelp: "Ներառյալ ձեր ընթացիկ նստաշրջանը։ Հաջողության դեպքում անմիջապես դուրս կգաք և կվերադառնաք մուտքի էջ։",
  selfAction: "Չեք կարող փոխել ձեր սեփական դերը կամ ապաակտիվացնել ինքներդ ձեզ։", confirm: "Հաստատել փոփոխությունը", you: "Դուք", deactivatedAt: "Ապաակտիվացման ժամանակ", staffId: "Աշխատակցի ID",
  action: "Գործողության կոդ", actor: "Կատարող", actorId: "Կատարողի ID (24 տասնվեցական նիշ)", entity: "Օբյեկտ", entityType: "Օբյեկտի տեսակ", entityId: "Օբյեկտի ID",
  fromUtc: "Սկիզբ (UTC)", toUtc: "Ավարտ (UTC)", utcHelp: "Միջակայքն ու ժամանակները UTC-ով են, ոչ թե դիտարկիչի ժամային գոտով։ Երկու սահմաններն էլ ներառված են։",
  invalidRange: "Մուտքագրեք վավեր UTC ժամանակներ՝ սկիզբը ոչ ուշ ավարտից, և վավեր կատարողի ID, եթե լրացնում եք։",
  loadingAudit: "Աուդիտի պատմությունը բեռնվում է…", emptyAudit: "Այս զտիչներով աուդիտի իրադարձություններ չկան։", auditDetail: "Աուդիտի իրադարձության տվյալներ", unknownActor: "Համակարգ կամ անհասանելի աշխատակից", metadata: "Մաքրված մետատվյալներ", noMetadata: "Մետատվյալներ չկան", methodPath: "HTTP մեթոդ / ուղի", rows: "Տողեր մեկ էջում", total: "Գրառումների քանակ", auditReadOnly: "Միայն դիտում", none: "Չկա",
};
export const staffGovernanceMessages: Record<Locale, StaffGovernanceMessages> = { hy, ru, en };

// Every label is authored explicitly. Unknown future codes stay visible as plain text.
const actionLabels = [
  ["staff.invited", "Staff invited", "Сотрудник приглашен", "Աշխատակիցը հրավիրվել է"],
  ["staff.role.updated", "Staff role changed", "Роль сотрудника изменена", "Աշխատակցի դերը փոխվել է"],
  ["staff.deactivated", "Staff deactivated", "Сотрудник деактивирован", "Աշխատակիցն ապաակտիվացվել է"],
  ["staff.reactivated", "Staff reactivated", "Сотрудник активирован", "Աշխատակիցը վերաակտիվացվել է"],
  ["staff.sessions.revoked", "All staff sessions revoked", "Все сессии сотрудника отозваны", "Աշխատակցի բոլոր նստաշրջանները չեղարկվել են"],
  ["auth.login.success", "Staff signed in", "Сотрудник вошел", "Աշխատակիցը մուտք է գործել"],
  ["auth.password.changed", "Password changed", "Пароль изменен", "Գաղտնաբառը փոխվել է"],
  ["auth.password.reset", "Password reset", "Пароль сброшен", "Գաղտնաբառը վերականգնվել է"],
  ["auth.invitation.accepted", "Account setup completed", "Настройка аккаунта завершена", "Հաշվի կարգավորումն ավարտվել է"],
  ["auth.refresh.reuse_detected", "Refresh replay rejected", "Повтор токена отклонен", "Թոքենի կրկնակի օգտագործումը մերժվել է"],
  ["appointment.create.website", "Online booking received", "Онлайн-запись получена", "Առցանց գրանցումը ստացվել է"],
  ["appointment.booking.replay", "Booking replay served", "Повтор записи обработан", "Գրանցման կրկնակի հարցումը մշակվել է"],
  ["appointment.create.admin", "Staff appointment created", "Запись создана сотрудником", "Աշխատակիցը գրանցում է ստեղծել"],
  ["appointment.reschedule", "Appointment rescheduled", "Запись перенесена", "Գրանցումը տեղափոխվել է"],
  ["appointment.status.update", "Appointment status changed", "Статус записи изменен", "Գրանցման վիճակը փոխվել է"],
  ["appointment.cancel", "Appointment cancelled", "Запись отменена", "Գրանցումը չեղարկվել է"],
  ["clinic.settings.update", "Clinic settings updated", "Настройки клиники изменены", "Կլինիկայի կարգավորումները փոխվել են"],
  ["clinic.schedule_exception.set", "Clinic exception set", "Исключение клиники задано", "Կլինիկայի բացառությունը սահմանվել է"],
  ["clinic.schedule_exception.delete", "Clinic exception removed", "Исключение клиники удалено", "Կլինիկայի բացառությունը հեռացվել է"],
  ["dentist.schedule_exception.set", "Dentist exception set", "Исключение стоматолога задано", "Ատամնաբույժի բացառությունը սահմանվել է"],
  ["dentist.schedule_exception.delete", "Dentist exception removed", "Исключение стоматолога удалено", "Ատամնաբույժի բացառությունը հեռացվել է"],
  ["media.cleanup.retry", "Media cleanup retry requested", "Повтор очистки медиа запрошен", "Մեդիայի մաքրման կրկնափորձ է պահանջվել"],
  ["before_after.consent.withdraw", "Publication consent withdrawn", "Согласие на публикацию отозвано", "Հրապարակման համաձայնությունը հետ է կանչվել"],
  ["before_after.media.purge", "Case media purged", "Медиа случая очищены", "Դեպքի մեդիան վերջնական հեռացվել է"],
  ["before_after.restore.rejected", "Case restore rejected", "Восстановление случая отклонено", "Դեպքի վերականգնումը մերժվել է"],
  ["dentist.photo.update", "Dentist photo replaced", "Фото стоматолога заменено", "Ատամնաբույժի լուսանկարը փոխարինվել է"],
  ["dentist.photo.delete", "Dentist photo removed", "Фото стоматолога удалено", "Ատամնաբույժի լուսանկարը հեռացվել է"],
  ["service.image.update", "Service image replaced", "Изображение услуги заменено", "Ծառայության պատկերը փոխարինվել է"],
  ["service.image.delete", "Service image removed", "Изображение услуги удалено", "Ծառայության պատկերը հեռացվել է"],
  ["before_after.before_image.update", "Before image replaced", "Фото до заменено", "Մինչև պատկերը փոխարինվել է"],
  ["before_after.after_image.update", "After image replaced", "Фото после заменено", "Հետո պատկերը փոխարինվել է"],
] as const;
const entityLabels = {
  en: { service_category: "Service category", service: "Service", dentist: "Dentist", before_after: "Before/after case", "media.gallery": "Gallery image", user: "Staff", appointment: "Appointment", clinic: "Clinic" },
  ru: { service_category: "Категория услуг", service: "Услуга", dentist: "Стоматолог", before_after: "Случай до/после", "media.gallery": "Изображение галереи", user: "Сотрудник", appointment: "Запись", clinic: "Клиника" },
  hy: { service_category: "Ծառայության կատեգորիա", service: "Ծառայություն", dentist: "Ատամնաբույժ", before_after: "Մինչև/հետո դեպք", "media.gallery": "Պատկերասրահի նկար", user: "Աշխատակից", appointment: "Գրանցում", clinic: "Կլինիկա" },
};
const verbs = { en: { create: "created", restore: "restored", update: "updated", disable: "disabled", delete: "removed" }, ru: { create: "создан", restore: "восстановлен", update: "изменен", disable: "отключен", delete: "удален" }, hy: { create: "ստեղծվել է", restore: "վերականգնվել է", update: "փոխվել է", disable: "անջատվել է", delete: "հեռացվել է" } };
export function governanceEntityLabel(code: string, locale: Locale) {
  return (entityLabels[locale] as Record<string, string>)[code] ?? code;
}
export function governanceActionLabel(code: string, locale: Locale) {
  const known = actionLabels.find((item) => item[0] === code);
  if (known) return known[locale === "en" ? 1 : locale === "ru" ? 2 : 3];
  const match = /^(service_category|service|dentist|before_after|media\.gallery)\.(create|restore|update|disable|delete)$/u.exec(code);
  if (match) return `${governanceEntityLabel(match[1], locale)} · ${(verbs[locale] as Record<string, string>)[match[2]]}`;
  return code;
}

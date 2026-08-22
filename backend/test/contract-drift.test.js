import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';


const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repositoryRoot = path.resolve(backendRoot, '..');
const openApiPath = path.join(repositoryRoot, 'docs', 'openapi.yaml');
const apiContractPath = path.join(repositoryRoot, 'docs', 'API_CONTRACT.md');


const read = (filePath) => readFileSync(filePath, 'utf8')
  .replace(/\r\n/g, '\n');


const normalizePath = (value) => value
  .replace(/:\w+/g, '{param}')
  .replace(/\{[^}]+\}/g, '{param}')
  .replace(/\/$/, '') || '/';


const expressOperations = () => {
  const routesIndexPath = path.join(backendRoot, 'src', 'routes', 'index.js');
  const routesIndex = read(routesIndexPath);
  const routesDirectory = path.dirname(routesIndexPath);
  const imports = new Map(
    [...routesIndex.matchAll(
      /import\s+(\w+)\s+from\s+'([^']+\.routes\.js)'/g
    )].map(([, variable, relativePath]) => [
      variable,
      path.resolve(routesDirectory, relativePath),
    ])
  );

  const operations = new Set();
  for (const [, mountPath, variable] of routesIndex.matchAll(
    /router\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g
  )) {
    const routeFile = imports.get(variable);
    assert.ok(routeFile, `Cannot resolve route module ${variable}`);
    for (const [, method, localPath] of read(routeFile).matchAll(
      /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/gi
    )) {
      const suffix = localPath === '/' ? '' : localPath;
      operations.add(
        `${method.toUpperCase()} ${normalizePath(`${mountPath}${suffix}`)}`
      );
    }
  }

  const app = read(path.join(backendRoot, 'src', 'app.js'));
  for (const [, method, routePath] of app.matchAll(
    /app\.(get|post|put|patch|delete)\(\s*'(\/api\/v1[^']*)'/gi
  )) {
    operations.add(
      `${method.toUpperCase()} ${normalizePath(routePath.slice('/api/v1'.length))}`
    );
  }
  return [...operations].sort();
};


const openApiOperations = (document) => {
  const operations = new Set();
  let currentPath = null;
  for (const line of document.split(/\r?\n/)) {
    const pathMatch = /^  (\/[^:]+):\s*$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    if (/^components:\s*$/.test(line)) {
      currentPath = null;
      continue;
    }
    const methodMatch = /^    (get|post|put|patch|delete):\s*$/.exec(line);
    if (currentPath && methodMatch) {
      operations.add(
        `${methodMatch[1].toUpperCase()} ${normalizePath(currentPath)}`
      );
    }
  }
  return [...operations].sort();
};


const between = (document, start, end) => {
  const startIndex = document.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing contract section: ${start.trim()}`);
  const endIndex = document.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing contract boundary: ${end.trim()}`);
  return document.slice(startIndex, endIndex);
};


const operationBeforeResponses = (document, operationId) => between(
  document,
  `      operationId: ${operationId}\n`,
  '      responses:'
);


test('every registered Express operation is present in OpenAPI', () => {
  const express = expressOperations();
  const documented = openApiOperations(read(openApiPath));

  assert.ok(express.length >= 70, 'Route inventory parser found too few routes');
  assert.deepEqual(documented, express);
});


test('critical booking, schedule, identifier, and privacy contracts stay explicit', () => {
  const openApi = read(openApiPath);
  const humanContract = read(apiContractPath);

  const appointments = between(
    openApi,
    '  /appointments:\n',
    '  /appointments/admin:\n'
  );
  assert.match(appointments, /components\/parameters\/IdempotencyKey/);
  assert.match(appointments, /components\/parameters\/FromDate/);
  assert.match(appointments, /components\/parameters\/ToDate/);
  assert.match(appointments, /name: phone/);
  assert.match(appointments, /PublicBookingSuccess/);
  assert.match(appointments, /'503'/);

  const publicBooking = between(
    openApi,
    '    PublicBookingRequest:\n',
    '    AdminBookingRequest:\n'
  );
  assert.match(publicBooking, /required: \[challengeToken\]/);
  assert.match(publicBooking, /minLength: 10/);
  assert.match(publicBooking, /maxLength: 4096/);
  assert.match(openApi, /Language used for appointment notifications and reminders/);
  assert.match(openApi, /notificationLocale:/);
  assert.match(openApi, /scheduleRevision:/);

  const idempotencyKey = between(
    openApi,
    '    IdempotencyKey:\n',
    '    ExpectedScheduleRevision:\n'
  );
  assert.match(idempotencyKey, /required: true/);
  assert.match(idempotencyKey, /UUIDv4/);
  assert.match(idempotencyKey, /different request is 409/);

  const clinicException = between(
    openApi,
    '    ClinicScheduleException:\n',
    '    DentistScheduleException:\n'
  );
  assert.match(
    clinicException,
    /required: \[expectedScheduleRevision, isOpen\]/
  );
  assert.match(clinicException, /scheduleConflictAcknowledgement/);

  const scheduleError = between(
    openApi,
    '    ScheduleConflictError:\n',
    '    PatientBookingFields:\n'
  );
  assert.match(scheduleError, /SCHEDULE_REVISION_CONFLICT/);
  assert.match(scheduleError, /SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED/);
  assert.match(scheduleError, /maxItems: 25/);
  assert.match(scheduleError, /acknowledgementToken/);

  const categoryIdentifier = between(
    openApi,
    '  /service-categories/{identifier}:\n',
    '  /service-categories/{id}/restore:\n'
  );
  assert.match(categoryIdentifier, /SlugIdentifier/);
  assert.match(categoryIdentifier, /ObjectIdIdentifier/);

  assert.match(openApi, /AppointmentPublicResult:/);
  assert.match(openApi, /AppointmentAdmin:/);
  assert.match(openApi, /privacyConsentAt:/);
  assert.match(openApi, /privacyPolicyVersion:/);
  const bookingSettings = between(
    openApi,
    '    BookingSettings:\n',
    '    ClinicUpdateRequest:\n'
  );
  assert.doesNotMatch(bookingSettings, /^\s+cancellationNoticeHours:/m);
  assert.match(bookingSettings, /legacy cancellationNoticeHours property has/);
  assert.match(
    humanContract,
    /legacy `cancellationNoticeHours` setting has been removed/
  );
  assert.match(humanContract, /BOOKING_IDEMPOTENCY_TTL_HOURS/);
});


test('catalog and media mutation bodies stay endpoint-specific', () => {
  const openApi = read(openApiPath);

  assert.doesNotMatch(openApi, /LocalizedCatalog/);

  const expectedRequestBodies = [
    ['createServiceCategory', 'ServiceCategoryCreate'],
    ['updateServiceCategory', 'ServiceCategoryUpdate'],
    ['createService', 'ServiceCreate'],
    ['updateService', 'ServiceUpdate'],
    ['createDentist', 'DentistCreate'],
    ['updateGalleryImage', 'GalleryUpdate'],
    ['updateBeforeAfterCase', 'BeforeAfterUpdate'],
  ];
  for (const [operationId, requestBody] of expectedRequestBodies) {
    assert.match(
      operationBeforeResponses(openApi, operationId),
      new RegExp(
        `requestBody: \\{ \\$ref: '#/components/requestBodies/${requestBody}' \\}`
      )
    );
  }

  const categoryCreate = between(
    openApi,
    '    ServiceCategoryCreateRequest:\n',
    '    ServiceCategoryUpdateRequest:\n'
  );
  assert.match(categoryCreate, /additionalProperties: false/);
  assert.match(categoryCreate, /anyOf:/);
  assert.match(categoryCreate, /maxLength: 120/);
  assert.match(categoryCreate, /ServiceCategoryTranslations/);
  assert.doesNotMatch(categoryCreate, /^\s+imageUrl:/m);

  const categoryUpdate = between(
    openApi,
    '    ServiceCategoryUpdateRequest:\n',
    '    ServiceTranslation:\n'
  );
  assert.match(categoryUpdate, /minProperties: 1/);
  assert.doesNotMatch(categoryUpdate, /^\s+(?:slug|imageUrl|isActive):/m);

  const serviceCreate = between(
    openApi,
    '    ServiceCreateRequest:\n',
    '    ServiceUpdateRequest:\n'
  );
  assert.match(serviceCreate, /required: \[category\]/);
  assert.match(serviceCreate, /ServiceTranslations/);
  assert.match(serviceCreate, /default: on_request/);
  assert.match(serviceCreate, /default: 60/);
  assert.doesNotMatch(serviceCreate, /^\s+imageUrl:/m);

  const serviceUpdate = between(
    openApi,
    '    ServiceUpdateRequest:\n',
    '    DentistTranslation:\n'
  );
  assert.match(serviceUpdate, /additionalProperties: false/);
  assert.match(serviceUpdate, /minProperties: 1/);
  assert.doesNotMatch(serviceUpdate, /^\s+(?:slug|imageUrl|isActive):/m);

  const dentistCreate = between(
    openApi,
    '    DentistCreateRequest:\n',
    '    GalleryTranslation:\n'
  );
  assert.match(dentistCreate, /required: \[firstName, lastName\]/);
  assert.match(dentistCreate, /DentistTranslations/);
  assert.match(dentistCreate, /weeklySchedule:/);
  assert.doesNotMatch(dentistCreate, /^\s+photoUrl:/m);

  const dentistUpdate = between(
    openApi,
    '    DentistUpdateRequest:\n',
    '    PriceSnapshot:\n'
  );
  assert.match(dentistUpdate, /DentistTranslations/);
  assert.doesNotMatch(dentistUpdate, /schemas\/Translations/);

  const galleryUpdate = between(
    openApi,
    '    GalleryUpdateRequest:\n',
    '    BeforeAfterTranslation:\n'
  );
  assert.match(galleryUpdate, /GalleryTranslations/);
  assert.match(galleryUpdate, /minProperties: 1/);
  assert.match(galleryUpdate, /isActive:/);

  const beforeAfterUpdate = between(
    openApi,
    '    BeforeAfterUpdateRequest:\n',
    '    ClinicTranslation:\n'
  );
  assert.match(beforeAfterUpdate, /BeforeAfterTranslations/);
  assert.match(beforeAfterUpdate, /const: ''/);
  assert.doesNotMatch(
    beforeAfterUpdate,
    /^\s+(?:isActive|consentConfirmed|consentMethod|externalConsentReference):/m
  );
});

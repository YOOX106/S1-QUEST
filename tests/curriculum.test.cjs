'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require(process.env.S1QUEST_CORE_PATH || '../script.js');
const P = require('../js/curriculum.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../curriculum.json'), 'utf8'));
const courseIds = ['a1-cours-01', 'a1-cours-02', 'a1-cours-03', 'a1-cours-04'];
const tdIds = ['a1-td-01', 'a1-td-02', 'a1-td-03'];
const courseTitles = [
  'Chapitre I : Nombres réels',
  'Chapitre II : Suites numériques',
  "Chapitre III : Fonctions réelles d'une variable réelle",
  'Chapitre IV : Fonctions dérivables'
];
const project = state => P.projectModule(state, 'analyse1', catalog);
const totals = state => C.moduleStats(project(state));
const roundTrip = state => JSON.parse(JSON.stringify(state));

test('C01 — catalog contains precisely the seven user-provided Analyse 1 titles and no invented subsections', () => {
  assert.equal(P.validateCatalog(catalog), catalog);
  assert.equal(catalog.modules.length, 1);
  const module = catalog.modules[0];
  assert.equal(module.id, 'analyse1');
  assert.deepEqual(Object.keys(module.sections), ['cours', 'td']);
  assert.deepEqual(module.sections.cours.map(item => item.id), courseIds);
  assert.deepEqual(module.sections.cours.map(item => item.title), courseTitles);
  assert.deepEqual(module.sections.td.map(item => item.id), tdIds);
  assert.deepEqual(module.sections.td.map(item => item.title), ['TD Série 1', 'TD Série 2', 'TD Série 3']);
  for (const item of [...module.sections.cours, ...module.sections.td]) {
    assert.deepEqual(item.subsections, []);
    assert.equal(item.source.verifiedInDocument, false);
  }
});

test('C02 — public catalog exposes no private Drive identifier or URL and does not claim document verification', () => {
  assert.equal(catalog.resources.length, 7);
  const publicJSON = JSON.stringify(catalog);
  assert.equal(publicJSON.includes('drive.google.com'), false);
  for (const resource of catalog.resources) {
    assert.equal(Object.hasOwn(resource, 'url'), false);
    assert.equal(resource.access, 'private-local');
    assert.equal(resource.verification.status, 'provided-by-user');
    assert.equal(resource.verification.documentContentVerified, false);
  }
});

test('C03 — suggested relations follow the supplied observations and allow the same TD for several chapters', () => {
  assert.deepEqual(catalog.relations.map(relation => [relation.chapterId, relation.tdId]), [
    ['a1-cours-01', 'a1-td-01'],
    ['a1-cours-02', 'a1-td-02'],
    ['a1-cours-02', 'a1-td-03'],
    ['a1-cours-03', 'a1-td-03']
  ]);
  for (const relation of catalog.relations) {
    assert.equal(relation.status, 'proposed');
    assert.match(relation.rationale, /utilisateur/);
    assert.match(relation.rationale, /confirmer/);
  }
  assert.equal(catalog.relations.some(relation => relation.chapterId === 'a1-cours-04'), false);
});

test('C04 — repeated imports are side-effect-free projections with stable IDs and exactly seven items', () => {
  const state = C.createState();
  const original = JSON.stringify(state);
  let previous;
  for (let iteration = 0; iteration < 5; iteration++) {
    P.validateCatalog(catalog);
    const current = project(state);
    assert.deepEqual(current.sections.cours.map(item => item.curriculumId), courseIds);
    assert.deepEqual(current.sections.td.map(item => item.curriculumId), tdIds);
    assert.equal(C.moduleStats(current).total, 7);
    if (previous) assert.deepEqual(current, previous);
    previous = current;
  }
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(state.curriculumProgress, {});
  assert.deepEqual(state.modules[0].sections.cours, []);
});

test('C05 — completing a chapter never reorders the course; Cours and TD percentages are independent', () => {
  const state = C.createState();
  P.toggleCatalog(state, courseIds[1], true);
  let result = totals(state);
  assert.equal(result.sections.cours.total, 4);
  assert.equal(result.sections.cours.completed, 1);
  assert.equal(result.sections.cours.progressHundredths, 2500);
  assert.equal(result.sections.td.total, 3);
  assert.equal(result.sections.td.completed, 0);
  assert.equal(result.sections.td.progressHundredths, 0);
  P.toggleCatalog(state, tdIds[2], true);
  result = totals(state);
  assert.equal(result.sections.cours.progressHundredths, 2500);
  assert.equal(result.sections.td.progressHundredths, 3333);
  assert.equal(result.total, 7, 'a recommended TD is not duplicated under each associated chapter');
  assert.equal(result.completed, 2);
  assert.equal(result.progressHundredths, 2857);
  assert.deepEqual(project(state).sections.cours.map(item => item.curriculumId), courseIds);
  P.toggleCatalog(state, courseIds[1], false);
  assert.equal(totals(state).sections.cours.completed, 0);
  assert.equal(totals(state).sections.td.completed, 1);
});

test('C06 — TD may be completed directly before any course and state survives reload', () => {
  const state = C.createState();
  P.toggleCatalog(state, tdIds[1], true);
  const savedDate = state.curriculumProgress[tdIds[1]].completedAt;
  const reloaded = roundTrip(state);
  assert.doesNotThrow(() => C.validateState(reloaded));
  assert.equal(totals(reloaded).sections.cours.completed, 0);
  assert.equal(totals(reloaded).sections.td.completed, 1);
  assert.equal(project(reloaded).sections.td[1].completedAt, savedDate);
  P.toggleCatalog(reloaded, tdIds[1], true);
  assert.equal(reloaded.curriculumProgress[tdIds[1]].completedAt, savedDate, 'idempotent validation preserves its original date');
});

test('C07 — unknown modules remain empty and Analyse 1 gains no invented TP', () => {
  const state = C.createState();
  const projected = P.projectState(state, catalog);
  assert.equal(C.semesterStats(projected).total, 7);
  assert.equal(C.semesterStats(projected).configuredModules, 1);
  assert.deepEqual(Object.keys(projected.modules[0].sections), ['cours', 'td']);
  for (const module of projected.modules.slice(1)) {
    assert.equal(C.moduleStats(module).total, 0);
  }
});

test('C08 — matching personal titles are not automatically merged or discarded', () => {
  const state = C.createState();
  const task = C.addTask(state, 'analyse1', 'cours', courseTitles[0]);
  C.toggleTask(state, 'analyse1', 'cours', task.id, true);
  const before = JSON.stringify(task);
  const projection = project(state);
  assert.equal(projection.sections.cours.length, 5);
  assert.equal(totals(state).total, 8);
  assert.equal(projection.sections.cours[0].completed, false);
  assert.equal(projection.sections.cours.at(-1).completed, true);
  assert.equal(JSON.stringify(task), before);
  assert.deepEqual(state.curriculumProgress, {});
});

test('C09 — explicit personal-task link keeps IDs/dates/completion and counts it once across reload', () => {
  const state = C.createState();
  const task = C.addTask(state, 'analyse1', 'cours', 'Mon ancien chapitre');
  task.createdAt = '2026-09-01T10:00:00.000Z';
  C.toggleTask(state, 'analyse1', 'cours', task.id, true);
  task.completedAt = '2026-09-03T10:00:00.000Z';
  P.linkCatalogTask(state, catalog, courseIds[0], task.id);
  P.linkCatalogTask(state, catalog, courseIds[0], task.id);
  assert.equal(project(state).sections.cours.length, 4);
  assert.equal(totals(state).total, 7);
  const linked = project(state).sections.cours[0];
  assert.equal(linked.id, task.id);
  assert.equal(linked.completed, true);
  assert.equal(linked.createdAt, task.createdAt);
  assert.equal(linked.completedAt, task.completedAt);
  assert.deepEqual(roundTrip(state).modules[0].sections.cours[0], task);
  const reloaded = roundTrip(state);
  assert.doesNotThrow(() => C.validateState(reloaded));
  assert.equal(totals(reloaded).total, 7);
  P.toggleCatalog(reloaded, courseIds[0], false);
  assert.equal(reloaded.modules[0].sections.cours[0].completed, false);
  assert.equal(reloaded.modules[0].sections.cours[0].completedAt, null);
});

test('C10 — cross-module/section links and linking the same personal task twice are rejected without mutation', () => {
  const state = C.createState();
  const td = C.addTask(state, 'analyse1', 'td', 'TD personnel');
  const other = C.addTask(state, 'algebre1', 'cours', 'Cours autre module');
  const before = JSON.stringify(state);
  assert.throws(() => P.linkCatalogTask(state, catalog, courseIds[0], td.id));
  assert.throws(() => P.linkCatalogTask(state, catalog, courseIds[0], other.id));
  assert.equal(JSON.stringify(state), before);
  P.linkCatalogTask(state, catalog, tdIds[0], td.id);
  const linkedBefore = JSON.stringify(state);
  assert.throws(() => P.linkCatalogTask(state, catalog, tdIds[1], td.id));
  assert.equal(JSON.stringify(state), linkedBefore);
});

test('C11 — user title overrides and hidden-item tombstones survive repeated projection, update and reload', () => {
  const state = C.createState();
  P.toggleCatalog(state, courseIds[0], true);
  P.editCatalogTitle(state, courseIds[0], 'Mon titre conservé');
  P.hideCatalog(state, courseIds[0]);
  const completion = state.curriculumProgress[courseIds[0]].completedAt;
  const reloaded = roundTrip(state);
  const updated = roundTrip(catalog);
  updated.catalogVersion++;
  updated.modules[0].sections.cours[0].title = 'Titre officiel mis à jour';
  for (let index = 0; index < 3; index++) {
    assert.equal(P.projectModule(reloaded, 'analyse1', updated).sections.cours.length, 3);
    assert.equal(reloaded.curriculumProgress[courseIds[0]].hidden, true);
  }
  P.hideCatalog(reloaded, courseIds[0], false);
  const restored = P.projectModule(reloaded, 'analyse1', updated).sections.cours[0];
  assert.equal(restored.title, 'Mon titre conservé');
  assert.equal(restored.completed, true);
  assert.equal(restored.completedAt, completion);
  assert.doesNotThrow(() => C.validateState(reloaded));
});

test('C12 — removing a catalog item in an update never deletes its saved progress', () => {
  const state = C.createState();
  P.toggleCatalog(state, courseIds[0], true);
  const original = JSON.stringify(state);
  const updated = roundTrip(catalog);
  updated.modules[0].sections.cours.shift();
  updated.relations = updated.relations.filter(relation => relation.chapterId !== courseIds[0]);
  P.validateCatalog(updated);
  assert.equal(P.projectModule(state, 'analyse1', updated).sections.cours.length, 3);
  assert.equal(JSON.stringify(state), original);
  assert.equal(project(state).sections.cours[0].completed, true, 'restored stable ID recovers its completion');
});

test('C13 — unlinked and deleted personal tasks keep their original and catalog progress recoverable', () => {
  const state = C.createState();
  const task = C.addTask(state, 'analyse1', 'td', 'Ancien TD terminé');
  C.toggleTask(state, 'analyse1', 'td', task.id, true);
  P.linkCatalogTask(state, catalog, tdIds[0], task.id);
  P.unlinkCatalogTask(state, catalog, tdIds[0]);
  assert.equal(state.modules[0].sections.td[0].id, task.id);
  assert.equal(totals(state).sections.td.total, 4);
  assert.equal(project(state).sections.td[0].completed, true);
  P.linkCatalogTask(state, catalog, tdIds[0], task.id);
  C.deleteTask(state, 'analyse1', 'td', task.id);
  assert.equal(state.curriculumProgress[tdIds[0]].linkedTaskId, null);
  assert.equal(project(state).sections.td[0].completed, true);
  assert.equal(project(state).sections.td[0].completedAt, task.completedAt);
  assert.doesNotThrow(() => C.validateState(state));
});

test('C14 — informational document-verified subsections never become extra progression units', () => {
  const annotated = roundTrip(catalog);
  annotated.modules[0].sections.cours[0].subsections = [
    { id: 'test-subsection-1', title: 'Section de test vérifiée', order: 1, verifiedInDocument: true },
    { id: 'test-subsection-2', title: 'Autre section de test', order: 2, verifiedInDocument: true }
  ];
  P.validateCatalog(annotated);
  const module = P.projectModule(C.createState(), 'analyse1', annotated);
  assert.equal(C.moduleStats(module).total, 7);
  assert.equal(module.sections.cours.length, 4);
  annotated.modules[0].sections.cours[0].subsections[0].verifiedInDocument = false;
  assert.throws(() => P.validateCatalog(annotated), 'unknown subsection contents must not be accepted');
});

test('C15 — malformed catalog IDs, duplicate items, unsupported sections and broken relations are rejected', () => {
  const mutations = [
    data => { data.modules[0].sections.cours[1].id = courseIds[0]; },
    data => { data.modules[0].sections.cours[1].order = 1; },
    data => { data.modules[0].sections.tp = []; },
    data => { data.modules[0].sections.cours[0].resourceIds = ['missing']; },
    data => { data.relations[0].tdId = 'missing'; },
    data => { data.relations.push(data.relations[0]); },
    data => { data.relations[0].tdId = courseIds[1]; },
    data => { data.resources[0].verification.status = 'invented-status'; }
  ];
  for (const mutate of mutations) {
    const broken = roundTrip(catalog);
    mutate(broken);
    assert.throws(() => P.validateCatalog(broken));
  }
});

test('C16 — resource URL checks only accept HTTPS Google Drive file routes and never imply access verification', () => {
  const fixtureURL = 'https://drive.google.com/file/d/TEST_FIXTURE_DOCUMENT_123/view';
  assert.equal(P.validateDriveUrl(fixtureURL), true);
  for (const url of [
    'javascript:alert(1)', 'http://drive.google.com/file/d/TEST_FIXTURE_DOCUMENT_123/view',
    'https://drive.google.com.evil.test/file/d/TEST_FIXTURE_DOCUMENT_123/view',
    'https://drive.google.com@evil.test/file/d/TEST_FIXTURE_DOCUMENT_123/view',
    'https://drive.google.com/evil', 'https://drive.google.com/file/d/a/view',
    'https://user:password@drive.google.com/file/d/TEST_FIXTURE_DOCUMENT_123/view'
  ]) assert.equal(P.validateDriveUrl(url), false, url);
  const fixture = roundTrip(catalog);
  fixture.resources[0].url = fixtureURL;
  P.validateCatalog(fixture);
  assert.equal(fixture.resources[0].verification.status, 'provided-by-user');
  assert.equal(fixture.resources[0].verification.documentContentVerified, false);
});

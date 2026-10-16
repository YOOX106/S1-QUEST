'use strict';

// These checks use the supplied academic catalog, never downloaded private PDFs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require(process.env.S1QUEST_CORE_PATH || '../script.js');
const P = require('../js/microcurriculum.js');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../curriculum.json'), 'utf8'));
const catalog = P.validateCatalog(raw);
const clone = value => JSON.parse(JSON.stringify(value));
const allTasks = state => P.projectState(state, catalog).modules.flatMap(m => Object.values(m.sections).flat());
const total = state => C.semesterStats(P.projectState(state, catalog));
const course = 'analyse1-c01-u01';
const course2 = 'analyse1-c01-u02';
const td = P.getUnits(catalog, 'analyse1', 'td')[0].id;
const taskOf = (state, id) => allTasks(state).find(task => task.curriculumId === id);
const invalid = change => { const value = clone(raw); change(value); assert.throws(() => P.validateCatalog(value)); };

test('MC01 — supplied seven-module catalog contains 454 distinct leaves, 437 required and 17 bonus', () => {
  const units = P.getUnits(catalog);
  assert.equal(units.length, 454);
  assert.equal(new Set(units.map(unit => unit.id)).size, 454);
  assert.equal(units.filter(unit => !unit.optional).length, 437);
  assert.equal(units.filter(unit => unit.optional).length, 17);
  assert.deepEqual(catalog.modules.map(module => module.id), C.MODULES.map(module => module.id));
  assert.deepEqual(catalog.modules.map(module => P.getUnits(catalog, module.id).length), [96, 63, 60, 67, 54, 114, 0]);
  assert.deepEqual(catalog.modules.map(module => Object.keys(module.sections)), C.MODULES.map(module => [...module.sections]));
});

test('MC02 — academic order, source confidence and original source data remain unchanged by normalization', () => {
  assert.deepEqual(P.getGroups(catalog, 'analyse1', 'cours').map(group => group.id), ['analyse1-c01', 'analyse1-c02', 'analyse1-c03', 'analyse1-c04']);
  assert.deepEqual(P.getGroups(catalog, 'analyse1', 'td').map(group => group.title), ['TD Série 1', 'TD Série 2', 'TD Série 3']);
  for (const module of catalog.modules) {
    for (const [section, groups] of Object.entries(module.sections)) {
      const originals = raw.modules.find(item => item.id === module.id).sections[section];
      assert.deepEqual(groups.map(group => group.id), originals.map(group => group.id));
      groups.forEach((group, index) => {
        assert.equal(group.title, originals[index].title);
        assert.equal(group.order, index + 1);
        assert.deepEqual(group.units.map(unit => unit.id), originals[index].units.map(unit => unit.id));
        group.units.forEach((unit, position) => {
          assert.equal(unit.title, originals[index].units[position].title);
          assert.equal(unit.confidence, originals[index].units[position].confidence);
          assert.equal(unit.order, position + 1);
          assert.equal(unit.groupId, group.id);
        });
      });
    }
  }
  assert.deepEqual(catalog.sourceCatalog, raw);
  assert.deepEqual(P.validateCatalog(catalog), catalog, 'normalization is idempotent');
});

test('MC03 — seven explicit optional TD exercises and ten derived TP bonus retain their raw provenance', () => {
  const explicit = raw.modules.flatMap(module => Object.values(module.sections).flatMap(groups => groups.flatMap(group => group.units))).filter(unit => unit.optional);
  assert.equal(explicit.length, 7);
  assert.ok(explicit.every(unit => unit.id.startsWith('analyse1-td01-')));
  const group = P.getItem(catalog, 'informatique1-tpbonus');
  assert.equal(group.units.length, 10);
  assert.ok(group.units.every(unit => unit.optional));
  const original = raw.modules.find(module => module.id === 'informatique1').sections.tp.find(group => group.id === 'informatique1-tpbonus');
  assert.ok(original.units.every(unit => !Object.hasOwn(unit, 'optional')), 'derived classification does not rewrite the supplied JSON');
});

test('MC04 — 66 private source references and 24 proposed relations expose no private URL or invented verification', () => {
  assert.equal(catalog.resources.length, 66);
  assert.equal(catalog.relations.length, 24);
  assert.equal(new Set(catalog.resources.map(resource => resource.id)).size, 66);
  assert.doesNotMatch(JSON.stringify(raw), /https?:\/\/|\/file\/d\//i);
  for (const resource of catalog.resources) {
    assert.equal(resource.access, 'private-local');
    assert.equal(resource.verification.documentContentVerified, false);
    assert.equal(Object.hasOwn(resource, 'url'), false);
    assert.equal(resource.sourceMeta.drive_url, null);
  }
  for (const relation of catalog.relations) {
    assert.equal(relation.status, 'proposed');
    assert.equal(P.getItem(catalog, relation.chapterId).moduleId, P.getItem(catalog, relation.tdId).moduleId);
  }
  assert.equal(catalog.resources.find(resource => resource.sourceId === 'analyse1:cours:1').id, 'a1-resource-cours-01', 'existing local PDF bindings keep their resource IDs');
});

test('MC05 — catalog rejects wrong version, modules/order/sections, missing source and duplicate parent or leaf IDs', () => {
  invalid(value => { value.version = 2; });
  invalid(value => { value.modules.reverse(); });
  invalid(value => { value.modules.pop(); });
  invalid(value => { value.modules[0].sections.tp.push(clone(value.modules[0].sections.cours[0])); });
  invalid(value => { value.modules[0].sections.fake = []; });
  invalid(value => { value.modules[0].sections.cours[0].source_id = 'analyse1:cours:missing'; });
  invalid(value => { value.modules[0].sections.cours[1].id = value.modules[0].sections.cours[0].id; });
  invalid(value => { value.modules[0].sections.cours[0].units[1].id = value.modules[0].sections.cours[0].units[0].id; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].id = 'constructor'; });
});

test('MC06 — public catalog rejects URL injection, private source permission flags and cross-module source substitutions', () => {
  invalid(value => { value.purpose += ' https://example.org/private.pdf'; });
  invalid(value => { value.sources['analyse1:cours:1'].drive_url = 'https://drive.google.com/file/d/test-private-id/view'; });
  invalid(value => { value.privacy.contains_private_urls = true; });
  invalid(value => { value.sources['analyse1:cours:1'].visibility = 'public'; });
  invalid(value => { value.modules[0].sections.cours[0].source_id = 'algebre1:cours:1'; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].source_id = 'analyse1:td:1'; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].type = 'tp'; });
});

test('MC07 — page references are bounded by actual source length and cannot be inferred for unknown pages', () => {
  invalid(value => { value.modules[0].sections.cours[0].units[0].pdf_page = 0; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].pdf_page = 55; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].pdf_pages = [3, 2]; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].pdf_pages = [1, 55]; });
  invalid(value => {
    value.sources['analyse1:cours:1'].pdf_pages = null;
    value.modules[0].sections.cours[0].units[0].pdf_page = 1;
  });
  const valid = clone(raw);
  valid.modules[0].sections.cours[0].units[0].pdf_pages = [1, 54];
  assert.deepEqual(P.getItem(P.validateCatalog(valid), course).pdfPages, [1, 54]);
});

test('MC08 — associations reject automatic confirmation, duplicates and cross-module recommendations', () => {
  invalid(value => { value.suggested_course_td_links[0].status = 'confirmed'; });
  invalid(value => { value.suggested_course_td_links.push(clone(value.suggested_course_td_links[0])); });
  invalid(value => { value.suggested_course_td_links[0].td_id = 'algebre1-td01'; });
  invalid(value => { value.suggested_course_td_links[0].confidence = 'guaranteed'; });
});

test('MC09 — repeated projections do not import duplicate tasks, mutate progress or count parents', () => {
  const state = C.createState();
  const before = JSON.stringify(state);
  const first = P.projectState(state, catalog);
  for (let iteration = 0; iteration < 5; iteration++) assert.deepEqual(P.projectState(state, P.validateCatalog(catalog)), first);
  assert.equal(JSON.stringify(state), before);
  assert.equal(allTasks(state).length, 454);
  assert.equal(total(state).total, 437);
  assert.equal(total(state).completed, 0);
  assert.equal(total(state).configuredModules, 6);
  assert.equal(C.moduleStats(first.modules.at(-1)).progress, null);
  const group = P.getGroups(catalog, 'analyse1', 'cours')[0];
  assert.equal(allTasks(state).some(task => task.curriculumId === group.id), false);
  assert.equal(C.stats(P.projectModule(state, 'analyse1', catalog).sections.cours.filter(task => task.groupId === group.id)).total, group.units.length);
});

test('MC10 — Cours/TD/TP completion and exact weighted percentages remain independent across reload', () => {
  const state = C.createState();
  P.toggleCatalog(state, td, true); // TD are available before any completed course.
  let analysis = C.moduleStats(P.projectModule(state, 'analyse1', catalog));
  assert.equal(analysis.sections.cours.total, 52);
  assert.equal(analysis.sections.cours.completed, 0);
  assert.equal(analysis.sections.td.total, 37);
  assert.equal(analysis.sections.td.completed, 1);
  P.toggleCatalog(state, course, true);
  const tp = P.getUnits(catalog, 'informatique1', 'tp').find(unit => !unit.optional);
  P.toggleCatalog(state, tp.id, true);
  const saved = clone(state);
  assert.doesNotThrow(() => C.validateState(saved));
  analysis = C.moduleStats(P.projectModule(saved, 'analyse1', catalog));
  assert.equal(analysis.sections.cours.progressHundredths, Math.round(10000 / 52));
  assert.equal(analysis.sections.td.progressHundredths, Math.round(10000 / 37));
  assert.equal(analysis.progressHundredths, Math.round(2 * 10000 / 89));
  assert.equal(C.moduleStats(P.projectModule(saved, 'informatique1', catalog)).sections.tp.completed, 1);
  assert.equal(total(saved).completed, 3);
  assert.equal(total(saved).progressHundredths, Math.round(3 * 10000 / 437));
  const date = saved.unitProgress[course].completedAt;
  P.toggleCatalog(saved, course, true);
  assert.equal(saved.unitProgress[course].completedAt, date);
  P.toggleCatalog(saved, course, false);
  assert.equal(total(saved).completed, 2);
  assert.equal(taskOf(saved, td).completed, true);
});

test('MC11 — starting and understanding a mission never complete it; review state survives explicit validation', () => {
  const state = C.createState();
  assert.equal(P.status(taskOf(state, course)), 'not_started');
  P.startUnit(state, course);
  const started = state.unitProgress[course].startedAt;
  assert.equal(P.status(taskOf(state, course)), 'in_progress');
  for (const mastery of ['understood', 'mastered', 'unknown']) {
    P.setMastery(state, course, mastery);
    assert.equal(taskOf(state, course).completed, false);
    assert.equal(total(state).completed, 0);
  }
  P.startUnit(state, course);
  assert.equal(state.unitProgress[course].startedAt, started);
  P.setMastery(state, course, 'review');
  assert.equal(P.status(taskOf(state, course)), 'review');
  P.toggleCatalog(state, course, true);
  assert.equal(P.status(taskOf(state, course)), 'review');
  assert.equal(total(state).completed, 1);
  P.setMastery(state, course, 'mastered');
  assert.equal(P.status(taskOf(state, course)), 'completed');
  P.toggleCatalog(state, course, false);
  assert.equal(taskOf(state, course).mastery, 'mastered');
  assert.equal(total(state).completed, 0);
  assert.throws(() => P.setMastery(state, course, 'automatically-completed'));
  assert.doesNotThrow(() => C.validateState(state));
});

test('MC12 — optional work remains separate unless explicitly added to the personal objective', () => {
  const state = C.createState();
  const bonus = P.getUnits(catalog).filter(unit => unit.optional);
  for (const unit of bonus) P.toggleCatalog(state, unit.id, true);
  assert.equal(total(state).total, 437);
  assert.equal(total(state).completed, 0);
  assert.equal(allTasks(state).filter(task => task.isBonus && task.completed).length, 17);
  P.includeOptional(state, bonus[0].id, true);
  assert.equal(total(state).total, 438);
  assert.equal(total(state).completed, 1);
  P.includeOptional(state, bonus[0].id, true);
  assert.equal(total(state).total, 438);
  P.includeOptional(state, bonus[0].id, false);
  assert.equal(total(state).total, 437);
  assert.equal(taskOf(state, bonus[0].id).completed, true, 'removing a bonus from the objective preserves its completion');
  assert.throws(() => P.includeOptional(state, bonus[0].id, 'yes'));
  assert.doesNotThrow(() => C.validateState(state));
});

test('MC13 — equivalent personal titles are preserved; only explicit association merges their statistical representation', () => {
  const state = C.createState();
  const manual = C.addTask(state, 'analyse1', 'cours', P.getItem(catalog, course).title);
  manual.createdAt = '2026-09-01T10:00:00.000Z';
  C.toggleTask(state, 'analyse1', 'cours', manual.id, true);
  manual.completedAt = '2026-09-02T10:00:00.000Z';
  const original = clone(manual);
  assert.equal(total(state).total, 438);
  assert.equal(taskOf(state, course).completed, false);
  P.linkCatalogTask(state, catalog, course, manual.id);
  assert.equal(total(state).total, 437);
  assert.equal(total(state).completed, 1);
  assert.equal(taskOf(state, course).id, manual.id);
  assert.deepEqual(state.modules[0].sections.cours[0], original);
  assert.equal(taskOf(state, course).createdAt, original.createdAt);
  assert.equal(taskOf(state, course).completedAt, original.completedAt);
  assert.throws(() => P.linkCatalogTask(state, catalog, course2, manual.id));
  assert.throws(() => P.linkCatalogTask(state, catalog, td, manual.id));
  assert.throws(() => P.linkCatalogTask(state, catalog, 'analyse1-c01', manual.id));
  P.toggleCatalog(state, course, false);
  assert.equal(manual.completed, false);
  P.toggleCatalog(state, course, true);
  P.unlinkCatalogTask(state, catalog, course);
  assert.equal(state.unitProgress[course].linkedTaskId, null);
  assert.equal(state.unitProgress[course].completed, true);
  assert.equal(taskOf(state, course).completed, true);
  assert.equal(state.modules[0].sections.cours[0].id, original.id);
  assert.doesNotThrow(() => C.validateState(clone(state)));
});

test('MC14 — renaming, hiding and restoring a mission never modify the academic catalog or erase progress', () => {
  const state = C.createState();
  const originalTitle = P.getItem(catalog, course).title;
  P.toggleCatalog(state, course, true);
  P.editCatalogTitle(state, course, 'Ma reformulation personnelle');
  assert.equal(taskOf(state, course).title, 'Ma reformulation personnelle');
  assert.equal(P.getItem(catalog, course).title, originalTitle);
  P.hideCatalog(state, course);
  assert.equal(taskOf(state, course), undefined);
  assert.equal(state.unitProgress[course].completed, true);
  P.hideCatalog(state, course, false);
  assert.equal(taskOf(state, course).completed, true);
  assert.equal(taskOf(state, course).title, 'Ma reformulation personnelle');
  assert.throws(() => P.editCatalogTitle(state, course, '   '));
  assert.doesNotThrow(() => C.validateState(state));
});

test('MC15 — old whole-chapter completion survives v2 migration without completing any new micro-mission', () => {
  const state = C.createState();
  const manual = C.addTask(state, 'analyse1', 'cours', 'Ancien chapitre complet');
  C.toggleTask(state, 'analyse1', 'cours', manual.id, true);
  C.setProfile(state, 'ÉTUDIANT EXISTANT');
  C.customizeModule(state, 'analyse1', { name: 'Mon Analyse', emoji: '📐', color: '#22d3ee' });
  state.curriculumProgress['a1-cours-01'] = { completed: true, createdAt: manual.createdAt, completedAt: manual.completedAt, titleOverride: 'Mon ancien chapitre', hidden: false, linkedTaskId: manual.id };
  state.schemaVersion = 2;
  delete state.unitProgress;
  const before = clone(state);
  const migrated = C.migrateState(state);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(state, before, 'migration must be pure');
  assert.deepEqual(migrated.curriculumProgress, before.curriculumProgress);
  assert.deepEqual(migrated.modules, before.modules);
  assert.deepEqual(migrated.profile, before.profile);
  assert.deepEqual(migrated.unitProgress, {});
  assert.equal(P.getLegacyRecord(migrated, 'analyse1-c01').completed, true);
  assert.equal(allTasks(migrated).filter(task => task.curriculumId && task.completed).length, 0);
  assert.equal(total(migrated).completed, 0);
  assert.equal(total(migrated).total, 437, 'legacy parent/manual representation is retained but excluded from the leaf denominator');
  const legacyTask = allTasks(migrated).find(task => task.id === manual.id);
  assert.equal(legacyTask.legacyOnly, true);
  assert.equal(legacyTask.completed, true);
  assert.doesNotThrow(() => C.validateState(migrated));
});

test('MC16 — next mission is deterministic, favors review and started work, skips bonuses and respects an explicit skip', () => {
  const state = C.createState();
  assert.equal(P.nextMission(state, catalog).curriculumId, course);
  assert.equal(P.nextMission(state, catalog, course).curriculumId, course2);
  P.startUnit(state, course2);
  assert.equal(P.nextMission(state, catalog).curriculumId, course2);
  P.toggleCatalog(state, td, true);
  P.setMastery(state, td, 'review');
  assert.equal(P.nextMission(state, catalog).curriculumId, td, 'completed work explicitly flagged for review remains eligible');
  P.setMastery(state, td, 'mastered');
  assert.equal(P.nextMission(state, catalog).curriculumId, course2);
  for (const unit of P.getUnits(catalog).filter(unit => !unit.optional)) P.toggleCatalog(state, unit.id, true);
  assert.equal(P.nextMission(state, catalog), null, 'unselected bonus work must not prevent finishing the required path');
});

test('MC17 — filters follow learning state and search titles without changing state or order', () => {
  const state = C.createState();
  P.startUnit(state, course2);
  P.toggleCatalog(state, td, true);
  const tasks = allTasks(state);
  const before = JSON.stringify(state);
  assert.equal(P.matches(taskOf(state, course), 'not_started'), true);
  assert.equal(P.matches(taskOf(state, course2), 'in_progress'), true);
  assert.equal(P.matches(taskOf(state, td), 'completed'), true);
  P.setMastery(state, td, 'review');
  assert.equal(P.matches(taskOf(state, td), 'review'), true);
  assert.equal(P.matches(taskOf(state, td), 'completed'), true, 'completion and review remain independent filter dimensions');
  assert.deepEqual(tasks.filter(task => P.matches(task, 'all', ' ' + taskOf(state, course).title.toLocaleUpperCase('fr') + ' ')).map(task => task.curriculumId), [course]);
  const afterMastery = JSON.stringify(state);
  tasks.filter(task => P.matches(task, 'all', 'introuvable-zzzz'));
  assert.equal(JSON.stringify(state), afterMastery);
  assert.notEqual(afterMastery, before);
});

test('MC18 — malformed study-state commands fail without changing any existing records', () => {
  const state = C.createState();
  P.toggleCatalog(state, course, true);
  const before = JSON.stringify(state);
  assert.throws(() => P.toggleCatalog(state, course, 1));
  assert.throws(() => P.setMastery(state, course, 'invented-state'));
  assert.throws(() => P.hideCatalog(state, course, 'true'));
  assert.throws(() => P.startUnit(state, '__proto__'));
  assert.equal(JSON.stringify(state), before);
});

class ImportStorage {
  constructor(raw) {
    this.entries = new Map(raw === undefined ? [] : [[C.STORAGE_KEY, raw]]);
    this.events = [];
    this.onWrite = null;
    this.onRead = null;
  }
  getItem(key) {
    const value = this.entries.get(key) ?? null;
    this.events.push(['read', key, value]);
    return this.onRead ? this.onRead(key, value) : value;
  }
  setItem(key, value) {
    this.events.push(['write', key, String(value)]);
    if (this.onWrite) this.onWrite(key, String(value));
    this.entries.set(key, String(value));
  }
}

function importFixture() {
  const existing = C.createState();
  C.setProfile(existing, 'MA SAUVEGARDE À PROTÉGER');
  C.addTask(existing, 'analyse1', 'cours', 'Travail personnel déjà présent');
  const oldRaw = JSON.stringify(existing, null, 2); // Deliberately retain the exact whitespace in the backup.
  const storage = new ImportStorage(oldRaw);
  const store = new C.Store(storage);
  assert.equal(store.load().status, 'loaded');
  const incoming = C.createState();
  C.setProfile(incoming, 'IMPORT RÉEL');
  P.toggleCatalog(incoming, course, true);
  P.setMastery(incoming, course, 'review');
  P.startUnit(incoming, td);
  C.customizeModule(incoming, 'informatique1', { name: 'Mon Python', emoji: '🐍', color: '#22d3ee' });
  return { existing, oldRaw, storage, store, incoming };
}

test('MC19 — progress import verifies a verbatim backup before replacing any active data', () => {
  const { oldRaw, storage, store, incoming } = importFixture();
  const result = store.importData(JSON.stringify(incoming));
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, incoming);
  const backup = [...storage.entries].find(([key, value]) => key.startsWith(C.BACKUP_PREFIX) && value === oldRaw);
  assert.ok(backup, 'the previous raw JSON, including whitespace, is retained');
  const readBackup = storage.events.findIndex(([operation, key, value]) => operation === 'read' && key === backup[0] && value === oldRaw);
  const replace = storage.events.findIndex(([operation, key]) => operation === 'write' && key === C.STORAGE_KEY);
  assert.ok(readBackup >= 0 && replace > readBackup, 'verification of the backup precedes the active replacement');
  assert.deepEqual(JSON.parse(storage.entries.get(C.STORAGE_KEY)), incoming);
  const reload = new C.Store(storage).load();
  assert.equal(reload.status, 'loaded');
  assert.deepEqual(reload.state, incoming);
});

test('MC20 — invalid JSON, unsupported schema and malformed progress imports leave active data intact', () => {
  const { oldRaw, storage, store, incoming } = importFixture();
  const future = clone(incoming); future.schemaVersion = 99;
  const malformed = clone(incoming); malformed.unitProgress[course].mastery = 'invented';
  const sources = ['{"broken":', JSON.stringify(future), malformed, null, []];
  for (const source of sources) {
    const beforeEntries = [...storage.entries];
    const beforeEvents = storage.events.length;
    const result = store.importData(source);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'invalid');
    assert.equal(storage.entries.get(C.STORAGE_KEY), oldRaw);
    assert.deepEqual([...storage.entries], beforeEntries);
    assert.equal(storage.events.length, beforeEvents, 'validation fails before any storage operation');
  }
});

test('MC21 — import refuses a failed or unverifiable backup and preserves the previous raw save', () => {
  for (const mode of ['quota', 'verification']) {
    const { oldRaw, storage, store, incoming } = importFixture();
    if (mode === 'quota') storage.onWrite = key => { if (key.startsWith(C.BACKUP_PREFIX)) throw new Error('Quota exceeded'); };
    else storage.onRead = (key, value) => key.startsWith(C.BACKUP_PREFIX) && value !== null ? 'unverifiable backup' : value;
    const result = store.importData(incoming);
    assert.equal(result.ok, false, mode);
    assert.equal(storage.entries.get(C.STORAGE_KEY), oldRaw, mode);
    assert.equal(storage.events.some(([operation, key]) => operation === 'write' && key === C.STORAGE_KEY), false, mode);
  }
});

test('MC22 — concurrent writes before import or during its backup block replacement instead of overwriting another tab', () => {
  for (const moment of ['before-import', 'during-backup']) {
    const { oldRaw, storage, store, incoming } = importFixture();
    const competing = C.createState(); C.setProfile(competing, 'AUTRE ONGLET');
    const competingRaw = JSON.stringify(competing);
    if (moment === 'before-import') storage.entries.set(C.STORAGE_KEY, competingRaw);
    else storage.onWrite = key => { if (key.startsWith(C.BACKUP_PREFIX)) storage.entries.set(C.STORAGE_KEY, competingRaw); };
    const result = store.importData(incoming);
    assert.equal(result.ok, false, moment);
    assert.equal(result.status, 'conflict', moment);
    assert.equal(storage.entries.get(C.STORAGE_KEY), competingRaw, moment);
    assert.equal(storage.events.some(([operation, key]) => operation === 'write' && key === C.STORAGE_KEY), false, moment);
    if (moment === 'during-backup') assert.ok([...storage.entries].some(([key, value]) => key.startsWith(C.BACKUP_PREFIX) && value === oldRaw));
  }
});

test('MC23 — exported progress can be repeatedly imported and reloaded exactly without duplicate tasks or loss of dates', () => {
  const { storage, store, incoming } = importFixture();
  const manual = C.addTask(incoming, 'analyse1', 'cours', 'Lien personnel conservé');
  C.toggleTask(incoming, 'analyse1', 'cours', manual.id, true);
  P.linkCatalogTask(incoming, catalog, course2, manual.id);
  const exported = JSON.stringify(incoming);
  for (let iteration = 0; iteration < 4; iteration++) {
    const result = store.importData(exported);
    assert.equal(result.ok, true);
    assert.deepEqual(result.state, incoming);
    assert.equal(storage.entries.get(C.STORAGE_KEY), exported);
    assert.deepEqual(new C.Store(storage).load().state, incoming);
    assert.equal(allTasks(result.state).length, 454);
    assert.equal(total(result.state).total, 437);
    assert.equal(total(result.state).completed, 2);
    assert.equal(result.state.modules[0].sections.cours.length, 1);
    assert.equal(Object.keys(result.state.unitProgress).length, 3);
  }
});

test('MC24 — importing v2 retains profile, customizations, manual IDs/dates and legacy history while adding empty leaf progress', () => {
  const { oldRaw, storage, store } = importFixture();
  const source = C.createState();
  const manual = C.addTask(source, 'analyse1', 'cours', 'Cours terminé avant les micro-missions');
  manual.createdAt = '2026-09-01T12:00:00.000Z';
  C.toggleTask(source, 'analyse1', 'cours', manual.id, true);
  manual.completedAt = '2026-09-02T12:00:00.000Z';
  C.setProfile(source, 'PSEUDO HISTORIQUE');
  C.customizeModule(source, 'analyse1', { name: 'Mes maths', emoji: '📐', color: '#34d399' });
  source.curriculumProgress['a1-cours-01'] = { completed: true, createdAt: manual.createdAt, completedAt: manual.completedAt, hidden: false, titleOverride: 'Mon ancien titre', linkedTaskId: manual.id };
  source.schemaVersion = 2;
  delete source.unitProgress;
  const originalSource = clone(source);
  const result = store.importData(JSON.stringify(source));
  assert.equal(result.ok, true);
  assert.equal(result.state.schemaVersion, 3);
  assert.deepEqual(result.state.profile, source.profile);
  assert.deepEqual(result.state.modules, source.modules);
  assert.deepEqual(result.state.curriculumProgress, source.curriculumProgress);
  assert.deepEqual(result.state.unitProgress, {});
  assert.deepEqual(source, originalSource);
  assert.equal(total(result.state).completed, 0);
  assert.ok([...storage.entries].some(([key, value]) => key.startsWith(C.BACKUP_PREFIX) && value === oldRaw));
  assert.deepEqual(new C.Store(storage).load().state, result.state);
});

test('MC25 — statistics deduplicate canonical missions, exclude historical parents and separate bonus counts', () => {
  const canonical = { id: 'row-1', curriculumId: 'canonical-leaf', completed: true };
  const tasks = [canonical, { ...canonical, id: 'recommendation-copy' }, { id: 'manual-1', completed: false },
    { id: 'legacy-parent', completed: true, legacyOnly: true },
    { id: 'bonus-excluded', completed: true, optional: true, isBonus: true },
    { id: 'bonus-included', completed: true, optional: false, isBonus: true }];
  const result = C.stats(tasks);
  assert.equal(result.total, 3);
  assert.equal(result.completed, 2);
  assert.equal(result.remaining, 1);
  assert.equal(result.bonusTotal, 2);
  assert.equal(result.bonusCompleted, 2);
  assert.equal(result.progressHundredths, 6667);
  assert.equal(result.remainingHundredths, 3333);
  assert.equal(C.stats([tasks[3], tasks[4]]).progress, null);
});

test('MC26 — saved leaf records reject invalid mastery, timestamps, flags and duplicate manual links', () => {
  const state = C.createState();
  P.toggleCatalog(state, course, true);
  P.startUnit(state, course2);
  const manual = C.addTask(state, 'analyse1', 'cours', 'Travail lié');
  P.linkCatalogTask(state, catalog, course, manual.id);
  assert.doesNotThrow(() => C.validateState(state));
  const changes = [
    value => { value.unitProgress[course].mastery = 'fake'; },
    value => { value.unitProgress[course].createdAt = '2026-09-01'; },
    value => { value.unitProgress[course2].startedAt = 'not-a-date'; },
    value => { value.unitProgress[course2].completedAt = '2026-09-01T00:00:00.000Z'; },
    value => { value.unitProgress[course].completed = true; value.unitProgress[course].completedAt = null; },
    value => { value.unitProgress[course].optionalIncluded = 1; },
    value => { value.unitProgress[course].hidden = 'false'; },
    value => { value.unitProgress[course].linkedTaskId = 'nonexistent-manual-task'; },
    value => { value.unitProgress[course2].linkedTaskId = manual.id; }
  ];
  for (const change of changes) {
    const invalidState = clone(state);
    change(invalidState);
    assert.throws(() => C.validateState(invalidState));
  }
  assert.doesNotThrow(() => C.validateState(state), 'failed validation does not mutate the valid original');
});

test('MC27 — catalog confidence accepts only documented levels and rejects invented academic verification', () => {
  invalid(value => { value.modules[0].sections.cours[0].units[0].confidence = 'officially_verified'; });
  invalid(value => { value.modules[0].sections.cours[0].source_confidence = 'officially_verified'; });
  invalid(value => { value.modules[0].sections.cours[0].units[0].confidence = ''; });
  invalid(value => { value.modules[0].sections.cours[0].source_confidence = null; });
  assert.doesNotThrow(() => P.validateCatalog(raw), 'every confidence value in the supplied catalog remains supported');
});

test('MC28 — mutations reject chapter or TD parent IDs before creating any leaf progress record', () => {
  const state = C.createState();
  const before = JSON.stringify(state);
  for (const parentId of ['analyse1-c01', 'analyse1-td01']) {
    const mutations = [
      () => P.toggleCatalog(state, parentId, true),
      () => P.startUnit(state, parentId),
      () => P.setMastery(state, parentId, 'mastered'),
      () => P.includeOptional(state, parentId, true),
      () => P.editCatalogTitle(state, parentId, 'Titre personnel'),
      () => P.hideCatalog(state, parentId, true),
      () => P.unlinkCatalogTask(state, catalog, parentId)
    ];
    for (const mutation of mutations) {
      assert.throws(mutation);
      assert.equal(JSON.stringify(state), before, 'a rejected parent action leaves all progress unchanged');
    }
  }
});

test('MC29 — hidden legacy parent keeps its leaves excluded until restoration without losing old titles or child progress', () => {
  const state = C.createState();
  P.toggleCatalog(state, course, true);
  const savedLeaf = clone(state.unitProgress[course]);
  const parentHistory = {
    completed: true, createdAt: savedLeaf.createdAt, completedAt: savedLeaf.completedAt,
    hidden: true, titleOverride: 'Ancien titre personnel à conserver', linkedTaskId: null
  };
  state.curriculumProgress['a1-cours-01'] = parentHistory;
  const group = P.getItem(catalog, 'analyse1-c01');
  const hiddenTasks = allTasks(state);
  assert.equal(hiddenTasks.some(task => task.groupId === group.id), false);
  assert.equal(total(state).total, 437 - group.units.length);
  assert.equal(total(state).completed, 0);
  assert.equal(P.nextMission(state, catalog).groupId === group.id, false);
  assert.deepEqual(state.unitProgress[course], savedLeaf, 'hiding a historical parent preserves existing child progress');
  assert.equal(parentHistory.titleOverride, 'Ancien titre personnel à conserver');
  parentHistory.hidden = false;
  const restored = allTasks(state).filter(task => task.groupId === group.id);
  assert.equal(restored.length, group.units.length);
  assert.equal(total(state).total, 437);
  assert.equal(total(state).completed, 1);
  assert.equal(restored.filter(task => task.completed).length, 1, 'restoring a completed parent never auto-completes its remaining children');
  assert.equal(taskOf(state, course).title, P.getItem(catalog, course).title);
  assert.equal(parentHistory.titleOverride, 'Ancien titre personnel à conserver');
  assert.deepEqual(state.unitProgress[course], savedLeaf);
  assert.doesNotThrow(() => C.validateState(state));
});

test('MC30 — identical manual and academic ID text never conflates their independent namespaces', () => {
  const state=C.createState();
  const task=C.addTask(state,'analyse1','cours','Mission personnelle distincte');
  task.id='analyse1-c01-u01';
  C.toggleTask(state,'analyse1','cours',task.id,true);
  const projected=P.projectState(state,catalog);
  assert.equal(C.semesterStats(projected).total,438);
  assert.equal(C.semesterStats(projected).completed,1);
});

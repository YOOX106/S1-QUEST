'use strict';

// Run with: node --test tests/core.test.cjs
// No test dependency or build step is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require(process.env.S1QUEST_CORE_PATH || '../script.js');

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
    this.failReads = false;
    this.failWrites = false;
  }
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index] ?? null; }
  getItem(key) {
    if (this.failReads) throw new Error('Storage access denied');
    return this.entries.get(String(key)) ?? null;
  }
  setItem(key, value) {
    if (this.failWrites) {
      const error = new Error('Storage quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.entries.set(String(key), String(value));
  }
  removeItem(key) { this.entries.delete(String(key)); }
}

const expectedModules = [
  ['analyse1', ['cours', 'td']],
  ['algebre1', ['cours', 'td']],
  ['algebre2', ['cours', 'td']],
  ['thermodynamique', ['cours', 'td']],
  ['mecanique', ['cours', 'td']],
  ['informatique1', ['cours', 'td', 'tp']],
  ['methodologie', ['cours']]
];
const moduleOf = (state, id) => state.modules.find(module => module.id === id);
const tasksOf = (state, id, section) => moduleOf(state, id).sections[section];

function addTasks(state, id, section, total, completed = 0) {
  for (let index = 0; index < total; index++) {
    const task = core.addTask(state, id, section, `Chapitre ${index + 1}`);
    if (index < completed) core.toggleTask(state, id, section, task.id, true);
  }
}

function savedFixture() {
  const state = core.createState();
  addTasks(state, 'analyse1', 'cours', 2, 1);
  return { state, raw: JSON.stringify(state) };
}

test('T01–T05 — official seven modules, fixed order, exact sections, no invented tasks', () => {
  const state = core.createState();
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.profile.nickname, 'AMINE');
  assert.deepEqual(state.modules.map(module => module.id), expectedModules.map(([id]) => id));
  for (const [id, sections] of expectedModules) {
    const module = moduleOf(state, id);
    assert.deepEqual(Object.keys(module.sections), sections);
    for (const section of sections) assert.deepEqual(module.sections[section], []);
  }
  assert.doesNotThrow(() => core.validateState(state));
});

test('T06–T07 — empty sections/modules/semester have no fictitious percentage or completion', () => {
  const state = core.createState();
  for (const result of [core.stats([]), core.moduleStats(state.modules[0]), core.semesterStats(state)]) {
    assert.equal(result.total, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.progress, null);
    assert.equal(result.progressHundredths, null);
    assert.equal(result.remainingHundredths, null);
  }
  assert.equal(core.formatPercent(null), 'À configurer');
  assert.equal(core.semesterStats(state).fullyCompleted, false);
  assert.equal(core.semesterStats(state).configuredModules, 0);
});

test('T08–T11 — module progress weights Cours 4/10 and TD 2/20 as 6/30 = 20%', () => {
  const state = core.createState();
  addTasks(state, 'analyse1', 'cours', 10, 4);
  addTasks(state, 'analyse1', 'td', 20, 2);
  const result = core.moduleStats(moduleOf(state, 'analyse1'));
  assert.equal(result.sections.cours.total, 10);
  assert.equal(result.sections.cours.completed, 4);
  assert.equal(result.sections.cours.progress, 40);
  assert.equal(result.sections.td.total, 20);
  assert.equal(result.sections.td.completed, 2);
  assert.equal(result.sections.td.progress, 10);
  assert.equal(result.total, 30);
  assert.equal(result.completed, 6);
  assert.equal(result.remaining, 24);
  assert.equal(result.progress, 20);
  assert.equal(result.progressHundredths, 2000);
  assert.equal(result.remainingHundredths, 8000);
});

test('T10 — computing TP progress does not count absent or empty Cours/TD', () => {
  const state = core.createState();
  addTasks(state, 'informatique1', 'tp', 3, 2);
  const result = core.moduleStats(moduleOf(state, 'informatique1'));
  assert.equal(result.total, 3);
  assert.equal(result.completed, 2);
  assert.equal(result.sections.tp.progressHundredths, 6667);
  assert.equal(result.sections.cours.progress, null);
  assert.equal(result.sections.td.progress, null);
  assert.equal(result.fullyConfigured, false);
});

test('T12 — semester progress weights all configured tasks instead of averaging modules', () => {
  const state = core.createState();
  addTasks(state, 'analyse1', 'cours', 10, 1);
  addTasks(state, 'methodologie', 'cours', 1, 1);
  const result = core.semesterStats(state);
  assert.equal(result.total, 11);
  assert.equal(result.completed, 2);
  assert.equal(result.remaining, 9);
  assert.equal(result.progress, 2 / 11 * 100);
  assert.equal(result.progressHundredths, 1818);
  assert.equal(result.configuredModules, 2);
  assert.equal(result.totalModules, 7);
  assert.equal(result.fullyCompleted, false);
});

test('T07 — 100% configured tasks does not claim a complete module or semester without every section', () => {
  const state = core.createState();
  addTasks(state, 'analyse1', 'cours', 1, 1);
  assert.equal(core.moduleStats(state.modules[0]).progress, 100);
  assert.equal(core.moduleStats(state.modules[0]).fullyCompleted, false);
  assert.equal(core.semesterStats(state).fullyCompleted, false);
  for (const [id, sections] of expectedModules) {
    for (const section of sections) {
      if (!tasksOf(state, id, section).length) addTasks(state, id, section, 1, 1);
    }
  }
  assert.equal(core.semesterStats(state).fullyConfigured, true);
  assert.equal(core.semesterStats(state).fullyCompleted, true);
  const task = tasksOf(state, 'informatique1', 'tp')[0];
  core.toggleTask(state, 'informatique1', 'tp', task.id, false);
  assert.equal(core.semesterStats(state).fullyCompleted, false);
});

test('T13 — French formatting and displayed complements always add to exactly 100%', () => {
  assert.equal(core.formatPercent(4000), '40 %');
  assert.equal(core.formatPercent(3333), '33,33 %');
  assert.equal(core.formatPercent(6670), '66,7 %');
  for (let total = 1; total <= 103; total++) {
    for (let completed = 0; completed <= total; completed++) {
      const result = core.stats(Array.from({ length: total }, (_, i) => ({ completed: i < completed })));
      assert.equal(result.progressHundredths + result.remainingHundredths, 10000);
      assert.equal(result.progressHundredths, Math.round(completed / total * 10000));
    }
  }
});

test('T14 — IDs persist across reload and are not reused after deletion', () => {
  const state = core.createState();
  const first = core.addTask(state, 'analyse1', 'cours', 'Limites');
  const firstId = first.id;
  core.deleteTask(state, 'analyse1', 'cours', first.id);
  const reloaded = JSON.parse(JSON.stringify(state));
  const second = core.addTask(reloaded, 'analyse1', 'cours', 'Continuité');
  assert.notEqual(second.id, firstId);
  assert.equal(tasksOf(reloaded, 'analyse1', 'cours')[0].id, second.id);
  assert.doesNotThrow(() => core.validateState(reloaded));
});

test('T15 — titles are trimmed, reject blank/too long values, and preserve hostile input as inert text', () => {
  const state = core.createState();
  const task = core.addTask(state, 'analyse1', 'cours', '  Une vraie leçon  ');
  assert.equal(task.title, 'Une vraie leçon');
  const before = core.moduleStats(state.modules[0]);
  const hostile = '<img src=x onerror="globalThis.INJECTED=true">';
  core.editTask(state, 'analyse1', 'cours', task.id, hostile);
  assert.equal(task.title, hostile);
  assert.equal(core.moduleStats(state.modules[0]).progress, before.progress);
  assert.equal(JSON.parse(JSON.stringify(state)).modules[0].sections.cours[0].title, hostile);
  assert.throws(() => core.addTask(state, 'analyse1', 'cours', '   '));
  assert.throws(() => core.editTask(state, 'analyse1', 'cours', task.id, 'a'.repeat(121)));
  assert.equal(task.title, hostile, 'invalid edit must not damage previous title');
});

test('T14 — forbidden sections, unknown modules and unknown task IDs cannot mutate state', () => {
  const state = core.createState();
  const before = JSON.stringify(state);
  assert.throws(() => core.addTask(state, 'analyse1', 'tp', 'Interdit'));
  assert.throws(() => core.addTask(state, 'inconnu', 'cours', 'Interdit'));
  assert.throws(() => core.toggleTask(state, 'analyse1', 'cours', 'missing-id', true));
  assert.equal(JSON.stringify(state), before);
});

test('T16–T17 — toggle dates and deletion remain tied to the selected task only', () => {
  const state = core.createState();
  const first = core.addTask(state, 'analyse1', 'cours', 'Limites');
  const second = core.addTask(state, 'analyse1', 'cours', 'Continuité');
  const createdAt = first.createdAt;
  assert.equal(first.completed, false);
  assert.equal(first.completedAt, null);
  assert.ok(Number.isFinite(Date.parse(first.createdAt)));
  core.toggleTask(state, 'analyse1', 'cours', first.id, true);
  assert.equal(first.completed, true);
  assert.ok(Number.isFinite(Date.parse(first.completedAt)));
  assert.equal(core.moduleStats(state.modules[0]).completed, 1);
  core.toggleTask(state, 'analyse1', 'cours', first.id, false);
  assert.equal(first.completedAt, null);
  assert.equal(first.createdAt, createdAt);
  core.deleteTask(state, 'analyse1', 'cours', first.id);
  assert.deepEqual(tasksOf(state, 'analyse1', 'cours').map(task => task.id), [second.id]);
  assert.equal(core.moduleStats(state.modules[0]).completed, 0);
});

test('T18–T19 — storage roundtrip preserves tasks, dates, IDs, profile and fixed module routes', () => {
  const storage = new MemoryStorage();
  const firstStore = new core.Store(storage);
  const { state } = firstStore.load();
  addTasks(state, 'analyse1', 'cours', 2, 1);
  core.setProfile(state, '  AMINE S1  ');
  const color = core.PALETTE[1].value;
  core.customizeModule(state, 'analyse1', { name: 'Analyse personnalisée', emoji: '📐', color });
  assert.equal(firstStore.save(state).ok, true);
  const loaded = new core.Store(storage).load();
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.state.profile.nickname, 'AMINE S1');
  assert.equal(loaded.state.modules[0].id, 'analyse1');
  assert.equal(loaded.state.modules[0].name, 'Analyse personnalisée');
  assert.equal(loaded.state.modules[0].color, color);
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(core.STORAGE_KEY)), 'progress'), false);
});

test('T19 — invalid customization cannot remove modules, sections or readable colors', () => {
  const state = core.createState();
  assert.throws(() => core.setProfile(state, '  '));
  assert.throws(() => core.customizeModule(state, 'analyse1', { name: '', emoji: '📐', color: core.PALETTE[0].value }));
  assert.throws(() => core.customizeModule(state, 'analyse1', { name: 'Analyse', emoji: '📐', color: '#000000' }));
  assert.doesNotThrow(() => core.validateState(state));
  assert.deepEqual(Object.keys(state.modules[0].sections), ['cours', 'td']);
});

test('T23 — empty storage loads safely and leaves unrelated application data intact', () => {
  const storage = new MemoryStorage({ 'declic-revisions-v1': '{"kept":true}' });
  const store = new core.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'new');
  assert.equal(result.state.modules.length, 7);
  assert.equal(store.save(result.state).ok, true);
  assert.equal(storage.getItem('declic-revisions-v1'), '{"kept":true}');
});

test('T23 — malformed JSON is protected verbatim against automatic overwrite', () => {
  const raw = '{"schemaVersion":1,"modules":broken';
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'corrupt');
  assert.equal(store.blocked, true);
  const save = store.save(result.state);
  assert.equal(save.ok, false);
  assert.equal(storage.getItem(core.STORAGE_KEY), raw);
  assert.equal(store.raw().raw, raw);
});

test('T23 — valid JSON with invalid structure does not replace recoverable user data', () => {
  const raw = JSON.stringify({ schemaVersion: 1, modules: [] });
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'corrupt');
  assert.equal(store.save(result.state).ok, false);
  assert.equal(storage.getItem(core.STORAGE_KEY), raw);
});

test('T23 — future schema is not migrated down or overwritten', () => {
  const raw = JSON.stringify({ schemaVersion: 999, future: 'user data' });
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'unsupported');
  assert.equal(store.save(result.state).ok, false);
  assert.equal(storage.getItem(core.STORAGE_KEY), raw);
});

test('T23 — unavailable reads do not claim data was loaded or saved', () => {
  const storage = new MemoryStorage();
  storage.failReads = true;
  const store = new core.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.state.modules.length, 7);
  const task = core.addTask(result.state, 'analyse1', 'cours', 'En mémoire');
  assert.equal(store.save(result.state).ok, false);
  assert.equal(tasksOf(result.state, 'analyse1', 'cours')[0].id, task.id);
});

test('T23 — quota failure preserves persisted raw and latest edits in memory', () => {
  const { raw } = savedFixture();
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  const result = store.load();
  const task = core.addTask(result.state, 'analyse1', 'cours', 'Nouveau chapitre');
  storage.failWrites = true;
  const save = store.save(result.state);
  assert.equal(save.ok, false);
  assert.notEqual(save.status, 'saved');
  assert.equal(storage.getItem(core.STORAGE_KEY), raw);
  assert.equal(tasksOf(result.state, 'analyse1', 'cours').at(-1).id, task.id);
  storage.failWrites = false;
  assert.equal(store.save(result.state).ok, true, 'retry after quota recovery should save in-memory edits');
});

test('T23 — a concurrent tab cannot silently overwrite newer stored state', () => {
  const { raw } = savedFixture();
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const first = new core.Store(storage);
  const second = new core.Store(storage);
  const stateA = first.load().state;
  const stateB = second.load().state;
  core.addTask(stateA, 'analyse1', 'cours', 'Modification A');
  assert.equal(first.save(stateA).ok, true);
  const updatedRaw = storage.getItem(core.STORAGE_KEY);
  core.addTask(stateB, 'analyse1', 'cours', 'Modification B');
  const staleWrite = second.save(stateB);
  assert.equal(staleWrite.ok, false);
  assert.equal(staleWrite.status, 'conflict');
  assert.equal(storage.getItem(core.STORAGE_KEY), updatedRaw);
  assert.equal(tasksOf(stateB, 'analyse1', 'cours').at(-1).title, 'Modification B');
});

test('E02 — explicit reset backs up original data and restores seven empty modules', () => {
  const { raw } = savedFixture();
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw, unrelated: 'keep' });
  const store = new core.Store(storage);
  store.load();
  const result = store.reset();
  assert.equal(result.ok, true);
  const backups = [...storage.entries].filter(([key]) => key.startsWith(core.BACKUP_PREFIX));
  assert.ok(backups.some(([, value]) => value === raw), 'a verbatim backup must exist before replacement');
  const resetState = JSON.parse(storage.getItem(core.STORAGE_KEY));
  assert.equal(core.semesterStats(resetState).total, 0);
  assert.equal(resetState.modules.length, 7);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('E02 — reset refuses replacement when a backup cannot be stored', () => {
  const { raw } = savedFixture();
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  store.load();
  storage.failWrites = true;
  const result = store.reset();
  assert.equal(result.ok, false);
  assert.equal(storage.getItem(core.STORAGE_KEY), raw);
});

test('T23 — validation rejects duplicate IDs, invalid dates and unsupported section shapes', () => {
  const { state } = savedFixture();
  const duplicate = structuredClone(state);
  duplicate.modules[0].sections.cours[1].id = duplicate.modules[0].sections.cours[0].id;
  assert.throws(() => core.validateState(duplicate));
  const invalidDate = structuredClone(state);
  invalidDate.modules[0].sections.cours[0].createdAt = 'not-a-date';
  assert.throws(() => core.validateState(invalidDate));
  const unsupported = structuredClone(state);
  unsupported.modules[0].sections.tp = [];
  assert.throws(() => core.validateState(unsupported));
  const inconsistent = structuredClone(state);
  inconsistent.modules[0].sections.cours[0].completed = false;
  assert.throws(() => core.validateState(inconsistent));
});

test('E02 — reset preserves an external update made while its backup was written', () => {
  const { raw } = savedFixture();
  const newer = core.createState();
  core.setProfile(newer, 'Autre onglet');
  const newerRaw = JSON.stringify(newer);
  const storage = new MemoryStorage({ [core.STORAGE_KEY]: raw });
  const store = new core.Store(storage);
  store.load();
  const nativeSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    nativeSet(key, value);
    if (key.startsWith(core.BACKUP_PREFIX)) nativeSet(core.STORAGE_KEY, newerRaw);
  };
  const result = store.reset();
  assert.equal(result.ok, false);
  assert.equal(result.status, 'conflict');
  assert.equal(storage.getItem(core.STORAGE_KEY), newerRaw);
});

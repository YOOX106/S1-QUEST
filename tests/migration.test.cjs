'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require(process.env.S1QUEST_CORE_PATH || '../script.js');

class Storage {
  constructor(raw) {
    this.entries = new Map(raw === undefined ? [] : [[C.STORAGE_KEY, raw]]);
    this.events = [];
  }
  getItem(key) {
    const result = this.entries.get(key) ?? null;
    this.events.push(['read', key, result]);
    return result;
  }
  setItem(key, value) {
    this.events.push(['write', key, String(value)]);
    this.entries.set(key, String(value));
  }
}

function legacyFixture() {
  const state = C.createState();
  for (const [index, module] of state.modules.entries()) {
    C.customizeModule(state, module.id, {
      name: 'Mon module ' + index,
      emoji: '📐',
      color: C.PALETTE[index].value
    });
    for (const section of Object.keys(module.sections)) {
      const task = C.addTask(state, module.id, section, 'Travail réel ' + index + ' ' + section);
      task.createdAt = '2026-09-01T10:20:30.000Z';
      if (index % 2 === 0) {
        C.toggleTask(state, module.id, section, task.id, true);
        task.completedAt = '2026-09-03T11:22:33.000Z';
      }
    }
  }
  C.setProfile(state, 'MON PSEUDO EXISTANT');
  state.schemaVersion = 1;
  delete state.curriculumProgress;
  delete state.unitProgress;
  C.validateLegacyState(state);
  return state;
}

const backups = storage => [...storage.entries].filter(([key]) => key.startsWith(C.BACKUP_PREFIX));

test('M01 — pure v1→v3 conversion preserves every old field and does not mutate its source', () => {
  const legacy = legacyFixture();
  const before = JSON.stringify(legacy);
  const migrated = C.migrateState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.curriculumProgress, {});
  const comparison = structuredClone(migrated);
  comparison.schemaVersion = 1;
  delete comparison.curriculumProgress;
  delete comparison.unitProgress;
  assert.deepEqual(comparison, legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.doesNotThrow(() => C.validateState(migrated));
});

test('M02 — a verified verbatim v1 backup precedes persisted migration and reload is idempotent', () => {
  const original = JSON.stringify(legacyFixture());
  const storage = new Storage(original);
  storage.entries.set('another-app', 'keep-me');
  const store = new C.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'loaded');
  assert.equal(result.migration, true);
  const backup = backups(storage).find(([, value]) => value === original);
  assert.ok(backup);
  const writeIndex = storage.events.findIndex(([op, key]) => op === 'write' && key === C.STORAGE_KEY);
  const verifyIndex = storage.events.findIndex(([op, key, value]) => op === 'read' && key === backup[0] && value === original);
  assert.ok(verifyIndex >= 0 && verifyIndex < writeIndex, 'backup must be read and verified before replacement');
  const persisted = storage.getItem(C.STORAGE_KEY);
  assert.deepEqual(JSON.parse(persisted), result.state);
  const count = backups(storage).length;
  for (let index = 0; index < 3; index++) {
    const next = new C.Store(storage).load();
    assert.equal(next.status, 'loaded');
    assert.deepEqual(next.state, result.state);
    assert.equal(storage.getItem(C.STORAGE_KEY), persisted);
  }
  assert.equal(backups(storage).length, count);
  assert.equal(storage.getItem('another-app'), 'keep-me');
});

test('M03 — a quota failure writing the migration backup leaves v1 intact and edits exportable in memory', () => {
  const original = JSON.stringify(legacyFixture());
  const storage = new Storage(original);
  storage.setItem = () => { throw new Error('Quota full'); };
  const store = new C.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'migration-pending');
  assert.equal(result.state.schemaVersion, 3);
  assert.equal(store.blocked, true);
  const task = C.addTask(result.state, 'analyse1', 'cours', 'Progression en mémoire');
  assert.equal(store.save(result.state).ok, false);
  assert.ok(result.state.modules[0].sections.cours.some(item => item.id === task.id));
  assert.doesNotThrow(() => C.validateState(JSON.parse(JSON.stringify(result.state))));
  assert.equal(storage.getItem(C.STORAGE_KEY), original);
});

test('M04 — a backup whose reread differs is rejected before any replacement', () => {
  const original = JSON.stringify(legacyFixture());
  const storage = new Storage(original);
  const nativeGet = storage.getItem.bind(storage);
  storage.getItem = key => key.startsWith(C.BACKUP_PREFIX) && storage.entries.has(key) ? 'damaged' : nativeGet(key);
  const result = new C.Store(storage).load();
  assert.equal(result.status, 'migration-pending');
  assert.equal(storage.getItem(C.STORAGE_KEY), original);
  assert.equal(storage.events.some(([op, key]) => op === 'write' && key === C.STORAGE_KEY), false);
});

test('M05 — a failed migrated write preserves v1 plus its verified backup', () => {
  const original = JSON.stringify(legacyFixture());
  const storage = new Storage(original);
  const nativeSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === C.STORAGE_KEY) throw new Error('Quota exhausted after backup');
    nativeSet(key, value);
  };
  const store = new C.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'migration-pending');
  assert.equal(store.save(result.state).ok, false);
  assert.equal(storage.getItem(C.STORAGE_KEY), original);
  assert.ok(backups(storage).some(([, value]) => value === original));
});

test('M06 — migration preserves an external update occurring during backup', () => {
  const original = JSON.stringify(legacyFixture());
  const newer = C.createState();
  C.setProfile(newer, 'AUTRE ONGLET');
  const external = JSON.stringify(newer);
  const storage = new Storage(original);
  const nativeSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    nativeSet(key, value);
    if (key.startsWith(C.BACKUP_PREFIX)) nativeSet(C.STORAGE_KEY, external);
  };
  const store = new C.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'conflict');
  assert.equal(store.save(result.state).ok, false);
  assert.equal(storage.getItem(C.STORAGE_KEY), external);
  assert.ok(backups(storage).some(([, value]) => value === original));
});

test('M07 — invalid v1 and future schemas remain unchanged and protected', () => {
  const broken = legacyFixture();
  broken.modules[0].sections.cours[0].completedAt = 'invalid';
  for (const [value, status] of [[broken, 'corrupt'], [{ schemaVersion: 999, payload: 'future-data' }, 'unsupported']]) {
    const original = JSON.stringify(value);
    const storage = new Storage(original);
    const store = new C.Store(storage);
    const result = store.load();
    assert.equal(result.status, status);
    assert.equal(store.save(result.state).ok, false);
    assert.equal(storage.getItem(C.STORAGE_KEY), original);
    assert.ok(backups(storage).some(([, backup]) => backup === original));
  }
});

test('M08 — unverifiable post-write migration blocks subsequent writes and retains original backup', () => {
  const original = JSON.stringify(legacyFixture());
  const storage = new Storage(original);
  const nativeGet = storage.getItem.bind(storage);
  const nativeSet = storage.setItem.bind(storage);
  let replaced = false;
  storage.setItem = (key, value) => {
    nativeSet(key, value);
    if (key === C.STORAGE_KEY) replaced = true;
  };
  storage.getItem = key => {
    if (key === C.STORAGE_KEY && replaced) throw new Error('Cannot verify write');
    return nativeGet(key);
  };
  const store = new C.Store(storage);
  const result = store.load();
  assert.equal(result.status, 'migration-pending');
  assert.equal(store.save(result.state).ok, false);
  assert.ok(backups(storage).some(([, backup]) => backup === original));
});

test('M09 — invalid academic progress cannot bypass state validation', () => {
  const valid = C.createState();
  const record = {
    completed: true,
    hidden: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    completedAt: '2026-10-01T11:00:00.000Z',
    titleOverride: null,
    linkedTaskId: null
  };
  valid.curriculumProgress['a1-cours-01'] = record;
  assert.doesNotThrow(() => C.validateState(valid));
  for (const replacement of [null, { ...record, completedAt: null }, { ...record, linkedTaskId: 'missing-task' }, { ...record, hidden: 'yes' }]) {
    const damaged = structuredClone(valid);
    damaged.curriculumProgress['a1-cours-01'] = replacement;
    assert.throws(() => C.validateState(damaged));
  }
});

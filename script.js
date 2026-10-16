(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.S1QuestCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 3;
  const STORAGE_KEY = 's1quest_data';
  const BACKUP_PREFIX = 's1quest_backup_';
  const PALETTE = Object.freeze([
    { value: '#a78bfa', label: 'Violet' },
    { value: '#22d3ee', label: 'Cyan' },
    { value: '#fbbf24', label: 'Or' },
    { value: '#fb923c', label: 'Orange' },
    { value: '#34d399', label: 'Émeraude' },
    { value: '#60a5fa', label: 'Bleu' },
    { value: '#f472b6', label: 'Rose' }
  ].map(Object.freeze));
  const MODULES = Object.freeze([
    { id: 'analyse1', name: 'Analyse 1', emoji: '📈', color: '#a78bfa', sections: ['cours', 'td'] },
    { id: 'algebre1', name: 'Algèbre 1', emoji: '🧮', color: '#22d3ee', sections: ['cours', 'td'] },
    { id: 'algebre2', name: 'Algèbre 2', emoji: '🔷', color: '#60a5fa', sections: ['cours', 'td'] },
    { id: 'thermodynamique', name: 'Thermodynamique', emoji: '🔥', color: '#fb923c', sections: ['cours', 'td'] },
    { id: 'mecanique', name: 'Mécanique du point', emoji: '🪐', color: '#fbbf24', sections: ['cours', 'td'] },
    { id: 'informatique1', name: 'Informatique 1 : Algorithmique / Python', emoji: '💻', color: '#34d399', sections: ['cours', 'td', 'tp'] },
    { id: 'methodologie', name: 'Méthodologie de Travail Universitaire', emoji: '🧭', color: '#f472b6', sections: ['cours'] }
  ].map(definition => Object.freeze({ ...definition, sections: Object.freeze(definition.sections) })));

  let namespaceSequence = 0;
  function uuid() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
    } catch (_) { /* A persistent namespace and counter remain available. */ }
    return null;
  }

  function newNamespace() {
    namespaceSequence += 1;
    return uuid() || [Date.now().toString(36), namespaceSequence.toString(36),
      Math.random().toString(36).slice(2), Math.random().toString(36).slice(2)].join('-');
  }

  function createState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      profile: { nickname: 'AMINE' },
      curriculumProgress: {},
      unitProgress: {},
      idCounter: 0,
      idNamespace: newNamespace(),
      modules: MODULES.map(definition => ({
        id: definition.id,
        name: definition.name,
        emoji: definition.emoji,
        color: definition.color,
        sections: Object.fromEntries(definition.sections.map(section => [section, []]))
      }))
    };
  }

  function stats(tasks) {
    if (!Array.isArray(tasks)) throw new Error('La liste des tâches est invalide.');
    const unique = [...new Map(tasks.map((task, index) => [task.curriculumId ? 'catalog:'+task.curriculumId : task.id ? 'manual:'+task.id : 'position:'+index, task])).values()];
    const required = unique.filter(task => !task.optional && !task.legacyOnly);
    const bonus = unique.filter(task => task.isBonus);
    const total = required.length;
    const completed = required.reduce((sum, task) => sum + (task.completed === true ? 1 : 0), 0);
    const progressHundredths = total ? Math.round(completed * 10000 / total) : null;
    return {
      total,
      completed,
      bonusTotal: bonus.length,
      bonusCompleted: bonus.filter(task => task.completed).length,
      remaining: total - completed,
      progress: total ? completed / total * 100 : null,
      progressHundredths,
      remainingHundredths: total ? 10000 - progressHundredths : null
    };
  }

  function moduleStats(module) {
    const sections = Object.fromEntries(Object.entries(module.sections)
      .map(([name, tasks]) => [name, stats(tasks)]));
    const result = stats(Object.values(module.sections).flat());
    const fullyConfigured = Object.values(sections).length > 0 &&
      Object.values(sections).every(section => section.total > 0);
    return {
      ...result,
      sections,
      configured: result.total > 0,
      fullyConfigured,
      fullyCompleted: fullyConfigured && result.completed === result.total
    };
  }

  function semesterStats(state) {
    const modules = state.modules.map(moduleStats);
    const result = stats(state.modules.flatMap(module => Object.values(module.sections).flat()));
    const fullyConfigured = state.modules.length === MODULES.length &&
      modules.every(module => module.fullyConfigured);
    return {
      ...result,
      configuredModules: modules.filter(module => module.configured).length,
      totalModules: MODULES.length,
      fullyConfigured,
      fullyCompleted: fullyConfigured && result.completed === result.total
    };
  }

  function formatPercent(hundredths) {
    if (hundredths === null) return 'À configurer';
    if (!Number.isInteger(hundredths) || hundredths < 0 || hundredths > 10000) {
      throw new Error('Le pourcentage affiché est invalide.');
    }
    const fraction = String(hundredths % 100).padStart(2, '0').replace(/0+$/, '');
    return Math.floor(hundredths / 100) + (fraction ? ',' + fraction : '') + ' %';
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value, limit, label) {
    if (typeof value !== 'string') throw new Error(label + ' doit être un texte.');
    const trimmed = value.trim();
    if (!trimmed.length || trimmed.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
      throw new Error(label + ' doit contenir de 1 à ' + limit + ' caractères valides.');
    }
    return trimmed;
  }

  function emojiText(value) {
    if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 12 ||
      /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('L’icône doit contenir de 1 à 12 caractères sans retour à la ligne.');
    }
    return value.trim();
  }

  function validDate(value) {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }

  function validateCommonState(state, version) {
    if (!isObject(state)) throw new Error('Les données enregistrées ne sont pas un objet valide.');
    if (state.schemaVersion !== version) throw new Error('Version de sauvegarde non prise en charge.');
    if (!isObject(state.profile) || text(state.profile.nickname, 40, 'Le pseudo') !== state.profile.nickname) {
      throw new Error('Le profil enregistré est invalide.');
    }
    if (!Number.isSafeInteger(state.idCounter) || state.idCounter < 0) {
      throw new Error('Le compteur des identifiants est invalide.');
    }
    if (typeof state.idNamespace !== 'string' || !/^[a-zA-Z0-9-]{1,180}$/.test(state.idNamespace)) {
      throw new Error('L’espace des identifiants est invalide.');
    }
    if (!Array.isArray(state.modules) || state.modules.length !== MODULES.length) {
      throw new Error('La sauvegarde doit contenir exactement les sept modules obligatoires.');
    }
    const ids = new Set();
    state.modules.forEach((module, index) => {
      const definition = MODULES[index];
      if (!isObject(module) || module.id !== definition.id) {
        throw new Error('Les identifiants et l’ordre des modules doivent rester fixes.');
      }
      if (text(module.name, 100, 'Le nom du module') !== module.name || emojiText(module.emoji) !== module.emoji ||
        !PALETTE.some(color => color.value === module.color)) {
        throw new Error('La personnalisation du module ' + definition.name + ' est invalide.');
      }
      if (!isObject(module.sections) || Object.keys(module.sections).length !== definition.sections.length ||
        !definition.sections.every(section => Object.hasOwn(module.sections, section) && Array.isArray(module.sections[section]))) {
        throw new Error('Les sections du module ' + definition.name + ' sont invalides.');
      }
      definition.sections.forEach(section => module.sections[section].forEach(task => {
        if (!isObject(task) || typeof task.id !== 'string' || !/^[a-zA-Z0-9-]{1,260}$/.test(task.id) || ids.has(task.id)) {
          throw new Error('Un identifiant de tâche est invalide ou dupliqué.');
        }
        ids.add(task.id);
        if (text(task.title, 120, 'Le titre') !== task.title || typeof task.completed !== 'boolean' ||
          !validDate(task.createdAt) || (task.completed ? !validDate(task.completedAt) : task.completedAt !== null)) {
          throw new Error('Les informations ou les dates d’une tâche sont invalides.');
        }
      }));
    });
    return state;
  }

  function validateLegacyState(state) {
    return validateCommonState(state, 1);
  }

  function validateV2(state, version = 2) {
    validateCommonState(state, version);
    if (!isObject(state.curriculumProgress)) throw new Error('La progression du catalogue est invalide.');
    const manualIds = new Set(state.modules.flatMap(module => Object.values(module.sections).flat()).map(task => task.id));
    const linkedIds = new Set();
    for (const [id, record] of Object.entries(state.curriculumProgress)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/.test(id) || !isObject(record) ||
        typeof record.completed !== 'boolean' || typeof record.hidden !== 'boolean' ||
        !validDate(record.createdAt) || (record.completed ? !validDate(record.completedAt) : record.completedAt !== null) ||
        !(record.titleOverride === null || (typeof record.titleOverride === 'string' && text(record.titleOverride, 120, 'Le titre') === record.titleOverride)) ||
        !(record.linkedTaskId === null || (typeof record.linkedTaskId === 'string' && manualIds.has(record.linkedTaskId)))) {
        throw new Error('Une progression du catalogue est invalide.');
      }
      if (record.linkedTaskId !== null) {
        if (linkedIds.has(record.linkedTaskId)) throw new Error('Une tâche personnelle ne peut être liée qu’une fois au catalogue.');
        linkedIds.add(record.linkedTaskId);
      }
    }
    return state;
  }

  function validateState(state) {
    validateV2(state, SCHEMA_VERSION);
    if (!isObject(state.unitProgress)) throw new Error('La progression des micro-missions est invalide.');
    const manualIds = new Set(state.modules.flatMap(m => Object.values(m.sections).flat()).map(t => t.id));
    const linkedIds = new Set();
    for (const [id, r] of Object.entries(state.unitProgress)) {
      if (!/^[a-z][a-z0-9-]{0,119}$/.test(id) || ['constructor','prototype'].includes(id) || !isObject(r) ||
        typeof r.completed !== 'boolean' || typeof r.hidden !== 'boolean' || typeof r.optionalIncluded !== 'boolean' ||
        !validDate(r.createdAt) || (r.completed ? !validDate(r.completedAt) : r.completedAt !== null) ||
        !(r.startedAt === null || validDate(r.startedAt)) || !['unknown','review','understood','mastered'].includes(r.mastery) ||
        !(r.titleOverride === null || (typeof r.titleOverride === 'string' && text(r.titleOverride,120,'Le titre') === r.titleOverride)) ||
        !(r.linkedTaskId === null || (typeof r.linkedTaskId === 'string' && manualIds.has(r.linkedTaskId)))) {
        throw new Error('Une progression de micro-mission est invalide.');
      }
      if (r.linkedTaskId !== null) {
        if (linkedIds.has(r.linkedTaskId)) throw new Error('Une tâche ne peut être associée à plusieurs micro-missions.');
        linkedIds.add(r.linkedTaskId);
      }
    }
    return state;
  }

  // Pure conversion. Older chapter validations remain historical: no child is completed implicitly.
  function migrateState(state) {
    if (!isObject(state)) throw new Error('La sauvegarde est invalide.');
    if (state.schemaVersion === SCHEMA_VERSION) return validateState(state);
    if (![1,2].includes(state.schemaVersion)) throw new Error('Aucune migration sûre n’est disponible pour cette version.');
    if (state.schemaVersion === 1) validateLegacyState(state); else validateV2(state);
    const migrated = JSON.parse(JSON.stringify(state));
    if (state.schemaVersion === 1) migrated.curriculumProgress = {};
    migrated.unitProgress = {};
    migrated.schemaVersion = SCHEMA_VERSION;
    return validateState(migrated);
  }

  function findModule(state, moduleId) {
    const module = state.modules.find(item => item.id === moduleId);
    if (!module) throw new Error('Module inconnu.');
    return module;
  }

  function findSection(state, moduleId, section) {
    const module = findModule(state, moduleId);
    if (!Object.hasOwn(module.sections, section) || !Array.isArray(module.sections[section])) {
      throw new Error('Cette section n’est pas autorisée pour ce module.');
    }
    return module.sections[section];
  }

  function findTask(state, moduleId, section, id) {
    const task = findSection(state, moduleId, section).find(item => item.id === id);
    if (!task) throw new Error('Tâche introuvable.');
    return task;
  }

  function addTask(state, moduleId, section, title) {
    const normalized = text(title, 120, 'Le titre');
    const tasks = findSection(state, moduleId, section);
    if (!Number.isSafeInteger(state.idCounter) || state.idCounter < 0) {
      throw new Error('Le compteur des identifiants a atteint sa limite.');
    }
    const usedIds = new Set(state.modules.flatMap(module => Object.values(module.sections).flat()).map(task => task.id));
    let counter = state.idCounter;
    let id;
    do {
      if (counter >= Number.MAX_SAFE_INTEGER) throw new Error('Le compteur des identifiants a atteint sa limite.');
      counter += 1;
      id = 'task-' + state.idNamespace + '-' + counter.toString(36);
    } while (usedIds.has(id));
    state.idCounter = counter;
    const task = {
      id,
      title: normalized,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    tasks.push(task);
    return task;
  }

  function editTask(state, moduleId, section, id, title) {
    const normalized = text(title, 120, 'Le titre');
    const task = findTask(state, moduleId, section, id);
    task.title = normalized;
    return task;
  }

  function toggleTask(state, moduleId, section, id, completed) {
    if (typeof completed !== 'boolean') throw new Error('L’état de validation est invalide.');
    const task = findTask(state, moduleId, section, id);
    if (task.completed !== completed) {
      task.completed = completed;
      task.completedAt = completed ? new Date().toISOString() : null;
    }
    return task;
  }

  function deleteTask(state, moduleId, section, id) {
    const tasks = findSection(state, moduleId, section);
    const index = tasks.findIndex(task => task.id === id);
    if (index < 0) throw new Error('Tâche introuvable.');
    const removed = tasks[index];
    for (const record of [...Object.values(state.curriculumProgress || {}), ...Object.values(state.unitProgress || {})]) {
      if (record.linkedTaskId === id) {
        record.linkedTaskId = null;
        record.completed = removed.completed;
        record.createdAt = removed.createdAt;
        record.completedAt = removed.completedAt;
      }
    }
    return tasks.splice(index, 1)[0];
  }

  function setProfile(state, nickname) {
    state.profile.nickname = text(nickname, 40, 'Le pseudo');
    return state.profile;
  }

  function customizeModule(state, moduleId, values) {
    const module = findModule(state, moduleId);
    if (!isObject(values)) throw new Error('La personnalisation est invalide.');
    const name = text(values.name === undefined ? module.name : values.name, 100, 'Le nom du module');
    const emoji = emojiText(values.emoji === undefined ? module.emoji : values.emoji);
    const color = values.color === undefined ? module.color : values.color;
    if (!PALETTE.some(item => item.value === color)) throw new Error('Choisis une couleur dans la palette proposée.');
    Object.assign(module, { name, emoji, color });
    return module;
  }

  class Store {
    constructor(storage) {
      this.storage = storage;
      this.lastRaw = undefined;
      this.loaded = false;
      this.blocked = false;
      this.blockReason = null;
      this.backupSequence = 0;
      this.backedUpRaw = undefined;
      this.lastBackupKey = null;
    }

    raw() {
      try {
        if (!this.storage || typeof this.storage.getItem !== 'function') throw new Error('Stockage indisponible');
        return { ok: true, raw: this.storage.getItem(STORAGE_KEY), status: 'read', message: '' };
      } catch (_) {
        return { ok: false, raw: null, status: 'unavailable', message: 'Le stockage local est inaccessible. Les changements restent uniquement en mémoire tant que cette page reste ouverte.' };
      }
    }

    backup(raw) {
      try {
        if (!this.storage || typeof this.storage.setItem !== 'function') throw new Error('Stockage indisponible');
        let key;
        do {
          this.backupSequence += 1;
          key = BACKUP_PREFIX + Date.now().toString(36) + '_' + this.backupSequence.toString(36);
        } while (this.storage.getItem(key) !== null);
        this.storage.setItem(key, raw);
        if (this.storage.getItem(key) !== raw) throw new Error('La copie de secours ne peut pas être vérifiée.');
        this.backedUpRaw = raw;
        this.lastBackupKey = key;
        return { ok: true, key };
      } catch (_) {
        return { ok: false, key: null };
      }
    }

    load() {
      const result = this.raw();
      this.loaded = true;
      if (!result.ok) {
        this.blocked = true;
        this.blockReason = 'unavailable';
        return { state: createState(), status: 'unavailable', message: result.message };
      }
      this.lastRaw = result.raw;
      this.blocked = false;
      this.blockReason = null;
      if (result.raw === null) return { state: createState(), status: 'new', message: 'Aucune sauvegarde locale pour le moment.' };
      let parsed;
      try { parsed = JSON.parse(result.raw); }
      catch (_) { return this.protect('corrupt', 'La sauvegarde contient un JSON illisible.'); }
      if (isObject(parsed) && typeof parsed.schemaVersion === 'number' && ![1, 2, SCHEMA_VERSION].includes(parsed.schemaVersion)) {
        return this.protect('unsupported', 'Cette sauvegarde utilise une version non prise en charge.');
      }
      let migrated;
      try { migrated = migrateState(parsed); }
      catch (error) { return this.protect('corrupt', 'La structure de la sauvegarde est invalide : ' + error.message); }
      if (parsed.schemaVersion === SCHEMA_VERSION) return { state: migrated, status: 'loaded', message: 'Sauvegarde locale chargée.' };
      const originalRaw = result.raw;
      const pending = message => {
        this.blocked = true;
        this.blockReason = 'migration-pending';
        return { state: migrated, status: 'migration-pending', migration: true, message: message + ' Les données originales restent protégées ; la version 3 est utilisable en mémoire. Exporte tes changements avant de fermer cette page.' };
      };
      if (!this.backup(originalRaw).ok) return pending('La copie de secours avant migration a échoué. La sauvegarde originale n’a pas été remplacée.');
      const beforeWrite = this.raw();
      if (!beforeWrite.ok) return pending('La sauvegarde ne peut pas être relue avant migration.');
      if (beforeWrite.raw !== originalRaw) {
        const conflict = this.conflict();
        return { ...conflict, state: migrated, migration: true };
      }
      const serialized = JSON.stringify(migrated);
      try {
        this.storage.setItem(STORAGE_KEY, serialized);
        const verification = this.raw();
        if (!verification.ok) return pending('L’écriture de la migration n’a pas pu être vérifiée. La copie brute originale est conservée.');
        if (verification.raw !== serialized) {
          const conflict = this.conflict();
          return { ...conflict, state: migrated, migration: true };
        }
        validateState(JSON.parse(verification.raw));
        this.lastRaw = serialized;
        return { state: migrated, status: 'loaded', migration: true, message: 'Sauvegarde migrée en version 3 ; copie brute originale vérifiée conservée.' };
      } catch (_) { return pending('La migration n’a pas pu être enregistrée. La copie brute originale est conservée.'); }
    }

    protect(reason, detail) {
      this.blocked = true;
      this.blockReason = reason;
      let copied = this.backedUpRaw === this.lastRaw;
      if (!copied) copied = this.backup(this.lastRaw).ok;
      return {
        state: createState(), status: reason,
        message: detail + ' Les données originales sont préservées ; l’enregistrement automatique est bloqué. ' +
          (copied ? 'Une copie brute de secours a été conservée.' : 'La copie de secours est indisponible ; la valeur originale reste intacte.') +
          ' Exporte la sauvegarde originale avant toute réinitialisation.'
      };
    }

    save(state) {
      if (!this.loaded) return { ok: false, status: 'protected', message: 'Charge les données existantes avant de tenter un enregistrement.' };
      if (this.blocked) return {
        ok: false, status: this.blockReason === 'unavailable' ? 'unavailable' : 'protected',
        message: 'Enregistrement bloqué pour préserver les données originales. Les changements restent en mémoire ; exporte-les avant de fermer cette page.'
      };
      let serialized;
      try { validateState(state); serialized = JSON.stringify(state); }
      catch (error) { return { ok: false, status: 'error', message: 'Sauvegarde refusée : ' + error.message }; }
      const current = this.raw();
      if (!current.ok) return { ok: false, status: 'unavailable', message: current.message };
      if (current.raw !== this.lastRaw) return this.conflict();
      try {
        this.storage.setItem(STORAGE_KEY, serialized);
        const verification = this.raw();
        if (!verification.ok) return { ok: false, status: 'unavailable', message: 'L’écriture n’a pas pu être vérifiée. Exporte tes données avant de fermer cette page.' };
        if (verification.raw !== serialized) return this.conflict();
        this.lastRaw = serialized;
        return { ok: true, status: 'saved', message: 'Sauvegardé dans ce navigateur.' };
      } catch (_) {
        return { ok: false, status: 'error', message: 'Échec de sauvegarde locale : stockage plein ou bloqué. Les changements restent en mémoire ; exporte-les avant de fermer cette page.' };
      }
    }

    conflict() {
      this.blocked = true;
      this.blockReason = 'conflict';
      return {
        ok: false, status: 'conflict',
        message: 'Les données ont changé dans un autre onglet. Enregistrement suspendu pour éviter de les écraser. Exporte tes changements, puis recharge cette page.'
      };
    }

    importData(input) {
      let prepared;
      try { prepared = migrateState(typeof input === 'string' ? JSON.parse(input) : input); }
      catch (error) { return {ok:false,status:'invalid',message:'Import refusé : ' + error.message}; }
      const result = this.reset(prepared);
      return result.ok ? {...result,message:'Sauvegarde importée. La copie brute précédente est conservée.'} : result;
    }

    reset(state = createState()) {
      let serialized;
      try { validateState(state); serialized = JSON.stringify(state); }
      catch (error) { return { ok: false, status: 'error', message: 'Réinitialisation refusée : ' + error.message }; }
      if (!this.loaded || this.lastRaw === undefined) return {
        ok: false, status: 'protected', message: 'Impossible de vérifier les données existantes. Réinitialisation refusée pour les préserver.'
      };
      const current = this.raw();
      if (!current.ok) return { ok: false, status: 'unavailable', message: current.message };
      if (current.raw !== this.lastRaw) return this.conflict();
      if (current.raw !== null && !this.backup(current.raw).ok) return {
        ok: false, status: 'error',
        message: 'La copie de secours n’a pas pu être créée. Réinitialisation annulée ; les données originales sont préservées. Libère du stockage ou exporte les données.'
      };
      // La création de la copie peut laisser un autre onglet écrire entre-temps.
      const beforeReplace = this.raw();
      if (!beforeReplace.ok) return { ok: false, status: 'unavailable', message: beforeReplace.message };
      if (beforeReplace.raw !== current.raw) return this.conflict();
      try {
        this.storage.setItem(STORAGE_KEY, serialized);
        const verification = this.raw();
        if (!verification.ok) return { ok: false, status: 'unavailable', message: 'La réinitialisation n’a pas pu être vérifiée. Une copie de l’original a été conservée si des données existaient.' };
        if (verification.raw !== serialized) return this.conflict();
        this.lastRaw = serialized;
        this.blocked = false;
        this.blockReason = null;
        return { ok: true, state, status: 'saved', message: 'Données réinitialisées. La copie de secours précédente est conservée.' };
      } catch (_) {
        return { ok: false, status: 'error', message: 'La réinitialisation a échoué. Les données originales et les copies de secours sont conservées.' };
      }
    }
  }

  return Object.freeze({
    SCHEMA_VERSION, STORAGE_KEY, BACKUP_PREFIX, MODULES, PALETTE,
    createState, stats, moduleStats, semesterStats, formatPercent,
    validateState, validateLegacyState, validateV2, migrateState, addTask, editTask, toggleTask, deleteTask,
    setProfile, customizeModule, Store
  });
});

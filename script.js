(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.S1QuestCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
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
    const total = tasks.length;
    const completed = tasks.reduce((sum, task) => sum + (task.completed === true ? 1 : 0), 0);
    const progressHundredths = total ? Math.round(completed * 10000 / total) : null;
    return {
      total,
      completed,
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

  function validateState(state) {
    validateCommonState(state, SCHEMA_VERSION);
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

  // Pure conversion: persistence is performed only by Store after a verified backup.
  function migrateState(state) {
    if (!isObject(state)) throw new Error('La sauvegarde est invalide.');
    if (state.schemaVersion === SCHEMA_VERSION) return validateState(state);
    if (state.schemaVersion !== 1) throw new Error('Aucune migration sûre n’est disponible pour cette version.');
    validateLegacyState(state);
    const migrated = JSON.parse(JSON.stringify(state));
    migrated.schemaVersion = SCHEMA_VERSION;
    migrated.curriculumProgress = {};
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
    for (const record of Object.values(state.curriculumProgress || {})) {
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
      if (isObject(parsed) && typeof parsed.schemaVersion === 'number' && ![1, SCHEMA_VERSION].includes(parsed.schemaVersion)) {
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
        return { state: migrated, status: 'migration-pending', migration: true, message: message + ' Les données v1 restent protégées ; la version v2 est utilisable en mémoire. Exporte tes changements avant de fermer cette page.' };
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
        if (!verification.ok) return pending('L’écriture de la migration n’a pas pu être vérifiée. La copie brute v1 est conservée.');
        if (verification.raw !== serialized) {
          const conflict = this.conflict();
          return { ...conflict, state: migrated, migration: true };
        }
        validateState(JSON.parse(verification.raw));
        this.lastRaw = serialized;
        return { state: migrated, status: 'loaded', migration: true, message: 'Sauvegarde migrée en version 2 ; copie brute v1 vérifiée conservée.' };
      } catch (_) { return pending('La migration n’a pas pu être enregistrée. La copie brute v1 est conservée.'); }
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
    validateState, validateLegacyState, migrateState, addTask, editTask, toggleTask, deleteTask,
    setProfile, customizeModule, Store
  });
});

// Interface navigateur : aucune exécution DOM lors des tests Node.js.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const C = globalThis.S1QuestCore;
  const P = globalThis.S1Curriculum;
  let catalog = null;
  let catalogBase = null;
  let privateLinksInMemory = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const view = $('#view');
  const modal = $('#modal');
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const store = new C.Store(storage);
  const loaded = store.load();
  let state = loaded.state;
  let storageResult = { ok: loaded.status === 'loaded', ...loaded };
  let modalContext = null;
  let lastTrigger = null;
  let announcementTimer;

  // Toutes les valeurs utilisateur sont des nœuds texte, jamais du HTML.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function append(parent, ...children) {
    children.flat().forEach(child => { if (child) parent.append(child); });
    return parent;
  }
  function button(text, action, className = 'button', data = {}) {
    const node = el('button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    Object.assign(node.dataset, data);
    return node;
  }
  function link(text, href, className = '') {
    const node = el('a', className, text);
    node.href = href;
    return node;
  }
  function form(action, data = {}, className = '') {
    const node = el('form', className);
    node.dataset.action = action;
    Object.assign(node.dataset, data);
    return node;
  }
  function submit(text, className = 'button primary') {
    const node = el('button', className, text);
    node.type = 'submit';
    return node;
  }
  function textField(labelText, name, value = '', maxLength = 120, options = {}) {
    const label = el('label');
    const caption = el('span', 'field-label', labelText);
    const input = el('input', 'field');
    input.name = name;
    input.value = value;
    input.maxLength = maxLength;
    input.required = true;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.autocomplete) input.autocomplete = options.autocomplete;
    append(label, caption, input);
    return label;
  }
  function setFormError(formNode, message, fieldName = 'title') {
    let error = $('.field-error', formNode);
    if (!error) {
      error = el('p', 'field-error');
      error.setAttribute('role', 'alert');
      error.id = 'form-error-' + (formNode.dataset.moduleId || 'dialog') + '-' + (formNode.dataset.section || formNode.dataset.action);
      formNode.append(error);
    }
    error.textContent = message;
    const field = formNode.elements.namedItem(fieldName);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
      field.focus();
    }
  }
  function clearFormError(formNode) {
    $('.field-error', formNode)?.remove();
    formNode.querySelectorAll('[aria-invalid]').forEach(input => {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    });
  }
  function announce(message) {
    clearTimeout(announcementTimer);
    $('#announcer').textContent = '';
    announcementTimer = setTimeout(() => { $('#announcer').textContent = message; }, 35);
  }
  const labels = { cours: 'Cours', td: 'TD', tp: 'TP' };
  const getModule = id => state.modules.find(module => module.id === id);
  function accent(node, color) { node.style.setProperty('--accent', color); return node; }

  function displayState() { return P.projectState(state, catalog); }
  function displayModule(id) { return P.projectModule(state, id, catalog); }
  function getViewTask(data) {
    if (data.curriculumId) return displayModule(data.moduleId).sections[data.section]?.find(task => task.curriculumId === data.curriculumId);
    return getModule(data.moduleId).sections[data.section]?.find(task => task.id === data.taskId);
  }
  function showCurriculumStatus(message, kind = 'notice') {
    const banner = $('#curriculum-status');
    banner.hidden = !message;
    banner.classList.toggle('catalog-error', kind === 'error');
    banner.textContent = message;
  }
  async function fetchJSON(path, optional = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL(path, document.baseURI), { signal: controller.signal, cache: 'no-store' });
      if (optional && response.status === 404) return null;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function applyPrivateLinks(targetCatalog, local) {
    if (!local || typeof local !== 'object' || Array.isArray(local) || local.schemaVersion !== 1 || !local.links || typeof local.links !== 'object' || Array.isArray(local.links)) throw new Error('Format du fichier de liens privés invalide.');
    const entries = Object.entries(local.links);
    if (!entries.length) throw new Error('Le fichier ne contient aucun lien.');
    for (const [id, url] of entries) {
      const resource = targetCatalog.resources.find(item => item.id === id);
      if (!resource || resource.access !== 'private-local' || !P.validateDriveUrl(url)) throw new Error('Un lien est invalide ou ne correspond pas à une ressource privée du catalogue.');
    }
    for (const [id, url] of entries) targetCatalog.resources.find(item => item.id === id).url = url;
    P.validateCatalog(targetCatalog);
    return entries.length;
  }
  async function importPrivateLinks(formNode, data) {
    const file = data.get('linksFile');
    if (!file || typeof file.text !== 'function' || !file.size || file.size > 65536) throw new Error('Choisis un fichier JSON de liens de moins de 64 Ko.');
    if (!catalogBase) throw new Error('Le catalogue doit être disponible avant de charger ses liens.');
    const local = JSON.parse(await file.text());
    const prepared = JSON.parse(JSON.stringify(catalogBase));
    const count = applyPrivateLinks(prepared, local);
    let saved = false;
    try {
      if (!storage) throw new Error('Stockage indisponible');
      const old = storage.getItem('s1quest_private_links');
      if (old !== null) {
        let backupKey = 's1quest_private_links_backup-' + Date.now();
        while (storage.getItem(backupKey) !== null) backupKey += '-copy';
        storage.setItem(backupKey, old);
        if (storage.getItem(backupKey) !== old) throw new Error('Copie non vérifiable');
      }
      if (storage.getItem('s1quest_private_links') !== old) throw new Error('Configuration modifiée dans un autre onglet');
      const serialized = JSON.stringify(local);
      storage.setItem('s1quest_private_links', serialized);
      saved = storage.getItem('s1quest_private_links') === serialized;
    } catch { /* Les liens validés restent utilisables en mémoire. */ }
    privateLinksInMemory = local;
    catalog = prepared;
    let feedback = $('.feedback', formNode);
    if (!feedback) { feedback = el('p', 'feedback'); feedback.setAttribute('role', 'status'); formNode.append(feedback); }
    feedback.classList.toggle('unsaved-links', !saved);
    feedback.textContent = count + ' liens chargés. ' + (saved ? 'Conservés sur cet appareil uniquement.' : 'En mémoire uniquement : conserve le fichier JSON avant de fermer cette page.');
    showCurriculumStatus(count + ' liens privés ' + (saved ? 'chargés depuis ce navigateur.' : 'utilisables en mémoire uniquement ; leur sauvegarde a échoué.') + ' Aucun lien n’a été publié. L’accès Drive et les associations proposées restent à vérifier.');
    announce(feedback.textContent);
  }

  async function loadCurriculum() {
    let publicCatalog;
    let cached = false;
    try {
      publicCatalog = P.validateCatalog(await fetchJSON('./curriculum.json'));
      // Ce cache ne reçoit que le catalogue public, jamais les liens privés locaux.
      try { storage?.setItem('s1quest_curriculum_cache', JSON.stringify(publicCatalog)); } catch { /* Cache facultatif. */ }
    } catch {
      try {
        const raw = storage?.getItem('s1quest_curriculum_cache');
        if (!raw) throw new Error('Pas de cache');
        publicCatalog = P.validateCatalog(JSON.parse(raw));
        cached = true;
      } catch {
        showCurriculumStatus('Catalogue indisponible. Vos données sont conservées ; seules les tâches personnelles sont affichées et les pourcentages sont partiels. Lancez le site avec un serveur HTTP puis rechargez.', 'error');
        return;
      }
    }
    catalogBase = publicCatalog;
    catalog = JSON.parse(JSON.stringify(publicCatalog));
    let privateLinks = 0;
    let privateError = false;
    let local = privateLinksInMemory;
    try {
      if (!local) {
        const stored = storage?.getItem('s1quest_private_links');
        if (stored) local = JSON.parse(stored);
      }
    } catch { privateError = true; }
    if (!local && !privateError) {
      try { local = await fetchJSON('./curriculum.links.local.json', true); }
      catch { privateError = true; }
    }
    // Un import explicite effectué pendant le fetch reste prioritaire.
    if (privateLinksInMemory) { local = privateLinksInMemory; privateError = false; }
    try {
      if (local) privateLinks = applyPrivateLinks(catalog, local);
    } catch { privateError = true; }
    P.validateCatalog(catalog);
    const notes = [];
    if (cached) notes.push('Catalogue en cache : sa version distante n’a pas pu être vérifiée.');
    if (privateLinks) notes.push('Liens Drive fournis pour les essais locaux. Leur accès et le contenu des PDF n’ont pas pu être vérifiés ici.');
    else notes.push(privateError ? 'Les liens privés locaux sont indisponibles ou invalides.' : 'Les liens privés ne sont pas publiés. Les PDF restent à renseigner sur cette installation.');
    if (catalog.relations.some(relation => relation.status === 'proposed')) notes.push('Les associations Cours–TD proposées restent à confirmer.');
    showCurriculumStatus(notes.join(' '));
    rerenderAt(null, { preserveModal: true });
    document.dispatchEvent(new CustomEvent('s1quest:curriculum-ready'));
  }
  function renderResources(item) {
    const box = el('div', 'curriculum-resources');
    for (const id of item.resourceIds) {
      const resource = catalog.resources.find(candidate => candidate.id === id);
      if (resource?.url && P.validateDriveUrl(resource.url)) {
        const a = link('Ouvrir le PDF', resource.url, 'button resource-link');
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'Ouvrir le PDF : ' + resource.title + ' dans Google Drive (nouvel onglet)');
        box.append(a);
      } else {
        append(box, el('span', 'resource-missing', 'PDF à renseigner · lien privé non publié'));
      }
    }
    if (!item.resourceIds.length) box.append(el('span', 'resource-missing', 'PDF à renseigner'));
    return box;
  }
  function goToTD(id) {
    const item = P.getItem(catalog, id);
    if (!item || item.section !== 'td') return;
    const row = Array.from(view.querySelectorAll('.curriculum-task')).find(node => node.dataset.curriculumId === id);
    if (!row) { announce('Ce TD est masqué. Réaffichez-le dans la section TD.'); return; }
    const checkbox = $('input[type="checkbox"]', row);
    checkbox?.focus({ preventScroll: true });
    row.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    announce('Accès à ' + item.title + '. Le TD peut être travaillé indépendamment du cours.');
  }
  function enrichCurriculumTask(row, module, section, task) {
    row.classList.add('curriculum-task');
    row.dataset.curriculumId = task.curriculumId;
    row.id = 'curriculum-' + task.curriculumId;
    const main = el('div', 'task-main');
    main.append(...Array.from(row.childNodes));
    row.append(main);
    const item = P.getItem(catalog, task.curriculumId);
    if (!item) return row;
    const detail = el('div', 'curriculum-detail');
    if (task.title !== item.title) detail.append(el('p', 'canonical-title', 'Titre du document : ' + item.title));
    append(detail, renderResources(item));
    if (item.subsections.length) {
      const parts = el('details', 'document-parts');
      append(parts, el('summary', '', 'Sous-parties du document (informatives)'));
      const list = el('ol');
      item.subsections.slice().sort((a, b) => a.order - b.order).forEach(part => list.append(el('li', '', part.title)));
      append(parts, list, el('p', 'muted', 'Ces sous-parties ne sont pas comptées en plus du chapitre.'));
      detail.append(parts);
    }
    const record = state.curriculumProgress[task.curriculumId];
    const available = getModule(module.id).sections[section];
    if (record?.linkedTaskId) {
      append(detail, append(el('div', 'catalog-binding'), el('span', '', '✓ Progression de la tâche personnelle associée'), button('Détacher', 'unlink-existing', 'button subtle compact', { curriculumId: task.curriculumId, moduleId: module.id, section })));
    } else if (available.length) {
      detail.append(button('Rattacher une tâche existante', 'link-existing', 'button subtle compact', { curriculumId: task.curriculumId, moduleId: module.id, section }));
    }
    if (section === 'cours') {
      const associated = el('section', 'associated-td');
      associated.setAttribute('aria-label', 'TD associés à ' + item.title);
      const relations = catalog.relations.filter(relation => relation.chapterId === item.id);
      append(associated, el('h3', '', 'TD associés à ce chapitre'));
      if (!relations.length) append(associated, el('p', 'muted', 'Aucune association vérifiée ou proposée pour ce chapitre. Tous les TD restent accessibles dans leur section.'));
      for (const relation of relations) {
        const td = P.getItem(catalog, relation.tdId);
        const displayed = displayModule(module.id).sections.td.find(candidate => candidate.curriculumId === relation.tdId);
        const recommendation = el('div', 'td-recommendation');
        const heading = el('div', 'recommendation-heading');
        append(heading, el('strong', '', td.title), el('span', 'relation-status ' + relation.status, relation.status === 'confirmed' ? 'Association confirmée' : 'Association proposée · à confirmer'));
        append(recommendation, heading, el('p', 'relation-reason', relation.rationale));
        if (displayed) {
          append(recommendation, el('span', 'td-state', displayed.completed ? '✓ TD terminé' : '○ TD à faire'), button('Aller au ' + td.title, 'go-to-td', 'button subtle compact', { targetId: td.id }));
        } else append(recommendation, el('p', 'muted', 'Ce TD est masqué. Il peut être réaffiché dans la section TD.'));
        associated.append(recommendation);
      }
      detail.append(associated);
    }
    row.append(detail);
    return row;
  }
  function renderHidden(moduleId, section) {
    const items = catalog?.modules.find(module => module.id === moduleId)?.sections[section] || [];
    const hidden = items.filter(item => state.curriculumProgress[item.id]?.hidden);
    if (!hidden.length) return null;
    const details = el('details', 'hidden-curriculum');
    append(details, el('summary', '', 'Éléments masqués · ' + hidden.length));
    for (const item of hidden) append(details, append(el('div', 'hidden-item'), el('span', '', item.title), button('Réafficher', 'restore-catalog', 'button subtle compact', { curriculumId: item.id, moduleId, section })));
    return details;
  }
  function showLinkExisting(data, trigger) {
    const item = P.getItem(catalog, data.curriculumId);
    if (!item) return;
    const used = new Set(Object.values(state.curriculumProgress).map(record => record.linkedTaskId).filter(Boolean));
    const tasks = getModule(item.moduleId).sections[item.section].filter(task => !used.has(task.id));
    const box = form('link-existing-submit', { ...data });
    append(box, modalHeading('Rattacher une tâche personnelle'), el('p', '', 'La case cochée et les dates de la tâche choisie seront utilisées pour « ' + item.title + ' ». La tâche d’origine est conservée et comptée une seule fois. Aucun rapprochement n’est automatique.'));
    if (!tasks.length) {
      append(box, el('p', '', 'Aucune tâche personnelle disponible dans cette section.'), button('Fermer', 'close-modal', 'button subtle'));
    } else {
      const label = el('label');
      const select = el('select', 'field');
      select.name = 'manualTaskId';
      select.required = true;
      tasks.forEach(task => { const option = el('option', '', (task.completed ? '✓ ' : '○ ') + task.title); option.value = task.id; select.append(option); });
      append(label, el('span', 'field-label', 'Tâche de la même section'), select);
      append(box, label, append(el('div', 'dialog-buttons'), button('Annuler', 'close-modal', 'button subtle'), submit('Rattacher cette tâche')));
    }
    openModal(box, { action: 'link-existing' }, trigger);
  }

  function renderStorage() {
    const status = $('#save-status');
    const warning = $('#storage-warning');
    warning.replaceChildren();
    const good = storageResult.ok || storageResult.status === 'loaded';
    status.classList.toggle('warning', !good);
    status.textContent = good ? '● Enregistré sur cet appareil' : '● Sauvegarde non confirmée';
    warning.hidden = good;
    if (!good) {
      append(warning, el('p', '', storageResult.message || 'Vos modifications restent en mémoire. Exportez votre sauvegarde avant de fermer cette page.'));
      append(warning, el('p', '', 'Ne fermez pas cette page sans exporter vos changements. Aucune sauvegarde cloud n’est effectuée.'));
      append(warning, button('↓ Exporter les données en mémoire', 'export', 'button subtle compact'));
      if (storageResult.status === 'corrupt' || storageResult.status === 'unsupported' || storageResult.status === 'invalid' || storageResult.status === 'conflict' || storageResult.status === 'protected' || storageResult.status === 'migration-pending') {
        append(warning, button('↓ Conserver aussi les données stockées brutes', 'export-raw', 'button subtle compact'));
      }
    }
  }
  function persist() {
    storageResult = store.save(state);
    renderStorage();
    return storageResult.ok;
  }
  function renderNavigation() {
    const nav = $('#navigation');
    nav.replaceChildren();
    const route = window.location.hash || '#/';
    function navItem(title, href, icon) {
      const a = link('', href, 'nav-link' + (route === href ? ' active' : ''));
      if (route === href) a.setAttribute('aria-current', 'page');
      const mark = el('span', 'nav-icon', icon);
      mark.setAttribute('aria-hidden', 'true');
      append(a, mark, el('span', 'nav-name', title));
      return a;
    }
    append(nav, navItem('Tableau de bord', '#/', '▦'), el('p', 'nav-label', 'MES MODULES'));
    for (const module of state.modules) append(nav, navItem(module.name, '#/module/' + module.id, module.emoji));
    append(nav, el('p', 'nav-label', 'MON ESPACE'), navItem('Paramètres', '#/settings', '⚙'));
    $('#sidebar-nickname').textContent = state.profile.nickname;
    $('.student .avatar').textContent = Array.from(state.profile.nickname)[0] || 'A';
  }

  function progressBlock(stats, label, { compact = false } = {}) {
    const wrap = el('div', compact ? 'section-mini' : 'progress-block');
    const top = el('div', 'progress-line');
    append(top, el('span', '', label));
    if (!stats.total) {
      append(top, el('span', 'unconfigured', 'À configurer'));
      append(wrap, top, append(el('div', 'progress-line'), el('small', '', 'Reste : À configurer')));
      return wrap;
    }
    append(top, el('strong', '', C.formatPercent(stats.progressHundredths)));
    const bar = el('progress');
    bar.max = stats.total;
    bar.value = stats.completed;
    bar.setAttribute('aria-label', label);
    bar.textContent = C.formatPercent(stats.progressHundredths);
    const below = el('div', 'progress-line');
    append(below, el('small', '', stats.completed + ' / ' + stats.total + ' terminées'), el('small', '', 'Reste : ' + C.formatPercent(stats.remainingHundredths)));
    append(wrap, top, bar, below);
    return wrap;
  }
  function moduleStatus(module, stats) {
    if (!stats.total) return 'Aucune tâche configurée';
    if (stats.fullyCompleted) return '✓ Toutes les sections configurées sont terminées';
    if (stats.completed === stats.total && !stats.fullyConfigured) return 'Tâches cochées · sections encore à configurer';
    return stats.remaining + (stats.remaining === 1 ? ' tâche à terminer' : ' tâches à terminer');
  }
  function renderDashboard() {
    const overall = C.semesterStats(displayState());
    const intro = el('div', 'page-intro');
    const introduction = el('div');
    append(introduction, el('p', 'eyebrow', 'SEMESTRE 01 · MATHÉMATIQUES & INFORMATIQUE'), el('h1', '', 'Chaque tâche compte.'), el('p', 'subtitle', 'Ton parcours universitaire, un chapitre à la fois. Prends le contrôle de tes révisions.'));
    append(intro, introduction, el('span', 'phase-chip', '✦ TON PARCOURS S1'));
    const player = el('section', 'player-card');
    player.setAttribute('aria-label', 'Profil et progression générale');
    const avatar = el('div', 'avatar', Array.from(state.profile.nickname)[0] || 'A');
    avatar.setAttribute('aria-hidden', 'true');
    const info = el('div', 'player-info');
    append(info, el('p', 'player-tag', 'TON ESPACE ÉTUDIANT'), el('h2', '', state.profile.nickname), el('p', '', 'Étudiant S1 · Faculté des Sciences de Rabat'));
    const playerProgress = el('div', 'player-progress');
    append(playerProgress, progressBlock(overall, 'Progression des tâches configurées'));
    append(player, avatar, info, playerProgress);
    const stats = el('section', 'stat-grid');
    stats.setAttribute('aria-label', 'Statistiques des tâches');
    const values = [
      ['▤', overall.total, 'Tâches configurées'],
      ['✓', overall.completed, 'Tâches terminées'],
      ['◷', overall.remaining, 'Tâches restantes'],
      ['▦', overall.configuredModules + ' / 7', 'Modules configurés']
    ];
    for (const [icon, value, title] of values) {
      const stat = el('div', 'stat');
      const mark = el('span', 'stat-icon', icon);
      mark.setAttribute('aria-hidden', 'true');
      append(stat, mark, append(el('div'), el('strong', '', value), el('span', '', title)));
      stats.append(stat);
    }
    const heading = el('div', 'section-heading');
    append(heading, append(el('div'), el('h2', '', 'Tes modules'), el('p', '', 'Analyse 1 est prérempli ; ajoute tes autres chapitres et séries réels.')), el('span', 'count-label', '7 MODULES'));
    const grid = el('div', 'module-grid');
    state.modules.forEach((module, position) => {
      const summary = C.moduleStats(displayModule(module.id));
      const card = accent(el('article', 'module-card'), module.color);
      const top = el('div', 'module-top');
      const icon = el('span', 'module-icon', module.emoji);
      icon.setAttribute('aria-hidden', 'true');
      append(top, icon, el('span', 'module-number', 'MODULE ' + String(position + 1).padStart(2, '0')));
      const title = append(el('h3'), link(module.name, '#/module/' + module.id));
      const sections = el('div', 'module-sections');
      C.MODULES.find(item => item.id === module.id).sections.forEach(section => {
        append(sections, progressBlock(C.stats(module.sections[section]), labels[section], { compact: true }));
      });
      const bottom = el('div', 'module-bottom');
      append(bottom, progressBlock(summary, 'Global du module'), el('p', 'module-status' + (summary.fullyCompleted ? ' complete' : ''), moduleStatus(module, summary)));
      const access = link('', '#/module/' + module.id, 'module-access');
      append(access, el('span', '', 'Ouvrir le module'), el('span', '', '→'));
      access.setAttribute('aria-label', 'Ouvrir le module ' + module.name);
      append(card, top, title, sections, bottom, access);
      grid.append(card);
    });
    const note = overall.fullyCompleted
      ? '✓ Semestre entièrement terminé : toutes les sections applicables ont des tâches et toutes sont cochées. Cela décrit les tâches saisies, pas une certification du programme officiel.'
      : 'La progression concerne uniquement les tâches saisies. Une section vide reste à configurer ; 100 % de tâches cochées ne signifie pas que tout le programme universitaire est couvert.';
    append(view, intro, player, stats, heading, grid, el('p', 'coverage-note', note));
  }

  function renderTask(module, section, task) {
    const row = el('li', 'task-row' + (task.completed ? ' completed' : ''));
    row.dataset.taskId = task.id;
    const checkLabel = el('label', 'task-check');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.dataset.action = 'toggle-task';
    Object.assign(checkbox.dataset, { moduleId: module.id, section, taskId: task.id });
    if (task.curriculumId) checkbox.dataset.curriculumId = task.curriculumId;
    append(checkLabel, checkbox, el('span', 'task-title', task.title));
    const data = { moduleId: module.id, section, taskId: task.id };
    if (task.curriculumId) data.curriculumId = task.curriculumId;
    const actions = el('div', 'task-actions');
    const edit = button('Modifier', 'edit-task', 'button subtle compact', data);
    edit.setAttribute('aria-label', 'Modifier : ' + task.title);
    const remove = button(task.curriculumId ? 'Masquer' : 'Supprimer', 'delete-task', 'button danger compact', data);
    remove.setAttribute('aria-label', (task.curriculumId ? 'Masquer : ' : 'Supprimer : ') + task.title);
    append(actions, edit, remove);
    append(row, checkLabel, actions);
    if (task.curriculumId) return enrichCurriculumTask(row, module, section, task);
    return row;
  }
  function renderModule(module) {
    module = displayModule(module.id);
    document.title = module.name + ' — S1 QUEST';
    const back = link('← Tous les modules', '#/', 'breadcrumb');
    const title = accent(el('div', 'module-title'), module.color);
    const icon = el('span', 'module-icon', module.emoji);
    icon.setAttribute('aria-hidden', 'true');
    append(title, icon, append(el('div'), el('p', 'eyebrow', 'MON PARCOURS · SEMESTRE 01'), el('h1', '', module.name)));
    const summary = C.moduleStats(displayModule(module.id));
    const overview = accent(el('section', 'panel module-overview'), module.color);
    append(overview, el('h2', '', 'Progression du module'), progressBlock(summary, 'Progression des tâches configurées'), el('p', 'module-status' + (summary.fullyCompleted ? ' complete' : ''), moduleStatus(module, summary)));
    append(view, back, title, overview);
    for (const section of C.MODULES.find(item => item.id === module.id).sections) {
      const tasks = module.sections[section];
      const panel = accent(el('section', 'panel task-section'), module.color);
      panel.id = 'section-' + section;
      const heading = el('div', 'section-heading');
      append(heading, el('h2', '', labels[section]), el('span', 'count-label', tasks.length + (tasks.length === 1 ? ' TÂCHE' : ' TÂCHES')));
      append(panel, heading, append(el('div', 'section-stats'), progressBlock(C.stats(tasks), 'Progression ' + labels[section])));
      if (!tasks.length) {
        append(panel, append(el('div', 'empty'), el('strong', '', 'À configurer'), el('span', '', 'Ajoute ton premier chapitre ou ta première série. Aucun contenu académique n’est inventé.')));
      } else {
        const curriculumTasks = tasks.filter(task => task.curriculumId);
        const personalTasks = tasks.filter(task => !task.curriculumId);
        if (curriculumTasks.length) {
          const ordered = el('ol', 'task-list curriculum-list');
          ordered.setAttribute('aria-label', labels[section] + ' dans l’ordre pédagogique');
          curriculumTasks.forEach(task => ordered.append(renderTask(module, section, task)));
          panel.append(ordered);
        }
        if (personalTasks.length) {
          panel.append(el('h3', 'personal-heading', 'Mes tâches personnelles'));
          for (const completed of [false, true]) {
            const group = personalTasks.filter(task => task.completed === completed);
            const sectionGroup = el('div', 'task-group');
            const list = el('ul', 'task-list');
            group.forEach(task => list.append(renderTask(module, section, task)));
            append(sectionGroup, el('h3', '', (completed ? 'Terminées' : 'À faire') + ' · ' + group.length));
            if (group.length) sectionGroup.append(list);
            panel.append(sectionGroup);
          }
        }
      }
      append(panel, renderHidden(module.id, section));
      const addForm = form('add-task', { moduleId: module.id, section }, 'add-task');
      append(addForm, textField('Nouvelle tâche · ' + labels[section], 'title', '', 120, { placeholder: 'Titre du chapitre ou de la série…', autocomplete: 'off' }), submit('＋ Ajouter une tâche'));
      panel.append(addForm);
      view.append(panel);
    }
    append(view, el('p', 'coverage-note', 'Les chapitres et TD comptent chacun une seule fois. Les recommandations ne créent pas de tâches supplémentaires. Ouvrir un PDF ne coche aucune case ; les cours et TD restent indépendants.'));
  }

  function renderSettings() {
    append(view, el('p', 'eyebrow', 'MON ESPACE'), el('h1', '', 'Paramètres'), el('p', 'subtitle', 'Ton profil, tes modules et tes données restent sous ton contrôle.'));
    const profile = el('section', 'panel');
    profile.style.marginTop = '25px';
    const profileForm = form('profile', {}, 'profile-form');
    append(profileForm, textField('Pseudo', 'nickname', state.profile.nickname, 40, { autocomplete: 'nickname' }), submit('Enregistrer le pseudo'));
    append(profile, el('h2', '', 'Profil étudiant'), el('p', 'settings-help', 'Un nom pour ton espace. Aucun compte ni connexion nécessaire.'), profileForm);
    const customization = el('section', 'panel');
    append(customization, el('h2', '', 'Personnaliser les modules'), el('p', 'settings-help', 'Les identifiants, l’ordre et les sections restent fixes. Les accents proposés préservent la lisibilité sur le fond sombre.'));
    for (const module of state.modules) {
      const moduleForm = form('customize', { moduleId: module.id }, 'settings-module');
      append(moduleForm, el('h3', '', C.MODULES.find(item => item.id === module.id).name));
      const fields = el('div', 'form-grid');
      const colorLabel = el('label');
      const select = el('select', 'field');
      select.name = 'color';
      for (const item of C.PALETTE) {
        const option = el('option', '', item.label);
        option.value = item.value;
        option.selected = item.value === module.color;
        select.append(option);
      }
      append(colorLabel, el('span', 'field-label', 'Couleur d’accent'), select);
      append(fields, textField('Nom affiché', 'name', module.name, 100), textField('Icône emoji', 'emoji', module.emoji, 16), colorLabel);
      append(moduleForm, fields, submit('Enregistrer ce module'));
      customization.append(moduleForm);
    }
    const backups = el('section', 'panel');
    const backupRow = el('div', 'export-row');
    const backupDescription = el('div');
    append(backupDescription, el('h2', '', 'Sauvegarde JSON'), el('p', 'settings-help', 'Télécharge une copie externe de tes tâches, de ta progression du catalogue et de tes personnalisations. Les liens privés locaux restent séparés de cet export.'));
    append(backupRow, backupDescription, button('↓ Exporter mes données', 'export', 'button primary'));
    append(backups, backupRow, el('p', 'settings-help', 'Le stockage est propre à ce navigateur et à cette adresse. Il ne synchronise pas tes appareils et peut être effacé par le navigateur. Une copie locale de secours ne remplace pas un export.'));
    const danger = el('section', 'panel danger-zone');
    append(danger, el('h2', '', 'Réinitialisation'), el('p', 'settings-help', 'Efface les tâches personnelles, les cases cochées, les éléments masqués, le pseudo et les personnalisations. Les sept modules et le catalogue pédagogique restent disponibles. Une copie de secours locale vérifiée est obligatoire avant remplacement.'), button('Réinitialiser les données', 'reset-start', 'button danger'));
    const privatePanel = el('section', 'panel');
    append(privatePanel, el('h2', '', 'Mes liens privés Google Drive'), el('p', 'settings-help', 'Sur GitHub Pages, charge ton fichier JSON de liens dans ce navigateur. Il reste sur ton appareil : aucun PDF ni lien privé n’est ajouté au dépôt, au catalogue public ou à l’export de progression. Conserve le fichier source comme sauvegarde.'));
    const privateForm = form('import-private-links');
    const privateLabel = el('label');
    const privateInput = el('input', 'field');
    privateInput.type = 'file';
    privateInput.name = 'linksFile';
    privateInput.accept = '.json,application/json';
    privateInput.required = true;
    append(privateLabel, el('span', 'field-label', 'Fichier JSON de liens privés (64 Ko maximum)'), privateInput);
    append(privateForm, privateLabel, submit('Charger mes liens privés'));
    append(privatePanel, privateForm);
    append(view, profile, privatePanel, customization, backups, danger);
  }
  function route({ focus = true, preserveModal = false } = {}) {
    if (modal.open && !preserveModal) closeModal(false);
    view.replaceChildren();
    const hash = window.location.hash || '#/';
    document.title = 'S1 QUEST — Tableau de bord';
    renderNavigation();
    if (hash === '#/') renderDashboard();
    else if (hash === '#/settings') { document.title = 'Paramètres — S1 QUEST'; renderSettings(); }
    else {
      const match = /^#\/module\/([a-z0-9]+)$/.exec(hash);
      const module = match && getModule(match[1]);
      if (module) renderModule(module);
      else {
        document.title = 'Page introuvable — S1 QUEST';
        const error = el('section', 'page-not-found');
        append(error, el('p', 'eyebrow', '404'), el('h1', '', 'Cette page est introuvable.'), el('p', 'subtitle', 'Tes données sont conservées. Reviens au tableau de bord pour continuer.'), link('← Retour au tableau de bord', '#/', 'button'));
        view.append(error);
      }
    }
    if (focus) { $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  function rerenderAt(target, { resetForm = null, preserveModal = false } = {}) {
    const active = document.activeElement;
    const activeForm = active?.closest('form');
    const focusWasInView = activeForm && view.contains(activeForm);
    const focusedName = active?.name;
    const selection = active?.tagName === 'INPUT' && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    // Une action sur une tâche ne doit pas effacer un titre non soumis ailleurs.
    const key = node => [node.dataset.action, node.dataset.moduleId || '', node.dataset.section || ''].join(':');
    const drafts = new Map();
    for (const current of view.querySelectorAll('form')) {
      if (current === resetForm) continue;
      drafts.set(key(current), Array.from(current.elements)
        .filter(field => field.name && !['submit', 'button'].includes(field.type))
        .map(field => ({ name: field.name, value: field.value, fileControl: field.type === 'file' ? field : null })));
    }
    const scroll = window.scrollY;
    route({ focus: false, preserveModal });
    for (const current of view.querySelectorAll('form')) {
      for (const draft of drafts.get(key(current)) || []) {
        const field = current.elements.namedItem(draft.name);
        if (field && draft.fileControl) field.replaceWith(draft.fileControl);
        else if (field) field.value = draft.value;
      }
    }
    if (target) {
      const nodes = Array.from(view.querySelectorAll('[data-action]'));
      const match = nodes.find(node => node.dataset.action === target.action && (!target.moduleId || node.dataset.moduleId === target.moduleId) && (!target.section || node.dataset.section === target.section) && (!target.taskId || node.dataset.taskId === target.taskId) && (!target.curriculumId || node.dataset.curriculumId === target.curriculumId));
      const focusNode = match?.tagName === 'FORM' ? match.elements.namedItem(target.field || 'title') : match;
      (focusNode || $('#main')).focus({ preventScroll: true });
    }
    if (!target && focusWasInView && focusedName) {
      const replacementForm = Array.from(view.querySelectorAll('form')).find(node => key(node) === key(activeForm));
      const field = replacementForm?.elements.namedItem(focusedName);
      field?.focus({ preventScroll: true });
      if (field && selection) field.setSelectionRange(...selection);
    }
    window.scrollTo(0, scroll);
  }

  function openModal(content, context, trigger) {
    lastTrigger = trigger || document.activeElement;
    modalContext = context;
    modal.replaceChildren(content);
    modal.showModal();
  }
  function closeModal(restore = true) {
    modal.close();
    modalContext = null;
    if (restore) {
      if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
      else $('#main').focus({ preventScroll: true });
    }
  }
  function modalHeading(text) {
    const heading = el('h2', '', text);
    heading.id = 'dialog-title';
    return heading;
  }
  function showEdit(data, trigger) {
    const module = getModule(data.moduleId);
    const task = getViewTask(data);
    if (!task) return;
    const editor = form('edit-task-submit', data);
    append(editor, modalHeading('Modifier la tâche'), textField('Titre de la tâche', 'title', task.title, 120), append(el('div', 'dialog-buttons'), button('Annuler', 'close-modal', 'button subtle'), submit('Enregistrer')));
    openModal(editor, { action: 'edit', ...data }, trigger);
    requestAnimationFrame(() => { const field = editor.elements.namedItem('title'); field.focus(); field.select(); });
  }
  function showDelete(data, trigger) {
    const task = getViewTask(data);
    if (!task) return;
    const box = el('div');
    const cancel = button('Annuler', 'close-modal', 'button subtle');
    cancel.autofocus = true;
    append(box, modalHeading(task.curriculumId ? 'Masquer cet élément du parcours ?' : 'Supprimer cette tâche ?'), el('p', '', task.curriculumId ? 'L’élément « ' + task.title + ' » sera masqué et exclu du calcul. Sa progression est conservée et il pourra être réaffiché. Une tâche personnelle associée reste disponible.' : 'La tâche « ' + task.title + ' » sera supprimée. Cette action est irréversible et modifiera les compteurs de progression.'), append(el('div', 'dialog-buttons'), cancel, button(task.curriculumId ? 'Masquer cet élément' : 'Supprimer cette tâche', 'confirm-delete', 'button danger')));
    openModal(box, { action: 'delete', ...data }, trigger);
  }
  function resetStart(trigger) {
    const box = el('div');
    const cancel = button('Annuler', 'close-modal', 'button subtle');
    cancel.autofocus = true;
    append(box, modalHeading('Réinitialiser ton espace ?'), el('p', '', 'Tes tâches personnelles, ta progression du catalogue, ton pseudo et les personnalisations seront réinitialisés. Les chapitres et TD du catalogue restent disponibles. Les autres applications ne sont pas concernées.'), el('div', 'notice', 'Exporte d’abord ton JSON pour conserver une copie externe. Une seconde confirmation sera nécessaire.'), button('↓ Exporter avant de continuer', 'export', 'button subtle'), append(el('div', 'dialog-buttons'), cancel, button('Continuer', 'reset-continue', 'button danger')));
    if (store.blocked && ['corrupt', 'unsupported', 'protected', 'conflict'].includes(storageResult.status)) {
      box.insertBefore(button('↓ Conserver la sauvegarde originale brute', 'export-raw', 'button subtle'), box.lastElementChild);
    }
    openModal(box, { action: 'reset-first' }, trigger);
  }
  function resetContinue() {
    if (modalContext?.action !== 'reset-first') return;
    const confirmation = form('reset-confirm');
    append(confirmation, modalHeading('Confirmer la réinitialisation'), el('p', '', 'Saisis exactement RÉINITIALISER pour confirmer. Une copie de secours sera conservée si le stockage est accessible ; en cas d’échec, rien ne sera supprimé.'), textField('Confirmation : RÉINITIALISER', 'confirmation', '', 20, { autocomplete: 'off' }), append(el('div', 'dialog-buttons'), button('Annuler', 'close-modal', 'button subtle'), submit('Réinitialiser définitivement', 'button danger')));
    modal.replaceChildren(confirmation);
    modalContext = { action: 'reset-final' };
    confirmation.elements.namedItem('confirmation').focus();
  }
  function download(text, filename, type = 'application/json;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = link('', url);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportData() {
    try {
      C.validateState(state);
      download(JSON.stringify(state, null, 2), 's1quest-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json');
      announce('Téléchargement de la sauvegarde JSON demandé. Conservez le fichier en lieu sûr.');
    } catch (error) { announce('Export impossible : ' + error.message); }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.tagName === 'FORM' || target.type === 'submit') return;
    const data = { moduleId: target.dataset.moduleId, section: target.dataset.section, taskId: target.dataset.taskId };
    if (target.dataset.curriculumId) data.curriculumId = target.dataset.curriculumId;
    switch (target.dataset.action) {
      case 'skip-main':
        event.preventDefault();
        $('#main').focus();
        $('#main').scrollIntoView({ behavior: 'instant', block: 'start' });
        break;
      case 'edit-task': showEdit(data, target); break;
      case 'delete-task': showDelete(data, target); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-delete': {
        if (modalContext?.action !== 'delete') return;
        const context = { ...modalContext };
        if (context.curriculumId) P.hideCatalog(state, context.curriculumId);
        else C.deleteTask(state, context.moduleId, context.section, context.taskId);
        const saved = persist();
        closeModal(false);
        rerenderAt({ action: 'add-task', moduleId: context.moduleId, section: context.section });
        announce((context.curriculumId ? 'Élément masqué, progression conservée.' : 'Tâche supprimée.') + (saved ? '' : ' Attention : sauvegarde non confirmée.'));
        break;
      }
      case 'go-to-td': goToTD(target.dataset.targetId); break;
      case 'link-existing': showLinkExisting(data, target); break;
      case 'unlink-existing':
        P.unlinkCatalogTask(state, catalog, data.curriculumId);
        persist();
        rerenderAt({ action: 'toggle-task', ...data });
        announce('Association détachée. La tâche personnelle et la progression sont conservées.');
        break;
      case 'restore-catalog':
        P.hideCatalog(state, data.curriculumId, false);
        persist();
        rerenderAt({ action: 'toggle-task', ...data });
        announce('Élément réaffiché avec sa progression.');
        break;
      case 'reset-start': resetStart(target); break;
      case 'reset-continue': resetContinue(); break;
      case 'export': exportData(); break;
      case 'export-raw': {
        try {
          const result = store.raw();
          if (!result.ok) { announce(result.message); break; }
          const raw = result.raw;
          if (raw === null || raw === undefined) { announce('Aucune donnée brute disponible.'); break; }
          download(raw, 's1quest-donnees-stockees-brutes.txt', 'text/plain;charset=utf-8');
          announce('Téléchargement des données stockées brutes demandé.');
        } catch { announce('Le navigateur interdit la lecture des données stockées.'); }
        break;
      }
    }
  });
  document.addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.dataset.action !== 'toggle-task') return;
    const { moduleId, section, taskId } = checkbox.dataset;
    if (checkbox.dataset.curriculumId) P.toggleCatalog(state, checkbox.dataset.curriculumId, checkbox.checked);
    else C.toggleTask(state, moduleId, section, taskId, checkbox.checked);
    const saved = persist();
    rerenderAt({ action: 'toggle-task', moduleId, section, taskId, curriculumId: checkbox.dataset.curriculumId });
    announce('Tâche ' + (checkbox.checked ? 'terminée' : 'à faire') + '. Progression recalculée.' + (saved ? '' : ' Sauvegarde non confirmée.'));
  });
  document.addEventListener('input', event => {
    const formNode = event.target.closest('form');
    if (formNode) clearFormError(formNode);
  });
  document.addEventListener('submit', async event => {
    const formNode = event.target;
    const action = formNode.dataset.action;
    if (!action) return;
    event.preventDefault();
    clearFormError(formNode);
    const data = new FormData(formNode);
    const { moduleId, section, taskId } = formNode.dataset;
    try {
      if (action === 'import-private-links') {
        await importPrivateLinks(formNode, data);
      } else if (action === 'add-task') {
        C.addTask(state, moduleId, section, String(data.get('title')));
        const saved = persist();
        rerenderAt({ action, moduleId, section }, { resetForm: formNode });
        announce('Tâche ajoutée.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'edit-task-submit') {
        if (formNode.dataset.curriculumId) P.editCatalogTitle(state, formNode.dataset.curriculumId, String(data.get('title')));
        else C.editTask(state, moduleId, section, taskId, String(data.get('title')));
        const saved = persist();
        closeModal(false);
        rerenderAt({ action: 'edit-task', moduleId, section, taskId, curriculumId: formNode.dataset.curriculumId });
        announce('Titre modifié.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'link-existing-submit') {
        P.linkCatalogTask(state, catalog, formNode.dataset.curriculumId, String(data.get('manualTaskId')));
        const saved = persist();
        closeModal(false);
        rerenderAt({ action: 'toggle-task', moduleId, section, curriculumId: formNode.dataset.curriculumId });
        announce('Tâche existante rattachée sans doublon.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'profile') {
        C.setProfile(state, String(data.get('nickname')));
        const saved = persist();
        rerenderAt({ action: 'profile', field: 'nickname' }, { resetForm: formNode });
        announce('Pseudo modifié.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'customize') {
        C.customizeModule(state, moduleId, { name: String(data.get('name')), emoji: String(data.get('emoji')), color: String(data.get('color')) });
        const saved = persist();
        rerenderAt({ action: 'customize', moduleId, field: 'name' }, { resetForm: formNode });
        announce('Module personnalisé.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'reset-confirm') {
        if (modalContext?.action !== 'reset-final') return;
        if (String(data.get('confirmation')).trim() !== 'RÉINITIALISER') {
          setFormError(formNode, 'Saisis exactement RÉINITIALISER pour confirmer.', 'confirmation');
          return;
        }
        const result = store.reset();
        if (!result.ok) {
          setFormError(formNode, result.message || 'Réinitialisation annulée : copie de secours impossible.', 'confirmation');
          return;
        }
        state = result.state;
        storageResult = result;
        closeModal(false);
        renderStorage();
        if (window.location.hash !== '#/') window.location.hash = '#/';
        else route();
        announce('Réinitialisation terminée. Les sept modules et le catalogue sont conservés ; toutes les cases sont décochées.');
      }
    } catch (error) {
      setFormError(formNode, error.message || 'Cette modification est impossible.', action === 'profile' ? 'nickname' : action === 'customize' ? 'name' : action === 'import-private-links' ? 'linksFile' : 'title');
    }
  });
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  window.addEventListener('hashchange', () => route());
  // Un autre onglet ne doit jamais écraser silencieusement la session courante.
  window.addEventListener('storage', event => {
    if (event.key === 's1quest_data' || event.key === null) {
      storageResult = { ok: false, status: 'conflict', message: 'Les données stockées ont changé dans un autre onglet. Vos changements sont conservés en mémoire ; exportez-les, puis rechargez pour relire la version stockée.' };
      renderStorage();
    }
  });
  if (loaded.status === 'new') persist();
  else renderStorage();
  route({ focus: false });
  showCurriculumStatus('Chargement du parcours pédagogique…');
  loadCurriculum().catch(() => { showCurriculumStatus('Le catalogue ne peut pas être affiché. Vos données sont conservées et les tâches personnelles restent accessibles.', 'error'); });
})();

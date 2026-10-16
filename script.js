(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.S1QuestCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
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

  function validateState(state) {
    if (!isObject(state)) throw new Error('Les données enregistrées ne sont pas un objet valide.');
    if (state.schemaVersion !== SCHEMA_VERSION) throw new Error('Version de sauvegarde non prise en charge.');
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

  // No earlier S1 QUEST schema is recognised in Phase 1. A later migration must
  // validate its source and create a verified raw backup before transforming it.
  function migrateState(state) {
    if (!isObject(state) || !Number.isInteger(state.schemaVersion) || state.schemaVersion !== SCHEMA_VERSION) {
      throw new Error('Aucune migration sûre n’est disponible pour cette version.');
    }
    return validateState(state);
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
      if (isObject(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== SCHEMA_VERSION) {
        return this.protect('unsupported', 'Cette sauvegarde utilise une version non prise en charge.');
      }
      try {
        return { state: migrateState(parsed), status: 'loaded', message: 'Sauvegarde locale chargée.' };
      } catch (error) {
        return this.protect('corrupt', 'La structure de la sauvegarde est invalide : ' + error.message);
      }
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
    validateState, migrateState, addTask, editTask, toggleTask, deleteTask,
    setProfile, customizeModule, Store
  });
});

// Interface navigateur : aucune exécution DOM lors des tests Node.js.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const C = globalThis.S1QuestCore;
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
      if (storageResult.status === 'corrupt' || storageResult.status === 'unsupported' || storageResult.status === 'invalid' || storageResult.status === 'conflict' || storageResult.status === 'protected') {
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
    const overall = C.semesterStats(state);
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
    append(heading, append(el('div'), el('h2', '', 'Tes modules'), el('p', '', 'Ajoute tes chapitres, TD et TP réels pour commencer.')), el('span', 'count-label', '7 MODULES'));
    const grid = el('div', 'module-grid');
    state.modules.forEach((module, position) => {
      const summary = C.moduleStats(module);
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
    append(checkLabel, checkbox, el('span', 'task-title', task.title));
    const data = { moduleId: module.id, section, taskId: task.id };
    const actions = el('div', 'task-actions');
    const edit = button('Modifier', 'edit-task', 'button subtle compact', data);
    edit.setAttribute('aria-label', 'Modifier : ' + task.title);
    const remove = button('Supprimer', 'delete-task', 'button danger compact', data);
    remove.setAttribute('aria-label', 'Supprimer : ' + task.title);
    append(actions, edit, remove);
    append(row, checkLabel, actions);
    return row;
  }
  function renderModule(module) {
    document.title = module.name + ' — S1 QUEST';
    const back = link('← Tous les modules', '#/', 'breadcrumb');
    const title = accent(el('div', 'module-title'), module.color);
    const icon = el('span', 'module-icon', module.emoji);
    icon.setAttribute('aria-hidden', 'true');
    append(title, icon, append(el('div'), el('p', 'eyebrow', 'MON PARCOURS · SEMESTRE 01'), el('h1', '', module.name)));
    const summary = C.moduleStats(module);
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
        for (const completed of [false, true]) {
          const group = tasks.filter(task => task.completed === completed);
          const sectionGroup = el('div', 'task-group');
          const groupTitle = (completed ? 'Terminées' : 'À faire') + ' · ' + group.length;
          const list = el('ul', 'task-list');
          group.forEach(task => list.append(renderTask(module, section, task)));
          append(sectionGroup, el('h3', '', groupTitle));
          if (group.length) sectionGroup.append(list);
          panel.append(sectionGroup);
        }
      }
      const addForm = form('add-task', { moduleId: module.id, section }, 'add-task');
      append(addForm, textField('Nouvelle tâche · ' + labels[section], 'title', '', 120, { placeholder: 'Titre du chapitre ou de la série…', autocomplete: 'off' }), submit('＋ Ajouter une tâche'));
      panel.append(addForm);
      view.append(panel);
    }
    append(view, el('p', 'coverage-note', 'Chaque tâche a le même poids. La bibliothèque de ressources sera ajoutée en Phase 1.5. Aucune consultation de document ni mécanique RPG ne modifie cette progression.'));
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
    append(backupDescription, el('h2', '', 'Sauvegarde JSON'), el('p', 'settings-help', 'Télécharge une copie externe de tes données actuelles. L’export ne contient que la Phase 1 ; l’import est prévu pour une phase ultérieure.'));
    append(backupRow, backupDescription, button('↓ Exporter mes données', 'export', 'button primary'));
    append(backups, backupRow, el('p', 'settings-help', 'Le stockage est propre à ce navigateur et à cette adresse. Il ne synchronise pas tes appareils et peut être effacé par le navigateur. Une copie locale de secours ne remplace pas un export.'));
    const danger = el('section', 'panel danger-zone');
    append(danger, el('h2', '', 'Réinitialisation'), el('p', 'settings-help', 'Supprime les tâches, le pseudo et la personnalisation S1 QUEST. Tu retrouveras les sept modules vides. Une copie de secours locale est requise avant de remplacer des données existantes.'), button('Réinitialiser les données', 'reset-start', 'button danger'));
    append(view, profile, customization, backups, danger);
  }
  function route({ focus = true } = {}) {
    if (modal.open) closeModal(false);
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
  function rerenderAt(target, { resetForm = null } = {}) {
    // Une action sur une tâche ne doit pas effacer un titre non soumis ailleurs.
    const key = node => [node.dataset.action, node.dataset.moduleId || '', node.dataset.section || ''].join(':');
    const drafts = new Map();
    for (const current of view.querySelectorAll('form')) {
      if (current === resetForm) continue;
      drafts.set(key(current), Array.from(current.elements)
        .filter(field => field.name && !['submit', 'button'].includes(field.type))
        .map(field => ({ name: field.name, value: field.value })));
    }
    const scroll = window.scrollY;
    route({ focus: false });
    for (const current of view.querySelectorAll('form')) {
      for (const draft of drafts.get(key(current)) || []) {
        const field = current.elements.namedItem(draft.name);
        if (field) field.value = draft.value;
      }
    }
    if (target) {
      const nodes = Array.from(view.querySelectorAll('[data-action]'));
      const match = nodes.find(node => node.dataset.action === target.action && (!target.moduleId || node.dataset.moduleId === target.moduleId) && (!target.section || node.dataset.section === target.section) && (!target.taskId || node.dataset.taskId === target.taskId));
      const focusNode = match?.tagName === 'FORM' ? match.elements.namedItem(target.field || 'title') : match;
      (focusNode || $('#main')).focus({ preventScroll: true });
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
    const task = module?.sections[data.section]?.find(item => item.id === data.taskId);
    if (!task) return;
    const editor = form('edit-task-submit', data);
    append(editor, modalHeading('Modifier la tâche'), textField('Titre de la tâche', 'title', task.title, 120), append(el('div', 'dialog-buttons'), button('Annuler', 'close-modal', 'button subtle'), submit('Enregistrer')));
    openModal(editor, { action: 'edit', ...data }, trigger);
    requestAnimationFrame(() => { const field = editor.elements.namedItem('title'); field.focus(); field.select(); });
  }
  function showDelete(data, trigger) {
    const task = getModule(data.moduleId)?.sections[data.section]?.find(item => item.id === data.taskId);
    if (!task) return;
    const box = el('div');
    const cancel = button('Annuler', 'close-modal', 'button subtle');
    cancel.autofocus = true;
    append(box, modalHeading('Supprimer cette tâche ?'), el('p', '', 'La tâche « ' + task.title + ' » sera supprimée. Cette action est irréversible et modifiera les compteurs de progression.'), append(el('div', 'dialog-buttons'), cancel, button('Supprimer cette tâche', 'confirm-delete', 'button danger')));
    openModal(box, { action: 'delete', ...data }, trigger);
  }
  function resetStart(trigger) {
    const box = el('div');
    const cancel = button('Annuler', 'close-modal', 'button subtle');
    cancel.autofocus = true;
    append(box, modalHeading('Réinitialiser ton espace ?'), el('p', '', 'Toutes tes tâches S1 QUEST, ton pseudo et la personnalisation seront remplacés par les valeurs initiales. Les données de l’ancien site Déclic ne sont pas concernées.'), el('div', 'notice', 'Exporte d’abord ton JSON pour conserver une copie externe. Une seconde confirmation sera nécessaire.'), button('↓ Exporter avant de continuer', 'export', 'button subtle'), append(el('div', 'dialog-buttons'), cancel, button('Continuer', 'reset-continue', 'button danger')));
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
        C.deleteTask(state, context.moduleId, context.section, context.taskId);
        const saved = persist();
        closeModal(false);
        rerenderAt({ action: 'add-task', moduleId: context.moduleId, section: context.section });
        announce('Tâche supprimée.' + (saved ? '' : ' Attention : sauvegarde non confirmée.'));
        break;
      }
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
    C.toggleTask(state, moduleId, section, taskId, checkbox.checked);
    const saved = persist();
    rerenderAt({ action: 'toggle-task', moduleId, section, taskId });
    announce('Tâche ' + (checkbox.checked ? 'terminée' : 'à faire') + '. Progression recalculée.' + (saved ? '' : ' Sauvegarde non confirmée.'));
  });
  document.addEventListener('input', event => {
    const formNode = event.target.closest('form');
    if (formNode) clearFormError(formNode);
  });
  document.addEventListener('submit', event => {
    const formNode = event.target;
    const action = formNode.dataset.action;
    if (!action) return;
    event.preventDefault();
    clearFormError(formNode);
    const data = new FormData(formNode);
    const { moduleId, section, taskId } = formNode.dataset;
    try {
      if (action === 'add-task') {
        C.addTask(state, moduleId, section, String(data.get('title')));
        const saved = persist();
        rerenderAt({ action, moduleId, section }, { resetForm: formNode });
        announce('Tâche ajoutée.' + (saved ? '' : ' Sauvegarde non confirmée.'));
      } else if (action === 'edit-task-submit') {
        C.editTask(state, moduleId, section, taskId, String(data.get('title')));
        const saved = persist();
        closeModal(false);
        rerenderAt({ action: 'edit-task', moduleId, section, taskId });
        announce('Titre modifié.' + (saved ? '' : ' Sauvegarde non confirmée.'));
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
        announce('Réinitialisation terminée. Les sept modules sont vides.');
      }
    } catch (error) {
      setFormError(formNode, error.message || 'Cette modification est impossible.', action === 'profile' ? 'nickname' : action === 'customize' ? 'name' : 'title');
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
})();

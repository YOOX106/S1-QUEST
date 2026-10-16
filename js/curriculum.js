(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.S1Curriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/;
  const MODULE_SECTIONS = {
    analyse1: ['cours', 'td'], algebre1: ['cours', 'td'], algebre2: ['cours', 'td'],
    thermodynamique: ['cours', 'td'], mecanique: ['cours', 'td'],
    informatique1: ['cours', 'td', 'tp'], methodologie: ['cours']
  };
  const own = (object, key) => Object.hasOwn(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function validId(value) { return typeof value === 'string' && ID.test(value); }
  function text(value, maxLength = 120) {
    return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maxLength &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }
  function fail(message) { throw new Error(message); }

  // This only validates the URL shape. It does not assert Drive permissions or availability.
  function validateDriveUrl(value) {
    try {
      const url = new URL(value);
      const filePath = /^\/file\/d\/([a-zA-Z0-9_-]{10,})(?:\/view|\/preview)?\/?$/.exec(url.pathname);
      const fileId = url.searchParams.get('id');
      const legacyPath = ['/open', '/uc'].includes(url.pathname) && /^[a-zA-Z0-9_-]{10,}$/.test(fileId || '');
      if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password ||
        url.port || (!filePath && !legacyPath)) return false;
      return true;
    } catch (_) { return false; }
  }

  function validateCatalog(catalog) {
    if (!object(catalog) || catalog.schemaVersion !== 1 || !Number.isSafeInteger(catalog.catalogVersion) || catalog.catalogVersion < 1 ||
      !Array.isArray(catalog.modules) || !Array.isArray(catalog.resources) || !Array.isArray(catalog.relations)) {
      fail('Le catalogue pédagogique est invalide ou utilise une version inconnue.');
    }
    const resources = new Map();
    for (const resource of catalog.resources) {
      if (!object(resource) || !validId(resource.id) || resources.has(resource.id) || !text(resource.title) ||
        resource.kind !== 'pdf' || resource.provider !== 'google-drive' ||
        !['private-local', 'public-link'].includes(resource.access) || !object(resource.verification) ||
        !['provided-by-user', 'access-verified'].includes(resource.verification.status) ||
        typeof resource.verification.documentContentVerified !== 'boolean' ||
        (own(resource, 'url') && !validateDriveUrl(resource.url))) fail('Une ressource PDF du catalogue est invalide.');
      if (resource.verification.status === 'access-verified' && !text(resource.verification.checkedAt, 40)) {
        fail('Une vérification d’accès doit comporter sa date.');
      }
      resources.set(resource.id, resource);
    }
    const items = new Map();
    const modules = new Set();
    for (const module of catalog.modules) {
      if (!object(module) || !own(MODULE_SECTIONS, module.id) || modules.has(module.id) || !object(module.sections)) {
        fail('Un module du catalogue est invalide ou dupliqué.');
      }
      modules.add(module.id);
      for (const [section, list] of Object.entries(module.sections)) {
        if (!MODULE_SECTIONS[module.id].includes(section) || !Array.isArray(list)) fail('Une section du catalogue est invalide.');
        const orders = new Set();
        for (const item of list) {
          if (!object(item) || !validId(item.id) || items.has(item.id) || !text(item.title) ||
            !Number.isSafeInteger(item.order) || item.order < 1 || orders.has(item.order) ||
            !Array.isArray(item.resourceIds) || new Set(item.resourceIds).size !== item.resourceIds.length ||
            !item.resourceIds.every(id => resources.has(id)) || !Array.isArray(item.subsections) ||
            !object(item.source) || !['user-provided-title', 'document-verified'].includes(item.source.type) ||
            typeof item.source.verifiedInDocument !== 'boolean') fail('Un chapitre ou TD du catalogue est invalide.');
          orders.add(item.order);
          const subsectionIds = new Set();
          const subsectionOrders = new Set();
          for (const part of item.subsections) {
            if (!object(part) || !validId(part.id) || subsectionIds.has(part.id) || !text(part.title) ||
              !Number.isSafeInteger(part.order) || part.order < 1 || subsectionOrders.has(part.order) ||
              part.verifiedInDocument !== true) fail('Une sous-partie doit provenir du document et posséder un ordre unique.');
            subsectionIds.add(part.id);
            subsectionOrders.add(part.order);
          }
          items.set(item.id, { ...item, moduleId: module.id, section });
        }
      }
    }
    const relations = new Set();
    for (const relation of catalog.relations) {
      const chapter = items.get(relation?.chapterId);
      const td = items.get(relation?.tdId);
      const key = relation?.chapterId + ':' + relation?.tdId;
      if (!object(relation) || !chapter || !td || chapter.section !== 'cours' || td.section !== 'td' ||
        chapter.moduleId !== td.moduleId || !['proposed', 'confirmed'].includes(relation.status) ||
        !text(relation.rationale, 1000) || relations.has(key)) fail('Une association Cours–TD est invalide.');
      relations.add(key);
    }
    return catalog;
  }

  function getItem(catalog, id) {
    if (!catalog || !validId(id)) return null;
    for (const module of catalog.modules) {
      for (const [section, items] of Object.entries(module.sections)) {
        const item = items.find(candidate => candidate.id === id);
        if (item) return { ...item, moduleId: module.id, section };
      }
    }
    return null;
  }
  function manualTask(state, id) {
    for (const module of state.modules) {
      for (const [section, tasks] of Object.entries(module.sections)) {
        const task = tasks.find(candidate => candidate.id === id);
        if (task) return { task, moduleId: module.id, section };
      }
    }
    return null;
  }
  function progressRecord(state, id) {
    if (!validId(id) || !object(state.curriculumProgress)) fail('La progression du catalogue est invalide.');
    if (!own(state.curriculumProgress, id)) {
      state.curriculumProgress[id] = {
        completed: false, createdAt: new Date().toISOString(), completedAt: null,
        titleOverride: null, hidden: false, linkedTaskId: null
      };
    }
    return state.curriculumProgress[id];
  }

  // A projection is a view only: never save it as the user's original data.
  function projectModule(state, moduleId, catalog) {
    const module = state.modules.find(candidate => candidate.id === moduleId);
    if (!module) fail('Module inconnu.');
    const catalogModule = catalog?.modules.find(candidate => candidate.id === moduleId);
    const sections = {};
    for (const [section, manualTasks] of Object.entries(module.sections)) {
      const consumed = new Set();
      const curriculumTasks = (catalogModule?.sections[section] || []).slice().sort((a, b) => a.order - b.order).flatMap(item => {
        const record = own(state.curriculumProgress, item.id) ? state.curriculumProgress[item.id] : null;
        if (record?.hidden) return [];
        const linked = record?.linkedTaskId ? manualTasks.find(task => task.id === record.linkedTaskId) : null;
        if (linked) consumed.add(linked.id);
        return [{
          ...(linked || {}),
          id: linked ? linked.id : 'curr-' + item.id,
          curriculumId: item.id,
          title: record?.titleOverride || item.title,
          completed: linked ? linked.completed : !!record?.completed,
          createdAt: linked ? linked.createdAt : (record?.createdAt || null),
          completedAt: linked ? linked.completedAt : (record?.completedAt || null)
        }];
      });
      sections[section] = curriculumTasks.concat(manualTasks.filter(task => !consumed.has(task.id)).map(task => ({ ...task })));
    }
    return { ...module, sections };
  }
  function projectState(state, catalog) {
    return { ...state, modules: state.modules.map(module => projectModule(state, module.id, catalog)) };
  }
  function toggleCatalog(state, id, completed) {
    if (typeof completed !== 'boolean') fail('L’état de validation est invalide.');
    const record = progressRecord(state, id);
    const linked = record.linkedTaskId && manualTask(state, record.linkedTaskId);
    const task = linked ? linked.task : record;
    if (task.completed !== completed) {
      task.completed = completed;
      task.completedAt = completed ? new Date().toISOString() : null;
    }
    record.completed = task.completed;
    record.completedAt = task.completedAt;
    return record;
  }
  function editCatalogTitle(state, id, title) {
    if (!text(title.trim())) fail('Le titre doit contenir de 1 à 120 caractères valides.');
    const record = progressRecord(state, id);
    record.titleOverride = title.trim();
    const linked = record.linkedTaskId && manualTask(state, record.linkedTaskId);
    if (linked) linked.task.title = record.titleOverride;
    return record;
  }
  function hideCatalog(state, id, hidden = true) {
    if (typeof hidden !== 'boolean') fail('L’état de visibilité est invalide.');
    const record = progressRecord(state, id);
    record.hidden = hidden;
    return record;
  }
  function linkCatalogTask(state, catalog, itemId, manualTaskId) {
    const item = getItem(catalog, itemId);
    const linked = manualTask(state, manualTaskId);
    if (!item || !linked || linked.moduleId !== item.moduleId || linked.section !== item.section) {
      fail('Choisis une tâche personnelle du même module et de la même section.');
    }
    for (const [otherId, record] of Object.entries(state.curriculumProgress)) {
      if (otherId !== itemId && record.linkedTaskId === manualTaskId) fail('Cette tâche est déjà rattachée au catalogue.');
    }
    const current = own(state.curriculumProgress, itemId) ? state.curriculumProgress[itemId] : null;
    if (current && current.linkedTaskId && current.linkedTaskId !== manualTaskId) {
      fail('Détache d’abord la tâche personnelle déjà associée.');
    }
    const record = progressRecord(state, itemId);
    // An explicit link adopts the pre-existing personal task, including its completion dates.
    Object.assign(record, {
      linkedTaskId: manualTaskId, completed: linked.task.completed, createdAt: linked.task.createdAt,
      completedAt: linked.task.completedAt, hidden: false
    });
    return record;
  }
  function unlinkCatalogTask(state, catalog, itemId) {
    if (!getItem(catalog, itemId)) fail('Élément du catalogue inconnu.');
    const record = progressRecord(state, itemId);
    const linked = record.linkedTaskId && manualTask(state, record.linkedTaskId);
    if (linked) Object.assign(record, {
      completed: linked.task.completed, createdAt: linked.task.createdAt, completedAt: linked.task.completedAt
    });
    record.linkedTaskId = null;
    return record;
  }

  return Object.freeze({ validateCatalog, validateDriveUrl, getItem, projectModule, projectState,
    toggleCatalog, editCatalogTitle, hideCatalog, linkCatalogTask, unlinkCatalogTask });
});

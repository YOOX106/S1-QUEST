(function (root, factory) {
  const legacy = typeof module === 'object' && module.exports ? require('./curriculum.js') : root.S1Curriculum;
  const api = factory(legacy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.S1MicroCurriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (legacy) {
  'use strict';
  const own = (o, k) => Object.hasOwn(o, k);
  const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const ID = /^[a-z][a-z0-9-]{0,119}$/;
  const CONFIDENCE = new Set(['source_grounded_editorial_microtopic','verified_exercise_headers','verified_source_heading','verified_from_page_images','editorial_page_split_verified_scan','visually_verified_exercises','verified_pdf_operations']);
  const SOURCE_CONFIDENCE = new Set(['topics_identified_in_pdf','verified_table_of_contents','visual_verified_chapter_title','verified_pdf_headings','verified_pdf_heading_filename_mismatch']);
  const SECTIONS = { analyse1:['cours','td'], algebre1:['cours','td'], algebre2:['cours','td'], thermodynamique:['cours','td'], mecanique:['cours','td'], informatique1:['cours','td','tp'], methodologie:['cours'] };
  const ALIASES = { 'analyse1-c01':'a1-cours-01', 'analyse1-c02':'a1-cours-02', 'analyse1-c03':'a1-cours-03', 'analyse1-c04':'a1-cours-04', 'analyse1-td01':'a1-td-01', 'analyse1-td02':'a1-td-02', 'analyse1-td03':'a1-td-03' };
  const fail = message => { throw new Error(message); };
  const text = (s,max=240) => typeof s === 'string' && s.length > 0 && s.length <= max && s.trim() === s && !/[\u0000-\u001f\u007f]/.test(s);
  const safeId = id => typeof id === 'string' && ID.test(id) && !['constructor','prototype'].includes(id);
  function resourceId(id) {
    const a = /^analyse1:(cours|td):([1-4])$/.exec(id);
    return a ? 'a1-resource-' + a[1] + '-' + a[2].padStart(2,'0') : 'source-' + id.replaceAll(':','-');
  }
  function validateCatalog(input) {
    const raw = input?.normalizedMicro ? input.sourceCatalog : input;
    if (!object(raw) || raw.format !== 's1quest_curriculum_microtasks' || raw.version !== 1 || !Array.isArray(raw.modules) || raw.modules.length !== 7 || !object(raw.sources) || !Array.isArray(raw.suggested_course_td_links) || !Array.isArray(raw.review_needed)) fail('Catalogue de micro-missions invalide ou version inconnue.');
    if (raw.privacy?.contains_private_urls !== false || raw.privacy?.no_public_repo_private_file_ids !== true) fail('Le catalogue doit être dépourvu de liens privés.');
    // No full PDF text or private file identifiers are needed by this public catalog.
    if (/https?:\/\/|\/file\/d\//i.test(JSON.stringify(raw))) fail('Le catalogue public ne doit contenir aucune URL.');
    const sources = new Map();
    for (const [id, source] of Object.entries(raw.sources)) {
      if (!/^[a-z0-9]+:(cours|td|tp):[a-z0-9]+$/.test(id) || !object(source) || !own(SECTIONS,source.module) || !SECTIONS[source.module].includes(source.section) || !id.startsWith(source.module+':'+source.section+':') || !text(source.filename,240) || source.drive_url !== null || source.visibility !== 'private_by_default' || typeof source.content_inspected !== 'boolean' || !(source.pdf_pages === null || (Number.isSafeInteger(source.pdf_pages) && source.pdf_pages > 0))) fail('Référence source invalide.');
      sources.set(id,source);
    }
    const ids = new Set(); const groups = new Map();
    const checkId = id => { if (!safeId(id) || ids.has(id)) fail('Identifiant académique invalide ou dupliqué.'); ids.add(id); };
    const normalizedModules = [];
    for (let index=0;index<raw.modules.length;index++) {
      const module = raw.modules[index];
      if (!object(module) || module.id !== Object.keys(SECTIONS)[index] || !text(module.name) || !object(module.sections)) fail('Les sept modules et leur ordre doivent rester fixes.');
      const sections = {};
      for (const key of Object.keys(module.sections)) if (!['cours','td','tp'].includes(key)) fail('Section inconnue.');
      for (const section of ['cours','td','tp']) {
        const parents = module.sections[section];
        if (!Array.isArray(parents) || (!SECTIONS[module.id].includes(section) && parents.length)) fail('Section non autorisée pour ce module.');
        if (!SECTIONS[module.id].includes(section)) continue;
        sections[section] = parents.map((parent, position) => {
          if (!object(parent) || !text(parent.title) || (own(parent,'source_confidence') && !SOURCE_CONFIDENCE.has(parent.source_confidence)) || !Array.isArray(parent.units) || !sources.has(parent.source_id)) fail('Chapitre ou série invalide.');
          checkId(parent.id);
          const source = sources.get(parent.source_id);
          if (source.module !== module.id || source.section !== section) fail('Source de chapitre hors module ou section.');
          const group = { ...parent, moduleId:module.id, section, order:position+1, sourceId:parent.source_id, resourceIds:[resourceId(parent.source_id)], sourceConfidence:parent.source_confidence || 'provided_catalog', legacyId:ALIASES[parent.id] || null };
          group.units = parent.units.map((unit, unitPosition) => {
            if (!object(unit) || !text(unit.title) || unit.type !== section || !sources.has(unit.source_id) || !CONFIDENCE.has(unit.confidence) || (own(unit,'optional') && typeof unit.optional !== 'boolean') || !Number.isInteger(unit.duration_hint_minutes) || unit.duration_hint_minutes < 1 || unit.duration_hint_minutes > 1440) fail('Micro-mission invalide.');
            checkId(unit.id);
            const source = sources.get(unit.source_id);
            if (source.module !== module.id || source.section !== section) fail('Source de micro-mission hors module ou section.');
            if (own(unit,'pdf_page') && (!Number.isSafeInteger(unit.pdf_page) || unit.pdf_page < 1 || source.pdf_pages === null || unit.pdf_page > source.pdf_pages)) fail('Page PDF hors limites.');
            if (own(unit,'pdf_pages') && (!Array.isArray(unit.pdf_pages) || unit.pdf_pages.length !== 2 || !unit.pdf_pages.every(Number.isSafeInteger) || unit.pdf_pages[0] < 1 || unit.pdf_pages[1] < unit.pdf_pages[0] || source.pdf_pages === null || unit.pdf_pages[1] > source.pdf_pages)) fail('Plage PDF hors limites.');
            return { ...unit, moduleId:module.id, section, groupId:parent.id, order:unitPosition+1, sourceId:unit.source_id, resourceIds:[resourceId(unit.source_id)], optional:unit.optional === true || parent.id === 'informatique1-tpbonus', durationHintMinutes:unit.duration_hint_minutes, pdfPage:unit.pdf_page || null, pdfPages:unit.pdf_pages || null };
          });
          groups.set(parent.id,group);
          return group;
        });
      }
      normalizedModules.push({ ...module, sections });
    }
    const relations = []; const relationIds = new Set();
    for (const relation of raw.suggested_course_td_links) {
      const course=groups.get(relation?.cours_id), td=groups.get(relation?.td_id);
      const key=relation?.cours_id+':'+relation?.td_id;
      if (!course || !td || course.section !== 'cours' || td.section !== 'td' || course.moduleId !== td.moduleId || relation.status !== 'proposed_not_confirmed' || !text(relation.reason,1000) || !['high','medium','low'].includes(relation.confidence) || relationIds.has(key)) fail('Association Cours–TD invalide.');
      relationIds.add(key);
      relations.push({ chapterId:course.id,tdId:td.id,status:'proposed',rationale:relation.reason,confidence:relation.confidence });
    }
    return { schemaVersion:1,catalogVersion:raw.version,normalizedMicro:true,sourceCatalog:raw,modules:normalizedModules,relations,resources:[...sources].map(([id,s])=>({id:resourceId(id),title:s.filename,filename:s.filename,kind:'pdf',provider:'google-drive',access:'private-local',sourceId:id,pdfPages:s.pdf_pages,sourceMeta:s,verification:{status:'provided-by-user',documentContentVerified:false}})) };
  }
  function getGroups(catalog,moduleId,section) { return catalog?.modules.find(m=>m.id===moduleId)?.sections[section] || []; }
  function getItem(catalog,id) {
    if (!catalog) return null;
    for (const module of catalog.modules) for (const parents of Object.values(module.sections)) for (const group of parents) {
      if (group.id===id) return group;
      const leaf=group.units.find(u=>u.id===id); if (leaf) return leaf;
    }
    return null;
  }
  function getUnits(catalog,moduleId=null,section=null) {
    return (catalog?.modules || []).filter(m=>!moduleId||m.id===moduleId).flatMap(m=>Object.entries(m.sections).filter(([s])=>!section||s===section).flatMap(([,groups])=>groups.flatMap(g=>g.units)));
  }
  function getLegacyRecord(state, groupId) { const id=ALIASES[groupId]; return id && state.curriculumProgress[id] || null; }
  function findManual(state,id) {
    for (const m of state.modules) for (const [section,tasks] of Object.entries(m.sections)) {const task=tasks.find(t=>t.id===id); if(task) return {task,moduleId:m.id,section};}
    return null;
  }
  function record(state,id) {
    if (!safeId(id) || !/-[ue][0-9]+$/.test(id) || !object(state.unitProgress)) fail('Progression de micro-mission invalide.');
    if (!own(state.unitProgress,id)) state.unitProgress[id]={completed:false,createdAt:new Date().toISOString(),completedAt:null,startedAt:null,mastery:'unknown',hidden:false,titleOverride:null,linkedTaskId:null,optionalIncluded:false};
    return state.unitProgress[id];
  }
  function projectModule(state,moduleId,catalog) {
    const module=state.modules.find(m=>m.id===moduleId); if(!module) fail('Module inconnu.');
    const legacyLinked = new Set(Object.values(state.curriculumProgress).map(r=>r.linkedTaskId).filter(Boolean));
    const sections={};
    for (const [section,manuals] of Object.entries(module.sections)) {
      const consumed=new Set();
      const leaves=getUnits(catalog,moduleId,section).flatMap(unit=>{
        const r=state.unitProgress[unit.id]; if(r?.hidden || getLegacyRecord(state,unit.groupId)?.hidden) return [];
        const linked=r?.linkedTaskId && manuals.find(t=>t.id===r.linkedTaskId);
        if(linked) consumed.add(linked.id);
        return [{...(linked||{}),id:linked?linked.id:'curr-'+unit.id,curriculumId:unit.id,groupId:unit.groupId,title:r?.titleOverride||unit.title,completed:linked?linked.completed:!!r?.completed,createdAt:linked?linked.createdAt:r?.createdAt||null,completedAt:linked?linked.completedAt:r?.completedAt||null,startedAt:r?.startedAt||null,mastery:r?.mastery||'unknown',optional:unit.optional && !r?.optionalIncluded,isBonus:unit.optional}];
      });
      sections[section]=leaves.concat(manuals.filter(t=>!consumed.has(t.id)).map(t=>({...t,legacyOnly:legacyLinked.has(t.id)})));
    }
    return {...module,sections};
  }
  function projectState(state,catalog) { return {...state,modules:state.modules.map(m=>projectModule(state,m.id,catalog))}; }
  function toggleCatalog(state,id,completed) {
    if(typeof completed!=='boolean') fail('Validation invalide.'); const r=record(state,id), linked=r.linkedTaskId&&findManual(state,r.linkedTaskId), t=linked?linked.task:r;
    if(t.completed!==completed){t.completed=completed;t.completedAt=completed?new Date().toISOString():null;}
    r.completed=t.completed;r.completedAt=t.completedAt;
    if(completed && !r.startedAt) r.startedAt=r.completedAt;
    return r;
  }
  function startUnit(state,id) { const r=record(state,id);if(!r.startedAt)r.startedAt=new Date().toISOString();return r; }
  function setMastery(state,id,mastery) { if(!['unknown','review','understood','mastered'].includes(mastery))fail('État de compréhension invalide.');const r=record(state,id);r.mastery=mastery;return r; }
  function includeOptional(state,id,include) {if(typeof include!=='boolean')fail('Choix bonus invalide.');record(state,id).optionalIncluded=include;}
  function editCatalogTitle(state,id,title) {if(typeof title!=='string'||!text(title.trim(),120))fail('Le titre doit contenir de 1 à 120 caractères.');const r=record(state,id);r.titleOverride=title.trim();const t=r.linkedTaskId&&findManual(state,r.linkedTaskId);if(t)t.task.title=r.titleOverride;return r;}
  function hideCatalog(state,id,hidden=true) {if(typeof hidden!=='boolean')fail('Visibilité invalide.');record(state,id).hidden=hidden;}
  function linkCatalogTask(state,catalog,id,manualId) {
    const unit=getItem(catalog,id), m=findManual(state,manualId);if(!unit||unit.units||!m||m.moduleId!==unit.moduleId||m.section!==unit.section)fail('Choisis une tâche personnelle de la même section.');
    if(Object.entries(state.unitProgress).some(([key,r])=>key!==id&&r.linkedTaskId===manualId))fail('Cette tâche est déjà associée à une micro-mission.');
    const r=record(state,id);if(r.linkedTaskId&&r.linkedTaskId!==manualId)fail('Détache la tâche existante avant de changer.');
    Object.assign(r,{linkedTaskId:manualId,completed:m.task.completed,createdAt:m.task.createdAt,completedAt:m.task.completedAt,hidden:false});return r;
  }
  function unlinkCatalogTask(state,catalog,id){const r=record(state,id);const m=r.linkedTaskId&&findManual(state,r.linkedTaskId);if(m)Object.assign(r,{completed:m.task.completed,createdAt:m.task.createdAt,completedAt:m.task.completedAt});r.linkedTaskId=null;return r;}
  function status(task) {return task.mastery==='review'?'review':task.completed?'completed':task.startedAt?'in_progress':'not_started';}
  function matches(task,filter='all',query='') {return (filter==='all'||(filter==='completed'?task.completed:status(task)===filter))&&task.title.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr').trim());}
  function nextMission(state,catalog,skipId=null) {
    const tasks=Object.values(projectState(state,catalog).modules).flatMap(m=>Object.values(m.sections).flat()).filter(t=>t.curriculumId&&!t.optional&&t.curriculumId!==skipId);
    return tasks.find(t=>t.mastery==='review') || tasks.find(t=>!t.completed&&t.startedAt) || tasks.find(t=>!t.completed) || null;
  }
  return Object.freeze({validateCatalog,validateDriveUrl:legacy.validateDriveUrl,getItem,getGroups,getUnits,getLegacyRecord,projectModule,projectState,toggleCatalog,startUnit,setMastery,includeOptional,editCatalogTitle,hideCatalog,linkCatalogTask,unlinkCatalogTask,status,matches,nextMission});
});

'use strict';

// Run with: node --test tests/microbrowser.cjs
// Exercises the real application with Chromium. All Drive URLs below are fixtures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const rawCatalog = require('../curriculum.json');
const courseGroups = rawCatalog.modules[0].sections.cours;
const tdGroups = rawCatalog.modules[0].sections.td;
const firstCourseId = courseGroups[0].units[0].id;
const firstTDId = tdGroups[0].units[0].id;
const fakeURL = 'https://drive.google.com/file/d/PHASE_B_FIXTURE_DOCUMENT_001/view';
let browser;
let server;
let baseURL;

before(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      // Deliberately do not read or serve the user's private ignored overlay.
      if (pathname.endsWith('/curriculum.links.local.json')) throw new Error('Private file');
      const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(root + path.sep)) throw new Error('Forbidden path');
      const bytes = await fs.readFile(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox']
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function curriculumLoaded(page) {
  await page.waitForFunction(() => {
    const banner = document.querySelector('#curriculum-status');
    return banner && !banner.textContent.includes('Chargement du parcours');
  });
}

async function session(options = {}) {
  const { privateLinks = null, initialRaw = null, ...browserOptions } = options;
  const context = await browser.newContext({ acceptDownloads: true, ...browserOptions });
  await context.route('**/curriculum.links.local.json', route => privateLinks
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, links: privateLinks }) })
    : route.fulfill({ status: 404, body: 'Not found' }));
  if (initialRaw !== null) await context.addInitScript(raw => {
    if (!sessionStorage.getItem('microbrowser-seeded')) {
      localStorage.setItem('s1quest_data', raw);
      sessionStorage.setItem('microbrowser-seeded', 'yes');
    }
  }, initialRaw);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/`);
  await curriculumLoaded(page);
  return { context, page, errors };
}

const action = (page, name) => page.locator(`[data-action="${name}"]`);
const group = (page, id) => page.locator(`.curriculum-group[data-group-id="${id}"]`);
const unit = (page, id) => page.locator(`.curriculum-task[data-curriculum-id="${id}"]`);
const checkbox = (page, id) => unit(page, id).locator(`[data-action="toggle-task"][data-curriculum-id="${id}"]`);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('s1quest_data')));
const storedRaw = page => page.evaluate(() => localStorage.getItem('s1quest_data'));

async function openModule(page, id = 'analyse1') {
  await page.goto(`${baseURL}/#/module/${id}`);
  await page.locator(`form[data-action="add-task"][data-module-id="${id}"]`).first().waitFor();
}

async function expandGroup(page, id) {
  const target = group(page, id);
  if (!(await target.evaluate(element => element.open))) await target.locator(':scope > summary').click();
  return target;
}

async function revealUnit(page, id, groupId) {
  await expandGroup(page, groupId);
  for (let attempt = 0; attempt < 30 && !(await unit(page, id).count()); attempt++) {
    const more = page.locator(`[data-action="show-more"][data-group-id="${groupId}"]`);
    assert.equal(await more.count(), 1, `Missing pagination control for ${id}`);
    await more.click();
  }
  await unit(page, id).waitFor();
}

async function addPersonalTask(page, title, moduleId = 'analyse1', section = 'cours') {
  const form = page.locator(`form[data-action="add-task"][data-module-id="${moduleId}"][data-section="${section}"]`);
  await form.locator('[name="title"]').fill(title);
  await form.locator('[type="submit"]').click();
  await page.getByText(title, { exact: true }).first().waitFor();
}

async function downloadJSON(page) {
  const downloading = page.waitForEvent('download');
  await action(page, 'export').first().click();
  const downloaded = await downloading;
  return JSON.parse(await fs.readFile(await downloaded.path(), 'utf8'));
}

async function sectionProgress(page, section) {
  const progress = page.locator(`#section-${section} .section-stats progress`).first();
  return { max: Number(await progress.getAttribute('max')), value: Number(await progress.getAttribute('value')) };
}

test('MB01 — real chapters/TD keep source order, parents are not tasks and leaves are progressively revealed', async () => {
  const { context, page, errors } = await session();
  try {
    for (const module of rawCatalog.modules) assert.ok(await page.locator(`a[href="#/module/${module.id}"]`).count());
    await openModule(page);
    const groupIds = selector => page.locator(selector).evaluateAll(items => items.map(item => item.dataset.groupId));
    assert.deepEqual(await groupIds('#section-cours .curriculum-group'), courseGroups.map(item => item.id));
    assert.deepEqual(await groupIds('#section-td .curriculum-group'), tdGroups.map(item => item.id));
    assert.equal(await page.locator('.curriculum-group > summary input[type="checkbox"]').count(), 0, 'no parent completion checkbox');
    const first = await expandGroup(page, courseGroups[0].id);
    const leafIds = () => first.locator('.curriculum-task').evaluateAll(items => items.map(item => item.dataset.curriculumId));
    const initial = await leafIds();
    assert.ok(initial.length > 0 && initial.length < courseGroups[0].units.length, 'long groups use progressive disclosure');
    assert.deepEqual(initial, courseGroups[0].units.slice(0, initial.length).map(item => item.id));
    await first.locator('[data-action="show-more"]').click();
    const more = await leafIds();
    assert.ok(more.length > initial.length);
    assert.deepEqual(more, courseGroups[0].units.slice(0, more.length).map(item => item.id));
    assert.deepEqual(await sectionProgress(page, 'cours'), { max: 52, value: 0 });
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 0 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB02 — starting, understanding, reviewing and completion are distinct; Cours and TD percentages are independent', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await unit(page, firstCourseId).locator('[data-action="start-unit"]').click();
    let record = (await stored(page)).unitProgress[firstCourseId];
    assert.ok(record.startedAt);
    assert.equal(record.completed, false);
    const mastery = unit(page, firstCourseId).locator('select[data-action="mastery"]');
    await mastery.selectOption('understood');
    record = (await stored(page)).unitProgress[firstCourseId];
    assert.equal(record.mastery, 'understood');
    assert.equal(record.completed, false, 'understanding alone never completes a mission');
    await mastery.selectOption('review');
    await checkbox(page, firstCourseId).check();
    record = (await stored(page)).unitProgress[firstCourseId];
    assert.equal(record.mastery, 'review', 'a completed mission may still require revision');
    assert.ok(record.completedAt);
    assert.deepEqual(await sectionProgress(page, 'cours'), { max: 52, value: 1 });
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 0 });
    await checkbox(page, firstTDId).check();
    assert.deepEqual(await sectionProgress(page, 'cours'), { max: 52, value: 1 });
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 1 });
    const before = await stored(page);
    await page.reload();
    await curriculumLoaded(page);
    assert.deepEqual(await stored(page), before);
    assert.equal(await checkbox(page, firstCourseId).isChecked(), true);
    assert.equal(await unit(page, firstCourseId).locator('select[data-action="mastery"]').inputValue(), 'review');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB03 — proposed pedagogical relation opens the appropriate TD without locking access or completing its course', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    const chapter = await expandGroup(page, 'analyse1-c02');
    const link = chapter.locator('[data-action="go-to-td"][data-target-id="analyse1-td02"]');
    assert.equal(await link.count(), 1);
    assert.match(await chapter.innerText(), /propos|confirm/i, 'the supplied association must not be presented as independently confirmed');
    await link.click();
    assert.equal(await group(page, 'analyse1-td02').evaluate(element => element.open), true);
    const td = 'analyse1-td02-e01';
    await checkbox(page, td).check();
    assert.deepEqual(await sectionProgress(page, 'cours'), { max: 52, value: 0 });
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 1 });
    assert.equal((await stored(page)).unitProgress['analyse1-c02-u01'], undefined);
    assert.equal(await page.locator('.relation-status.confirmed').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB04 — bonus completion is retained without inflating mandatory TD progression', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    const bonus = tdGroups[0].units.find(item => item.optional);
    assert.ok(bonus, 'source catalogue must contain the expected explicitly optional exercise');
    await revealUnit(page, bonus.id, tdGroups[0].id);
    assert.match(await unit(page, bonus.id).innerText(), /bonus|facultatif|optionnel/i);
    await checkbox(page, bonus.id).check();
    assert.equal((await stored(page)).unitProgress[bonus.id].completed, true);
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 0 });
    await page.reload();
    await curriculumLoaded(page);
    await revealUnit(page, bonus.id, tdGroups[0].id);
    assert.equal(await checkbox(page, bonus.id).isChecked(), true);
    assert.deepEqual(await sectionProgress(page, 'td'), { max: 37, value: 0 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB05 — private PDF mapping opens a real link target but never completes a mission or leaks into public cache/export', async () => {
  const { context, page, errors } = await session({ privateLinks: { 'a1-resource-cours-01': fakeURL } });
  try {
    await openModule(page);
    const pdf = group(page, 'analyse1-c01').locator('a.resource-link').first();
    assert.equal(await pdf.getAttribute('href'), fakeURL);
    assert.equal(await pdf.getAttribute('target'), '_blank');
    assert.match(await pdf.getAttribute('rel'), /noopener/);
    assert.match(await pdf.getAttribute('rel'), /noreferrer/);
    const before = await stored(page);
    await context.route('https://drive.google.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<title>Private PDF fixture</title><p>Not a real Google Drive document.</p>'
    }));
    const opening = page.waitForEvent('popup');
    await pdf.click();
    const popup = await opening;
    await popup.waitForLoadState();
    assert.equal(popup.url(), fakeURL);
    await popup.close();
    assert.deepEqual(await stored(page), before);
    const cache = await page.evaluate(() => localStorage.getItem('s1quest_curriculum_cache'));
    assert.equal(cache.includes('PHASE_B_FIXTURE_DOCUMENT_001'), false);
    assert.equal(JSON.stringify(await downloadJSON(page)).includes('PHASE_B_FIXTURE_DOCUMENT_001'), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB06 — locally associating a missing PDF rejects executable URLs and preserves the private link after reload', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    const source = group(page, 'analyse1-c01');
    assert.equal(await source.locator('a.resource-link').count(), 0);
    await source.locator('[data-action="associate-pdf"][data-resource-id="a1-resource-cours-01"]').first().click();
    const form = page.locator('form[data-action="associate-pdf-submit"]');
    await form.locator('[name="url"]').fill('javascript:window.S1_TEST_INJECTED=1');
    await form.locator('[type="submit"]').click();
    assert.equal(await source.locator('a.resource-link').count(), 0);
    assert.equal(await page.evaluate(() => window.S1_TEST_INJECTED), undefined);
    await form.locator('[name="url"]').fill(fakeURL);
    await form.locator('[type="submit"]').click();
    await source.locator('a.resource-link').first().waitFor();
    assert.equal(await source.locator('a.resource-link').first().getAttribute('href'), fakeURL);
    await page.reload();
    await curriculumLoaded(page);
    assert.equal(await group(page, 'analyse1-c01').locator('a.resource-link').first().getAttribute('href'), fakeURL);
    assert.equal((await stored(page)).unitProgress[firstCourseId], undefined);
    assert.equal((await page.evaluate(() => localStorage.getItem('s1quest_curriculum_cache'))).includes('PHASE_B_FIXTURE_DOCUMENT_001'), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB07 — versioned migration backs up the original and preserves old chapter completion without completing all its new leaves', async () => {
  const C = require('../script.js');
  const legacy = C.createState();
  C.setProfile(legacy, 'PROFIL CONSERVÉ');
  const personal = C.addTask(legacy, 'analyse1', 'cours', 'Ancienne mission personnelle');
  C.toggleTask(legacy, 'analyse1', 'cours', personal.id, true);
  legacy.schemaVersion = 2;
  delete legacy.unitProgress;
  const oldCompletion = '2026-09-15T12:00:00.000Z';
  legacy.curriculumProgress = { 'a1-cours-01': {
    completed: true, createdAt: oldCompletion, completedAt: oldCompletion,
    titleOverride: 'Mon chapitre personnalisé', hidden: false, linkedTaskId: null
  } };
  const raw = JSON.stringify(legacy);
  const { context, page, errors } = await session({ initialRaw: raw });
  try {
    const migrated = await stored(page);
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.profile.nickname, 'PROFIL CONSERVÉ');
    assert.deepEqual(migrated.modules, legacy.modules);
    assert.deepEqual(migrated.curriculumProgress, legacy.curriculumProgress);
    assert.deepEqual(migrated.unitProgress, {});
    const backups = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('s1quest_backup_')).map(key => localStorage.getItem(key)));
    assert.ok(backups.includes(raw));
    await openModule(page);
    assert.equal(await checkbox(page, firstCourseId).isChecked(), false);
    assert.match(await group(page, 'analyse1-c01').innerText(), /ancien|historique|précédent/i);
    assert.deepEqual(await sectionProgress(page, 'cours'), { max: 53, value: 1 }, 'personal task survives while the old parent is excluded');
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await curriculumLoaded(page);
      assert.equal(await page.locator('.curriculum-group').count(), 7);
      assert.deepEqual(await stored(page), migrated, 'reload/import must be idempotent');
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB08 — search/filter follows study state and missing Methodologie content remains explicit', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await unit(page, firstCourseId).locator('select[data-action="mastery"]').selectOption('review');
    await action(page, 'filter-units').selectOption('review');
    assert.equal(await page.locator('.curriculum-task').count(), 1);
    assert.equal(await unit(page, firstCourseId).count(), 1);
    await action(page, 'filter-units').selectOption('all');
    const query = action(page, 'search-units');
    await query.fill('Archimède');
    assert.equal(await query.inputValue(), 'Archimède');
    assert.equal(await query.evaluate(element => element === document.activeElement), true);
    const matches = page.locator('.curriculum-task');
    assert.equal(await matches.count(), 1, 'search must include leaves beyond the first page');
    assert.match(await matches.innerText(), /Archimède/);
    await openModule(page, 'methodologie');
    assert.equal(await page.locator('.curriculum-task').count(), 0);
    assert.equal(await page.locator('.curriculum-group').count(), 0);
    assert.equal(await page.locator('form[data-action="add-task"]').count(), 1);
    assert.match(await page.locator('body').innerText(), /attente|manquant|disponible|configurer|aucun/i);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB09 — progress import previews first, requires the explicit word, backs up current data and round-trips all progress', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await checkbox(page, firstCourseId).check();
    await unit(page, firstCourseId).locator('select[data-action="mastery"]').selectOption('mastered');
    await addPersonalTask(page, 'Mission dans la sauvegarde');
    const exported = await downloadJSON(page);
    assert.equal(exported.schemaVersion, 3);
    await addPersonalTask(page, 'Mission ajoutée après sauvegarde');
    const rawBefore = await storedRaw(page);
    await page.goto(`${baseURL}/#/settings`);
    const importForm = page.locator('form[data-action="import-progress"]');
    await importForm.locator('input[name="progressFile"]').setInputFiles({
      name: 's1quest-progress-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported))
    });
    await importForm.locator('[type="submit"]').click();
    const confirmation = page.locator('form[data-action="confirm-import"]');
    await confirmation.waitFor();
    assert.equal(await storedRaw(page), rawBefore, 'preview must not replace active storage');
    await confirmation.locator('[name="confirmation"]').fill('PAS MAINTENANT');
    await confirmation.locator('[type="submit"]').click();
    assert.equal(await storedRaw(page), rawBefore, 'incorrect confirmation must not import');
    await confirmation.locator('[name="confirmation"]').fill('IMPORTER');
    await confirmation.locator('[type="submit"]').click();
    await page.waitForFunction(expected => localStorage.getItem('s1quest_data') === expected, JSON.stringify(exported));
    assert.deepEqual(await stored(page), exported);
    const backups = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('s1quest_backup_')).map(key => localStorage.getItem(key)));
    assert.ok(backups.includes(rawBefore), 'the replaced state must remain recoverable');
    await page.reload();
    await curriculumLoaded(page);
    assert.deepEqual(await stored(page), exported);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB10 — corrupt storage is protected and its exact original can still be exported', async () => {
  const raw = '{"schemaVersion":3,"modules":broken';
  const { context, page, errors } = await session({ initialRaw: raw });
  try {
    assert.equal(await storedRaw(page), raw);
    assert.match(await page.locator('body').innerText(), /corromp|invalide|protég|illisible/i);
    const downloading = page.waitForEvent('download');
    await action(page, 'export-raw').click();
    const downloaded = await downloading;
    assert.equal(await fs.readFile(await downloaded.path(), 'utf8'), raw);
    await page.reload();
    await curriculumLoaded(page);
    assert.equal(await storedRaw(page), raw);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB11 — quota failure leaves saved progress intact and permits exporting unsaved work', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await addPersonalTask(page, 'Déjà sauvegardé');
    const rawBefore = await storedRaw(page);
    await page.evaluate(() => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === 's1quest_data') throw new DOMException('Test quota full', 'QuotaExceededError');
        return nativeSet.call(this, key, value);
      };
    });
    await addPersonalTask(page, 'En mémoire après quota');
    assert.equal(await storedRaw(page), rawBefore);
    assert.match(await page.locator('body').innerText(), /échec|mémoire|plein|bloqué/i);
    const exported = await downloadJSON(page);
    assert.ok(exported.modules[0].sections.cours.some(task => task.title === 'En mémoire après quota'));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB12 — a concurrent valid storage change is never silently overwritten by an older tab state', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await addPersonalTask(page, 'Base du premier onglet');
    const concurrent = await stored(page);
    concurrent.profile.nickname = 'AUTRE ONGLET';
    const concurrentRaw = JSON.stringify(concurrent);
    await page.evaluate(value => localStorage.setItem('s1quest_data', value), concurrentRaw);
    await addPersonalTask(page, 'Modification du premier onglet');
    assert.equal(await storedRaw(page), concurrentRaw);
    assert.match(await page.locator('body').innerText(), /onglet|conflit|recharg|modifi/i);
    const exported = await downloadJSON(page);
    assert.ok(exported.modules[0].sections.cours.some(task => task.title === 'Modification du premier onglet'));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB13 — real mission controls work by keyboard and module/settings/review/resource pages fit a mobile viewport', async () => {
  const { context, page, errors } = await session({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const checkWidth = async () => {
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(dimensions.scroll <= dimensions.viewport + 1, JSON.stringify(dimensions));
    };
    await checkWidth();
    await openModule(page);
    const first = checkbox(page, firstCourseId);
    await first.focus();
    await first.press('Space');
    assert.equal(await first.isChecked(), true);
    const editButton = unit(page, firstCourseId).locator('[data-action="edit-task"]');
    await editButton.focus();
    await editButton.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.ok(await dialog.getAttribute('aria-labelledby') || await dialog.getAttribute('aria-label'));
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    await checkWidth();
    await page.screenshot({ path: '/tmp/s1quest-phase-b-mobile.png', fullPage: true });
    for (const route of ['#/settings', '#/revisions', '#/resources', '#/module/informatique1']) {
      await page.goto(`${baseURL}/${route}`);
      assert.doesNotMatch(await page.locator('#main').innerText(), /404/);
      await checkWidth();
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB14 — jumping to a suggested TD clears the completed filter and search without restoring stale form drafts', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await checkbox(page, firstCourseId).check();
    await action(page, 'filter-units').selectOption('completed');
    await action(page, 'search-units').fill(courseGroups[0].units[0].title);
    assert.equal(await page.locator('.curriculum-task').count(), 1);
    const beforeNavigation = await stored(page);

    await group(page, courseGroups[0].id)
      .locator('[data-action="go-to-td"][data-target-id="analyse1-td01"]')
      .click();
    await unit(page, firstTDId).waitFor();

    assert.equal(await action(page, 'filter-units').inputValue(), 'all');
    assert.equal(await action(page, 'search-units').inputValue(), '');
    assert.ok(await page.locator('.curriculum-task').count() > 1);
    assert.equal(await checkbox(page, firstTDId).isChecked(), false);
    assert.deepEqual(await stored(page), beforeNavigation, 'navigation must not change any completion or mastery state');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('MB15 — relative assets and hash routes load under the GitHub Pages base path', async () => {
  const {context,page,errors}=await session({reducedMotion:'reduce'});
  try {
    await context.route('**/S1-QUEST/**',async route=>{
      const requested=new URL(route.request().url());
      const relative=requested.pathname.slice('/S1-QUEST/'.length);
      const response=await route.fetch({url:baseURL+'/'+relative});
      await route.fulfill({response});
    });
    await page.goto(baseURL+'/S1-QUEST/#/module/analyse1');
    await curriculumLoaded(page);
    assert.equal(await page.locator('.curriculum-group').count(),7);
    await checkbox(page,firstCourseId).check();
    await page.reload();
    await curriculumLoaded(page);
    assert.equal(await checkbox(page,firstCourseId).isChecked(),true);
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    await page.goto(baseURL+'/S1-QUEST/#/unknown-route');
    assert.match(await page.locator('#main').innerText(),/introuvable/);
    assert.equal((await stored(page)).unitProgress[firstCourseId].completed,true);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});

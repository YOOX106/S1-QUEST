'use strict';

// Run: node --test tests/browser.cjs
// Uses an existing Playwright installation and Chromium, no app dependency/build.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let browser;
let server;
let baseURL;

before(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      // Never read the real ignored private overlay, even when a route fails to intercept.
      if (pathname.endsWith('/curriculum.links.local.json')) throw new Error('Private file');
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw new Error('Forbidden path');
      const data = await fs.readFile(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(data);
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

async function session(options = {}) {
  const { privateLinks = null, ...browserOptions } = options;
  const context = await browser.newContext({ acceptDownloads: true, ...browserOptions });
  // Tests never read the real ignored overlay or call Google Drive.
  await context.route('**/curriculum.links.local.json', route => privateLinks
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, links: privateLinks }) })
    : route.fulfill({ status: 404, body: 'Not found' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/`);
  await curriculumLoaded(page);
  return { context, page, errors };
}

async function curriculumLoaded(page) {
  await page.waitForFunction(() => {
    const banner = document.querySelector('#curriculum-status');
    return banner && !banner.textContent.includes('Chargement du parcours');
  });
}

const action = (page, name) => page.locator(`[data-action="${name}"]`);
const manualAction = (page, name) => page.locator(`.task-row:not(.curriculum-task) [data-action="${name}"]`);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('s1quest_data')));

async function openModule(page, id = 'algebre1') {
  await page.goto(`${baseURL}/#/module/${id}`);
  await page.locator(`form[data-action="add-task"][data-module-id="${id}"]`).first().waitFor();
}

async function addTask(page, title, section = 'cours', id = 'algebre1') {
  const form = page.locator(`form[data-action="add-task"][data-module-id="${id}"][data-section="${section}"]`);
  await form.locator('[name="title"]').fill(title);
  await form.locator('[type="submit"]').click();
  await page.getByText(title.trim(), { exact: true }).first().waitFor();
}

async function downloadJSON(page) {
  const downloaded = page.waitForEvent('download');
  await action(page, 'export').first().click();
  const download = await downloaded;
  const file = await download.path();
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

test('T01–T07 — first launch keeps seven modules and each module’s exact permitted sections', async () => {
  const { context, page, errors } = await session();
  try {
    const ids = ['analyse1', 'algebre1', 'algebre2', 'thermodynamique', 'mecanique', 'informatique1', 'methodologie'];
    for (const id of ids) assert.ok(await page.locator(`a[href="#/module/${id}"]`).count() > 0);
    assert.match(await page.locator('body').innerText(), /À configurer/);
    assert.equal(await action(page, 'toggle-task').count(), 0);
    await openModule(page, 'informatique1');
    assert.equal(await page.locator('form[data-action="add-task"]').count(), 3);
    await openModule(page, 'methodologie');
    assert.equal(await page.locator('form[data-action="add-task"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T14–T18,T21 — add, hostile-title edit, toggle, reload and precise confirmed deletion', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await addTask(page, 'Limites');
    await addTask(page, 'Continuité', 'td');
    let data = await stored(page);
    const firstId = data.modules[1].sections.cours[0].id;

    const tdDraft = page.locator('form[data-action="add-task"][data-section="td"] [name="title"]');
    await tdDraft.fill('Brouillon TD non soumis');
    await manualAction(page, 'toggle-task').first().check();
    assert.equal(await tdDraft.inputValue(), 'Brouillon TD non soumis', 'task action must preserve another section draft');
    data = await stored(page);
    assert.equal(data.modules[1].sections.cours[0].completed, true);
    assert.ok(data.modules[1].sections.cours[0].completedAt);
    await page.reload();
    assert.equal((await stored(page)).modules[1].sections.cours[0].id, firstId);
    assert.equal(await manualAction(page, 'toggle-task').first().isChecked(), true);

    await manualAction(page, 'edit-task').first().click();
    const edit = page.locator('form[data-action="edit-task-submit"]');
    const hostile = '<img src=x onerror="window.S1_INJECTED=1">';
    await edit.locator('[name="title"]').fill(hostile);
    await edit.locator('[type="submit"]').click();
    await page.getByText(hostile, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.S1_INJECTED), undefined);
    assert.equal(await page.locator('img[src="x"]').count(), 0);

    await manualAction(page, 'delete-task').first().click();
    await action(page, 'close-modal').first().click();
    assert.equal((await stored(page)).modules[1].sections.cours.length, 1);
    await manualAction(page, 'delete-task').first().click();
    await action(page, 'confirm-delete').click();
    data = await stored(page);
    assert.equal(data.modules[1].sections.cours.length, 0);
    assert.equal(data.modules[1].sections.td.length, 1);
    assert.equal(data.modules[1].sections.td[0].title, 'Continuité');

    for (let i = 0; i < 3; i++) {
      await page.goto(`${baseURL}/#/`);
      await page.goto(`${baseURL}/#/module/algebre1`);
    }
    const form = page.locator('form[data-action="add-task"][data-section="cours"]');
    const input = form.locator('[name="title"]');
    await input.focus();
    await input.pressSequentially('Dérivées', { delay: 20 });
    assert.equal(await input.inputValue(), 'Dérivées');
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
    await form.locator('[type="submit"]').click();
    data = await stored(page);
    assert.equal(data.modules[1].sections.cours.length, 1, 'no duplicate listeners after rerouting');
    assert.notEqual(data.modules[1].sections.cours[0].id, firstId);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T19–T20 — settings persist with stable routes, history and internal 404', async () => {
  const { context, page, errors } = await session();
  try {
    await page.goto(`${baseURL}/#/settings`);
    const profile = page.locator('form[data-action="profile"]');
    await profile.locator('[name="nickname"]').fill('AMINE TEST');
    await profile.locator('[type="submit"]').click();
    const customize = page.locator('form[data-action="customize"][data-module-id="analyse1"]');
    const otherDraft = page.locator('form[data-action="customize"][data-module-id="algebre1"] [name="name"]');
    await otherDraft.fill('Brouillon Algèbre non soumis');
    await customize.locator('[name="name"]').fill('Analyse à mon rythme');
    await customize.locator('[name="emoji"]').fill('📐');
    const color = customize.locator('[name="color"]');
    if (await color.evaluate(element => element.tagName === 'SELECT')) await color.selectOption({ index: 1 });
    await customize.locator('[type="submit"]').click();
    assert.equal(await otherDraft.inputValue(), 'Brouillon Algèbre non soumis', 'saving one module must preserve another unsaved module');
    await page.reload();
    assert.equal(await profile.locator('[name="nickname"]').inputValue(), 'AMINE TEST');
    assert.equal(await customize.locator('[name="name"]').inputValue(), 'Analyse à mon rythme');
    await openModule(page, 'analyse1');
    assert.match(await page.locator('body').innerText(), /Analyse à mon rythme/);
    assert.equal(new URL(page.url()).hash, '#/module/analyse1');
    await page.goto(`${baseURL}/#/settings`);
    await page.goBack();
    assert.equal(new URL(page.url()).hash, '#/module/analyse1');
    await page.goForward();
    assert.equal(new URL(page.url()).hash, '#/settings');
    await page.goto(`${baseURL}/#/introuvable`);
    assert.match(await page.locator('body').innerText(), /404/);
    assert.ok(await page.locator('a[href="#/"]').count() > 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('E01–E03 — JSON download is complete; reset needs both confirmations and preserves backup/legacy data', async () => {
  const { context, page, errors } = await session();
  try {
    await page.evaluate(() => localStorage.setItem('declic-revisions-v1', '{"kept":true}'));
    await openModule(page);
    await addTask(page, 'À sauvegarder');
    const rawBefore = await page.evaluate(() => localStorage.getItem('s1quest_data'));
    const exported = await downloadJSON(page);
    assert.equal(exported.schemaVersion, 3);
    assert.equal(exported.modules[1].sections.cours[0].title, 'À sauvegarder');
    assert.deepEqual(exported, JSON.parse(rawBefore), 'export must contain the complete current state');

    await page.goto(`${baseURL}/#/settings`);
    await action(page, 'reset-start').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), rawBefore);
    await action(page, 'close-modal').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), rawBefore);
    await action(page, 'reset-start').click();
    await action(page, 'reset-continue').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), rawBefore);
    const confirmation = page.locator('form[data-action="reset-confirm"]');
    await confirmation.locator('[name="confirmation"]').fill('RÉINITIALISER');
    await confirmation.locator('[type="submit"]').click();
    const resetState = await stored(page);
    assert.equal(resetState.modules.flatMap(module => Object.values(module.sections).flat()).length, 0);
    const backups = await page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('s1quest_backup_')).map(key => localStorage.getItem(key)));
    assert.ok(backups.includes(rawBefore));
    assert.equal(await page.evaluate(() => localStorage.getItem('declic-revisions-v1')), '{"kept":true}');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T23 — corrupt storage remains recoverable instead of being overwritten', async () => {
  const context = await browser.newContext();
  const raw = '{"schemaVersion":1,"modules":corrupted';
  await context.addInitScript(value => {
    if (!sessionStorage.getItem('test-corrupt-initialized')) {
      localStorage.setItem('s1quest_data', value);
      sessionStorage.setItem('test-corrupt-initialized', '1');
    }
  }, raw);
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/`);
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), raw);
    assert.match(await page.locator('body').innerText(), /corromp|invalide|protég|illisible/i);
    const rawDownload = page.waitForEvent('download');
    await action(page, 'export-raw').click();
    const original = await rawDownload;
    assert.equal(await fs.readFile(await original.path(), 'utf8'), raw);
    await page.goto(`${baseURL}/#/settings`);
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), raw);
  } finally { await context.close(); }
});

test('T23,E01 — quota failure visibly warns and permits export of unsaved in-memory changes', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page);
    await addTask(page, 'Déjà sauvegardé');
    const rawBefore = await page.evaluate(() => localStorage.getItem('s1quest_data'));
    await page.evaluate(() => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === 's1quest_data') throw new DOMException('Quota full', 'QuotaExceededError');
        return nativeSet.call(this, key, value);
      };
    });
    await addTask(page, 'En mémoire uniquement');
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_data')), rawBefore);
    assert.match(await page.locator('body').innerText(), /Échec|mémoire|plein|bloqué/i);
    const exported = await downloadJSON(page);
    assert.ok(exported.modules[1].sections.cours.some(task => task.title === 'En mémoire uniquement'));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T24a — Chromium mobile viewport has no horizontal overflow and usable forms', async () => {
  const { context, page, errors } = await session({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const checkWidth = async () => {
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      assert.ok(dimensions.scroll <= dimensions.viewport + 1, JSON.stringify(dimensions));
    };
    await checkWidth();
    await openModule(page);
    await addTask(page, 'Révision mobile');
    await checkWidth();
    await page.goto(`${baseURL}/#/settings`);
    await checkWidth();
    await page.screenshot({ path: '/tmp/s1quest-curriculum-mobile-settings.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T24b — tasks can be added/toggled using keyboard, and dialogs keep accessible names', async () => {
  const { context, page, errors } = await session();
  try {
    const initialHash = new URL(page.url()).hash;
    await page.keyboard.press('Tab');
    assert.equal(await action(page, 'skip-main').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, initialHash);
    assert.equal(await page.locator('#main').evaluate(element => element === document.activeElement), true);
    await openModule(page);
    const input = page.locator('form[data-action="add-task"][data-section="cours"] [name="title"]');
    await input.focus();
    await input.pressSequentially('Clavier');
    await input.press('Enter');
    await page.getByText('Clavier', { exact: true }).waitFor();
    const checkbox = manualAction(page, 'toggle-task').first();
    await checkbox.focus();
    await checkbox.press('Space');
    assert.equal(await checkbox.isChecked(), true);
    const deleteButton = manualAction(page, 'delete-task').first();
    await deleteButton.focus();
    await deleteButton.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const accessibleName = await dialog.getAttribute('aria-labelledby');
    assert.ok(accessibleName || await dialog.getAttribute('aria-label'));
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await deleteButton.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

const courseGroups = ['analyse1-c01', 'analyse1-c02', 'analyse1-c03', 'analyse1-c04'];
const tdGroups = ['analyse1-td01', 'analyse1-td02', 'analyse1-td03'];
const courseIds = courseGroups.map(id => id + '-u01');
const tdIds = tdGroups.map(id => id + '-e01');
const resourceIds = ['a1-resource-cours-01', 'a1-resource-cours-02', 'a1-resource-cours-03', 'a1-resource-cours-04', 'a1-resource-td-01', 'a1-resource-td-02', 'a1-resource-td-03'];
const fakeLinks = Object.fromEntries(resourceIds.map((id, index) => [id,
  `https://drive.google.com/file/d/TEST_FIXTURE_DOCUMENT_${index + 1}/view`]));
const catalogGroup = (page, id) => page.locator(`.curriculum-group[data-group-id="${id}"]`);
const groupPDF = (page, id) => catalogGroup(page, id).locator(':scope > .group-body > .curriculum-resources a.resource-link');
const parentPDFs = page => page.locator('.curriculum-group > .group-body > .curriculum-resources a.resource-link');
const catalogRow = (page, id) => page.locator(`.curriculum-task[data-curriculum-id="${id}"]`);
const catalogCheckbox = (page, id) => catalogRow(page, id).locator('input[type="checkbox"]');
async function expandAllGroups(page) {
  const count = await page.locator('.curriculum-group').count();
  for (let index = 0; index < count; index++) {
    const details = page.locator('.curriculum-group').nth(index);
    if (!(await details.evaluate(node => node.open))) await details.locator(':scope > summary').click();
    await details.locator('.curriculum-task').first().waitFor();
  }
}
const realCatalog = require('../curriculum.json');
const analyseGroups = realCatalog.modules[0].sections;
const firstPageIds = section => analyseGroups[section].flatMap(group => group.units.slice(0, 5).map(unit => unit.id));

test('B01 — Analyse 1 opens four real chapters and three TD in order with safe, correctly mapped PDF links', async () => {
  const { context, page, errors } = await session({ privateLinks: fakeLinks });
  try {
    await openModule(page, 'analyse1');
    await expandAllGroups(page);
    assert.equal(await page.locator('.curriculum-group').count(), 7);
    assert.equal(await page.locator('.curriculum-task').count(), 35);
    for (const section of ['cours', 'td']) {
      assert.deepEqual(await page.locator(`#section-${section} .curriculum-group`).evaluateAll(rows => rows.map(row => row.dataset.groupId)), section === 'cours' ? courseGroups : tdGroups);
      assert.deepEqual(await page.locator(`#section-${section} .curriculum-task`).evaluateAll(rows => rows.map(row => row.dataset.curriculumId)), firstPageIds(section));
    }
    assert.equal(await page.locator('form[data-action="add-task"]').count(), 2);
    assert.equal(await page.locator('.document-parts').count(), 0, 'source micro-missions are represented directly as leaves');
    for (const [index, id] of [...courseGroups, ...tdGroups].entries()) {
      const pdf = groupPDF(page, id);
      assert.equal(await pdf.getAttribute('href'), fakeLinks[resourceIds[index]]);
      assert.equal(await pdf.getAttribute('target'), '_blank');
      const rel = await pdf.getAttribute('rel');
      assert.match(rel, /noopener/);
      assert.match(rel, /noreferrer/);
    }
    assert.equal(await page.locator('.relation-status.confirmed').count(), 0);
    assert.equal(await page.locator('.relation-status.proposed').count(), 4);
    assert.equal(await catalogGroup(page, courseGroups[3]).locator('[data-action="go-to-td"]').count(), 1, 'the supplied fourth-chapter relation remains proposed');
    const before = await stored(page);
    await context.route('https://drive.google.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<title>Test document fixture</title><p>Fixture only</p>'
    }));
    const popupPromise = page.waitForEvent('popup');
    await groupPDF(page, courseGroups[0]).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), fakeLinks[resourceIds[0]]);
    assert.deepEqual(await stored(page), before, 'opening a PDF must not mark any leaf complete');
    await popup.close();
    const cache = await page.evaluate(() => localStorage.getItem('s1quest_curriculum_cache'));
    assert.equal(cache.includes('TEST_FIXTURE_DOCUMENT'), false, 'private overlay links must not enter the public catalog cache');
    assert.equal(JSON.stringify(await downloadJSON(page)).includes('TEST_FIXTURE_DOCUMENT'), false, 'progress export must not include private resource links');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B02 — direct TD access, related-TD navigation, independent percentages, stable order and reload work together', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page, 'analyse1');
    await expandAllGroups(page);
    assert.equal(await parentPDFs(page).count(), 0);
    assert.equal(await page.locator('.curriculum-group > .group-body > .curriculum-resources .resource-missing').count(), 7);
    const course3 = catalogGroup(page, courseGroups[2]);
    await course3.locator('[data-action="go-to-td"][data-target-id="analyse1-td03"]').click();
    assert.equal(await catalogCheckbox(page, tdIds[2]).evaluate(node => node === document.activeElement), true);
    await catalogCheckbox(page, tdIds[2]).check();
    assert.equal(await page.locator('#section-cours .section-stats strong').first().innerText(), '0 %');
    assert.equal(await page.locator('#section-td .section-stats strong').first().innerText(), '2,7 %');
    await catalogCheckbox(page, courseIds[1]).check();
    assert.equal(await page.locator('#section-cours .section-stats strong').first().innerText(), '1,92 %');
    assert.equal(await page.locator('#section-td .section-stats strong').first().innerText(), '2,7 %');
    assert.equal(await page.locator('#section-cours .section-stats progress').first().getAttribute('max'), '52');
    assert.equal(await page.locator('#section-td .section-stats progress').first().getAttribute('max'), '37');
    assert.match(await course3.locator('.associated-td').innerText(), /1 \/ 16 exercices obligatoires terminés/);
    assert.deepEqual(await page.locator('#section-cours .curriculum-task').evaluateAll(rows => rows.map(row => row.dataset.curriculumId)), firstPageIds('cours'));
    const before = await stored(page);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.reload();
      await curriculumLoaded(page);
      await expandAllGroups(page);
      assert.equal(await page.locator('.curriculum-task').count(), 35);
      assert.equal(await catalogCheckbox(page, courseIds[1]).isChecked(), true);
      assert.equal(await catalogCheckbox(page, tdIds[2]).isChecked(), true);
      assert.deepEqual(await stored(page), before);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B03 — imported-title editing and confirmed hide/restore preserve academic progress across reload', async () => {
  const { context, page, errors } = await session();
  try {
    await openModule(page, 'analyse1');
    await catalogCheckbox(page, courseIds[0]).check();
    const completion = (await stored(page)).unitProgress[courseIds[0]].completedAt;
    await catalogRow(page, courseIds[0]).locator('[data-action="edit-task"]').click();
    const edit = page.locator('form[data-action="edit-task-submit"]');
    await edit.locator('[name="title"]').fill('Mon titre personnalisé');
    await edit.locator('[type="submit"]').click();
    assert.match(await catalogRow(page, courseIds[0]).innerText(), /Titre source : Ensembles N, Z, Q et R/);
    await catalogRow(page, courseIds[0]).locator('[data-action="delete-task"]').click();
    await action(page, 'close-modal').click();
    assert.equal(await catalogRow(page, courseIds[0]).count(), 1);
    await catalogRow(page, courseIds[0]).locator('[data-action="delete-task"]').click();
    await action(page, 'confirm-delete').click();
    assert.equal(await catalogRow(page, courseIds[0]).count(), 0);
    await page.reload();
    await curriculumLoaded(page);
    assert.equal(await catalogRow(page, courseIds[0]).count(), 0);
    assert.equal((await stored(page)).unitProgress[courseIds[0]].hidden, true);
    await page.locator('#section-cours .hidden-curriculum summary').click();
    await page.locator('[data-action="restore-catalog"][data-curriculum-id="analyse1-c01-u01"]').click();
    assert.equal(await catalogCheckbox(page, courseIds[0]).isChecked(), true);
    assert.match(await catalogRow(page, courseIds[0]).innerText(), /Mon titre personnalisé/);
    assert.equal((await stored(page)).unitProgress[courseIds[0]].completedAt, completion);
    assert.equal(await page.locator('.curriculum-task').count(), 10);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B04 — browser migrates existing v1 data, keeps original backup and explicitly links an existing completed task', async () => {
  const C = require('../script.js');
  const legacy = C.createState();
  const manual = C.addTask(legacy, 'analyse1', 'cours', 'Chapitre personnel existant');
  C.toggleTask(legacy, 'analyse1', 'cours', manual.id, true);
  C.setProfile(legacy, 'MON PROFIL');
  C.customizeModule(legacy, 'analyse1', { name: 'Mon analyse', emoji: '📐', color: C.PALETTE[1].value });
  legacy.schemaVersion = 1;
  delete legacy.curriculumProgress;
  delete legacy.unitProgress;
  const raw = JSON.stringify(legacy);
  const { context, page, errors } = await session();
  try {
    await page.evaluate(value => localStorage.setItem('s1quest_data', value), raw);
    await page.reload();
    await curriculumLoaded(page);
    const migrated = await stored(page);
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.profile.nickname, 'MON PROFIL');
    assert.deepEqual(migrated.modules, legacy.modules);
    const backups = await page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('s1quest_backup_')).map(key => localStorage.getItem(key)));
    assert.ok(backups.includes(raw));
    await openModule(page, 'analyse1');
    assert.equal(await page.locator('#section-cours .task-row').count(), 6);
    assert.equal(await catalogCheckbox(page, courseIds[0]).isChecked(), false, 'no automatic title matching');
    await catalogRow(page, courseIds[0]).locator('.unit-options summary').click();
    await catalogRow(page, courseIds[0]).locator('[data-action="link-existing"]').click();
    const linkForm = page.locator('form[data-action="link-existing-submit"]');
    await linkForm.locator('[name="manualTaskId"]').selectOption(manual.id);
    await linkForm.locator('[type="submit"]').click();
    assert.equal(await page.locator('#section-cours .task-row').count(), 5);
    assert.equal(await catalogCheckbox(page, courseIds[0]).isChecked(), true);
    const linkedState = await stored(page);
    assert.deepEqual(linkedState.modules[0].sections.cours[0], manual);
    assert.equal(linkedState.unitProgress[courseIds[0]].linkedTaskId, manual.id);
    assert.equal(await page.locator('#section-cours .section-stats strong').first().innerText(), '1,92 %');
    await page.reload();
    await curriculumLoaded(page);
    assert.equal(await catalogCheckbox(page, courseIds[0]).isChecked(), true);
    assert.equal(await page.locator('#section-cours .task-row').count(), 5);
    assert.deepEqual((await stored(page)).modules[0].sections.cours[0], manual);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B05 — invalid private overlay is rejected as a whole and cannot turn a resource into a script link', async () => {
  const links = { ...fakeLinks, 'a1-resource-td-03': 'javascript:window.S1_INJECTED=1' };
  const { context, page, errors } = await session({ privateLinks: links });
  try {
    await openModule(page, 'analyse1');
    assert.equal(await page.locator('a.resource-link').count(), 0);
    await expandAllGroups(page);
    assert.equal(await page.locator('.curriculum-group > .group-body > .curriculum-resources .resource-missing').count(), 7);
    assert.match(await page.locator('#curriculum-status').innerText(), /invalides|indisponibles/);
    assert.equal(await page.evaluate(() => window.S1_INJECTED), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B06 — Analyse 1 curriculum and controls fit mobile and keyboard navigation', async () => {
  const { context, page, errors } = await session({ privateLinks: fakeLinks, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await openModule(page, 'analyse1');
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(dimensions.scroll <= dimensions.viewport + 1, JSON.stringify(dimensions));
    const checkbox = catalogCheckbox(page, courseIds[0]);
    await checkbox.focus();
    await checkbox.press('Space');
    assert.equal(await checkbox.isChecked(), true);
    await expandAllGroups(page);
    const tdButton = catalogGroup(page, courseGroups[2]).locator('[data-action="go-to-td"][data-target-id="analyse1-td03"]');
    await tdButton.focus();
    await tdButton.press('Enter');
    assert.equal(await catalogCheckbox(page, tdIds[2]).evaluate(node => node === document.activeElement), true);
    await page.screenshot({ path: '/tmp/s1quest-curriculum-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B07 — a delayed catalog never closes a task editor or discards its in-progress title', async () => {
  const { context, page, errors } = await session();
  let release;
  try {
    await openModule(page, 'analyse1');
    await addTask(page, 'Titre personnel sauvegardé', 'cours', 'analyse1');
    const id = (await stored(page)).modules[0].sections.cours[0].id;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/curriculum.json', async route => { await gate; await route.continue(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`.task-row[data-task-id="${id}"] [data-action="edit-task"]`).click();
    const modal = page.getByRole('dialog');
    const field = modal.locator('[name="title"]');
    await field.fill('Brouillon dans la modale');
    assert.equal(await field.evaluate(node => node === document.activeElement), true);
    release();
    await curriculumLoaded(page);
    await page.locator('.curriculum-task').first().waitFor();
    assert.equal(await modal.isVisible(), true);
    assert.equal(await field.inputValue(), 'Brouillon dans la modale');
    assert.equal(await field.evaluate(node => node === document.activeElement), true);
    await modal.locator('[type="submit"]').click();
    assert.equal((await stored(page)).modules[0].sections.cours[0].title, 'Brouillon dans la modale');
    assert.deepEqual(errors, []);
  } finally {
    if (release) release();
    await context.close();
  }
});

test('B08 — browser-local private link import works without publishing links and persists across reload', async () => {
  const { context, page, errors } = await session();
  try {
    const before = await stored(page);
    await page.goto(`${baseURL}/#/settings`);
    const importer = page.locator('form[data-action="import-private-links"]');
    await importer.locator('[name="linksFile"]').setInputFiles({
      name: 'private-links-test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, links: fakeLinks }))
    });
    await importer.locator('[type="submit"]').click();
    await page.waitForFunction(() => localStorage.getItem('s1quest_private_links') !== null);
    assert.deepEqual(await stored(page), before, 'importing links must not mutate any progression or customization');
    const linksBefore = await page.evaluate(() => localStorage.getItem('s1quest_private_links'));
    await openModule(page, 'analyse1');
    await expandAllGroups(page);
    assert.equal(await parentPDFs(page).count(), 7);
    for (const [index, id] of [...courseGroups, ...tdGroups].entries()) {
      assert.equal(await groupPDF(page, id).getAttribute('href'), fakeLinks[resourceIds[index]]);
    }
    await page.reload();
    await curriculumLoaded(page);
    await expandAllGroups(page);
    assert.equal(await parentPDFs(page).count(), 7);
    assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_private_links')), linksBefore);
    assert.equal(JSON.stringify(await downloadJSON(page)).includes('TEST_FIXTURE_DOCUMENT'), false);
    const cache = await page.evaluate(() => localStorage.getItem('s1quest_curriculum_cache'));
    assert.equal(cache.includes('TEST_FIXTURE_DOCUMENT'), false);
    assert.deepEqual(await stored(page), before);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B09 — malformed private-link imports cannot partially replace an existing browser configuration', async () => {
  const { context, page, errors } = await session();
  try {
    await page.goto(`${baseURL}/#/settings`);
    const importer = page.locator('form[data-action="import-private-links"]');
    const upload = async value => {
      await importer.locator('[name="linksFile"]').setInputFiles({
        name: 'private-links-test.json', mimeType: 'application/json',
        buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
      });
      await importer.locator('[type="submit"]').click();
    };
    await upload({ schemaVersion: 1, links: fakeLinks });
    await page.waitForFunction(() => localStorage.getItem('s1quest_private_links') !== null);
    const savedLinks = await page.evaluate(() => localStorage.getItem('s1quest_private_links'));
    const savedProgress = await stored(page);
    for (const invalid of [
      '{broken-json',
      null,
      [],
      { schemaVersion: 1, links: { ...fakeLinks, 'a1-resource-td-03': 'javascript:window.S1_INJECTED=1' } },
      { schemaVersion: 1, links: { ...fakeLinks, 'unknown-resource': 'https://drive.google.com/file/d/TEST_FIXTURE_DOCUMENT_99/view' } }
    ]) {
      await upload(invalid);
      await importer.locator('.field-error').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('s1quest_private_links')), savedLinks);
      assert.deepEqual(await stored(page), savedProgress);
    }
    await openModule(page, 'analyse1');
    await expandAllGroups(page);
    assert.equal(await parentPDFs(page).count(), 7);
    assert.equal(await page.evaluate(() => window.S1_INJECTED), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('B10 — an explicit private-link import stays authoritative when an older local-file request completes later', async () => {
  const { context, page, errors } = await session();
  let release;
  try {
    await page.goto(`${baseURL}/#/settings`);
    const sampleResources = resourceIds.slice(0, 4);
    const oldLinks = Object.fromEntries(sampleResources.map((id, index) => [id,
      `https://drive.google.com/file/d/RACE_OLD_FIXTURE_DOCUMENT_${index + 1}/view`]));
    const newLinks = Object.fromEntries(sampleResources.map((id, index) => [id,
      `https://drive.google.com/file/d/RACE_NEW_FIXTURE_DOCUMENT_${index + 1}/view`]));
    const gate = new Promise(resolve => { release = resolve; });
    let intercept;
    const intercepted = new Promise(resolve => { intercept = resolve; });
    await page.route('**/curriculum.links.local.json', async route => {
      intercept();
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, links: oldLinks }) });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await intercepted;
    const before = await stored(page);
    const importer = page.locator('form[data-action="import-private-links"]');
    await importer.locator('[name="linksFile"]').setInputFiles({
      name: 'new-private-links-test.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, links: newLinks }))
    });
    await importer.locator('[type="submit"]').click();
    await page.waitForFunction(() => localStorage.getItem('s1quest_private_links')?.includes('RACE_NEW_FIXTURE_DOCUMENT'));
    await page.evaluate(() => {
      window.S1_TEST_CURRICULUM_READY = false;
      document.addEventListener('s1quest:curriculum-ready', () => { window.S1_TEST_CURRICULUM_READY = true; }, { once: true });
    });
    release();
    await page.waitForFunction(() => window.S1_TEST_CURRICULUM_READY === true);
    await openModule(page, 'analyse1');
    await expandAllGroups(page);
    assert.equal(await parentPDFs(page).count(), 4);
    for (const [index, id] of courseGroups.entries()) {
      assert.equal(await groupPDF(page, id).getAttribute('href'), newLinks[sampleResources[index]]);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('s1quest_private_links')));
    assert.deepEqual(saved, { schemaVersion: 1, links: newLinks });
    assert.equal((await page.locator('#view').innerHTML()).includes('RACE_OLD_FIXTURE_DOCUMENT'), false);
    assert.deepEqual(await stored(page), before);
    assert.deepEqual(errors, []);
  } finally {
    if (release) release();
    await context.close();
  }
});

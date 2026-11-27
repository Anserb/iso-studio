import { linuxApps, appCategories, appCollections } from './linux-apps.mjs';

export function initAppLibrary({ onBusy }) {
  const $ = id => document.getElementById(id);
  const selected = new Set();
  let installed = new Set();
  let host;
  let category = 'Όλες';
  let busy = false;
  let otherBusy = false;
  let checking = false;
  let following;
  const cards = new Map();
  const names = new Map(linuxApps.map(app => [app.id, app.name]));

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');
  const locked = () => busy || otherBusy || checking || !host?.canInstall;

  function message(text, error = false) {
    $('library-message').hidden = !text;
    $('library-message').textContent = text;
    $('library-message').toggleAttribute('data-error', error);
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Δεν ήταν δυνατή η επικοινωνία με το Linux Studio.');
    return body;
  }

  function refreshControls() {
    for (const [id, controls] of cards) {
      const ready = installed.has(id);
      controls.card.classList.toggle('is-selected', selected.has(id));
      controls.check.checked = selected.has(id);
      controls.check.disabled = ready || busy;
      controls.button.disabled = ready || locked();
      controls.button.textContent = ready ? 'Εγκατεστημένη ✓' : 'Install ↓';
      controls.button.setAttribute('aria-label', ready ? `${names.get(id)}: εγκατεστημένη` : `Εγκατάσταση ${names.get(id)}`);
      controls.state.hidden = !ready;
    }
    $('library-selection-count').textContent = selected.size ? `${selected.size} ${selected.size === 1 ? 'εφαρμογή επιλεγμένη' : 'εφαρμογές επιλεγμένες'}` : 'Καμία επιλογή';
    $('library-install-selected').disabled = !selected.size || locked();
    $('library-clear').disabled = !selected.size || busy;
    $('library-refresh').disabled = busy || checking;
    for (const button of $('library-collections').querySelectorAll('button')) button.disabled = busy;
  }

  function filter() {
    const query = normalize($('library-search').value.trim());
    const onlyInstalled = $('library-installed-only').checked;
    let count = 0;
    for (const app of linuxApps) {
      const visible = (category === 'Όλες' || app.category === category)
        && (!onlyInstalled || installed.has(app.id))
        && (!query || normalize(`${app.name} ${app.description} ${app.category}`).includes(query));
      cards.get(app.id).card.hidden = !visible;
      if (visible) count++;
    }
    $('library-total').textContent = `${count} / ${linuxApps.length} εφαρμογές`;
    $('library-empty').hidden = count !== 0;
  }

  for (const name of ['Όλες', ...appCategories]) {
    const count = name === 'Όλες' ? linuxApps.length : linuxApps.filter(app => app.category === name).length;
    const button = node('button', '', `${name} ${count}`);
    button.type = 'button';
    button.dataset.category = name;
    button.setAttribute('aria-pressed', String(name === category));
    button.addEventListener('click', () => {
      category = name;
      for (const item of $('library-categories').children) item.setAttribute('aria-pressed', String(item === button));
      filter();
    });
    $('library-categories').append(button);
  }

  for (const [index, collection] of appCollections.entries()) {
    const card = node('article', 'library-collection');
    card.dataset.collection = index;
    card.append(node('span', 'library-collection-number', `0${index + 1}`), node('h3', '', collection.name), node('p', '', collection.description));
    const button = node('button', '', 'Επιλογή συλλογής +');
    button.type = 'button';
    button.addEventListener('click', () => {
      const available = collection.apps.filter(id => !installed.has(id));
      for (const id of available) selected.add(id);
      refreshControls();
      message(available.length ? `Προστέθηκαν ${available.length} εφαρμογές από τη συλλογή «${collection.name}». Πάτησε «Install επιλεγμένων» για εγκατάσταση.` : 'Οι εφαρμογές της συλλογής είναι ήδη εγκατεστημένες.');
    });
    card.append(button);
    $('library-collections').append(card);
  }

  for (const app of linuxApps) {
    const card = node('article', 'library-app');
    card.dataset.category = app.category;
    card.dataset.app = app.id;
    const header = node('div', 'library-app-header');
    const monogram = node('span', 'app-monogram', app.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase());
    monogram.setAttribute('aria-hidden', 'true');
    const label = node('label', 'library-app-select');
    const check = node('input');
    check.type = 'checkbox';
    check.setAttribute('aria-label', `Επιλογή ${app.name}`);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(app.id); else selected.delete(app.id);
      refreshControls();
    });
    label.append(check, node('span', 'visually-hidden', `Επιλογή ${app.name}`));
    header.append(monogram, label);
    const state = node('span', 'library-installed-badge', 'Στο Linux σου ✓');
    state.hidden = true;
    const footer = node('div', 'library-app-footer');
    const button = node('button', 'secondary', 'Install ↓');
    button.type = 'button';
    button.addEventListener('click', () => void install([app.id]));
    footer.append(node('span', '', 'FLATHUB'), button);
    card.append(header, node('span', 'library-app-category', app.category), node('h3', '', app.name), node('p', '', app.description), state, footer);
    cards.set(app.id, { card, check, button, state });
    $('library-grid').append(card);
  }

  function renderJob(job) {
    $('library-job').hidden = false;
    const completed = job.results.length;
    $('library-job-count').textContent = `${completed} / ${job.apps.length}`;
    $('library-progress').max = job.apps.length;
    $('library-progress').value = completed;
    const failed = job.results.filter(result => result.state === 'failed');
    const succeeded = job.results.length - failed.length;
    $('library-job-status').textContent = job.state === 'running'
      ? job.current ? `Λήψη και εγκατάσταση: ${names.get(job.current)}…` : 'Προετοιμασία Flatpak και πηγής εφαρμογών…'
      : job.error || (failed.length ? `${succeeded} εγκαταστάθηκαν, ${failed.length} απέτυχαν. Μπορείς να δοκιμάσεις ξανά όσες απέτυχαν.` : `Έτοιμο! Εγκαταστάθηκαν ${succeeded} εφαρμογές. Θα τις βρεις στο μενού εφαρμογών του Linux σου.`);
    $('library-job-status').toggleAttribute('data-error', job.state === 'failed');
    $('library-job-results').replaceChildren(...job.results.map(result => {
      const li = node('li', result.state === 'ready' ? 'app-result-ready' : 'app-result-failed', `${result.state === 'ready' ? '✓' : '×'} ${names.get(result.id)}`);
      if (result.state === 'failed') li.append(node('small', '', result.error));
      else { installed.add(result.id); selected.delete(result.id); }
      return li;
    }));
    const log = $('library-job-log');
    if (log.textContent !== job.log) {
      const bottom = log.scrollHeight - log.clientHeight - log.scrollTop < 32;
      log.textContent = job.log;
      if (bottom) log.scrollTop = log.scrollHeight;
    }
    refreshControls();
    filter();
  }

  async function follow(id) {
    if (following === id) return;
    following = id;
    busy = true;
    onBusy(true);
    refreshControls();
    try {
      while (true) {
        const job = await api(`/api/apps/jobs/${id}`);
        renderJob(job);
        if (job.state !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) { message(`Δεν ήταν δυνατός ο έλεγχος της εγκατάστασης: ${error.message} Πάτησε «Επανέλεγχος» για επανασύνδεση.`, true); }
    finally {
      following = null;
      busy = false;
      onBusy(false);
      await refresh(false);
    }
  }

  async function refresh(reconnect = true) {
    checking = true;
    refreshControls();
    try {
      host = await api('/api/apps/status');
      installed = new Set(host.installed);
      for (const id of installed) selected.delete(id);
      $('library-host-title').textContent = host.distro || 'Ο υπολογιστής σου';
      $('library-host-status').textContent = host.message;
      if (reconnect && host.latestJob) void follow(host.latestJob);
    } catch (error) {
      host = null;
      $('library-host-status').textContent = error.message;
    } finally { checking = false; refreshControls(); filter(); }
  }

  async function install(ids) {
    if (locked()) return;
    busy = true;
    onBusy(true);
    refreshControls();
    message('');
    try {
      const { id } = await api('/api/apps/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apps: ids }) });
      $('library-job').hidden = false;
      $('library-job').scrollIntoView({ behavior: 'smooth', block: 'start' });
      await follow(id);
    } catch (error) { message(error.message, true); }
    finally { busy = false; onBusy(false); refreshControls(); }
  }

  $('library-search').addEventListener('input', filter);
  $('library-installed-only').addEventListener('change', filter);
  $('library-refresh').addEventListener('click', () => { message(''); void refresh(); });
  $('library-clear').addEventListener('click', () => { selected.clear(); refreshControls(); });
  $('library-install-selected').addEventListener('click', () => void install([...selected]));
  document.addEventListener('studio-busy', event => { otherBusy = event.detail; refreshControls(); });
  refreshControls();
  filter();
  void refresh();
}

import { catalog, choicesFor, isoFilename } from './catalog.mjs';
import { initAppLibrary } from './app-library.mjs';
import { initStudio } from './studio-ui.mjs';

const byId = id => document.getElementById(id);
const form = byId('configuration');
const build = byId('build');
const setupBuilder = byId('setup-builder');
const checkBuilder = byId('check-builder');
const hostStatus = byId('host-status');
const result = byId('build-result');
const buildStatus = byId('build-status');
const log = byId('build-log');
const isoLink = byId('iso-link');
const updateCheck = byId('update-check');
const updateStatus = byId('update-status');
const updateInstall = byId('update-install');
const updateFile = byId('update-file');
const updateBanner = byId('update-banner');
const bannerInstall = byId('update-banner-install');
let latestUpdate;
let dismissedUpdate;
let updateTimer;
let installingUpdate = false;
let automaticRestart = false;
let loadedVersion;
let statuses = {};
const pendingEnvironment = { available: false, message: 'Έλεγχος περιβάλλοντος δημιουργίας…' };
let builder = pendingEnvironment;
let busy = false;
let libraryBusy = false;
let studioBusy = false;
let studio;
let checkingEnvironment = false;
const steps = [...document.querySelectorAll('[data-step]')];
const previousStep = byId('previous');
const nextStep = byId('next');
const nameInput = form.elements.namedItem('name');
let currentStep = 0;

function renderRoute() {
  const route = location.hash.slice(1);
  const overview = route === 'overview';
  const library = route === 'linux-apps';
  const studioPage = [...document.querySelectorAll('[data-studio-page]')].find(page => page.id === route);
  for (const page of document.querySelectorAll('[data-studio-page]')) page.hidden = page !== studioPage;
  const showLog = route === 'build-result' && !result.hidden;
  currentStep = showLog ? steps.length - 1 : Math.max(0, steps.findIndex(link => link.dataset.step === route));
  byId('overview').hidden = !overview;
  byId('linux-apps').hidden = !library;
  byId('wizard').hidden = overview || library || Boolean(studioPage);
  for (const [index, link] of steps.entries()) {
    const active = index === currentStep;
    if (active) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
    link.classList.toggle('visited', index < currentStep);
    byId(link.dataset.step).hidden = !active;
  }
  previousStep.disabled = currentStep === 0;
  nextStep.hidden = currentStep === steps.length - 1;
  byId('step-count').textContent = `Βήμα ${currentStep + 1} από ${steps.length}`;
  const currentNav = studioPage ? `#${studioPage.id}` : library ? '#linux-apps' : overview ? '#overview' : showLog ? '#build-result' : '#system';
  for (const link of document.querySelectorAll('.side-nav a')) {
    if (link.getAttribute('href') === currentNav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (showLog) result.scrollIntoView({ block: 'nearest' });
  else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  renderRoute();
  if (document.activeElement === nameInput && !nameInput.validity.valid) return;
  const section = location.hash === '#overview' ? byId('overview')
    : location.hash === '#linux-apps' ? byId('linux-apps')
    : document.querySelector(`[data-studio-page][id="${CSS.escape(location.hash.slice(1))}"]`)
      || (location.hash === '#build-result' && !result.hidden ? result : byId(steps[currentStep].dataset.step));
  const heading = section.querySelector('h1, h2');
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
});
previousStep.addEventListener('click', () => { location.hash = steps[currentStep - 1].dataset.step; });
nextStep.addEventListener('click', () => {
  if (currentStep === 0 && !nameInput.reportValidity()) return;
  location.hash = steps[currentStep + 1].dataset.step;
});

const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  if (window.chrome?.webview) {
    const style = getComputedStyle(document.body);
    const hex = color => '#' + color.match(/[\d.]+/g).slice(0, 3).map(value => Math.round(Number(value)).toString(16).padStart(2, '0')).join('');
    window.chrome.webview.postMessage({ type: 'appearance', theme,
      background: hex(style.backgroundColor), foreground: hex(style.color) });
  }
}
let selectedTheme;
let themeRequest = checkedFetch('/api/appearance')
  .then(response => response.json())
  .then(({ theme }) => { if (!selectedTheme) applyTheme(theme); })
  .catch(() => { /* Keep the default theme if preferences are unavailable. */ });
for (const button of themeButtons) button.addEventListener('click', () => {
  const theme = button.dataset.themeChoice;
  selectedTheme = theme;
  applyTheme(theme);
  themeRequest = themeRequest.then(() => checkedFetch('/api/appearance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  })).catch(() => { /* Keep the chosen theme for the current session. */ });
});

function populateSelect(field, items) {
  const control = form.elements[field];
  const previous = control.value;
  control.replaceChildren(...items.map(item => new Option(item.name, item.id)));
  if (items.some(item => item.id === previous)) control.value = previous;
}

populateSelect('language', catalog.languages);
for (const [index, appearance] of catalog.appearances.entries()) {
  const label = document.createElement('label');
  label.className = 'appearance-choice';
  label.dataset.appearance = appearance.id;
  const input = document.createElement('input');
  Object.assign(input, { type: 'radio', name: 'appearance', value: appearance.id, checked: index === 0 });
  const preview = document.createElement('span');
  preview.className = 'appearance-preview';
  preview.setAttribute('aria-hidden', 'true');
  const window = document.createElement('span');
  window.className = 'appearance-window';
  window.textContent = '−  □  ×';
  const taskbar = document.createElement('span');
  taskbar.className = 'appearance-taskbar';
  taskbar.textContent = '⊞   ▰  ◉';
  preview.append(window, taskbar);
  const title = document.createElement('strong');
  title.textContent = appearance.name;
  const description = document.createElement('small');
  description.textContent = appearance.detail;
  label.append(preview, input, title, description);
  byId('appearance-choices').append(label);
}
const selectedDistro = () => catalog.distros.find(item => item.id === form.elements.distro.value);

function optionInput(type, name, value) {
  const input = document.createElement('input');
  Object.assign(input, { type, name, value });
  return input;
}

const distroCards = {
  debian: ['D', 'Debian', '13 · Trixie'],
  ubuntu: ['U', 'Ubuntu', '24.04 LTS'],
  arch: ['A', 'Arch Linux', 'Rolling release'],
  fedora: ['F', 'Fedora', '44'],
};

for (const [index, distro] of catalog.distros.entries()) {
  const [initial, name, release] = distroCards[distro.id];
  const label = document.createElement('label');
  const input = optionInput('radio', 'distro', distro.id);
  const mark = document.createElement('span');
  const description = document.createElement('span');
  const title = document.createElement('strong');
  const detail = document.createElement('small');
  label.className = 'distro';
  label.dataset.distro = distro.id;
  input.checked = index === 0;
  mark.className = 'distro-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = initial;
  title.textContent = name;
  detail.textContent = release;
  description.append(title, detail);
  label.append(mark, description, input);
  byId('distro-choices').append(label);

  const quick = document.createElement('button');
  quick.type = 'button';
  quick.className = 'quick-distro';
  quick.dataset.distro = distro.id;
  const quickMark = mark.cloneNode(true);
  const tool = document.createElement('small');
  tool.textContent = distro.tool;
  quick.append(quickMark, description.cloneNode(true), tool);
  quick.addEventListener('click', () => {
    input.checked = true;
    configureDistro();
    location.hash = 'system';
  });
  byId('quick-distros').append(quick);
}

function desktopOption(item, choice) {
  const label = document.createElement('label');
  const icon = document.createElement('span');
  const description = document.createElement('span');
  const name = document.createElement('strong');
  const detail = document.createElement('small');
  const input = optionInput('radio', 'desktop', item.id);
  label.className = 'choice';
  icon.className = 'choice-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = item.icon;
  name.textContent = item.name;
  detail.textContent = item.detail;
  input.checked = item.id === choice;
  description.append(name, detail);
  label.append(icon, description, input);
  return label;
}

function appOption(item, distro, checked) {
  const label = document.createElement('label');
  const input = optionInput('checkbox', 'apps', item.id);
  input.checked = checked;
  label.className = 'package';
  label.append(input, item.id === 'firefox' && distro.id === 'debian' ? 'Firefox ESR' : item.name);
  return label;
}

function configureDistro() {
  const distro = selectedDistro();
  const choices = choicesFor(distro);
  const selected = new FormData(form);
  const previousDesktop = selected.get('desktop');
  const desktop = choices.desktops.some(item => item.id === previousDesktop)
    ? previousDesktop : choices.desktops[0].id;
  populateSelect('kernel', distro.kernels);
  populateSelect('keyboard', choices.keyboards);
  const desktopChoices = byId('desktop-choices');
  desktopChoices.replaceChildren(desktopChoices.querySelector('legend'),
    ...choices.desktops.map(item => desktopOption(item, desktop)));
  const appChoices = byId('app-choices');
  const selectedApps = selected.getAll('apps');
  const appGroups = new Map();
  for (const item of choices.apps) {
    if (!appGroups.has(item.category)) appGroups.set(item.category, []);
    appGroups.get(item.category).push(appOption(item, distro, selectedApps.includes(item.id)));
  }
  const groups = [...appGroups].map(([category, options]) => {
    const group = document.createElement('div');
    const heading = document.createElement('h3');
    const optionList = document.createElement('div');
    group.className = 'app-category';
    heading.textContent = category;
    optionList.className = 'app-category-options';
    optionList.append(...options);
    group.append(heading, optionList);
    return group;
  });
  appChoices.replaceChildren(appChoices.querySelector('legend'), ...groups);
  for (const key of ['firmware', 'installer']) {
    const input = form.elements[key];
    input.disabled = !distro[key];
    input.closest('label').hidden = !distro[key];
  }
  byId('extras').hidden = !distro.firmware && !distro.installer;
  byId('installation-note').hidden = !byId('extras').hidden;
  refreshBuilder();
  refreshSummary();
}

function refreshSummary() {
  const distro = selectedDistro();
  const { name, kernel, desktop, language, keyboard } = form.elements;
  const graphical = desktop.value !== 'standard';
  const appearanceChoices = byId('appearance-choices');
  appearanceChoices.disabled = !graphical;
  byId('iso-appearance').hidden = !graphical;
  byId('appearance-terminal').hidden = graphical;
  if (!graphical) form.elements.appearance.value = 'default';
  const appearance = catalog.appearances.find(item => item.id === form.elements.appearance.value);
  const apps = new FormData(form).getAll('apps');
  const selected = distro.kernels.find(item => item.id === kernel.value);
  byId('kernel-package').textContent = selected.id;
  byId('summary-distro').textContent = distro.name;
  byId('summary-kernel').textContent = selected.name;
  byId('summary-desktop').textContent = catalog.desktops.find(item => item.id === desktop.value).name;
  byId('summary-appearance').textContent = graphical ? appearance.name : 'Χωρίς γραφικό περιβάλλον';
  byId('review-appearance').textContent = byId('summary-appearance').textContent;
  byId('summary-apps').textContent = apps.length;
  byId('filename').textContent = name.validity.valid ? isoFilename(name.value, distro.id) : '—';
  byId('review-language').textContent = language.selectedOptions[0].textContent;
  byId('review-keyboard').textContent = keyboard.selectedOptions[0].textContent;
  byId('review-apps').textContent = apps.map(id => id === 'firefox' && distro.id === 'debian'
    ? 'Firefox ESR' : catalog.apps.find(item => item.id === id).name).join(', ') || 'Χωρίς πρόσθετα πακέτα';
  byId('review-firmware').textContent = distro.firmware
    ? (form.elements.firmware.checked ? 'Περιλαμβάνεται' : 'Εκτός εικόνας')
    : 'Προεπιλογές διανομής';
  byId('review-installer').textContent = distro.installer && form.elements.installer.checked ? 'Debian Installer' : 'Εκκίνηση Live';
}

function setHostStatus(message, error = false) {
  hostStatus.textContent = message;
  hostStatus.toggleAttribute('data-error', error);
}

function setBusy(value) {
  busy = value;
  build.disabled = !builder.available || busy || libraryBusy || studioBusy || checkingEnvironment || installingUpdate;
  setupBuilder.disabled = busy || libraryBusy || studioBusy || checkingEnvironment || installingUpdate;
  checkBuilder.disabled = busy || libraryBusy || studioBusy || checkingEnvironment || installingUpdate;
  updateInstall.disabled = busy || libraryBusy || studioBusy || installingUpdate;
  renderUpdateBanner();
  document.dispatchEvent(new CustomEvent('studio-busy', { detail: busy || installingUpdate || libraryBusy || studioBusy }));
}

function refreshBuilder() {
  builder = statuses[selectedDistro().id] ?? pendingEnvironment;
  hostStatus.parentElement.dataset.ready = String(builder.available);
  byId('host-title').textContent = builder.available ? 'Έτοιμο για δημιουργία' : 'Προϋποθέσεις δημιουργίας';
  setHostStatus(checkingEnvironment ? pendingEnvironment.message : builder.message);
  const setupLabels = { wsl: 'Ενεργοποίηση WSL 2', distro: 'Προετοιμασία διανομής', tools: 'Εγκατάσταση εργαλείων ISO' };
  setupBuilder.hidden = !builder.setup;
  if (builder.setup) setupBuilder.textContent = setupLabels[builder.setup];
  setBusy(busy);
}

async function checkedFetch(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? 'Η επικοινωνία με την εφαρμογή απέτυχε.');
  }
  return response;
}

function updateMessage(message, error = false) {
  if (updateStatus.textContent !== message) updateStatus.textContent = message;
  updateStatus.toggleAttribute('data-error', error);
}

function renderUpdateBanner(info = latestUpdate) {
  if (!info) return;
  const blocked = busy || libraryBusy || studioBusy || installingUpdate;
  const key = `${info.status}:${info.version || info.completedVersion || ''}`;
  const states = {
    downloading: ['Λήψη ενημέρωσης…', `Λαμβάνεται και ελέγχεται η έκδοση ${info.version || ''}.`],
    ready: ['Διαθέσιμη ενημέρωση', blocked ? 'Η εγκατάσταση θα είναι διαθέσιμη όταν ολοκληρωθεί η τρέχουσα εργασία.' : `Η έκδοση ${info.version} είναι έτοιμη για εγκατάσταση.`],
    installing: ['Εγκατάσταση ενημέρωσης…', 'Περίμενε να ολοκληρωθεί η εγκατάσταση.'],
    installed: info.restartAutomatic
      ? ['Επανεκκίνηση…', 'Η ενημέρωση εφαρμόζεται και το Linux Studio θα ανοίξει ξανά αυτόματα.']
      : ['Ολοκληρώθηκε η εγκατάσταση', 'Κλείσε και άνοιξε ξανά το Linux Studio για να χρησιμοποιήσεις τη νέα έκδοση.'],
    unavailable: ['Δεν ολοκληρώθηκε ο έλεγχος ενημερώσεων', info.error || 'Μπορείς να δοκιμάσεις ξανά από τις Ενημερώσεις.'],
  };
  const state = states[info.status] || (info.completedVersion ? ['Ολοκληρώθηκε η εγκατάσταση', `Το Linux Studio ${info.completedVersion} είναι έτοιμο.`] : null);
  updateBanner.hidden = !state || dismissedUpdate === key;
  if (!state) return;
  updateBanner.dataset.state = info.status;
  if (byId('update-banner-title').textContent !== state[0]) byId('update-banner-title').textContent = state[0];
  if (byId('update-banner-detail').textContent !== state[1]) byId('update-banner-detail').textContent = state[1];
  bannerInstall.hidden = info.status !== 'ready' || !info.canInstall;
  bannerInstall.disabled = blocked;
  const installLabel = info.restartAutomatic ? 'Εγκατάσταση και επανεκκίνηση' : 'Εγκατάσταση';
  if (bannerInstall.textContent !== installLabel) bannerInstall.textContent = installLabel;
  byId('update-banner-file').hidden = info.status !== 'ready' || info.canInstall;
  byId('update-banner-dismiss').hidden = !['unavailable', 'installed'].includes(info.status)
    && !(info.completedVersion && !['ready', 'downloading', 'installing'].includes(info.status));
}

function renderUpdate(info) {
  latestUpdate = info;
  renderUpdateBanner();
  if (loadedVersion && loadedVersion !== info.current) { location.reload(); return; }
  loadedVersion ??= info.current;
  const active = ['idle', 'checking', 'downloading', 'installing'].includes(info.status);
  const messages = {
    idle: 'Έλεγχος για νέα έκδοση…',
    checking: 'Έλεγχος για νέα έκδοση…',
    downloading: `Λαμβάνεται η έκδοση ${info.version}…`,
    current: 'Έχεις την πιο πρόσφατη έκδοση.',
    ready: `Η έκδοση ${info.version} είναι έτοιμη.`,
    unavailable: 'Ο έλεγχος ενημερώσεων δεν ολοκληρώθηκε.',
    installing: 'Εγκατάσταση ενημέρωσης…',
    installed: info.restartAutomatic
      ? 'Ξεκίνησε η εγκατάσταση. Η εφαρμογή θα ανοίξει ξανά.'
      : 'Η ενημέρωση εγκαταστάθηκε. Κλείσε και άνοιξε ξανά την εφαρμογή.',
  };
  automaticRestart = info.restartAutomatic;
  updateMessage(messages[info.status], info.status === 'unavailable');
  updateCheck.disabled = active || info.status === 'installed';
  updateInstall.hidden = info.status !== 'ready' || !info.canInstall;
  updateInstall.textContent = automaticRestart ? 'Εγκατάσταση και επανεκκίνηση' : 'Εγκατάσταση ενημέρωσης';
  updateFile.hidden = info.status !== 'ready' || info.canInstall;
  if (active && info.status !== 'idle') updateTimer = setTimeout(refreshUpdate, 1250);
}

async function refreshUpdate(action = '') {
  clearTimeout(updateTimer);
  updateCheck.disabled = true;
  try {
    const response = await checkedFetch('/api/update' + action, action ? { method: 'POST' } : undefined);
    renderUpdate(await response.json());
  } catch (error) {
    updateMessage(error.message, true);
    if (action === '/install' || !['installing', 'installed'].includes(latestUpdate?.status)) {
      latestUpdate = { ...latestUpdate, status: 'unavailable', error: error.message };
      renderUpdateBanner();
    }
    updateCheck.disabled = false;
  }
}

updateCheck.addEventListener('click', () => void refreshUpdate('/check'));
bannerInstall.addEventListener('click', () => updateInstall.click());
byId('update-banner-dismiss').addEventListener('click', async () => {
  dismissedUpdate = `${latestUpdate?.status}:${latestUpdate?.version || latestUpdate?.completedVersion || ''}`;
  updateBanner.hidden = true;
  if (latestUpdate?.completedVersion) {
    try { await checkedFetch('/api/update/acknowledge', { method: 'POST' }); }
    catch { /* Keep the dismissal for this session if acknowledgement is unavailable. */ }
  }
});
updateInstall.addEventListener('click', async () => {
  if (busy || libraryBusy || studioBusy || installingUpdate || latestUpdate?.status !== 'ready' || !latestUpdate.canInstall) return;
  installingUpdate = true;
  latestUpdate = { ...latestUpdate, status: 'installing' };
  setBusy(busy);
  updateMessage('Εγκατάσταση ενημέρωσης…');
  try {
    await refreshUpdate('/install');
  } finally {
    installingUpdate = false;
    setBusy(busy);
  }
});

async function followBuild(id) {
  setBusy(true);
  result.hidden = false;
  byId('log-nav').hidden = false;
  if (location.hash === '#build-result') renderRoute();
  isoLink.hidden = true;
  log.textContent = '';
  buildStatus.removeAttribute('data-error');
  buildStatus.textContent = 'Δημιουργία σε εξέλιξη…';

  try {
    let kind;
    while (true) {
      const response = await checkedFetch(`/api/builds/${id}`);
      const job = await response.json();
      if (kind !== job.kind) {
        kind = job.kind;
        byId('build-title').textContent = kind === 'setup' ? 'Προετοιμασία περιβάλλοντος' : 'Καταγραφή δημιουργίας';
        buildStatus.textContent = kind === 'setup' ? 'Εγκατάσταση περιβάλλοντος σε εξέλιξη…' : 'Δημιουργία ISO σε εξέλιξη…';
      }
      if (job.log !== log.textContent) {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        log.textContent = job.log;
        if (atBottom) log.scrollTop = log.scrollHeight;
      }
      if (job.state === 'ready') {
        if (job.kind === 'setup') {
          await loadEnvironment();
          buildStatus.textContent = builder.available ? 'Έτοιμο. Μπορείς να δημιουργήσεις το ISO.' : 'Η εγκατάσταση ολοκληρώθηκε. Έλεγξε τις προϋποθέσεις δημιουργίας.';
          return;
        }
        const size = new Intl.NumberFormat('el', { maximumFractionDigits: 0 }).format(job.bytes / 1024 ** 2);
        buildStatus.textContent = `Έτοιμο · ${size} MiB`;
        if (job.sha256) buildStatus.textContent += ` · SHA-256 ${job.sha256}`;
        isoLink.href = `/api/builds/${id}/iso`;
        isoLink.download = job.filename;
        isoLink.hidden = false;
        return;
      }
      if (job.state === 'failed') throw new Error(kind === 'setup' ? 'Η προετοιμασία απέτυχε. Δες την καταγραφή.' : 'Η δημιουργία απέτυχε. Δες την καταγραφή.');
      await new Promise(resolve => setTimeout(resolve, 1250));
    }
  } catch (error) {
    buildStatus.textContent = error.message;
    buildStatus.setAttribute('data-error', '');
  } finally {
    setBusy(false);
    document.dispatchEvent(new Event('studio-history-changed'));
  }
}

async function loadEnvironment(followExisting = false) {
  checkingEnvironment = true;
  refreshBuilder();
  try {
    const state = await (await checkedFetch('/api/status')).json();
    statuses = state.statuses;
    if (followExisting && state.latestJob) void followBuild(state.latestJob);
  } catch (error) {
    statuses = {};
    checkingEnvironment = false;
    refreshBuilder();
    setHostStatus(error.message, true);
    return;
  }
  checkingEnvironment = false;
  refreshBuilder();
}

checkBuilder.addEventListener('click', () => void loadEnvironment());
setupBuilder.addEventListener('click', async () => {
  if (setupBuilder.disabled || !builder.setup) return;
  setBusy(true);
  setHostStatus('Ξεκινά η προετοιμασία…');
  try {
    const response = await checkedFetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distro: selectedDistro().id }),
    });
    const { id, systemSetup } = await response.json();
    if (systemSetup) {
      setHostStatus('Ολοκλήρωσε την ενεργοποίηση WSL 2 στα Windows και μετά πάτησε «Επανέλεγχος περιβάλλοντος».');
      return;
    }
    const progress = followBuild(id);
    location.hash = 'build-result';
    await progress;
  } catch (error) {
    setHostStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

form.addEventListener('input', event => {
  if (event.target.name === 'distro') configureDistro();
  else refreshSummary();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (build.disabled) return;
  if (!nameInput.validity.valid) {
    location.hash = 'system';
    renderRoute();
    nameInput.reportValidity();
    return;
  }
  const options = { ...getConfiguration(), ...studio.extras() };
  setHostStatus(builder.message);
  setBusy(true);

  try {
    const response = await checkedFetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    const { id } = await response.json();
    const following = followBuild(id);
    location.hash = 'build-result';
    await following;
  } catch (error) {
    setHostStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

configureDistro();
function getConfiguration() {
  const data = new FormData(form);
  return { distro: data.get('distro'), kernel: data.get('kernel'), name: data.get('name'), desktop: data.get('desktop'),
    appearance: data.get('appearance') || 'default', language: data.get('language'), keyboard: data.get('keyboard'),
    firmware: data.has('firmware'), installer: data.has('installer'), apps: data.getAll('apps') };
}
function applyConfiguration(options, adapt = false) {
  if (!catalog.distros.some(distro => distro.id === options.distro)) throw new Error('Το προφίλ χρησιμοποιεί μη υποστηριζόμενη διανομή.');
  form.elements.distro.value = options.distro;
  configureDistro();
  const desktop = [...form.querySelectorAll('[name="desktop"]')].find(item => item.value === options.desktop);
  if (desktop) desktop.checked = true;
  else if (!adapt) throw new Error('Το desktop του προφίλ δεν είναι διαθέσιμο.');
  for (const key of ['name', 'kernel', 'language', 'keyboard', 'appearance']) {
    if (options[key] !== undefined) form.elements[key].value = options[key];
  }
  for (const key of ['firmware', 'installer']) form.elements[key].checked = Boolean(options[key]) && !form.elements[key].disabled;
  for (const input of form.querySelectorAll('[name="apps"]')) input.checked = options.apps.includes(input.value);
  refreshSummary(); refreshBuilder();
}
initAppLibrary({ onBusy(value) { libraryBusy = value; setBusy(busy); } });
studio = initStudio({ getOptions: getConfiguration, applyOptions: applyConfiguration,
  onBusy(value) { studioBusy = value; setBusy(busy); }, checkUpdates: () => void refreshUpdate('/check') });
renderRoute();
void refreshUpdate('/check');
setInterval(() => void refreshUpdate(), 10_000);
void loadEnvironment(true);

import { catalog, choicesFor, isoFilename } from './catalog.mjs';

const byId = id => document.getElementById(id);
const form = byId('configuration');
const build = byId('build');
const exportButton = byId('export');
const hostStatus = byId('host-status');
const result = byId('build-result');
const buildStatus = byId('build-status');
const log = byId('build-log');
const isoLink = byId('iso-link');
const updateCheck = byId('update-check');
const updateStatus = byId('update-status');
const updateInstall = byId('update-install');
const updateFile = byId('update-file');
let updateTimer;
let installingUpdate = false;
let automaticRestart = false;
let statuses = {};
let builder = { available: false, message: 'Έλεγχος περιβάλλοντος δημιουργίας…' };
let busy = false;
const steps = [...document.querySelectorAll('[data-step]')];
const previousStep = byId('previous');
const nextStep = byId('next');
const nameInput = form.elements.namedItem('name');
let currentStep = 0;

function renderRoute() {
  const route = location.hash.slice(1);
  const overview = route === 'overview';
  const showLog = route === 'build-result' && !result.hidden;
  currentStep = showLog ? steps.length - 1 : Math.max(0, steps.findIndex(link => link.dataset.step === route));
  byId('overview').hidden = !overview;
  byId('wizard').hidden = overview;
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
  const currentNav = overview ? '#overview' : showLog ? '#build-result' : '#system';
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
    : location.hash === '#build-result' && !result.hidden ? result
    : byId(steps[currentStep].dataset.step);
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
  appChoices.replaceChildren(appChoices.querySelector('legend'),
    ...choices.apps.map(item => appOption(item, distro, selectedApps.includes(item.id))));
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
  const apps = new FormData(form).getAll('apps');
  const selected = distro.kernels.find(item => item.id === kernel.value);
  byId('kernel-package').textContent = selected.id;
  byId('summary-distro').textContent = distro.name;
  byId('summary-kernel').textContent = selected.name;
  byId('summary-desktop').textContent = catalog.desktops.find(item => item.id === desktop.value).name;
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
  build.disabled = !builder.available || busy || installingUpdate;
  updateInstall.disabled = busy || installingUpdate;
}

function refreshBuilder() {
  builder = statuses[selectedDistro().id] ?? builder;
  hostStatus.parentElement.dataset.ready = String(builder.available);
  byId('host-title').textContent = builder.available ? 'Έτοιμο για δημιουργία' : 'Προϋποθέσεις δημιουργίας';
  setHostStatus(builder.message);
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

function renderUpdate(info) {
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
    updateCheck.disabled = false;
  }
}

updateCheck.addEventListener('click', () => void refreshUpdate('/check'));
updateInstall.addEventListener('click', async () => {
  const message = automaticRestart ? 'Να εγκατασταθεί η ενημέρωση και να ανοίξει ξανά το Linux Studio;'
    : 'Να εγκατασταθεί η ενημέρωση του Linux Studio;';
  if (busy || installingUpdate || !confirm(message)) return;
  installingUpdate = true;
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
    while (true) {
      const response = await checkedFetch(`/api/builds/${id}`);
      const job = await response.json();
      if (job.log !== log.textContent) {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        log.textContent = job.log;
        if (atBottom) log.scrollTop = log.scrollHeight;
      }
      if (job.state === 'ready') {
        const size = new Intl.NumberFormat('el', { maximumFractionDigits: 0 }).format(job.bytes / 1024 ** 2);
        buildStatus.textContent = `Έτοιμο · ${size} MiB`;
        isoLink.href = `/api/builds/${id}/iso`;
        isoLink.download = job.filename;
        isoLink.hidden = false;
        return;
      }
      if (job.state === 'failed') throw new Error('Η δημιουργία απέτυχε. Δες την καταγραφή.');
      await new Promise(resolve => setTimeout(resolve, 1250));
    }
  } catch (error) {
    buildStatus.textContent = error.message;
    buildStatus.setAttribute('data-error', '');
  } finally {
    setBusy(false);
  }
}

form.addEventListener('input', event => {
  if (event.target.name === 'distro') configureDistro();
  else refreshSummary();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!nameInput.validity.valid) {
    location.hash = 'system';
    renderRoute();
    nameInput.reportValidity();
    return;
  }
  const isBuild = event.submitter === build;
  if (isBuild && (busy || !builder.available)) return;
  const data = new FormData(form);
  const distro = selectedDistro();
  const options = Object.fromEntries(data);
  options.firmware = data.has('firmware');
  options.installer = data.has('installer');
  options.apps = data.getAll('apps');
  setHostStatus(builder.message);
  if (isBuild) setBusy(true);
  else exportButton.disabled = true;

  try {
    const response = await checkedFetch(isBuild ? '/api/builds' : '/api/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (isBuild) {
      const { id } = await response.json();
      const following = followBuild(id);
      location.hash = 'build-result';
      await following;
    } else {
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `build-${distro.id}-iso.sh`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      if (distro === selectedDistro()) {
        setHostStatus(`Σε ${distro.name}, εκτέλεσε sudo -v και μετά bash ${link.download}. Δες το README για τα απαιτούμενα εργαλεία.`);
      }
    }
  } catch (error) {
    setHostStatus(error.message, true);
  } finally {
    if (isBuild) setBusy(false);
    else exportButton.disabled = false;
  }
});

configureDistro();
renderRoute();
void refreshUpdate('/check');
try {
  const status = await (await checkedFetch('/api/status')).json();
  statuses = status.statuses;
  refreshBuilder();
  if (status.latestJob) void followBuild(status.latestJob);
} catch (error) {
  setHostStatus(error.message, true);
}

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
let statuses = {};
let builder = { available: false, message: 'Έλεγχος περιβάλλοντος δημιουργίας…' };
let busy = false;

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
  refreshBuilder();
  refreshSummary();
}

function refreshSummary() {
  const distro = selectedDistro();
  const { name, kernel, desktop } = form.elements;
  const count = new FormData(form).getAll('apps').length;
  const selected = distro.kernels.find(item => item.id === kernel.value);
  byId('kernel-package').textContent = selected.id;
  byId('summary-distro').textContent = distro.name;
  byId('summary-kernel').textContent = selected.name;
  byId('summary-desktop').textContent = catalog.desktops.find(item => item.id === desktop.value).name;
  byId('summary-apps').textContent = count;
  byId('filename').textContent = name.validity.valid ? isoFilename(name.value, distro.id) : '—';
}

function setHostStatus(message, error = false) {
  hostStatus.textContent = message;
  hostStatus.toggleAttribute('data-error', error);
}

function setBusy(value) {
  busy = value;
  build.disabled = !builder.available || busy;
}

function refreshBuilder() {
  builder = statuses[selectedDistro().id] ?? builder;
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

async function followBuild(id) {
  setBusy(true);
  result.hidden = false;
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
      result.scrollIntoView({ block: 'nearest' });
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
try {
  const status = await (await checkedFetch('/api/status')).json();
  statuses = status.statuses;
  refreshBuilder();
  if (status.latestJob) void followBuild(status.latestJob);
} catch (error) {
  setHostStatus(error.message, true);
}

import { creationPresets } from './studio-customization.mjs';

export function initStudio({ getOptions, applyOptions, onBusy, checkUpdates }) {
  const $ = id => document.getElementById(id);
  let files = [], busy = false, otherBusy = false, selectedIso;
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, className = 'secondary') => { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', () => void attempt(action)); return node; };
  const api = async (path, data) => {
    const response = await fetch(path, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Η ενέργεια δεν ολοκληρώθηκε.');
    return result;
  };
  function notice(message, error = false) { $('studio-notice').textContent = message; $('studio-notice').hidden = !message; $('studio-notice').toggleAttribute('data-error', error); }
  async function attempt(action) { try { notice(''); return await action(); } catch (error) { notice(error.message, true); } }
  const date = value => value ? new Date(value).toLocaleString('el-GR') : '—';
  function fileList() {
    $('personal-file-list').replaceChildren(...files.map(file => {
      const item = el('li');
      const destination = el('select'); destination.setAttribute('aria-label', `Φάκελος για ${file.name}`);
      destination.append(...['LinuxStudio', 'Documents', 'Pictures', 'Desktop'].map(name => new Option(name, name)));
      destination.value = file.destination || 'LinuxStudio'; destination.addEventListener('change', () => { file.destination = destination.value; });
      item.append(el('span', `${file.name} · ${(file.content.length * .75 / 1024).toFixed(0)} KB`), destination, button('Αφαίρεση', () => { files = files.filter(item => item !== file); fileList(); preview(); })); return item;
    }));
    const value = $('custom-wallpaper').value;
    $('custom-wallpaper').replaceChildren(new Option('Χρώματα θέματος', ''), ...files.filter(file => /\.(png|jpe?g)$/i.test(file.name)).map(file => new Option(file.name, file.name)));
    $('custom-wallpaper').value = files.some(file => file.name === value) ? value : '';
  }
  const extras = () => ({ files, ...($('custom-enabled').checked && document.querySelector('[name="desktop"]:checked')?.value !== 'standard' && document.querySelector('[name="appearance"]:checked')?.value !== 'default'
    ? { customization: { font: $('custom-font').value, icons: $('custom-icons').value, cursor: $('custom-cursor').value, panel: $('custom-panel').value, accent: $('custom-accent').value, wallpaper: $('custom-wallpaper').value } } : {}) });
  function setExtras(options) {
    files = options.files || []; fileList();
    const c = options.customization;
    $('custom-enabled').checked = Boolean(c);
    if (c) for (const key of ['font', 'icons', 'cursor', 'panel', 'accent', 'wallpaper']) $(`custom-${key}`).value = c[key] || '';
    preview();
  }
  function download(name, object) {
    const href = URL.createObjectURL(new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' }));
    const link = el('a'); link.download = name; link.href = href; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const configuration = () => ({ ...getOptions(), ...extras() });

  for (const preset of creationPresets) {
    const card = button('', async () => { applyOptions({ ...getOptions(), desktop: preset.desktop, appearance: preset.appearance, apps: preset.apps }, true); setExtras({ files }); location.hash = 'desktop'; });
    card.classList.add('creation-preset'); card.append(el('strong', preset.name), el('small', preset.detail)); $('creation-presets').append(card);
  }
  $('personal-files').addEventListener('change', () => void attempt(async () => {
    const incoming = [...$('personal-files').files];
    if (incoming.length + files.length > 30) throw new Error('Μπορείς να προσθέσεις έως 30 αρχεία.');
    const additions = [];
    for (const file of incoming) {
      if (!/^[\p{L}\p{N}_ .()-]{1,100}$/u.test(file.name) || file.name.startsWith('.') || file.name.includes('..')) throw new Error('Χρησιμοποίησε απλό όνομα αρχείου, χωρίς ειδικούς χαρακτήρες ή διαδρομές.');
      if (file.size > 8 * 1024 ** 2) throw new Error('Κάθε αρχείο μπορεί να είναι έως 8 MB.');
      const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
      additions.push({ name: file.name, content, destination: 'LinuxStudio' });
    }
    const next = [...files.filter(file => !additions.some(item => item.name === file.name)), ...additions];
    if (next.reduce((sum, file) => sum + file.content.length * .75, 0) > 20 * 1024 ** 2) throw new Error('Το σύνολο αρχείων μπορεί να είναι έως 20 MB.');
    files = next; fileList(); $('personal-files').value = ''; notice('Διάλεξε τον φάκελο προορισμού για κάθε αρχείο. Οι φάκελοι δημιουργούνται στο home του νέου χρήστη.');
  }));
  function preview() {
    const eligible = document.querySelector('[name="appearance"]:checked')?.value !== 'default' && document.querySelector('[name="desktop"]:checked')?.value !== 'standard';
    $('custom-enabled').disabled = !eligible;
    const enabled = eligible && $('custom-enabled').checked;
    $('custom-controls').disabled = !enabled;
    const appearance = document.querySelector('[name="appearance"]:checked')?.value || 'default';
    const canvas = $('desktop-live-preview'); canvas.dataset.appearance = appearance;
    canvas.dataset.panel = enabled ? $('custom-panel').value : 'bottom';
    canvas.dataset.font = enabled ? $('custom-font').value : 'Sans';
    const svg = $('preview-accent'); svg.setAttribute('fill', enabled ? $('custom-accent').value : '#60c8ff');
    const wallpaper = enabled && files.find(file => file.name === $('custom-wallpaper').value);
    const picture = $('preview-wallpaper'); picture.hidden = !wallpaper;
    if (wallpaper) picture.src = `data:image/${/\.png$/i.test(wallpaper.name) ? 'png' : 'jpeg'};base64,${wallpaper.content}`;
    else picture.removeAttribute('src');
    $('preview-font').textContent = `${document.querySelector('[name="desktop"]:checked')?.value || 'desktop'} · ${enabled ? $('custom-font').value : 'Προεπιλογές θέματος'}`;
  }
  for (const input of document.querySelectorAll('#customization-lab input, #customization-lab select')) input.addEventListener('input', preview);
  document.querySelector('#configuration').addEventListener('input', preview);
  $('save-profile').addEventListener('click', () => void attempt(async () => {
    const label = $('profile-label').value.trim();
    await api('/api/profiles', { label, options: configuration() });
    notice(`Αποθηκεύτηκε το προφίλ «${label}».`); await profiles();
  }));
  $('export-current').addEventListener('click', () => download('linux-studio-profile.json', { format: 'linux-studio-profile', version: 1, label: $('profile-label').value || 'Το Linux μου', options: configuration() }));
  $('import-profile').addEventListener('change', () => void attempt(async () => {
    const file = $('import-profile').files[0]; if (!file) return;
    if (file.size > 32 * 1024 ** 2) throw new Error('Το προφίλ είναι πολύ μεγάλο.');
    const imported = JSON.parse(await file.text());
    if (imported.format !== 'linux-studio-profile' || imported.version !== 1) throw new Error('Δεν είναι προφίλ Linux Studio.');
    const saved = await api('/api/profiles', { label: imported.label, options: imported.options });
    applyOptions(imported.options); setExtras(imported.options); $('profile-label').value = saved.label;
    $('import-profile').value = ''; await profiles(); notice('Το προφίλ εισήχθη και φορτώθηκε.'); location.hash = 'summary';
  }));
  async function profiles() {
    const data = await api('/api/profiles');
    $('profile-list').replaceChildren(...data.map(profile => {
      const item = el('article', undefined, 'studio-card');
      item.append(el('h3', profile.label), el('p', `${profile.options.distro} / ${profile.options.desktop} · ${date(profile.updatedAt)}`));
      const actions = el('div', undefined, 'studio-actions');
      actions.append(button('Φόρτωση', async () => { const full = await api(`/api/profiles/${profile.id}`); applyOptions(full.options); setExtras(full.options); $('profile-label').value = full.label; location.hash = 'summary'; }),
        button('Εξαγωγή', async () => { const full = await api(`/api/profiles/${profile.id}`); download('linux-studio-profile.json', { format: 'linux-studio-profile', version: 1, label: full.label, options: full.options }); }),
        button('Διαγραφή', async () => { if (confirm(`Να διαγραφεί το προφίλ «${profile.label}»;`)) { await api('/api/profiles/delete', { id: profile.id }); await profiles(); } }));
      item.append(actions); return item;
    }));
    if (!data.length) $('profile-list').append(el('p', 'Δεν έχεις αποθηκεύσει προφίλ ακόμη. Ρύθμισε το ISO σου και πάτησε «Αποθήκευση προφίλ».', 'empty-note'));
  }

  async function preflight() {
    const button = $('preflight-check'); button.disabled = true;
    $('preflight-results').textContent = 'Έλεγχος χώρου, εργαλείων και σύνδεσης…';
    try {
      const result = await api('/api/preflight', configuration());
      $('preflight-results').replaceChildren(...result.checks.map(check => { const row = el('div', undefined, 'preflight-row'); row.dataset.state = check.state; row.append(el('strong', `${check.state === 'ready' ? '✓' : check.state === 'warning' ? '!' : '×'} ${check.name}`), el('p', check.detail)); return row; }));
    } finally { button.disabled = false; }
  }
  $('preflight-check').addEventListener('click', () => void attempt(preflight));
  function lock(value) { busy = value; onBusy(value); for (const button of document.querySelectorAll('[data-operation]')) button.disabled = value || otherBusy; }
  document.addEventListener('studio-busy', event => { otherBusy = event.detail; for (const button of document.querySelectorAll('[data-operation]')) button.disabled = busy || otherBusy; });

  async function installedApps() {
    const data = await api('/api/apps/installed');
    $('managed-apps').replaceChildren(...data.apps.map(app => {
      const row = el('article', undefined, 'studio-card'); row.append(el('h3', app.name), el('p', `${app.id} · ${app.scope === 'user' ? 'Προσωπική εγκατάσταση' : 'Εγκατάσταση συστήματος'}`));
      const actions = el('div', undefined, 'studio-actions');
      for (const [label, action] of [['Άνοιγμα', 'launch'], ['Ενημέρωση', 'update'], ['Απεγκατάσταση', 'uninstall']]) {
        const control = button(label, async () => {
          if (busy || otherBusy) return;
          if (action === 'uninstall' && !confirm(`Να απεγκατασταθεί το ${app.name}; Τα προσωπικά δεδομένα της εφαρμογής θα διατηρηθούν.`)) return;
          if (action === 'launch') { await api('/api/apps/launch', { id: app.id, scope: app.scope }); notice(`Ζητήθηκε το άνοιγμα του ${app.name}.`); }
          else await manage(action, [app]);
        }); control.dataset.operation = ''; control.disabled = busy || otherBusy; actions.append(control);
      }
      row.append(actions); return row;
    }));
    if (!data.apps.length) $('managed-apps').append(el('p', data.platform === 'linux' ? 'Δεν βρέθηκαν εγκατεστημένες εφαρμογές Flatpak.' : 'Άνοιξε το Linux Studio στο Linux για διαχείριση των εγκατεστημένων εφαρμογών του.', 'empty-note'));
  }
  async function followApps(id) {
    lock(true); $('manager-job').hidden = false;
    try {
      while (true) {
        const job = await api(`/api/apps/jobs/${id}`);
        $('manager-status').textContent = job.state === 'running' ? `Εργασία: ${job.current || 'προετοιμασία'}…` : job.error || (job.state === 'ready' ? 'Η εργασία ολοκληρώθηκε.' : 'Η εργασία ολοκληρώθηκε με σφάλματα. Δες την καταγραφή.');
        $('manager-log').textContent = job.log;
        if (job.state !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally { lock(false); await installedApps(); }
  }
  async function manage(action, apps = []) { const job = await api('/api/apps/manage', { action, apps: apps.map(({ id, scope }) => ({ id, scope })) }); await followApps(job.id); }
  $('managed-refresh').addEventListener('click', () => void attempt(installedApps));
  $('update-all-apps').addEventListener('click', () => void attempt(() => manage('update-all')));

  async function history() {
    const data = await api('/api/history');
    $('history-list').replaceChildren(...data.map(entry => {
      const card = el('article', undefined, 'studio-card');
      const states = { ready: 'Ολοκληρώθηκε', failed: 'Απέτυχε', interrupted: 'Διακόπηκε', running: 'Σε εξέλιξη' };
      card.append(el('h3', entry.filename || ({ applications: 'Εφαρμογές Linux', usb: 'Εγγραφή USB', setup: 'Προετοιμασία εργαλείων' }[entry.kind]) || 'Εργασία'), el('p', `${states[entry.state] || entry.state} · ${date(entry.createdAt || entry.updatedAt)}`));
      if (entry.bytes) card.append(el('p', `${(entry.bytes / 1024 ** 3).toFixed(2)} GB`));
      if (entry.sha256) card.append(el('code', `SHA-256 ${entry.sha256}`, 'iso-digest'));
      const actions = el('div', undefined, 'studio-actions');
      if (entry.kind === 'build' && entry.options) actions.append(button('Δημιουργία ξανά', async () => { const full = await api(`/api/history/${entry.id}`); applyOptions(full.options); setExtras(full.options); location.hash = 'summary'; }));
      if (entry.kind === 'build' && entry.state === 'ready') {
        const link = el('a', 'Λήψη ISO', 'secondary'); link.href = `/api/builds/${entry.id}/iso`; link.download = entry.filename; actions.append(link);
        actions.append(button('Δοκιμή / USB', async () => { selectedIso = entry.id; await tools(); $('tool-iso').value = entry.id; location.hash = 'tools'; }));
      }
      const details = el('details'); details.append(el('summary', 'Καταγραφή')); details.append(el('pre', entry.log || 'Χωρίς καταγραφή.', 'studio-log')); card.append(actions, details); return card;
    }));
    if (!data.length) $('history-list').append(el('p', 'Εδώ θα εμφανίζονται οι δημιουργίες ISO, οι εγκαταστάσεις εφαρμογών και οι εγγραφές USB.', 'empty-note'));
  }

  let usbDisks = [];
  async function tools() {
    const [history, usb, vm] = await Promise.all([api('/api/history'), api('/api/usb'), api('/api/vm')]);
    const images = history.filter(entry => entry.kind === 'build' && entry.state === 'ready');
    const value = selectedIso || $('tool-iso').value;
    $('tool-iso').replaceChildren(new Option('Επίλεξε ολοκληρωμένο ISO', ''), ...images.map(entry => new Option(entry.filename, entry.id)));
    if (images.some(entry => entry.id === value)) $('tool-iso').value = value;
    usbDisks = usb.disks;
    $('usb-device').replaceChildren(new Option('Επίλεξε αφαιρούμενο USB', ''), ...usbDisks.map(disk => { const option = new Option(`${disk.path} · ${disk.model} · ${(disk.bytes / 1024 ** 3).toFixed(1)} GB${disk.mounted ? ' · Κάνε unmount' : ''}`, disk.path); option.disabled = disk.mounted; return option; }));
    $('usb-help').textContent = usb.message;
    $('usb-write').disabled = !usb.available || busy || otherBusy;
    $('vm-help').textContent = vm.available
      ? `QEMU διαθέσιμο · Έως ${vm.maxMemory} MB RAM. Το ISO ανοίγει σε ξεχωριστό παράθυρο, χωρίς δίσκο του υπολογιστή σου.`
      : (navigator.platform.startsWith('Win')
        ? 'Χρειάζεται QEMU για Windows (qemu-system-x86_64). Η έκδοση Windows του Linux Studio εντοπίζει εγκατάσταση στο PATH ή στο C:\\Program Files\\qemu.'
        : 'Χρειάζεται QEMU στο σύστημα. Linux: πακέτο qemu-system-x86 (Debian/Ubuntu), qemu-desktop (Arch) ή qemu-system-x86-core και qemu-ui-gtk (Fedora).');
    $('vm-memory').max = vm.maxMemory;
    if (Number($('vm-memory').value) > vm.maxMemory) $('vm-memory').value = vm.maxMemory;
    $('vm-start').disabled = !vm.available || ['running', 'starting'].includes(vm.state) || busy || otherBusy;
    $('vm-status').textContent = `Κατάσταση: ${vm.state}${vm.log ? '\n' + vm.log : ''}`;
    $('vm-stop').disabled = !['running', 'starting'].includes(vm.state);
  }
  $('tool-refresh').addEventListener('click', () => void attempt(tools));
  $('vm-start').addEventListener('click', () => void attempt(async () => { await api('/api/vm/start', { id: $('tool-iso').value, memory: Number($('vm-memory').value) }); await tools(); }));
  $('vm-stop').addEventListener('click', () => void attempt(async () => { await api('/api/vm/stop', {}); await tools(); }));
  $('usb-device').addEventListener('change', () => { $('usb-confirm-label').textContent = `Πληκτρολόγησε ΔΙΑΓΡΑΦΗ ${$('usb-device').value || '/dev/…'}`; $('usb-confirm').value = ''; });
  $('usb-write').addEventListener('click', () => void attempt(async () => {
    const disk = usbDisks.find(item => item.path === $('usb-device').value);
    if (!disk) throw new Error('Επίλεξε αφαιρούμενο USB.');
    const confirmation = `ΔΙΑΓΡΑΦΗ ${disk.path}`;
    if ($('usb-confirm').value !== confirmation) throw new Error(`Πληκτρολόγησε ακριβώς: ${confirmation}`);
    if (!confirm(`Θα διαγραφούν τα δεδομένα του ${disk.path} (${disk.model}, ${(disk.bytes / 1024 ** 3).toFixed(1)} GB). Να γραφτεί το ISO;`)) return;
    const { id } = await api('/api/usb/write', { id: $('tool-iso').value, device: disk.path, identity: disk.identity, serial: disk.serial, bytes: disk.bytes, confirmation });
    await followUsb(id);
  }));
  async function followUsb(id) {
    lock(true); $('usb-job').hidden = false;
    try {
      while (true) {
        const job = await api(`/api/builds/${id}`);
        $('usb-log').textContent = job.log;
        const progress = [...job.log.matchAll(/(WRITE|VERIFY) (\d+) (\d+)/g)].at(-1);
        $('usb-progress').value = progress ? (progress[1] === 'VERIFY' ? 50 : 0) + Number(progress[2]) / Number(progress[3]) * 50 : 0;
        $('usb-status').textContent = job.state === 'ready' ? 'Έτοιμο. Η εγγραφή επιβεβαιώθηκε με SHA-256.' : job.state === 'failed' ? 'Η εγγραφή απέτυχε. Δες την καταγραφή.' : progress?.[1] === 'VERIFY' ? 'Επαλήθευση δεδομένων στο USB…' : 'Προετοιμασία και εγγραφή USB…';
        if (job.state !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally { lock(false); await tools(); }
  }
  async function updates() {
    const settings = await api('/api/update/settings'); $('auto-update-enabled').checked = settings.enabled;
    $('auto-update-detail').textContent = `Έλεγχος ανά ${settings.intervalSeconds} δευτερόλεπτα. Τελευταίος έλεγχος: ${date(settings.lastCheck)}.${settings.error ? ' ' + settings.error : ''}`;
    const info = await api('/api/update'); $('center-update-version').textContent = `Τρέχουσα έκδοση: ${info.current}${info.version ? ` · Νέα έκδοση: ${info.version}` : ''}`;
    $('center-update-install').disabled = info.status !== 'ready' || !info.canInstall || busy || otherBusy;
    const applications = await api('/api/apps/status'); $('update-all-apps').disabled = !applications.flatpak || !applications.canInstall || busy || otherBusy;
    $('center-update-state').textContent = ({ current: 'Έχεις την τελευταία έκδοση.', checking: 'Έλεγχος…', downloading: 'Λήψη και επαλήθευση…', ready: 'Το πακέτο είναι έτοιμο.', installed: 'Η ενημέρωση εγκαταστάθηκε.', unavailable: 'Ο έλεγχος δεν ήταν διαθέσιμος. Θα επαναληφθεί.' })[info.status] || 'Προγραμματισμένος έλεγχος ενημερώσεων.';
  }
  $('auto-update-enabled').addEventListener('change', () => void attempt(async () => { await api('/api/update/settings', { enabled: $('auto-update-enabled').checked }); await updates(); }));
  $('center-update-check').addEventListener('click', () => { checkUpdates(); void attempt(updates); });
  $('center-update-install').addEventListener('click', () => $('update-install').click());
  async function route() {
    const routes = { profiles, history, 'my-apps': installedApps, tools, 'updates-center': updates };
    const action = routes[location.hash.slice(1)]; if (action) await attempt(action);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('studio-history-changed', () => { if (location.hash === '#history') void attempt(history); });
  setInterval(() => { if (location.hash === '#updates-center') void attempt(updates); }, 10_000);
  preview(); void route();
  void attempt(async () => {
    const state = await api('/api/apps/status');
    if (state.latestJob) { const job = await api(`/api/apps/jobs/${state.latestJob}`); if (job.action && job.action !== 'install' && job.state === 'running') void attempt(() => followApps(job.id)); }
  });
  return { extras, setExtras };
}

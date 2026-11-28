import { palettes } from './desktop-appearance.mjs';
import { catalog } from './catalog.mjs';

export function createDesktopPreview({ getConfiguration }) {
  const canvas = document.getElementById('desktop-live-preview');
  const icon = kind => `<svg viewBox="0 0 48 48" aria-hidden="true">${kind === 'folder'
    ? '<path class="preview-folder-back" d="M4 12h16l5 5h19v22H4z"/><path class="preview-folder" d="M4 19h40l-4 22H4z"/>'
    : kind === 'terminal' ? '<rect class="preview-terminal-icon" x="3" y="7" width="42" height="34" rx="5"/><path d="m11 17 7 7-7 7m14 0h10" fill="none" stroke="white" stroke-width="3"/>'
    : kind === 'settings' ? '<circle class="preview-folder" cx="24" cy="24" r="19"/><path d="M13 17h22M13 24h22M13 31h22" stroke="white" stroke-width="3"/><path d="M19 12v10m11-3v10m-9-3v10" stroke="white" stroke-width="5"/>'
    : '<path class="preview-paper" d="M10 4h20l9 10v30H10z"/><path class="preview-folder" d="M29 4v12h10M16 24h17v3H16zm0 8h13v3H16z"/>'}</svg>`;
  canvas.innerHTML = `
    <img id="preview-wallpaper" alt="Η επιλεγμένη ταπετσαρία" hidden>
    <div class="preview-desktop-icons"><button type="button" data-preview-open="files">${icon('folder')}<span>Προσωπικός φάκελος</span></button><button type="button" data-preview-open="settings">${icon('settings')}<span>Ρυθμίσεις</span></button></div>
    <section class="preview-native-window preview-files-window" data-preview-window="files" aria-label="Προεπισκόπηση διαχειριστή αρχείων">
      <header class="preview-titlebar"><strong id="preview-files-title">Προσωπικός φάκελος</strong><div><button type="button" data-preview-minimize="files" aria-label="Ελαχιστοποίηση παραθύρου δείγματος">−</button><button type="button" data-preview-maximize="files" aria-label="Μεγιστοποίηση παραθύρου δείγματος">□</button><button type="button" data-preview-close="files" aria-label="Κλείσιμο παραθύρου δείγματος">×</button></div></header>
      <div class="preview-toolbar"><span aria-hidden="true">‹　›　⌂</span><span class="preview-address">Προσωπικός φάκελος</span><span aria-hidden="true">⌕　☰</span></div>
      <div class="preview-file-body"><nav aria-label="Φάκελοι προεπισκόπησης"><button type="button" class="is-selected" data-preview-folder="Προσωπικός φάκελος">⌂ Αρχική</button><button type="button" data-preview-folder="Έγγραφα">▤ Έγγραφα</button><button type="button" data-preview-folder="Εικόνες">▧ Εικόνες</button><button type="button" data-preview-folder="Λήψεις">↓ Λήψεις</button></nav><div class="preview-file-grid"><button type="button" class="is-selected">${icon('folder')}<span>Έγγραφα</span></button><button type="button">${icon('folder')}<span>Εικόνες</span></button><button type="button">${icon('folder')}<span>Projects</span></button><button type="button">${icon('document')}<span>Καλώς ήρθες.txt</span></button></div></div>
      <footer class="preview-window-footer"><span>4 αντικείμενα</span><span id="preview-font"></span></footer>
    </section>
    <section class="preview-native-window preview-settings-window" data-preview-window="settings" aria-label="Προεπισκόπηση ρυθμίσεων εμφάνισης"><header class="preview-titlebar"><strong>Εμφάνιση</strong><div><button type="button" data-preview-close="settings" aria-label="Κλείσιμο ρυθμίσεων δείγματος">×</button></div></header><div class="preview-settings-body"><span class="preview-eyebrow">ΤΟ LINUX ΣΟΥ</span><h4>Κάν’ το δικό σου.</h4><p>Αα Ββ Γγ · 0123456789</p><div class="preview-setting-row"><span>Χρώμα έμφασης</span><i class="preview-swatch"></i></div><div class="preview-setting-row"><span>Εικονίδια</span><strong id="preview-icon-name"></strong></div><div class="preview-setting-row"><span>Γραμματοσειρά</span><strong id="preview-font-name"></strong></div><div class="preview-slider"><span></span><i></i></div><button type="button" class="preview-accent-button">Επιλεγμένο θέμα <span>✓</span></button></div></section>
    <section class="preview-native-window preview-terminal-window" data-preview-window="terminal" hidden aria-label="Προεπισκόπηση τερματικού"><header class="preview-titlebar"><strong>Τερματικό · δείγμα</strong><div><button type="button" data-preview-close="terminal" aria-label="Κλείσιμο τερματικού δείγματος">×</button></div></header><pre id="preview-terminal-text"></pre></section>
    <div class="preview-start-menu" id="preview-start-menu" hidden><strong>Εφαρμογές</strong><button type="button" data-preview-open="files">${icon('folder')}Αρχεία</button><button type="button" data-preview-open="settings">${icon('settings')}Ρυθμίσεις</button><button type="button" data-preview-open="terminal">${icon('terminal')}Τερματικό</button><small id="preview-session"></small></div>
    <div class="preview-panel"><button type="button" id="preview-launcher" aria-expanded="false" aria-label="Άνοιγμα μενού προεπισκόπησης">⊞ <span>Εφαρμογές</span></button><div class="preview-running-apps"><button type="button" data-preview-open="files" aria-label="Άνοιγμα αρχείων δείγματος">${icon('folder')}</button><button type="button" data-preview-open="settings" aria-label="Άνοιγμα ρυθμίσεων δείγματος">${icon('settings')}</button><button type="button" data-preview-open="terminal" aria-label="Άνοιγμα τερματικού δείγματος">${icon('terminal')}</button></div><span class="preview-panel-spacer"></span><span class="preview-tray" aria-hidden="true">◉　♪　▰</span><time>12:00</time></div>
    <svg class="preview-cursor-layer" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><g id="preview-pointer" hidden><path d="M0 0 0 27 7 20 13 32 18 29 12 18 23 18Z" stroke-width="2" stroke-linejoin="round"/></g></svg>`;
  const $ = selector => canvas.querySelector(selector);
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  let topWindow = 5;
  const z = { files: 2, settings: 3, terminal: 4 };
  let variables = '';
  function styles() {
    sheet.replaceSync(`#desktop-live-preview{${variables}}` + Object.entries(z).map(([id, value]) => `#desktop-live-preview [data-preview-window="${id}"]{z-index:${value}}`).join(''));
  }
  function open(id) { const window = $(`[data-preview-window="${id}"]`); window.hidden = false; z[id] = ++topWindow; styles(); $('#preview-start-menu').hidden = true; $('#preview-launcher').setAttribute('aria-expanded', 'false'); }
  for (const button of canvas.querySelectorAll('[data-preview-open]')) button.addEventListener('click', () => open(button.dataset.previewOpen));
  for (const button of canvas.querySelectorAll('[data-preview-close], [data-preview-minimize]')) button.addEventListener('click', () => { $(`[data-preview-window="${button.dataset.previewClose || button.dataset.previewMinimize}"]`).hidden = true; });
  for (const button of canvas.querySelectorAll('[data-preview-maximize]')) button.addEventListener('click', () => $(`[data-preview-window="${button.dataset.previewMaximize}"]`).classList.toggle('is-maximized'));
  for (const window of canvas.querySelectorAll('[data-preview-window]')) window.addEventListener('pointerdown', () => { z[window.dataset.previewWindow] = ++topWindow; styles(); });
  $('#preview-launcher').addEventListener('click', () => { const menu = $('#preview-start-menu'); menu.hidden = !menu.hidden; $('#preview-launcher').setAttribute('aria-expanded', String(!menu.hidden)); });
  for (const item of canvas.querySelectorAll('.preview-file-grid button')) item.addEventListener('click', () => { for (const other of canvas.querySelectorAll('.preview-file-grid button')) other.classList.toggle('is-selected', other === item); });
  for (const item of canvas.querySelectorAll('[data-preview-folder]')) item.addEventListener('click', () => { $('#preview-files-title').textContent = item.dataset.previewFolder; $('.preview-address').textContent = item.dataset.previewFolder; for (const other of canvas.querySelectorAll('[data-preview-folder]')) other.classList.toggle('is-selected', other === item); });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const bounds = canvas.getBoundingClientRect(); const pointer = $('#preview-pointer'); pointer.removeAttribute('hidden');
    pointer.setAttribute('transform', `translate(${(event.clientX - bounds.left) / bounds.width * 1000},${(event.clientY - bounds.top) / bounds.height * 600}) scale(${1000 / bounds.width * .8},${600 / bounds.height * .8})`);
  });
  canvas.addEventListener('pointerleave', () => $('#preview-pointer').setAttribute('hidden', ''));
  return {
    render() {
      const config = getConfiguration(), custom = config.customization;
      const palette = palettes[config.appearance] || palettes['windows-light'];
      canvas.hidden = config.desktop === 'standard';
      canvas.dataset.desktop = config.desktop; canvas.dataset.appearance = config.appearance;
      canvas.dataset.panel = custom?.panel || 'bottom';
      canvas.dataset.font = custom?.font || 'Sans';
      canvas.dataset.cursor = custom?.cursor || 'auto';
      const icons = custom?.icons && custom.icons !== 'auto' ? custom.icons : config.desktop === 'kde' ? 'Breeze' : `Papirus-${palette.dark ? 'Dark' : 'Light'}`;
      canvas.dataset.icons = icons;
      const accent = custom?.accent || palette.accent;
      const font = ({ Sans: 'Studio DejaVu Sans', 'DejaVu Sans': 'Studio DejaVu Sans', 'DejaVu Serif': 'Studio DejaVu Serif', 'DejaVu Sans Mono': 'Studio DejaVu Mono' })[custom?.font || 'Sans'];
      variables = `--preview-bg:${palette.background};--preview-surface:${palette.surface};--preview-text:${palette.text};--preview-accent:${accent};--preview-secondary:${palette.secondary};--preview-font:'${font}';--preview-muted:${palette.dark ? '#a5b1c4' : '#526071'};--preview-line:${palette.dark ? '#ffffff24' : '#17233326'};`;
      styles();
      const wallpaper = (config.files || []).find(file => file.name === custom?.wallpaper);
      const picture = $('#preview-wallpaper'); picture.hidden = !wallpaper;
      if (wallpaper) picture.src = `data:image/${/\.png$/i.test(wallpaper.name) ? 'png' : 'jpeg'};base64,${wallpaper.content}`; else picture.removeAttribute('src');
      const desktop = catalog.desktops.find(item => item.id === config.desktop)?.name || config.desktop;
      const theme = catalog.appearances.find(item => item.id === config.appearance)?.name || config.appearance;
      $('#preview-font').textContent = `${desktop} · ${custom?.font || 'Sans'}`;
      $('#preview-font-name').textContent = custom?.font || 'Sans'; $('#preview-icon-name').textContent = icons;
      $('#preview-session').textContent = `${desktop} · ${theme}`;
      $('#preview-terminal-text').textContent = `user@${config.name || 'my-linux'}:~$\n\n${desktop}\n${theme}\n\nΤο δικό σου Linux.\nΠροεπισκόπηση εμφάνισης — χωρίς εκτέλεση εντολών.`;
      canvas.setAttribute('aria-label', `Ζωντανή προεπισκόπηση ${desktop}, ${theme}, ${custom?.font || 'Sans'}`);
    },
  };
}

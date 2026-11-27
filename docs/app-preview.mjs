const frame = document.querySelector('#desktop-preview');
const indicator = document.querySelector('#preview-status');
const repository = 'https://api.github.com/repos/Anserb/iso-studio';
const raw = 'https://raw.githubusercontent.com/Anserb/iso-studio/';
const fileNames = ['index.html', 'style.css', 'app.mjs', 'catalog.mjs', 'app-library.mjs', 'linux-apps.mjs'];

async function loadFiles(base, signal) {
  const files = await Promise.all(fileNames.map(async name => {
    const response = await fetch(base + name, { signal });
    if (!response.ok) throw new Error('Could not load ' + name);
    return [name, await response.text()];
  }));
  return Object.fromEntries(files);
}

async function latestRelease() {
  const signal = AbortSignal.timeout(6500);
  const response = await fetch(repository + '/releases/latest', { cache: 'no-cache', signal });
  if (!response.ok) throw new Error('Release metadata unavailable');
  const { tag_name: tag } = await response.json();
  if (!/^v?\d+\.\d+\.\d+[-.a-zA-Z0-9]*$/.test(tag)) throw new Error('Unexpected release tag');
  return { tag, files: await loadFiles(raw + encodeURIComponent(tag) + '/', signal) };
}

// Keep the desktop UI's local API contract inside the sandboxed preview.
function previewApi() {
  const note = 'Για αυτή τη λειτουργία, άνοιξε το Linux Studio στον υπολογιστή σου.';
  let theme = 'dark';
  window.fetch = async (path, options = {}) => {
    const method = options.method ?? 'GET';
    if (path === '/api/appearance') {
      if (method === 'POST') {
        theme = JSON.parse(options.body).theme === 'light' ? 'light' : 'dark';
      }
      return Response.json({ theme });
    }
    if (path === '/api/status' && method === 'GET') {
      const statuses = Object.fromEntries(['debian', 'ubuntu', 'arch', 'fedora'].map(id => [
        id, { available: false, setup: false, message: note },
      ]));
      return Response.json({ statuses });
    }
    if (path === '/api/apps/status' && method === 'GET') {
      return Response.json({ canInstall: false, installed: [], distro: 'Προεπισκόπηση εφαρμογών Linux', message: note });
    }
    if (path === '/api/update' && method === 'GET' || path === '/api/update/check' && method === 'POST') {
      return Response.json({ status: 'current', canInstall: false });
    }
    return Response.json({ error: note }, { status: 403 });
  };
  // A fragment in srcdoc otherwise resolves against the embedding page's URL.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    location.hash = link.getAttribute('href');
  });
}

function makeDocument(files) {
  const { 'index.html': html, 'style.css': css, ...modules } = files;
  const styleTag = /<link\b[^>]*href="\/style\.css"[^>]*>/;
  const moduleTag = /<script\b[^>]*src="\/app\.mjs"[^>]*><\/script>/;
  if (!styleTag.test(html) || !moduleTag.test(html) || !/<head>/i.test(html)) {
    throw new Error('Unsupported desktop preview layout');
  }
  const imports = Object.fromEntries(Object.entries(modules).map(([name, source]) => {
    const rewritten = source.replace(/(\bfrom\s*['"])\.\/([\w.-]+\.mjs)(['"])/g, (match, start, dependency, end) => {
      if (!Object.hasOwn(modules, dependency)) throw new Error('New desktop dependency: ' + dependency);
      return start + 'desktop/' + dependency + end;
    });
    return ['desktop/' + name, 'data:text/javascript;charset=utf-8,' + encodeURIComponent(rewritten)];
  }));
  const policy = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  const scripts = '<script>(' + previewApi.toString() + ')()</script>'
    + '<script type="importmap">' + JSON.stringify({ imports }) + '</script>'
    + '<script type="module">import "desktop/app.mjs";</script>';
  return html
    .replace(/<head>/i, head => head + '<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
    .replace(styleTag, () => '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>')
    .replace(moduleTag, () => scripts);
}

async function openPreview() {
  try {
    const { tag, files } = await latestRelease();
    frame.srcdoc = makeDocument(files);
    indicator.textContent = 'Έκδοση ' + tag + ' · Από την τελευταία σταθερή έκδοση στο GitHub';
  } catch {
    try {
      frame.srcdoc = makeDocument(await loadFiles('./desktop/', AbortSignal.timeout(6500)));
      indicator.textContent = 'Ενσωματωμένη έκδοση · Ο συγχρονισμός με το GitHub δεν είναι διαθέσιμος αυτή τη στιγμή';
    } catch {
      indicator.textContent = 'Η προεπισκόπηση δεν φορτώθηκε. Δοκίμασε να ανανεώσεις τη σελίδα.';
      return;
    }
  }
  frame.hidden = false;
}

void openPreview();

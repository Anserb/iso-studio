const canvas = document.querySelector('#terrain');
const ctx = canvas.getContext('2d');
const motion = document.querySelector('#motion');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = preference.matches;
let frame = 0;
let width = 0;
let height = 0;
let seconds = 0;
let previous = 0;
let pointer = 0;
let camera = 0;
const stars = Array.from({ length: 68 }, (_, index) => [
  (index * 0.61803398875) % 1,
  (index * 0.41421356237) % 1,
]);

function draw(now) {
  if (!ctx) return;
  if (!paused && previous) seconds += Math.min((now - previous) / 1000, 0.05);
  previous = now;
  camera += (pointer - camera) * 0.045;
  ctx.clearRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * .76 + camera * 32, height * .57, 0, width * .76, height * .57, width * .62);
  glow.addColorStop(0, '#386a3e');
  glow.addColorStop(.4, '#153c2d');
  glow.addColorStop(1, '#071512');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  for (const [x, y] of stars) {
    ctx.fillStyle = `rgba(178,255,165,${.12 + .18 * (1 + Math.sin(seconds * 1.2 + x * 52))})`;
    ctx.fillRect(x * width, y * height * .67, 1.5, 1.5);
  }
  const columns = 39;
  const rows = 32;
  const points = Array.from({ length: rows }, (_, row) => {
    const depth = row / (rows - 1);
    const scale = .28 + depth * 1.16;
    return Array.from({ length: columns }, (_, col) => {
      const across = col / (columns - 1) - .5;
      const wave = Math.sin(across * 11 + depth * 7 - seconds * .67)
        + .46 * Math.cos(across * 23 - depth * 10 + seconds * .84);
      return [
        width * .67 + across * width * 1.63 * scale + camera * (35 - 30 * depth),
        height * (.46 + depth ** 1.7 * .72) + wave * height * (.018 + depth * .038),
      ];
    });
  });
  for (const [row, line] of points.entries()) {
    ctx.beginPath();
    line.forEach(([x, y], col) => col ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = `rgba(143,246,108,${.13 + row * .005})`;
    ctx.stroke();
  }
  ctx.beginPath();
  for (let col = 0; col < columns; col++) {
    points.forEach((line, row) => row ? ctx.lineTo(...line[col]) : ctx.moveTo(...line[col]));
  }
  ctx.strokeStyle = '#81ee6737';
  ctx.stroke();
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, '#071512ed');
  shade.addColorStop(.6, '#07151244');
  shade.addColorStop(1, '#07151210');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  if (!paused && !document.hidden) frame = requestAnimationFrame(draw);
}

function restart() {
  cancelAnimationFrame(frame);
  previous = 0;
  draw(performance.now());
}

function resize() {
  if (!ctx) return;
  width = innerWidth;
  height = innerHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  restart();
}

function syncMotion() {
  document.documentElement.classList.toggle('paused', paused);
  document.documentElement.classList.toggle('motion-enabled', !paused);
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Συνέχιση κίνησης' : 'Παύση κίνησης';
  restart();
}

motion.addEventListener('click', () => {
  paused = !paused;
  syncMotion();
});
preference.addEventListener('change', event => {
  paused = event.matches;
  syncMotion();
});
addEventListener('resize', resize);
addEventListener('pointermove', event => { pointer = event.clientX / innerWidth - .5; });
document.addEventListener('visibilitychange', restart);
resize();
syncMotion();

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}

const kernels = {
  'debian-13': [['standard', 'Standard'], ['real-time', 'Real-time']],
  'ubuntu-24.04': [['generic', 'Generic'], ['hwe', 'HWE'], ['low-latency', 'Low-latency']],
  arch: [['standard', 'Standard'], ['lts', 'LTS'], ['zen', 'Zen'], ['hardened', 'Hardened']],
  'fedora-44': [['standard', 'Standard'], ['debug', 'Debug']],
};
const desktops = [['xfce', 'Xfce'], ['gnome', 'GNOME'], ['plasma', 'KDE Plasma'], ['terminal', 'Τερματικό']];
const distro = document.querySelector('#distro');
const kernel = document.querySelector('#kernel');
const desktop = document.querySelector('#desktop');
const recipe = document.querySelector('#recipe');
const status = document.querySelector('#copy-status');

function setOptions(select, options) {
  const selected = select.value;
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  if (options.some(([value]) => value === selected)) select.value = selected;
}

function updateRecipe() {
  recipe.textContent = [
    `distro: ${distro.value}`,
    `kernel: ${kernel.value}`,
    `desktop: ${desktop.value}`,
    'architecture: x86_64',
    'output: live.iso',
  ].join('\n');
  for (const select of [distro, kernel, desktop]) {
    document.querySelector(`#hero-${select.id}`).textContent = select.value;
  }
  recipe.classList.remove('changed');
  requestAnimationFrame(() => recipe.classList.add('changed'));
  status.textContent = '';
}

function updateDistro() {
  setOptions(kernel, kernels[distro.value]);
  setOptions(desktop, distro.value === 'arch' ? [desktops[0], desktops[3]] : desktops);
  updateRecipe();
}

distro.addEventListener('change', updateDistro);
document.querySelectorAll('[data-demo-distro]').forEach(link => {
  link.addEventListener('click', () => {
    distro.value = link.dataset.demoDistro;
    updateDistro();
    distro.focus({ preventScroll: true });
  });
});
kernel.addEventListener('change', updateRecipe);
desktop.addEventListener('change', updateRecipe);
document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(recipe.textContent);
    status.textContent = 'Η σύνοψη αντιγράφηκε.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(recipe);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = 'Η σύνοψη επιλέχθηκε. Πάτησε Ctrl+C ή ⌘C.';
  }
});

const support = document.querySelector('#support-form');
const message = document.querySelector('#support-message');
message.addEventListener('input', () => message.setCustomValidity(''));
support.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(support);
  const details = fields.get('message').trim();
  if (!details) {
    message.setCustomValidity('Γράψε ένα μήνυμα για την υποστήριξη.');
    message.reportValidity();
    return;
  }
  const subject = `Linux Studio — ${fields.get('topic')}`;
  const system = fields.get('system').trim();
  const body = system ? `Λειτουργικό / διανομή: ${system}\r\n\r\n${details}` : details;
  const address = document.querySelector('#support-email').getAttribute('href');
  window.location.href = `${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
});

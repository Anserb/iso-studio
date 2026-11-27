const canvas = document.querySelector('#terrain');
const context = canvas?.getContext('2d');
let width = 0;
let height = 0;
let frame = 0;

function resizeTerrain() {
  if (!canvas || !context) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawTerrain() {
  if (!canvas || !context || document.documentElement.classList.contains('paused')) {
	if (!document.documentElement.classList.contains('paused')) requestAnimationFrame(drawTerrain);
	return;
  }
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(168,255,104,.055)';
  context.lineWidth = 1;
  const spacing = 44;
  const offset = (frame * 0.12) % spacing;
  for (let x = -height; x < width + height; x += spacing) {
	context.beginPath();
	context.moveTo(x - offset, height);
	context.quadraticCurveTo(width * 0.68 + Math.sin(frame * 0.008) * 70, height * 0.42, x + height * 0.2, 0);
	context.stroke();
  }
  for (let y = 40; y < height; y += spacing) {
	context.beginPath();
	context.moveTo(0, y + Math.sin(frame * 0.006 + y) * 2);
	for (let x = 0; x <= width; x += 24) {
	  context.lineTo(x, y + Math.sin(x * 0.008 + frame * 0.012 + y * 0.01) * 3);
	}
	context.stroke();
  }
  frame++;
  requestAnimationFrame(drawTerrain);
}

resizeTerrain();
addEventListener('resize', resizeTerrain);
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) drawTerrain();

const motionButton = document.querySelector('#motion');
motionButton?.addEventListener('click', () => {
  const paused = document.documentElement.classList.toggle('paused');
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.textContent = paused ? 'Συνέχεια κίνησης' : 'Παύση κίνησης';
  if (!paused && context) {
	frame = 0;
	drawTerrain();
  }
});

const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
	  entries.forEach(entry => {
		if (entry.isIntersecting) {
		  entry.target.classList.add('in-view');
		  observer.unobserve(entry.target);
		}
	  });
	}, { threshold: 0.12 })
  : null;
document.querySelectorAll('.reveal').forEach(element => observer?.observe(element) || element.classList.add('in-view'));

const distroOptions = {
  'debian-13': { kernels: ['standard', 'real-time'], desktops: ['xfce', 'gnome', 'plasma', 'terminal'] },
  'ubuntu-24.04': { kernels: ['generic', 'hwe', 'low-latency'], desktops: ['xfce', 'gnome', 'plasma', 'terminal'] },
  'arch': { kernels: ['standard', 'lts', 'zen', 'hardened'], desktops: ['xfce', 'terminal'] },
  'fedora-44': { kernels: ['standard', 'debug'], desktops: ['xfce', 'gnome', 'plasma', 'terminal'] },
};

const distroSelect = document.querySelector('#distro');
const kernelSelect = document.querySelector('#kernel');
const desktopSelect = document.querySelector('#desktop');
const recipe = document.querySelector('#recipe');

function replaceOptions(select, values) {
  if (!select) return;
  select.replaceChildren(...values.map(value => new Option(value.replace(/-/g, ' '), value)));
}

function updateLab(distro) {
  const selection = distroOptions[distro];
  if (!selection) return;
  if (distroSelect) distroSelect.value = distro;
  replaceOptions(kernelSelect, selection.kernels);
  replaceOptions(desktopSelect, selection.desktops);
  updateRecipe();
}

function updateRecipe() {
  if (!distroSelect || !kernelSelect || !desktopSelect || !recipe) return;
  const text = `distro: ${distroSelect.value}\nkernel: ${kernelSelect.value}\ndesktop: ${desktopSelect.value}\narchitecture: x86_64\noutput: live.iso`;
  recipe.textContent = text;
  document.querySelector('#hero-distro')?.replaceChildren(document.createTextNode(distroSelect.value));
  document.querySelector('#hero-kernel')?.replaceChildren(document.createTextNode(kernelSelect.value));
  document.querySelector('#hero-desktop')?.replaceChildren(document.createTextNode(desktopSelect.value));
}

distroSelect?.addEventListener('change', () => updateLab(distroSelect.value));
kernelSelect?.addEventListener('change', updateRecipe);
desktopSelect?.addEventListener('change', updateRecipe);

document.querySelectorAll('[data-demo-distro]').forEach(link => {
  link.addEventListener('click', () => updateLab(link.dataset.demoDistro));
});

document.querySelector('#copy')?.addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
	await navigator.clipboard.writeText(recipe?.textContent || '');
	if (status) status.textContent = 'Το live.recipe αντιγράφηκε.';
  } catch {
	if (status) status.textContent = 'Δεν ήταν δυνατή η αντιγραφή.';
  }
});

document.querySelector('#support-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const topic = form.get('topic');
  const system = String(form.get('system') || '').trim();
  const message = String(form.get('message') || '').trim();
  const subject = encodeURIComponent(`Linux Studio support: ${topic}`);
  const body = encodeURIComponent(`Θέμα: ${topic}\nΛειτουργικό/διανομή: ${system || 'Δεν δόθηκε'}\n\n${message}`);
  location.href = `mailto:billpirgopoulos1@gmail.com?subject=${subject}&body=${body}`;
});

updateRecipe();

(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const menu = document.querySelector('#mobile-menu');
  const toggle = document.querySelector('.menu-toggle');

  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    menu.hidden = expanded;
    toggle.setAttribute('aria-expanded', String(!expanded));
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { closeMenu(); toggle.focus(); }
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
    document.documentElement.classList.add('js-motion');
  }

  const progress = document.querySelector('.scroll-progress');
  let scheduled = false;
  function scrollProgress() {
    const distance = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (distance > 0 ? Math.min(1, scrollY / distance) : 0) + ')';
    scheduled = false;
  }
  addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(scrollProgress); }
  }, { passive: true });
  addEventListener('resize', scrollProgress);
  scrollProgress();

  const distributions = {
    debian: {
      title: 'Debian 13',
      description: 'Μια σταθερή βάση με επιλογή εγκαταστάτη για το τελικό ISO.',
      kernel: 'Standard · Real-time',
      desktop: 'Xfce · GNOME · KDE Plasma · Τερματικό',
      tool: 'live-build',
      environment: 'Σε Debian 13 x86-64 ή σε ξεχωριστό περιβάλλον WSL 2 από τα Windows.',
    },
    ubuntu: {
      title: 'Ubuntu 24.04 LTS',
      description: 'Διάλεξε παραλλαγή kernel και ένα γνώριμο περιβάλλον για την εικόνα Live.',
      kernel: 'Generic · HWE · Low-latency',
      desktop: 'Xfce · GNOME · KDE Plasma · Τερματικό',
      tool: 'debootstrap + Casper',
      environment: 'Σε Ubuntu 24.04 LTS x86-64 ή σε ξεχωριστό περιβάλλον WSL 2 από τα Windows.',
    },
    arch: {
      title: 'Arch Linux',
      description: 'Μια rolling βάση με τέσσερις επιλογές kernel και τα εργαλεία archiso.',
      kernel: 'Standard · LTS · Zen · Hardened',
      desktop: 'Xfce · Τερματικό',
      tool: 'archiso',
      environment: 'Σε Arch Linux x86-64 ή σε ξεχωριστό περιβάλλον WSL 2 από τα Windows.',
    },
    fedora: {
      title: 'Fedora 44',
      description: 'Δημιούργησε την εικόνα με Lorax μέσα σε αποκλειστική εικονική μηχανή.',
      kernel: 'Standard · Debug',
      desktop: 'Xfce · GNOME · KDE Plasma · Τερματικό',
      tool: 'Lorax',
      environment: 'Απαιτείται αποκλειστική VM Fedora 44 x86-64. Το προφίλ Fedora χρησιμοποιεί τον εγκαταστάτη Anaconda κατά τη δημιουργία.',
    },
  };
  const detail = document.querySelector('#distro-detail');
  function chooseDistro(id) {
    const selection = distributions[id];
    if (!selection) return;
    document.querySelectorAll('[data-distro]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.distro === id));
    });
    detail.classList.remove('changing');
    for (const [key, value] of Object.entries(selection)) document.getElementById('distro-' + key).textContent = value;
    if (!reducedMotion.matches) {
      void detail.offsetWidth;
      detail.classList.add('changing');
    }
  }
  document.querySelectorAll('[data-distro]').forEach(button => {
    button.addEventListener('click', () => chooseDistro(button.dataset.distro));
  });
  document.querySelectorAll('[data-choose]').forEach(link => {
    link.addEventListener('click', () => chooseDistro(link.dataset.choose));
  });

  const simDistributions = {
    debian: { kernels: ['linux-image-amd64', 'linux-image-rt-amd64'], desktops: ['Xfce', 'GNOME', 'KDE Plasma', 'Τερματικό'] },
    ubuntu: { kernels: ['linux-generic', 'linux-hwe', 'linux-lowlatency'], desktops: ['Xfce', 'GNOME', 'KDE Plasma', 'Τερματικό'] },
    arch: { kernels: ['linux', 'linux-lts', 'linux-zen', 'linux-hardened'], desktops: ['Xfce', 'Τερματικό'] },
    fedora: { kernels: ['kernel', 'kernel-debug'], desktops: ['Xfce', 'GNOME', 'KDE Plasma', 'Τερματικό'] },
  };
  const simSteps = [
    ['ΒΑΣΗ ΤΟΥ ISO', 'Διάλεξε διανομή και kernel'],
    ['ΠΕΡΙΒΑΛΛΟΝ ΕΡΓΑΣΙΑΣ', 'Διάλεξε desktop και θέμα'],
    ['ΓΛΩΣΣΑ ΚΑΙ ΠΛΗΚΤΡΟΛΟΓΙΟ', 'Ρύθμισε τη νέα εικόνα'],
    ['ΕΦΑΡΜΟΓΕΣ', 'Επίλεξε εφαρμογές για το ISO'],
    ['ΕΓΚΑΤΑΣΤΑΣΗ', 'Firmware και Debian installer'],
    ['ΣΥΝΟΨΗ', 'Έλεγχος πριν τη δημιουργία'],
  ];
  let simStep = 0;
  const simDistroSelect = document.querySelector('#sim-distro-select');
  const simKernelSelect = document.querySelector('#sim-kernel-select');
  const simDesktopSelect = document.querySelector('#sim-desktop-select');
  const simRecipe = document.querySelector('#sim-recipe');
  function updateSimRecipe() {
    const distro = simDistroSelect.value;
    const name = simDistributions[distro];
    simRecipe.textContent = `distro: ${distro}\nkernel: ${simKernelSelect.value}\ndesktop: ${simDesktopSelect.value}\nlocale: el_GR\napps: 76 available\noutput: live-${distro}.iso`;
  }
  function selectSimDistro(id) {
    if (!simDistributions[id]) return;
    simDistroSelect.value = id;
    document.querySelectorAll('[data-sim-distro]').forEach(button => button.classList.toggle('active', button.dataset.simDistro === id));
    simKernelSelect.replaceChildren(...simDistributions[id].kernels.map(value => new Option(value, value)));
    simDesktopSelect.replaceChildren(...simDistributions[id].desktops.map(value => new Option(value, value)));
    updateSimRecipe();
  }
  document.querySelectorAll('[data-sim-distro]').forEach(button => button.addEventListener('click', () => selectSimDistro(button.dataset.simDistro)));
  simDistroSelect.addEventListener('change', () => selectSimDistro(simDistroSelect.value));
  simKernelSelect.addEventListener('change', updateSimRecipe);
  simDesktopSelect.addEventListener('change', updateSimRecipe);
  function setSimStep(index) {
    simStep = Math.max(0, Math.min(5, index));
    document.querySelectorAll('[data-sim-step]').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === simStep));
    document.querySelector('#sim-step-kicker').textContent = simSteps[simStep][0];
    document.querySelector('#sim-step-title').textContent = simSteps[simStep][1];
  }
  document.querySelectorAll('[data-sim-step]').forEach(button => button.addEventListener('click', () => setSimStep(Number(button.dataset.simStep))));
  document.querySelector('#sim-next').addEventListener('click', () => setSimStep(simStep === 5 ? 0 : simStep + 1));
  document.querySelectorAll('[data-sim-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-sim-view]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelector('#sim-iso-view').hidden = button.dataset.simView !== 'iso';
    document.querySelector('#sim-apps-view').hidden = button.dataset.simView !== 'apps';
    document.querySelector('#sim-profiles-view').hidden = button.dataset.simView !== 'profiles';
    document.querySelector('#sim-page-title').textContent = button.dataset.simView === 'iso' ? 'Δημιουργία Linux ISO' : button.dataset.simView === 'apps' ? 'Εφαρμογές Linux' : 'Τα προφίλ μου';
  }));
  selectSimDistro('debian');

  const supportForm = document.querySelector('#support-form');
  supportForm.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(supportForm);
    const subject = encodeURIComponent(`Linux Studio support: ${data.get('topic')}`);
    const body = encodeURIComponent(`Όνομα: ${data.get('name')}\nEmail: ${data.get('email')}\nΘέμα: ${data.get('topic')}\n\n${data.get('message')}`);
    location.href = `mailto:billpirgopoulos1@gmail.com?subject=${subject}&body=${body}`;
  });

  fetch('https://api.github.com/repos/Anserb/iso-studio/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(response => response.ok ? response.json() : null)
    .then(release => { if (release?.tag_name) document.querySelector('.sim-platform').textContent = `${release.tag_name} / x86-64 Live`; })
    .catch(() => {});
})();

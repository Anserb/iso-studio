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
})();

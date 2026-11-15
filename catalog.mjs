const kernel = (id, name) => ({ id, name });

export const catalog = {
  distros: [
    {
      id: 'debian', name: 'Debian 13', release: 'trixie', tool: 'live-build',
      commands: ['lb'], firmware: true, installer: true,
      kernels: [kernel('linux-image-amd64', 'Standard'), kernel('linux-image-rt-amd64', 'Real-time')],
    },
    {
      id: 'ubuntu', name: 'Ubuntu 24.04 LTS', release: 'noble', tool: 'debootstrap + Casper',
      commands: ['debootstrap', 'systemd-nspawn', 'grub-mkrescue', 'mksquashfs', 'xorriso', 'mformat'],
      firmware: true,
      kernels: [
        kernel('linux-generic', 'Generic'), kernel('linux-generic-hwe-24.04', 'HWE'),
        kernel('linux-lowlatency', 'Low-latency'),
      ],
    },
    {
      id: 'arch', name: 'Arch Linux', tool: 'archiso',
      commands: ['mkarchiso'], desktops: ['xfce', 'standard'],
      kernels: [
        kernel('linux', 'Standard'), kernel('linux-lts', 'LTS'),
        kernel('linux-zen', 'Zen'), kernel('linux-hardened', 'Hardened'),
      ],
    },
    {
      id: 'fedora', name: 'Fedora 44', release: '44', tool: 'Lorax',
      commands: ['livemedia-creator'], needsVm: true, keyboards: ['us,gr', 'us'],
      kernels: [kernel('kernel', 'Standard'), kernel('kernel-debug', 'Debug')],
    },
  ],
  desktops: [
    { id: 'xfce', name: 'Xfce', detail: 'Ελαφρύ και οικείο', icon: '◫' },
    { id: 'gnome', name: 'GNOME', detail: 'Σύγχρονο περιβάλλον εργασίας', icon: '◉' },
    { id: 'kde', name: 'KDE Plasma', detail: 'Πολλές επιλογές εμφάνισης', icon: '◇' },
    { id: 'standard', name: 'Μόνο τερματικό', detail: 'Χωρίς γραφικό περιβάλλον', icon: '›_' },
  ],
  languages: [
    { id: 'el_GR.UTF-8', name: 'Ελληνικά' },
    { id: 'en_US.UTF-8', name: 'English (US)' },
  ],
  keyboards: [
    { id: 'us,gr', name: 'Αγγλικά + Ελληνικά' },
    { id: 'us', name: 'Αγγλικά (US)' },
    { id: 'gr', name: 'Ελληνικά' },
  ],
  apps: [
    { id: 'firefox', name: 'Firefox', packages: { debian: 'firefox-esr', ubuntu: null } },
    { id: 'libreoffice', name: 'LibreOffice', packages: { arch: 'libreoffice-fresh' } },
    { id: 'vlc', name: 'VLC' },
    { id: 'gparted', name: 'GParted' },
    { id: 'git', name: 'Git' },
    { id: 'curl', name: 'curl' },
  ],
};

export function choicesFor(distro) {
  return {
    desktops: catalog.desktops.filter(item => !distro.desktops || distro.desktops.includes(item.id)),
    keyboards: catalog.keyboards.filter(item => !distro.keyboards || distro.keyboards.includes(item.id)),
    apps: catalog.apps.filter(item => item.packages?.[distro.id] !== null),
  };
}

export const isoFilename = (name, distro) => `${name}-${distro}-amd64.iso`;

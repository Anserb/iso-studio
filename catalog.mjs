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
  appearances: [
    { id: 'default', name: 'Προεπιλογή διανομής', detail: 'Η αρχική εμφάνιση του περιβάλλοντος εργασίας.' },
    { id: 'windows-light', name: 'Διάταξη Windows · Φωτεινό', detail: 'Κάτω γραμμή εργασιών, μενού εφαρμογών και φωτεινά παράθυρα.' },
    { id: 'windows-dark', name: 'Διάταξη Windows · Σκούρο', detail: 'Κάτω γραμμή εργασιών, μενού εφαρμογών και σκούρα παράθυρα.' },
    { id: 'nord', name: 'Nord', detail: 'Σκούρο μπλε, ψυχρές επιφάνειες και γαλάζια στοιχεία.' },
    { id: 'dracula', name: 'Dracula', detail: 'Σκούρες επιφάνειες με μωβ και ροζ λεπτομέρειες.' },
    { id: 'ocean', name: 'Ocean', detail: 'Βαθύ μπλε και τιρκουάζ λεπτομέρειες.' },
    { id: 'forest', name: 'Forest', detail: 'Σκούρο πράσινο και φυσικοί τόνοι.' },
    { id: 'sunset', name: 'Sunset', detail: 'Ζεστές σκούρες επιφάνειες και πορτοκαλί στοιχεία.' },
    { id: 'rose', name: 'Rose', detail: 'Απαλό φωτεινό θέμα με ροζ λεπτομέρειες.' },
    { id: 'graphite', name: 'Graphite', detail: 'Ουδέτερο σκούρο θέμα με γκρι επιφάνειες.' },
    { id: 'ivory', name: 'Ivory', detail: 'Ζεστό φωτεινό θέμα με κρεμ επιφάνειες.' },
    { id: 'midnight', name: 'Midnight', detail: 'Πολύ σκούρο μπλε και φωτεινές κυανές λεπτομέρειες.' },
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
    { id: 'git', name: 'Git', category: 'Προγραμματισμός' },
    { id: 'curl', name: 'curl', category: 'Προγραμματισμός' },
    { id: 'neovim', name: 'Neovim', category: 'Προγραμματισμός' },
    { id: 'vim', name: 'Vim', category: 'Προγραμματισμός' },
    { id: 'python3', name: 'Python', category: 'Προγραμματισμός', packages: { arch: 'python', fedora: 'python3' } },
    { id: 'python3-pip', name: 'Python pip', category: 'Προγραμματισμός', packages: { arch: 'python-pip' } },
    { id: 'nodejs', name: 'Node.js', category: 'Προγραμματισμός' },
    { id: 'npm', name: 'npm', category: 'Προγραμματισμός' },
    { id: 'openjdk-21-jdk', name: 'OpenJDK 21', category: 'Προγραμματισμός', packages: { arch: 'jdk21-openjdk', fedora: 'java-21-openjdk-devel' } },
    { id: 'gcc', name: 'GCC compiler', category: 'Προγραμματισμός' },
    { id: 'clang', name: 'Clang compiler', category: 'Προγραμματισμός' },
    { id: 'make', name: 'GNU Make', category: 'Προγραμματισμός' },
    { id: 'cmake', name: 'CMake', category: 'Προγραμματισμός' },
    { id: 'gdb', name: 'GDB debugger', category: 'Προγραμματισμός' },
    { id: 'godot', name: 'Godot Engine', category: 'Προγραμματισμός' },
    { id: 'podman', name: 'Podman', category: 'Προγραμματισμός' },
    { id: 'sqlite3', name: 'SQLite', category: 'Προγραμματισμός', packages: { arch: 'sqlite', fedora: 'sqlite' } },
    { id: 'steam', name: 'Steam', category: 'Gaming', packages: { debian: null, ubuntu: null, arch: 'steam', fedora: null } },
    { id: '0ad', name: '0 A.D.', category: 'Gaming', packages: { fedora: null } },
    { id: 'supertuxkart', name: 'SuperTuxKart', category: 'Gaming' },
    { id: 'dosbox', name: 'DOSBox', category: 'Gaming' },
    { id: 'gamemode', name: 'GameMode', category: 'Gaming' },
    { id: 'firefox', name: 'Firefox', category: 'Internet', packages: { debian: 'firefox-esr', ubuntu: null } },
    { id: 'chromium', name: 'Chromium', category: 'Internet', packages: { debian: 'chromium', ubuntu: null, fedora: 'chromium' } },
    { id: 'thunderbird', name: 'Thunderbird', category: 'Γραφείο', packages: { ubuntu: null } },
    { id: 'libreoffice', name: 'LibreOffice', category: 'Γραφείο', packages: { arch: 'libreoffice-fresh', fedora: 'libreoffice-writer' } },
    { id: 'evolution', name: 'Evolution', category: 'Γραφείο' },
    { id: 'keepassxc', name: 'KeePassXC', category: 'Γραφείο' },
    { id: 'remmina', name: 'Remmina', category: 'Γραφείο' },
    { id: 'vlc', name: 'VLC', category: 'Δημιουργία & πολυμέσα', packages: { fedora: null } },
    { id: 'gimp', name: 'GIMP', category: 'Δημιουργία & πολυμέσα' },
    { id: 'inkscape', name: 'Inkscape', category: 'Δημιουργία & πολυμέσα' },
    { id: 'krita', name: 'Krita', category: 'Δημιουργία & πολυμέσα' },
    { id: 'blender', name: 'Blender', category: 'Δημιουργία & πολυμέσα' },
    { id: 'kdenlive', name: 'Kdenlive', category: 'Δημιουργία & πολυμέσα' },
    { id: 'audacity', name: 'Audacity', category: 'Δημιουργία & πολυμέσα' },
    { id: 'obs-studio', name: 'OBS Studio', category: 'Δημιουργία & πολυμέσα' },
    { id: 'gparted', name: 'GParted', category: 'Συστήματος' },
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

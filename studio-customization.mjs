const fonts = ['Sans', 'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono'];
const icons = ['auto', 'Papirus', 'Papirus-Dark', 'Papirus-Light'];
const cursors = ['auto', 'Adwaita'];
const panels = ['bottom', 'top', 'dock'];
export function validateExtras(options) {
  const files = options.files ?? [];
  if (!Array.isArray(files) || files.length > 30) throw new Error('Πρόσθεσε έως 30 προσωπικά αρχεία.');
  let total = 0;
  const names = new Set();
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !/^[\p{L}\p{N}_ .()-]{1,100}$/u.test(file.name)
      || file.name.startsWith('.') || file.name.includes('..') || names.has(file.name)
      || !['LinuxStudio', 'Documents', 'Pictures', 'Desktop'].includes(file.destination || 'LinuxStudio')
      || typeof file.content !== 'string' || file.content.length > 12 * 1024 ** 2 || file.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) throw new Error('Μη έγκυρο όνομα ή περιεχόμενο προσωπικού αρχείου.');
    const size = Buffer.byteLength(file.content, 'base64');
    if (size > 8 * 1024 ** 2) throw new Error('Κάθε προσωπικό αρχείο μπορεί να είναι έως 8 MB.');
    total += size; names.add(file.name);
  }
  if (total > 20 * 1024 ** 2) throw new Error('Τα προσωπικά αρχεία μπορούν να είναι έως 20 MB συνολικά.');
  const c = options.customization;
  if (c !== undefined) {
    if (!c || typeof c !== 'object' || Array.isArray(c)
      || !fonts.includes(c.font) || !icons.includes(c.icons) || !cursors.includes(c.cursor) || !panels.includes(c.panel)
      || !/^#[a-f\d]{6}$/i.test(c.accent) || (c.wallpaper && !names.has(c.wallpaper))) throw new Error('Μη έγκυρες ρυθμίσεις εμφάνισης.');
    if (options.desktop === 'standard') throw new Error('Οι ρυθμίσεις εμφάνισης χρειάζονται γραφικό περιβάλλον.');
    if ((options.appearance ?? 'default') === 'default') throw new Error('Διάλεξε θέμα για τις πρόσθετες ρυθμίσεις εμφάνισης.');
    if (c.wallpaper) {
      const file = files.find(file => file.name === c.wallpaper);
      const bytes = Buffer.from(file.content, 'base64');
      if (!(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,3).equals(Buffer.from([255,216,255])))) throw new Error('Η ταπετσαρία πρέπει να είναι εικόνα PNG ή JPEG.');
    }
  }
  return { files, customization: c };
}

export function personalFilesSetup(files = [], prefix = '', wallpaper) {
  if (!files.length) return '';
  // Names cannot contain quotes, slashes, shell expansions, or newlines.
  return files.map(file => {
    const destination = `${prefix}/etc/skel/${file.destination || 'LinuxStudio'}`;
    return `mkdir -p '${destination}'\nprintf '%s' '${file.content}' | base64 -d > '${destination}/${file.name}'\nchmod 644 '${destination}/${file.name}'\n`;
  }).join('') + (wallpaper ? `mkdir -p '${prefix}/usr/share/backgrounds'\ncp -- '${prefix}/etc/skel/${files.find(file => file.name === wallpaper).destination || 'LinuxStudio'}/${wallpaper}' '${prefix}/usr/share/backgrounds/linux-studio-wallpaper'\n` : '');
}

export const creationPresets = [
  { id: 'gaming', name: 'Gaming', detail: 'Xfce, σκούρο θέμα, παιχνίδια και GameMode.', desktop: 'xfce', appearance: 'midnight', apps: ['gamemode', 'supertuxkart', '0ad', 'steam'] },
  { id: 'office', name: 'Office', detail: 'Έγγραφα, email και απομακρυσμένη εργασία.', desktop: 'kde', appearance: 'windows-light', apps: ['libreoffice', 'thunderbird', 'keepassxc', 'remmina'] },
  { id: 'developer', name: 'Developer', detail: 'Git, Python, Node.js και εργαλεία ανάπτυξης.', desktop: 'gnome', appearance: 'dracula', apps: ['git', 'python3', 'python3-pip', 'nodejs', 'npm', 'neovim', 'gcc', 'make'] },
  { id: 'creator', name: 'Creator', detail: 'Εικόνα, 3D, μοντάζ και εγγραφή.', desktop: 'kde', appearance: 'nord', apps: ['gimp', 'inkscape', 'blender', 'kdenlive', 'audacity', 'obs-studio'] },
  { id: 'light', name: 'Παλιός υπολογιστής', detail: 'Xfce και λίγα εργαλεία για ελαφρύ ξεκίνημα.', desktop: 'xfce', appearance: 'graphite', apps: ['firefox', 'vim'] },
];

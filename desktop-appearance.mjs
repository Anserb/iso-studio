// These defaults are written into the image before its first user account is created.
export const palettes = {
  'windows-light': { dark: false, background: '#dbeafe', surface: '#f5f7fb', text: '#182334', accent: '#2563eb', secondary: '#a5c6ef' },
  'windows-dark': { dark: true, background: '#111827', surface: '#202b3e', text: '#f1f5f9', accent: '#60a5fa', secondary: '#1e3a5f' },
  nord: { dark: true, background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0', secondary: '#4c566a' },
  dracula: { dark: true, background: '#282a36', surface: '#343746', text: '#f8f8f2', accent: '#bd93f9', secondary: '#493c63' },
  ocean: { dark: true, background: '#0b2030', surface: '#17364a', text: '#e0f2fe', accent: '#22d3ee', secondary: '#075985' },
  forest: { dark: true, background: '#10261e', surface: '#1e3a2f', text: '#ecfdf5', accent: '#6ee7b7', secondary: '#16634b' },
  sunset: { dark: true, background: '#2c1b24', surface: '#49303b', text: '#fff1e6', accent: '#fb923c', secondary: '#793747' },
  rose: { dark: false, background: '#fce7f3', surface: '#fff7fb', text: '#492538', accent: '#be185d', secondary: '#f9a8d4' },
  graphite: { dark: true, background: '#18181b', surface: '#2d2d33', text: '#f4f4f5', accent: '#a1a1aa', secondary: '#3f3f46' },
  ivory: { dark: false, background: '#f3ebdd', surface: '#fffaf0', text: '#44382a', accent: '#916b3d', secondary: '#dfc7a4' },
  midnight: { dark: true, background: '#070c18', surface: '#111c32', text: '#dbeafe', accent: '#38bdf8', secondary: '#1e3a5f' },
};

export function appearancePackages(distro, desktop, appearance, customization) {
  if (appearance === 'default') return [];
  if (customization) return [...new Set([...appearancePackages(distro, desktop, appearance),
    ...(customization.icons !== 'auto' ? ['papirus-icon-theme'] : []),
    distro === 'arch' ? 'ttf-dejavu' : distro === 'fedora' ? 'dejavu-sans-fonts' : 'fonts-dejavu-core',
    ...(distro === 'fedora' ? ['dejavu-serif-fonts', 'dejavu-sans-mono-fonts'] : []),
    ...(customization.cursor === 'Adwaita' ? [distro === 'arch' ? 'adwaita-cursors' : distro === 'fedora' ? 'adwaita-cursor-theme' : 'adwaita-icon-theme'] : []),
  ])];
  if (desktop === 'xfce') return [
    distro === 'arch' ? 'arc-gtk-theme' : 'arc-theme',
    'papirus-icon-theme', 'xfce4-whiskermenu-plugin',
  ];
  if (desktop === 'gnome') return ['papirus-icon-theme', 'gnome-shell-extension-dash-to-panel'];
  return [];
}

function xfceFiles(dark) {
  const theme = dark ? 'Arc-Dark' : 'Arc';
  return {
    '/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml': `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xsettings" version="1.0">
  <property name="Net" type="empty">
    <property name="ThemeName" type="string" value="${theme}"/>
    <property name="IconThemeName" type="string" value="Papirus${dark ? '-Dark' : '-Light'}"/>
  </property>
  <property name="Gtk" type="empty">
    <property name="FontName" type="string" value="Sans 10"/>
    <property name="ApplicationPreferDarkTheme" type="bool" value="${dark}"/>
  </property>
</channel>
`,
    '/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml': `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="theme" type="string" value="${theme}"/>
    <property name="button_layout" type="string" value="O|HMC"/>
    <property name="workspace_count" type="int" value="1"/>
    <property name="use_compositing" type="bool" value="true"/>
  </property>
</channel>
`,
    '/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml': `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-panel" version="1.0">
  <property name="configver" type="int" value="2"/>
  <property name="panels" type="array">
    <value type="int" value="1"/>
    <property name="dark-mode" type="bool" value="${dark}"/>
    <property name="panel-1" type="empty">
      <property name="position" type="string" value="p=10;x=0;y=0"/>
      <property name="position-locked" type="bool" value="true"/>
      <property name="length" type="uint" value="100"/>
      <property name="size" type="uint" value="44"/>
      <property name="icon-size" type="uint" value="24"/>
      <property name="autohide-behavior" type="uint" value="0"/>
      <property name="plugin-ids" type="array">
        <value type="int" value="1"/><value type="int" value="2"/>
        <value type="int" value="3"/><value type="int" value="4"/>
        <value type="int" value="5"/><value type="int" value="6"/>
      </property>
    </property>
  </property>
  <property name="plugins" type="empty">
    <property name="plugin-1" type="string" value="whiskermenu"/>
    <property name="plugin-2" type="string" value="tasklist">
      <property name="grouping" type="uint" value="1"/>
      <property name="show-labels" type="bool" value="true"/>
      <property name="expand" type="bool" value="true"/>
    </property>
    <property name="plugin-3" type="string" value="separator">
      <property name="expand" type="bool" value="true"/><property name="style" type="uint" value="0"/>
    </property>
    <property name="plugin-4" type="string" value="systray"/>
    <property name="plugin-5" type="string" value="clock"/>
    <property name="plugin-6" type="string" value="showdesktop"/>
  </property>
</channel>
`,
  };
}

function kdeFiles(dark, appearance, palette = palettes[appearance]) {
  return {
    '/etc/skel/.config/kdeglobals': `[General]
ColorScheme=LinuxStudio-${appearance}

[KDE]
LookAndFeelPackage=org.kde.breeze${dark ? 'dark' : ''}.desktop

[Icons]
Theme=breeze${dark ? '-dark' : ''}
`,
    '/etc/skel/.config/plasmarc': `[Theme]
name=breeze-${dark ? 'dark' : 'light'}
`,
    '/etc/skel/.config/plasma-org.kde.plasma.desktop-appletsrc': `[Containments][1]
activityId=
formfactor=0
immutability=1
lastScreen=0
location=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.color

[Containments][1][Wallpaper][org.kde.color][General]
Color=${rgb(palette.background)}

[Containments][2]
activityId=
formfactor=2
immutability=1
lastScreen=0
location=4
plugin=org.kde.panel

[Containments][2][General]
AppletOrder=3;4;5;6;7

[Containments][2][Applets][3]
immutability=1
plugin=org.kde.plasma.kickoff

[Containments][2][Applets][4]
immutability=1
plugin=org.kde.plasma.icontasks

[Containments][2][Applets][5]
immutability=1
plugin=org.kde.plasma.systemtray

[Containments][2][Applets][6]
immutability=1
plugin=org.kde.plasma.digitalclock

[Containments][2][Applets][7]
immutability=1
plugin=org.kde.plasma.showdesktop
`,
    '/etc/skel/.config/autostart/linux-studio-colors.desktop': `[Desktop Entry]
Type=Application
Name=Linux Studio initial colors
Exec=/bin/sh /usr/local/share/linux-studio/initial-colors.sh
OnlyShowIn=KDE;
X-KDE-autostart-phase=0
`,
    '/usr/local/share/linux-studio/initial-colors.sh': `#!/bin/sh
set -eu
state="\${XDG_CONFIG_HOME:-$HOME/.config}/linux-studio"
[ ! -e "$state/appearance-applied" ] || exit 0
plasma-apply-colorscheme LinuxStudio-${appearance}
mkdir -p "$state"
touch "$state/appearance-applied"
`,
  };
}

function gnomeFiles(dark, appearance, palette = palettes[appearance]) {
  return {
    '/etc/skel/.config/autostart/linux-studio-gnome.desktop': `[Desktop Entry]
Type=Application
Name=Linux Studio initial appearance
Exec=/bin/sh /usr/local/share/linux-studio/initial-gnome.sh
OnlyShowIn=GNOME;
`,
    '/usr/local/share/linux-studio/initial-gnome.sh': `#!/bin/sh
set -eu
state="\${XDG_CONFIG_HOME:-$HOME/.config}/linux-studio"
[ ! -e "$state/appearance-applied" ] || exit 0
gsettings set org.gnome.desktop.interface color-scheme '${dark ? 'prefer-dark' : 'prefer-light'}'
gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita${dark ? '-dark' : ''}'
gsettings set org.gnome.desktop.interface icon-theme 'Papirus${dark ? '-Dark' : '-Light'}'
gsettings set org.gnome.desktop.wm.preferences button-layout 'appmenu:minimize,maximize,close'
gsettings set org.gnome.desktop.background picture-uri ''
gsettings set org.gnome.desktop.background picture-uri-dark ''
gsettings set org.gnome.desktop.background picture-options 'none'
gsettings set org.gnome.desktop.background primary-color '${palette.background}'
gsettings set org.gnome.desktop.background secondary-color '${palette.secondary}'
gsettings set org.gnome.desktop.background color-shading-type 'vertical'
gsettings set org.gnome.shell disable-user-extensions false
gnome-extensions disable ubuntu-dock@ubuntu.com 2>/dev/null || true
gnome-extensions enable dash-to-panel@jderose9.github.com
mkdir -p "$state"
touch "$state/appearance-applied"
`,
    '/usr/share/glib-2.0/schemas/90_linux-studio.gschema.override': `[org.gnome.desktop.interface]
color-scheme='${dark ? 'prefer-dark' : 'prefer-light'}'
gtk-theme='Adwaita${dark ? '-dark' : ''}'
icon-theme='Papirus${dark ? '-Dark' : '-Light'}'

[org.gnome.desktop.wm.preferences]
button-layout='appmenu:minimize,maximize,close'

[org.gnome.shell]
disable-user-extensions=false
enabled-extensions=['dash-to-panel@jderose9.github.com']

[org.gnome.desktop.background]
picture-uri=''
picture-uri-dark=''
picture-options='none'
primary-color='${palette.background}'
secondary-color='${palette.secondary}'
color-shading-type='vertical'
`,
  };
}

function rgb(hex) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}

function colorScheme(palette, appearance) {
  const colors = { Window: palette.background, View: palette.surface, Button: palette.surface,
    Selection: palette.accent, Tooltip: palette.surface, Complementary: palette.background, Header: palette.surface };
  return `[General]
Name=Linux Studio ${appearance}
ColorScheme=LinuxStudio-${appearance}

` + Object.entries(colors).map(([group, background]) => `[Colors:${group}]
BackgroundNormal=${rgb(background)}
BackgroundAlternate=${rgb(palette.surface)}
ForegroundNormal=${rgb(group === 'Selection' ? palette.background : palette.text)}
ForegroundInactive=${rgb(palette.text)}
ForegroundActive=${rgb(palette.accent)}
ForegroundLink=${rgb(palette.accent)}
DecorationFocus=${rgb(palette.accent)}
DecorationHover=${rgb(palette.accent)}
`).join('\n') + `
[WM]
activeBackground=${rgb(palette.surface)}
activeForeground=${rgb(palette.text)}
inactiveBackground=${rgb(palette.background)}
inactiveForeground=${rgb(palette.text)}
`;
}

function gtkStyle(palette) {
  return `@define-color theme_selected_bg_color ${palette.accent};
@define-color selected_bg_color ${palette.accent};
@define-color accent_bg_color ${palette.accent};
@define-color accent_color ${palette.accent};
@define-color accent_fg_color ${palette.background};
@define-color theme_selected_fg_color ${palette.background};
window, .background { background-color: ${palette.background}; color: ${palette.text}; }
headerbar, .titlebar, .xfce4-panel { background-color: ${palette.surface}; color: ${palette.text}; }
button { background-image: none; background-color: ${palette.surface}; color: ${palette.text}; }
button:checked, selection, row:selected { background-color: ${palette.accent}; color: ${palette.background}; }
`;
}

export function appearanceFiles(desktop, appearance, customization) {
  if (appearance === 'default') return {};
  const base = palettes[appearance];
  const palette = base && { ...base, ...(customization ? { accent: customization.accent } : {}) };
  if (!palette) throw new Error('Άγνωστο θέμα εμφάνισης.');
  const { dark } = palette;
  const generators = { xfce: xfceFiles, kde: kdeFiles, gnome: gnomeFiles };
  if (!generators[desktop]) throw new Error('Τα θέματα χρειάζονται γραφικό περιβάλλον.');
  const files = generators[desktop](dark, appearance, palette);
  files['/etc/skel/.config/gtk-3.0/gtk.css'] = gtkStyle(palette);
  files['/etc/skel/.config/gtk-4.0/gtk.css'] = gtkStyle(palette);
  if (desktop === 'kde') {
    files[`/usr/share/color-schemes/LinuxStudio-${appearance}.colors`] = colorScheme(palette, appearance);
  }
  if (desktop === 'xfce') {
    const rgba = [...rgb(palette.background).map(value => (value / 255).toFixed(6)), '1'];
    files['/etc/skel/.config/autostart/linux-studio-background.desktop'] = `[Desktop Entry]
Type=Application
Name=Linux Studio initial background
Exec=/bin/sh /usr/local/share/linux-studio/initial-background.sh
OnlyShowIn=XFCE;
`;
    files['/usr/local/share/linux-studio/initial-background.sh'] = `#!/bin/sh
set -eu
state="\${XDG_CONFIG_HOME:-$HOME/.config}/linux-studio"
[ ! -e "$state/appearance-applied" ] || exit 0
for attempt in 1 2 3 4 5; do
  paths=$(xfconf-query -c xfce4-desktop -l | grep '/last-image$' || true)
  [ -z "$paths" ] || break
  sleep 1
done
[ -n "$paths" ] || exit 1
printf '%s\\n' "$paths" | while IFS= read -r path; do
  base=\${path%/last-image}
  xfconf-query -c xfce4-desktop -p "$base/image-style" -n -t int -s 0
  xfconf-query -c xfce4-desktop -p "$base/color-style" -n -t int -s 0
  xfconf-query -c xfce4-desktop -p "$base/rgba1" -n -t double -t double -t double -t double ${rgba.map(value => `-s ${value}`).join(' ')}
done
mkdir -p "$state"
touch "$state/appearance-applied"
`;
  }
  if (customization) customize(files, desktop, dark, customization);
  return files;
}

function customize(files, desktop, dark, c) {
  const icon = c.icons === 'auto' ? null : c.icons;
  const wallpaper = '/usr/share/backgrounds/linux-studio-wallpaper';
  if (desktop === 'xfce') {
    const key = '/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/';
    files[key + 'xsettings.xml'] = files[key + 'xsettings.xml'].replace('value="Sans 10"', `value="${c.font} 10"`)
      .replace('<property name="Gtk" type="empty">', `<property name="Gtk" type="empty">${c.cursor === 'auto' ? '' : `<property name="CursorThemeName" type="string" value="${c.cursor}"/>`}`);
    if (icon) files[key + 'xsettings.xml'] = files[key + 'xsettings.xml'].replace(/value="Papirus(?:-Dark|-Light)?"/, `value="${icon}"`);
    files[key + 'xfce4-panel.xml'] = files[key + 'xfce4-panel.xml'].replace('p=10;x=0;y=0', c.panel === 'top' ? 'p=6;x=0;y=0' : 'p=10;x=0;y=0')
      .replace('name="length" type="uint" value="100"', `name="length" type="uint" value="${c.panel === 'dock' ? 65 : 100}"`);
    if (c.wallpaper) files['/usr/local/share/linux-studio/initial-background.sh'] = files['/usr/local/share/linux-studio/initial-background.sh']
      .replace('-p "$base/image-style" -n -t int -s 0', '-p "$base/image-style" -n -t int -s 5')
      .replace('  base=${path%/last-image}', `  base=\${path%/last-image}\n  xfconf-query -c xfce4-desktop -p "$path" -s '${wallpaper}'`);
  }
  if (desktop === 'kde') {
    const key = '/etc/skel/.config/';
    files[key + 'kdeglobals'] = files[key + 'kdeglobals'].replace('[General]\n', `[General]\nfont=${c.font},10,-1,5,50,0,0,0,0,0\n`);
    if (icon) files[key + 'kdeglobals'] = files[key + 'kdeglobals'].replace(/Theme=breeze(?:-dark)?/, `Theme=${icon}`);
    if (c.cursor !== 'auto') files[key + 'kcminputrc'] = `[Mouse]\ncursorTheme=${c.cursor}\n`;
    files[key + 'plasma-org.kde.plasma.desktop-appletsrc'] = files[key + 'plasma-org.kde.plasma.desktop-appletsrc'].replace('location=4', `location=${c.panel === 'top' ? 3 : 4}`)
      .replace('[Containments][2][General]\n', `[Containments][2][General]\n${c.panel === 'dock' ? 'alignment=1\nlengthMode=1\nminLength=800\nmaxLength=800\nfloating=true\n' : ''}`);
    if (c.wallpaper) files[key + 'plasma-org.kde.plasma.desktop-appletsrc'] = files[key + 'plasma-org.kde.plasma.desktop-appletsrc']
      .replace('wallpaperplugin=org.kde.color', 'wallpaperplugin=org.kde.image') + `\n[Containments][1][Wallpaper][org.kde.image][General]\nImage=file://${wallpaper}\nFillMode=2\n`;
  }
  if (desktop === 'gnome') {
    const schema = '/usr/share/glib-2.0/schemas/90_linux-studio.gschema.override';
    const script = '/usr/local/share/linux-studio/initial-gnome.sh';
    files[schema] = files[schema].replace('[org.gnome.desktop.interface]\n', `[org.gnome.desktop.interface]\nfont-name='${c.font} 10'\n${c.cursor !== 'auto' ? `cursor-theme='${c.cursor}'\n` : ''}`);
    let extra = `gsettings set org.gnome.desktop.interface font-name '${c.font} 10'\n`;
    if (c.cursor !== 'auto') extra += `gsettings set org.gnome.desktop.interface cursor-theme '${c.cursor}'\n`;
    if (icon) {
      files[schema] = files[schema].replace(/icon-theme='Papirus(?:-Dark|-Light)?'/, `icon-theme='${icon}'`);
      files[script] = files[script].replace(/icon-theme 'Papirus(?:-Dark|-Light)?'/, `icon-theme '${icon}'`);
    }
    const positions = JSON.stringify({ 0: c.panel === 'top' ? 'TOP' : 'BOTTOM' });
    const lengths = JSON.stringify({ 0: c.panel === 'dock' ? 65 : 100 });
    extra += `panel_settings() {\n  schema_dir=/usr/share/gnome-shell/extensions/dash-to-panel@jderose9.github.com/schemas\n  if [ -f "$schema_dir/gschemas.compiled" ]; then gsettings --schemadir "$schema_dir" set org.gnome.shell.extensions.dash-to-panel "$@"; else gsettings set org.gnome.shell.extensions.dash-to-panel "$@"; fi\n}\npanel_settings panel-positions '${positions}'\npanel_settings panel-lengths '${lengths}'\n`;
    if (c.wallpaper) {
      files[schema] = files[schema].replace(/picture-uri(?:-dark)?=''/g, match => match.replace("''", `'file://${wallpaper}'`)).replace("picture-options='none'", "picture-options='zoom'");
      files[script] = files[script].replace(/picture-uri(?:-dark)? ''/g, match => match.replace("''", `'file://${wallpaper}'`)).replace("picture-options 'none'", "picture-options 'zoom'");
    }
    files[script] = files[script].replace('mkdir -p "$state"', extra + 'mkdir -p "$state"');
  }
}

export function appearanceSetup(desktop, appearance, prefix = '', customization) {
  return Object.entries(appearanceFiles(desktop, appearance, customization)).map(([path, content], index) => {
    const destination = prefix + path;
    const folder = destination.slice(0, destination.lastIndexOf('/'));
    const delimiter = `STUDIO_APPEARANCE_${index}`;
    return `mkdir -p '${folder}'
cat > '${destination}' <<'${delimiter}'
${content}${delimiter}
`;
  }).join('\n');
}

import { appearanceSetup } from './desktop-appearance.mjs';

const ubuntuDesktops = {
  standard: [],
  xfce: ['xfce4', 'lightdm', 'lightdm-gtk-greeter', 'xorg'],
  gnome: ['gnome-shell', 'gnome-session', 'gdm3', 'xwayland', 'xserver-xorg'],
  kde: ['kde-plasma-desktop', 'sddm', 'xorg'],
};

export function buildUbuntu({ name, kernel, desktop, language, keyboard, firmware, packages, appearance = 'default' }) {
  const live = [
    'casper', 'systemd-sysv', 'systemd-resolved', 'sudo', 'locales', 'console-setup', 'network-manager',
    kernel, ...(firmware ? ['linux-firmware'] : []), ...ubuntuDesktops[desktop], ...packages,
  ];
  const keyboardOption = keyboard === 'us,gr' ? ' koptions=grp:alt_shift_toggle' : '';
  const mode = desktop === 'standard' ? ' systemd.unit=multi-user.target' : '';
  const sessionSetup = {
    standard: `mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/90-studio.conf <<'GETTY'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ubuntu --noclear %I $TERM
GETTY`,
    xfce: `mkdir -p /etc/lightdm/lightdm.conf.d
printf '%s\\n' '[Seat:*]' 'user-session=xfce' 'autologin-user=ubuntu' > /etc/lightdm/lightdm.conf.d/90-studio.conf`,
    gnome: '',
    kde: `mkdir -p /etc/sddm.conf.d
printf '%s\\n' '[Autologin]' 'User=ubuntu' 'Session=plasma.desktop' > /etc/sddm.conf.d/90-studio.conf`,
  };
  return `mkdir -p media/casper media/boot/grub
cat > media/boot/grub/grub.cfg <<'GRUB'
set timeout=5
menuentry '${name} (Ubuntu Live)' {
  linux /casper/vmlinuz boot=casper live-media-path=/casper noprompt hostname=${name} username=ubuntu locale=${language} klayout=${keyboard}${keyboardOption}${mode} ---
  initrd /casper/initrd
}
GRUB

cat > configure-root <<'CONFIGURE_ROOT'
#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
printf '#!/bin/sh\\nexit 101\\n' > /usr/sbin/policy-rc.d
chmod 755 /usr/sbin/policy-rc.d
apt-get update
apt-get install -y --no-install-recommends ${live.join(' ')}
systemctl enable NetworkManager.service systemd-resolved.service
${sessionSetup[desktop]}
${appearanceSetup(desktop, appearance)}
${desktop === 'gnome' && appearance !== 'default' ? 'glib-compile-schemas --strict /usr/share/glib-2.0/schemas' : ''}
printf '%s UTF-8\\n' '${language}' > /etc/locale.gen
locale-gen
update-locale LANG='${language}'
update-initramfs -u -k all
apt-get clean
rm -f /usr/sbin/policy-rc.d
CONFIGURE_ROOT

as_root /bin/bash -euo pipefail <<'BUILD_UBUNTU'
debootstrap --arch=amd64 --keyring=/usr/share/keyrings/ubuntu-archive-keyring.gpg noble rootfs https://archive.ubuntu.com/ubuntu/
cat > rootfs/etc/apt/sources.list <<'SOURCES'
deb https://archive.ubuntu.com/ubuntu/ noble main universe restricted multiverse
deb https://archive.ubuntu.com/ubuntu/ noble-updates main universe restricted multiverse
deb https://security.ubuntu.com/ubuntu/ noble-security main universe restricted multiverse
SOURCES
install -m 755 configure-root rootfs/tmp/configure-root
systemd-nspawn --quiet --register=no --resolv-conf=copy-host --directory=rootfs -- /tmp/configure-root
rm -f rootfs/tmp/configure-root
ln -sfn ../run/systemd/resolve/stub-resolv.conf rootfs/etc/resolv.conf
truncate -s 0 rootfs/etc/machine-id
kernel_path=$(find rootfs/boot -maxdepth 1 -type f -name 'vmlinuz-*' -print | sort -V | tail -n 1)
test -n "$kernel_path"
version=\${kernel_path##*/vmlinuz-}
cp "$kernel_path" media/casper/vmlinuz
cp "rootfs/boot/initrd.img-$version" media/casper/initrd
mksquashfs rootfs media/casper/filesystem.squashfs -noappend
grub-mkrescue -o image.iso media -iso-level 3
cat image.iso > .iso-studio-result
rm -f image.iso
# nspawn has exited and dismantled its mount namespace.
rm -rf --one-file-system -- rootfs media
BUILD_UBUNTU`;
}

export function buildArch({ name, kernel, desktop, language, keyboard, packages, appearance = 'default' }) {
  const withDesktop = desktop === 'xfce';
  const localeDefinitions = language === 'en_US.UTF-8'
    ? 'en_US.UTF-8 UTF-8'
    : `en_US.UTF-8 UTF-8\n${language} UTF-8`;
  const enableMultilib = packages.includes('steam')
    ? `sed -i '/^#\\[multilib\\]/,/^#Include = \\/etc\\/pacman.d\\/mirrorlist/s/^#//' profile/pacman.conf\ngrep -Fxq '[multilib]' profile/pacman.conf`
    : '';
  const graphicalSetup = withDesktop ? `
printf '%s\\n' xorg-server xfce4 lightdm lightdm-gtk-greeter mesa >> profile/packages.x86_64
mkdir -p "$target/etc/sysusers.d" "$target/etc/tmpfiles.d" \\
  "$target/etc/lightdm/lightdm.conf.d" "$target/etc/X11/xorg.conf.d"
cat > "$target/etc/sysusers.d/studio.conf" <<'USERS'
g autologin -
u live 1000 "Live User" /home/live /bin/bash
m live autologin
USERS
printf '%s\\n' 'C /home/live 0700 live live - /etc/skel' > "$target/etc/tmpfiles.d/studio.conf"
cat > "$target/etc/lightdm/lightdm.conf.d/90-studio.conf" <<'LIGHTDM'
[Seat:*]
greeter-session=lightdm-gtk-greeter
user-session=xfce
autologin-user=live
autologin-session=xfce
LIGHTDM
cat > "$target/etc/X11/xorg.conf.d/00-keyboard.conf" <<'KEYBOARD'
Section "InputClass"
  Identifier "studio-keyboard"
  MatchIsKeyboard "on"
  Option "XkbLayout" "${keyboard}"
${keyboard === 'us,gr' ? '  Option "XkbOptions" "grp:alt_shift_toggle"\n' : ''}EndSection
KEYBOARD
ln -sfn /usr/lib/systemd/system/lightdm.service "$target/etc/systemd/system/display-manager.service"
ln -sfn /usr/lib/systemd/system/graphical.target "$target/etc/systemd/system/default.target"
` : '';
  return `cp -a /usr/share/archiso/configs/releng profile
sed -i 's/^linux$/${kernel}/' profile/packages.x86_64
grep -Fxq '${kernel}' profile/packages.x86_64
for dir in grub syslinux isolinux efiboot; do
  if [[ -d "profile/$dir" ]]; then
    find "profile/$dir" -type f -exec sed -i \\
      -e 's/vmlinuz-linux\\>/vmlinuz-${kernel}/g' \\
      -e 's/initramfs-linux\\([.-]\\)/initramfs-${kernel}\\1/g' {} +
  fi
done
cat >> profile/profiledef.sh <<'PROFILE'
iso_name="${name}"
iso_label="${name.toUpperCase()}"
PROFILE
target=profile/airootfs
printf '%s\\n' '${name}' > "$target/etc/hostname"
printf '%s\\n' 'LANG=${language}' > "$target/etc/locale.conf"
cat > "$target/etc/locale.gen" <<'LOCALES'
${localeDefinitions}
LOCALES
printf '%s\\n' 'KEYMAP=${keyboard === 'gr' ? 'gr' : 'us'}' > "$target/etc/vconsole.conf"
${enableMultilib}
${graphicalSetup}${packages.length ? `printf '%s\\n' ${packages.join(' ')} >> profile/packages.x86_64\n` : ''}
${appearanceSetup(desktop, appearance, 'profile/airootfs')}
sort -u -o profile/packages.x86_64 profile/packages.x86_64
as_root /bin/bash -euo pipefail <<'BUILD_ARCH'
mkarchiso -v -w arch-work -o staging profile
shopt -s nullglob
images=(staging/*.iso)
[[ "\${#images[@]}" == 1 ]]
cat -- "\${images[0]}" > .iso-studio-result
rm -- "\${images[0]}"
BUILD_ARCH`;
}

const fedoraDesktops = {
  standard: '',
  xfce: '@xfce-desktop',
  gnome: '@gnome-desktop',
  kde: '@kde-desktop',
};

export function buildFedora({ name, kernel, desktop, language, keyboard, packages, distro, appearance = 'default' }) {
  const graphical = desktop !== 'standard';
  const desktopSetup = graphical
    ? `sed -i 's/^livesys_session=.*/livesys_session="${desktop}"/' /etc/sysconfig/livesys`
    : `mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<'GETTY'
[Service]
ExecStart=
ExecStart=-/usr/sbin/agetty --autologin liveuser --noclear %I $TERM
GETTY`;
  const installed = [
    '@core', fedoraDesktops[desktop], 'NetworkManager', 'dracut-live', 'dracut-config-generic',
    'livesys-scripts', 'glibc-all-langpacks', 'linux-firmware', 'grub2-efi-x64-cdboot',
    'grub2-pc', 'shim-x64', kernel, `${kernel}-modules`, `${kernel}-modules-extra`, ...packages,
    ...(kernel === 'kernel-debug' ? ['-kernel', '-kernel-core', '-kernel-modules', '-kernel-modules-core', '-kernel-modules-extra'] : []),
  ].filter(Boolean);
  const kickstart = `#version=F${distro.release}
lang ${language}
keyboard --vckeymap=us --xlayouts=${keyboard}${keyboard === 'us,gr' ? ' --switch=grp:alt_shift_toggle' : ''}
timezone UTC --utc
url --url=https://download.fedoraproject.org/pub/fedora/linux/releases/${distro.release}/Everything/x86_64/os/
repo --name=updates --baseurl=https://download.fedoraproject.org/pub/fedora/linux/updates/${distro.release}/Everything/x86_64/
network --bootproto=dhcp --device=link --activate --hostname=${name}
rootpw --lock
selinux --enforcing
firewall --enabled
services --disabled=sshd --enabled=NetworkManager,livesys,livesys-late
bootloader --location=none
shutdown
zerombr
clearpart --all --initlabel
part / --fstype=ext4 --size=16384
${graphical ? 'xconfig --startxonboot\n' : ''}
%packages
${installed.join('\n')}
%end

%post --erroronfail
${desktopSetup}
${appearanceSetup(desktop, appearance)}
${desktop === 'gnome' && appearance !== 'default' ? 'glib-compile-schemas --strict /usr/share/glib-2.0/schemas' : ''}
truncate -s 0 /etc/machine-id
%end`;
  return `cat > studio.ks <<'KICKSTART'
${kickstart}
KICKSTART

as_root /bin/bash -euo pipefail <<'BUILD_FEDORA'
livemedia-creator --make-iso --no-virt --nomacboot --iso-only --iso-name image.iso \\
  --ks "$PWD/studio.ks" --resultdir "$PWD/staging" --logfile "$PWD/livemedia.log" \\
  --releasever '${distro.release}' --project Fedora --volid '${name.toUpperCase()}' --isfinal
cat staging/image.iso > .iso-studio-result
rm -- staging/image.iso
BUILD_FEDORA`;
}

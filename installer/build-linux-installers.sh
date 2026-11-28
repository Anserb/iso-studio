#!/usr/bin/env bash
set -euo pipefail
umask 022
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
archive=${1:?Pass the verified node-v26.13.1-linux-x64.tar.xz archive}
expected=5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864
[[ $(sha256sum "$archive" | cut -d ' ' -f1) == "$expected" ]] || { echo 'Node runtime SHA-256 mismatch' >&2; exit 1; }
for tool in dpkg-deb rpmbuild xz tar python3; do command -v "$tool" >/dev/null || { echo "Missing packaging tool: $tool" >&2; exit 1; }; done
version=$(sed -n "s/^export const version = '\([^']*\)';.*/\1/p" "$root/updates.mjs")
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
stage=$(mktemp -d /var/tmp/linux-studio-package.XXXXXXXX)
cleanup() {
  if [[ -d $stage && $(dirname -- "$stage") == /var/tmp && $(basename -- "$stage") == linux-studio-package.* ]]; then rm -rf -- "$stage"; fi
}
trap cleanup EXIT
tree=$stage/tree
payload=$tree/opt/linux-studio
mkdir -p "$payload/app/Linux" "$payload/app/assets" "$payload/runtime" "$tree/usr/share/applications" "$tree/usr/share/icons/hicolor/scalable/apps" "$root/release"
find "$root" -maxdepth 1 -type f -name '*.mjs' -exec cp -- {} "$payload/app/" \;
cp -- "$root/index.html" "$root/style.css" "$root/README.md" "$root/LICENSE" "$payload/app/"
cp -- "$root/Linux/launch.mjs" "$root/Linux/install.mjs" "$root/Linux/setup.mjs" "$payload/app/Linux/"
cp -- "$root/assets/"*.svg "$payload/app/assets/"
tar -xJf "$archive" -C "$payload/runtime" --strip-components=1 node-v26.13.1-linux-x64/bin/node node-v26.13.1-linux-x64/LICENSE
"$payload/runtime/bin/node" --version
cat > "$payload/launch" <<'LAUNCH'
#!/bin/sh
set -eu
export LINUX_STUDIO_SYSTEM_SETUP=1
export LINUX_STUDIO_BUNDLED_RUNTIME=1
data=${XDG_DATA_HOME:-"$HOME/.local/share"}
case "$data" in /*) ;; *) data="$HOME/.local/share" ;; esac
if [ -f "$data/linux-studio/app/Linux/launch.mjs" ]; then
  exec /opt/linux-studio/runtime/bin/node "$data/linux-studio/app/Linux/launch.mjs" "$@"
fi
exec /opt/linux-studio/runtime/bin/node /opt/linux-studio/app/Linux/launch.mjs "$@"
LAUNCH
chmod 755 "$payload/launch"
cat > "$tree/usr/share/applications/uk.pvgaming.linuxstudio.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Linux Studio
Comment=Create custom Linux images and manage applications
Comment[el]=Δημιουργία Linux ISO και διαχείριση εφαρμογών
Exec=/opt/linux-studio/launch
Icon=linux-studio
Terminal=false
Categories=System;Utility;
DESKTOP
cp -- "$root/assets/linux-studio-logo.svg" "$tree/usr/share/icons/hicolor/scalable/apps/linux-studio.svg"
mkdir "$tree/DEBIAN"
cat > "$tree/DEBIAN/control" <<CONTROL
Package: linux-studio
Version: $version
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Linux Studio
Homepage: https://linuxstudio.pvgaming.uk
Depends: libc6 (>= 2.28), libstdc++6, libgcc-s1, xdg-utils
Description: Custom Linux ISO studio and Linux application manager
 Includes its Node.js runtime and graphical interface.
CONTROL
dpkg-deb --root-owner-group -Zxz -z6 --build "$tree" "$root/release/LinuxStudioSetup.deb"
rm -- "$tree/DEBIAN/control"
rmdir -- "$tree/DEBIAN"
mkdir -p "$stage/rpm/"{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cat > "$stage/rpm/SPECS/linux-studio.spec" <<SPEC
%global debug_package %{nil}
%global __os_install_post %{nil}
Name: linux-studio
Version: $version
Release: 1
Summary: Custom Linux ISO studio and application manager
License: MIT
URL: https://linuxstudio.pvgaming.uk
BuildArch: x86_64
AutoReqProv: no
Requires: glibc >= 2.28, libstdc++, libgcc, xdg-utils

%description
Graphical Linux ISO creation, profiles and Flatpak application management.
Includes the Node.js runtime.

%prep
%build
%install
mkdir -p %{buildroot}
cp -a "$tree/." %{buildroot}/

%files
/opt/linux-studio
/usr/share/applications/uk.pvgaming.linuxstudio.desktop
/usr/share/icons/hicolor/scalable/apps/linux-studio.svg
SPEC
rpmbuild -bb --define "_topdir $stage/rpm" --define '_build_id_links none' "$stage/rpm/SPECS/linux-studio.spec" > "$stage/rpm-build.log" 2>&1 || { cat "$stage/rpm-build.log"; exit 1; }
cp -- "$stage/rpm/RPMS/x86_64/linux-studio-$version-1.x86_64.rpm" "$root/release/LinuxStudioSetup.rpm"
mkdir -p "$stage/bundle/LinuxStudio"
cp -a -- "$payload/app" "$payload/runtime" "$stage/bundle/LinuxStudio/"
XZ_OPT='-6 -T2' tar -cJf "$stage/payload.tar.xz" -C "$stage/bundle" LinuxStudio
payload_hash=$(sha256sum "$stage/payload.tar.xz" | cut -d ' ' -f1)
python3 - "$stage/payload.tar.xz" "$root/release/LinuxStudioSetup.run" "$payload_hash" <<'BUILD_RUN'
import sys, os
payload, destination, digest = sys.argv[1:]
header = r'''#!/bin/sh
set -eu
[ "$(uname -m)" = x86_64 ] || { echo 'Linux Studio requires Linux x86-64.' >&2; exit 1; }
temp_root=$(realpath -e "${TMPDIR:-/tmp}")
stage=$(mktemp -d "$temp_root/linux-studio-setup.XXXXXXXX")
cleanup() {
  if [ -d "$stage" ] && [ "${stage%/*}" = "$temp_root" ]; then rm -rf -- "$stage"; fi
}
trap cleanup EXIT HUP INT TERM
line=$(awk '/^__LINUX_STUDIO_PAYLOAD__$/ {print NR+1;exit}' "$0")
tail -n +"$line" "$0" > "$stage/payload.tar.xz"
[ "$(sha256sum "$stage/payload.tar.xz" | cut -d ' ' -f1)" = '__SHA256__' ] || { echo 'Installer SHA-256 verification failed.' >&2; exit 1; }
tar -xJf "$stage/payload.tar.xz" -C "$stage"
export LINUX_STUDIO_BUNDLED_RUNTIME=1
"$stage/LinuxStudio/runtime/bin/node" "$stage/LinuxStudio/app/Linux/setup.mjs" "$@"
exit $?
__LINUX_STUDIO_PAYLOAD__
'''.replace('__SHA256__', digest)
with open(destination, 'wb') as output:
    output.write(header.encode())
    with open(payload, 'rb') as source:
        while block := source.read(1024 * 1024): output.write(block)
os.chmod(destination, 0o755)
BUILD_RUN
sha256sum "$root/release/LinuxStudioSetup.deb" "$root/release/LinuxStudioSetup.rpm" "$root/release/LinuxStudioSetup.run"

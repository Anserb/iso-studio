import { catalog, choicesFor, isoFilename } from './catalog.mjs';
import { buildArch, buildFedora, buildUbuntu } from './other-builders.mjs';

const select = (items, id) => items.find(item => item.id === id);
const builders = { debian: buildDebian, arch: buildArch, fedora: buildFedora, ubuntu: buildUbuntu };

export function makeRecipe(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Άκυρη διαμόρφωση.');
  }
  const { name, kernel, desktop, language, keyboard, firmware, installer, apps } = options;
  if (typeof name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(name)) {
    throw new Error('Χρησιμοποίησε 1–32 πεζά λατινικά γράμματα, αριθμούς ή παύλες. Ξεκίνα και τελείωσε με γράμμα ή αριθμό.');
  }
  const distro = select(catalog.distros, options.distro);
  if (!distro) throw new Error('Επίλεξε υποστηριζόμενη διανομή.');
  const choices = choicesFor(distro);
  if (!select(distro.kernels, kernel) || !select(choices.desktops, desktop)
    || !select(catalog.languages, language) || !select(choices.keyboards, keyboard)
    || typeof firmware !== 'boolean' || typeof installer !== 'boolean'
    || (firmware && !distro.firmware) || (installer && !distro.installer)
    || !Array.isArray(apps) || apps.length > choices.apps.length
    || apps.some(id => !select(choices.apps, id))) {
    throw new Error('Μία ή περισσότερες επιλογές δεν είναι διαθέσιμες για αυτή τη διανομή.');
  }
  const packages = [...new Set(apps.map(id => select(choices.apps, id).packages?.[distro.id] ?? id))];
  const filename = isoFilename(name, distro.id);
  const steps = builders[distro.id]({ name, kernel, desktop, language, keyboard, firmware, installer, packages, distro });
  const releaseCheck = distro.release ? ` || [[ "$host_release" != '${distro.release}' ]]` : '';
  const vmCheck = distro.needsVm ? `
if ! systemd-detect-virt --vm --quiet; then
  echo 'Run the Fedora build in a dedicated Fedora 44 virtual machine.' >&2
  exit 1
fi` : '';

  return { distro: distro.id, filename, script: `#!/usr/bin/env bash
set -euo pipefail
umask 077

. /etc/os-release
host_release="\${VERSION_CODENAME:-\${VERSION_ID:-}}"
if [[ "$ID" != '${distro.id}' || "$(uname -m)" != 'x86_64' ]]${releaseCheck}; then
  echo 'Run this script on ${distro.name} x86_64.' >&2
  exit 1
fi${vmCheck}
for tool in ${distro.commands.join(' ')}; do
  if ! command -v "$tool" >/dev/null; then
    echo "Required tool is missing: $tool" >&2
    exit 1
  fi
done
as_root() {
  if (( EUID == 0 )); then "$@"; else sudo -n -- "$@"; fi
}
output="$PWD/${filename}"
if [[ -e "$output" || -L "$output" ]]; then
  echo "Output already exists: $output" >&2
  exit 1
fi
work="$(mktemp -d -- "$PWD/.iso-studio.XXXXXXXX")"
cd -- "$work"
echo "Build directory: $work"
touch .iso-studio-result
# The workspace and final file are private. Files inside the image need normal system permissions.
umask 022

${steps}

# Publish only the completed image without replacing another file.
test -s .iso-studio-result
ln -T -- .iso-studio-result "$output"
rm -- .iso-studio-result
echo "ISO ready: $output"
` };
}

function buildDebian({ name, kernel, desktop, language, keyboard, firmware, installer, packages }) {
  const livePackages = new Set(['live-task-standard', `live-task-${desktop}`, 'locales', 'console-setup', ...packages]);
  const bootOptions = ['boot=live', 'components', `locales=${language}`, `keyboard-layouts=${keyboard}`, `hostname=${name}`];
  if (keyboard === 'us,gr') bootOptions.push('keyboard-options=grp:alt_shift_toggle');
  const config = {
    '--ignore-system-defaults': null,
    '--mode': 'debian',
    '--distribution': 'trixie',
    '--architecture': 'amd64',
    '--binary-image': 'iso-hybrid',
    '--bootloaders': 'syslinux grub-efi',
    '--linux-flavours': kernel.slice('linux-image-'.length),
    '--archive-areas': firmware ? 'main non-free-firmware' : 'main',
    '--firmware-chroot': String(firmware),
    '--firmware-binary': String(firmware),
    '--debian-installer': installer ? 'live' : 'none',
    '--bootappend-live': bootOptions.join(' '),
    '--image-name': name,
    '--iso-volume': name.toUpperCase(),
    '--memtest': 'none',
    '--checksums': 'sha256',
  };
  const args = Object.entries(config).map(([flag, value]) => (
    value === null ? flag : `${flag} '${value}'`
  )).join(' \\\n  ');
  return `lb config \\\n  ${args}
mkdir -p config/package-lists
cat > config/package-lists/studio.list.chroot <<'PACKAGES'
${[...livePackages].join('\n')}
PACKAGES

# Keep build and cleanup in the same privileged invocation.
as_root /bin/bash -e -c '
  cleanup() {
    result=$?
    lb clean --purge || exit 1
    exit "$result"
  }
  trap cleanup EXIT
  lb build
  test -s "$1"
  cat -- "$1" > .iso-studio-result
' build-iso '${name}-amd64.hybrid.iso'`;
}

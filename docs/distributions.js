const releaseList = document.querySelector('#iso-releases');
const status = document.querySelector('#release-status');

function renderRelease(release) {
  const { name, version, description, downloadUrl } = release;
  if (typeof name !== 'string' || typeof downloadUrl !== 'string' || !downloadUrl.startsWith('https://')) return;
  const card = document.createElement('article');
  card.className = 'distro-card';
  const title = document.createElement('h3');
  title.textContent = version ? name + ' · ' + version : name;
  const download = document.createElement('a');
  download.className = 'secondary';
  download.href = downloadUrl;
  download.textContent = 'Λήψη ISO ↓';
  card.append(title);
  if (description) {
    const detail = document.createElement('p');
    detail.textContent = description;
    card.append(detail);
  }
  card.append(download);
  releaseList.append(card);
}

async function loadReleases() {
  try {
    const response = await fetch('./iso-releases.json');
    if (!response.ok) throw new Error('Release list unavailable');
    const releases = await response.json();
    releases.forEach(renderRelease);
    status.hidden = releaseList.childElementCount > 0;
  } catch {
    status.textContent = 'Η λίστα εκδόσεων δεν φορτώθηκε. Δοκίμασε να ανανεώσεις τη σελίδα.';
  }
}

void loadReleases();

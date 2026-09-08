const cfg = window.WEDDING_APP_CONFIG;
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_SUPABASE');
const supabaseClient = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
const storageBucket = cfg.storageBucket || 'wedding-photos';
const $ = (s) => document.querySelector(s);

const weddingSplash = $('#weddingSplash');
if (weddingSplash) {
  const started = performance.now();
  const closeSplash = () => {
    const wait = Math.max(0, 2200 - (performance.now() - started));
    setTimeout(() => {
      weddingSplash.classList.add('is-leaving');
      setTimeout(() => weddingSplash.remove(), 650);
    }, wait);
  };
  if (document.readyState === 'complete') closeSplash();
  else {
    window.addEventListener('load', closeSplash, { once: true });
    setTimeout(closeSplash, 3500);
  }
}


const galleryGrid = $('#galleryGrid');
const emptyState = $('#emptyState');
const uploadStatus = $('#uploadStatus');
const guestNameInput = $('#guestName');
const photoInput = $('#photoInput');
const photoUploadButton = $('#photoUploadButton');

// Simple app-style navigation
function showView(name) {
  document.querySelectorAll('[data-view]').forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewTarget === name && button.classList.contains('nav-item'));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-view-target]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.viewTarget));
});

guestNameInput.value = localStorage.getItem('weddingGuestName') || '';

function updateUploadAvailability() {
  const hasName = guestNameInput.value.trim().length > 0;
  photoInput.disabled = !hasName;
  photoUploadButton.classList.toggle('is-disabled', !hasName);
  photoUploadButton.setAttribute('aria-disabled', hasName ? 'false' : 'true');
}

guestNameInput.addEventListener('input', () => {
  localStorage.setItem('weddingGuestName', guestNameInput.value.trim());
  updateUploadAvailability();
});

updateUploadAvailability();

$('#refreshBtn').addEventListener('click', loadPhotos);
photoInput.addEventListener('change', async (e) => {
  const guestName = guestNameInput.value.trim();
  if (!guestName) {
    e.target.value = '';
    updateUploadAvailability();
    uploadStatus.textContent = 'Please enter your name before uploading a photo.';
    guestNameInput.focus();
    return;
  }

  const files = [...e.target.files];
  if (!files.length) return;
  if (!configured) {
    uploadStatus.textContent = 'Photo storage is not connected yet. Follow SETUP.md to connect Supabase.';
    return;
  }

  localStorage.setItem('weddingGuestName', guestName);
  uploadStatus.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;

  let done = 0;
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabaseClient.storage
      .from(storageBucket)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) { console.error(uploadError); continue; }

    const { data: publicData } = supabaseClient.storage.from(storageBucket).getPublicUrl(path);
    const { error: rowError } = await supabaseClient
      .from('photos')
      .insert({ image_url: publicData.publicUrl, storage_path: path, guest_name: guestName });

    if (!rowError) done++;
    else console.error(rowError);
  }

  uploadStatus.textContent = `${done} photo${done === 1 ? '' : 's'} added to Tom & Mel's gallery ♡`;
  e.target.value = '';
  await loadPhotos();
});

let currentPhotos = [];
let activeLightboxPhoto = null;

async function loadPhotos() {
  if (!configured) {
    galleryGrid.innerHTML = '';
    emptyState.hidden = false;
    $('#photoCount').textContent = 'Gallery ready — connect Supabase to start accepting photos.';
    return;
  }

  const { data, error } = await supabaseClient.from('photos').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    $('#photoCount').textContent = 'Could not load photos.';
    return;
  }
  renderPhotos(data || []);
}

function renderPhotos(photos) {
  currentPhotos = photos;
  galleryGrid.innerHTML = '';
  const downloadAllBtn = $('#downloadAllBtn');
  if (downloadAllBtn) downloadAllBtn.disabled = photos.length === 0;
  emptyState.hidden = photos.length > 0;
  $('#photoCount').textContent = photos.length
    ? `${photos.length} shared photo${photos.length === 1 ? '' : 's'} so far.`
    : 'No photos yet — be the first to add one.';

  for (const photo of photos) {
    const card = document.createElement('article');
    card.className = 'photo-card';
    const date = new Date(photo.created_at).toLocaleString([], {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    card.innerHTML = `<img loading="lazy" src="${escapeHtml(photo.image_url)}" alt="Wedding photo shared by ${escapeHtml(photo.guest_name)}"><div class="photo-meta"><strong>Uploaded by ${escapeHtml(photo.guest_name)}</strong><span>${date}</span></div>`;
    card.addEventListener('click', () => openLightbox(photo, date));
    galleryGrid.appendChild(card);
  }
}

function openLightbox(photo, date) {
  activeLightboxPhoto = photo;
  $('#lightboxImage').src = photo.image_url;
  $('#lightboxName').textContent = `Uploaded by ${photo.guest_name}`;
  $('#lightboxDate').textContent = date;
  $('#lightbox').showModal();
}


function safeDownloadName(photo, index = 0) {
  const pathName = (photo.storage_path || '').split('/').pop() || `wedding-photo-${index + 1}.jpg`;
  const cleaned = pathName.replace(/^\d+-[0-9a-f-]+-/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `wedding-photo-${index + 1}.jpg`;
}

async function fetchPhotoBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Photo download failed (${response.status})`);
  return response.blob();
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

$('#downloadPhotoBtn').addEventListener('click', async () => {
  if (!activeLightboxPhoto) return;
  const btn = $('#downloadPhotoBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const blob = await fetchPhotoBlob(activeLightboxPhoto.image_url);
    triggerBlobDownload(blob, safeDownloadName(activeLightboxPhoto));
    btn.textContent = 'Downloaded ✓';
  } catch (error) {
    console.error(error);
    btn.textContent = 'Could not download';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = original;
    }, 1200);
  }
});

$('#downloadAllBtn').addEventListener('click', async () => {
  if (!currentPhotos.length) return;
  const btn = $('#downloadAllBtn');
  const original = btn.textContent;
  btn.disabled = true;

  try {
    if (!window.JSZip) throw new Error('ZIP library did not load');
    const zip = new JSZip();
    const usedNames = new Set();

    for (let i = 0; i < currentPhotos.length; i++) {
      btn.textContent = `Zipping ${i + 1}/${currentPhotos.length}…`;
      const photo = currentPhotos[i];
      const blob = await fetchPhotoBlob(photo.image_url);
      let name = safeDownloadName(photo, i);
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.');
        name = dot > 0
          ? `${name.slice(0, dot)}-${i + 1}${name.slice(dot)}`
          : `${name}-${i + 1}`;
      }
      usedNames.add(name);
      zip.file(name, blob);
    }

    btn.textContent = 'Creating ZIP…';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(zipBlob, 'Mel-and-Tom-Wedding-Photos.zip');
    btn.textContent = 'Downloaded ✓';
  } catch (error) {
    console.error(error);
    btn.textContent = 'Download failed';
  } finally {
    setTimeout(() => {
      btn.disabled = currentPhotos.length === 0;
      btn.textContent = original;
    }, 1500);
  }
});

$('#closeLightbox').addEventListener('click', () => $('#lightbox').close());
$('#lightbox').addEventListener('click', (e) => {
  if (e.target === $('#lightbox')) $('#lightbox').close();
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

// Install / Save to mobile
let deferredInstallPrompt = null;
const installBtn = $('#installBtn');
const installHelp = $('#installHelp');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

installBtn.addEventListener('click', async () => {
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    $('#installHelpText').textContent = 'This wedding app is already saved to your Home Screen ♡';
    installHelp.showModal();
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#installHelpText').innerHTML = isIOS
    ? 'On iPhone, open this page in <strong>Safari</strong>, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.'
    : 'Open your browser menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.';
  installHelp.showModal();
});

$('#closeInstallHelp').addEventListener('click', () => installHelp.close());
$('#installHelpDone').addEventListener('click', () => installHelp.close());
installHelp.addEventListener('click', (e) => {
  if (e.target === installHelp) installHelp.close();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}

loadPhotos();

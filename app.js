const cfg = window.WEDDING_APP_CONFIG;
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_SUPABASE');
const supabaseClient = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const $ = (s) => document.querySelector(s);
const galleryGrid = $('#galleryGrid');
const emptyState = $('#emptyState');
const uploadStatus = $('#uploadStatus');
const guestNameInput = $('#guestName');

$('#coupleName').textContent = cfg.coupleName;
$('#weddingDate').textContent = cfg.weddingDateText;

guestNameInput.value = localStorage.getItem('weddingGuestName') || '';
guestNameInput.addEventListener('input', () => {
  localStorage.setItem('weddingGuestName', guestNameInput.value.trim());
});

$('#refreshBtn').addEventListener('click', loadPhotos);
$('#photoInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  if (!configured) {
    uploadStatus.textContent = 'Photo storage is not connected yet. Follow SETUP.md to connect Supabase.';
    return;
  }

  const guestName = guestNameInput.value.trim() || 'Guest';
  localStorage.setItem('weddingGuestName', guestNameInput.value.trim());
  uploadStatus.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;

  let done = 0;
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('wedding-photos')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      console.error(uploadError);
      continue;
    }

    const { data: publicData } = supabaseClient.storage.from('wedding-photos').getPublicUrl(path);
    const { error: rowError } = await supabaseClient
      .from('photos')
      .insert({ image_url: publicData.publicUrl, storage_path: path, guest_name: guestName });

    if (!rowError) done++;
    else console.error(rowError);
  }

  uploadStatus.textContent = `${done} photo${done === 1 ? '' : 's'} added to the wedding gallery ♥`;
  e.target.value = '';
  await loadPhotos();
});

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
  galleryGrid.innerHTML = '';
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
    card.innerHTML = `<img loading="lazy" src="${escapeHtml(photo.image_url)}" alt="Wedding photo shared by ${escapeHtml(photo.guest_name)}"><div class="photo-meta"><strong>${escapeHtml(photo.guest_name)}</strong><span>${date}</span></div>`;
    card.addEventListener('click', () => openLightbox(photo, date));
    galleryGrid.appendChild(card);
  }
}

function openLightbox(photo, date) {
  $('#lightboxImage').src = photo.image_url;
  $('#lightboxName').textContent = photo.guest_name;
  $('#lightboxDate').textContent = date;
  $('#lightbox').showModal();
}

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
    $('#installHelpText').textContent = 'This wedding app is already saved to your Home Screen ♥';
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
    ? 'On iPhone: tap the <strong>Share</strong> button in Safari, then choose <strong>Add to Home Screen</strong>.'
    : 'Open your browser menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.';
  installHelp.showModal();
});

$('#closeInstallHelp').addEventListener('click', () => installHelp.close());
$('#installHelpDone').addEventListener('click', () => installHelp.close());
installHelp.addEventListener('click', (e) => {
  if (e.target === installHelp) installHelp.close();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  });
}

loadPhotos();

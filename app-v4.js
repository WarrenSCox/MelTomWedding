const cfg = window.WEDDING_APP_CONFIG;
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_SUPABASE');
const supabaseClient = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
const storageBucket = cfg.storageBucket || 'wedding-photos';
const $ = (s) => document.querySelector(s);

const weddingSplash = $('#weddingSplash');
const launchedStandalone =
  document.documentElement.classList.contains('app-launching') ||
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (weddingSplash && launchedStandalone) {
  // v7.45: one controlled timeline. Never animate the two title lines independently.
  const names = weddingSplash.querySelector('.wedding-splash__title span');
  const wedding = weddingSplash.querySelector('.wedding-splash__title em');
  const title = weddingSplash.querySelector('.wedding-splash__title');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  let ready = document.readyState === 'complete';
  const started = performance.now();

  const reveal = (element) => {
    element.style.setProperty('opacity', '1', 'important');
    element.style.setProperty('transform', 'translateY(0)', 'important');
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    weddingSplash.classList.add('is-leaving');
    document.documentElement.classList.add('app-revealing');
    setTimeout(() => {
      weddingSplash.remove();
      document.documentElement.classList.remove('app-launching', 'app-revealing');
    }, 650);
  };

  if (title && names && wedding) {
    title.style.setProperty('opacity', '1', 'important');
    title.style.setProperty('transform', 'none', 'important');
    title.style.setProperty('animation', 'none', 'important');
    [names, wedding].forEach(el => {
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('transform', 'translateY(8px)', 'important');
      el.style.setProperty('animation', 'none', 'important');
      el.style.setProperty('transition', reduced ? 'none' : 'opacity .4s ease, transform .4s ease', 'important');
    });

    const showNames = () => {
      reveal(names);
      // Wedding cannot appear until the names have completed their reveal.
      setTimeout(() => {
        reveal(wedding);
        setTimeout(() => {
          const closeWhenReady = () => {
            if (ready || performance.now() - started > 6500) finish();
            else setTimeout(closeWhenReady, 100);
          };
          closeWhenReady();
        }, reduced ? 100 : 650);
      }, reduced ? 0 : 520);
    };
    const startTitle = () => setTimeout(showNames, reduced ? 0 : 1050);
    if (document.fonts && document.fonts.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise(resolve => setTimeout(resolve, 1800))
      ]).then(startTitle, startTitle);
    } else startTitle();
  } else {
    setTimeout(finish, 2300);
  }

  if (!ready) window.addEventListener('load', () => { ready = true; }, { once: true });
  setTimeout(finish, 8000); // Last-resort escape if loading stalls.
} else if (weddingSplash) {
  weddingSplash.remove();
  document.documentElement.classList.remove('app-launching', 'app-revealing');
}

const galleryGrid = $('#galleryGrid');
const emptyState = $('#emptyState');
const uploadStatus = $('#uploadStatus');
const guestNameInput = $('#guestName');
const photoInput = $('#photoInput');
const photoUploadButton = $('#photoUploadButton');
let uploadInProgress = false;

// Simple app-style navigation
function showView(name) {
  if (name === 'surprise') {
    void openRandomPhoto();
    return;
  }
  closeSurprisePolaroid();
  document.querySelectorAll('[data-view]').forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewTarget === name && button.classList.contains('nav-item'));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'favourites') void loadFavourites();
}

document.querySelectorAll('[data-view-target]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.viewTarget));
});

function applyInstalledAppNavigation() {
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const saveNav = document.querySelector('[data-view-target="save"]');
  if (saveNav) saveNav.hidden = installed;

  document.documentElement.classList.toggle('installed-app', installed);


  if (installed && !$('#view-save').hidden) {
    showView('gallery');
  }
}

applyInstalledAppNavigation();
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', applyInstalledAppNavigation);


// v7.48: edge-swipe page navigation.
// Swipe inward from the left/right edge to change page.
// Surprise is intentionally excluded because it opens a transient Polaroid, not a page.
(() => {
  const EDGE_ZONE = 34;
  const MIN_SWIPE = 54;
  const MAX_VERTICAL_DRIFT = 70;
  let gesture = null;

  function swipeViews() {
    return ['gallery', 'favourites', 'info', 'save'].filter(name => {
      const view = document.querySelector(`[data-view="${name}"]`);
      const nav = document.querySelector(`.bottom-nav [data-view-target="${name}"]`);
      return view && nav && !nav.hidden && getComputedStyle(nav).display !== 'none';
    });
  }

  function activeSwipeView() {
    return swipeViews().find(name => {
      const view = document.querySelector(`[data-view="${name}"]`);
      return view && !view.hidden;
    }) || 'gallery';
  }

  function pageHasOpenOverlay() {
    return Boolean(
      document.querySelector('dialog[open]') ||
      document.querySelector('.surprise-polaroid[open]')
    );
  }

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || pageHasOpenOverlay()) {
      gesture = null;
      return;
    }

    const touch = event.touches[0];
    const width = window.innerWidth;
    const fromLeft = touch.clientX <= EDGE_ZONE;
    const fromRight = touch.clientX >= width - EDGE_ZONE;

    if (!fromLeft && !fromRight) {
      gesture = null;
      return;
    }

    gesture = {
      side: fromLeft ? 'left' : 'right',
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY
    };
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!gesture || pageHasOpenOverlay()) {
      gesture = null;
      return;
    }

    const { side, startX, startY, lastX, lastY } = gesture;
    gesture = null;

    const dx = lastX - startX;
    const dy = lastY - startY;
    if (Math.abs(dy) > MAX_VERTICAL_DRIFT) return;

    const isValid =
      (side === 'left' && dx >= MIN_SWIPE) ||
      (side === 'right' && dx <= -MIN_SWIPE);
    if (!isValid) return;

    const views = swipeViews();
    const current = activeSwipeView();
    const index = views.indexOf(current);
    if (index < 0) return;

    // Left-edge inward swipe = previous page.
    // Right-edge inward swipe = next page.
    const targetIndex = side === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= views.length) return;

    showView(views[targetIndex]);
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    gesture = null;
  }, { passive: true });
})();


guestNameInput.value = localStorage.getItem('weddingGuestName') || '';

function updateUploadAvailability() {
  const hasName = guestNameInput.value.trim().length > 0;
  photoInput.disabled = !hasName || uploadInProgress;
  photoUploadButton.classList.toggle('is-disabled', !hasName || uploadInProgress);
  photoUploadButton.setAttribute('aria-disabled', hasName && !uploadInProgress ? 'false' : 'true');
}

guestNameInput.addEventListener('input', () => {
  localStorage.setItem('weddingGuestName', guestNameInput.value.trim());
  updateUploadAvailability();
});

updateUploadAvailability();

$('#refreshBtn').addEventListener('click', () => loadPhotos(true));

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(700 * attempt);
    }
  }
  throw lastError;
}

async function preparePhotoForUpload(file) {
  const supported = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supported.includes(file.type)) return file;

  // Leave already-manageable photos untouched.
  if (file.size <= 4 * 1024 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 3000;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        result => result ? resolve(result) : reject(new Error('Could not prepare image')),
        'image/jpeg',
        0.88
      );
    });

    // Only use the compressed version if it is actually smaller.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'wedding-photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified
    });
  } catch (error) {
    console.warn('Photo optimisation skipped:', error);
    return file;
  }
}


const uploadConfirmDialog = $('#uploadConfirmDialog');
const confirmUploadBtn = $('#confirmUploadBtn');
const cancelUploadBtn = $('#cancelUploadBtn');
let pendingUpload = null;

function cancelPendingUpload() {
  if (uploadInProgress) return;
  pendingUpload = null;
  photoInput.value = '';
  uploadConfirmDialog.close();
}

photoInput.addEventListener('change', (e) => {
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
    e.target.value = '';
    return;
  }

  // Capture this exact selection before opening the confirmation.
  pendingUpload = { files, guestName };
  $('#uploadConfirmTitle').textContent =
    `Ready to upload ${files.length} photo${files.length === 1 ? '' : 's'}?`;
  uploadConfirmDialog.showModal();
});

cancelUploadBtn.addEventListener('click', cancelPendingUpload);
uploadConfirmDialog.addEventListener('cancel', (event) => {
  if (uploadInProgress) event.preventDefault();
  else {
    pendingUpload = null;
    photoInput.value = '';
  }
});
uploadConfirmDialog.addEventListener('close', () => {
  if (!uploadInProgress) {
    pendingUpload = null;
    photoInput.value = '';
  }
});

confirmUploadBtn.addEventListener('click', async () => {
  if (uploadInProgress || !pendingUpload) return;
  const { files, guestName } = pendingUpload;
  pendingUpload = null;
  uploadInProgress = true;
  uploadConfirmDialog.close();
  photoInput.disabled = true;
  photoUploadButton.classList.add('is-disabled');
  photoUploadButton.setAttribute('aria-disabled', 'true');

  try {
  localStorage.setItem('weddingGuestName', guestName);
  uploadStatus.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;

  let done = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const originalFile = files[i];
    uploadStatus.textContent = `Preparing photo ${i + 1} of ${files.length}…`;

    try {
      const file = await preparePhotoForUpload(originalFile);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      uploadStatus.textContent = `Uploading photo ${i + 1} of ${files.length}…`;

      await withRetry(async () => {
        const { error } = await supabaseClient.storage
          .from(storageBucket)
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
      }, 3);

      const { data: publicData } = supabaseClient.storage.from(storageBucket).getPublicUrl(path);

      await withRetry(async () => {
        const { error } = await supabaseClient
          .from('photos')
          .insert({
            image_url: publicData.publicUrl,
            storage_path: path,
            guest_name: guestName
          });
        if (error) throw error;
      }, 3);

      done++;
    } catch (error) {
      failed++;
      console.error('Photo upload failed after retries:', error);
    }
  }

  uploadStatus.textContent = failed
    ? `${done} uploaded, ${failed} failed. Please try the failed photo${failed === 1 ? '' : 's'} again.`
    : `${done} photo${done === 1 ? '' : 's'} added to Tom & Mel's gallery ♡`;
  await loadPhotos();
  } finally {
    uploadInProgress = false;
    photoInput.value = '';
    updateUploadAvailability();
  }
});

const PAGE_SIZE = 40;
let currentPhotos = [];
let totalPhotoCount = 0;
let activeLightboxPhoto = null;
let albumPhotosCache = null;

const FAVOURITES_KEY = 'weddingFavouritePhotoIds';
let favouriteIds = new Set();
let favouritePhotos = [];
const favouriteSelectedPhotos = new Map();
let favouriteSelectionMode = false;
let favouriteSelectionDownloading = false;

try {
  const savedFavouriteIds = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
  if (Array.isArray(savedFavouriteIds)) {
    favouriteIds = new Set(savedFavouriteIds.map(String));
  }
} catch (error) {
  console.warn('Could not read favourites:', error);
}

function formatPhotoDate(value) {
  return new Date(value).toLocaleString([], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function saveFavouriteIds() {
  localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...favouriteIds]));
}

function isFavourite(photo) {
  return favouriteIds.has(String(photo.id));
}

const HEART_SVG = `
  <svg class="favourite-heart-svg" viewBox="0 0 32 29" aria-hidden="true" focusable="false">
    <path d="M16 27.2 3.7 15.4C-2.4 9.6 1.9.7 9.4.7c3.2 0 5.4 1.8 6.6 3.5C17.2 2.5 19.4.7 22.6.7c7.5 0 11.8 8.9 5.7 14.7L16 27.2Z"/>
  </svg>`;

function syncFavouriteButtons() {
  document.querySelectorAll('[data-favourite-id]').forEach(button => {
    const active = favouriteIds.has(button.dataset.favouriteId);
    button.classList.toggle('is-favourite', active);
    button.innerHTML = HEART_SVG;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Remove from favourites' : 'Add to favourites');
  });

  const lightboxFavouriteBtn = $('#lightboxFavouriteBtn');
  if (lightboxFavouriteBtn && activeLightboxPhoto) {
    const active = isFavourite(activeLightboxPhoto);
    lightboxFavouriteBtn.classList.toggle('is-favourite', active);
    lightboxFavouriteBtn.innerHTML = HEART_SVG;
    lightboxFavouriteBtn.setAttribute('aria-pressed', String(active));
    lightboxFavouriteBtn.setAttribute('aria-label', active ? 'Remove from favourites' : 'Add to favourites');
  }

  if (typeof syncSurprisePolaroidFavourite === 'function') {
    syncSurprisePolaroidFavourite();
  }
}
function toggleFavourite(photo) {
  const key = String(photo.id);
  if (favouriteIds.has(key)) favouriteIds.delete(key);
  else favouriteIds.add(key);
  saveFavouriteIds();
  syncFavouriteButtons();

  if (!$('#view-favourites').hidden) void loadFavourites();
}


async function loadPhotos(reset = true) {
  if (!configured) {
    galleryGrid.innerHTML = '';
    emptyState.hidden = false;
    $('#photoCount').textContent = '0';
    $('#loadMoreBtn').hidden = true;
    return;
  }

  const from = reset ? 0 : currentPhotos.length;
  const to = from + PAGE_SIZE - 1;
  if (reset) albumPhotosCache = null;

  const { data, error, count } = await supabaseClient
    .from('photos')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error(error);
    if (reset) $('#photoCount').textContent = String(totalPhotoCount);
    return;
  }

  totalPhotoCount = count ?? totalPhotoCount;
  for (const photo of data || []) {
    if (selectedPhotos.has(photoKey(photo))) selectedPhotos.set(photoKey(photo), photo);
  }

  if (reset) {
    currentPhotos = [];
    galleryGrid.innerHTML = '';
  }

  const newPhotos = data || [];
  currentPhotos.push(...newPhotos);
  renderPhotoCards(newPhotos);

  const downloadAllBtn = $('#downloadAllBtn');
  if (downloadAllBtn) downloadAllBtn.disabled = totalPhotoCount === 0;

  emptyState.hidden = totalPhotoCount > 0;
  $('#photoCount').textContent = String(totalPhotoCount);
  $('#photoCount').setAttribute(
    'aria-label',
    `${totalPhotoCount} photo${totalPhotoCount === 1 ? '' : 's'} shared`
  );

  const loadMoreBtn = $('#loadMoreBtn');
  loadMoreBtn.hidden = currentPhotos.length >= totalPhotoCount;
  loadMoreBtn.disabled = false;
  loadMoreBtn.textContent = 'Load more memories';
  syncFavouriteButtons();
}

// v7.21: persistent photo selection across gallery pages and refreshes.
const selectedPhotos = new Map();
let selectionMode = false;
let selectionDownloading = false;
const selectionToolbar = $('#selectionToolbar');
const selectionCount = $('#selectionCount');
const downloadSelectedBtn = $('#downloadSelectedBtn');

function photoKey(photo) { return String(photo.id); }

function updateSelectionUI() {
  const count = selectedPhotos.size;
  selectionToolbar.hidden = !selectionMode;
  selectionCount.textContent = `${count} selected`;
  downloadSelectedBtn.textContent = `Download selected (${count}) ↓`;
  downloadSelectedBtn.disabled = !count || selectionDownloading;
  galleryGrid.classList.toggle('is-selecting', selectionMode);
  galleryGrid.querySelectorAll('.photo-card[data-photo-id]').forEach(card => {
    const selected = selectedPhotos.has(card.dataset.photoId);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-label', `${selected ? 'Deselect' : 'Select'} wedding photo`);
    const mark = card.querySelector('.photo-selection-mark');
    if (mark) mark.textContent = selected ? '✓' : '';
  });
}

function togglePhotoSelection(photo) {
  const key = photoKey(photo);
  if (selectedPhotos.has(key)) selectedPhotos.delete(key);
  else selectedPhotos.set(key, photo);
  selectionMode = true;
  updateSelectionUI();
}

function cancelSelection() {
  selectedPhotos.clear();
  selectionMode = false;
  updateSelectionUI();
}

$('#cancelSelectionBtn').addEventListener('click', cancelSelection);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('#lightbox').open) return;
  if (selectionMode) cancelSelection();
  if (favouriteSelectionMode) cancelFavouriteSelection();
});

function createFavouriteButton(photo) {
  const heart = document.createElement('button');
  heart.type = 'button';
  heart.className = 'photo-favourite-btn';
  heart.dataset.favouriteId = String(photo.id);
  heart.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavourite(photo);
  });
  return heart;
}

function attachLongPressSelection(card, photo, onToggle, isSelecting) {
  let holdTimer = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;

  const clearHold = () => {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  };

  card.addEventListener('pointerdown', event => {
    if (event.target.closest('.photo-favourite-btn')) return;
    if (isSelecting() || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    if (event.button !== 0) return;

    startX = event.clientX;
    startY = event.clientY;
    clearHold();

    holdTimer = setTimeout(() => {
      holdTimer = null;
      suppressClick = true;
      onToggle(photo);
      navigator.vibrate?.(25);
    }, 550);
  });

  card.addEventListener('pointermove', event => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) clearHold();
  });
  card.addEventListener('pointerup', clearHold);
  card.addEventListener('pointercancel', clearHold);
  card.addEventListener('contextmenu', event => {
    if (event.target.closest('.photo-favourite-btn')) return;
    if (event.pointerType === 'mouse' && !isSelecting()) return;
    event.preventDefault();
    clearHold();
    if (!isSelecting()) {
      suppressClick = true;
      onToggle(photo);
    }
  });

  card.addEventListener('click', event => {
    if (event.target.closest('.photo-favourite-btn')) return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (isSelecting()) onToggle(photo);
    else openLightbox(photo);
  });
}

function buildPhotoCard(photo, options = {}) {
  const card = document.createElement('article');
  card.className = 'photo-card';
  card.dataset.photoId = photoKey(photo);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const mark = document.createElement('span');
  mark.className = 'photo-selection-mark';
  mark.setAttribute('aria-hidden', 'true');

  const heart = createFavouriteButton(photo);

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.fetchPriority = 'low';
  img.draggable = false;
  img.src = photo.image_url;
  img.alt = `Wedding photo shared by ${photo.guest_name}`;

  const meta = document.createElement('div');
  meta.className = 'photo-meta';
  const name = document.createElement('strong');
  name.textContent = `Uploaded by ${photo.guest_name}`;
  meta.append(name, heart);

  card.append(mark, img, meta);

  const toggle = options.toggleSelection || togglePhotoSelection;
  const selecting = options.isSelecting || (() => selectionMode);
  attachLongPressSelection(card, photo, toggle, selecting);

  card.addEventListener('keydown', event => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selecting()) toggle(photo);
      else openLightbox(photo);
    }
  });

  return card;
}

function renderPhotoCards(photos) {
  for (const photo of photos) {
    galleryGrid.appendChild(buildPhotoCard(photo));
  }
  updateSelectionUI();
  syncFavouriteButtons();
}

$('#loadMoreBtn').addEventListener('click', async () => {
  const btn = $('#loadMoreBtn');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  await loadPhotos(false);
});

async function fetchAllPhotoRecords() {
  const all = [];
  const batchSize = 200;

  for (let from = 0; ; from += batchSize) {
    const { data, error } = await supabaseClient
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < batchSize) break;
  }

  return all;
}

async function getAlbumPhotos(force = false) {
  if (!force && albumPhotosCache) return albumPhotosCache;
  albumPhotosCache = await fetchAllPhotoRecords();
  return albumPhotosCache;
}


function positionLightboxTopControls() {
  const image = $('#lightboxImage');
  const heart = $('#lightboxFavouriteBtn');
  const dialog = $('#lightbox');
  if (!image || !heart || !dialog?.open) return;

  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const inset = 12;
  const heartSize = heart.getBoundingClientRect().width || 44;

  const top = Math.max(8, rect.top + inset);
  const left = Math.max(8, Math.min(window.innerWidth - heartSize - 8, rect.right - heartSize - inset));

  heart.style.setProperty('top', `${top}px`, 'important');
  heart.style.setProperty('left', `${left}px`, 'important');
  heart.style.setProperty('right', 'auto', 'important');
}
function setLightboxPhoto(photo) {
  activeLightboxPhoto = photo;
  const image = $('#lightboxImage');
  image.src = photo.image_url;
  $('#lightboxName').textContent = `Uploaded by ${photo.guest_name}`;
  $('#lightboxDate').textContent = formatPhotoDate(photo.created_at);
  syncFavouriteButtons();

  if (image.complete && image.naturalWidth) {
    requestAnimationFrame(positionLightboxTopControls);
  } else {
    image.addEventListener('load', () => requestAnimationFrame(positionLightboxTopControls), { once: true });
  }
}

function openLightbox(photo) {
  setLightboxPhoto(photo);
  $('#lightbox').showModal();
  requestAnimationFrame(() => {
    positionLightboxTopControls();
    requestAnimationFrame(positionLightboxTopControls);
  });
  void getAlbumPhotos().catch(console.error);
}

async function navigateLightbox(direction) {
  if (!activeLightboxPhoto) return;

  try {
    const photos = await getAlbumPhotos();
    if (!photos.length) return;

    let index = photos.findIndex(photo => String(photo.id) === String(activeLightboxPhoto.id));
    if (index < 0) index = 0;

    const nextIndex = (index + direction + photos.length) % photos.length;
    setLightboxPhoto(photos[nextIndex]);
  } catch (error) {
    console.error('Could not navigate photos:', error);
  }
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

async function downloadPhotoZip(photos, btn, filename) {
  const original = btn.innerHTML;
  btn.disabled = true;
  try {
    if (!window.JSZip) throw new Error('ZIP library did not load');
    const zip = new JSZip();
    const usedNames = new Set();
    for (let i = 0; i < photos.length; i++) {
      btn.textContent = `Zipping ${i + 1}/${photos.length}…`;
      const photo = photos[i];
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
    triggerBlobDownload(zipBlob, filename);
    btn.textContent = 'Downloaded ✓';
    return true;
  } catch (error) {
    console.error(error);
    btn.textContent = 'Download failed';
    return false;
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = original;
      if (btn === downloadSelectedBtn) updateSelectionUI();
      if (btn === $('#downloadAllBtn')) btn.disabled = totalPhotoCount === 0;
    }, 1500);
  }
}

$('#downloadAllBtn').addEventListener('click', async () => {
  if (!totalPhotoCount) return;
  const btn = $('#downloadAllBtn');
  btn.disabled = true;
  btn.textContent = 'Preparing album…';
  try {
    const allPhotos = await getAlbumPhotos(true);
    await downloadPhotoZip(allPhotos, btn, 'Mel-and-Tom-Wedding-Photos.zip');
  } catch (error) {
    console.error(error);
    btn.textContent = 'Download failed';
    setTimeout(() => {
      btn.disabled = totalPhotoCount === 0;
      btn.textContent = 'Download all (' + totalPhotoCount + ') ↓';
    }, 1500);
  }
});

downloadSelectedBtn.addEventListener('click', async () => {
  if (!selectedPhotos.size || selectionDownloading) return;
  selectionDownloading = true;
  const photos = [...selectedPhotos.values()];
  const success = await downloadPhotoZip(photos, downloadSelectedBtn, 'Mel-and-Tom-Selected-Photos.zip');
  selectionDownloading = false;
  if (success) cancelSelection();
  else updateSelectionUI();
});


const favouritesGrid = $('#favouritesGrid');
const favouritesEmptyState = $('#favouritesEmptyState');
const favouriteSelectionToolbar = $('#favouriteSelectionToolbar');
const favouriteSelectionCount = $('#favouriteSelectionCount');
const downloadSelectedFavouritesBtn = $('#downloadSelectedFavouritesBtn');
const downloadAllFavouritesBtn = $('#downloadAllFavouritesBtn');

function updateFavouriteSelectionUI() {
  const count = favouriteSelectedPhotos.size;
  favouriteSelectionToolbar.hidden = !favouriteSelectionMode;
  favouriteSelectionCount.textContent = `${count} selected`;
  downloadSelectedFavouritesBtn.textContent = `Download selected (${count}) ↓`;
  downloadSelectedFavouritesBtn.disabled = !count || favouriteSelectionDownloading;
  favouritesGrid.classList.toggle('is-selecting', favouriteSelectionMode);

  favouritesGrid.querySelectorAll('.photo-card[data-photo-id]').forEach(card => {
    const selected = favouriteSelectedPhotos.has(card.dataset.photoId);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    const mark = card.querySelector('.photo-selection-mark');
    if (mark) mark.textContent = selected ? '✓' : '';
  });
}

function toggleFavouriteSelection(photo) {
  const key = photoKey(photo);
  if (favouriteSelectedPhotos.has(key)) favouriteSelectedPhotos.delete(key);
  else favouriteSelectedPhotos.set(key, photo);
  favouriteSelectionMode = true;
  updateFavouriteSelectionUI();
}

function cancelFavouriteSelection() {
  favouriteSelectedPhotos.clear();
  favouriteSelectionMode = false;
  updateFavouriteSelectionUI();
}

async function loadFavourites() {
  favouritesGrid.innerHTML = '';

  if (!configured || favouriteIds.size === 0) {
    favouritePhotos = [];
    favouritesEmptyState.hidden = false;
    $('#favouriteCount').textContent = '0';
    downloadAllFavouritesBtn.disabled = true;
    cancelFavouriteSelection();
    return;
  }

  const ids = [...favouriteIds];
  const { data, error } = await supabaseClient
    .from('photos')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    favouritesEmptyState.hidden = false;
    return;
  }

  favouritePhotos = data || [];

  // Prune favourites whose photo has been deleted from the shared album.
  const existingIds = new Set(favouritePhotos.map(photo => String(photo.id)));
  let changed = false;
  for (const id of [...favouriteIds]) {
    if (!existingIds.has(id)) {
      favouriteIds.delete(id);
      favouriteSelectedPhotos.delete(id);
      changed = true;
    }
  }
  if (changed) saveFavouriteIds();

  favouritesEmptyState.hidden = favouritePhotos.length > 0;
  $('#favouriteCount').textContent = String(favouritePhotos.length);
  downloadAllFavouritesBtn.disabled = favouritePhotos.length === 0;

  for (const photo of favouritePhotos) {
    favouritesGrid.appendChild(buildPhotoCard(photo, {
      toggleSelection: toggleFavouriteSelection,
      isSelecting: () => favouriteSelectionMode
    }));
  }

  updateFavouriteSelectionUI();
  syncFavouriteButtons();
}

$('#cancelFavouriteSelectionBtn').addEventListener('click', cancelFavouriteSelection);

downloadSelectedFavouritesBtn.addEventListener('click', async () => {
  if (!favouriteSelectedPhotos.size || favouriteSelectionDownloading) return;
  favouriteSelectionDownloading = true;
  const photos = [...favouriteSelectedPhotos.values()];
  const success = await downloadPhotoZip(
    photos,
    downloadSelectedFavouritesBtn,
    'Mel-and-Tom-Favourite-Selected-Photos.zip'
  );
  favouriteSelectionDownloading = false;
  if (success) cancelFavouriteSelection();
  else updateFavouriteSelectionUI();
});

downloadAllFavouritesBtn.addEventListener('click', async () => {
  if (!favouritePhotos.length) return;
  await downloadPhotoZip(
    favouritePhotos,
    downloadAllFavouritesBtn,
    'Mel-and-Tom-My-Favourites.zip'
  );
});

$('#lightboxFavouriteBtn').addEventListener('click', () => {
  if (activeLightboxPhoto) toggleFavourite(activeLightboxPhoto);
});

$('#previousPhotoBtn').addEventListener('click', () => void navigateLightbox(-1));
$('#nextPhotoBtn').addEventListener('click', () => void navigateLightbox(1));

let lightboxSwipeStartX = null;
$('#lightbox').addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' && !event.target.closest('button')) {
    lightboxSwipeStartX = event.clientX;
  }
});
$('#lightbox').addEventListener('pointerup', event => {
  if (lightboxSwipeStartX === null) return;
  const delta = event.clientX - lightboxSwipeStartX;
  lightboxSwipeStartX = null;
  if (Math.abs(delta) < 50) return;
  void navigateLightbox(delta < 0 ? 1 : -1);
});
$('#lightbox').addEventListener('pointercancel', () => {
  lightboxSwipeStartX = null;
});

document.addEventListener('keydown', event => {
  if (!$('#lightbox').open) return;
  if (event.key === 'ArrowRight') void navigateLightbox(1);
  if (event.key === 'ArrowLeft') void navigateLightbox(-1);
});



let surprisePolaroidPhoto = null;
let surprisePolaroidBusy = false;
let surprisePolaroidSequence = 0;
let surprisePolaroidTimer = null;
let surprisePolaroidLastId = null;

function closeSurprisePolaroid() {
  surprisePolaroidSequence++;
  clearTimeout(surprisePolaroidTimer);
  const dialog = $('#surprisePolaroid');
  if (dialog.open) dialog.close();
  dialog.classList.remove('is-revealed');
  const layer = dialog.querySelector('.surprise-polaroid__confetti');
  layer.replaceChildren();
  surprisePolaroidBusy = false;
}

function syncSurprisePolaroidFavourite() {
  const button = $('#surprisePolaroidFavourite');
  if (!button || !surprisePolaroidPhoto) return;
  const active = isFavourite(surprisePolaroidPhoto);
  button.classList.toggle('is-favourite', active);
  button.innerHTML = HEART_SVG;
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Remove from favourites' : 'Add to favourites');
}

function playSurprisePolaroidConfetti() {
  const layer = $('#surprisePolaroid').querySelector('.surprise-polaroid__confetti');
  layer.replaceChildren();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 48; i++) {
    const piece = document.createElement('span');
    piece.className = 'surprise-polaroid__piece';
    const side = i % 2 === 0 ? 0 : 100;
    piece.style.setProperty('--start-x', `${side}%`);
    piece.style.setProperty('--start-y', `${68 + Math.random() * 20}%`);
    piece.style.setProperty('--dx', `${(side === 0 ? 1 : -1) * (35 + Math.random() * 260)}px`);
    piece.style.setProperty('--dy', `${-110 - Math.random() * 300}px`);
    piece.style.setProperty('--fall', `${80 + Math.random() * 180}px`);
    piece.style.setProperty('--turn', `${Math.random() * 900 - 450}deg`);
    piece.style.setProperty('--delay', `${Math.random() * .18}s`);
    piece.style.setProperty('--duration', `${1.8 + Math.random() * 1.1}s`);
    fragment.appendChild(piece);
  }
  layer.appendChild(fragment);
  layer.classList.remove('is-playing');
  void layer.offsetWidth;
  layer.classList.add('is-playing');
  surprisePolaroidTimer = setTimeout(() => {
    layer.classList.remove('is-playing');
    layer.replaceChildren();
  }, 3300);
}

async function openRandomPhoto() {
  if (surprisePolaroidBusy) return;
  const dialog = $('#surprisePolaroid');
  const status = $('#surprisePolaroidStatus');
  if (!configured) {
    status.textContent = 'The wedding album is not connected yet.';
    if (!dialog.open) dialog.showModal();
    return;
  }
  surprisePolaroidBusy = true;
  const sequence = ++surprisePolaroidSequence;
  clearTimeout(surprisePolaroidTimer);
  dialog.querySelector('.surprise-polaroid__confetti').replaceChildren();
  dialog.classList.remove('is-revealed');
  status.textContent = 'Finding a little memory…';
  if (!dialog.open) dialog.showModal();
  try {
    const photos = await getAlbumPhotos(true);
    if (sequence !== surprisePolaroidSequence || !dialog.open) return;
    if (!photos.length) {
      status.textContent = 'No photos have been shared yet.';
      return;
    }
    const pool = photos.length > 1
      ? photos.filter(photo => String(photo.id) !== surprisePolaroidLastId)
      : photos;
    const photo = pool[Math.floor(Math.random() * pool.length)];
    const image = $('#surprisePolaroidImage');
    image.src = photo.image_url;
    image.alt = `Wedding memory uploaded by ${photo.guest_name || 'a guest'}`;
    await new Promise(resolve => {
      if (image.complete && image.naturalWidth) return resolve();
      const done = () => resolve();
      image.addEventListener('load', done, {once:true});
      image.addEventListener('error', done, {once:true});
    });
    if (sequence !== surprisePolaroidSequence || !dialog.open) return;
    surprisePolaroidPhoto = photo;
    surprisePolaroidLastId = String(photo.id);
    syncSurprisePolaroidFavourite();
    status.textContent = '';
    dialog.classList.add('is-revealed');
    playSurprisePolaroidConfetti();
  } catch (error) {
    console.error('Surprise photo failed:', error);
    if (sequence === surprisePolaroidSequence) status.textContent = 'Could not pick a surprise just now. Please try again.';
  } finally {
    if (sequence === surprisePolaroidSequence) surprisePolaroidBusy = false;
  }
}

$('#closeSurprisePolaroid').addEventListener('click', closeSurprisePolaroid);
$('#surprisePolaroid').addEventListener('cancel', event => {
  event.preventDefault();
  closeSurprisePolaroid();
});
$('#surprisePolaroid').addEventListener('click', event => {
  if (event.target === $('#surprisePolaroid')) closeSurprisePolaroid();
});
$('#surprisePolaroidAgain').addEventListener('click', () => void openRandomPhoto());
$('#surprisePolaroidFavourite').addEventListener('click', () => {
  if (!surprisePolaroidPhoto) return;
  toggleFavourite(surprisePolaroidPhoto);
  syncSurprisePolaroidFavourite();
});
$('#surprisePolaroidDownload').addEventListener('click', async () => {
  if (!surprisePolaroidPhoto) return;
  const photo = surprisePolaroidPhoto;
  const button = $('#surprisePolaroidDownload');
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const blob = await fetchPhotoBlob(photo.image_url);
    triggerBlobDownload(blob, safeDownloadName(photo));
  } catch (error) {
    console.error(error);
    $('#surprisePolaroidStatus').textContent = 'Could not download this photo. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Download ↓';
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

window.addEventListener('resize', () => { if ($('#lightbox')?.open) requestAnimationFrame(positionLightboxTopControls); });

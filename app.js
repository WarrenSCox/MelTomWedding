const cfg = window.WEDDING_APP_CONFIG;
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_SUPABASE');
const supabaseClient = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const $ = (s) => document.querySelector(s);
const loginView = $('#loginView');
const galleryView = $('#galleryView');
const galleryGrid = $('#galleryGrid');
const emptyState = $('#emptyState');
const uploadStatus = $('#uploadStatus');

$('#coupleName').textContent = cfg.coupleName;
$('#weddingDate').textContent = cfg.weddingDateText;

function session() { return JSON.parse(localStorage.getItem('weddingGuest') || 'null'); }
function showGallery(guest) {
  loginView.hidden = true;
  galleryView.hidden = false;
  $('#guestGreeting').textContent = `Signed in as ${guest.name}`;
  loadPhotos();
}

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#guestName').value.trim();
  const code = $('#weddingCode').value.trim();
  if (code !== cfg.weddingCode) {
    $('#loginError').hidden = false;
    return;
  }
  $('#loginError').hidden = true;
  const guest = { name };
  localStorage.setItem('weddingGuest', JSON.stringify(guest));
  showGallery(guest);
});

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('weddingGuest');
  galleryView.hidden = true;
  loginView.hidden = false;
});

$('#refreshBtn').addEventListener('click', loadPhotos);
$('#photoInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  if (!configured) {
    uploadStatus.textContent = 'Supabase is not configured yet. Follow SETUP.md first.';
    return;
  }
  const guest = session();
  uploadStatus.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
  let done = 0;
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from('wedding-photos').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) { console.error(uploadError); continue; }
    const { data: publicData } = supabaseClient.storage.from('wedding-photos').getPublicUrl(path);
    const { error: rowError } = await supabaseClient.from('photos').insert({ image_url: publicData.publicUrl, storage_path: path, guest_name: guest.name });
    if (!rowError) done++;
  }
  uploadStatus.textContent = `${done} photo${done === 1 ? '' : 's'} added to the wedding gallery ♥`;
  e.target.value = '';
  await loadPhotos();
});

async function loadPhotos() {
  if (!configured) {
    galleryGrid.innerHTML = '';
    emptyState.hidden = false;
    $('#photoCount').textContent = 'Demo ready — connect Supabase to start accepting photos.';
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
  $('#photoCount').textContent = photos.length ? `${photos.length} shared photo${photos.length === 1 ? '' : 's'} so far.` : 'No photos yet — be the first to add one.';
  for (const photo of photos) {
    const card = document.createElement('article');
    card.className = 'photo-card';
    const date = new Date(photo.created_at).toLocaleString([], { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
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
$('#lightbox').addEventListener('click', (e) => { if (e.target === $('#lightbox')) $('#lightbox').close(); });

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

const existing = session();
if (existing?.name) showGallery(existing);

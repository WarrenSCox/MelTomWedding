(() => {
  const ADMIN_EMAIL = 'admin@meltomwedding.app';
  const cfg = window.WEDDING_APP_CONFIG || {};
  const configured =
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('YOUR_SUPABASE');

  const $ = (sel) => document.querySelector(sel);
  const loginPanel = $('#loginPanel');
  const adminPanel = $('#adminPanel');
  const loginForm = $('#loginForm');
  const loginStatus = $('#loginStatus');
  const adminStatus = $('#adminStatus');
  const adminGrid = $('#adminGrid');
  const photoCount = $('#photoCount');
  const storageBucket = cfg.storageBucket || 'Wedding photos';

  const selectedPhotos = new Map();
  let selectionMode = false;
  let selectionDownloading = false;
  const selectionToolbar = $('#selectionToolbar');
  const selectionCount = $('#selectionCount');
  const downloadSelectedBtn = $('#downloadSelectedBtn');

  function photoKey(photo) {
    return String(photo.id);
  }

  function updateSelectionUI() {
    const count = selectedPhotos.size;
    selectionToolbar.hidden = !selectionMode;
    selectionCount.textContent = `${count} selected`;
    downloadSelectedBtn.textContent = `Download selected (${count}) ↓`;
    downloadSelectedBtn.disabled = !count || selectionDownloading;
    adminGrid.classList.toggle('is-selecting', selectionMode);

    adminGrid.querySelectorAll('.photo-card[data-photo-id]').forEach((card) => {
      const selected = selectedPhotos.has(card.dataset.photoId);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
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

  function safeDownloadName(photo, index = 0) {
    const pathName = (photo.storage_path || '').split('/').pop() || `wedding-photo-${index + 1}.jpg`;
    const cleaned = pathName
      .replace(/^\d+-[0-9a-f-]+-/i, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
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

  async function downloadSelectedPhotos() {
    if (!selectedPhotos.size || selectionDownloading) return;

    const photos = [...selectedPhotos.values()];
    selectionDownloading = true;
    updateSelectionUI();

    try {
      if (!window.JSZip) throw new Error('ZIP library did not load');

      const zip = new JSZip();
      const usedNames = new Set();

      for (let i = 0; i < photos.length; i++) {
        downloadSelectedBtn.textContent = `Zipping ${i + 1}/${photos.length}…`;
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

      downloadSelectedBtn.textContent = 'Creating ZIP…';
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, 'Mel-and-Tom-Admin-Selected-Photos.zip');
      downloadSelectedBtn.textContent = 'Downloaded ✓';

      setTimeout(cancelSelection, 900);
    } catch (error) {
      console.error(error);
      setAdminStatus('Selected photo download failed.', true);
    } finally {
      selectionDownloading = false;
      setTimeout(updateSelectionUI, 1000);
    }
  }


  if (!configured) {
    loginStatus.textContent = 'Supabase is not configured.';
    loginStatus.classList.add('error');
    loginForm.querySelector('button').disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  function setLoginStatus(message = '', error = false) {
    loginStatus.textContent = message;
    loginStatus.classList.toggle('error', error);
  }

  function setAdminStatus(message = '', error = false) {
    adminStatus.textContent = message;
    adminStatus.classList.toggle('error', error);
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    } catch {
      return '';
    }
  }

  function showLoggedIn() {
    loginPanel.hidden = true;
    adminPanel.hidden = false;
  }

  function showLoggedOut() {
    adminPanel.hidden = true;
    loginPanel.hidden = false;
    $('#password').value = '';
    adminGrid.innerHTML = '';
    photoCount.textContent = '';
    cancelSelection();
  }

  async function loadPhotos() {
    setAdminStatus('Loading photos…');
    const { data, error } = await supabase
      .from('photos')
      .select('id,image_url,storage_path,guest_name,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setAdminStatus('Could not load photos. Check the admin SELECT policy.', true);
      return;
    }

    const photos = data || [];
    const ids = new Set(photos.map(photo => photoKey(photo)));
    for (const key of [...selectedPhotos.keys()]) {
      if (!ids.has(key)) selectedPhotos.delete(key);
    }
    if (!selectedPhotos.size) selectionMode = false;

    photoCount.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
    adminGrid.innerHTML = '';

    if (!photos.length) {
      adminGrid.innerHTML = '<div class="empty">No photos have been uploaded yet.</div>';
      setAdminStatus('');
      return;
    }

    for (const photo of photos) {
      const card = document.createElement('article');
      card.className = 'photo-card';
      card.dataset.photoId = photoKey(photo);

      const mark = document.createElement('span');
      mark.className = 'photo-selection-mark';
      mark.setAttribute('aria-hidden', 'true');

      const img = document.createElement('img');
      img.src = photo.image_url;
      img.alt = `Wedding photo uploaded by ${photo.guest_name || 'Guest'}`;
      img.draggable = false;

      const body = document.createElement('div');
      body.className = 'photo-card__body';

      const name = document.createElement('p');
      name.className = 'photo-card__name';
      name.textContent = photo.guest_name || 'Guest';

      const date = document.createElement('p');
      date.className = 'photo-card__date';
      date.textContent = formatDate(photo.created_at);

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.type = 'button';
      del.textContent = 'Delete photo';
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        deletePhoto(photo, del);
      });

      let holdTimer = null;
      let startX = 0;
      let startY = 0;
      let suppressClick = false;

      const clearHold = () => {
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = null;
      };

      card.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.delete-btn')) return;
        if (selectionMode || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;

        startX = event.clientX;
        startY = event.clientY;
        clearHold();

        holdTimer = setTimeout(() => {
          holdTimer = null;
          suppressClick = true;
          togglePhotoSelection(photo);
          navigator.vibrate?.(25);
        }, 550);
      });

      card.addEventListener('pointermove', (event) => {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) clearHold();
      });

      card.addEventListener('pointerup', clearHold);
      card.addEventListener('pointercancel', clearHold);

      card.addEventListener('contextmenu', (event) => {
        if (event.target.closest('.delete-btn')) return;
        if (event.pointerType === 'mouse' && !selectionMode) return;
        event.preventDefault();
        clearHold();
        if (!selectionMode) {
          suppressClick = true;
          togglePhotoSelection(photo);
        }
      });

      card.addEventListener('click', (event) => {
        if (event.target.closest('.delete-btn')) return;
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          return;
        }
        if (selectionMode) togglePhotoSelection(photo);
      });

      body.append(name, date, del);
      card.append(mark, img, body);
      adminGrid.append(card);
    }

    updateSelectionUI();
    setAdminStatus('');
  }

  async function deletePhoto(photo, button) {
    const confirmed = window.confirm(
      `Delete this photo${photo.guest_name ? ` from ${photo.guest_name}` : ''}? This cannot be undone.`
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = 'Deleting…';
    setAdminStatus('Deleting photo…');

    try {
      const { error: storageError } = await supabase.storage
        .from(storageBucket)
        .remove([photo.storage_path]);

      if (storageError) throw storageError;

      const { error: rowError } = await supabase
        .from('photos')
        .delete()
        .eq('id', photo.id);

      if (rowError) throw rowError;

      setAdminStatus('Photo deleted.');
      await loadPhotos();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = 'Delete photo';
      setAdminStatus('Delete failed. Check the admin DELETE policies.', true);
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button');
    button.disabled = true;
    setLoginStatus('Signing in…');

    const password = $('#password').value;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password
    });

    button.disabled = false;

    if (error || !data.user) {
      setLoginStatus('Incorrect password.', true);
      return;
    }

    setLoginStatus('');
    showLoggedIn();
    await loadPhotos();
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLoggedOut();
  });

  $('#refreshBtn').addEventListener('click', loadPhotos);

  $('#cancelSelectionBtn').addEventListener('click', cancelSelection);
  downloadSelectedBtn.addEventListener('click', downloadSelectedPhotos);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectionMode) cancelSelection();
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user?.email === ADMIN_EMAIL) {
      showLoggedIn();
      loadPhotos();
    } else {
      showLoggedOut();
    }
  });
})();

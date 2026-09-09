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
  const SEATING_MENU_MARKER_PATH = '_settings/seating-menu-enabled.json';
  const seatingMenuToggle = $('#seatingMenuToggle');
  const seatingMenuToggleLabel = $('#seatingMenuToggleLabel');
  const featureStatus = $('#featureStatus');
  let seatingFeatureBusy = false;

  const selectedPhotos = new Map();
  let selectionMode = false;
  let selectionDeleting = false;
  const selectionToolbar = $('#selectionToolbar');
  const selectionCount = $('#selectionCount');
  const deleteSelectedBtn = $('#deleteSelectedBtn');

  function photoKey(photo) {
    return String(photo.id);
  }

  function updateSelectionUI() {
    const count = selectedPhotos.size;
    selectionToolbar.hidden = !selectionMode;
    selectionCount.textContent = `${count} selected`;
    deleteSelectedBtn.textContent = `Delete selected (${count})`;
    deleteSelectedBtn.disabled = !count || selectionDeleting;
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

  async function deleteSelectedPhotos() {
    if (!selectedPhotos.size || selectionDeleting) return;

    const photos = [...selectedPhotos.values()];
    const count = photos.length;
    const confirmed = window.confirm(
      `Delete ${count} selected photo${count === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!confirmed) return;

    selectionDeleting = true;
    updateSelectionUI();
    setAdminStatus(`Deleting ${count} selected photo${count === 1 ? '' : 's'}…`);

    try {
      const paths = photos
        .map(photo => photo.storage_path)
        .filter(Boolean);

      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from(storageBucket)
          .remove(paths);

        if (storageError) throw storageError;
      }

      const ids = photos.map(photo => photo.id);
      const { error: rowError } = await supabase
        .from('photos')
        .delete()
        .in('id', ids);

      if (rowError) throw rowError;

      cancelSelection();
      setAdminStatus(
        `${count} photo${count === 1 ? '' : 's'} deleted.`
      );
      await loadPhotos();
    } catch (error) {
      console.error(error);
      setAdminStatus('Delete selected failed. Check the admin DELETE policies.', true);
    } finally {
      selectionDeleting = false;
      updateSelectionUI();
    }
  }

  if (!configured) {
    loginStatus.textContent = 'Supabase is not configured.';
    loginStatus.classList.add('error');
    loginForm.querySelector('button').disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const anonStorage = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  function setLoginStatus(message = '', error = false) {
    loginStatus.textContent = message;
    loginStatus.classList.toggle('error', error);
  }

  function setAdminStatus(message = '', error = false) {
    adminStatus.textContent = message;
    adminStatus.classList.toggle('error', error);
  }

  function setFeatureStatus(message = '', error = false) {
    featureStatus.textContent = message;
    featureStatus.classList.toggle('error', error);
  }
  function renderSeatingMenuToggle(enabled) {
    seatingMenuToggle.checked = enabled === true;
    seatingMenuToggleLabel.textContent = enabled ? 'On' : 'Off';
  }
  function formatDiag(value) {
    if (value == null) return 'none';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  async function seatingMenuMarkerExists() {
    const { data } = anonStorage.storage.from(storageBucket).getPublicUrl(SEATING_MENU_MARKER_PATH);
    try {
      const response = await fetch(`${data.publicUrl}?t=${Date.now()}`, { method:'GET', cache:'no-store' });
      window.__seatingMenuDiag = window.__seatingMenuDiag || {};
      window.__seatingMenuDiag.markerUrl = data.publicUrl;
      window.__seatingMenuDiag.markerHttpStatus = response.status;
      if (response.ok) return true;
      if (response.status === 400 || response.status === 404) return false;
      throw new Error(`Marker GET returned HTTP ${response.status}`);
    } catch (error) {
      console.error('Seating marker check failed:', error);
      window.__seatingMenuLastError = error;
      window.__seatingMenuDiag = window.__seatingMenuDiag || {};
      window.__seatingMenuDiag.markerCheckError = error?.message || String(error);
      return null;
    }
  }

  async function loadSeatingFeature() {
    seatingMenuToggle.disabled = true;
    setFeatureStatus('Checking visibility…');
    const enabled = await seatingMenuMarkerExists();
    if (enabled === null) {
      const detail = window.__seatingMenuLastError?.message || 'Unknown marker check error';
      setFeatureStatus(`Could not check the switch. ${detail}`, true);
      return;
    }
    renderSeatingMenuToggle(enabled);
    seatingMenuToggle.disabled = false;
    setFeatureStatus(enabled ? 'Visible to guests.' : 'Hidden from guests.');
  }
  async function setSeatingFeature(enabled) {
    if (seatingFeatureBusy) return;
    seatingFeatureBusy = true;
    seatingMenuToggle.disabled = true;
    window.__seatingMenuDiag = {};
    setFeatureStatus(enabled ? 'Stage 1/3: creating marker…' : 'Stage 1/3: removing marker…');

    try {
      if (enabled) {
        const marker = new Blob(
          [JSON.stringify({ enabled: true, updated_at: new Date().toISOString() })],
          { type: 'application/json' }
        );

        const uploadResult = await anonStorage.storage
          .from(storageBucket)
          .upload(SEATING_MENU_MARKER_PATH, marker, {
            contentType: 'application/json',
            cacheControl: '0',
            upsert: false
          });

        window.__seatingMenuDiag.uploadData = uploadResult?.data || null;
        window.__seatingMenuDiag.uploadError = uploadResult?.error || null;

        if (uploadResult.error) {
          const exists = await seatingMenuMarkerExists();
          if (!exists) throw uploadResult.error;
        }
      } else {
        const removeResult = await supabase.storage
          .from(storageBucket)
          .remove([SEATING_MENU_MARKER_PATH]);

        window.__seatingMenuDiag.removeData = removeResult?.data || null;
        window.__seatingMenuDiag.removeError = removeResult?.error || null;

        if (removeResult.error) throw removeResult.error;
      }

      setFeatureStatus('Stage 2/3: checking marker URL…');
      const confirmed = await seatingMenuMarkerExists();
      window.__seatingMenuDiag.confirmed = confirmed;

      setFeatureStatus('Stage 3/3: confirming final state…');
      if (confirmed !== enabled) {
        throw new Error(
          `Expected ${enabled ? 'ON' : 'OFF'} but marker check returned ${confirmed}; HTTP ${window.__seatingMenuDiag.markerHttpStatus ?? 'unknown'}`
        );
      }

      renderSeatingMenuToggle(enabled);
      setFeatureStatus(
        `${enabled ? 'Visible to guests.' : 'Hidden from guests.'} ` +
        `HTTP ${window.__seatingMenuDiag.markerHttpStatus ?? 'unknown'}`
      );
    } catch (error) {
      console.error('Seating/menu switch failed:', error, window.__seatingMenuDiag);
      const actual = await seatingMenuMarkerExists();
      if (actual !== null) renderSeatingMenuToggle(actual);

      const d = window.__seatingMenuDiag || {};
      const uploadErr = d.uploadError?.message || d.uploadError?.error || '';
      const removeErr = d.removeError?.message || d.removeError?.error || '';
      const details = [
        `Error: ${error?.message || String(error)}`,
        `HTTP: ${d.markerHttpStatus ?? 'unknown'}`,
        uploadErr ? `Upload: ${uploadErr}` : 'Upload: no reported error',
        removeErr ? `Remove: ${removeErr}` : '',
        `Confirmed: ${d.confirmed ?? actual ?? 'unknown'}`
      ].filter(Boolean).join(' | ');

      setFeatureStatus(`Switch failed. ${details}`, true);
    } finally {
      seatingFeatureBusy = false;
      seatingMenuToggle.disabled = false;
    }
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
    renderSeatingMenuToggle(false);
    seatingMenuToggle.disabled = true;
    setFeatureStatus('');
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
    await Promise.all([loadPhotos(), loadSeatingFeature()]);
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLoggedOut();
  });

  $('#refreshBtn').addEventListener('click', () => Promise.all([loadPhotos(), loadSeatingFeature()]));

  seatingMenuToggle.addEventListener('change', () => {
    const requested = seatingMenuToggle.checked;
    seatingMenuToggleLabel.textContent = requested ? 'On' : 'Off';
    void setSeatingFeature(requested);
  });

  $('#cancelSelectionBtn').addEventListener('click', cancelSelection);
  deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectionMode) cancelSelection();
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user?.email === ADMIN_EMAIL) {
      showLoggedIn();
      Promise.all([loadPhotos(), loadSeatingFeature()]);
    } else {
      showLoggedOut();
    }
  });
})();

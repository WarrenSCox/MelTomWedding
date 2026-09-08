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

      const img = document.createElement('img');
      img.src = photo.image_url;
      img.alt = `Wedding photo uploaded by ${photo.guest_name || 'Guest'}`;

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
      del.addEventListener('click', () => deletePhoto(photo, del));

      body.append(name, date, del);
      card.append(img, body);
      adminGrid.append(card);
    }

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

  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user?.email === ADMIN_EMAIL) {
      showLoggedIn();
      loadPhotos();
    } else {
      showLoggedOut();
    }
  });
})();

/**
 * settings.js
 * Profile update, password change, theme/currency/contrast preferences,
 * avatar upload (base64), backup export/import, data wipe.
 */

(function () {
  'use strict';

  initApp('settings.html');
  const user = Auth.user;
  if (!user) return;

  let prefs = DB.getPrefs(user.id);

  /* ─── Keyboard shortcuts ─────────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (!e.altKey) return;
    const map = { d: 'dashboard.html', t: 'transactions.html', b: 'budgets.html', r: 'reports.html' };
    if (map[e.key.toLowerCase()]) { e.preventDefault(); window.location.href = map[e.key.toLowerCase()]; }
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); Theme.toggle(); }
  });

  /* ─── Avatar ─────────────────────────────────────────────────────────────── */

  function renderAvatar() {
    const el = document.getElementById('avatarPreview');
    if (prefs.avatar) {
      el.innerHTML = `<img src="${prefs.avatar}" alt="Your avatar">`;
    } else {
      el.textContent = user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    }
  }
  renderAvatar();

  document.getElementById('avatarInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Toast.error('Image must be under 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      prefs = DB.savePrefs(user.id, { avatar: ev.target.result });
      renderAvatar();
      // Update topbar avatar immediately
      const topbarAvatar = document.getElementById('topbarAvatar');
      if (topbarAvatar) topbarAvatar.innerHTML = `<img src="${ev.target.result}" alt="">`;
      Toast.success('Avatar updated.');
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('avatarPreview').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
  });

  /* ─── Profile form ───────────────────────────────────────────────────────── */

  document.getElementById('profileName').value = user.name;
  document.getElementById('profileEmail').value = user.email;

  document.getElementById('profileForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    if (!name || name.length < 2) { Toast.error('Name must be at least 2 characters.'); return; }
    if (!email || !/\S+@\S+\.\S+/.test(email)) { Toast.error('Enter a valid email.'); return; }

    // Check if email is already used by a different account
    const existing = DB.findUserByEmail(email);
    if (existing && existing.id !== user.id) { Toast.error('That email is already registered to another account.'); return; }

    DB.updateUser(user.id, { name, email });
    Toast.success('Profile saved.');
  });

  /* ─── Password change ────────────────────────────────────────────────────── */

  document.getElementById('passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const currentPw = document.getElementById('currentPw').value;
    const newPw = document.getElementById('newPw').value;
    const confirmPw = document.getElementById('confirmPw').value;

    if (!currentPw || !newPw || !confirmPw) { Toast.error('Fill in all password fields.'); return; }
    if (newPw.length < 8) { Toast.error('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { Toast.error('New passwords do not match.'); return; }

    const ok = await DB.verifyPassword(user, currentPw);
    if (!ok) { Toast.error('Current password is incorrect.'); return; }

    await DB.setPassword(user.id, newPw);
    document.getElementById('passwordForm').reset();
    Toast.success('Password updated successfully.');
  });

  /* ─── Appearance ─────────────────────────────────────────────────────────── */

  // Sync initial state
  document.getElementById('currencyPref').value = prefs.currency || 'USD';
  document.getElementById('highContrast').checked = prefs.highContrast || false;

  document.querySelectorAll('[data-theme-pick]').forEach(swatch => {
    const t = swatch.getAttribute('data-theme-pick');
    swatch.classList.toggle('is-active', t === (prefs.theme || 'light'));
    swatch.addEventListener('click', () => {
      document.querySelectorAll('[data-theme-pick]').forEach(s => s.classList.remove('is-active'));
      swatch.classList.add('is-active');
    });
  });

  document.getElementById('saveAppearance').addEventListener('click', () => {
    const activeSwatch = document.querySelector('[data-theme-pick].is-active');
    const theme = activeSwatch ? activeSwatch.getAttribute('data-theme-pick') : 'light';
    const currency = document.getElementById('currencyPref').value;
    const highContrast = document.getElementById('highContrast').checked;

    prefs = DB.savePrefs(user.id, { theme, currency, highContrast });
    Theme.apply(prefs);
    Theme.syncToggleUI();
    localStorage.setItem('mf_last_theme', theme);
    Toast.success('Appearance preferences saved.');
  });

  /* ─── Backup / Restore ───────────────────────────────────────────────────── */

  const lastExportKey = `mf_last_export_${user.id}`;
  const lastExport = localStorage.getItem(lastExportKey);
  if (lastExport) {
    document.getElementById('lastExportDate').textContent = new Date(lastExport).toLocaleString();
  }

  document.getElementById('btnExportBackup').addEventListener('click', () => {
    const backup = DB.exportBackup(user.id);  // V2 export includes subscriptions, debts, investments
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneyflow-v2-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    localStorage.setItem(`mf_last_export_${user.id}`, new Date().toISOString());
    document.getElementById('lastExportDate').textContent = new Date().toLocaleString();
    Toast.success('Backup exported (V2.0 format).');
    if (window.AchievementsEngine) AchievementsEngine.check(user.id);
  });

  document.getElementById('importBackupInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!confirm(`Import backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'unknown date'}?\n\nThis will REPLACE your current financial data.`)) return;
        DB.importBackup(user.id, data);
        Toast.success('Backup restored! Reloading…');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        Toast.error('Invalid backup file. Please select a valid MoneyFlow JSON backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ─── Wipe data ──────────────────────────────────────────────────────────── */

  document.getElementById('btnWipeData').addEventListener('click', () => {
    document.getElementById('wipeConfirmInput').value = '';
    document.getElementById('confirmWipeBtn').disabled = true;
    Modal.open('wipeModal');
  });

  document.getElementById('wipeConfirmInput').addEventListener('input', e => {
    document.getElementById('confirmWipeBtn').disabled = e.target.value !== 'DELETE';
  });

  document.getElementById('confirmWipeBtn').addEventListener('click', () => {
    DB.wipeUserData(user.id);
    Modal.close('wipeModal');
    Toast.success('All financial data wiped. Redirecting…');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
  });

})();

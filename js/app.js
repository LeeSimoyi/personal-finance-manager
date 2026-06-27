/**
 * app.js — MoneyFlow V2.0
 * ─────────────────────────────────────────────────────────────────────────
 * Runs on every protected page. Provides:
 *   - Lucide icon helper (icon / refreshIcons)
 *   - Custom logo mark SVG
 *   - Toast notifications
 *   - Theme (light/dark/high-contrast)
 *   - Auth guard + session management
 *   - Currency formatting
 *   - App shell (topbar + sidenav with V2 pages)
 *   - Notification badge
 *   - Modal manager (with scrollable body)
 *   - Service Worker registration
 *   - Keyboard shortcuts (Alt+D, Alt+T, etc.)
 *   - Command Palette init (Ctrl+K)
 *   - Achievements check after writes
 * ─────────────────────────────────────────────────────────────────────────
 */

const PUBLIC_PAGES = ['login.html', 'register.html', 'forgot-password.html'];

function currentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

/* ─────────────────────── Icon helper ─────────────────────── */

function icon(name, cls = '') {
  return `<i data-lucide="${name}" class="${cls}"></i>`;
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/* ─────────────────────── Brand mark ─────────────────────── */

function logoMark(size = 28) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#071724"/>
      <path d="M12 40 L24 30 L32 36 L52 16" fill="none" stroke="#BDF75C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M42 16 L52 16 L52 26" fill="none" stroke="#BDF75C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="24" cy="30" r="3.4" fill="#BDF75C"/>
      <circle cx="32" cy="36" r="3.4" fill="#0B2235"/>
      <circle cx="32" cy="36" r="1.8" fill="#BDF75C"/>
    </svg>`;
}

/* ─────────────────────── Toast ─────────────────────── */

const Toast = {
  region: null,
  ensureRegion() {
    if (this.region) return this.region;
    const r = document.createElement('div');
    r.className = 'toast-region';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('aria-atomic', 'false');
    document.body.appendChild(r);
    this.region = r;
    return r;
  },
  show(message, type = 'success', timeout = 4200) {
    const region = this.ensureRegion();
    const ICONS = { success: 'check-circle-2', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icon(ICONS[type] || ICONS.info, 'icon-sm')}</span>
      <span class="toast__msg"></span>
      <button class="toast__close" aria-label="Dismiss">${icon('x', 'icon-xs')}</button>`;
    el.querySelector('.toast__msg').textContent = message;
    region.appendChild(el);
    refreshIcons();
    requestAnimationFrame(() => el.classList.add('toast--in'));
    const remove = () => {
      el.classList.remove('toast--in');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    if (timeout) setTimeout(remove, timeout);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); },
};

/* ─────────────────────── Theme ─────────────────────── */

const Theme = {
  apply(prefs) {
    document.documentElement.setAttribute('data-theme', prefs.theme === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-contrast', prefs.highContrast ? 'high' : 'normal');
  },
  toggle() {
    const user = Auth.user;
    if (!user) return;
    const prefs = DB.getPrefs(user.id);
    const next = prefs.theme === 'dark' ? 'light' : 'dark';
    DB.savePrefs(user.id, { theme: next });
    this.apply(DB.getPrefs(user.id));
    this.syncToggleUI();
    localStorage.setItem('mf_last_theme', next);
  },
  syncToggleUI() {
    const user = Auth.user;
    if (!user) return;
    const prefs = DB.getPrefs(user.id);
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-pressed', prefs.theme === 'dark' ? 'true' : 'false');
      const host = btn.querySelector('.theme-toggle__icon');
      if (host) { host.innerHTML = icon(prefs.theme === 'dark' ? 'sun' : 'moon', 'icon-sm'); refreshIcons(); }
    });
  },
};

/* ─────────────────────── Auth ─────────────────────── */

const Auth = {
  user: null,
  prefs: null,
  requireAuth() {
    const session = DB.getSession();
    const user = session ? DB.findUserById(session.userId) : null;
    if (!user) {
      const here = currentPageName();
      if (!PUBLIC_PAGES.includes(here) && here !== 'index.html') {
        window.location.href = 'login.html';
      }
      return null;
    }
    this.user = user;
    this.prefs = DB.getPrefs(user.id);
    return user;
  },
  redirectIfLoggedIn() {
    const session = DB.getSession();
    if (session && DB.findUserById(session.userId)) {
      window.location.href = 'dashboard.html';
    }
  },
  logout() {
    DB.clearSession();
    window.location.href = 'login.html';
  },
};

/* ─────────────────────── Currency ─────────────────────── */

function userCurrency() { return (Auth.prefs && Auth.prefs.currency) || 'USD'; }
function fmt(amountUSD, opts) { return formatCurrency(amountUSD, userCurrency(), opts); }

/* ─────────────────────── App Shell (Topbar + Sidenav) ─────────────────────── */

function buildAppShell(activePage) {
  const shellHost = document.querySelector('[data-app-shell]');
  if (!shellHost || !Auth.user) return;

  const primaryNav = [
    { href: 'dashboard.html',       i: 'layout-dashboard',  label: 'Dashboard' },
    { href: 'transactions.html',    i: 'arrow-left-right',   label: 'Transactions' },
    { href: 'budgets.html',         i: 'target',             label: 'Budgets & Goals' },
    { href: 'reports.html',         i: 'bar-chart-3',        label: 'Reports' },
  ];

  const toolsNav = [
    { href: 'financial-health.html', i: 'activity',    label: 'Health Score' },
    { href: 'subscriptions.html',    i: 'credit-card', label: 'Subscriptions' },
    { href: 'debts.html',            i: 'landmark',    label: 'Debt Tracker' },
    { href: 'investments.html',      i: 'trending-up', label: 'Investments' },
    { href: 'calendar.html',         i: 'calendar',    label: 'Calendar' },
    { href: 'achievements.html',     i: 'trophy',      label: 'Achievements' },
  ];

  const initials = Auth.user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const avatar = Auth.prefs.avatar;

  function navItem(item) {
    const active = activePage === item.href;
    return `
      <li>
        <a href="${item.href}" class="sidenav__link ${active ? 'is-active' : ''}" ${active ? 'aria-current="page"' : ''}>
          <span class="sidenav__icon" aria-hidden="true">${icon(item.i)}</span>
          <span>${item.label}</span>
        </a>
      </li>`;
  }

  shellHost.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <button class="topbar__menu" id="navToggle" aria-label="Open navigation" aria-expanded="false" aria-controls="sideNav">
        <span></span><span></span><span></span>
      </button>
      <a href="dashboard.html" class="topbar__brand" aria-label="MoneyFlow home">
        <span class="topbar__brand-mark" aria-hidden="true">${logoMark(28)}</span>
        <span class="topbar__brand-name">MoneyFlow</span>
      </a>
      <div class="topbar__actions">
        <!-- Command palette hint -->
        <button class="topbar__cmd-btn" id="cmdTrigger" title="Command palette (Ctrl+K)" aria-label="Open command palette">
          ${icon('search', 'icon-sm')}
          <kbd>Ctrl K</kbd>
        </button>
        <!-- Notifications -->
        <a href="notifications.html" class="topbar__notif-btn" aria-label="Notifications" id="notifBtn">
          ${icon('bell', 'icon-sm')}
          <span class="notif-badge" id="notifBadge" style="display:none;" aria-live="polite"></span>
        </a>
        <!-- Theme toggle -->
        <button class="icon-btn" data-theme-toggle aria-pressed="false" title="Toggle dark mode">
          <span class="theme-toggle__icon">${icon('moon', 'icon-sm')}</span>
        </button>
        <!-- User avatar -->
        <div class="topbar__user">
          <span class="avatar" id="topbarAvatar">${avatar ? `<img src="${avatar}" alt="${Auth.user.name}">` : initials}</span>
          <span class="topbar__user-name">${Auth.user.name.split(' ')[0]}</span>
        </div>
      </div>
    </header>

    <nav class="sidenav" id="sideNav" aria-label="Primary navigation">
      <div class="sidenav__section">
        <ul class="sidenav__list">
          ${primaryNav.map(navItem).join('')}
        </ul>
      </div>
      <div class="sidenav__section">
        <p class="sidenav__group-label">Tools</p>
        <ul class="sidenav__list">
          ${toolsNav.map(navItem).join('')}
        </ul>
      </div>
      <div class="sidenav__bottom">
        <a href="settings.html" class="sidenav__link ${activePage === 'settings.html' ? 'is-active' : ''}">
          ${icon('settings')} <span>Settings</span>
        </a>
        <button class="sidenav__logout" id="logoutBtn">
          ${icon('log-out', 'icon-sm')} <span>Log out</span>
        </button>
      </div>
    </nav>
    <div class="sidenav__overlay" id="navOverlay"></div>`;

  /* Nav toggle */
  const toggle = document.getElementById('navToggle');
  const sideNav = document.getElementById('sideNav');
  const overlay = document.getElementById('navOverlay');
  const closeNav = () => {
    sideNav.classList.remove('is-open');
    overlay.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = sideNav.classList.toggle('is-open');
    overlay.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  overlay.addEventListener('click', closeNav);
  sideNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));

  /* Logout */
  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());

  /* Theme */
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => Theme.toggle()));

  /* Command palette trigger */
  const cmdTrigger = document.getElementById('cmdTrigger');
  if (cmdTrigger) cmdTrigger.addEventListener('click', () => { if (window.CommandPalette) CommandPalette.open(); });

  refreshIcons();
  Theme.syncToggleUI();
}

/* ─────────────────────── Modal ─────────────────────── */

const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    const body = el.querySelector('.modal__body');
    if (body) body.scrollTop = 0;
    const focusable = el.querySelector('input, select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 50);
    document.addEventListener('keydown', this._escHandler);
  },
  close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this._escHandler);
  },
  _escHandler(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.is-open').forEach(m => Modal.close(m.id));
    }
  },
};

/* ─────────────────────── Service Worker ─────────────────────── */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    // Resolve SW path relative to site root
    const swPath = new URL('../sw.js', window.location.href).pathname;
    navigator.serviceWorker.register(swPath, { scope: '/' }).catch(() => {});
  }
}

/* ─────────────────────── Keyboard shortcuts ─────────────────────── */

function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!e.altKey) return;
    const map = {
      'd': 'dashboard.html',
      't': 'transactions.html',
      'b': 'budgets.html',
      'r': 'reports.html',
      'h': 'financial-health.html',
      's': 'subscriptions.html',
      'm': null, // theme toggle
    };
    const key = e.key.toLowerCase();
    if (key === 'm') { e.preventDefault(); Theme.toggle(); return; }
    if (map[key]) { e.preventDefault(); window.location.href = map[key]; }
  });
}

/* ─────────────────────── Bootstrap ─────────────────────── */

function initApp(activePage) {
  const isPublic = PUBLIC_PAGES.includes(activePage);
  if (isPublic) {
    Auth.redirectIfLoggedIn();
    return;
  }

  const user = Auth.requireAuth();
  if (!user) return;

  Theme.apply(Auth.prefs);
  DB.processRecurring(user.id);
  buildAppShell(activePage);

  // Wire up modal close-on-overlay and close buttons
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) Modal.close(modal.id); });
    modal.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', () => Modal.close(modal.id));
    });
  });

  // Keyboard shortcuts
  initKeyboardShortcuts();

  // Command palette (loaded separately via <script> tag)
  if (window.CommandPalette) CommandPalette.init();

  // Achievements initial check
  if (window.AchievementsEngine) AchievementsEngine.check(user.id);

  // Smart notifications
  if (window.NotificationsEngine) {
    NotificationsEngine.run(user.id);
  }

  // Service Worker
  registerServiceWorker();

  refreshIcons();
}

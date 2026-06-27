/**
 * command-palette.js — MoneyFlow V2.0
 * ─────────────────────────────────────────────────────────────────────────
 * Ctrl+K (or Cmd+K) opens a spotlight-style command palette that lets users
 * navigate any page, quick-add transactions, and search their data instantly.
 * Injected into the page by initApp() via buildCommandPalette().
 * ─────────────────────────────────────────────────────────────────────────
 */

const CommandPalette = (() => {
  'use strict';

  let isOpen = false;
  let selectedIdx = 0;
  let filteredItems = [];

  /* ── Static command registry ── */
  const NAV_COMMANDS = [
    { type: 'nav', icon: 'layout-dashboard', label: 'Go to Dashboard',     href: 'dashboard.html',       keywords: 'home overview' },
    { type: 'nav', icon: 'arrow-left-right',  label: 'Go to Transactions',  href: 'transactions.html',    keywords: 'income expense history' },
    { type: 'nav', icon: 'target',            label: 'Go to Budgets & Goals', href: 'budgets.html',       keywords: 'budget goal savings' },
    { type: 'nav', icon: 'bar-chart-3',       label: 'Go to Reports',       href: 'reports.html',         keywords: 'analytics chart trend' },
    { type: 'nav', icon: 'activity',          label: 'Financial Health Score', href: 'financial-health.html', keywords: 'score health' },
    { type: 'nav', icon: 'credit-card',       label: 'Subscription Manager', href: 'subscriptions.html',  keywords: 'netflix spotify subscription' },
    { type: 'nav', icon: 'landmark',          label: 'Debt Tracker',        href: 'debts.html',           keywords: 'loan mortgage debt' },
    { type: 'nav', icon: 'trending-up',       label: 'Investment Tracker',  href: 'investments.html',     keywords: 'stock crypto portfolio invest' },
    { type: 'nav', icon: 'calendar',          label: 'Financial Calendar',  href: 'calendar.html',        keywords: 'calendar schedule bill' },
    { type: 'nav', icon: 'bell',              label: 'Notifications',       href: 'notifications.html',   keywords: 'alert reminder notification' },
    { type: 'nav', icon: 'trophy',            label: 'Achievements',        href: 'achievements.html',    keywords: 'badges progress milestones' },
    { type: 'nav', icon: 'settings',          label: 'Settings',            href: 'settings.html',        keywords: 'profile theme currency' },
  ];

  const ACTION_COMMANDS = [
    { type: 'action', icon: 'plus-circle',  label: 'Add Income',   action: 'add-income',   keywords: 'add new income salary' },
    { type: 'action', icon: 'minus-circle', label: 'Add Expense',  action: 'add-expense',  keywords: 'add new expense buy' },
    { type: 'action', icon: 'target',       label: 'New Savings Goal', action: 'add-goal', keywords: 'goal savings target' },
    { type: 'action', icon: 'moon',         label: 'Toggle Dark Mode', action: 'toggle-theme', keywords: 'dark light theme' },
    { type: 'action', icon: 'log-out',      label: 'Log out',      action: 'logout',       keywords: 'sign out logout' },
  ];

  /* ── Build overlay HTML ── */
  function buildHTML() {
    const el = document.createElement('div');
    el.id = 'commandPalette';
    el.className = 'cmd-palette';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Command palette');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="cmd-palette__backdrop" id="cmdBackdrop"></div>
      <div class="cmd-palette__panel" role="combobox" aria-expanded="false" aria-haspopup="listbox">
        <div class="cmd-palette__search">
          <span class="cmd-palette__search-icon" aria-hidden="true">${icon('search','icon-sm')}</span>
          <input
            type="text"
            id="cmdInput"
            class="cmd-palette__input"
            placeholder="Search pages, actions, or transactions…"
            autocomplete="off"
            aria-label="Command palette search"
            aria-autocomplete="list"
            aria-controls="cmdList"
          >
          <kbd class="cmd-palette__esc" aria-label="Press Escape to close">esc</kbd>
        </div>
        <ul class="cmd-palette__list" id="cmdList" role="listbox" aria-label="Commands"></ul>
        <div class="cmd-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    refreshIcons();
  }

  /* ── Get dynamic items from localStorage ── */
  function getDynamicItems(query) {
    if (!Auth.user || query.length < 2) return [];
    const q = query.toLowerCase();
    const txAll = DB.getTransactions(Auth.user.id);
    return txAll
      .filter(t => {
        const hay = `${t.category} ${t.note || ''} ${t.amountUSD}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 5)
      .map(t => ({
        type: 'tx',
        icon: t.type === 'income' ? 'trending-up' : 'trending-down',
        label: `${t.type === 'income' ? '+' : '-'}${fmt(t.amountUSD)} — ${t.category}${t.note ? ': ' + t.note : ''}`,
        sub: t.date,
        action: 'view-tx',
        data: t,
      }));
  }

  /* ── Render filtered list ── */
  function renderList(query) {
    const q = (query || '').toLowerCase().trim();
    const list = document.getElementById('cmdList');
    if (!list) return;

    const navMatches = NAV_COMMANDS.filter(c =>
      !q || c.label.toLowerCase().includes(q) || (c.keywords || '').toLowerCase().includes(q)
    );
    const actionMatches = ACTION_COMMANDS.filter(c =>
      !q || c.label.toLowerCase().includes(q) || (c.keywords || '').toLowerCase().includes(q)
    );
    const txMatches = getDynamicItems(q);

    filteredItems = [];
    let html = '';

    if (txMatches.length > 0) {
      html += `<li class="cmd-palette__group" role="presentation">Transactions</li>`;
      txMatches.forEach((item, i) => {
        filteredItems.push(item);
        html += renderItem(item, filteredItems.length - 1);
      });
    }

    if (navMatches.length > 0) {
      html += `<li class="cmd-palette__group" role="presentation">Pages</li>`;
      navMatches.forEach(item => {
        filteredItems.push(item);
        html += renderItem(item, filteredItems.length - 1);
      });
    }

    if (actionMatches.length > 0) {
      html += `<li class="cmd-palette__group" role="presentation">Actions</li>`;
      actionMatches.forEach(item => {
        filteredItems.push(item);
        html += renderItem(item, filteredItems.length - 1);
      });
    }

    if (filteredItems.length === 0) {
      html = `<li class="cmd-palette__empty">No results for "<strong>${escapeHtml(q)}</strong>"</li>`;
    }

    list.innerHTML = html;
    selectedIdx = 0;
    updateSelection();
    refreshIcons();

    // Attach click listeners
    list.querySelectorAll('.cmd-palette__item').forEach((el, i) => {
      el.addEventListener('click', () => executeItem(filteredItems[i]));
      el.addEventListener('mousemove', () => { selectedIdx = i; updateSelection(); });
    });
  }

  function renderItem(item, idx) {
    const sub = item.sub ? `<span class="cmd-palette__item-sub">${escapeHtml(item.sub)}</span>` : '';
    return `
      <li class="cmd-palette__item" role="option" aria-selected="false" data-idx="${idx}">
        <span class="cmd-palette__item-icon">${icon(item.icon || 'circle', 'icon-sm')}</span>
        <span class="cmd-palette__item-body">
          <span class="cmd-palette__item-label">${escapeHtml(item.label)}</span>
          ${sub}
        </span>
        ${item.type === 'nav' ? `<span class="cmd-palette__item-arrow">${icon('chevron-right','icon-xs')}</span>` : ''}
      </li>`;
  }

  function updateSelection() {
    document.querySelectorAll('.cmd-palette__item').forEach((el, i) => {
      const active = i === selectedIdx;
      el.classList.toggle('is-selected', active);
      el.setAttribute('aria-selected', String(active));
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ── Execute a command ── */
  function executeItem(item) {
    if (!item) return;
    close();

    if (item.type === 'nav') {
      window.location.href = item.href;
      return;
    }

    if (item.type === 'action') {
      switch (item.action) {
        case 'add-income':
          if (window.Modal) Modal.open('addIncomeModal');
          else window.location.href = 'dashboard.html';
          break;
        case 'add-expense':
          if (window.Modal) Modal.open('addExpenseModal');
          else window.location.href = 'dashboard.html';
          break;
        case 'add-goal':
          if (window.Modal) Modal.open('goalModal');
          else window.location.href = 'budgets.html#goals';
          break;
        case 'toggle-theme':
          Theme.toggle();
          break;
        case 'logout':
          Auth.logout();
          break;
      }
    }
  }

  /* ── Open / close ── */
  function open() {
    const el = document.getElementById('commandPalette');
    const input = document.getElementById('cmdInput');
    if (!el || !input) return;
    isOpen = true;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { input.focus(); input.select(); });
    renderList('');
  }

  function close() {
    const el = document.getElementById('commandPalette');
    if (!el) return;
    isOpen = false;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    const input = document.getElementById('cmdInput');
    if (input) input.value = '';
  }

  function toggle() { isOpen ? close() : open(); }

  /* ── Escape helper ── */
  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── init ── */
  function init() {
    buildHTML();

    // Keyboard shortcut: Ctrl+K / Cmd+K
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
        return;
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, filteredItems.length - 1);
        updateSelection();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        updateSelection();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeItem(filteredItems[selectedIdx]);
      }
    });

    // Input handler
    document.addEventListener('input', e => {
      if (e.target.id === 'cmdInput') renderList(e.target.value);
    });

    // Backdrop click
    document.addEventListener('click', e => {
      if (e.target.id === 'cmdBackdrop') close();
    });
  }

  return { init, open, close, toggle };
})();

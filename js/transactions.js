/**
 * transactions.js
 * Full transaction management: search, filter by type/category/month,
 * sortable columns, pagination (20/page), add/edit/delete with modal forms.
 */

(function () {
  'use strict';

  initApp('transactions.html');
  const user = Auth.user;
  if (!user) return;

  const currency = Auth.prefs.currency || 'USD';
  const PAGE_SIZE = 20;

  let allTx = DB.getTransactions(user.id);
  let sortCol = 'date';
  let sortDir = 'desc';
  let currentPage = 1;
  let pendingDeleteId = null;

  // ── populate category filter & category selects ──

  const allCats = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])].sort();
  const filterCategory = document.getElementById('filterCategory');
  allCats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    filterCategory.appendChild(o);
  });

  // Set default month filter to current month
  const filterMonthInput = document.getElementById('filterMonth');
  const now = new Date();
  filterMonthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Populate modal category select based on type
  function updateModalCategories(type) {
    const sel = document.getElementById('txCategory');
    sel.innerHTML = '';
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    cats.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  document.getElementById('txType').addEventListener('change', e => updateModalCategories(e.target.value));
  updateModalCategories('income');

  // ── filter + sort + paginate pipeline ──

  function getFiltered() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const type = document.getElementById('filterType').value;
    const category = filterCategory.value;
    const month = filterMonthInput.value; // "YYYY-MM" or ""

    return allTx.filter(t => {
      if (type && t.type !== type) return false;
      if (category && t.category !== category) return false;
      if (month && !t.date.startsWith(month)) return false;
      if (search) {
        const hay = `${t.note || ''} ${t.category} ${t.amountUSD} ${t.date}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function sortTx(list) {
    return [...list].sort((a, b) => {
      let av = a[sortCol]; let bv = b[sortCol];
      if (sortCol === 'date') { av = new Date(av); bv = new Date(bv); }
      if (sortCol === 'amountUSD') { av = Number(av); bv = Number(bv); }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function render() {
    const filtered = getFiltered();
    const sorted = sortTx(filtered);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const pageSlice = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    renderSummary(filtered);
    renderTable(pageSlice);
    renderPagination(total, totalPages);
    renderSortHeaders();
  }

  function renderSummary(filtered) {
    const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amountUSD, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountUSD, 0);
    const net = income - expenses;
    document.getElementById('summaryStrip').innerHTML = `
      <div class="stat-card" style="--bar-color:var(--positive);--icon-bg:var(--positive-bg)">
        <div class="stat-card__accent-bar"></div>
        <div class="stat-card__label">Filtered Income</div>
        <div class="stat-card__value mono">${fmt(income)}</div>
      </div>
      <div class="stat-card" style="--bar-color:var(--negative);--icon-bg:var(--negative-bg)">
        <div class="stat-card__accent-bar"></div>
        <div class="stat-card__label">Filtered Expenses</div>
        <div class="stat-card__value mono">${fmt(expenses)}</div>
      </div>
      <div class="stat-card" style="--bar-color:var(--info);--icon-bg:var(--info-bg)">
        <div class="stat-card__accent-bar"></div>
        <div class="stat-card__label">Net</div>
        <div class="stat-card__value mono ${net >= 0 ? 'amount-pos' : 'amount-neg'}">${fmt(net, { showSign: true })}</div>
      </div>
      <div class="stat-card" style="--bar-color:var(--accent);--icon-bg:var(--positive-bg)">
        <div class="stat-card__accent-bar"></div>
        <div class="stat-card__label">Transactions</div>
        <div class="stat-card__value mono">${filtered.length}</div>
      </div>
    `;
  }

  function renderTable(pageSlice) {
    const tbody = document.getElementById('txBody');
    if (pageSlice.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">${icon('search-x', 'icon-xl')}</div><h3>No transactions found</h3><p>Try adjusting your search or filters.</p></div></td></tr>`;
      refreshIcons();
      return;
    }
    tbody.innerHTML = pageSlice.map(tx => {
      const isExp = tx.type === 'expense';
      const catIcon = CATEGORY_ICONS[tx.category] || 'receipt';
      const displayAmt = convertFromUSD(tx.amountUSD, currency);
      const c = CURRENCIES[currency] || CURRENCIES.USD;
      return `<tr>
        <td>${tx.date}</td>
        <td><span class="badge ${isExp ? 'badge--negative' : 'badge--positive'}">${icon(isExp ? 'arrow-down' : 'arrow-up', 'icon-xs')} ${isExp ? 'Expense' : 'Income'}</span></td>
        <td>${icon(catIcon, 'icon-sm')} ${tx.category}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${tx.note || ''}">${tx.note || '—'}</td>
        <td style="text-align:right;" class="${isExp ? 'amount-neg' : 'amount-pos'}">${isExp ? '-' : '+'}${c.symbol}${Math.abs(displayAmt).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn--ghost btn--sm" onclick="editTx('${tx.id}')" aria-label="Edit transaction">${icon('pencil', 'icon-xs')}</button>
            <button class="btn btn--danger btn--sm" onclick="deleteTxPrompt('${tx.id}')" aria-label="Delete transaction">${icon('trash-2', 'icon-xs')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    refreshIcons();
  }

  function renderPagination(total, totalPages) {
    document.getElementById('paginationInfo').textContent = total === 0 ? 'No results' : `Showing ${((currentPage - 1) * PAGE_SIZE) + 1}–${Math.min(currentPage * PAGE_SIZE, total)} of ${total}`;
    const container = document.getElementById('paginationBtns');
    container.innerHTML = '';
    if (totalPages <= 1) return;
    const addBtn = (label, page, disabled, isCurrent) => {
      const btn = document.createElement('button');
      btn.className = `btn btn--ghost btn--sm${isCurrent ? ' btn--primary' : ''}`;
      btn.textContent = label;
      btn.disabled = disabled;
      btn.setAttribute('aria-label', `Page ${label}`);
      if (isCurrent) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => { currentPage = page; render(); });
      container.appendChild(btn);
    };
    addBtn('‹', currentPage - 1, currentPage === 1, false);
    const range = [];
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) range.push(i);
    range.forEach(p => addBtn(p, p, false, p === currentPage));
    addBtn('›', currentPage + 1, currentPage === totalPages, false);
  }

  function renderSortHeaders() {
    document.querySelectorAll('#txTable thead th[data-col]').forEach(th => {
      const col = th.getAttribute('data-col');
      th.removeAttribute('aria-sort');
      if (col === sortCol) th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
    });
  }

  // ── sortable headers ──
  document.querySelectorAll('#txTable thead th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (!['date', 'category', 'note', 'amountUSD'].includes(col)) return;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = 'asc'; }
      currentPage = 1;
      render();
    });
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); } });
  });

  // ── filter listeners ──
  ['searchInput', 'filterType', 'filterCategory', 'filterMonth'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { currentPage = 1; render(); });
    document.getElementById(id).addEventListener('change', () => { currentPage = 1; render(); });
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterType').value = '';
    filterCategory.value = '';
    filterMonthInput.value = '';
    currentPage = 1;
    render();
  });

  // ── add transaction buttons ──
  document.getElementById('btnAddIncome').addEventListener('click', () => {
    openTxModal('income');
  });
  document.getElementById('btnAddExpense').addEventListener('click', () => {
    openTxModal('expense');
  });

  function openTxModal(type, tx = null) {
    document.getElementById('txModalTitle').textContent = tx ? 'Edit Transaction' : `Add ${type === 'income' ? 'Income' : 'Expense'}`;
    document.getElementById('txId').value = tx ? tx.id : '';
    document.getElementById('txType').value = tx ? tx.type : type;
    updateModalCategories(tx ? tx.type : type);
    document.getElementById('txCategory').value = tx ? tx.category : (type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    document.getElementById('txAmount').value = tx ? convertFromUSD(tx.amountUSD, currency).toFixed(2) : '';
    document.getElementById('txDate').value = tx ? tx.date : new Date().toISOString().slice(0, 10);
    document.getElementById('txNote').value = tx ? (tx.note || '') : '';
    document.getElementById('txRecurring').checked = false;
    document.getElementById('txRecurringOpts').style.display = 'none';
    document.getElementById('txSaveBtn').textContent = tx ? 'Update' : 'Save';
    Modal.open('txModal');
  }

  document.getElementById('txType').addEventListener('change', e => updateModalCategories(e.target.value));
  document.getElementById('txRecurring').addEventListener('change', e => {
    document.getElementById('txRecurringOpts').style.display = e.target.checked ? 'block' : 'none';
  });

  // ── save / update ──
  document.getElementById('txForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('txId').value;
    const type = document.getElementById('txType').value;
    const category = document.getElementById('txCategory').value;
    const amountRaw = parseFloat(document.getElementById('txAmount').value);
    const date = document.getElementById('txDate').value;
    const note = document.getElementById('txNote').value.trim();
    const recurring = document.getElementById('txRecurring').checked;
    const frequency = document.getElementById('txFrequency').value;

    if (!category || isNaN(amountRaw) || amountRaw <= 0 || !date) {
      Toast.error('Fill in all required fields.');
      return;
    }
    const amountUSD = convertToUSD(amountRaw, currency);

    if (id) {
      DB.updateTransaction(id, { type, category, amountUSD, date, note });
      Toast.success('Transaction updated.');
    } else {
      if (recurring) {
        const nextDate = new Date(date);
        if (frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else nextDate.setDate(nextDate.getDate() + 7);
        DB.addRecurring({ userId: user.id, type, category, amountUSD, note, frequency, nextDate: nextDate.toISOString().slice(0, 10) });
      }
      DB.addTransaction({ userId: user.id, type, category, amountUSD, date, note });
      Toast.success('Transaction added.');
    }
    if (window.AchievementsEngine) AchievementsEngine.check(user.id);
    allTx = DB.getTransactions(user.id);
    Modal.close('txModal');
    render();
  });

  // ── edit / delete globals (called from table row buttons) ──
  window.editTx = (id) => {
    const tx = allTx.find(t => t.id === id);
    if (tx) openTxModal(tx.type, tx);
  };

  window.deleteTxPrompt = (id) => {
    pendingDeleteId = id;
    Modal.open('deleteModal');
  };

  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (!pendingDeleteId) return;
    DB.deleteTransaction(pendingDeleteId);
    allTx = DB.getTransactions(user.id);
    pendingDeleteId = null;
    Modal.close('deleteModal');
    Toast.success('Transaction deleted.');
    render();
  });

  render();
})();

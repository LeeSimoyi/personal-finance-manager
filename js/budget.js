/**
 * budget.js
 * Manages: overall monthly budget, per-category budgets, savings goals,
 * recurring transactions. Full CRUD for each.
 */

(function () {
  'use strict';

  initApp('budgets.html');
  const user = Auth.user;
  if (!user) return;

  const currency = Auth.prefs.currency || 'USD';
  document.getElementById('currencyLabel').textContent = currency;

  let pendingDelete = null; // { type, id }

  // ── Tab navigation ──
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function openTab(targetId) {
    tabs.forEach(t => { t.classList.toggle('is-active', t.getAttribute('aria-controls') === targetId); t.setAttribute('aria-selected', t.getAttribute('aria-controls') === targetId ? 'true' : 'false'); });
    panels.forEach(p => p.classList.toggle('is-active', p.id === targetId));
  }

  tabs.forEach(t => t.addEventListener('click', () => openTab(t.getAttribute('aria-controls'))));

  // Deep link from dashboard
  if (window.location.hash === '#goals') openTab('tab-goals');

  // ────────────────────────────────────────────────────────────────────────────
  // MONTHLY BUDGET
  // ────────────────────────────────────────────────────────────────────────────

  function loadMonthlyBudget() {
    const budget = DB.getBudget(user.id);
    const form = document.getElementById('monthlyBudgetForm');
    if (budget) {
      document.getElementById('monthlyLimit').value = convertFromUSD(budget.monthlyLimitUSD, currency).toFixed(2);
    }

    const now = new Date();
    const txMonth = DB.getTransactions(user.id).filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const expenses = txMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountUSD, 0);
    const statusEl = document.getElementById('monthlyBudgetStatus');

    if (!budget) {
      statusEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('wallet', 'icon-xl')}</div><h3>No budget set</h3><p>Set a monthly spending limit on the left.</p></div>`;
      refreshIcons();
      return;
    }

    const pct = Math.min(100, (expenses / budget.monthlyLimitUSD) * 100);
    const remaining = budget.monthlyLimitUSD - expenses;
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';

    statusEl.innerHTML = `
      <h3 style="font-size:var(--fs-md);margin-bottom:var(--space-4);">This month's status</h3>
      <div class="budget-item">
        <div class="budget-item__row">
          <span class="budget-item__cat">${icon('credit-card', 'icon-sm')} Spent</span>
          <span class="budget-item__amounts">${fmt(expenses)} / ${fmt(budget.monthlyLimitUSD)}</span>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill ${cls}" style="width:${pct}%"></div></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:var(--space-3);font-size:var(--fs-sm);">
        <span>${pct.toFixed(0)}% used</span>
        <span class="${remaining < 0 ? 'amount-neg' : 'amount-pos'}">${remaining < 0 ? 'Over by' : 'Remaining:'} ${fmt(Math.abs(remaining))}</span>
      </div>
      ${pct >= 80 ? `<div class="badge ${pct >= 100 ? 'badge--negative' : 'badge--accent'}" style="margin-top:var(--space-3);">${icon(pct >= 100 ? 'alert-octagon' : 'alert-triangle', 'icon-xs')} ${pct >= 100 ? 'Budget exceeded!' : 'Nearing limit'}</div>` : ''}
    `;
    refreshIcons();
  }

  document.getElementById('monthlyBudgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const raw = parseFloat(document.getElementById('monthlyLimit').value);
    if (isNaN(raw) || raw <= 0) { Toast.error('Enter a valid amount.'); return; }
    DB.setBudget(user.id, convertToUSD(raw, currency));
    Toast.success('Monthly budget saved.');
    loadMonthlyBudget();
  });

  loadMonthlyBudget();

  // ────────────────────────────────────────────────────────────────────────────
  // CATEGORY BUDGETS
  // ────────────────────────────────────────────────────────────────────────────

  function loadCatBudgets() {
    const catBudgets = DB.getCategoryBudgets(user.id);
    const now = new Date();
    const txMonth = DB.getTransactions(user.id).filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.type === 'expense';
    });

    const grid = document.getElementById('catBudgetGrid');
    if (catBudgets.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon">${icon('layout-grid', 'icon-xl')}</div><h3>No category budgets</h3><p>Add budgets per category for detailed tracking.</p></div>`;
      refreshIcons();
      return;
    }

    grid.innerHTML = catBudgets.map(cb => {
      const spent = txMonth.filter(t => t.category === cb.category).reduce((s, t) => s + t.amountUSD, 0);
      const pct = Math.min(100, (spent / cb.monthlyLimitUSD) * 100);
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
      const catIcon = CATEGORY_ICONS[cb.category] || 'receipt';
      return `<div class="card card--ribbon" style="--ribbon:${pct >= 100 ? 'var(--negative)' : pct >= 80 ? '#D4A017' : 'var(--positive)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3);">
          <div>
            <div class="cat-icon-circle">${icon(catIcon, 'icon-md')}</div>
            <div style="font-weight:700;margin-top:var(--space-2);">${cb.category}</div>
          </div>
          <div style="display:flex;gap:var(--space-2);">
            <button class="btn btn--ghost btn--sm" onclick="editCatBudget('${cb.id}')" aria-label="Edit">${icon('pencil', 'icon-xs')}</button>
            <button class="btn btn--danger btn--sm" onclick="deleteCatBudgetPrompt('${cb.id}')" aria-label="Delete">${icon('trash-2', 'icon-xs')}</button>
          </div>
        </div>
        <div class="progress-bar" style="margin-bottom:var(--space-2);"><div class="progress-bar__fill ${cls}" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--ink-soft);">
          <span>${fmt(spent)} spent</span>
          <span>${fmt(cb.monthlyLimitUSD)} limit</span>
        </div>
        ${pct >= 100 ? `<div class="badge badge--negative" style="margin-top:var(--space-2);">Over budget!</div>` : ''}
      </div>`;
    }).join('');
    refreshIcons();
  }

  // Populate category selects
  function populateCatSelect(selectId, type) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = '';
    EXPENSE_CATEGORIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  populateCatSelect('catBudgetCategory', 'expense');

  document.getElementById('btnAddCatBudget').addEventListener('click', () => {
    document.getElementById('catBudgetId').value = '';
    document.getElementById('catBudgetCategory').value = EXPENSE_CATEGORIES[0];
    document.getElementById('catBudgetLimit').value = '';
    Modal.open('catBudgetModal');
  });

  document.getElementById('catBudgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const category = document.getElementById('catBudgetCategory').value;
    const raw = parseFloat(document.getElementById('catBudgetLimit').value);
    if (!category || isNaN(raw) || raw <= 0) { Toast.error('Enter a valid limit.'); return; }
    DB.setCategoryBudget(user.id, category, convertToUSD(raw, currency));
    Toast.success('Category budget saved.');
    Modal.close('catBudgetModal');
    loadCatBudgets();
  });

  window.editCatBudget = (id) => {
    const cb = DB.getCategoryBudgets(user.id).find(b => b.id === id);
    if (!cb) return;
    document.getElementById('catBudgetId').value = cb.id;
    document.getElementById('catBudgetCategory').value = cb.category;
    document.getElementById('catBudgetLimit').value = convertFromUSD(cb.monthlyLimitUSD, currency).toFixed(2);
    Modal.open('catBudgetModal');
  };

  window.deleteCatBudgetPrompt = (id) => {
    pendingDelete = { type: 'catBudget', id };
    document.getElementById('deleteConfirmMsg').textContent = 'Delete this category budget? This cannot be undone.';
    Modal.open('deleteModal');
  };

  loadCatBudgets();

  // ────────────────────────────────────────────────────────────────────────────
  // SAVINGS GOALS
  // ────────────────────────────────────────────────────────────────────────────

  function loadGoals() {
    const goals = DB.getGoals(user.id);
    const grid = document.getElementById('goalsGrid');
    if (goals.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon">${icon('target', 'icon-xl')}</div><h3>No goals yet</h3><p>Set a target amount and deadline for anything you're saving toward.</p></div>`;
      refreshIcons();
      return;
    }
    grid.innerHTML = goals.map(g => {
      const pct = Math.min(100, g.targetUSD > 0 ? (g.currentUSD / g.targetUSD) * 100 : 0);
      const remaining = g.targetUSD - g.currentUSD;
      const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;
      const done = pct >= 100;
      return `<div class="goal-card">
        <div class="goal-card__head">
          <span class="goal-card__name">${g.name}${done ? ` ${icon('badge-check', 'icon-sm')}` : ''}</span>
          <span class="goal-card__pct">${pct.toFixed(0)}%</span>
        </div>
        <div class="progress-bar" style="margin-bottom:var(--space-2);">
          <div class="progress-bar__fill" style="width:${pct}%;--fill-color:${done ? 'var(--positive)' : 'var(--accent)'}"></div>
        </div>
        <div class="goal-card__amounts">
          <span>${fmt(g.currentUSD)} saved</span>
          <span>${fmt(g.targetUSD)} target</span>
        </div>
        ${remaining > 0 ? `<div style="font-size:var(--fs-xs);color:var(--ink-faint);margin-top:var(--space-1);">${fmt(remaining)} to go</div>` : ''}
        ${deadline ? `<div class="goal-card__deadline">${icon('calendar', 'icon-xs')} ${deadline}</div>` : ''}
        <div class="goal-card__actions">
          <button class="btn btn--ghost btn--sm" onclick="editGoal('${g.id}')">Edit</button>
          <button class="btn btn--ghost btn--sm" onclick="depositGoal('${g.id}')">+ Deposit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteGoalPrompt('${g.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');
    refreshIcons();
  }

  document.getElementById('btnAddGoal').addEventListener('click', () => {
    document.getElementById('goalId').value = '';
    document.getElementById('goalName').value = '';
    document.getElementById('goalTarget').value = '';
    document.getElementById('goalCurrent').value = '';
    document.getElementById('goalDeadline').value = '';
    document.getElementById('goalModalTitle').textContent = 'New Savings Goal';
    Modal.open('goalModal');
  });

  document.getElementById('goalForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('goalId').value;
    const name = document.getElementById('goalName').value.trim();
    const targetRaw = parseFloat(document.getElementById('goalTarget').value);
    const currentRaw = parseFloat(document.getElementById('goalCurrent').value) || 0;
    const deadline = document.getElementById('goalDeadline').value;

    if (!name || isNaN(targetRaw) || targetRaw <= 0) { Toast.error('Enter a valid goal name and target.'); return; }

    const patch = {
      name,
      targetUSD: convertToUSD(targetRaw, currency),
      currentUSD: convertToUSD(currentRaw, currency),
      deadline: deadline || null,
    };

    if (id) {
      DB.updateGoal(id, patch);
      Toast.success('Goal updated.');
    } else {
      DB.addGoal({ userId: user.id, ...patch });
      Toast.success('Goal created!');
    }
    Modal.close('goalModal');
    loadGoals();
  });

  window.editGoal = (id) => {
    const g = DB.getGoals(user.id).find(g => g.id === id);
    if (!g) return;
    document.getElementById('goalId').value = g.id;
    document.getElementById('goalName').value = g.name;
    document.getElementById('goalTarget').value = convertFromUSD(g.targetUSD, currency).toFixed(2);
    document.getElementById('goalCurrent').value = convertFromUSD(g.currentUSD, currency).toFixed(2);
    document.getElementById('goalDeadline').value = g.deadline || '';
    document.getElementById('goalModalTitle').textContent = 'Edit Goal';
    Modal.open('goalModal');
  };

  window.depositGoal = (id) => {
    const amount = parseFloat(prompt('Deposit amount:'));
    if (isNaN(amount) || amount <= 0) return;
    const g = DB.getGoals(user.id).find(g => g.id === id);
    DB.updateGoal(id, { currentUSD: g.currentUSD + convertToUSD(amount, currency) });
    Toast.success(`${fmt(convertToUSD(amount, currency))} deposited to goal.`);
    loadGoals();
  };

  window.deleteGoalPrompt = (id) => {
    pendingDelete = { type: 'goal', id };
    document.getElementById('deleteConfirmMsg').textContent = 'Delete this savings goal? This cannot be undone.';
    Modal.open('deleteModal');
  };

  loadGoals();

  // ────────────────────────────────────────────────────────────────────────────
  // RECURRING TRANSACTIONS
  // ────────────────────────────────────────────────────────────────────────────

  function updateRecurringCatSelect() {
    const type = document.getElementById('recType').value;
    const sel = document.getElementById('recCategory');
    sel.innerHTML = '';
    (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  document.getElementById('recType').addEventListener('change', updateRecurringCatSelect);
  updateRecurringCatSelect();

  function loadRecurring() {
    const recs = DB.getRecurring(user.id);
    const tbody = document.getElementById('recurringBody');
    if (recs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state__icon">${icon('repeat', 'icon-xl')}</div><h3>No recurring transactions</h3><p>Add recurring income or expenses like salary and rent.</p></div></td></tr>`;
      refreshIcons();
      return;
    }
    tbody.innerHTML = recs.map(r => {
      const catIcon = CATEGORY_ICONS[r.category] || 'receipt';
      return `<tr>
        <td><span class="badge ${r.type === 'income' ? 'badge--positive' : 'badge--negative'}">${r.type}</span></td>
        <td>${icon(catIcon, 'icon-sm')} ${r.category}</td>
        <td class="${r.type === 'income' ? 'amount-pos' : 'amount-neg'}">${fmt(r.amountUSD)}</td>
        <td style="text-transform:capitalize;">${r.frequency}</td>
        <td>${r.nextDate}</td>
        <td><span class="badge ${r.active ? 'badge--positive' : 'badge--info'}">${r.active ? 'Active' : 'Paused'}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn--ghost btn--sm" onclick="toggleRecurring('${r.id}','${r.active}')">${r.active ? 'Pause' : 'Resume'}</button>
            <button class="btn btn--ghost btn--sm" onclick="editRecurring('${r.id}')" aria-label="Edit">${icon('pencil', 'icon-xs')}</button>
            <button class="btn btn--danger btn--sm" onclick="deleteRecurringPrompt('${r.id}')" aria-label="Delete">${icon('trash-2', 'icon-xs')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    refreshIcons();
  }

  document.getElementById('btnAddRecurring').addEventListener('click', () => {
    document.getElementById('recurringId').value = '';
    document.getElementById('recType').value = 'income';
    updateRecurringCatSelect();
    document.getElementById('recAmount').value = '';
    document.getElementById('recFrequency').value = 'monthly';
    document.getElementById('recNextDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('recNote').value = '';
    Modal.open('recurringModal');
  });

  document.getElementById('recurringForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('recurringId').value;
    const type = document.getElementById('recType').value;
    const category = document.getElementById('recCategory').value;
    const amountRaw = parseFloat(document.getElementById('recAmount').value);
    const frequency = document.getElementById('recFrequency').value;
    const nextDate = document.getElementById('recNextDate').value;
    const note = document.getElementById('recNote').value.trim();

    if (!category || isNaN(amountRaw) || amountRaw <= 0 || !nextDate) { Toast.error('Fill in all required fields.'); return; }
    const amountUSD = convertToUSD(amountRaw, currency);

    if (id) {
      DB.updateRecurring(id, { type, category, amountUSD, frequency, nextDate, note });
      Toast.success('Recurring transaction updated.');
    } else {
      DB.addRecurring({ userId: user.id, type, category, amountUSD, frequency, nextDate, note });
      Toast.success('Recurring transaction added.');
    }
    Modal.close('recurringModal');
    loadRecurring();
  });

  window.editRecurring = (id) => {
    const r = DB.getRecurring(user.id).find(r => r.id === id);
    if (!r) return;
    document.getElementById('recurringId').value = r.id;
    document.getElementById('recType').value = r.type;
    updateRecurringCatSelect();
    document.getElementById('recCategory').value = r.category;
    document.getElementById('recAmount').value = convertFromUSD(r.amountUSD, currency).toFixed(2);
    document.getElementById('recFrequency').value = r.frequency;
    document.getElementById('recNextDate').value = r.nextDate;
    document.getElementById('recNote').value = r.note || '';
    Modal.open('recurringModal');
  };

  window.toggleRecurring = (id, active) => {
    DB.updateRecurring(id, { active: active === 'true' ? false : true });
    Toast.info('Recurring transaction updated.');
    loadRecurring();
  };

  window.deleteRecurringPrompt = (id) => {
    pendingDelete = { type: 'recurring', id };
    document.getElementById('deleteConfirmMsg').textContent = 'Delete this recurring transaction? This cannot be undone.';
    Modal.open('deleteModal');
  };

  loadRecurring();

  // ── Shared delete confirm ──
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === 'catBudget') { DB.deleteCategoryBudget(id); loadCatBudgets(); }
    else if (type === 'goal') { DB.deleteGoal(id); loadGoals(); }
    else if (type === 'recurring') { DB.deleteRecurring(id); loadRecurring(); }
    pendingDelete = null;
    Modal.close('deleteModal');
    Toast.success('Deleted successfully.');
  });

})();

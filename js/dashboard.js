/**
 * dashboard.js
 * Main dashboard controller: renders net worth hero, KPI strip, Chart.js
 * charts, budget progress, smart insights, recent transactions, and goals.
 */

(function () {
  'use strict';

  initApp('dashboard.html');
  const user = Auth.user;
  const prefs = Auth.prefs;
  if (!user) return;

  const currency = prefs.currency || 'USD';

  /* -------- greeting -------- */
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greetWord}, ${user.name.split(' ')[0]}`;
  document.getElementById('dateDisplay').textContent = new Date().toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  /* -------- data helpers -------- */

  const txAll = DB.getTransactions(user.id);
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  function txInMonth(y, m) {
    return txAll.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  const currMonthTx = txInMonth(thisYear, thisMonth);
  const lastMonthTx = txInMonth(thisYear, thisMonth - 1 < 0 ? 11 : thisMonth - 1);

  function sumType(txList, type) {
    return txList.filter(t => t.type === type).reduce((s, t) => s + t.amountUSD, 0);
  }

  const income = sumType(currMonthTx, 'income');
  const expenses = sumType(currMonthTx, 'expense');
  const savings = income - expenses;

  const lastIncome = sumType(lastMonthTx, 'income');
  const lastExpenses = sumType(lastMonthTx, 'expense');

  const allIncome = sumType(txAll, 'income');
  const allExpenses = sumType(txAll, 'expense');
  const netWorth = allIncome - allExpenses;

  /* -------- hero card -------- */
  document.getElementById('heroNetWorth').textContent = fmt(netWorth);

  const nwChange = ((netWorth - (netWorth - savings)) / Math.max(1, Math.abs(netWorth - savings)) * 100).toFixed(1);
  document.getElementById('heroChange').innerHTML = `
    This month: <span class="${savings >= 0 ? 'positive' : 'negative'}">${fmt(savings, { showSign: true })}</span>
    &nbsp;·&nbsp; Savings rate: <span>${income > 0 ? ((savings / income) * 100).toFixed(0) : 0}%</span>
  `;

  document.getElementById('heroSubGrid').innerHTML = `
    <div class="hero-sub-stat">
      <div class="hero-sub-stat__label">Monthly Income</div>
      <div class="hero-sub-stat__value pos">${fmt(income)}</div>
    </div>
    <div class="hero-sub-stat">
      <div class="hero-sub-stat__label">Monthly Expenses</div>
      <div class="hero-sub-stat__value neg">${fmt(expenses)}</div>
    </div>
    <div class="hero-sub-stat">
      <div class="hero-sub-stat__label">Net Savings</div>
      <div class="hero-sub-stat__value ${savings >= 0 ? 'pos' : 'neg'}">${fmt(savings, { showSign: true })}</div>
    </div>
    <div class="hero-sub-stat">
      <div class="hero-sub-stat__label">Total Transactions</div>
      <div class="hero-sub-stat__value">${txAll.length}</div>
    </div>
  `;

  /* -------- KPI cards -------- */
  function kpiCard({ iconName, iconBg, barColor, label, value, trend, trendDir }) {
    return `<div class="stat-card" style="--bar-color:${barColor};--icon-bg:${iconBg}">
      <div class="stat-card__accent-bar"></div>
      <div class="stat-card__icon">${icon(iconName, 'icon-md')}</div>
      <div class="stat-card__label">${label}</div>
      <div class="stat-card__value mono">${value}</div>
      <div class="stat-card__trend ${trendDir}">${trend}</div>
    </div>`;
  }

  const incomeChange = lastIncome > 0 ? (((income - lastIncome) / lastIncome) * 100).toFixed(1) : '—';
  const expenseChange = lastExpenses > 0 ? (((expenses - lastExpenses) / lastExpenses) * 100).toFixed(1) : '—';
  const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(0) : 0;
  const budget = DB.getBudget(user.id);
  const budgetUsed = budget ? ((expenses / budget.monthlyLimitUSD) * 100).toFixed(0) : null;

  document.getElementById('kpiGrid').innerHTML = [
    kpiCard({ iconName:'wallet', iconBg:'var(--positive-bg)', barColor:'var(--positive)', label:'Monthly Income', value: fmt(income), trend: incomeChange !== '—' ? `${incomeChange > 0 ? '▲' : '▼'} ${Math.abs(incomeChange)}% vs last month` : 'First month', trendDir: incomeChange > 0 ? 'trend-up' : 'trend-down' }),
    kpiCard({ iconName:'credit-card', iconBg:'var(--negative-bg)', barColor:'var(--negative)', label:'Monthly Expenses', value: fmt(expenses), trend: expenseChange !== '—' ? `${expenseChange > 0 ? '▲' : '▼'} ${Math.abs(expenseChange)}% vs last month` : 'First month', trendDir: expenseChange > 0 ? 'trend-down' : 'trend-up' }),
    kpiCard({ iconName:'piggy-bank', iconBg:'var(--info-bg)', barColor:'var(--info)', label:'Net Savings', value: fmt(savings, { showSign: true }), trend: `${savingsRate}% savings rate`, trendDir: savings >= 0 ? 'trend-up' : 'trend-down' }),
    kpiCard({ iconName:'pie-chart', iconBg:'var(--positive-bg)', barColor:'var(--accent)', label:'Budget Used', value: budgetUsed !== null ? `${budgetUsed}%` : 'Not set', trend: budgetUsed !== null ? `${fmt(expenses)} of ${fmt(budget.monthlyLimitUSD)}` : 'Set a budget →', trendDir: budgetUsed > 80 ? 'trend-down' : 'trend-up' }),
  ].join('');
  refreshIcons();

  /* -------- Chart.js palette -------- */

  const PALETTE = ['#BDF75C','#5B6EF5','#E0455A','#3DDC97','#FFB648','#7C8CF8','#4FC3E8','#C792EA','#F76C9D','#9FE63A'];
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  function chartDefaults() {
    return {
      color: isDark() ? '#A9B4C0' : '#5B6470',
      borderColor: isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(7,23,36,0.08)',
    };
  }

  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.animation = { duration: 700, easing: 'easeInOutQuart' };

  /* expense pie */
  const expByCat = {};
  currMonthTx.filter(t => t.type === 'expense').forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + t.amountUSD;
  });
  const expCats = Object.keys(expByCat);

  new Chart(document.getElementById('expensePieChart'), {
    type: 'doughnut',
    data: {
      labels: expCats.length ? expCats : ['No data'],
      datasets: [{
        data: expCats.length ? expCats.map(c => expByCat[c]) : [1],
        backgroundColor: PALETTE.slice(0, Math.max(expCats.length, 1)),
        borderWidth: 2,
        borderColor: isDark() ? '#13212F' : '#fff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: chartDefaults().color, boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } },
      },
    },
  });

  /* income vs expense bar (6 months) */
  const months6 = [];
  const inc6 = []; const exp6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    months6.push(d.toLocaleString('default', { month: 'short' }));
    const tx = txInMonth(d.getFullYear(), d.getMonth());
    inc6.push(sumType(tx, 'income'));
    exp6.push(sumType(tx, 'expense'));
  }

  new Chart(document.getElementById('incomeExpenseBar'), {
    type: 'bar',
    data: {
      labels: months6,
      datasets: [
        { label: 'Income', data: inc6, backgroundColor: 'rgba(159,230,58,0.85)', borderRadius: 4 },
        { label: 'Expenses', data: exp6, backgroundColor: 'rgba(224,69,90,0.75)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { color: chartDefaults().borderColor }, ticks: { color: chartDefaults().color } },
        y: { grid: { color: chartDefaults().borderColor }, ticks: { color: chartDefaults().color, callback: v => fmt(v) } },
      },
      plugins: {
        legend: { labels: { color: chartDefaults().color } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
    },
  });

  /* -------- budget status -------- */
  const catBudgets = DB.getCategoryBudgets(user.id);
  const budgetStatusList = document.getElementById('budgetStatusList');

  if (catBudgets.length === 0 && !budget) {
    budgetStatusList.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('clipboard-list', 'icon-xl')}</div><h3>No budgets set</h3><p><a href="budgets.html" class="btn btn--ghost btn--sm" style="margin-top:var(--space-3);">Set up budgets</a></p></div>`;
  } else {
    let html = '';
    if (budget) {
      const pct = Math.min(100, (expenses / budget.monthlyLimitUSD) * 100);
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
      html += `<div class="budget-item">
        <div class="budget-item__row">
          <span class="budget-item__cat">${icon('briefcase', 'icon-sm')} Overall Monthly Budget</span>
          <span class="budget-item__amounts">${fmt(expenses)} / ${fmt(budget.monthlyLimitUSD)}</span>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
    }
    catBudgets.forEach(cb => {
      const spent = currMonthTx.filter(t => t.type === 'expense' && t.category === cb.category).reduce((s, t) => s + t.amountUSD, 0);
      const pct = Math.min(100, (spent / cb.monthlyLimitUSD) * 100);
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
      const catIcon = CATEGORY_ICONS[cb.category] || 'receipt';
      html += `<div class="budget-item">
        <div class="budget-item__row">
          <span class="budget-item__cat">${icon(catIcon, 'icon-sm')} ${cb.category}</span>
          <span class="budget-item__amounts">${fmt(spent)} / ${fmt(cb.monthlyLimitUSD)}</span>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
    });
    budgetStatusList.innerHTML = html;
  }
  refreshIcons();

  /* -------- smart insights -------- */
  const insightsList = document.getElementById('insightsList');
  const insights = generateInsights(currMonthTx, lastMonthTx, income, expenses, savings, budget, catBudgets);
  insightsList.innerHTML = insights.map(ins => `
    <div class="insight-card" style="--insight-color:${ins.color}">
      <div class="insight-card__icon">${icon(ins.icon, 'icon-md')}</div>
      <div>
        <div class="insight-card__title">${ins.title}</div>
        <div class="insight-card__body">${ins.body}</div>
      </div>
    </div>
  `).join('') || `<div class="empty-state"><div class="empty-state__icon">${icon('lightbulb', 'icon-xl')}</div><h3>No insights yet</h3><p>Add transactions to get personalised insights.</p></div>`;
  refreshIcons();

  function generateInsights(curr, last, inc, exp, sav, bdg, catBdgs) {
    const results = [];
    const savingsRate = inc > 0 ? (sav / inc) * 100 : 0;

    // Savings rate
    if (inc > 0) {
      if (savingsRate >= 20) results.push({ icon: 'target', color: 'var(--positive)', title: 'Healthy savings rate', body: `You're saving ${savingsRate.toFixed(0)}% of your income this month. Well above the 20% benchmark.` });
      else if (savingsRate > 0) results.push({ icon: 'trending-up', color: 'var(--accent)', title: 'Room to grow your savings', body: `You saved ${savingsRate.toFixed(0)}% this month. The 50/30/20 rule targets at least 20% — try to reduce discretionary spend.` });
      else results.push({ icon: 'alert-triangle', color: 'var(--negative)', title: 'Expenses exceed income', body: `You spent ${fmt(Math.abs(sav))} more than you earned this month. Review your expense categories.` });
    }

    // Top expense category
    const expByCat = {};
    curr.filter(t => t.type === 'expense').forEach(t => { expByCat[t.category] = (expByCat[t.category] || 0) + t.amountUSD; });
    const topCat = Object.entries(expByCat).sort((a, b) => b[1] - a[1])[0];
    if (topCat) results.push({ icon: 'search', color: 'var(--info)', title: `Top expense: ${topCat[0]}`, body: `${topCat[0]} accounted for ${fmt(topCat[1])} (${inc > 0 ? ((topCat[1] / inc) * 100).toFixed(0) : '—'}% of income).` });

    // Month-on-month food comparison
    const foodThis = curr.filter(t => t.type === 'expense' && t.category === 'Food').reduce((s, t) => s + t.amountUSD, 0);
    const foodLast = last.filter(t => t.type === 'expense' && t.category === 'Food').reduce((s, t) => s + t.amountUSD, 0);
    if (foodLast > 0 && foodThis > 0) {
      const diff = ((foodThis - foodLast) / foodLast) * 100;
      if (Math.abs(diff) > 10) {
        results.push({ icon: 'utensils', color: diff > 0 ? 'var(--accent)' : 'var(--positive)', title: `Food spend ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff).toFixed(0)}%`, body: `Your food expenses ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(diff).toFixed(0)}% compared to last month (${fmt(foodThis)} vs ${fmt(foodLast)}).` });
      }
    }

    // Budget health
    if (bdg) {
      const pct = (exp / bdg.monthlyLimitUSD) * 100;
      if (pct >= 100) results.push({ icon: 'alert-octagon', color: 'var(--negative)', title: 'Monthly budget exceeded', body: `You've spent ${fmt(exp - bdg.monthlyLimitUSD)} over your ${fmt(bdg.monthlyLimitUSD)} monthly budget.` });
      else if (pct >= 80) results.push({ icon: 'zap', color: 'var(--accent)', title: `${pct.toFixed(0)}% of budget used`, body: `Only ${fmt(bdg.monthlyLimitUSD - exp)} remains in your monthly budget. Proceed carefully.` });
    }

    // Overspent categories
    catBdgs.forEach(cb => {
      const spent = curr.filter(t => t.type === 'expense' && t.category === cb.category).reduce((s, t) => s + t.amountUSD, 0);
      if (spent > cb.monthlyLimitUSD) {
        results.push({ icon: 'circle-alert', color: 'var(--negative)', title: `${cb.category} budget exceeded`, body: `${fmt(spent - cb.monthlyLimitUSD)} over your ${fmt(cb.monthlyLimitUSD)} ${cb.category} budget.` });
      }
    });

    return results.slice(0, 4);
  }

  /* -------- recent transactions -------- */
  const recentTxList = document.getElementById('recentTxList');
  const recent = [...txAll].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7);

  if (recent.length === 0) {
    recentTxList.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('inbox', 'icon-xl')}</div><h3>No transactions yet</h3><p>Use the buttons above to add your first income or expense.</p></div>`;
  } else {
    recentTxList.innerHTML = recent.map(tx => {
      const isExp = tx.type === 'expense';
      const catIcon = CATEGORY_ICONS[tx.category] || 'receipt';
      const bg = isExp ? 'var(--negative-bg)' : 'var(--positive-bg)';
      return `<div class="tx-mini-item">
        <div class="tx-mini__icon" style="--icon-bg:${bg}">${icon(catIcon, 'icon-sm')}</div>
        <div class="tx-mini__info">
          <div class="tx-mini__cat">${tx.category}</div>
          <div class="tx-mini__note">${tx.note || '—'}</div>
        </div>
        <div class="tx-mini__right">
          <div class="tx-mini__amount ${isExp ? 'amount-neg' : 'amount-pos'}">${isExp ? '-' : '+'}${fmt(tx.amountUSD)}</div>
          <div class="tx-mini__date">${tx.date}</div>
        </div>
      </div>`;
    }).join('');
  }
  refreshIcons();

  /* -------- health score widget -------- */
  (function renderHealthWidget() {
    const score = DB.calculateHealthScore(user.id);
    const ring = document.getElementById('dashHealthRing');
    const num  = document.getElementById('dashHealthNum');
    const grade= document.getElementById('dashHealthGrade');
    if (!ring || !num || !grade) return;
    const C = 2 * Math.PI * 50;
    ring.style.stroke = score.color;
    ring.style.strokeDashoffset = C - (score.total / 100) * C;
    num.textContent = score.total;
    num.style.color = score.color;
    grade.textContent = score.grade;
    grade.style.color = score.color;
  })();
  const goalsList = document.getElementById('goalsList');
  const goals = DB.getGoals(user.id);

  if (goals.length === 0) {
    goalsList.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon">${icon('target', 'icon-xl')}</div><h3>No goals yet</h3><p><a href="budgets.html#goals" style="color:var(--info);font-weight:600;">Create your first goal →</a></p></div>`;
  } else {
    goalsList.innerHTML = goals.map(g => {
      const pct = Math.min(100, g.targetUSD > 0 ? (g.currentUSD / g.targetUSD) * 100 : 0);
      const remaining = g.targetUSD - g.currentUSD;
      const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No deadline';
      return `<div class="goal-card">
        <div class="goal-card__head">
          <span class="goal-card__name">${g.name}</span>
          <span class="goal-card__pct">${pct.toFixed(0)}%</span>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%;--fill-color:${pct === 100 ? 'var(--positive)' : 'var(--accent)'}"></div></div>
        <div class="goal-card__amounts">
          <span>${fmt(g.currentUSD)} saved</span>
          <span>${fmt(remaining)} remaining</span>
        </div>
        <div class="goal-card__deadline">${icon('calendar', 'icon-xs')} Target: ${deadline}</div>
      </div>`;
    }).join('');
  }
  refreshIcons();
  if (window.AchievementsEngine) AchievementsEngine.check(user.id);

  /* -------- add transaction modals -------- */

  function populateCategorySelects() {
    const inCat = document.getElementById('inCategory');
    const exCat = document.getElementById('exCategory');
    INCOME_CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; inCat.appendChild(o); });
    EXPENSE_CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; exCat.appendChild(o); });
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('inDate').value = today;
    document.getElementById('exDate').value = today;
  }

  populateCategorySelects();

  document.getElementById('btnAddIncome').addEventListener('click', () => Modal.open('addIncomeModal'));
  document.getElementById('btnAddExpense').addEventListener('click', () => Modal.open('addExpenseModal'));

  document.getElementById('inRecurring').addEventListener('change', e => {
    document.getElementById('inRecurringOpts').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('exRecurring').addEventListener('change', e => {
    document.getElementById('exRecurringOpts').style.display = e.target.checked ? 'block' : 'none';
  });

  function saveTransaction(type, categoryId, amountId, dateId, noteId, recurringCheckId, frequencyId, modalId) {
    const category = document.getElementById(categoryId).value;
    const amountRaw = parseFloat(document.getElementById(amountId).value);
    const date = document.getElementById(dateId).value;
    const note = document.getElementById(noteId).value.trim();
    const recurring = document.getElementById(recurringCheckId).checked;
    const frequency = document.getElementById(frequencyId).value;

    if (!category || isNaN(amountRaw) || amountRaw <= 0 || !date) {
      Toast.error('Please fill in all required fields with valid values.');
      return;
    }

    const amountUSD = convertToUSD(amountRaw, currency);

    if (recurring) {
      const nextDate = new Date(date);
      if (frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else nextDate.setDate(nextDate.getDate() + 7);
      DB.addRecurring({ userId: user.id, type, category, amountUSD, note, frequency, nextDate: nextDate.toISOString().slice(0, 10) });
    }

    DB.addTransaction({ userId: user.id, type, category, amountUSD, date, note });
    Modal.close(modalId);
    Toast.success(`${type === 'income' ? 'Income' : 'Expense'} added successfully.`);
    setTimeout(() => location.reload(), 800);
  }

  document.getElementById('incomeForm').addEventListener('submit', e => {
    e.preventDefault();
    saveTransaction('income', 'inCategory', 'inAmount', 'inDate', 'inNote', 'inRecurring', 'inFrequency', 'addIncomeModal');
  });

  document.getElementById('expenseForm').addEventListener('submit', e => {
    e.preventDefault();
    saveTransaction('expense', 'exCategory', 'exAmount', 'exDate', 'exNote', 'exRecurring', 'exFrequency', 'addExpenseModal');
  });

})();

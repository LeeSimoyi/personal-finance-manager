/**
 * reports.js
 * Wires the reports page: period selector drives all charts, KPI strip,
 * summary table, and insights. Export handlers for CSV, JSON, and print.
 */

(function () {
  'use strict';

  initApp('reports.html');
  const user = Auth.user;
  if (!user) return;

  const txAll = DB.getTransactions(user.id);
  const periodSel = document.getElementById('reportPeriod');

  /* ── full render pipeline ── */

  function renderAll(period) {
    const txFiltered = Analytics.filterByPeriod(txAll, period);
    const income = Analytics.sumType(txFiltered, 'income');
    const expenses = Analytics.sumType(txFiltered, 'expense');
    const savings = income - expenses;
    const txCount = txFiltered.length;

    /* KPI strip */
    document.getElementById('reportKPI').innerHTML = [
      { iconName: 'wallet', bg: 'var(--positive-bg)', bar: 'var(--positive)', label: 'Total Income', value: fmt(income) },
      { iconName: 'credit-card', bg: 'var(--negative-bg)', bar: 'var(--negative)', label: 'Total Expenses', value: fmt(expenses) },
      { iconName: 'piggy-bank', bg: 'var(--info-bg)', bar: 'var(--info)', label: 'Net Savings', value: fmt(savings, { showSign: true }), cls: savings >= 0 ? 'amount-pos' : 'amount-neg' },
      { iconName: 'pie-chart', bg: 'var(--positive-bg)', bar: 'var(--accent)', label: 'Savings Rate', value: income > 0 ? `${((savings / income) * 100).toFixed(0)}%` : '—' },
      { iconName: 'hash', bg: 'var(--info-bg)', bar: 'var(--info)', label: 'Transactions', value: txCount },
    ].map(k => `<div class="stat-card" style="--bar-color:${k.bar};--icon-bg:${k.bg}">
      <div class="stat-card__accent-bar"></div>
      <div class="stat-card__icon">${icon(k.iconName, 'icon-md')}</div>
      <div class="stat-card__label">${k.label}</div>
      <div class="stat-card__value mono ${k.cls||''}">${k.value}</div>
    </div>`).join('');
    refreshIcons();

    /* charts */
    const expPairs = Analytics.groupByCategory(txFiltered, 'expense');
    const incPairs = Analytics.groupByCategory(txFiltered, 'income');
    Analytics.renderDoughnut('chartExpPie', expPairs.map(p => p[0]), expPairs.map(p => p[1]));
    Analytics.renderDoughnut('chartIncPie', incPairs.map(p => p[0]), incPairs.map(p => p[1]));
    Analytics.renderTrendBar('chartTrend', txAll);
    Analytics.renderCategoryBar('chartCatBar', expPairs.slice(0, 8), 'expense');
    Analytics.renderSavingsLine('chartSavings', txAll);

    /* summary table */
    Analytics.renderSummaryTable('summaryBody', txFiltered);

    /* insights */
    const insights = Analytics.generateInsights(txAll, txFiltered, period);
    document.getElementById('insightsGrid').innerHTML = insights.length
      ? insights.map(ins => `
          <div class="insight-card" style="--insight-color:${ins.color}">
            <div class="insight-card__icon">${icon(ins.icon, 'icon-md')}</div>
            <div>
              <div class="insight-card__title">${ins.title}</div>
              <div class="insight-card__body">${ins.body}</div>
            </div>
          </div>`).join('')
      : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon">${icon('lightbulb', 'icon-xl')}</div><h3>No insights yet</h3><p>Add more transactions for personalised insights.</p></div>`;
    refreshIcons();
  }

  periodSel.addEventListener('change', () => renderAll(periodSel.value));
  renderAll(periodSel.value);

  /* ── Export: CSV ── */
  document.getElementById('btnExportCSV').addEventListener('click', () => {
    const period = periodSel.value;
    const txFiltered = Analytics.filterByPeriod(txAll, period);
    if (txFiltered.length === 0) { Toast.warning('No transactions to export for this period.'); return; }

    const currency = Auth.prefs.currency || 'USD';
    const c = CURRENCIES[currency] || CURRENCIES.USD;
    const rows = [
      ['Date', 'Type', 'Category', 'Amount (' + currency + ')', 'Note'],
      ...txFiltered.map(t => [
        t.date,
        t.type,
        t.category,
        convertFromUSD(t.amountUSD, currency).toFixed(2),
        `"${(t.note || '').replace(/"/g, '""')}"`,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    downloadFile(`jpx-wealth-${period}-${datestamp()}.csv`, csv, 'text/csv');
    Toast.success('CSV exported successfully.');
  });

  /* ── Export: JSON ── */
  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const period = periodSel.value;
    const txFiltered = Analytics.filterByPeriod(txAll, period);
    if (txFiltered.length === 0) { Toast.warning('No transactions to export for this period.'); return; }

    const currency = Auth.prefs.currency || 'USD';
    const payload = {
      exportedAt: new Date().toISOString(),
      period,
      currency,
      user: { name: user.name, email: user.email },
      summary: {
        income: Analytics.sumType(txFiltered, 'income'),
        expenses: Analytics.sumType(txFiltered, 'expense'),
        net: Analytics.sumType(txFiltered, 'income') - Analytics.sumType(txFiltered, 'expense'),
        count: txFiltered.length,
      },
      transactions: txFiltered.map(t => ({
        ...t,
        amountLocal: convertFromUSD(t.amountUSD, currency),
        currency,
      })),
    };

    downloadFile(`jpx-wealth-${period}-${datestamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    Toast.success('JSON exported successfully.');
  });

  /* ── Print ── */
  document.getElementById('btnPrint').addEventListener('click', () => {
    window.print();
  });

  /* ── helpers ── */

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function datestamp() {
    return new Date().toISOString().slice(0, 10);
  }

})();

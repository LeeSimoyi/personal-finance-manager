/**
 * analytics.js
 * Shared charting and insight engine. Called by reports.js.
 * Exports: window.Analytics
 */

const Analytics = (() => {
  'use strict';

  /* ── colour palette ── */
  const PALETTE = [
    '#BDF75C','#5B6EF5','#E0455A','#3DDC97','#FFB648',
    '#7C8CF8','#4FC3E8','#C792EA','#F76C9D','#9FE63A',
    '#6E8EFB','#2DD4BF','#FB923C','#A78BFA','#34D399',
  ];

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function gridColor() {
    return isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(7,23,36,0.07)';
  }

  function textColor() {
    return isDark() ? '#A9B4C0' : '#5B6470';
  }

  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.animation = { duration: 600, easing: 'easeInOutQuart' };

  /* ── period helpers ── */

  function getPeriodRange(period) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (period) {
      case 'month':
        return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
      case 'last_month':
        return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
      case 'quarter': {
        const q = Math.floor(m / 3);
        return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) };
      }
      case 'year':
        return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
      case 'all':
      default:
        return { from: new Date(0), to: new Date(9999, 11, 31) };
    }
  }

  function filterByPeriod(txList, period) {
    const { from, to } = getPeriodRange(period);
    return txList.filter(t => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    });
  }

  /* ── aggregation ── */

  function sumType(txList, type) {
    return txList.filter(t => t.type === type).reduce((s, t) => s + t.amountUSD, 0);
  }

  function groupByCategory(txList, type) {
    const map = {};
    txList.filter(t => t.type === type).forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amountUSD;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function last12Months() {
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }

  /* ── chart registry ── */
  const charts = {};

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  /* ── doughnut ── */
  function renderDoughnut(canvasId, labels, data, title) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    charts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No data'],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: PALETTE.slice(0, Math.max(labels.length, 1)),
          borderWidth: 2,
          borderColor: isDark() ? '#13212F' : '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor(), boxWidth: 12, padding: 10, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${data.length ? ((ctx.raw / data.reduce((a,b) => a+b, 0))*100).toFixed(1) : 0}%)`,
            },
          },
        },
      },
    });
  }

  /* ── bar chart (income vs expense, 12-month trend) ── */
  function renderTrendBar(canvasId, txAll) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const months = last12Months();
    const incData = months.map(({ year, month }) =>
      txAll.filter(t => { const d = new Date(t.date); return t.type === 'income' && d.getFullYear() === year && d.getMonth() === month; }).reduce((s,t) => s+t.amountUSD, 0)
    );
    const expData = months.map(({ year, month }) =>
      txAll.filter(t => { const d = new Date(t.date); return t.type === 'expense' && d.getFullYear() === year && d.getMonth() === month; }).reduce((s,t) => s+t.amountUSD, 0)
    );

    charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: 'Income', data: incData, backgroundColor: 'rgba(159,230,58,0.85)', borderRadius: 4, borderSkipped: false },
          { label: 'Expenses', data: expData, backgroundColor: 'rgba(224,69,90,0.75)', borderRadius: 4, borderSkipped: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: textColor() } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => fmt(v) } },
        },
        plugins: {
          legend: { labels: { color: textColor() } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
        },
      },
    });
  }

  /* ── horizontal category bar ── */
  function renderCategoryBar(canvasId, pairs, type) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const labels = pairs.map(p => p[0]);
    const data = pairs.map(p => p[1]);

    charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['No data'],
        datasets: [{
          label: type === 'expense' ? 'Spent' : 'Earned',
          data: data.length ? data : [0],
          backgroundColor: PALETTE.slice(0, Math.max(labels.length, 1)),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => fmt(v) } },
          y: { grid: { display: false }, ticks: { color: textColor() } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } },
        },
      },
    });
  }

  /* ── savings line chart ── */
  function renderSavingsLine(canvasId, txAll) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const months = last12Months();
    const savingsData = months.map(({ year, month }) => {
      const tx = txAll.filter(t => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month; });
      return tx.filter(t => t.type === 'income').reduce((s,t) => s+t.amountUSD, 0) -
             tx.filter(t => t.type === 'expense').reduce((s,t) => s+t.amountUSD, 0);
    });

    const cumulativeData = savingsData.reduce((acc, val, i) => {
      acc.push((acc[i-1] || 0) + val);
      return acc;
    }, []);

    charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          {
            label: 'Monthly Savings',
            data: savingsData,
            borderColor: 'rgba(159,230,58,0.95)',
            backgroundColor: 'rgba(189,247,92,0.12)',
            tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 6,
          },
          {
            label: 'Cumulative',
            data: cumulativeData,
            borderColor: 'rgba(91,110,245,0.9)',
            backgroundColor: 'transparent',
            tension: 0.4, fill: false, borderDash: [5,4], pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: textColor() } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => fmt(v) } },
        },
        plugins: {
          legend: { labels: { color: textColor() } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
        },
      },
    });
  }

  /* ── summary table ── */
  function renderSummaryTable(tbodyId, txFiltered) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const totalExp = txFiltered.filter(t => t.type === 'expense').reduce((s,t) => s+t.amountUSD, 0);
    const pairs = groupByCategory(txFiltered, 'expense');

    if (pairs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state__icon">${icon('pie-chart', 'icon-xl')}</div><h3>No expense data for this period</h3></div></td></tr>`;
      refreshIcons();
      return;
    }

    tbody.innerHTML = pairs.map(([cat, total]) => {
      const txCount = txFiltered.filter(t => t.type === 'expense' && t.category === cat).length;
      const avg = txCount > 0 ? total / txCount : 0;
      const pct = totalExp > 0 ? ((total / totalExp) * 100).toFixed(1) : '0';
      const catIcon = CATEGORY_ICONS[cat] || 'receipt';
      return `<tr>
        <td>${icon(catIcon, 'icon-sm')} ${cat}</td>
        <td style="text-align:right;" class="amount-neg">${fmt(total)}</td>
        <td style="text-align:right;">${pct}%</td>
        <td style="text-align:right;">${txCount}</td>
        <td style="text-align:right;">${fmt(avg)}</td>
      </tr>`;
    }).join('');
    refreshIcons();
  }

  /* ── smart insights engine ── */
  function generateInsights(txAll, txFiltered, period) {
    const insights = [];
    const income = sumType(txFiltered, 'income');
    const expenses = sumType(txFiltered, 'expense');
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Savings rate assessment
    if (income > 0) {
      if (savingsRate >= 30) {
        insights.push({ icon: 'trophy', color: 'var(--positive)', title: 'Excellent savings rate', body: `You're saving ${savingsRate.toFixed(0)}% of your income — well above the recommended 20%. Financial independence is within reach.` });
      } else if (savingsRate >= 20) {
        insights.push({ icon: 'circle-check', color: 'var(--positive)', title: 'On track with savings', body: `${savingsRate.toFixed(0)}% savings rate. You're meeting the 50/30/20 rule benchmark.` });
      } else if (savingsRate > 0) {
        insights.push({ icon: 'trending-up', color: 'var(--accent)', title: 'Savings could improve', body: `${savingsRate.toFixed(0)}% savings rate. Try reducing discretionary spending to hit the 20% benchmark.` });
      } else {
        insights.push({ icon: 'alert-triangle', color: 'var(--negative)', title: 'Spending exceeds income', body: `You spent ${fmt(Math.abs(savings))} more than you earned. Review your highest expense categories immediately.` });
      }
    }

    // Top category
    const pairs = groupByCategory(txFiltered, 'expense');
    if (pairs.length > 0) {
      const [topCat, topAmt] = pairs[0];
      insights.push({ icon: 'search', color: 'var(--info)', title: `Top expense: ${topCat}`, body: `${topCat} accounted for ${fmt(topAmt)} — ${income > 0 ? ((topAmt/income)*100).toFixed(0) : '—'}% of your total income for this period.` });
    }

    // Budget health score
    const budget = DB.getBudget(Auth.user.id);
    if (budget) {
      const score = Math.max(0, Math.min(100, Math.round(100 - ((expenses / budget.monthlyLimitUSD) * 100 - 70) * 3)));
      const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs work';
      insights.push({ icon: 'gauge', color: score >= 60 ? 'var(--positive)' : 'var(--accent)', title: `Budget health: ${label}`, body: `Your budget health score is ${score}/100. ${expenses > budget.monthlyLimitUSD ? `You exceeded your budget by ${fmt(expenses - budget.monthlyLimitUSD)}.` : `${fmt(budget.monthlyLimitUSD - expenses)} remaining in budget.`}` });
    }

    // Spending trend
    const now = new Date();
    const thisMonthTx = txAll.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const lastMonthTx = txAll.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() - 1;
    });
    const thisExp = sumType(thisMonthTx, 'expense');
    const lastExp = sumType(lastMonthTx, 'expense');
    if (lastExp > 0 && thisExp > 0) {
      const diff = ((thisExp - lastExp) / lastExp) * 100;
      if (Math.abs(diff) >= 5) {
        insights.push({
          icon: diff > 0 ? 'trending-down' : 'trending-up',
          color: diff > 0 ? 'var(--negative)' : 'var(--positive)',
          title: `Spending ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff).toFixed(0)}% vs last month`,
          body: `This month: ${fmt(thisExp)} vs last month: ${fmt(lastExp)}.`,
        });
      }
    }

    // Largest single expense
    const largest = txFiltered.filter(t => t.type === 'expense').sort((a,b) => b.amountUSD - a.amountUSD)[0];
    if (largest) {
      insights.push({ icon: 'banknote', color: 'var(--accent)', title: 'Largest single expense', body: `${largest.category}${largest.note ? ` — "${largest.note}"` : ''} on ${largest.date} for ${fmt(largest.amountUSD)}.` });
    }

    return insights.slice(0, 6);
  }

  return { filterByPeriod, sumType, groupByCategory, renderDoughnut, renderTrendBar, renderCategoryBar, renderSavingsLine, renderSummaryTable, generateInsights, destroyChart };
})();

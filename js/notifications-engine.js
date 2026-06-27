/**
 * notifications-engine.js — MoneyFlow V2.0
 * ─────────────────────────────────────────────────────────────────────────
 * Runs on every protected page load (called from initApp). Checks current
 * user data and generates smart notifications for:
 *   - Budget overspend / near-limit warnings
 *   - Goal milestone reached (50%, 100%)
 *   - Upcoming subscription renewals (within 7 days)
 *   - Upcoming debt payments
 * Notifications are deduplicated by a daily key so they don't re-fire every
 * page load for the same event.
 * ─────────────────────────────────────────────────────────────────────────
 */

const NotificationsEngine = (() => {
  'use strict';

  const TODAY = new Date().toISOString().slice(0, 10);

  function dedupKey(key) {
    return `mf_notifKey_${key}_${TODAY}`;
  }

  function alreadyFired(key) {
    return !!localStorage.getItem(dedupKey(key));
  }

  function markFired(key) {
    localStorage.setItem(dedupKey(key), '1');
  }

  function fire(userId, notif, dedupId) {
    if (alreadyFired(dedupId)) return;
    DB.addNotification({ userId, ...notif });
    markFired(dedupId);
  }

  /* ── Budget checks ── */
  function checkBudgets(userId) {
    const budget = DB.getBudget(userId);
    if (!budget) return;
    const now = new Date();
    const monthTx = DB.getTransactions(userId).filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.type === 'expense';
    });
    const expenses = monthTx.reduce((s, t) => s + t.amountUSD, 0);
    const pct = expenses / budget.monthlyLimitUSD;

    if (pct >= 1) {
      fire(userId, {
        type: 'budget',
        title: 'Monthly Budget Exceeded',
        body: `You have spent ${formatCurrency(expenses, 'USD')} — over your ${formatCurrency(budget.monthlyLimitUSD, 'USD')} monthly limit.`,
      }, `budget_exceeded_${now.getFullYear()}_${now.getMonth()}`);
    } else if (pct >= 0.8) {
      fire(userId, {
        type: 'budget',
        title: 'Budget Alert — 80% Used',
        body: `You have used ${Math.round(pct * 100)}% of your monthly budget. Only ${formatCurrency(budget.monthlyLimitUSD - expenses, 'USD')} remaining.`,
      }, `budget_80pct_${now.getFullYear()}_${now.getMonth()}`);
    }

    // Per-category budgets
    const catBudgets = DB.getCategoryBudgets(userId);
    catBudgets.forEach(cb => {
      const spent = monthTx.filter(t => t.category === cb.category).reduce((s, t) => s + t.amountUSD, 0);
      if (spent >= cb.monthlyLimitUSD) {
        fire(userId, {
          type: 'budget',
          title: `${cb.category} Budget Exceeded`,
          body: `You've spent ${formatCurrency(spent, 'USD')} on ${cb.category} — over your ${formatCurrency(cb.monthlyLimitUSD, 'USD')} limit.`,
        }, `catbudget_${cb.category}_${now.getFullYear()}_${now.getMonth()}`);
      }
    });
  }

  /* ── Goal milestone checks ── */
  function checkGoals(userId) {
    DB.getGoals(userId).forEach(g => {
      if (!g.targetUSD || g.targetUSD <= 0) return;
      const pct = g.currentUSD / g.targetUSD;

      if (pct >= 1) {
        fire(userId, {
          type: 'goal',
          title: `Goal Complete: ${g.name}`,
          body: `You've reached your ${formatCurrency(g.targetUSD, 'USD')} target!`,
        }, `goal_100_${g.id}`);
      } else if (pct >= 0.5 && pct < 1) {
        fire(userId, {
          type: 'goal',
          title: `Halfway There: ${g.name}`,
          body: `You've saved ${formatCurrency(g.currentUSD, 'USD')} — ${Math.round(pct * 100)}% of your ${formatCurrency(g.targetUSD, 'USD')} goal.`,
        }, `goal_50_${g.id}`);
      }
    });
  }

  /* ── Subscription renewal reminders ── */
  function checkSubscriptions(userId) {
    if (typeof DB.getSubscriptions !== 'function') return;
    const subs = DB.getSubscriptions(userId);
    const now = new Date();
    subs.forEach(sub => {
      if (!sub.active || !sub.renewalDate) return;
      const renewal = new Date(sub.renewalDate);
      const daysUntil = Math.ceil((renewal - now) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 7 && daysUntil >= 0) {
        fire(userId, {
          type: 'subscription',
          title: `Subscription Renewing: ${sub.name}`,
          body: `Your ${sub.name} subscription (${formatCurrency(sub.amountUSD, 'USD')}) renews in ${daysUntil === 0 ? 'today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}.`,
        }, `sub_renewal_${sub.id}_${sub.renewalDate}`);
      }
    });
  }

  /* ── Debt payment reminders ── */
  function checkDebts(userId) {
    if (typeof DB.getDebts !== 'function') return;
    const debts = DB.getDebts(userId);
    const now = new Date();
    debts.forEach(debt => {
      if (!debt.dueDate || debt.remainingAmountUSD <= 0) return;
      const due = new Date(debt.dueDate);
      const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 7 && daysUntil >= 0) {
        fire(userId, {
          type: 'bill',
          title: `Debt Payment Due: ${debt.name}`,
          body: `Payment of ${formatCurrency(debt.monthlyPaymentUSD, 'USD')} is due in ${daysUntil === 0 ? 'today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}.`,
        }, `debt_due_${debt.id}_${debt.dueDate}`);
      }
    });
  }

  /* ── Update topbar badge ── */
  function updateBadge(userId) {
    const count = DB.unreadCount(userId);
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.setAttribute('aria-label', `${count} unread notification${count !== 1 ? 's' : ''}`);
  }

  /* ── Main run function ── */
  function run(userId) {
    if (!userId) return;
    try { checkBudgets(userId); } catch(e) {}
    try { checkGoals(userId); } catch(e) {}
    try { checkSubscriptions(userId); } catch(e) {}
    try { checkDebts(userId); } catch(e) {}
    setTimeout(() => updateBadge(userId), 100);
  }

  return { run, updateBadge };
})();

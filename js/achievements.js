/**
 * achievements.js — MoneyFlow V2.0
 * ─────────────────────────────────────────────────────────────────────────
 * Checks whether the current user has earned any new achievements and awards
 * them with a toast celebration. Call AchievementsEngine.check(userId) after
 * any write operation (add transaction, save goal, set budget, etc.).
 * ─────────────────────────────────────────────────────────────────────────
 */

const AchievementsEngine = (() => {
  'use strict';

  /* ── Achievement definitions ─────────────────────────────────────────── */
  const ACHIEVEMENTS = [
    {
      key: 'first_transaction',
      title: 'First Steps',
      desc: 'Logged your first transaction.',
      iconName: 'zap',
      check: (userId) => DB.getTransactions(userId).length >= 1,
    },
    {
      key: 'first_budget',
      title: 'Budget Boss',
      desc: 'Set your first monthly budget.',
      iconName: 'shield-check',
      check: (userId) => !!DB.getBudget(userId),
    },
    {
      key: 'first_goal',
      title: 'Goal Setter',
      desc: 'Created your first savings goal.',
      iconName: 'target',
      check: (userId) => DB.getGoals(userId).length >= 1,
    },
    {
      key: 'goal_complete',
      title: 'Goal Crusher',
      desc: 'Reached 100% on a savings goal.',
      iconName: 'trophy',
      check: (userId) => DB.getGoals(userId).some(g => g.targetUSD > 0 && g.currentUSD >= g.targetUSD),
    },
    {
      key: 'ten_transactions',
      title: 'On a Roll',
      desc: 'Logged 10 transactions.',
      iconName: 'flame',
      check: (userId) => DB.getTransactions(userId).length >= 10,
    },
    {
      key: 'fifty_transactions',
      title: 'Power Tracker',
      desc: 'Logged 50 transactions.',
      iconName: 'star',
      check: (userId) => DB.getTransactions(userId).length >= 50,
    },
    {
      key: 'hundred_transactions',
      title: 'Finance Guru',
      desc: 'Logged 100 transactions.',
      iconName: 'award',
      check: (userId) => DB.getTransactions(userId).length >= 100,
    },
    {
      key: 'savings_rate_20',
      title: 'Smart Saver',
      desc: 'Achieved a 20%+ savings rate this month.',
      iconName: 'piggy-bank',
      check: (userId) => {
        const now = new Date();
        const tx = DB.getTransactions(userId).filter(t => {
          const d = new Date(t.date);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
        const inc = tx.filter(t => t.type === 'income').reduce((s,t) => s + t.amountUSD, 0);
        const exp = tx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amountUSD, 0);
        return inc > 0 && (inc - exp) / inc >= 0.2;
      },
    },
    {
      key: 'savings_rate_50',
      title: 'Super Saver',
      desc: 'Achieved a 50%+ savings rate this month.',
      iconName: 'sparkles',
      check: (userId) => {
        const now = new Date();
        const tx = DB.getTransactions(userId).filter(t => {
          const d = new Date(t.date);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
        const inc = tx.filter(t => t.type === 'income').reduce((s,t) => s + t.amountUSD, 0);
        const exp = tx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amountUSD, 0);
        return inc > 0 && (inc - exp) / inc >= 0.5;
      },
    },
    {
      key: 'under_budget',
      title: 'Expense Control',
      desc: 'Finished a month under your monthly budget.',
      iconName: 'check-circle-2',
      check: (userId) => {
        const budget = DB.getBudget(userId);
        if (!budget) return false;
        const now = new Date();
        // Check last completed month
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const tx = DB.getTransactions(userId).filter(t => {
          const d = new Date(t.date);
          return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth();
        });
        const exp = tx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amountUSD, 0);
        return exp > 0 && exp < budget.monthlyLimitUSD;
      },
    },
    {
      key: 'health_score_70',
      title: 'Financially Fit',
      desc: 'Achieved a Financial Health Score of 70+.',
      iconName: 'heart-pulse',
      check: (userId) => {
        const score = DB.getHealthScore(userId);
        return score && score.total >= 70;
      },
    },
    {
      key: 'health_score_90',
      title: 'Financial Champion',
      desc: 'Achieved a Financial Health Score of 90+.',
      iconName: 'medal',
      check: (userId) => {
        const score = DB.getHealthScore(userId);
        return score && score.total >= 90;
      },
    },
    {
      key: 'first_investment',
      title: 'Investor',
      desc: 'Added your first investment to the tracker.',
      iconName: 'trending-up',
      check: (userId) => DB.getInvestments(userId).length >= 1,
    },
    {
      key: 'debt_free_item',
      title: 'Debt Slayer',
      desc: 'Fully paid off a tracked debt.',
      iconName: 'scissors',
      check: (userId) => DB.getDebts(userId).some(d => d.remainingAmountUSD <= 0 && d.originalAmountUSD > 0),
    },
    {
      key: 'five_categories',
      title: 'Detailed Tracker',
      desc: 'Tracked expenses across 5 different categories.',
      iconName: 'layout-grid',
      check: (userId) => {
        const cats = new Set(DB.getTransactions(userId).filter(t => t.type === 'expense').map(t => t.category));
        return cats.size >= 5;
      },
    },
  ];

  /* ── Show celebration toast ── */
  function celebrateAchievement(achievement) {
    if (typeof Toast === 'undefined') return;
    Toast.show(`Achievement unlocked: ${achievement.title} — ${achievement.desc}`, 'success', 6000);
    // Also add a notification
    if (typeof DB !== 'undefined' && typeof Auth !== 'undefined' && Auth.user) {
      DB.addNotification({
        userId: Auth.user.id,
        type: 'achievement',
        title: `Achievement Unlocked: ${achievement.title}`,
        body: achievement.desc,
      });
    }
  }

  /* ── Main check function — call after any write op ── */
  function check(userId) {
    if (!userId) return;
    ACHIEVEMENTS.forEach(def => {
      if (DB.hasAchievement(userId, def.key)) return; // already unlocked
      try {
        if (def.check(userId)) {
          const awarded = DB.awardAchievement(userId, { key: def.key, title: def.title, desc: def.desc, iconName: def.iconName });
          if (awarded) celebrateAchievement(awarded);
        }
      } catch (e) {
        // Silent failure — achievement checks must never break the app
      }
    });
  }

  return { check, ACHIEVEMENTS };
})();

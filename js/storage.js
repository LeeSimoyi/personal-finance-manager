/**
 * storage.js
 * -----------------------------------------------------------------------
 * Single source of truth for all persisted data. Every other module reads
 * and writes through the `DB` object defined here so the storage format
 * can change in one place without touching page controllers.
 *
 * NOTE ON "AUTH": there is no backend. Login/Register simulate an account
 * system entirely inside localStorage, including a client-side SHA-256
 * hash of the password (Web Crypto API) so we never store plain text.
 * This is sufficient for a portfolio / demo product but is NOT secure
 * authentication — anyone with console access to the browser can read
 * localStorage. Swap this module for real API calls when you have a
 * backend; every other file only talks to `DB`, so that swap is isolated.
 * -----------------------------------------------------------------------
 */

const LS_PREFIX = 'mf_';

const LS_KEYS = {
  USERS: `${LS_PREFIX}users`,
  SESSION: `${LS_PREFIX}session`,
  TRANSACTIONS: `${LS_PREFIX}transactions`,
  BUDGETS: `${LS_PREFIX}budgets`,
  CATEGORY_BUDGETS: `${LS_PREFIX}category_budgets`,
  GOALS: `${LS_PREFIX}goals`,
  RECURRING: `${LS_PREFIX}recurring`,
  PREFS: `${LS_PREFIX}prefs`,
  RESET_TOKENS: `${LS_PREFIX}reset_tokens`,
  // V2.0 NEW KEYS
  SUBSCRIPTIONS: `${LS_PREFIX}subscriptions`,
  DEBTS: `${LS_PREFIX}debts`,
  INVESTMENTS: `${LS_PREFIX}investments`,
  NOTIFICATIONS: `${LS_PREFIX}notifications`,
  ACHIEVEMENTS: `${LS_PREFIX}achievements`,
  HEALTH_SCORES: `${LS_PREFIX}health_scores`,
};

/* ------------------------------ low level ------------------------------ */

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Storage read failed for ${key}`, err);
    return fallback;
  }
}

function lsWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Storage write failed for ${key}`, err);
    return false;
  }
}

function genId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* -------------------------------- crypto -------------------------------- */

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* -------------------------------- currency ------------------------------- */

const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', toUSD: 1 },
  EUR: { symbol: '€', name: 'Euro', toUSD: 1.08 },
  GBP: { symbol: '£', name: 'British Pound', toUSD: 1.27 },
  INR: { symbol: '₹', name: 'Indian Rupee', toUSD: 0.012 },
  ZWL: { symbol: 'ZiG', name: 'Zimbabwe Gold', toUSD: 0.074 },
};

// All amounts are stored internally in USD. Display conversion uses the
// fixed reference rates above. These are illustrative, not live market
// rates — call out to a live FX API if you need accuracy in production.
function convertFromUSD(amountUSD, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  return amountUSD * c.toUSD;
}

function convertToUSD(amount, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  return amount / c.toUSD;
}

function formatCurrency(amountUSD, code = 'USD', opts = {}) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const value = convertFromUSD(amountUSD, code);
  const sign = opts.showSign && value > 0 ? '+' : '';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const negative = value < 0 ? '-' : '';
  return `${sign}${negative}${c.symbol}${formatted}`;
}

/* --------------------------------- DB API -------------------------------- */

const DB = {
  /* users ----------------------------------------------------------- */
  getUsers() {
    return lsRead(LS_KEYS.USERS, []);
  },
  saveUsers(users) {
    return lsWrite(LS_KEYS.USERS, users);
  },
  findUserByEmail(email) {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id) {
    return this.getUsers().find(u => u.id === id);
  },
  async createUser({ name, email, password }) {
    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }
    const passwordHash = await sha256(password);
    const user = {
      id: genId('user'),
      name,
      email,
      passwordHash,
      createdAt: nowISO(),
    };
    users.push(user);
    this.saveUsers(users);
    this.savePrefs(user.id, { currency: 'USD', theme: 'light', highContrast: false, avatar: null });
    return user;
  },
  async verifyPassword(user, password) {
    const hash = await sha256(password);
    return hash === user.passwordHash;
  },
  updateUser(id, patch) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...patch };
    this.saveUsers(users);
    return users[idx];
  },
  async setPassword(id, newPassword) {
    const passwordHash = await sha256(newPassword);
    return this.updateUser(id, { passwordHash });
  },

  /* session ----------------------------------------------------------- */
  getSession() {
    return lsRead(LS_KEYS.SESSION, null);
  },
  setSession(userId) {
    const session = { userId, token: genId('tok'), createdAt: nowISO() };
    lsWrite(LS_KEYS.SESSION, session);
    return session;
  },
  clearSession() {
    localStorage.removeItem(LS_KEYS.SESSION);
  },
  currentUser() {
    const session = this.getSession();
    if (!session) return null;
    return this.findUserById(session.userId) || null;
  },

  /* password reset (simulated email) ------------------------------------ */
  createResetToken(email) {
    const tokens = lsRead(LS_KEYS.RESET_TOKENS, {});
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    tokens[email.toLowerCase()] = { token, expires: Date.now() + 15 * 60 * 1000 };
    lsWrite(LS_KEYS.RESET_TOKENS, tokens);
    return token;
  },
  verifyResetToken(email, token) {
    const tokens = lsRead(LS_KEYS.RESET_TOKENS, {});
    const entry = tokens[email.toLowerCase()];
    if (!entry) return false;
    if (entry.expires < Date.now()) return false;
    return entry.token === token.toUpperCase();
  },

  /* preferences --------------------------------------------------------- */
  getPrefs(userId) {
    const all = lsRead(LS_KEYS.PREFS, {});
    return all[userId] || { currency: 'USD', theme: 'light', highContrast: false, avatar: null };
  },
  savePrefs(userId, prefs) {
    const all = lsRead(LS_KEYS.PREFS, {});
    all[userId] = { ...this.getPrefs(userId), ...prefs };
    lsWrite(LS_KEYS.PREFS, all);
    return all[userId];
  },

  /* transactions ---------------------------------------------------------
   * { id, userId, type:'income'|'expense', category, amountUSD, date,
   *   note, recurring: null | { frequency:'monthly'|'weekly', nextDate } }
   */
  getTransactions(userId) {
    return lsRead(LS_KEYS.TRANSACTIONS, []).filter(t => t.userId === userId);
  },
  _allTransactions() {
    return lsRead(LS_KEYS.TRANSACTIONS, []);
  },
  addTransaction(tx) {
    const all = this._allTransactions();
    const record = { id: genId('txn'), createdAt: nowISO(), ...tx };
    all.push(record);
    lsWrite(LS_KEYS.TRANSACTIONS, all);
    return record;
  },
  updateTransaction(id, patch) {
    const all = this._allTransactions();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.TRANSACTIONS, all);
    return all[idx];
  },
  deleteTransaction(id) {
    const all = this._allTransactions().filter(t => t.id !== id);
    lsWrite(LS_KEYS.TRANSACTIONS, all);
  },

  /* overall monthly budget ------------------------------------------------ */
  getBudget(userId) {
    const all = lsRead(LS_KEYS.BUDGETS, {});
    return all[userId] || null;
  },
  setBudget(userId, monthlyLimitUSD) {
    const all = lsRead(LS_KEYS.BUDGETS, {});
    all[userId] = { monthlyLimitUSD, updatedAt: nowISO() };
    lsWrite(LS_KEYS.BUDGETS, all);
    return all[userId];
  },

  /* per-category budgets --------------------------------------------------
   * { id, userId, category, monthlyLimitUSD }
   */
  getCategoryBudgets(userId) {
    return lsRead(LS_KEYS.CATEGORY_BUDGETS, []).filter(b => b.userId === userId);
  },
  setCategoryBudget(userId, category, monthlyLimitUSD) {
    const all = lsRead(LS_KEYS.CATEGORY_BUDGETS, []);
    const idx = all.findIndex(b => b.userId === userId && b.category === category);
    if (idx === -1) {
      all.push({ id: genId('cb'), userId, category, monthlyLimitUSD });
    } else {
      all[idx].monthlyLimitUSD = monthlyLimitUSD;
    }
    lsWrite(LS_KEYS.CATEGORY_BUDGETS, all);
    return all;
  },
  deleteCategoryBudget(id) {
    const all = lsRead(LS_KEYS.CATEGORY_BUDGETS, []).filter(b => b.id !== id);
    lsWrite(LS_KEYS.CATEGORY_BUDGETS, all);
  },

  /* savings goals ----------------------------------------------------------
   * { id, userId, name, targetUSD, currentUSD, deadline, category }
   */
  getGoals(userId) {
    return lsRead(LS_KEYS.GOALS, []).filter(g => g.userId === userId);
  },
  addGoal(goal) {
    const all = lsRead(LS_KEYS.GOALS, []);
    const record = { id: genId('goal'), createdAt: nowISO(), ...goal };
    all.push(record);
    lsWrite(LS_KEYS.GOALS, all);
    return record;
  },
  updateGoal(id, patch) {
    const all = lsRead(LS_KEYS.GOALS, []);
    const idx = all.findIndex(g => g.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.GOALS, all);
    return all[idx];
  },
  deleteGoal(id) {
    const all = lsRead(LS_KEYS.GOALS, []).filter(g => g.id !== id);
    lsWrite(LS_KEYS.GOALS, all);
  },

  /* recurring transactions --------------------------------------------------
   * { id, userId, type, category, amountUSD, note, frequency:'weekly'|'monthly',
   *   nextDate, active }
   */
  getRecurring(userId) {
    return lsRead(LS_KEYS.RECURRING, []).filter(r => r.userId === userId);
  },
  addRecurring(rec) {
    const all = lsRead(LS_KEYS.RECURRING, []);
    const record = { id: genId('rec'), active: true, createdAt: nowISO(), ...rec };
    all.push(record);
    lsWrite(LS_KEYS.RECURRING, all);
    return record;
  },
  updateRecurring(id, patch) {
    const all = lsRead(LS_KEYS.RECURRING, []);
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.RECURRING, all);
    return all[idx];
  },
  deleteRecurring(id) {
    lsWrite(LS_KEYS.RECURRING, lsRead(LS_KEYS.RECURRING, []).filter(r => r.id !== id));
  },
  // Generates any transactions that have come due since last visit, then
  // advances each template's nextDate. Safe to call on every page load.
  // V2: supports daily / weekly / monthly / quarterly / yearly
  processRecurring(userId) {
    const all = lsRead(LS_KEYS.RECURRING, []);
    let generated = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    all.forEach(rec => {
      if (rec.userId !== userId || !rec.active) return;
      let next = new Date(rec.nextDate);
      let guard = 0;
      while (next <= today && guard < 60) {
        this.addTransaction({
          userId,
          type: rec.type,
          category: rec.category,
          amountUSD: rec.amountUSD,
          date: next.toISOString().slice(0, 10),
          note: `${rec.note || rec.category} (auto-generated, recurring)`,
        });
        generated++;
        const freq = rec.frequency || 'monthly';
        const n = new Date(next);
        if (freq === 'daily') n.setDate(n.getDate() + 1);
        else if (freq === 'weekly') n.setDate(n.getDate() + 7);
        else if (freq === 'monthly') n.setMonth(n.getMonth() + 1);
        else if (freq === 'quarterly') n.setMonth(n.getMonth() + 3);
        else if (freq === 'yearly') n.setFullYear(n.getFullYear() + 1);
        else n.setMonth(n.getMonth() + 1);
        next = n;
        guard++;
      }
      rec.nextDate = next.toISOString().slice(0, 10);
    });

    if (generated > 0) lsWrite(LS_KEYS.RECURRING, all);
    return generated;
  },

  /* backup / restore ------------------------------------------------------ */
  exportBackup(userId) {
    return {
      exportedAt: nowISO(),
      version: '2.0',
      userId,
      transactions: this.getTransactions(userId),
      budget: this.getBudget(userId),
      categoryBudgets: this.getCategoryBudgets(userId),
      goals: this.getGoals(userId),
      recurring: this.getRecurring(userId),
      subscriptions: this.getSubscriptions(userId),
      debts: this.getDebts(userId),
      investments: this.getInvestments(userId),
      prefs: this.getPrefs(userId),
    };
  },
  importBackup(userId, data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
    const txAll = this._allTransactions().filter(t => t.userId !== userId);
    lsWrite(LS_KEYS.TRANSACTIONS, [...txAll, ...(data.transactions || []).map(t => ({ ...t, userId }))]);
    const goalsAll = lsRead(LS_KEYS.GOALS, []).filter(g => g.userId !== userId);
    lsWrite(LS_KEYS.GOALS, [...goalsAll, ...(data.goals || []).map(g => ({ ...g, userId }))]);
    const cbAll = lsRead(LS_KEYS.CATEGORY_BUDGETS, []).filter(b => b.userId !== userId);
    lsWrite(LS_KEYS.CATEGORY_BUDGETS, [...cbAll, ...(data.categoryBudgets || []).map(b => ({ ...b, userId }))]);
    const recAll = lsRead(LS_KEYS.RECURRING, []).filter(r => r.userId !== userId);
    lsWrite(LS_KEYS.RECURRING, [...recAll, ...(data.recurring || []).map(r => ({ ...r, userId }))]);
    const subAll = lsRead(LS_KEYS.SUBSCRIPTIONS, []).filter(s => s.userId !== userId);
    lsWrite(LS_KEYS.SUBSCRIPTIONS, [...subAll, ...(data.subscriptions || []).map(s => ({ ...s, userId }))]);
    const debtAll = lsRead(LS_KEYS.DEBTS, []).filter(d => d.userId !== userId);
    lsWrite(LS_KEYS.DEBTS, [...debtAll, ...(data.debts || []).map(d => ({ ...d, userId }))]);
    const invAll = lsRead(LS_KEYS.INVESTMENTS, []).filter(i => i.userId !== userId);
    lsWrite(LS_KEYS.INVESTMENTS, [...invAll, ...(data.investments || []).map(i => ({ ...i, userId }))]);
    if (data.budget) this.setBudget(userId, data.budget.monthlyLimitUSD);
    if (data.prefs) this.savePrefs(userId, data.prefs);
    return true;
  },

  wipeUserData(userId) {
    lsWrite(LS_KEYS.TRANSACTIONS, this._allTransactions().filter(t => t.userId !== userId));
    lsWrite(LS_KEYS.GOALS, lsRead(LS_KEYS.GOALS, []).filter(g => g.userId !== userId));
    lsWrite(LS_KEYS.CATEGORY_BUDGETS, lsRead(LS_KEYS.CATEGORY_BUDGETS, []).filter(b => b.userId !== userId));
    lsWrite(LS_KEYS.RECURRING, lsRead(LS_KEYS.RECURRING, []).filter(r => r.userId !== userId));
    lsWrite(LS_KEYS.SUBSCRIPTIONS, lsRead(LS_KEYS.SUBSCRIPTIONS, []).filter(s => s.userId !== userId));
    lsWrite(LS_KEYS.DEBTS, lsRead(LS_KEYS.DEBTS, []).filter(d => d.userId !== userId));
    lsWrite(LS_KEYS.INVESTMENTS, lsRead(LS_KEYS.INVESTMENTS, []).filter(i => i.userId !== userId));
    lsWrite(LS_KEYS.NOTIFICATIONS, lsRead(LS_KEYS.NOTIFICATIONS, []).filter(n => n.userId !== userId));
    lsWrite(LS_KEYS.ACHIEVEMENTS, lsRead(LS_KEYS.ACHIEVEMENTS, []).filter(a => a.userId !== userId));
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: SUBSCRIPTIONS
     { id, userId, name, amountUSD, frequency:'monthly'|'yearly', renewalDate,
       category:'streaming'|'music'|'software'|'shopping'|'other', active, logo }
  ═══════════════════════════════════════════════════════════════════════════ */
  getSubscriptions(userId) {
    return lsRead(LS_KEYS.SUBSCRIPTIONS, []).filter(s => s.userId === userId);
  },
  addSubscription(sub) {
    const all = lsRead(LS_KEYS.SUBSCRIPTIONS, []);
    const record = { id: genId('sub'), active: true, createdAt: nowISO(), ...sub };
    all.push(record);
    lsWrite(LS_KEYS.SUBSCRIPTIONS, all);
    return record;
  },
  updateSubscription(id, patch) {
    const all = lsRead(LS_KEYS.SUBSCRIPTIONS, []);
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.SUBSCRIPTIONS, all);
    return all[idx];
  },
  deleteSubscription(id) {
    lsWrite(LS_KEYS.SUBSCRIPTIONS, lsRead(LS_KEYS.SUBSCRIPTIONS, []).filter(s => s.id !== id));
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: DEBTS
     { id, userId, name, type:'credit-card'|'loan'|'mortgage'|'other',
       originalAmountUSD, remainingAmountUSD, interestRate, monthlyPaymentUSD,
       dueDate, lender, notes }
  ═══════════════════════════════════════════════════════════════════════════ */
  getDebts(userId) {
    return lsRead(LS_KEYS.DEBTS, []).filter(d => d.userId === userId);
  },
  addDebt(debt) {
    const all = lsRead(LS_KEYS.DEBTS, []);
    const record = { id: genId('debt'), createdAt: nowISO(), ...debt };
    all.push(record);
    lsWrite(LS_KEYS.DEBTS, all);
    return record;
  },
  updateDebt(id, patch) {
    const all = lsRead(LS_KEYS.DEBTS, []);
    const idx = all.findIndex(d => d.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.DEBTS, all);
    return all[idx];
  },
  deleteDebt(id) {
    lsWrite(LS_KEYS.DEBTS, lsRead(LS_KEYS.DEBTS, []).filter(d => d.id !== id));
  },
  // Returns months until debt is paid off (simple calculation)
  debtPayoffMonths(debt) {
    if (!debt.monthlyPaymentUSD || debt.monthlyPaymentUSD <= 0) return null;
    const r = (debt.interestRate || 0) / 100 / 12;
    if (r === 0) return Math.ceil(debt.remainingAmountUSD / debt.monthlyPaymentUSD);
    const n = -Math.log(1 - (debt.remainingAmountUSD * r) / debt.monthlyPaymentUSD) / Math.log(1 + r);
    return isFinite(n) ? Math.ceil(n) : null;
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: INVESTMENTS
     { id, userId, name, type:'stock'|'etf'|'crypto'|'mutual-fund'|'other',
       ticker, shares, purchasePriceUSD, currentPriceUSD, purchaseDate, notes }
  ═══════════════════════════════════════════════════════════════════════════ */
  getInvestments(userId) {
    return lsRead(LS_KEYS.INVESTMENTS, []).filter(i => i.userId === userId);
  },
  addInvestment(inv) {
    const all = lsRead(LS_KEYS.INVESTMENTS, []);
    const record = { id: genId('inv'), createdAt: nowISO(), ...inv };
    all.push(record);
    lsWrite(LS_KEYS.INVESTMENTS, all);
    return record;
  },
  updateInvestment(id, patch) {
    const all = lsRead(LS_KEYS.INVESTMENTS, []);
    const idx = all.findIndex(i => i.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    lsWrite(LS_KEYS.INVESTMENTS, all);
    return all[idx];
  },
  deleteInvestment(id) {
    lsWrite(LS_KEYS.INVESTMENTS, lsRead(LS_KEYS.INVESTMENTS, []).filter(i => i.id !== id));
  },
  investmentValue(inv) { return (inv.currentPriceUSD || 0) * (inv.shares || 0); },
  investmentPL(inv) {
    const cost = (inv.purchasePriceUSD || 0) * (inv.shares || 0);
    const val = this.investmentValue(inv);
    return { value: val, cost, pl: val - cost, plPct: cost > 0 ? ((val - cost) / cost) * 100 : 0 };
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: NOTIFICATIONS
     { id, userId, type:'budget'|'goal'|'bill'|'subscription'|'achievement',
       title, body, read, createdAt }
  ═══════════════════════════════════════════════════════════════════════════ */
  getNotifications(userId) {
    return lsRead(LS_KEYS.NOTIFICATIONS, []).filter(n => n.userId === userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  },
  addNotification(notif) {
    const all = lsRead(LS_KEYS.NOTIFICATIONS, []);
    const record = { id: genId('notif'), read: false, createdAt: nowISO(), ...notif };
    all.unshift(record);
    // Keep max 50 notifications per user
    const cleaned = all.filter(n => n.userId === notif.userId).slice(0, 50);
    const others = all.filter(n => n.userId !== notif.userId);
    lsWrite(LS_KEYS.NOTIFICATIONS, [...others, ...cleaned]);
    return record;
  },
  markNotificationRead(id) {
    const all = lsRead(LS_KEYS.NOTIFICATIONS, []);
    const idx = all.findIndex(n => n.id === id);
    if (idx !== -1) { all[idx].read = true; lsWrite(LS_KEYS.NOTIFICATIONS, all); }
  },
  markAllNotificationsRead(userId) {
    const all = lsRead(LS_KEYS.NOTIFICATIONS, []).map(n => n.userId === userId ? { ...n, read: true } : n);
    lsWrite(LS_KEYS.NOTIFICATIONS, all);
  },
  unreadCount(userId) {
    return lsRead(LS_KEYS.NOTIFICATIONS, []).filter(n => n.userId === userId && !n.read).length;
  },
  deleteNotification(id) {
    lsWrite(LS_KEYS.NOTIFICATIONS, lsRead(LS_KEYS.NOTIFICATIONS, []).filter(n => n.id !== id));
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: ACHIEVEMENTS
     { id, userId, key, title, desc, icon, unlockedAt }
     key is unique per user — checked before awarding to avoid duplicates.
  ═══════════════════════════════════════════════════════════════════════════ */
  getAchievements(userId) {
    return lsRead(LS_KEYS.ACHIEVEMENTS, []).filter(a => a.userId === userId);
  },
  hasAchievement(userId, key) {
    return lsRead(LS_KEYS.ACHIEVEMENTS, []).some(a => a.userId === userId && a.key === key);
  },
  awardAchievement(userId, { key, title, desc, iconName }) {
    if (this.hasAchievement(userId, key)) return null;
    const all = lsRead(LS_KEYS.ACHIEVEMENTS, []);
    const record = { id: genId('ach'), userId, key, title, desc, iconName, unlockedAt: nowISO() };
    all.push(record);
    lsWrite(LS_KEYS.ACHIEVEMENTS, all);
    return record;
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     V2.0: FINANCIAL HEALTH SCORE ENGINE
     Calculated from four pillars; result saved/cached per user.
  ═══════════════════════════════════════════════════════════════════════════ */
  calculateHealthScore(userId) {
    const now = new Date();
    const txAll = this.getTransactions(userId);
    // Use last 3 months of data
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const recent = txAll.filter(t => new Date(t.date) >= cutoff);
    const income = recent.filter(t => t.type === 'income').reduce((s,t) => s + t.amountUSD, 0);
    const expenses = recent.filter(t => t.type === 'expense').reduce((s,t) => s + t.amountUSD, 0);
    const budget = this.getBudget(userId);
    const debts = this.getDebts(userId);
    const goals = this.getGoals(userId);

    // PILLAR 1: Savings Rate (0–30 pts)
    const savingsRate = income > 0 ? (income - expenses) / income : 0;
    const savingsPts = Math.min(30, Math.max(0, savingsRate * 100 > 30 ? 30 : savingsRate * 100));

    // PILLAR 2: Budget Adherence (0–25 pts)
    let budgetPts = 15; // default if no budget set
    if (budget && income > 0) {
      const adherence = 1 - Math.max(0, (expenses - budget.monthlyLimitUSD * 3) / (budget.monthlyLimitUSD * 3));
      budgetPts = Math.min(25, Math.max(0, adherence * 25));
    }

    // PILLAR 3: Debt Ratio (0–25 pts)
    const totalDebt = debts.reduce((s, d) => s + (d.remainingAmountUSD || 0), 0);
    const monthlyIncome = income / 3;
    const debtRatio = monthlyIncome > 0 ? totalDebt / (monthlyIncome * 12) : 0;
    const debtPts = Math.min(25, Math.max(0, 25 - (debtRatio * 10)));

    // PILLAR 4: Savings Goals Progress (0–20 pts)
    const activeGoals = goals.filter(g => g.targetUSD > 0);
    let goalPts = activeGoals.length > 0
      ? Math.min(20, activeGoals.reduce((s, g) => s + (g.currentUSD / g.targetUSD), 0) / activeGoals.length * 20)
      : 10; // neutral if no goals

    const total = Math.round(savingsPts + budgetPts + debtPts + goalPts);
    const score = {
      total,
      pillars: { savingsPts: Math.round(savingsPts), budgetPts: Math.round(budgetPts), debtPts: Math.round(debtPts), goalPts: Math.round(goalPts) },
      grade: total >= 85 ? 'Excellent' : total >= 70 ? 'Good' : total >= 50 ? 'Fair' : 'Needs Work',
      color: total >= 85 ? '#4F9D1D' : total >= 70 ? '#9FE63A' : total >= 50 ? '#D4A017' : '#E0455A',
      calculatedAt: nowISO(),
    };
    // Cache score
    const all = lsRead(LS_KEYS.HEALTH_SCORES, {});
    all[userId] = score;
    lsWrite(LS_KEYS.HEALTH_SCORES, all);
    return score;
  },
  getHealthScore(userId) {
    const all = lsRead(LS_KEYS.HEALTH_SCORES, {});
    return all[userId] || null;
  },
};

const INCOME_CATEGORIES = ['Salary', 'Business', 'Freelancing', 'Investment', 'Gifts', 'Other'];
const EXPENSE_CATEGORIES = ['Food', 'Rent', 'Shopping', 'Entertainment', 'Transport', 'Utilities', 'Education', 'Healthcare', 'Travel', 'Other'];

const CATEGORY_ICONS = {
  Salary: 'briefcase', Business: 'building-2', Freelancing: 'laptop', Investment: 'trending-up', Gifts: 'gift', Other: 'receipt',
  Food: 'utensils', Rent: 'home', Shopping: 'shopping-bag', Entertainment: 'clapperboard', Transport: 'car',
  Utilities: 'zap', Education: 'graduation-cap', Healthcare: 'heart-pulse', Travel: 'plane',
};

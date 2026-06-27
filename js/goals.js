/**
 * goals.js
 * Savings goal logic is implemented in budget.js (Goals tab).
 * This file exists to satisfy the project file structure and can be
 * extended for a dedicated goals page in future iterations.
 *
 * Public helpers available here for cross-page use:
 */

/**
 * Calculate how many months remain to reach a goal at the current saving pace.
 * @param {number} currentUSD
 * @param {number} targetUSD
 * @param {number} monthlySavingsUSD
 * @returns {number|null}
 */
function monthsToGoal(currentUSD, targetUSD, monthlySavingsUSD) {
  if (monthlySavingsUSD <= 0) return null;
  const remaining = targetUSD - currentUSD;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / monthlySavingsUSD);
}

/**
 * Return a motivational string based on completion percentage.
 * @param {number} pct 0–100
 * @returns {string}
 */
function goalMotivation(pct) {
  if (pct >= 100) return 'Goal achieved!';
  if (pct >= 75) return 'Almost there — keep going!';
  if (pct >= 50) return 'Halfway there!';
  if (pct >= 25) return 'Great start!';
  return 'Just getting started.';
}

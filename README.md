# MoneyFlow — Personal Finance Manager

> A production-grade, premium fintech-style personal finance web application built with pure HTML5, CSS3, and Vanilla JavaScript ES6+. Zero frameworks. Zero backends. Fully offline-capable.

---

## ✨ Features

### 🏠 Dashboard
- Net worth hero card with live sub-metrics
- KPI strip (income, expenses, savings, budget %)
- 6-month income vs. expense bar chart (Chart.js)
- Expense category doughnut chart
- Budget progress bars with overspend warnings
- Smart financial insights (auto-generated)
- Recent transactions mini-list
- Savings goals progress cards

### 💰 Transactions
- Full CRUD — add, edit, delete
- Search across notes, categories, amounts, dates
- Filter by type / category / month
- Sortable columns (date, category, note, amount)
- Paginated (20 per page)
- Filtered summary strip (income / expenses / net / count)
- Recurring transaction creation

### 📊 Budgets & Goals
- Overall monthly budget with progress tracking
- Per-category budget limits with overspend alerts
- Savings goals with progress bars, deadlines, and deposit flow
- Recurring transaction templates (weekly / monthly auto-generation)

### 📈 Reports & Analytics
- Period selector: this month / last month / quarter / year / all time
- 6 Chart.js charts: expense pie, income pie, 12-month trend bar, category bar, savings line
- Period summary table (per-category breakdown)
- Smart insights with financial recommendations
- Export: CSV, JSON, Print (CSS print media)

### ⚙️ Settings
- Avatar upload (base64, stored in localStorage)
- Profile & email update
- Password change (SHA-256 Web Crypto API)
- Theme: light / dark toggle
- Currency: USD, EUR, GBP, INR, ZWL
- High-contrast mode (WCAG AAA)
- Data backup (JSON export/import)
- Full data wipe (with typed confirmation)

### 🔐 Authentication (localStorage simulation)
- Register with password strength meter
- Login with SHA-256 password hashing (Web Crypto API)
- Forgot password with time-limited reset code
- Session management via localStorage token
- Demo data auto-seeded on first registration

---

## 🎨 Design System

**Brand palette:**

| Color | Hex | Usage |
|---|---|---|
| Dark Navy | `#071724` | Sidebar, header, navigation |
| Lime Green | `#BDF75C` | Primary CTA, income, success states |
| Light Gray | `#F7F7F7` | Background, cards |
| White | `#FFFFFF` | Content areas |
| Dark Text | `#1A1A1A` | Primary text |

- Clean, flat, premium fintech aesthetic — no background grid patterns, no decorative noise
- Custom brand mark (ascending flow line) used consistently across favicon, topbar, and auth screens
- All icons sourced from [Lucide](https://lucide.dev) — no emoji anywhere in the interface
- Custom-built SVG illustration on auth screens (no stock photography, fully license-free)
- Fluid typography (`clamp()`) — no text clipping at any viewport
- CSS custom properties for theming — dark/light swap in one attribute, with a deepened-navy dark mode that keeps lime as the accent
- Fraunces (display) + Inter (body) + IBM Plex Mono (numbers)
- Custom-styled scrollbars throughout (including inside scrollable modal bodies)
- 60 FPS animations with `prefers-reduced-motion` support
- WCAG AA compliant (AAA in high-contrast mode)
- Keyboard navigable, ARIA labelled, screen-reader friendly
- Modal dialogs scroll *internally* — the header stays pinned and only the form content scrolls, so long forms never break the dialog's shape
- Toast notifications use a fixed, professional width/height regardless of message length — text wraps inside the card instead of stretching it

---

## 🖼️ Icons & Favicon

- **Icons:** [Lucide](https://lucide.dev), loaded via CDN (`unpkg.com/lucide`) and rendered with `lucide.createIcons()`. Every category, navigation, and action icon in the app uses this system — see `icon()` and `refreshIcons()` in `js/app.js`.
- **Favicon:** A custom hand-built SVG mark (`assets/icons/favicon.svg`) — navy rounded square with a lime ascending trend line — rendered at multiple PNG sizes (16/32/180/192/512px) for full browser and OS support, plus a `site.webmanifest` for PWA-style home-screen icons.

---

## 📁 Project Structure

```
personal-finance-manager/
├── index.html                  # Entry point (redirects to dashboard or login)
├── site.webmanifest            # PWA icon manifest
├── pages/
│   ├── login.html
│   ├── register.html
│   ├── forgot-password.html
│   ├── dashboard.html
│   ├── transactions.html
│   ├── budgets.html            # Budgets, goals & recurring
│   ├── reports.html
│   └── settings.html
├── css/
│   ├── style.css               # Design tokens + base + shared components
│   ├── responsive.css          # Breakpoints for all target devices
│   ├── dashboard.css           # Dashboard-specific UI
│   └── auth.css                # Auth page styles
├── js/
│   ├── storage.js              # localStorage abstraction + DB object
│   ├── app.js                  # Shell, toasts, theme, auth guard, modals, icon helper
│   ├── dashboard.js            # Dashboard controller
│   ├── transactions.js         # Transactions CRUD + search/filter/sort
│   ├── budget.js               # Budgets, goals, recurring controller
│   ├── analytics.js            # Chart.js rendering engine
│   ├── reports.js              # Reports controller + CSV/JSON export
│   ├── goals.js                # Goal helper utilities
│   └── settings.js             # Settings controller
└── assets/
    ├── images/
    │   └── finance-illustration.svg   # Custom auth-screen illustration source
    └── icons/
        ├── favicon.svg
        ├── favicon-16.png / favicon-32.png
        ├── apple-touch-icon.png
        └── icon-192.png / icon-512.png
```

---

## 🚀 Quick Start

### Option A — Open directly in browser
```bash
open index.html
```

### Option B — Local dev server (recommended)
```bash
npx serve .
# or
python -m http.server 8080
```
Then visit `http://localhost:8080`.

---

## 📱 Responsive Targets

| Category | Devices |
|---|---|
| Mobile S | iPhone SE (375px) |
| Mobile M | iPhone XR, 12 Pro, Pixel 7, Samsung S8+ |
| Mobile L | iPhone 14 Pro Max, Samsung A51/A71 |
| Tablet | iPad Mini, Air, Pro |
| Foldable | Surface Duo, Galaxy Z Fold 5, Asus ZenBook Fold |
| Desktop | Surface Pro 7, Nest Hub, Nest Hub Max |
| Large | 1920px monitors, 2K, 4K |

---

## 🌐 Deployment

### Netlify
```bash
npm install -g netlify-cli
netlify deploy --dir . --prod
```

### Vercel
```bash
npm install -g vercel
vercel --prod
```

### GitHub Pages
```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/moneyflow.git
git push -u origin main
# Enable Pages in repo Settings → Pages → Branch: main / root
```

Any static host works — upload all files maintaining the directory structure.

---

## 🔑 Currency Support

| Code | Symbol | Name |
|---|---|---|
| USD | $ | US Dollar |
| EUR | € | Euro |
| GBP | £ | British Pound |
| INR | ₹ | Indian Rupee |
| ZWL | ZiG | Zimbabwe Gold |

Amounts are stored internally in USD and converted for display using fixed reference rates. Swap `CURRENCIES.toUSD` values in `storage.js` for live FX API rates if needed.

---

## 🛡️ Security Notes

- Passwords are hashed with **SHA-256 via the Web Crypto API** — plain text is never stored
- All data lives in **your browser's localStorage only** — nothing is sent to any server
- For production use, replace `storage.js` with real API calls and server-side auth
- Backup files contain financial data — treat them like sensitive documents

---

## ♿ Accessibility

- `prefers-reduced-motion` respected — all animations disabled for users who need it
- `aria-label`, `aria-live`, `aria-current`, `aria-expanded`, `role` on all interactive elements
- Skip-to-content link (`Tab` on first focus)
- All form fields have associated `<label>` elements
- Keyboard-navigable sidebar, modals, tables
- High-contrast mode toggle (WCAG AAA ratios)
- `focus-visible` styling — keyboard focus always visible

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 (semantic) |
| Styles | CSS3 — custom properties, `clamp()`, Grid, Flexbox, backdrop-filter |
| Logic | Vanilla JavaScript ES6+ (modules, async/await, Web Crypto) |
| Charts | Chart.js 4.4 (CDN) |
| Icons | Lucide (CDN) |
| Fonts | Google Fonts (Fraunces, Inter, IBM Plex Mono) |
| Storage | localStorage |
| Auth | localStorage + SHA-256 (demo only) |
| Build | None — zero dependencies, zero bundler |

---

## 📄 License

MIT — use freely for personal and commercial projects.

---

*Built with care — MoneyFlow*

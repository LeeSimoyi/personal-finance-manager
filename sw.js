/* ============================================================
   sw.js  — MoneyFlow V2.0 Service Worker
   Strategy: Cache-first for static assets, network-first for pages.
   All localStorage data is client-side; SW only caches shell assets.
   ============================================================ */

const CACHE_NAME = 'moneyflow-v2.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pages/login.html',
  '/pages/register.html',
  '/pages/forgot-password.html',
  '/pages/dashboard.html',
  '/pages/transactions.html',
  '/pages/budgets.html',
  '/pages/reports.html',
  '/pages/settings.html',
  '/pages/financial-health.html',
  '/pages/subscriptions.html',
  '/pages/debts.html',
  '/pages/investments.html',
  '/pages/calendar.html',
  '/pages/notifications.html',
  '/pages/achievements.html',
  '/css/style.css',
  '/css/responsive.css',
  '/css/dashboard.css',
  '/css/auth.css',
  '/js/storage.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/budget.js',
  '/js/analytics.js',
  '/js/reports.js',
  '/js/settings.js',
  '/js/goals.js',
  '/js/command-palette.js',
  '/js/achievements.js',
  '/js/notifications-engine.js',
  '/assets/icons/favicon.svg',
  '/assets/icons/favicon-32.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/images/finance-illustration.svg',
  '/site.webmanifest',
];

/* Install — pre-cache all static shell assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(() => {
      // Partial cache failure is acceptable — we degrade gracefully
    })
  );
  self.skipWaiting();
});

/* Activate — delete old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch — stale-while-revalidate for HTML pages; cache-first for static assets */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (CDN fonts, Lucide, Chart.js)
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations (always get fresh HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});

/* Background sync for deferred writes (future use) */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

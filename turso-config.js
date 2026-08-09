/* CASH TOP 2 — Turso/libSQL browser configuration
 * Static-web mode: the application talks to Turso over HTTPS directly.
 * IMPORTANT: the auth token below is visible to anyone who can read the site's JS.
 */
(() => {
  'use strict';

  const TURSO_DATABASE_URL = 'libsql://cash-top-homworkhhh76-rgb.aws-eu-west-1.turso.io';
  const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODUwODYwNTIsImlkIjoiMDE5ZjlmNjYtOTQwMS03MmEwLTkyNzItYjVhZjA2ODczZmIyIiwia2lkIjoicVgzS01DZ0pwQnp3eGo1Tzl2SHhaWUJGem9sTWFsa24tTU5JOTRlMTl6YyIsInJpZCI6ImQxZmE2MjhjLThiYTMtNDJhNS04MzhmLTc1MGJhNGQwYWE1YiJ9.Dl9BkY70zPZCzGnf_MHg2A7GtWsnd6BRGQoUyEeEPIz3BWbkDj70xD-B7x5U5VG8aBoiljNtCpg0OHJCjnuoAA';

  const bridgeBase = ['http:', 'https:'].includes(location.protocol)
    ? `${location.origin}/__turso_rtdb__`
    : 'https://local.cashtop.invalid/__turso_rtdb__';

  window.CASHTOP_TURSO = Object.freeze({
    enabled: true,
    authMode: 'database-first',
    syncMode: 'turso-http-rtdb',
    backendMode: 'turso-http-rtdb',
    backendName: 'Turso / libSQL',
    rootPath: 'cashTopExchange/cashTopPOS',
    adminRootPath: 'cashTopExchange/cashTopAdmin',
    legacyRootPaths: Object.freeze(['cashTopPOS/v6']),
    usagePolicy: Object.freeze({
      remoteCheckMs: 15000,
      navigationCheckMs: 5000,
      fullRefreshMs: 86400000,
      writeDebounceMs: 1800,
      cloudAudit: false
    }),
    config: Object.freeze({
      databaseURL: bridgeBase,
      databaseURLs: Object.freeze([bridgeBase]),
      projectId: 'cash-top-turso-2026-r74',
    }),
    turso: Object.freeze({
      databaseURL: TURSO_DATABASE_URL,
      authToken: TURSO_AUTH_TOKEN,
      table: 'cashtop_rtdb'
    }),
    collections: Object.freeze({ licenses: 'licenses', users: 'users', companies: 'companies' })
  });
})();

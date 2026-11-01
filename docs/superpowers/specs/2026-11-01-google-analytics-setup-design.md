# Google Analytics Integration Design

## Intent & Why
Integrate Google Analytics 4 (GA4) with measurement ID `G-MXKX0DL7ZV` into Team Parlay using the Firebase Web SDK (`firebase/analytics`). This allows tracking user visits and interactions in production while ensuring local development, unit tests, and Content Security Policy headers remain clean and compliant.

## Goals & Non-Goals
* **Goals:**
  * Add `VITE_FIREBASE_MEASUREMENT_ID` configuration to `firebaseConfig` and export an initialized `analytics` instance / promise using `isSupported()`.
  * Support `G-MXKX0DL7ZV` across local environment configuration (`.env.example`) and automated Cloud Build deployment (`cloudbuild.yaml`).
  * Expand `firebase.json` Content Security Policy (CSP) headers so `https://*.googletagmanager.com` and `https://*.google-analytics.com` are permitted in `script-src` and `connect-src`.
  * Verify frontend unit tests and type checks pass cleanly without unintended analytics execution in test environments.
* **Non-Goals:**
  * Injecting global raw `<script>` tags into `index.html`.
  * Instrumenting custom event logging across every component in this initial setup (only standard page/app initialization).

## Approaches Considered
* **Approach 1: Firebase Web SDK (`firebase/analytics`) — Selected:**
  * Clean integration with existing `firebase.ts` module.
  * Conditional `isSupported()` check prevents errors in Node test environments (Vitest) and unsupported browsers.
  * Environment-variable driven via Vite.
* **Approach 2: Raw `gtag.js` script tag in `index.html` — Rejected:**
  * Bypasses Firebase SDK, hardcodes ID in HTML, and fires untracked sessions during local development unless complex conditional templating is added.

## Implementation Details
1. **Frontend Firebase Service (`frontend/src/services/firebase.ts`):**
   * Import `getAnalytics, isSupported` from `firebase/analytics`.
   * Add `measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-MXKX0DL7ZV'` to `firebaseConfig`.
   * Initialize analytics conditionally if `isSupported()` resolves true and not running in emulator mode.
   * Export `analyticsPromise` and helper `logAnalyticsEvent(name, params)`.
2. **Environment Configuration (`frontend/.env.example`):**
   * Add `VITE_FIREBASE_MEASUREMENT_ID="G-MXKX0DL7ZV"`.
3. **Automated CI/CD (`cloudbuild.yaml`):**
   * Add `_VITE_FIREBASE_MEASUREMENT_ID: 'G-MXKX0DL7ZV'` to substitutions.
   * Inject `VITE_FIREBASE_MEASUREMENT_ID=${_VITE_FIREBASE_MEASUREMENT_ID}` into the `test-and-build-frontend` step env.
4. **Content Security Policy (`firebase.json`):**
   * Update `script-src`: add `https://*.googletagmanager.com` and `https://*.google-analytics.com`.
   * Update `connect-src`: add `https://*.google-analytics.com` and `https://*.analytics.google.com` and `https://*.googletagmanager.com`.
5. **Testing & Verification:**
   * Run `npm test` and `npx tsc --noEmit` in `frontend` to verify all tests and type checks pass.

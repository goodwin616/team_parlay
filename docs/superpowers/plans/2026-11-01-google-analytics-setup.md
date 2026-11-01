# Google Analytics Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Google Analytics 4 (`G-MXKX0DL7ZV`) via `firebase/analytics` into Team Parlay, update CSP headers, and configure CI/CD.

**Architecture:** Initialize `firebase/analytics` conditionally using `isSupported()` within `frontend/src/services/firebase.ts`. Provide measurement ID via `VITE_FIREBASE_MEASUREMENT_ID` with default `'G-MXKX0DL7ZV'`, update `firebase.json` CSP to permit Google Analytics & Tag Manager traffic, and ensure Cloud Build substitutions inject the ID during production builds.

**Tech Stack:** Firebase Web SDK 12 (`firebase/analytics`), Vite, React 18, TypeScript, Vitest, Google Cloud Build.

**Spec:** [`docs/superpowers/specs/2026-11-01-google-analytics-setup-design.md`](file:///Users/blakegoodwin/.gemini/antigravity/worktrees/team_parlay/verify_google_analytics_setup/docs/superpowers/specs/2026-11-01-google-analytics-setup-design.md)

## Global Constraints

- Firebase measurement ID: `G-MXKX0DL7ZV`
- Environment variable name: `VITE_FIREBASE_MEASUREMENT_ID`
- Must not break unit tests running in headless/Node/Vitest environments where `window` or indexedDB may be absent.
- Content Security Policy in `firebase.json` must allow `https://*.googletagmanager.com` and `https://*.google-analytics.com` for script and connection endpoints.

## Review Focus

1. Vitest runner environment where IndexedDB / browser APIs are mocked or missing: `isSupported()` must resolve false and prevent crash.
2. Production browser runtime: `isSupported()` resolves true and initializes Firebase Analytics.
3. Content Security Policy headers: Ensure `script-src` and `connect-src` whitelist GA4 and GTM domains without loosening other security restrictions.
4. Cloud Build deployment step: Ensure substitution `_VITE_FIREBASE_MEASUREMENT_ID` is passed into `test-and-build-frontend`.
5. Local mock/emulator mode: Analytics tracking should safely bypass or no-op when connecting to local emulators.

---

### Task 1: Update CSP, Environment Config, and Cloud Build

**Files:**
- Modify: `firebase.json:25-28`
- Modify: `frontend/.env.example:7-12`
- Modify: `cloudbuild.yaml:46-52,128-134`

**Interfaces:**
- Consumes: `G-MXKX0DL7ZV`
- Produces: `VITE_FIREBASE_MEASUREMENT_ID` in frontend environment and Cloud Build substitutions; CSP rules in `firebase.json`.

- [ ] **Step 1: Update `firebase.json` Content Security Policy**
Update `Content-Security-Policy` header in `firebase.json`:
Add `https://*.googletagmanager.com` to `script-src`.
Add `https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com` to `connect-src`.
Add `https://*.google-analytics.com https://*.googletagmanager.com` to `img-src`.

- [ ] **Step 2: Update `frontend/.env.example`**
Add `VITE_FIREBASE_MEASUREMENT_ID="G-MXKX0DL7ZV"` to `frontend/.env.example`.

- [ ] **Step 3: Update `cloudbuild.yaml`**
Add `_VITE_FIREBASE_MEASUREMENT_ID: 'G-MXKX0DL7ZV'` under `substitutions:`.
Pass `VITE_FIREBASE_MEASUREMENT_ID=${_VITE_FIREBASE_MEASUREMENT_ID}` in `test-and-build-frontend` step env.

- [ ] **Step 4: Verify JSON and YAML syntax**
Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json'))"`
Expected: No errors.

---

### Task 2: Implement Firebase Analytics Service and Unit Tests

**Files:**
- Modify: `frontend/src/services/firebase.ts:1-20`
- Create: `frontend/src/tests/analytics.test.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_FIREBASE_MEASUREMENT_ID`
- Produces: `analyticsPromise: Promise<Analytics | null>`, `logAnalyticsEvent(eventName: string, eventParams?: Record<string, any>): Promise<void>`

- [ ] **Step 1: Write unit tests in `frontend/src/tests/analytics.test.ts`**
Write tests verifying:
1. `firebaseConfig` includes `measurementId`.
2. `analyticsPromise` resolves safely (to `null` or `Analytics` object) without throwing errors in test environment.
3. `logAnalyticsEvent` executes without throwing in non-browser or test environments.

- [ ] **Step 2: Run test to verify initial failure / behavior**
Run: `cd frontend && npm test -- src/tests/analytics.test.ts --run`

- [ ] **Step 3: Implement analytics initialization in `frontend/src/services/firebase.ts`**
1. Import `getAnalytics, isSupported, logEvent, Analytics` from `firebase/analytics`.
2. Add `measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-MXKX0DL7ZV'` to `firebaseConfig`.
3. Create `analyticsPromise`:
```ts
export const analyticsPromise: Promise<Analytics | null> =
  typeof window !== 'undefined'
    ? isSupported().then((supported) => (supported ? getAnalytics(app) : null)).catch(() => null)
    : Promise.resolve(null);

export async function logAnalyticsEvent(eventName: string, eventParams?: Record<string, any>) {
  try {
    const analytics = await analyticsPromise;
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch {
    // Fail-safe: analytics logging should never crash user actions
  }
}
```

- [ ] **Step 4: Run all frontend tests and type checks**
Run: `cd frontend && npm test -- --run && npx tsc --noEmit`
Expected: PASS for all tests and clean compilation.

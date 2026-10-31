# Design: GCP Cloud Build Change-Based Firebase Deployment

## 1. Intent & Why
Replace manual CLI builds and deployments with a GCP-native **Google Cloud Build** pipeline (`cloudbuild.yaml`) triggered automatically on pushes to the `main` branch of `goodwin616/team_parlay`. Running inside the `goodwin-team-parlay` GCP project avoids exporting long-lived service account JSON keys to GitHub while deploying only the Firebase targets whose source files changed.

## 2. Goals, Non-Goals, and Anti-Goals
- **Goals**:
  - Automatically detect which targets (`hosting`, `functions`, `firestore:rules`) have changes on push to `main`.
  - Run automated verification (`vitest` + `tsc` for frontend changes; `pytest` for backend changes) before deploying.
  - Deploy only the modified targets to `goodwin-team-parlay` in a single `firebase deploy --only <targets>` command.
  - Document the one-time GCP Cloud Build trigger and IAM setup in `README.md`.
- **Non-Goals**:
  - Migrating from classic Firebase Hosting to Firebase App Hosting (Cloud Run SSR).
  - Modifying application runtime code in `frontend/src/` or `functions/*.py`.
- **Anti-Goals**:
  - Deploying an unconfigured frontend build that silently falls back to mock league data when `VITE_FIREBASE_API_KEY` is missing.
  - Exporting static service account JSON keys out of GCP.
  - Re-deploying slow Python Cloud Functions when only frontend or documentation files changed.

## 3. Constraints
- `firebase.json` specifies `python314` for `functions` and `frontend/dist` for `hosting`.
- Cloud Build performs a shallow checkout by default, so `git fetch --depth=2 origin main` is required to compare `HEAD~1..HEAD` (falling back to all targets if `HEAD~1` is unavailable or if `firebase.json` / `cloudbuild.yaml` / `.firebaserc` changed).
- Frontend production builds require `VITE_FIREBASE_*` environment variables injected via Cloud Build substitution variables (`_VITE_FIREBASE_*`).

## 4. Approaches Considered
- **Approach A: Single Cloud Build Trigger + `git diff` Target Detection (Selected)**
  - One trigger on `main` runs `cloudbuild.yaml`, inspects changed paths between `HEAD~1` and `HEAD`, runs tests/builds only for changed components, and executes a single `firebase deploy --only <targets>` command.
  - *Tradeoff*: Requires a short bash diff helper in `cloudbuild.yaml`, but keeps CI/CD to a single GCP trigger and prevents concurrent `firebase deploy` races when a commit touches multiple directories.
- **Approach B: Three Separate Cloud Build Triggers with `includedFiles` Filters**
  - Three independent triggers in GCP (`deploy-hosting`, `deploy-functions`, `deploy-rules`), each filtering by path glob.
  - *Tradeoff*: Simpler individual YAML files, but requires managing three triggers and risks parallel `firebase deploy` runs colliding on multi-directory commits.

## 5. Decided Architecture & Behavior
1. **Change Detection Step (`detect-changes`)**:
   - Compares `HEAD~1..HEAD` (or deploys all targets if `firebase.json`, `.firebaserc`, or `cloudbuild.yaml` changed).
   - Writes flags to `/workspace/.ci_targets`:
     - `frontend/**` → `hosting`
     - `functions/**` → `functions`
     - `firestore.rules` → `firestore:rules`
   - Fails fast if `hosting` is queued and `_VITE_FIREBASE_API_KEY` is empty so a broken mock-mode bundle is never deployed to production.
2. **Conditional Frontend Step (`test-and-build-frontend`)**:
   - Runs in `node:20` only when `hosting` is queued.
   - Executes `npm ci`, `npm test -- --run`, `npx tsc --noEmit`, and `npm run build` with `VITE_FIREBASE_*` populated from trigger substitutions.
3. **Conditional Backend Step (`test-and-prep-functions`)**:
   - Runs in `python:3.14-slim` only when `functions` is queued.
   - Creates `functions/venv`, installs `functions/requirements.txt` and `functions/dev-requirements.txt`, runs `pytest functions/tests`, and writes `functions/.env` (`MAX_LEG_ODDS_PERCENT=${_MAX_LEG_ODDS_PERCENT}`).
4. **Unified Deploy Step (`firebase-deploy`)**:
   - If no targets are queued (e.g., docs-only change), exits cleanly.
   - If `functions` is in the target list, installs Node.js + `firebase-tools` in a `python:3.14-slim` container (or uses pre-installed runtime) so `firebase deploy` can inspect the `python314` functions virtualenv; otherwise runs `firebase-tools` directly in `node:20` to deploy `--only <targets> --project $PROJECT_ID`.

## 6. Builder Calls (Defaults Chosen)
- Track `.firebaserc` with `{"projects": {"default": "goodwin-team-parlay"}}` so both local CLI and Cloud Build resolve the project consistently.
- Include a helper script (`scripts/ci_detect_changes.sh`) with unit tests so the `git diff` target resolution logic is testable locally and in CI.
- Document the exact `gcloud` commands in `README.md` to grant Cloud Build IAM roles and create the GitHub `main` trigger with `_VITE_FIREBASE_*` substitutions.

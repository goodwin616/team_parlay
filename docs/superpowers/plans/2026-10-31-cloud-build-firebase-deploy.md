# GCP Cloud Build Firebase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate change-based Firebase deployments (`hosting`, `functions`, `firestore:rules`) from the `main` branch using a single Google Cloud Build pipeline (`cloudbuild.yaml`).

**Architecture:** A testable bash script (`scripts/ci_detect_changes.sh`) inspects `git diff --name-only HEAD~1 HEAD` and emits target flags (`DEPLOY_HOSTING`, `DEPLOY_FUNCTIONS`, `DEPLOY_RULES`, `DEPLOY_TARGETS`) to `.ci_targets`. `cloudbuild.yaml` runs `detect-changes`, conditionally executes frontend tests/build (`node:20`) and backend tests/venv setup (`python:3.14-slim`), and deploys only the changed targets to `goodwin-team-parlay`.

**Tech Stack:** Google Cloud Build (`cloudbuild.yaml`), Bash, Firebase CLI (`firebase-tools`), Node.js 20, Python 3.14, Pytest.

**Spec:** `docs/superpowers/specs/2026-10-31-cloud-build-firebase-deploy-design.md`

## Global Constraints

- Default Firebase project in `.firebaserc` must be `"goodwin-team-parlay"`.
- `firebase.json` specifies `runtime: "python314"` for `functions` and `public: "frontend/dist"` for `hosting`.
- If `hosting` is queued for deploy and `REQUIRE_VITE_ENV=1` is set with an empty `VITE_FIREBASE_API_KEY`, `scripts/ci_detect_changes.sh` must exit `1` to prevent deploying a mock-mode frontend build.
- Docs/assets-only changes (`README.md`, `PRIVACY.md`, `LICENSE`, `docs/**`, `assets/**`) must result in `DEPLOY_TARGETS=""` and exit `0` without deploying.

## Review Focus

- Root infrastructure file changes (`firebase.json`, `.firebaserc`, `cloudbuild.yaml`, `scripts/ci_detect_changes.sh`) must trigger all three targets (`hosting,functions,firestore:rules`).
- Shallow clone fallback: when `HEAD~1` does not exist (e.g., initial commit or shallow clone where fetch fails) and `CHANGED_FILES` is not set, `scripts/ci_detect_changes.sh` must fall back to deploying all targets (`hosting,functions,firestore:rules`).
- Whitespace-only `VITE_FIREBASE_API_KEY` (e.g. `"   "`) when `DEPLOY_HOSTING=true` and `REQUIRE_VITE_ENV=1` must be rejected with exit code `1`.
- Commits touching multiple targets (e.g., `frontend/src/App.tsx` and `firestore.rules`) must preserve canonical target ordering (`hosting,firestore:rules`) without duplicates.
- Empty diff (`CHANGED_FILES=""` with `FORCE_EMPTY_DIFF=1`) must produce `DEPLOY_TARGETS=""` and all `DEPLOY_*=false`.

---

### Task 1: Change Detection Script & Unit Tests

**Files:**
- Create: `scripts/ci_detect_changes.sh`
- Modify: `.gitignore`
- Test: `functions/tests/test_ci_detect_changes.py`

**Interfaces:**
- Produces: `scripts/ci_detect_changes.sh` reading optional env vars `CHANGED_FILES`, `FORCE_EMPTY_DIFF`, `CI_TARGETS_FILE` (default `.ci_targets`), `REQUIRE_VITE_ENV` (`0` or `1`), and `VITE_FIREBASE_API_KEY`, writing key-value lines (`DEPLOY_HOSTING=true|false`, `DEPLOY_FUNCTIONS=true|false`, `DEPLOY_RULES=true|false`, `DEPLOY_TARGETS=<csv>`) to `CI_TARGETS_FILE`.

- [ ] **Step 1: Write the failing test in `functions/tests/test_ci_detect_changes.py`**

```python
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "ci_detect_changes.sh"


def run_detect(tmp_path, changed_files=None, extra_env=None):
    out_file = tmp_path / ".ci_targets"
    env = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin",
        "CI_TARGETS_FILE": str(out_file),
    }
    if changed_files is not None:
        env["CHANGED_FILES"] = "\n".join(changed_files)
        if len(changed_files) == 0:
            env["FORCE_EMPTY_DIFF"] = "1"
    if extra_env:
        env.update(extra_env)
    proc = subprocess.run(
        ["bash", str(SCRIPT_PATH)],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    parsed = {}
    if out_file.exists():
        for line in out_file.read_text().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                parsed[k.strip()] = v.strip()
    return proc, parsed


def test_frontend_only_change(tmp_path):
    proc, targets = run_detect(tmp_path, ["frontend/src/App.tsx", "frontend/package.json"])
    assert proc.returncode == 0
    assert targets == {
        "DEPLOY_HOSTING": "true",
        "DEPLOY_FUNCTIONS": "false",
        "DEPLOY_RULES": "false",
        "DEPLOY_TARGETS": "hosting",
    }


def test_functions_only_change(tmp_path):
    proc, targets = run_detect(tmp_path, ["functions/main.py"])
    assert proc.returncode == 0
    assert targets == {
        "DEPLOY_HOSTING": "false",
        "DEPLOY_FUNCTIONS": "true",
        "DEPLOY_RULES": "false",
        "DEPLOY_TARGETS": "functions",
    }


def test_rules_only_change(tmp_path):
    proc, targets = run_detect(tmp_path, ["firestore.rules"])
    assert proc.returncode == 0
    assert targets == {
        "DEPLOY_HOSTING": "false",
        "DEPLOY_FUNCTIONS": "false",
        "DEPLOY_RULES": "true",
        "DEPLOY_TARGETS": "firestore:rules",
    }


def test_docs_only_skips_all(tmp_path):
    proc, targets = run_detect(
        tmp_path,
        ["README.md", "docs/superpowers/specs/design.md", "assets/screenshot.png", "PRIVACY.md"],
    )
    assert proc.returncode == 0
    assert targets == {
        "DEPLOY_HOSTING": "false",
        "DEPLOY_FUNCTIONS": "false",
        "DEPLOY_RULES": "false",
        "DEPLOY_TARGETS": "",
    }


def test_root_config_change_triggers_all(tmp_path):
    for cfg in ["firebase.json", ".firebaserc", "cloudbuild.yaml", "scripts/ci_detect_changes.sh"]:
        proc, targets = run_detect(tmp_path, [cfg])
        assert proc.returncode == 0
        assert targets["DEPLOY_TARGETS"] == "hosting,functions,firestore:rules"


def test_multi_target_deduplicates_and_orders(tmp_path):
    proc, targets = run_detect(
        tmp_path,
        ["firestore.rules", "frontend/src/index.css", "frontend/vite.config.ts"],
    )
    assert proc.returncode == 0
    assert targets["DEPLOY_TARGETS"] == "hosting,firestore:rules"


def test_empty_diff_produces_no_targets(tmp_path):
    proc, targets = run_detect(tmp_path, [])
    assert proc.returncode == 0
    assert targets["DEPLOY_TARGETS"] == ""


def test_require_vite_env_rejects_missing_or_whitespace_api_key(tmp_path):
    proc, _ = run_detect(
        tmp_path,
        ["frontend/src/App.tsx"],
        extra_env={"REQUIRE_VITE_ENV": "1", "VITE_FIREBASE_API_KEY": "   "},
    )
    assert proc.returncode == 1
    assert "VITE_FIREBASE_API_KEY" in (proc.stderr + proc.stdout)


def test_require_vite_env_allows_functions_only_without_api_key(tmp_path):
    proc, targets = run_detect(
        tmp_path,
        ["functions/odds_engine.py"],
        extra_env={"REQUIRE_VITE_ENV": "1", "VITE_FIREBASE_API_KEY": ""},
    )
    assert proc.returncode == 0
    assert targets["DEPLOY_TARGETS"] == "functions"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `functions/venv/bin/pytest functions/tests/test_ci_detect_changes.py -v`
Expected: FAIL because `scripts/ci_detect_changes.sh` does not exist yet.

- [ ] **Step 3: Implement `scripts/ci_detect_changes.sh` and ignore `.ci_targets` in `.gitignore`**

Create `scripts/ci_detect_changes.sh` (`chmod +x`) that:
- Reads `CHANGED_FILES` if set (or empty when `FORCE_EMPTY_DIFF=1`), otherwise runs `git diff --name-only HEAD~1 HEAD`, falling back to `DEPLOY_HOSTING=true`, `DEPLOY_FUNCTIONS=true`, `DEPLOY_RULES=true` if `git diff` fails.
- Matches each line with `case`:
  - `firebase.json|.firebaserc|cloudbuild.yaml|scripts/ci_detect_changes.sh` -> all three `true`
  - `frontend/*` -> `DEPLOY_HOSTING=true`
  - `functions/*` -> `DEPLOY_FUNCTIONS=true`
  - `firestore.rules` -> `DEPLOY_RULES=true`
- Validates `if [ "$DEPLOY_HOSTING" = "true" ] && [ "${REQUIRE_VITE_ENV:-0}" = "1" ]` that `${VITE_FIREBASE_API_KEY//[[:space:]]/}` is non-empty, else prints error to stderr and exits `1`.
- Writes `DEPLOY_HOSTING`, `DEPLOY_FUNCTIONS`, `DEPLOY_RULES`, and `DEPLOY_TARGETS` to `${CI_TARGETS_FILE:-.ci_targets}`.
- Append `.ci_targets` to `.gitignore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `functions/venv/bin/pytest functions/tests/test_ci_detect_changes.py -v`
Expected: PASS (9 passed).

---

### Task 2: `.firebaserc`, `cloudbuild.yaml`, and `README.md` Setup Guide

**Files:**
- Create: `.firebaserc`
- Create: `cloudbuild.yaml`
- Modify: `README.md:257-286`
- Modify: `functions/tests/test_ci_detect_changes.py`

**Interfaces:**
- Consumes: `scripts/ci_detect_changes.sh` and `.ci_targets` from Task 1.
- Produces: `.firebaserc` (`default: goodwin-team-parlay`), `cloudbuild.yaml` with 5 steps (`detect-changes`, `test-and-build-frontend`, `test-and-prep-functions`, `deploy-hosting-and-rules`, `deploy-functions`), and Cloud Build setup documentation in `README.md`.

- [ ] **Step 1: Add configuration verification tests to `functions/tests/test_ci_detect_changes.py`**

```python
import json


def test_firebaserc_points_to_goodwin_team_parlay():
    firebaserc = json.loads((REPO_ROOT / ".firebaserc").read_text())
    assert firebaserc == {"projects": {"default": "goodwin-team-parlay"}}


def test_cloudbuild_yaml_defines_expected_steps_and_substitutions():
    content = (REPO_ROOT / "cloudbuild.yaml").read_text()
    for step_id in [
        "id: 'detect-changes'",
        "id: 'test-and-build-frontend'",
        "id: 'test-and-prep-functions'",
        "id: 'deploy-hosting-and-rules'",
        "id: 'deploy-functions'",
    ]:
        assert step_id in content
    for sub in [
        "_VITE_FIREBASE_API_KEY",
        "_VITE_FIREBASE_AUTH_DOMAIN",
        "_VITE_FIREBASE_STORAGE_BUCKET",
        "_VITE_FIREBASE_MESSAGING_SENDER_ID",
        "_VITE_FIREBASE_APP_ID",
        "_MAX_LEG_ODDS_PERCENT",
    ]:
        assert sub in content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `functions/venv/bin/pytest functions/tests/test_ci_detect_changes.py -v`
Expected: FAIL with `FileNotFoundError` for `.firebaserc` and `cloudbuild.yaml`.

- [ ] **Step 3: Create `.firebaserc`, `cloudbuild.yaml`, and update `README.md`**

1. Create `.firebaserc`:
```json
{
  "projects": {
    "default": "goodwin-team-parlay"
  }
}
```
2. Create `cloudbuild.yaml` with:
   - `detect-changes` (`gcr.io/cloud-builders/git`): fetches `origin main --depth=2 || true` and runs `REQUIRE_VITE_ENV=1 VITE_FIREBASE_API_KEY="${_VITE_FIREBASE_API_KEY}" bash scripts/ci_detect_changes.sh`.
   - `test-and-build-frontend` (`node:20`): sources `.ci_targets`; if `DEPLOY_HOSTING=true`, runs `npm ci`, `npm test -- --run`, `npx tsc --noEmit`, `npm run build` in `frontend/`.
   - `test-and-prep-functions` (`python:3.14-slim`): sources `.ci_targets`; if `DEPLOY_FUNCTIONS=true`, creates `functions/venv`, installs `functions/requirements.txt` and `functions/dev-requirements.txt`, runs `functions/venv/bin/pytest functions/tests`, and writes `MAX_LEG_ODDS_PERCENT=${_MAX_LEG_ODDS_PERCENT}` to `functions/.env`.
   - `deploy-hosting-and-rules` (`node:20`): sources `.ci_targets`; builds comma-separated list from `DEPLOY_HOSTING` (`hosting`) and `DEPLOY_RULES` (`firestore:rules`); if non-empty, runs `npx -y firebase-tools@latest deploy --only "$TARGETS" --project "$PROJECT_ID" --non-interactive`.
   - `deploy-functions` (`python:3.14-slim`): sources `.ci_targets`; if `DEPLOY_FUNCTIONS=true`, installs Node.js 20 and runs `npx -y firebase-tools@latest deploy --only functions --project "$PROJECT_ID" --non-interactive`.
   - Default `substitutions` block with `_MAX_LEG_ODDS_PERCENT: '55'` and empty defaults for `_VITE_FIREBASE_*`, plus `options: logging: CLOUD_LOGGING_ONLY`.
3. Update `README.md` (`## Deployment` section) with instructions for Automated Deployment via Google Cloud Build (`cloudbuild.yaml`, IAM roles, and `gcloud builds triggers create github`) alongside Manual CLI Deployment.

- [ ] **Step 4: Run full frontend and backend test suites to verify everything passes**

Run:
- `functions/venv/bin/pytest functions/tests -v`
- `cd frontend && npm test -- --run && npx tsc --noEmit && npm run build`
Expected: All backend pytest suites and all 180 frontend Vitest tests pass.

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

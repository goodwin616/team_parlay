#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/ci_detect_changes.sh
# Detects modified components between HEAD~1 and HEAD for Firebase deploy targets:
#   - frontend/**          -> hosting
#   - functions/**         -> functions
#   - firestore.rules      -> firestore:rules
#   - root config files    -> hosting,functions,firestore:rules
# ==============================================================================

TARGETS_FILE="${CI_TARGETS_FILE:-.ci_targets}"

DEPLOY_HOSTING=false
DEPLOY_FUNCTIONS=false
DEPLOY_RULES=false

DIFF_LIST=""

if [ -n "${CHANGED_FILES+x}" ]; then
  DIFF_LIST="$CHANGED_FILES"
elif [ "${FORCE_EMPTY_DIFF:-0}" = "1" ]; then
  DIFF_LIST=""
else
  # Attempt git diff; fall back to deploying all targets if git diff fails
  if ! DIFF_LIST="$(git diff --name-only HEAD~1 HEAD 2>/dev/null)"; then
    echo "Warning: Unable to inspect git diff (shallow clone or initial commit). Queuing all targets." >&2
    DEPLOY_HOSTING=true
    DEPLOY_FUNCTIONS=true
    DEPLOY_RULES=true
  fi
fi

if [ "$DEPLOY_HOSTING" = "false" ] && [ "$DEPLOY_FUNCTIONS" = "false" ] && [ "$DEPLOY_RULES" = "false" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    filepath="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [ -z "$filepath" ] && continue

    case "$filepath" in
      firebase.json|.firebaserc|cloudbuild.yaml|scripts/ci_detect_changes.sh)
        DEPLOY_HOSTING=true
        DEPLOY_FUNCTIONS=true
        DEPLOY_RULES=true
        break
        ;;
      frontend/*)
        DEPLOY_HOSTING=true
        ;;
      functions/*)
        DEPLOY_FUNCTIONS=true
        ;;
      firestore.rules)
        DEPLOY_RULES=true
        ;;
      *)
        # Documentation, specs, plans, screenshots, etc. do not trigger deploys
        ;;
    esac
  done <<< "$DIFF_LIST"
fi

# Validation: If hosting is queued and REQUIRE_VITE_ENV is 1, verify non-empty API key
if [ "$DEPLOY_HOSTING" = "true" ] && [ "${REQUIRE_VITE_ENV:-0}" = "1" ]; then
  RAW_API_KEY="${VITE_FIREBASE_API_KEY:-}"
  TRIMMED_API_KEY="$(echo "$RAW_API_KEY" | tr -d '[:space:]')"
  if [ -z "$TRIMMED_API_KEY" ]; then
    echo "ERROR: Hosting deployment queued, but VITE_FIREBASE_API_KEY is unset or empty." >&2
    echo "Cloud Build trigger substitutions must supply _VITE_FIREBASE_API_KEY to prevent deploying a mock-mode build." >&2
    exit 1
  fi
fi

# Build comma-separated TARGETS list in canonical order
TARGETS=()
[ "$DEPLOY_HOSTING" = "true" ] && TARGETS+=("hosting")
[ "$DEPLOY_FUNCTIONS" = "true" ] && TARGETS+=("functions")
[ "$DEPLOY_RULES" = "true" ] && TARGETS+=("firestore:rules")

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS_CSV=""
else
  TARGETS_CSV="$(IFS=,; echo "${TARGETS[*]}")"
fi

cat <<EOF > "$TARGETS_FILE"
DEPLOY_HOSTING=$DEPLOY_HOSTING
DEPLOY_FUNCTIONS=$DEPLOY_FUNCTIONS
DEPLOY_RULES=$DEPLOY_RULES
DEPLOY_TARGETS=$TARGETS_CSV
EOF

echo "CI target detection complete:"
cat "$TARGETS_FILE"

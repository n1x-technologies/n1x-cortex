#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# cortex-sync.sh — pull N1X Cortex template updates into a consumer repo.
# ───────────────────────────────────────────────────────────────────
# Run from the ROOT of a project that uses Cortex. It reads `.cortex-sync`
# (which artifacts this project adopts and where they live), fetches Cortex,
# and reconciles:
#   • overwrite (engine)  → replaced if changed (e.g. typst template.typ)
#   • notify   (instance) → never touched; flags if the upstream changed
# Brand/instance files (brand.typ, your CONTRIBUTING, etc.) are never edited.
#
# Usage:
#   bash cortex-sync.sh [--check] [-C <repo-dir>]
#     --check   dry run: report what WOULD change, write nothing
#     -C <dir>  run against <dir> instead of the current directory
#
# Bootstrap (no local copy needed):
#   bash <(curl -fsSL https://raw.githubusercontent.com/<org>/n1x-cortex/main/sync/cortex-sync.sh)
#
# Requirements: bash, git, diff, and sha256sum or shasum. Idempotent.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

CHECK=0
REPO="$PWD"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    -C) REPO="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$REPO"
CONFIG=".cortex-sync"
LOCK=".cortex-sync.lock"

if [ ! -f "$CONFIG" ]; then
  cat >&2 <<EOF
✋ No '$CONFIG' here. Create one at the repo root, e.g.:

  cortex_source=../n1x-cortex          # local path OR git URL
  ref=main
  # adopted artifacts:  <id> = <destination path in this repo>
  typst-engine=cortex/templates/typst/template.typ

Available ids: see cortex/sync/manifest. Then re-run this script.
EOF
  exit 1
fi

# ── tiny helpers ────────────────────────────────────────────────────
hash_file() {
  if   command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
# read a key=value setting from the config (first match)
cfg() { grep -E "^$1=" "$CONFIG" | head -1 | cut -d= -f2- | xargs || true; }
# stored lock hash for an id (empty if none)
locked() { [ -f "$LOCK" ] && (grep -E "^$1=" "$LOCK" | head -1 | cut -d= -f2-) || true; }

CORTEX_SOURCE="$(cfg cortex_source)"
REF="$(cfg ref)"; [ -n "$REF" ] || REF="main"
[ -n "$CORTEX_SOURCE" ] || { echo "✋ '$CONFIG' is missing 'cortex_source='." >&2; exit 1; }

# ── resolve the Cortex checkout (local dir or git clone) ────────────
CLONE_TMP=""
cleanup() { if [ -n "$CLONE_TMP" ]; then rm -rf "$CLONE_TMP"; fi; }
trap cleanup EXIT
if [ -d "$CORTEX_SOURCE" ]; then
  CORTEX="$(cd "$CORTEX_SOURCE" && pwd)"
  echo "→ Cortex source: local $CORTEX (ref ignored)"
else
  CLONE_TMP="$(mktemp -d)"
  echo "→ Cloning Cortex ($REF) …"
  git clone --depth 1 --branch "$REF" "$CORTEX_SOURCE" "$CLONE_TMP" >/dev/null 2>&1 \
    || { echo "✋ Could not clone '$CORTEX_SOURCE' (ref '$REF')." >&2; exit 1; }
  CORTEX="$CLONE_TMP"
fi

MANIFEST="$CORTEX/sync/manifest"
[ -f "$MANIFEST" ] || { echo "✋ No sync/manifest in Cortex checkout." >&2; exit 1; }
CORTEX_VER="$( [ -f "$CORTEX/VERSION" ] && tr -d '[:space:]' < "$CORTEX/VERSION" || echo '?')"
HAVE_VER="$( [ -f "$LOCK" ] && (grep -E '^cortex_version=' "$LOCK" | cut -d= -f2-) || echo 'none')"

echo "→ Cortex version: $CORTEX_VER  (this repo last synced: $HAVE_VER)"
[ "$CHECK" = 1 ] && echo "→ --check: dry run, nothing will be written"
echo

# manifest lookup: prints "mode|source" for an id
m_lookup() { grep -E "^$1\|" "$MANIFEST" | head -1 | cut -d'|' -f2,3; }

updated=0; flagged=0; uptodate=0; missing=0
NEWLOCK="$(mktemp)"
echo "cortex_version=$CORTEX_VER" > "$NEWLOCK"

# iterate the artifacts the consumer adopted (id=dest lines that match a manifest id)
while IFS='=' read -r id dest; do
  case "$id" in ''|\#*|cortex_source|ref) continue ;; esac
  dest="$(echo "$dest" | xargs)"
  entry="$(m_lookup "$id")"
  if [ -z "$entry" ]; then echo "  ?  $id — not in manifest, skipped"; continue; fi
  mode="${entry%%|*}"; src_rel="${entry#*|}"
  src="$CORTEX/$src_rel"
  [ -f "$src" ] || { echo "  ?  $id — source missing in Cortex, skipped"; continue; }
  src_hash="$(hash_file "$src")"
  echo "$id=$src_hash" >> "$NEWLOCK"

  if [ "$mode" = "overwrite" ]; then
    if [ ! -f "$dest" ]; then
      echo "  +  $id → $dest  (NEW)"; missing=$((missing+1))
      [ "$CHECK" = 1 ] || { mkdir -p "$(dirname "$dest")"; cp "$src" "$dest"; }
    elif [ "$(hash_file "$dest")" != "$src_hash" ]; then
      echo "  ↑  $id → $dest  (UPDATED)"; updated=$((updated+1))
      [ "$CHECK" = 1 ] || cp "$src" "$dest"
    else
      echo "  =  $id → $dest  (up-to-date)"; uptodate=$((uptodate+1))
    fi
  else # notify
    prev="$(locked "$id")"
    if [ -z "$prev" ]; then
      echo "  i  $id  (instance — tracked from now; reconcile by hand if needed)"
    elif [ "$prev" != "$src_hash" ]; then
      echo "  !  $id  (UPSTREAM CHANGED — instance file, review by hand: $dest)"; flagged=$((flagged+1))
    else
      echo "  =  $id  (instance, upstream unchanged)"; uptodate=$((uptodate+1))
    fi
  fi
done < "$CONFIG"

echo
if [ "$CHECK" = 1 ]; then
  echo "Summary (dry run): $updated to update · $missing new · $flagged upstream-changed · $uptodate ok"
  rm -f "$NEWLOCK"
else
  mv "$NEWLOCK" "$LOCK"
  echo "Summary: $updated updated · $missing new · $flagged flagged · $uptodate ok  →  $LOCK written (v$CORTEX_VER)"
fi
if [ "$flagged" -gt 0 ]; then
  echo "Note: '!' files are localized instances — Cortex changed upstream; merge the bits you want by hand."
fi
exit 0

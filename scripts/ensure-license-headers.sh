#!/usr/bin/env bash
# Pre-commit hook script — ensures every staged .ts/.tsx/.js/.jsx file has a
# license reference before the commit is recorded.
#
# Header format: SPDX identifier only, no per-file copyright line. Per ASF's
# own current practice (apache.org/legal/src-headers.html), a copyright line
# on every file is not recommended — it goes stale the moment someone else
# touches the file. Copyright is tracked collectively in NOTICE + AUTHORS.
#
# Header selection, in priority order:
#   1. File already has an old-style prose-block header (`/* ... Copyright
#      (c) 2026 ... */`) → classify from ITS TEXT, not from an `upstream`
#      remote (none is configured in this repo — see note below):
#        - mentions MIT *and* Apache/Murici/Danilo → MODIFIED LEGACY →
#          Apache-2.0 AND MIT (MIT requires the original notice be retained;
#          see NOTICE at repo root)
#        - mentions MIT only, no Apache/Murici/Danilo → UNMODIFIED LEGACY,
#          never touched by this project → header left alone, untouched
#        - otherwise → sole Murici copyright → Apache-2.0
#      This replaces the old block with the SPDX line — opportunistic, not a
#      repo-wide retrofit: files nobody touches keep their old (still valid)
#      header until they are.
#   2. File has no header at all (brand new) → best-effort check against an
#      `upstream` remote if one happens to be configured locally; otherwise
#      defaults to Apache-2.0, which is correct for a genuinely new file.
#
# The script re-stages files it modifies so the header lands in the same commit.
set -euo pipefail

APACHE_HEADER='// SPDX-License-Identifier: Apache-2.0'

MIXED_HEADER='// SPDX-License-Identifier: Apache-2.0 AND MIT
// Portions from Chatbot UI (McKay Wrigley) — see NOTICE'

HEADER_MARKER='SPDX-License-Identifier|Copyright'

# --check mode (used by CI): verify every tracked source file carries a
# license header (either the new SPDX form or the old grandfathered block).
# Read-only — never modifies files; exits 1 if any lack one. Independent of
# the local hook so `--no-verify` / a missing hook can't merge unlicensed code.
if [[ "${1:-}" == "--check" ]]; then
  missing=0
  while IFS= read -r f; do
    [[ -z "$f" || ! -f "$f" ]] && continue
    case "$f" in
      public/worker*|dist-electron/*|electron-dist/*|.next/*) continue ;;
    esac
    if ! head -10 "$f" | grep -qE "$HEADER_MARKER"; then
      echo "  [license:MISSING] $f"
      missing=$((missing + 1))
    fi
  done <<< "$(git ls-files -- '*.ts' '*.tsx' '*.js' '*.jsx')"
  if [[ $missing -gt 0 ]]; then
    echo "ERROR: $missing file(s) missing a license header. Commit locally (the"
    echo "pre-commit hook injects it) or add the header from AUTHORS/NOTICE manually."
    exit 1
  fi
  echo "License header check passed."
  exit 0
fi

STAGED=$(git diff --cached --name-only --diff-filter=ACMR -- "*.ts" "*.tsx" "*.js" "*.jsx" 2>/dev/null || true)

if [[ -z "$STAGED" ]]; then
  exit 0
fi

injected=0

while IFS= read -r f; do
  [[ -z "$f" || ! -f "$f" ]] && continue

  # Skip bundled artifacts
  case "$f" in
    public/worker*|dist-electron/*|electron-dist/*|.next/*) continue ;;
  esac

  # Already migrated to SPDX → nothing to do
  if head -5 "$f" | grep -q "SPDX-License-Identifier"; then
    continue
  fi

  # Detect an old-style leading prose-block header (`/*` on line 1, closing
  # ` */` further down, "Copyright" somewhere inside) so it can be replaced
  # rather than stacked underneath the new SPDX line.
  old_header_end=""
  old_header_is_mixed=0
  old_header_is_pure_legacy=0
  if [[ "$(sed -n '1p' "$f")" == "/*" ]]; then
    old_header_end=$(awk '/^ \*\/$/{print NR; exit}' "$f")
    if [[ -n "$old_header_end" ]]; then
      old_block="$(sed -n "1,${old_header_end}p" "$f")"
      if ! grep -q "Copyright" <<< "$old_block"; then
        old_header_end=""
      elif grep -q "MIT" <<< "$old_block"; then
        if grep -qE "Apache|Murici|Danilo" <<< "$old_block"; then
          old_header_is_mixed=1
        else
          # MIT mentioned, but no Apache/Murici/Danilo marker: this file was
          # never actually modified by the project. Don't relicense it —
          # leave its header exactly as-is.
          old_header_is_pure_legacy=1
        fi
      fi
    fi
  fi

  if [[ "$old_header_is_pure_legacy" -eq 1 ]]; then
    continue
  fi

  if [[ -n "$old_header_end" ]]; then
    # Migrating an existing header: classify from the text being replaced —
    # reliable and has no external dependency.
    if [[ "$old_header_is_mixed" -eq 1 ]]; then
      header="$MIXED_HEADER"
      kind="mixed"
    else
      header="$APACHE_HEADER"
      kind="apache"
    fi
  else
    # Fresh inject (file has no header at all yet): best-effort check against
    # an `upstream` remote, if one is configured locally (`git remote add
    # upstream <fork-source-url>`). Without it, this always resolves to
    # apache — acceptable for genuinely new files (never legacy by definition)
    # but means a legacy file that somehow has zero header would be
    # misclassified. No such file exists in the repo today.
    if git cat-file -e "upstream/main:$f" 2>/dev/null; then
      header="$MIXED_HEADER"
      kind="mixed"
    else
      header="$APACHE_HEADER"
      kind="apache"
    fi
  fi

  tmpfile="$(mktemp)"
  printf '%s\n\n' "$header" > "$tmpfile"

  if [[ -n "$old_header_end" ]]; then
    body_start=$((old_header_end + 1))
    # also swallow one blank line right after the old block, if present
    if [[ -z "$(sed -n "${body_start}p" "$f")" ]]; then
      body_start=$((body_start + 1))
    fi
    sed -n "${body_start},\$p" "$f" >> "$tmpfile"
    action="migrated"
  else
    cat "$f" >> "$tmpfile"
    action="injected"
  fi

  mv "$tmpfile" "$f"
  git add "$f"

  echo "  [license:$kind:$action] $f"
  injected=$((injected + 1))
done <<< "$STAGED"

if [[ $injected -gt 0 ]]; then
  echo "License headers processed for $injected file(s)."
fi
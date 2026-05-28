#!/usr/bin/env bash
# Injects copyright/license headers into all tracked .ts/.tsx/.js/.jsx source files.
# Run once from the repo root. Safe to re-run — skips files that already have a header.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── Header templates ────────────────────────────────────────────────────────

APACHE_HEADER='/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */'

MIXED_HEADER='/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */'

MIT_HEADER='/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */'

# ─── Categorize files via git diff ───────────────────────────────────────────

ADDED_LIST=$(git diff --name-only --diff-filter=A upstream/main HEAD -- "*.ts" "*.tsx" "*.js" "*.jsx" 2>/dev/null | grep -v "^public/worker" || true)
MODIFIED_LIST=$(git diff --name-only --diff-filter=M upstream/main HEAD -- "*.ts" "*.tsx" "*.js" "*.jsx" 2>/dev/null || true)
ALL_LIST=$(git ls-files "*.ts" "*.tsx" "*.js" "*.jsx" | \
  grep -v "^dist-electron/" | \
  grep -v "^electron-dist/" | \
  grep -v "^\.next/" | \
  grep -v "^public/worker" || true)

# ─── Header injection ─────────────────────────────────────────────────────────

prepend_header() {
  local file="$1"
  local header="$2"

  [[ ! -f "$file" ]] && return 0

  # Skip if any Copyright notice already present in first 10 lines
  if head -10 "$file" | grep -q "Copyright"; then
    echo "  SKIP: $file"
    return 0
  fi

  local tmpfile
  tmpfile="$(mktemp)"
  printf '%s\n\n' "$header" > "$tmpfile"
  cat "$file" >> "$tmpfile"
  mv "$tmpfile" "$file"
  echo "  OK: $file"
}

added_count=0
modified_count=0
unmodified_count=0

echo "=== Injecting Apache 2.0 headers (NEW files) ==="
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if prepend_header "$f" "$APACHE_HEADER"; then
    if head -10 "$f" | grep -q "Apache License"; then
      ((added_count++)) || true
    fi
  fi
done <<< "$ADDED_LIST"

echo ""
echo "=== Injecting mixed attribution headers (MODIFIED legacy files) ==="
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if prepend_header "$f" "$MIXED_HEADER"; then
    ((modified_count++)) || true
  fi
done <<< "$MODIFIED_LIST"

echo ""
echo "=== Injecting MIT attribution headers (UNMODIFIED legacy files) ==="
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  # Skip if it was in the added or modified lists
  if echo "$ADDED_LIST" | grep -qxF "$f"; then continue; fi
  if echo "$MODIFIED_LIST" | grep -qxF "$f"; then continue; fi
  if prepend_header "$f" "$MIT_HEADER"; then
    ((unmodified_count++)) || true
  fi
done <<< "$ALL_LIST"

echo ""
echo "=== Done ==="
echo "  New files processed (Apache 2.0):        $added_count"
echo "  Modified legacy processed (Mixed):        $modified_count"
echo "  Unmodified legacy processed (MIT attr):   $unmodified_count"

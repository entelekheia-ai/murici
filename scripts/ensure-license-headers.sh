#!/usr/bin/env bash
# Pre-commit hook script — ensures every staged .ts/.tsx/.js/.jsx file has the
# correct license header before the commit is recorded.
#
# Header selection:
#   - File absent from upstream/main → NEW → Apache 2.0 (sole author)
#   - File present in upstream/main  → MODIFIED LEGACY → Mixed attribution
#
# The script re-stages files it modifies so the header lands in the same commit.
set -euo pipefail

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

  # Already has a copyright notice → nothing to do
  if head -10 "$f" | grep -q "Copyright"; then
    continue
  fi

  # Pick header based on whether the file exists in upstream
  if git cat-file -e "upstream/main:$f" 2>/dev/null; then
    header="$MIXED_HEADER"
    kind="mixed"
  else
    header="$APACHE_HEADER"
    kind="apache"
  fi

  tmpfile="$(mktemp)"
  printf '%s\n\n' "$header" > "$tmpfile"
  cat "$f" >> "$tmpfile"
  mv "$tmpfile" "$f"
  git add "$f"

  echo "  [license:$kind] $f"
  injected=$((injected + 1))
done <<< "$STAGED"

if [[ $injected -gt 0 ]]; then
  echo "License headers injected into $injected file(s)."
fi

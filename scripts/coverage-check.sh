#!/usr/bin/env bash
set -euo pipefail

min_line="${COVERAGE_MIN_LINE:-90}"
min_branch="${COVERAGE_MIN_BRANCH:-90}"

output="$(node --test --experimental-test-coverage --test-reporter=tap 2>&1)"
printf '%s\n' "$output"

summary_line="$(printf '%s\n' "$output" | awk -F'|' '/^# all files/ {gsub(/ /, "", $2); gsub(/ /, "", $3); print $2" "$3}')"

if [[ -z "$summary_line" ]]; then
  echo "Coverage summary for 'all files' was not found." >&2
  exit 1
fi

line_cov="${summary_line%% *}"
branch_cov="${summary_line##* }"

line_fail="$(awk -v v="$line_cov" -v min="$min_line" 'BEGIN {if (v+0 < min+0) print 1; else print 0}')"
branch_fail="$(awk -v v="$branch_cov" -v min="$min_branch" 'BEGIN {if (v+0 < min+0) print 1; else print 0}')"

if [[ "$line_fail" == "1" || "$branch_fail" == "1" ]]; then
  echo "Coverage gate failed: lines ${line_cov}% (min ${min_line}%), branches ${branch_cov}% (min ${min_branch}%)." >&2
  exit 1
fi

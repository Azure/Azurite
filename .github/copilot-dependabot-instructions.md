@copilot This PR was opened by Dependabot. Please take it the rest of the way before it's ready for human review:

1. **Impact analysis** — identify what changed (package name, old → new version) from the PR diff/description, search the codebase for where that dependency is actually used, and summarize what could be affected.
2. **Fix build/conflict issues** — run `npm ci --legacy-peer-deps`, `npm run build`, and `npm run lint`; resolve any merge conflicts, build errors, or lint errors that surface.
3. **Tests** — add or update tests under `tests/**` to cover the changed usage, and make sure they meaningfully validate the change (not just re-assert the version bump).
4. **Run the suite** — run the relevant `npm run test:*` script(s) for the affected area (e.g. `test:blob`, `test:queue`, `test:table`) and keep fixing until they pass.
5. **Changelog** — append one bullet to `ChangeLog.md` under `## Upcoming Release` → `General:`, matching the existing style and tone of the entries already there (package name in backticks, old → new version, why, and a one-line summary of any code changes made).
6. **Comments** — review any existing PR comments and review threads, including resolved/hidden ones, and address anything actionable.
7. **Self-rate** — rate this work 1-10 against: correctness, test coverage, changelog accuracy, build/lint health, and comment resolution.
8. **Iterate** — if it's not a 10, keep improving until it is before finishing.
9. **Summary** — post a final comment explaining why this update matters, what the impact/risk is, and what could go wrong if it weren't applied, along with your self-rating and reasoning.

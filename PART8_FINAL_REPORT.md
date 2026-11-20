# Part 8 — Final Report: Step 24 Roster Editing, Safe Regeneration and Roster Views

## 1. Scope

Step 24 is complete. Only Step 24 was implemented; Step 25 was not started.

The existing roster generator, regenerate/validate APIs, Monthly Roster features, design system and navigation were preserved. No duplicate roster table or model was created; all work reuses the existing `Roster`, `RosterEntry`, employee/brand/process, assignment, leave, weekly-off and holiday records.

## 2. Backend implementation

### Files changed

| File | Purpose |
| --- | --- |
| `backend/app/schemas/roster.py` | Added Step 24 Pydantic schemas: entry detail/update request, shared filters, monthly entries view, weekly view and employee-wise view responses. |
| `backend/app/services/roster_editor.py` | New reusable edit-validation service with `RosterEditError` carrying HTTP status and message. |
| `backend/app/routes/roster.py` | Added entry edit/read APIs and the three new view APIs; wired transactional edits, snapshot refresh and regeneration policy. |
| `backend/tests/test_step24.py` | New isolated Step 24 test file with 28 tests using SQLite and dependency overrides; no live DB dependency. |

### New APIs

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/rosters/entries/{entry_id}` | Read one stored roster entry. |
| `PUT` | `/api/rosters/entries/{entry_id}` | Edit a stored entry with full validation and transaction rollback. |
| `GET` | `/api/rosters/{year}/{month}/entries` | Monthly roster entries with shared filters. |
| `GET` | `/api/rosters/{year}/{month}/weekly` | Monday–Sunday weekly grid, including adjacent-month days with `in_selected_month` flags. |
| `GET` | `/api/rosters/{year}/{month}/employee-wise` | Employee assignments plus concrete weekly-off/approved-leave dates for the month. |

Existing `/api/rosters/generate`, `/api/rosters/regenerate`, `/api/rosters/{year}/{month}/validate` and `/api/rosters/{year}/{month}` continue to work.

### Edit rules and error mapping

`validate_roster_edit()` validates the resulting entry before any write:

- `404` — employee/brand/process does not exist; owning roster missing.
- `422` — employee/brand/process inactive, or no matching employee-brand-process assignment.
- `409` — duplicate employee on the same date, approved leave, weekly off, organisation holiday, or missing owning roster.
- `400` — attempted roster reassignment, or date outside the parent roster month.

A partial update keeps unspecified fields from the stored entry but still validates the complete resulting record. All validation reads happen before the route writes; integrity failures roll the transaction back. After a valid edit, stored coverage/uncovered snapshots are refreshed for that month only.

### Regeneration policy

Regeneration replaces **all entries in the selected month**, including manual edits, with a freshly generated deterministic roster. The roster ID is preserved, other months are untouched, and the transaction rolls back on failure. The API response message explicitly states this policy, and the frontend shows the same note next to the Generate/Regenerate controls.

### Shared filters

All three views accept `employee_id`, `brand_id`, `process_id`, `start_date` and `end_date`; the weekly view also accepts `week_start`. Filters are applied by a shared query builder, so the same filter set works in every view. Clearing filters removes the parameters from the request entirely.

## 3. Frontend implementation

### Files created or modified

| File | Purpose |
| --- | --- |
| `frontend/src/services/rosterService.js` | Added API calls for entry read/edit and the monthly, weekly and employee-wise views; added query builder that omits empty filters. |
| `frontend/src/components/RosterFilters.jsx` | Shared employee/brand/process/date filters with “Clear all filters”. |
| `frontend/src/components/RosterEntryEditModal.jsx` | Edit form for employee, brand, process, date and shift details with API error display. |
| `frontend/src/components/RosterWeekView.jsx` | Weekly grid with previous/next/current-week navigation and per-entry Edit actions. |
| `frontend/src/components/RosterEmployeeView.jsx` | Employee selector, assignment table, weekly-off dates and approved-leave dates. |
| `frontend/src/components/RosterTable.jsx` | Monthly table with Edit action. |
| `frontend/src/pages/RosterPage.jsx` | Integrated all views, shared filter state, editing flow and regeneration-policy note. |
| `frontend/src/utils/rosterFilters.js` | Shared empty-filter constant (keeps ESLint fast-refresh rule satisfied). |
| `frontend/src/App.css` | Styles for filters, view tabs, edit links, weekly grid, employee view and responsive layout. |
| `frontend/vite.config.js` | Dev proxy for `/api` to `http://127.0.0.1:8000`. |

### Browser-test fixes applied

Browser testing found and fixed two frontend issues:

1. Switching from Monthly View to Weekly/Employee-wise View could render one frame with stale monthly data and crash on `week.days.map`. View switching, filter changes, employee changes and week navigation now clear the previous view data and show a loading state immediately.
2. The “Roster entry updated” success banner was cleared by the roster reload. The message is now set after the reload completes.

## 4. Database and schema

- No schema migration was needed.
- The existing `rosters` and `roster_entries` tables, indexes and foreign keys were reused.
- No new production/master-data table was introduced.
- Runtime data changes during browser testing were made only against an isolated temporary SQLite database seeded for this purpose. The temporary backend was then stopped and the normal MySQL-backed backend restored; the MySQL development data was not edited by the browser test.
- Live December 2026 dev data remains unchanged (existing roster with 0 entries because its referenced brand is inactive).

## 5. Verification results

### Backend test suite

Command run from `backend/`:

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

Result:

```text
Ran 99 tests in 17.472s

OK
EXIT_CODE=0
```

- Baseline before Step 24: 71 tests.
- Step 24 test file: 28 tests.
- Full suite after Step 24: 99 tests, all passing.

The Step 24 tests cover all nine edit rules, transactional rollback, partial updates, monthly/weekly/employee-wise views, combined filters, filter clearing, week navigation, cross-month behavior, regeneration policy and a regression check for existing APIs.

### Frontend lint and build

From `frontend/`:

```text
npm run lint   → passed with no ESLint errors
npm run build  → built in 1.03s
                 dist/assets/index-BQzE52OM.css  30.81 kB
                 dist/assets/index-BsERyr9l.js  479.59 kB
```

### Browser testing

The frontend was served on `http://127.0.0.1:5174/` because port `5173` was already occupied. A temporary backend with isolated seeded SQLite data was used so editing/regeneration could be exercised without touching MySQL dev records.

Verified in the browser:

- Monthly View showed the seeded roster (2 entries) and refreshed coverage summary.
- Employee filter narrowed the monthly table from 2 entries to 1 and displayed “Clear all filters”.
- The filter persisted when switching to Weekly View; “Clear all filters” restored all 2 assignments.
- Weekly View showed Monday–Sunday navigation, the adjacent-month day flag, and per-entry Edit actions.
- Employee-wise View showed Browser One’s weekly-off dates and Browser Two’s approved-leave dates.
- Valid edit: changed entry date from 2026-12-10 to 2026-12-12 and updated shift details; the edit saved, the table updated, and coverage refreshed.
- Invalid edit: changing the date to 2026-12-13 was rejected with HTTP `409` and a clear visible message; stored data remained unchanged.
- Regeneration: replaced the manual edit with generated entries, displayed the manual-edit replacement policy message, and preserved the November roster’s manual entry.
- No uncaught JavaScript errors remained after the view-switch fix; the only console 4xx was the intentionally rejected invalid edit.
- A full-page screenshot was captured during the final browser pass.

After browser testing, the page was reloaded against the restored MySQL-backed backend and the dev server state is clean.

## 6. Notes and limitations

- The live MySQL development database currently has inactive brands, so December 2026 generation produces 0 entries there. Isolated seed data was therefore used for browser-level edit/regeneration checks.
- The filtered monthly caption currently reads `entry(s)`; this is cosmetic only.
- Port `5173` was occupied, so the tested Vite dev server used `5174`. The proxy target remains `127.0.0.1:8000`.
- No git repository exists at the workspace root, so all Step 24 changes are uncommitted.

## 7. Final status

Step 24 is implemented and verified:

- Roster entry editing: complete.
- Safe, transactional regeneration with explicit manual-edit policy: complete.
- Monthly, Weekly and Employee-wise views with shared filters: complete.
- Backend tests, frontend lint, production build and browser checks: passing.
- Step 25: not started.

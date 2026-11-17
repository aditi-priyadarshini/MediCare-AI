# Forms behind buttons, Diet/Share/Care rework (merged on top of the D2/E1 work)

**Not run:** lint, typecheck, vitest, `next build` (no node_modules / network where this was written).
A stubbed syntax and import check found no errors in the changed files.

- Dashboard: profile completeness is a slim full-width strip (no hole beside the greeting); cards in a row stretch to equal height.
- Records and Labs: the add forms are closed by default. "Add record" / "Add result" opens a drawer (`AddRecordForm bare`, `LabForm`).
- Privacy and consent moved from Profile to Settings (`components/settings/ConsentCard.tsx`, `#privacy`). Assistant and dashboard links now point to `/settings#privacy`.
- Diet: current plan fills the page as meal cards for today, a day picker and a card per day. Preferences are on `/diet/preferences`; past plans and "new plan" are behind buttons. Day numbers follow the plan's creation date (`planDayNumber` in `lib/diet.ts`).
- Share: "Share with someone" opens `/share/new` (three numbered sections); the list is a card grid.
- Find care: booking opens `/care/book/[doctorId]`; results are a card grid; `/care?tab=appointments` opens that tab.
- New shared UI: `LinkButton`, `FormPage` (`components/ui/`).
- Tests changed: care-ui (booking + diet planner), diet (plan day helpers), assistant (privacy link href).

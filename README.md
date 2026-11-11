# Event Horizon

An event planning prototype for a coordinator and a planning partner. It brings
themes, vendors, timing, a calendar, a budget snapshot, and AI assisted schedule
review into one place. Vendor listings are for research; adding a vendor to a
plan does not make a reservation or send an email.

## What works now

- Choose from twelve cosmic party themes.
- Search the connected Supabase vendor directory or clearly labeled example
  listings; plan vendor dates and times, and track considering/contacted/confirmed.
- See event and vendor dates on a calendar, add or cancel local events, and read
  the event run sheet in time order. The calendar also shows three clearly
  labeled fictional example events with vendor setup times; hide them with one
  button. Examples never enter a saved plan or its conflict checks.
- Enter a total budget and one planned spending amount for each vendor category. Missing listing prices stay unknown.
- Review timing concerns. Application code checks the scheduling rules, then the
  Planning and Recovery agents rank concerns and suggest next steps. They do not
  change bookings or contact vendors.
- Use the separate arrival example at `/review` to examine one proposed change.
- Keep a plan on this device. Save & share offers a live shared plan when the
  migration below is installed, or a clearly labeled copy link when it is not.

## Suggestions and saved choices

Venue suggestions show at most three choices. The recommendation request keeps
the chosen venue and selected vendors that are still in the loaded directory, then includes
up to 15 listings per category. If a selected vendor is missing from the loaded
directory, the plan still shows its saved choice. You can set its time, remove
it, or search for a replacement. A search result already in the plan is labeled
**Already in your plan**.

The category budget is the amount planned for that vendor. It is editable in
both the suggested group and chosen plan, and the report uses the same amount.
Planned spend is the sum of budgets for selected vendors; a suggestion is not
counted until chosen. Listed starting prices appear only
as comparisons and are not silently added to the total. An unfinished entry,
such as `500.`, does not count until completed. Older saved vendor estimates
move into empty category budgets when a plan is opened. The fictional calendar
examples stay in the event's month and off its date.

## Run locally

Use Node.js 22 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, and
set `ANTHROPIC_API_KEY` for AI review. Set `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` to read the real vendor directory and enable shared
plan storage after the migration. Never put a service-role key in the app.

Run `npm run dev` and open the local URL. Check changes with `npm run typecheck`,
`npm test`, and `npm run build`. The browser plan is stored locally; no email is
sent. The optional vendor contact chatbot has not been built.

## Supabase setup

Apply `supabase/migrations/202611090001_create_vendors.sql` for the vendor
directory, then add vendor records whose source details you have checked.
Apply `supabase/migrations/202611100001_create_shared_plans.sql` to turn on live
shared plans. The second migration creates three restricted functions. The app
uses a long random link key to load and update a plan; the table itself
has no direct public access. Anyone with a share link can view and edit that
plan, so send it only to a planning partner. The app rejects an update if the
other partner saved a newer version first; use **Get latest** and review before
saving again. This is a small-team demo, not an account or permission system.

Without the second migration, **Save & share** produces a snapshot link. Its
recipient gets a copy, and later edits do not synchronize. This fallback is
useful for review but must not be described as live collaboration. Real vendor
availability, prices, capacity, and ratings remain unknown unless sourced.

## Working together

The current branch is `Vantagepoint`. Open feature pull requests into `develop`
for Crystal's review. Release through a separate `develop` to `main` pull
request. Do not merge without Anastasiya's explicit approval.

The PRD is in `docs/PRD.md` and the linked Google Doc. Some newer planning
features are proposed additions pending the team's review.

## Demo order and limits

Start on the home page to choose a party theme. Use **Search & add** to plan a
venue and vendors, **Calendar** to see the run sheet, and **Potential conflicts**
to check timing. On **Arrival and setup**, follow the **open arrival review** link
to try the PRD's separate proposed-arrival decision. The theme is a saved mood
choice; it does not change vendor matches or
scheduling rules. The planning screens are proposed additions awaiting team and
instructor agreement.

Dates and times use New York time. The project assumes one event room: two events cannot overlap there, while vendors may work together. Type four time digits such as 1700 and the app shows 17:00. Each recorded vendor or venue window starts
and ends on one date. That allows a florist to be placed two days before an
event, but does not yet represent a setup that spans several days or venue
access across dates. Schedule findings are prompts to confirm details, not proof
of vendor availability or reservations.

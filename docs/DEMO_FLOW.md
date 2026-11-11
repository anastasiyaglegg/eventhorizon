# Event Horizon demo flow

This is the expanded planning demo. The approved core scenario in `PRD.md` remains the late-arrival review on `/review`; the new planning pages are a separate extension for team and instructor review.

## The coordinator's path

1. Pick a theme, then enter the event name, total budget, guest count, date, and time.
2. Review venue suggestions and choose one. The chosen venue becomes part of the saved plan; a suggestion alone does not.
3. Review a vendor group covering available categories, or browse and select vendors individually. Each suggested vendor gets a planning budget based on its listed starting price and the event's remaining money. A fifth of the spare amount stays unassigned as a cushion. Adding the group fills empty category budgets where the total allows it; existing amounts stay as entered.
4. Set venue access and vendor work times. See the saved plan on the calendar. The three fictional example events can make the calendar walkthrough easier; click a day to see each event and its vendor setup times, or hide the examples to show only the saved plan. Examples are not bookings and do not affect the plan's conflict checks.
5. Review potential time and room conflicts, then the simplified arrival list and final report. From Arrival and setup, open the separate proposed-arrival review to demonstrate the PRD's original decision flow. The coordinator changes times and contacts vendors; the app does not book or email anyone.

## Function and agent handoffs

| Step | Producer → consumer | Check before moving on |
| --- | --- | --- |
| Event details | Coordinator → recommendation request | Positive budget and guest count; up to 120 directory candidates. |
| Venue shortlist | Directory facts → recommendation agent → checked IDs | Venue capacity and known starting price fit the stated guests and budget. Only supplied IDs are accepted. |
| Vendor group | Chosen venue, category budgets, selected vendors, and directory facts → recommendation agent → checked IDs | At most one per category. The known price or reserved category budget, whichever is larger, counts toward the total. Affordable missing categories may be filled from the same directory snapshot. |
| Saved plan | Coordinator's choices → browser plan | Suggestions never become selections until the coordinator chooses them. No booking or message is sent. |
| Timing review | Saved plan → deterministic time rules → Planning Agent → Recovery Agent | Code checks dates, 24-hour times, daylight-saving ambiguity, vendor arrival windows, room overlaps, and access gaps. Agents receive only rule issue IDs; outputs must refer to every supplied issue exactly once and use permitted actions. |
| Report | Saved plan + deterministic budget findings → coordinator | Budgets for chosen vendors are summed as planned spend; suggested vendors are not counted until chosen. Listed prices are comparisons only. Unknown prices and unconfirmed availability stay visible. Time and room findings stay on the separate Potential conflicts page. The report does not assert a real reservation. |

## Budget example

With a $5,000 event budget, a $2,000 venue budget and $1,000 photography budget leave $2,000 for other planned spending. A caterer listing that starts at $2,100 needs a larger category budget or a different choice. If the coordinator changes the venue budget to $2,300, both the chosen plan and report show $2,300, and the remaining amount becomes $1,700. A category budget below a listed starting price or a total overrun appears as a finding. A listing price is not a confirmed quote.

## Time example

For an event from 18:00 to 20:00, catering or bakery must start between 15:00 and 17:00 and finish between 21:00 and 23:00. A caterer scheduled 17:30–21:00 gets an arrival warning. A florist and decorator may set up at the same time, as early as two calendar dates before the event. Separate events may not occupy the one event room at the same time. A missing or invalid date is a finding, never a clean schedule.

## Failure path and demo limits

If an AI request fails or returns an unknown ID or action, the plan stays unchanged. The coordinator sees an error, may retry manually, or may choose vendors and times without AI. There is no automatic provider retry. The timing calculations and budget totals run in code. Sample listings, ratings, reviews, prices, and contacts are fictional; real listing prices and capacity may be incomplete. One live recommendation request and one live Planning → Recovery timing request passed with synthetic inputs on November 11, 2026. That is a smoke check, not a complete AI evaluation. The expanded flow needs team and instructor approval before it is presented as the agreed P0 scope.

# Business Tracker (Pro) — design spec

Researched 2026-07-22 across seven owner-operator categories (food & beverage, retail/reselling,
personal services, freelance/projects, rental/assets, online selling, transport/delivery).

## The one loop

Every one of those businesses sells the same thing over and over — a plate, a sachet, an
appointment, a project, a rental day, a parcel, a shift — and only four questions decide whether
the owner eats:

**Item** (a price and a derived cost) → **Entry** (one of them left) → **Cash** (did it come back,
all of it, yet) → **Fixed costs** (what runs whether I open or not).

`margin per unit × units that left − what leaked − fixed costs = the day`

A food business is that loop where the cost is *derived from a recipe divided by portions* — which
is exactly why cost-per-serving and margin-per-dish fall out for free rather than being a "food
feature". A salon is the same loop where the unit also consumes a minute of a chair that expires.
A rider is the same loop where the unit consumes a kilometre of a vehicle that is quietly being
eaten.

**Seven categories, one loop, different words on the buttons.** The `preset` column on
`biz_business` decides labels, which screens exist, and the defaults — nothing in the schema is
category-specific.

## The killer insight

> The killer is never low prices — it is **units that left the business with no cash attached and
> no record made**.

So the app's real job is to make *every* unit that leaves leave a row: **sold, on credit, or lost.**
That is why `biz_loss` exists and why filing a loss must be the easiest action in the whole app.
Spoilage, staff meals, breakage, goods taken home, no-shows, cancelled bookings, returns and rental
damage are all one row with a reason chip and an auto-computed peso value.

## Data model (v1 = the loop; phase 2 in brackets)

| Table | Purpose |
|---|---|
| `biz_business` | RLS anchor + the personality switch (`preset`), and the numbers that turn cash into break-even. |
| `biz_item` | The universal sellable unit — dish / product / service / project / asset / SKU / shift. Where price meets true cost. |
| `biz_supply` | Input library. Turns "2400 for a 50kg sack" into a unit cost, and carries `yield_pct` (meat/fish/produce really cost 30–50% more than market price). |
| `biz_recipe_line` | Bill of materials. Points at a supply **or another item** (a costed batch) → sub-recipes for free. This is exactly where spreadsheets break. |
| `biz_sale` | One row every time something leaves. Snapshots cost at sale time so history stays honest when prices move. |
| `biz_payment` | Cash actually received — utang, deposits, milestones, bonds. Profit ≠ cash. |
| `biz_cost` | Every peso out, one screen, <10s. With `supply_id`+`qty` it doubles as a restock and re-derives unit cost (moving average + allocated freight). |
| `biz_fixed_cost` | The monthly commitments typed once. The entire input to break-even. Includes the owner's own draw — the owner eating is a cost, not a leftover. |
| `biz_loss` | The leak. See above. |
| `biz_customer` | A name and a running balance — "who owes me and since when". |
| [`biz_time`] | One time ledger → utilisation, effective hourly rate, true net-per-hour. |
| [`biz_count`] | Periodic reconciliation (cash / stock / inventory value / payout) → finds the *unrecorded* leak. |
| [`biz_channel`] | Where the sale came from and what that costs (30% commission channels). |

## Headline metrics

- **Today vs break-even** — `daily_target = active fixed costs / days_open_per_month`; progress bar:
  *"You need 5,090 today. You're at 4,210."*
- **You keep** — live per-unit margin the instant a sale is saved:
  `keep = price − unit_cost − extra_cost − price×fee_pct`, plus
  `suggested_price = (unit_cost + extra_cost) / (1 − target_margin_pct − fee_pct)`
- **Kept this month** — three stacked numbers, because *profit ≠ cash*: contribution → net →
  safe-to-draw (`cash collected − costs − restock reserve − tax set-aside`).
- **Money on the street** — outstanding by aging bucket (0–15 / 16–30 / 31–60 / 60+); deposits held
  shown as a liability, never as profit.
- **The leak** — recorded losses by reason + unrecorded variance from counts; the sentence that
  lands is *"this ate 34% of your profit"*.
- **Earners and drainers** — items ranked by **contribution pesos**, not units or percent.

## Deliberately NOT in v1

Double-entry bookkeeping · tax/VAT filing rules (one set-aside % only) · PDF invoices · a booking
calendar · marketplace API integrations · line-item receipt OCR (totals only) · barcode catalogues ·
multi-user staff roles · payroll · bank feeds · forecasting/"AI".

> Rationale: these owners have never seen last month's real margin. Show them that first.

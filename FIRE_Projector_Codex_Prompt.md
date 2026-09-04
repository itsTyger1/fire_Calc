# Codex Build Prompt: FIRE Projector & Scenario Comparison App

Build a polished, production-quality **FIRE (Financial Independence / Retire Early) Projector** web app.

The app should let a user model their current portfolio, monthly contributions, expected returns, FIRE spending needs, safe withdrawal rate, current age, retirement age, and multiple scenarios side-by-side. It should clearly show whether each scenario reaches the user's FIRE goal, at what age/date it is reached, and how the portfolio grows over time.

The design should be clean, modern, responsive, easy to understand, and optimized for personal financial planning.

---

## 1. Primary Goal

The app should answer:

1. **What is my FIRE number?**
2. **How much do I need to contribute each month to reach it?**
3. **Will I reach FIRE by my target retirement age?**
4. **At what age will I actually reach FIRE under each scenario?**
5. **How do different contribution levels, returns, spending levels, and retirement ages compare?**
6. **How much of my portfolio is accessible before age 59½?**
7. **How much of my projected FIRE portfolio comes from contributions vs. investment growth?**

The user must be able to change all assumptions without changing code.

---

## 2. Suggested Tech Stack

Use:

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- Recharts for charts
- LocalStorage for persistence
- No backend required for v1
- No login required

Keep financial calculation logic isolated in reusable TypeScript utility functions with unit tests.

Do not use hard-coded values except for sensible initial defaults.

---

## 3. Default User Data

Seed the app with these defaults, but make every value editable.

### Personal / FIRE Settings

- Current age: **30**
- Target retirement age: **50**
- Desired annual FIRE spending: **$52,500**
- Safe withdrawal rate: **3.5%**
- Expected real annual portfolio return: **5.0%**
- Inflation rate: **2.5%**
- Projection frequency: monthly
- Maximum projection age: **100**

Derived default FIRE number:

`FIRE Number = Desired Annual Spending / Safe Withdrawal Rate`

Example:

`$52,500 / 0.035 = $1,500,000`

The FIRE number must automatically update whenever spending or withdrawal rate changes.

Also allow the user to directly override the FIRE number. If they manually override it, clearly show that it is using a custom target instead of the calculated target.

Provide a button:

**Reset FIRE goal to spending-based calculation**

---

## 4. Account Types

Allow the user to create, edit, delete, reorder, and rename accounts.

Each account must contain:

- Account name
- Account type
- Current balance
- Monthly contribution
- Employer monthly contribution, if applicable
- Expected annual return override (optional)
- FIRE eligible toggle
- Include in net worth toggle
- Tax treatment
- Accessibility category
- Notes
- Optional allocation / holdings list

Supported account types:

1. Roth 401(k)
2. Traditional 401(k)
3. Roth IRA
4. Traditional IRA
5. Taxable Brokerage
6. HYSA / Cash
7. Treasury / Bonds
8. Crypto
9. HSA
10. Other

---

## 5. Seed Accounts

Use these editable starting values:

### Roth 401(k)
- Balance: **$180,000**
- User monthly contribution: **$450**
- Employer monthly contribution: **$733**
- FIRE eligible: Yes
- Include in net worth: Yes
- Accessibility: Retirement
- Holdings note: S&P 500 index fund

### Roth IRA
- Balance: **$14,000**
- Monthly contribution: **$625**
- FIRE eligible: Yes
- Include in net worth: Yes
- Accessibility: Retirement / Roth contribution basis
- Holdings:
  - IBIT: **$8,500**
  - SWPPX: **$5,400**
- Allow rounding difference between holdings and account total.

### Traditional IRA
- Balance: **$2,700**
- Monthly contribution: **$0**
- FIRE eligible: Yes
- Include in net worth: Yes
- Accessibility: Retirement
- Holdings:
  - IBIT: **$2,700**
  - META: **$11**
- Allow rounding difference.

### Taxable Brokerage
- Balance: **$2,900**
- Monthly contribution: **$0** initially
- FIRE eligible: Yes
- Include in net worth: Yes
- Accessibility: Immediately accessible
- Holdings:
  - ORCL: **$424**
  - GLW: **$313**
  - MU: **$514**
  - NVDA: **$477**
  - MSFT: **$1,172**

### HYSA / Cash
- Balance: **$45,600**
- Monthly contribution: **$2,100** during cash-building phase
- FIRE eligible: No by default
- Include in net worth: Yes
- Expected nominal annual yield: **3.3%**
- Accessibility: Immediately accessible
- Emergency fund target: **$60,000**

### Other Crypto
- Balance: **$20,000**
- Monthly contribution: **$0**
- FIRE eligible: Off by default
- Include in net worth: Yes
- Accessibility: Immediately accessible
- Expected return should NOT be assumed unless user explicitly sets one.

---

## 6. Account-Level Contribution Planning

The user must be able to set a monthly contribution for each account.

Display:

- User contributions per month
- Employer contributions per month
- Total monthly investing
- Total monthly cash savings
- Total monthly wealth building
- Total annual investing
- Total annual wealth building

Important distinction:

### FIRE Investment Contributions

Count contributions to accounts marked `FIRE eligible`.

### Net Worth Contributions

Count all contributions to accounts marked `Include in net worth`.

### Cash / Emergency Savings

Track separately from invested FIRE assets.

Show these as separate totals so the user does not confuse emergency-fund savings with long-term FIRE investing.

---

## 7. Contribution Phases

Support contribution phases because the user may temporarily prioritize cash before investing more aggressively.

Default example:

### Phase 1: Emergency Fund Build

Until HYSA reaches **$60,000**:

- HYSA: $2,100/month
- Roth IRA: $625/month
- Roth 401(k): $450/month
- Taxable brokerage: $0/month
- Traditional IRA: $0/month
- Crypto: $0/month
- Employer 401(k): $733/month

### Phase 2: FIRE Investing

After HYSA reaches $60,000:

- HYSA / sinking funds: $250/month
- Roth IRA: $625/month
- Roth 401(k): $800/month
- Taxable brokerage: $850/month by default
- Traditional IRA: $0/month
- Crypto: $0/month
- Employer 401(k): $733/month

Make every phase editable.

Allow:

- Start date / age
- End date / age
- Trigger-based transition
- Fixed-date transition
- Account-specific contribution amounts

Trigger examples:

- When cash balance reaches $60,000
- At age 31
- On January 1, 2027

The engine should automatically determine when a trigger occurs.

---

## 8. FIRE Goal Calculation

Default formula:

`FIRE Number = Desired Annual Spending / Safe Withdrawal Rate`

Examples:

- $46,200 / 4.0% = $1,155,000
- $46,200 / 3.5% = $1,320,000
- $52,500 / 3.5% = $1,500,000
- $61,250 / 3.5% = $1,750,000
- $70,000 / 3.5% = $2,000,000

Inputs:

- Desired annual spending
- Safe withdrawal rate

Outputs:

- FIRE number
- Monthly retirement spending
- Required portfolio for each withdrawal rate
- Optional comparison table for 3.0%, 3.25%, 3.5%, 3.75%, and 4.0%

---

## 9. Inflation Handling

Provide two projection modes:

### Real-Dollar Mode
All values are shown in today's dollars.

Use a user-entered **real return**, such as 5%.

This should be the default because it makes FIRE targets easy to understand.

### Nominal-Dollar Mode
Use:

- Nominal return
- Inflation rate

Convert future spending into future dollars.

For nominal projections:

`Future Spending = Current Spending × (1 + inflation)^years`

and calculate a future nominal FIRE number.

Clearly label whether numbers are:

- Today's dollars
- Future nominal dollars

Never mix the two without labeling them.

---

## 10. Projection Engine

Use monthly compounding.

For each month:

1. Add user contributions.
2. Add employer contributions.
3. Apply account-specific monthly return.
4. Apply contribution-phase rules.
5. Record balances.
6. Calculate total net worth.
7. Calculate FIRE-eligible portfolio.
8. Calculate accessible portfolio.
9. Check whether FIRE target is reached.

Monthly rate from annual return:

`monthlyRate = (1 + annualRate)^(1/12) - 1`

Do not simply divide annual return by 12.

Projection should continue until:

- Maximum age, default 100
- Or a configurable end age

---

## 11. FIRE Achievement Logic

For every scenario calculate:

- FIRE goal
- Age FIRE is first reached
- Calendar date FIRE is first reached
- Portfolio value at target retirement age
- Surplus / shortfall at retirement age
- Months early / late
- Required monthly contribution to hit FIRE exactly by target age
- Current planned monthly contribution
- Contribution gap

Examples:

### Ahead
Target retirement age: 50  
FIRE achieved: 48.4  
Status: **1.6 years early**

### Behind
Target retirement age: 50  
FIRE achieved: 53.2  
Status: **3.2 years late**

### At target age
Portfolio at 50: $1.62M  
FIRE goal: $1.50M  
Surplus: **+$120,000**

---

## 12. Required Monthly Contribution Solver

Add a calculator that determines the monthly contribution required to hit the FIRE goal by the target retirement age.

Inputs:

- Current FIRE-eligible portfolio
- Current age
- Target retirement age
- FIRE target
- Expected return
- Existing employer contributions
- Existing account contribution schedule

Output:

- Required total monthly contribution
- Employer contribution portion
- Required personal contribution
- Difference from current personal contribution

Use either:

- closed-form future-value formula where applicable, or
- binary search / numerical solver for contribution-phase scenarios

For complex multi-phase projections, use a numerical solver.

---

## 13. Scenario Comparison

This is a major feature.

The user must be able to create and compare multiple scenarios simultaneously.

Each scenario can override:

- Scenario name
- Current age
- Retirement age
- Annual FIRE spending
- Withdrawal rate
- FIRE number
- Real return
- Inflation
- Monthly contributions per account
- Employer contributions
- Starting account balances
- Cash target
- Contribution phases
- Whether crypto counts toward FIRE
- Whether cash counts toward FIRE
- Account-specific returns

Example scenarios:

### Conservative
- Real return: 4%
- FIRE spending: $52,500
- SWR: 3.5%
- Total investing: $2,500/month

### Base
- Real return: 5%
- FIRE spending: $52,500
- SWR: 3.5%
- Total investing: $3,000/month

### Aggressive
- Real return: 6%
- FIRE spending: $61,250
- SWR: 3.5%
- Total investing: $3,500/month

Allow at least **8 scenarios**.

Provide:

- Duplicate scenario
- Rename
- Delete
- Toggle visibility
- Reset
- Save

Persist scenarios in LocalStorage.

---

## 14. Main Scenario Line Graph

Create a large interactive line graph.

### X-axis
- Age by default
- Optional toggle to calendar year

### Y-axis
- FIRE-eligible portfolio value

Each scenario should have its own line.

Also show FIRE goal lines.

If scenarios have different FIRE goals, display each target clearly and avoid visual confusion.

Recommended behavior:

- Scenario portfolio line
- Matching FIRE target line or labeled target marker
- Marker where the scenario first crosses its FIRE goal
- Vertical marker at target retirement age
- Tooltip showing:
  - Age
  - Date
  - Portfolio balance
  - FIRE target
  - Difference to target
  - Contributions to date
  - Investment growth to date

The graph must support:

- Hover
- Legend
- Hide/show scenarios
- Responsive layout
- Zoom or time-range selection if practical
- Reset zoom

Important:

The user specifically wants to compare **all different timelines to each FIRE goal on the same graph**.

---

## 15. Additional Charts

Add optional charts below the main graph.

### Contributions vs Growth

Stacked or area chart showing:

- Starting principal
- Personal contributions
- Employer contributions
- Investment growth

### Account Balance Over Time

Show projected:

- Roth 401(k)
- Roth IRA
- Traditional IRA
- Taxable brokerage
- Cash
- Crypto

### FIRE Progress

Show:

`Current FIRE Portfolio / FIRE Goal`

Example:

`$199,600 / $1,500,000 = 13.3%`

Do not count cash or crypto unless their FIRE toggles are enabled.

---

## 16. FIRE Bridge / Accessibility

Because the user wants to retire before 59½, create an **Early Retirement Bridge** section.

Classify assets into:

### Immediately Accessible
- Taxable brokerage
- HYSA
- Treasuries
- Crypto

### Potentially Accessible
- Roth IRA regular contribution basis

### Retirement Restricted / Special Rules
- Roth 401(k)
- Traditional 401(k)
- Traditional IRA
- Roth IRA earnings

Allow the user to manually enter:

- Roth IRA cumulative contribution basis

Do NOT assume the entire Roth IRA balance is contribution basis.

Calculate:

- Accessible assets at FIRE date
- Years from FIRE age to 59½
- Estimated bridge spending needed
- Whether accessible assets are sufficient

Example:

`Bridge years = 59.5 - FIRE age`

`Bridge requirement = annual spending × bridge years`

This should be shown as a planning estimate, not a tax/legal guarantee.

---

## 17. Emergency Fund Section

Inputs:

- Current cash
- Emergency-fund target
- Normal monthly spending
- Job-loss monthly spending

Default values:

- Current HYSA: $45,600
- Target: $60,000
- Normal spending: about $3,853/month
- Job-loss spending: editable; seed around $2,800/month

Outputs:

- Months of normal-spending runway
- Months of job-loss runway
- Amount remaining to target
- Months until target based on monthly cash savings
- Estimated target date

Formula:

`Runway = Cash / Monthly Spending`

Do not include monthly savings/investment contributions as expenses during unemployment.

---

## 18. Budget Section

Add a simple monthly budget editor.

Seed:

### Needs
- Housing: $1,935
- Transportation: $203
- Groceries: $400

### Wants
- Restaurants: $200
- Subscriptions: $115
- Fun / discretionary: $1,000

### Wealth Building
- Roth IRA
- Roth 401(k)
- Taxable brokerage
- HYSA
- Other investments

Display:

- Needs %
- Wants %
- Wealth-building %
- Comparison with 50/30/20
- Custom target ratios

The user should be able to set their own target, such as:

**40 / 20 / 40**

Important:

401(k) payroll contributions may occur before the displayed take-home pay.

Allow:

- Gross monthly income
- Net deposited take-home income
- Payroll retirement contributions

This prevents double-counting.

---

## 19. Net Worth Dashboard

Show:

- Total net worth
- FIRE-eligible investments
- Retirement assets
- Accessible investments
- Cash
- Crypto
- Individual stocks
- Monthly FIRE contributions
- Monthly total wealth building
- FIRE progress percentage
- Current FIRE number
- Projected FIRE age
- Target retirement age

Make the most important figures large dashboard cards.

---

## 20. Holdings / Allocation View

Allow each investment account to contain optional holdings.

For each holding:

- Symbol/name
- Value
- Asset class

Asset classes:

- Broad US equity
- International equity
- Bonds
- Cash
- Bitcoin / Crypto
- Individual stock
- Other

Show total allocation across ALL accounts.

With the seeded data, allow the app to identify approximately:

- Broad/index equity
- Cash
- Crypto / IBIT
- Individual stocks

Do not automatically assume IBIT is diversified equity; categorize it as Bitcoin / Crypto exposure.

---

## 21. Crypto Treatment

Crypto should be configurable.

Provide:

**Count crypto toward FIRE goal?**
- Default: No

**Count crypto toward net worth?**
- Default: Yes

This lets the user see:

- Conservative FIRE projection excluding crypto
- Alternate FIRE projection including crypto

Allow a crypto return assumption only when the user explicitly enables one.

Default crypto growth assumption should be **0% for FIRE projections** or excluded entirely.

---

## 22. Taxable Brokerage Treatment

Taxable brokerage should count toward FIRE.

Provide optional advanced assumptions:

- Dividend yield
- Tax drag
- Capital-gains tax rate

However, keep these disabled by default for v1 simplicity.

If enabled:

`afterTaxReturn = grossReturn - estimatedTaxDrag`

Clearly label this as an estimate.

---

## 23. Retirement Account Tax Treatment

For v1, projection balances can grow tax-free/deferred without modeling annual tax drag.

Support labels:

- Roth: tax-free qualified withdrawals
- Traditional: pre-tax / taxable on withdrawal
- Taxable: after-tax account

Do not attempt to give individualized tax advice.

Future enhancement may estimate taxes during retirement.

---

## 24. Scenario Summary Table

Below the graph show:

| Scenario | FIRE Goal | FIRE Age | Portfolio at Target Age | Monthly Contribution | Surplus / Shortfall | Status |
|---|---:|---:|---:|---:|---:|---|

Example:

| Base | $1.50M | 48.9 | $1.64M | $3,000 | +$140k | Ahead |
| Conservative | $1.50M | 52.1 | $1.39M | $2,500 | -$110k | Behind |
| Higher Lifestyle | $1.75M | 51.0 | $1.68M | $3,000 | -$70k | Behind |

Make rows clickable to focus/highlight the matching chart line.

---

## 25. Sensitivity Analysis

Add a section showing how FIRE age changes when one assumption changes.

At minimum:

### Return sensitivity
- 3%
- 4%
- 5%
- 6%
- 7% real

### Contribution sensitivity
Allow ±$250, ±$500, ±$1,000/month around current contribution.

### Spending sensitivity
Allow:
- -20%
- -10%
- Base
- +10%
- +20%

### Withdrawal-rate sensitivity
- 3.0%
- 3.25%
- 3.5%
- 3.75%
- 4.0%

Show the resulting FIRE age for each.

---

## 26. Important Financial Formulas

### FIRE Number

`fireNumber = annualSpending / withdrawalRate`

### Monthly Return

`monthlyReturn = (1 + annualReturn)^(1/12) - 1`

### Monthly Account Projection

Use consistent timing.

Prefer:

`endingBalance = (startingBalance + monthlyContribution) × (1 + monthlyReturn)`

Document whether contributions are assumed at beginning or end of month.

### FIRE Progress

`fireProgress = fireEligiblePortfolio / fireNumber`

### Withdrawal Capacity

`annualWithdrawal = portfolio × withdrawalRate`

### Required Contribution

For simple single-rate projections, use standard future-value math.

For multi-phase or trigger-driven projections, use numerical solving / binary search.

---

## 27. Contribution vs Investment Growth Accounting

Track separately:

- Starting portfolio
- Personal contributions
- Employer contributions
- Investment gains

At any projection date:

`portfolio = startingPrincipal + personalContributions + employerContributions + investmentGrowth`

Display both dollar amounts and percentages.

This is important because the user wants to understand how much of FIRE comes from their own money versus compounding.

---

## 28. UI Layout

Recommended desktop layout:

### Top Header
- FIRE Projector
- Save
- Reset
- Export / Import

### Dashboard Cards
- Net worth
- FIRE portfolio
- FIRE goal
- FIRE progress
- Target retirement age
- Projected FIRE age
- Total monthly investing
- Required monthly investing

### Left / Settings Panel
Collapsible sections:
- Personal
- FIRE goal
- Accounts
- Contributions
- Budget
- Return assumptions
- Emergency fund
- Advanced

### Main Area
- Scenario tabs/cards
- Main line chart
- Scenario comparison table
- FIRE bridge
- Additional charts
- Sensitivity analysis

Use responsive mobile-friendly controls.

---

## 29. Scenario Editing UX

Each scenario should have:

- Name
- Duplicate
- Delete
- Show/hide
- Set as base
- Reset overrides

Let the chart library assign colors automatically.

Use a base-profile + scenario-overrides architecture so the user does not need to re-enter every account for each scenario.

For example:

Base profile:
- age 30
- balances
- accounts
- target age 50

Scenario override:
- return = 4%
- brokerage contribution = $1,500
- retirement age = 48

---

## 30. Save / Import / Export

Persist everything in LocalStorage.

Also support:

### Export
Download all settings/scenarios as JSON.

### Import
Load a previously exported JSON file.

Include a schema version so future migrations are possible.

Example:

```json
{
  "version": 1,
  "profile": {},
  "accounts": [],
  "scenarios": []
}
```

---

## 31. Input Validation

Validate:

- Current age > 0
- Retirement age > current age
- Withdrawal rate > 0 and < 100%
- Returns > -100%
- Balances >= 0
- Contributions >= 0
- Annual spending >= 0
- Maximum age > retirement age

Display friendly inline errors.

Do not allow NaN, Infinity, or invalid projections.

---

## 32. Formatting

Use:

- `$1,500,000`
- `$3,000/mo`
- `3.5%`
- `Age 48.7`
- `13.3% to FIRE`

Allow compact display on charts:

- $500K
- $1.5M
- $2.0M

Tooltips should show full values.

---

## 33. Precision

Financial calculations should use sufficient numeric precision.

For display:

- Currency: nearest dollar unless cents are useful
- Percentages: 1–2 decimal places
- FIRE age: one decimal place
- Projection calculations: full internal precision

---

## 34. Tests

Write unit tests for at least:

1. FIRE number calculation
2. Monthly return conversion
3. Account growth
4. Multiple-account aggregation
5. FIRE crossing age
6. Required contribution solver
7. Contribution phase transitions
8. Emergency-fund trigger
9. Scenario overrides
10. Real vs nominal mode
11. FIRE eligibility toggles
12. Employer contribution handling

Add several known-value tests.

---

## 35. Important UX / Financial Warnings

Add a small disclaimer:

> This tool is for planning and educational purposes. Investment returns, inflation, tax laws, withdrawal rules, and future expenses are uncertain. Projections are estimates, not guarantees or individualized tax/legal advice.

Do not clutter the interface with warnings.

---

## 36. Core Design Principle

The app should distinguish these concepts clearly:

### Net Worth
Everything owned minus liabilities.

### FIRE Portfolio
Assets intended to fund financial independence.

### Accessible FIRE Assets
Assets that can readily fund early retirement.

### Emergency Fund
Cash held for security, not assumed to earn long-term equity returns.

### Contributions
New money invested.

### Investment Growth
Compounding generated by the portfolio.

These should NEVER be treated as interchangeable.

---

## 37. Key Default FIRE Plan to Seed

Create a preset called:

### FIRE at 50 – Base Plan

Use:

- Current age: 30
- Target retirement age: 50
- Annual spending target: $52,500
- SWR: 3.5%
- FIRE target: $1.5M
- Real return: 5%

Current accounts:

- Roth 401(k): $180,000
- Roth IRA: $14,000
- Traditional IRA: $2,700
- Taxable brokerage: $2,900
- HYSA: $45,600
- Other crypto: $20,000

Current FIRE portfolio should exclude:
- HYSA by default
- Other crypto by default

Current FIRE portfolio should therefore start around:

`$180,000 + $14,000 + $2,700 + $2,900 = $199,600`

Current net worth should start around:

`$265,200`

subject to rounding and account updates.

---

## 38. Default Scenarios

Seed at least these scenarios:

### 1. Base FIRE at 50
- Real return: 5%
- FIRE target based on $52,500 spending / 3.5%
- Target retirement age: 50
- Use contribution phases

### 2. Conservative Returns
- Real return: 4%
- Same contributions
- Same FIRE target

### 3. Higher Contributions
- Real return: 5%
- Increase taxable brokerage contribution after emergency fund completion
- Total FIRE investing around $3,500/month including employer money

### 4. Lower Contributions
- Real return: 5%
- Total FIRE investing around $2,500/month

### 5. Higher Retirement Lifestyle
- Desired annual FIRE spending: $61,250
- SWR: 3.5%
- FIRE target: $1.75M

This should make the multi-line comparison graph useful immediately when the app first opens.

---

## 39. Definition of Done

The project is complete when the user can:

1. Enter their current age.
2. Enter their target retirement age.
3. Enter desired annual retirement spending.
4. Change their safe withdrawal rate.
5. See the FIRE goal update automatically.
6. Add/edit/remove financial accounts.
7. Set current account balances.
8. Set contributions by account.
9. Add employer contributions.
10. Create contribution phases.
11. Build toward an emergency-fund target first.
12. Compare at least 8 FIRE scenarios.
13. See all scenario portfolio timelines on one line graph.
14. See the exact age/date each scenario hits its own FIRE goal.
15. See whether each scenario is ahead or behind the target retirement age.
16. See required monthly contributions.
17. Separate personal and employer contributions.
18. Separate net worth from FIRE assets.
19. Separate contributions from investment growth.
20. Evaluate early-retirement accessibility.
21. Save data locally.
22. Export/import data.
23. Use the app comfortably on desktop and mobile.

---

## 40. Final Build Instructions for Codex

Before writing code:

1. Propose the component structure.
2. Propose the TypeScript data model.
3. Propose the financial calculation functions.
4. Explain how scenario overrides will work.
5. Explain how contribution phases and trigger-based transitions will work.
6. Then implement the app.

Prioritize calculation correctness and clear financial concepts over visual gimmicks.

Use deterministic calculations.

Do not silently change assumptions.

Every derived value should have an obvious source or formula available through a tooltip, info icon, or details panel.

The user should be able to answer this question within a few seconds of opening the app:

> "Am I on track to fully retire at my desired age, and if not, what specifically do I need to change?"

# FIRE Projector

A private Windows desktop planner built with Electron, React, and TypeScript. Your plan is saved locally; Export and Import move a plan between computers. Version 1.1 keeps the existing saved-plan format.

## Using the app

Run `release/FIRE-Projector-Setup-1.1.1.exe`. Close an older running version before installing.

All editable settings are in the input area at the top:

- **Plan:** the selected scenario’s retirement goals, return assumptions, and emergency-fund target. Fields marked shared apply across scenarios.
- **Monthly money:** deposited take-home, expenses, and every account’s personal and employer contributions. Choose a contribution phase here; the budget breakdown below follows that selection.
- **Accounts:** shared balances, account types, eligibility, returns, and optional holdings. Contributions have a single editor in Monthly money.

Press **Enter** to apply a numeric edit or **Escape** to cancel. Leaving a numeric field without pressing Enter discards that draft. Applied changes save automatically. All charts, metrics, and budget comparisons appear below the inputs. Use **View results** and **Edit inputs** to jump between them.

The take-home formula preserves the configured budget scope:

`Deposited take-home − expenses − Roth IRA − taxable brokerage − HYSA/cash savings = unassigned take-home`

Payroll retirement and employer contributions are not deducted again. HYSA/cash savings are deducted in every contribution phase using the selected personal contribution. Other account types remain tracked outside this remainder and are labeled accordingly. Gross income remains supported in imported data but has no input because it does not affect the calculation.

## Development

Use a Node.js version compatible with the locked Vite and Electron packages.

```sh
npm ci
npm run dev:desktop
```

The development desktop window uses Vite hot reload. Keep it open while editing;
renderer changes appear automatically, and **Refresh app** reloads the current
development bundle without reinstalling anything. Use the packaged installer
workflow below for final releases.

`npm run dev` runs only the web UI. Dependencies are pinned and `package-lock.json` is committed so installation is reproducible.

```text
src/
  App.tsx                 App state, persistence, and page composition
  components/
    InputHub.tsx          Scenario selection and consolidated input workspace
    Editors.tsx           Plan, expense, and account forms
    Results.tsx           Charts, scorecard, bridge, and sensitivity results
    BudgetSummary.tsx     Read-only budget breakdown and comparisons
    ui.tsx                Shared accessible form controls and formatting
  domain/                 Types, seeded data, and pure calculations
  lib/persistence.ts      Local save, import, and export
  main.tsx                React entry point
  styles.css              App styling
electron/main.cjs         Desktop window and application lifecycle
tests/                    Calculation regression tests
scripts/                  Isolated desktop UI tests and generated-file cleanup
```

## Verification and packaging

```sh
npm test                  # Calculation regression tests
npm run build             # Strict TypeScript checks and production UI
npm run test:ui           # Hidden Electron interaction checks, temporary profile
npm run build:desktop    # Current Windows installer
npm run build:portable   # Optional standalone executable
npm run clean            # Remove generated output; keep only the current installer
```

The UI test checks input placement, read-only results, Enter-only commits, budget math, phases, scenario isolation, persistence, and desktop layout. Pass `--capture` directly to `electron scripts/ui-smoke.cjs` to save optional screenshots under ignored `artifacts/`.

`dist/`, `release/`, `artifacts/`, caches, and dependencies are generated and excluded from source control. Cleanup removes older installers and unpacked builds; it never touches source or the installed app’s saved plan. Run a build again after cleanup before launching a production build or UI test. Only production UI and the desktop entry point are included in installers; tests and developer scripts are excluded.

## Projection conventions

- Contributions are added at the beginning of each month before investment returns.
- Monthly return is `(1 + annualRate)^(1/12) - 1`.
- Real-dollar mode holds the FIRE target constant; nominal mode inflates it monthly.
- The projection follows all contribution phases, independent of the phase selected for budget editing.
- Required contributions use a binary search against the same projection engine.
- Bridge estimates add only personal Roth IRA contributions to the entered Roth IRA basis.

# FIRE Projector

A private Windows desktop planner built with Electron, React, and TypeScript. Your plan is saved locally; Save and Load keep named plan snapshots on this computer. Version 1.1 keeps the existing saved-plan format.

In the desktop app, **Save** opens Windows **Save As** in the app’s writable `saves` folder under its user-data directory. Enter a file name and click **Save plan**; you can still choose another folder in the dialog if needed. A confirmation shows the full path to the saved JSON file and stays open until dismissed. The file contains the complete plan, its name, and save time. **Load** lists the plan files found in the app’s `saves` folder. Canceling the dialog saves nothing. The web version keeps named saves in browser storage and identifies that location in its confirmation.

## Using the app

Run `release/FIRE-Projector-Setup-1.1.1.exe`. Close an older running version before installing.

All editable settings are in the input area at the top:

- **Plan:** the selected scenario’s retirement goals, return assumptions, and emergency-fund target. Fields marked shared apply across scenarios.
- **Monthly money:** deposited take-home, expenses, and every account’s personal and employer contributions. Choose a contribution phase here; the budget breakdown below follows that selection.
- **Accounts:** shared balances, account types, eligibility, returns, and optional holdings. Contributions have a single editor in Monthly money.

Press **Enter** to apply a numeric edit or **Escape** to cancel. Leaving a numeric field without pressing Enter discards that draft. Applied changes save automatically. All charts, metrics, and budget comparisons appear below the inputs. Use **View results** to jump to the results.

The take-home formula uses the configured deposited income and all personal non-payroll contributions:

`Deposited take-home − expenses − personal non-payroll contributions = unassigned take-home`

401(k) payroll and employer contributions are not deducted again because they are already withheld or paid separately. Gross income remains supported in imported data but has no input because it does not affect the calculation.

## Desktop updates

**Check updates** downloads the latest published Windows installer from this repository's GitHub Releases. Every push to `main` runs `.github/workflows/desktop-release.yml`: it tests and builds the app, then publishes the installer. Allow the workflow to finish before checking in the app. Releases use increasing `1.2.<workflow run number>` versions so existing 1.1.1 installations detect the update, even when the source package version has not changed.

Choose **Update now** to download and launch the installer. The app closes only after the installer starts. Complete the installation and reopen FIRE Projector; your locally saved plans are retained. Source commits become desktop updates after packaging succeeds. A failed build leaves the previous release available. The workflow can also be run manually from GitHub Actions.

## Local development

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
- The FIRE crossing is calculated from the accumulation projection. At the selected retirement age, contributions stop and the full projection begins monthly withdrawals equal to annual retirement spending divided by 12.
- Real-dollar withdrawals stay level; nominal-dollar withdrawals rise with inflation. Retirement withdrawals are drawn proportionally from FIRE-eligible accounts in this baseline and are not tax- or account-order-aware.
- The drawdown is a deterministic estimate using the configured return assumptions; it does not represent a probability of success or model market sequence risk.
- Required contributions use a binary search against the same projection engine.
- Bridge estimates add only personal Roth IRA contributions to the entered Roth IRA basis.

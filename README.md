# FIRE Projector

FIRE Projector is a local-first FIRE planner built with React and TypeScript, available as a Windows desktop app and a static web app. Plan data stays on the current computer or browser and is not synced to a server. Version 1.4 keeps the existing saved-plan format.

In the desktop app, **Save** opens Windows **Save As** in the app’s writable `saves` folder under its user-data directory. Enter a file name and click **Save plan**; you can still choose another folder in the dialog if needed. A confirmation shows the full path to the saved JSON file and stays open until dismissed. The file contains the complete plan, its name, and save time. **Load** lists the plan files found in the app’s `saves` folder. Canceling the dialog saves nothing. The web version keeps named saves in browser storage and identifies that location in its confirmation.

## Using the app

First-time plans start with zero current and retirement ages, balances, income, spending, holdings, and contribution amounts. Maximum projection age starts at **100**. Three editable assumptions are populated: nominal return **10%**, inflation **3.2%**, and withdrawal rate **4%**. Real return is calculated from nominal return and inflation (about **6.59%** initially). Existing browser data and named saves retain their assumptions. **Reset** restores these same numeric defaults for every scenario, restores the spending-based FIRE goal, and opens the Plan tab. It preserves names, account structure, and named saves.

The nominal-return default is the approximate long-term U.S. stock-market benchmark described by [Fidelity](https://www.fidelity.com/learning-center/trading-investing/sp-500-average-return). Inflation uses the [Minneapolis Fed national CPI history](https://www.minneapolisfed.org/about-us/monetary-policy/inflation-calculator/consumer-price-index-1913-): `(321.9 / 9.9)^(1 / 112) - 1 = 3.1575%` for 1913–2025, rounded to 3.2%. These are fixed, editable historical assumptions; the app makes no requests for financial data when it opens.

### iPhone Home Screen

After the web app is deployed, open its URL in Safari, tap **Share** → **Add to Home Screen**, leave **Open as Web App** enabled if offered, and tap **Add**. Install it before entering plan data: iOS keeps Home Screen web-app storage separate from Safari and does not copy named saves automatically.

Use **Refresh app** at the top of the web app to load the latest deployment. It saves applied changes before refreshing and keeps your named saves. On touch screens, tap a chart to brighten its colors; tap outside it to return to the muted palette. Scrolling cancels the touch highlight.

Run `release/FIRE-Projector-Setup-<version>.exe`. Close an older running version before installing.

The Windows app uses the same black interface and minimalist tiger artwork as the web app. Its executable, installer, uninstaller, and shortcuts use `assets/fire-tiger-minimal.ico`, a multi-size Windows icon derived from the shared artwork. Native Electron controls use the dark theme.

All editable settings are in the input area at the top:

- **Plan:** the selected scenario’s retirement goals, return assumptions, and emergency-fund target. Fields marked shared apply across scenarios.
- **Monthly money:** deposited take-home, expenses, and every account’s personal and employer contributions. Choose a contribution phase here; the budget breakdown below follows that selection.
- **Accounts:** shared balances, account types, eligibility, returns, and optional holdings. Contributions have a single editor in Monthly money.

Press **Enter** to apply a numeric edit or **Escape** to cancel. Leaving a numeric field without pressing Enter discards that draft. Applied changes save automatically. All charts, metrics, and budget comparisons appear below the inputs. Use **View results** to jump to the results.

The take-home formula uses the configured deposited income and all personal non-payroll contributions:

`Deposited take-home − expenses − personal non-payroll contributions = unassigned take-home`

401(k) payroll and employer contributions are not deducted again because they are already withheld or paid separately. Gross income remains supported in imported data but has no input because it does not affect the calculation.

## Desktop updates

**Check updates** downloads the latest published Windows installer from this repository's GitHub Releases. Releases are created only when an explicit semantic-version tag such as `v1.2.5` is pushed. The release workflow checks that the tag version matches `package.json` and that the tag points to the exact current `main` commit before it builds or publishes anything. This keeps the source for a release, the tag, and the installer aligned.

Choose **Update now** to download and launch the installer. The app closes only after the installer starts. Complete the installation and reopen FIRE Projector; your locally saved plans are retained. Source commits become desktop updates after a version tag is published successfully. A failed build leaves the previous release available. The workflow can also be rerun manually for an existing tag while that tag is still the current `main` commit. See [PUSHING.md](PUSHING.md) for the exact push and release commands.

## Local development

Use a Node.js version compatible with the locked Vite and Electron packages.

```sh
npm ci
npm run dev:desktop
```

The development desktop window uses Vite hot reload. Keep it open while editing;
renderer changes appear automatically, and **Refresh app** reloads the current
development bundle without reinstalling anything. Use the packaged installer
workflow described in [PUSHING.md](PUSHING.md) for final releases.

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
- Monthly investment and savings contributions can be entered as dollar amounts or as a percentage of deposited take-home for the selected phase; the projection stores and uses the equivalent dollar amount.
- Monthly return is `(1 + annualRate)^(1/12) - 1`.
- Real-dollar mode holds the FIRE target constant; nominal mode inflates it monthly.
- The projection follows all contribution phases, independent of the phase selected for budget editing.
- The FIRE crossing is calculated from the accumulation projection. At the selected retirement age, contributions stop and the full projection begins monthly withdrawals equal to annual retirement spending divided by 12.
- Real-dollar withdrawals stay level; nominal-dollar withdrawals rise with inflation. Retirement withdrawals are drawn proportionally from FIRE-eligible accounts in this baseline and are not tax- or account-order-aware.
- The drawdown is a deterministic estimate using the configured return assumptions; it does not represent a probability of success or model market sequence risk.
- Required contributions use a binary search against the same projection engine.
- Bridge estimates add only personal Roth IRA contributions to the entered Roth IRA basis.

# FIRE Projector iPhone implementation plan

## Purpose and required outcome

Create a phone-first version of FIRE Projector that can be developed, viewed, and tested on the owner's Windows PC. After the owner is satisfied with that version, package **that same mobile project** as an installable iPhone app. Installation for personal testing must not require publishing to the App Store.

The existing Windows desktop app must keep working exactly as it does now. Its source files, Electron packaging, release workflow, saved plans, and versioning are outside the mobile implementation scope.

This is a two-stage project with a decision gate:

1. **Windows preview:** deliver a complete mobile UI running locally in a Windows browser, with automated phone-size checks. Stop here for owner review.
2. **iPhone packaging:** only after the owner accepts the preview, add the native iOS shell, sign it, install it on an iPhone, and complete real-device checks.

Do not represent the Windows preview as an iOS Simulator. Browser device emulation approximates viewport, touch, and some browser behavior. Apple's iOS Simulator requires Xcode on macOS, and final behavior must be checked on a physical iPhone. See [Playwright device emulation](https://playwright.dev/docs/emulation), [Playwright WebKit](https://playwright.dev/docs/browsers), and [Apple's simulator documentation](https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators).

## Architecture decision: two independent projects

Keep the current repository in place. Create a **new sibling Git repository**, not a nested folder and not a shared package, for the iPhone app. The common parent is only a workspace folder; it has no build configuration or shared dependency graph.

```text
ChatGPT/
├── fire_calculator/                    # Existing Windows desktop Git repository
│   ├── src/                             # Existing desktop React app and calculations
│   ├── electron/                        # Existing Windows Electron integration
│   ├── tests/
│   ├── .github/workflows/desktop-release.yml
│   ├── package.json
│   └── IPHONE_IMPLEMENTATION_PLAN.md    # This plan; no desktop source changes
└── fire_projector_ios/                  # New, independent mobile Git repository
    ├── src/
    │   ├── app/                         # Mobile entry, routing/navigation, state
    │   ├── domain/                      # One-time copy of pure FIRE calculations/types
    │   ├── features/                    # Phone-first screens and components
    │   ├── data/                        # Plan validation, migration, persistence, import/export
    │   ├── platform/                    # Browser/native storage and share interfaces
    │   └── styles/                      # Mobile-only layout and design tokens
    ├── public/                          # Mobile icons and static assets
    ├── tests/
    │   ├── unit/                        # Calculation and data compatibility tests
    │   ├── e2e/                         # Phone-size browser interaction tests
    │   └── fixtures/                    # Synthetic version-1 plan examples
    ├── docs/
    │   ├── IMPLEMENTATION_PLAN.md       # Copy of this approved plan for mobile agents
    │   ├── SOURCE_BASELINE.md           # Desktop commit and one-time copy record
    │   └── FEATURE_MATRIX.md            # Desktop feature to mobile screen/test map
    ├── scripts/                         # Windows phone-preview launcher
    ├── ios/                             # Add later, after Windows-preview approval
    ├── .github/workflows/              # Mobile-only CI, if a remote repo is used
    ├── package.json                     # Mobile-only scripts and dependencies
    ├── package-lock.json
    ├── vite.config.ts
    ├── playwright.config.ts
    └── README.md                        # Windows preview and eventual iPhone install
```

The proposed names are identifiers for the new project, not instructions to rename or move `fire_calculator`. If the repositories are opened together in an editor, use a multi-root workspace. Always run Git and npm commands from the intended repository root.

Before creating the sibling directory, ensure the implementing environment grants write access to it or add it as a workspace root. If access is unavailable, obtain that access; do not silently put the iOS app inside the desktop repository as a fallback. Keep the mobile repository local until a separate remote repository and its visibility have been deliberately chosen.

**Isolation rules for the implementing agent:**

- Treat the desktop repository as a read-only source while creating the mobile app. Do not move its files, change its `src/`, `electron/`, tests, package files, scripts, or `.github` workflow, or add mobile dependencies to its `package.json`.
- Copy selected code into the mobile repository **once**; do not use symlinks, Git submodules, relative imports across repositories, local `file:` dependencies, or a shared build output. This intentionally allows the versions to diverge.
- Give each repository its own Git history, lockfile, version, tests, and release process. A mobile commit or release must not trigger a Windows desktop build or update.
- After the initial copy, move a fix between versions only through an explicit, reviewed port. Maintain a short compatibility note in the mobile repository when the data format or calculations diverge.
- Do not copy real saved financial plans into either repository, test fixtures, screenshots, or hosted preview builds.
- Keep owner-preview browser profiles, imported JSON files, screenshots that contain real data, native app data, and signing material out of Git with mobile-specific ignore rules.
- Preserve the desktop repository's pre-existing working-tree state. The implementation should create no further desktop changes beyond this plan, whether or not this Markdown file has been committed when work begins.

## Current desktop baseline and reusable material

At the time this plan was written, the desktop source commit was `e82e3cb9e1ead90f45724462052911c0a2fee84a`; `package.json` identified version `1.2.72`. This plan was then added to the working tree. The implementation agent should record the actual commit and working-tree state used for the copy because desktop development may continue before mobile work begins.

The existing app is React/TypeScript/Vite inside Electron. Its reusable, platform-neutral starting point is `src/domain/{types,calculations,roth}.ts`, with calculation regression coverage in `tests/calculations.test.ts` and `tests/roth.test.ts`. Audit `src/domain/defaults.ts` before copying it: its seeded account balances, holdings, income, and budget entries may reflect private financial information. Use clearly synthetic mobile defaults and test fixtures unless the owner explicitly approves copying those seeded values. Preserve historical save-migration behavior without coupling it to the new synthetic defaults. The mobile repo may copy existing React components as a **starting snapshot**, then edit only those mobile copies. Do not import desktop files at build time.

The current `AppData` format is `version: 1` with `profile`, `accounts`, `phases`, `scenarios`, and `budget` (`src/domain/types.ts`). Desktop named saves are JSON envelopes with `id`, `name`, `savedAt`, and `data` (`electron/main.cjs`). The desktop renderer also uses `localStorage` (`src/lib/persistence.ts`). The desktop `Load` menu reads the desktop app's own `saves` directory; there is no general import button. The mobile implementation must account for this when describing transfers back to Windows.

Known mobile-specific changes include:

- The current `CommittedNumberInput` applies edits with Enter and discards drafts on blur. An iPhone numeric keyboard may not offer a practical Enter workflow.
- The desktop CSS hides top-bar ghost buttons under 460 px, which would hide Save and Load on most iPhones.
- The scorecard table has a 960 px minimum width, and the scenario comparison and allocation views are wide. These need deliberate phone layouts, not only scaled-down text.
- Desktop update checking, Windows installer language, file paths, and Electron bridges are desktop-only behavior.

## Stage 1 — Windows-testable mobile project

### 1. Bootstrap without touching desktop

1. Record the desktop source commit and current `git status` before copying. Preserve any pre-existing changes; do not require a clean tree merely because this plan is present.
2. Ensure `../fire_projector_ios` is writable, then create it as an independent Git repository. Use React, TypeScript, and Vite. Pin and commit dependencies with a mobile-only lockfile. Keep it local until its remote visibility is decided.
3. Copy the pure domain files and relevant unit tests from the recorded desktop commit. Audit and replace seeded defaults with synthetic mobile examples; adapt default-dependent test fixtures and expected values without weakening calculation coverage. Record copied paths, source commit, and any intentional changes in `docs/SOURCE_BASELINE.md`. Copy UI code only as a temporary starting point in the mobile repo; remove Electron-specific paths and desktop updater behavior there.
4. Copy this plan to the mobile `docs/IMPLEMENTATION_PLAN.md` so future work in the independent repository has its requirements. Create `docs/FEATURE_MATRIX.md` before rewriting screens; list every desktop feature, the proposed mobile screen/action, and how it will be checked.
5. Provide mobile scripts with these responsibilities: `npm run dev` for the raw local web app, `npm run dev:phone` for a **one-command interactive, phone-sized preview on Windows**, `npm run build` for type-check plus production build, `npm test` for unit tests, `npm run test:e2e` for phone-size browser tests, and `npm run preview` for the built app. The `dev:phone` script may launch a headed Playwright browser using an iPhone device descriptor or a development-only device-frame page; it must support mouse interaction, show the intended mobile viewport, and be excluded from the production app. Document the actual localhost URL printed by Vite; do not hard-code a port that might be occupied.
6. Add a mobile README with exact Windows prerequisites and commands: `npm ci`, `npm run dev:phone`, `npm test`, `npm run build`, `npm run test:e2e`. No Apple tools are needed for Stage 1.

### 2. Preserve behavior while designing for touch

Implement the entire existing planning capability in the mobile project: profiles and goals, contribution phases, monthly money and budget, accounts and holdings, Roth transfers, scenarios and overrides, projection results, comparisons, and charts. Preserve the calculation conventions and explanatory notes unless a mobile-specific change is explicitly approved.

Make the feature matrix a release checklist rather than a design sketch. Inventory scenario creation, duplication, renaming, visibility, reset, deletion, and the existing scenario-count limit; shared versus scenario-specific edits; all contribution phases and triggers; budget reset; account and holding edits; Roth conversion/transfer controls; real/nominal mode; every results panel and sensitivity control; and current-plan autosave, named saves, load, and reset. Record any intentional mobile difference and obtain owner review for a removed or materially changed feature.

Use a phone-first navigation model so a user can reach **Overview**, **Plan**, **Monthly money**, **Accounts**, **Results**, and **Saved plans** without scrolling through the whole desktop page. A compact tab bar, menu, or combination is acceptable; the important contract is that every feature remains reachable and state is preserved while changing screens. Keep scenario selection and the active contribution phase visible or quickly accessible from the relevant screens.

Specific interaction requirements:

- Replace the Enter-only numeric edit with a visible **Apply/Done** action or another explicit touch-friendly commit. Preserve validation, bounds, and a clear way to cancel an in-progress edit; never silently discard a changed value on blur.
- Use appropriate mobile keyboard hints (`inputMode` where useful) and input text of at least 16 CSS pixels to avoid unwanted iPhone focus zoom. Check decimal and negative values, selection, and keyboard dismissal on the physical device.
- Keep **Save**, **Load**, **Export**, **Import**, and **Reset** reachable at phone width. Confirm destructive reset and replacement of a named save.
- Use touch-sized controls, readable text, iOS safe-area spacing, sensible focus order, labeled inputs, and accessible chart summaries. Check the on-screen keyboard does not cover the active input or its action.
- Rework wide tables into scenario cards, stacked detail views, or an intentional comparison view. Horizontal scrolling may be used for secondary detail, but no core value or action should be hidden without an affordance.
- Retain chart interactions where usable on touch; provide readable labels and a text or table fallback for values that are hard to inspect with a finger.
- Show mobile-specific version and storage wording. Omit the Windows **Check updates** and installer controls from the mobile UI.

### 3. Mobile data and portability

Define a small `PlanRepository` interface used by the UI, with operations for current-plan autosave, named-save listing/saving/loading/deletion, and backup import/export. Keep platform details behind the interface so the browser preview and later iPhone package can use different storage adapters without changing planning screens.

Repository initialization is asynchronous. Show a loading state until stored data has been read and validated; do not mount an editable seeded plan and autosave it before initialization finishes, which could overwrite an existing plan. The Windows preview and iPhone app have separate storage; moving a preview plan to the phone requires the explicit JSON export/import flow.

For the Windows browser preview, use IndexedDB or another appropriate persistent browser store with explicit error handling. Never use the desktop app's Electron IPC or save directory. For the later native package, implement and test a device-local adapter using an appropriate Capacitor storage or filesystem facility; do not assume that passing browser tests proves the native adapter works. Use the same repository contract tests against each adapter where possible.

Define save behavior precisely before coding: an applied edit should be queued for persistence; writes must be serialized so an older save cannot overwrite a newer one; loading, importing, and resetting must not race with a pending autosave. Show when data is saved and surface storage failures instead of claiming success. Test rapid edits, app/page close and reopen, storage rejection, and interrupted migration with synthetic data. Keep the original record until a migration has validated and committed successfully.

Define and document one portable JSON format. Accept both a raw version-1 `AppData` object and a desktop named-save envelope on import. Validate required structure and numeric values before replacing current data; show a preview/confirmation and a useful error for invalid or unsupported files. Export a named-save envelope that preserves the version-1 `data` object and can be backed up through the device's Files/Share interface once native packaging is available. Import/export in the Windows preview can use a file picker and browser download.

Port the desktop loader's legacy normalization rules for real/nominal returns, starter scenarios, and crypto return mode, then test them with synthetic historical fixtures. State which schema versions the mobile app accepts and which it exports. When mobile data eventually changes, add an explicit versioned migration and compatibility test instead of silently treating a changed schema as version 1. Put a reasonable file-size limit on imports, reject malformed structures and non-finite numbers, sanitize any filename derived from plan names, and preserve the current plan when import fails. Do not log plan contents in normal operation or test output.

There is **no automatic sync** between Windows and iPhone. To move a plan from desktop to mobile, save it as JSON on Windows and import that file into mobile. To move a mobile export back to the unchanged desktop app, place a compatible exported JSON file in the desktop app's `saves` directory using File Explorer; its `Load` menu does not import arbitrary paths. Document the exact location after verifying it on the installed desktop app. Use a unique filename and back up an existing file before any manual replacement. Avoid promising two-way transfer through the desktop UI.

Keep local saves separate per installation. Provide a clear backup/export action because uninstalling an app or clearing browser/site data can remove local plans. Do not transmit plan contents to a server or analytics service.

### 4. Windows preview and automated checks

Run the Vite app locally on Windows in Edge or Chrome, and make `npm run dev:phone` the easy owner-facing preview command. Give the owner preview a stable, dedicated browser profile so its local plans persist across preview sessions; use isolated disposable profiles for automated tests so tests never reset the owner's preview data. Document how to open the browser's device toolbar, select representative iPhone widths, enable touch simulation, and test portrait and landscape. Add Playwright projects for phone-sized Chromium and WebKit with touch-enabled device profiles. Playwright supports device emulation and a WebKit browser build on Windows, but its WebKit is not identical to iOS Safari or the eventual Capacitor `WKWebView` ([Playwright documentation](https://playwright.dev/docs/browsers)). Stage 1 is local-only; it does not require website hosting.

Use synthetic plan fixtures and regression tests to compare copied mobile calculation results with the recorded desktop baseline. Generate expected outputs from the desktop calculation engine for those fixtures before changing the mobile copy; store the fixture and expected results in the mobile repo, with no personal data. At minimum verify FIRE target, projection dates and balances, contribution phases, budgets, Roth/bridge results, and scenario overrides. Focus end-to-end checks on high-risk user journeys: changing an amount with the touch workflow; adding/editing a scenario; switching phases; saving and loading; import/export round-trip; reset; and navigating every major result at narrow width. Check for horizontal page overflow, unreachable controls, console errors, and persistence after reload. Capture screenshots for owner review at representative phone sizes, for example 375 × 812 and 430 × 932 CSS pixels, plus a landscape orientation. The preview should also make the on-screen-keyboard and safe-area limitations explicit for later real-device testing. Measure editing responsiveness with the maximum supported scenarios and representative account/holding counts; if projections block typing or navigation, move or defer the expensive computation without changing results.

**Stage 1 acceptance gate:** The owner can run the mobile repo from Windows, interact with a phone-sized preview, inspect screenshots, and review a completed feature matrix. Unit, build, and browser tests pass, including calculation parity, import/export, save-failure handling, and persistence after relaunch. No iOS packaging is started until the owner says the preview is satisfactory.

## Stage 2 — Package and test on iPhone after approval

### 5. Add native iOS shell in the mobile repository only

Use Capacitor around the approved mobile Vite build. Configure its web directory to the mobile `dist`, choose a unique iOS bundle ID owned by the signing team (do not reuse the desktop `com.fireprojector.desktop` ID), add mobile icons/splash assets, and add the generated `ios/` Xcode project **inside `fire_projector_ios` only**. Fix the bundle ID before the first device install and keep it stable across updates because iOS uses it to identify the app ([Apple bundle-ID guidance](https://developer.apple.com/documentation/xcode/changing-the-bundle-identifier)). Set mobile version/build numbers independently of the desktop release. Configure the mobile viewport and safe-area CSS for iPhone cutouts and the home indicator, and verify orientation behavior on device. The packaged app should load bundled assets and perform calculations offline; it should not depend on a running Windows PC or hosted site. Confirm the production Capacitor configuration contains no development `server.url`, and smoke-test that Vite assets resolve in the packaged `WKWebView`. The implementation sequence in the mobile repo is to install version-matched Capacitor core/CLI/iOS packages, initialize Capacitor, run `npx cap add ios` on macOS, run the mobile `npm run build`, run `npx cap sync ios`, then open the project with `npx cap open ios` for signing and device installation. Commit the iOS project and native configuration to the mobile repo, while keeping generated build output and credentials out of Git.

Choose and document the native persistence and file-sharing implementation before installing plugins. If using Capacitor Filesystem and Share, verify the current plugin versions, iOS privacy-manifest requirements, and whether files need to appear directly in the Files app or only be exported through the share sheet ([Filesystem](https://capacitorjs.com/docs/apis/filesystem), [Share](https://capacitorjs.com/docs/apis/share)). Test the native adapter against the same plan-repository contract as the Windows browser adapter. Define how native imports are selected, where temporary export files are placed, and how they are removed afterward. Keep plan data inside the app's private storage until the user deliberately exports it.

The expected workflow is to build the mobile web assets, sync them into Capacitor, and run the iOS project in Xcode. Pin the Capacitor version selected during implementation and follow its matching documentation. Capacitor currently requires macOS and Xcode for iOS builds; its documentation lists the version-specific Xcode minimum ([environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [iOS setup](https://capacitorjs.com/docs/ios)). Windows remains the main UI development environment, but a Mac or macOS build service with signing access is required for this step.

### 6. Install without an App Store release

Prefer direct Xcode installation on the owner's iPhone for initial native testing. A free Apple Account's Personal Team can do this, but its device provisioning expires after seven days and requires periodic rebuilding/reinstalling. For longer-lived direct installation on registered devices, use an Apple Developer Program membership and ad hoc distribution. Neither path requires a public App Store listing ([Apple membership comparison](https://developer.apple.com/support/compare-memberships/), [registered-device distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)). At the Stage 2 gate, confirm the Mac or macOS build service, physical iPhone and iOS version, Apple Account or Developer Program membership, and device-install method. Document how later mobile builds will be signed and installed, since direct installation has no automatic desktop-style updater. Back up a plan before reinstalling or changing signing configuration.

Do **not** use TestFlight as the default route for this request: it requires uploading a build to App Store Connect, and its test builds expire after 90 days, even though it is separate from a public App Store release ([TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)). Confirm the owner's Mac/signing arrangement and chosen direct-install path at the Stage 2 gate. Never place Apple credentials or signing private keys in either repository.

### 7. Real-device validation and handoff

On a physical iPhone, repeat the critical workflows: cold launch and relaunch, keyboard editing, safe areas, touch targets, charts, plan persistence, import/export through Files/Share, offline launch and calculation, app update/reinstall behavior, and recovery from invalid files or failed saves. Verify external reference links open appropriately and return to the planner. Inspect performance with representative large plans. Compare displayed projection outputs to the Windows preview for the same synthetic fixture. Test both a fresh install and an in-place update with saved data present; do not treat deleting/reinstalling the app as an update because deletion can remove its data ([Apple release-build testing](https://developer.apple.com/documentation/Xcode/testing-a-release-build)). Fix mobile-only issues in the mobile repository and rerun its tests. Deliver documented build/install steps and a backup procedure.

## Completion criteria and safeguards

- The Windows app still builds, tests, installs, saves, loads, and checks updates as before. Its code and release workflow have not been changed for the mobile project.
- The mobile app lives in its own sibling repository with no source, dependency, Git, or release linkage to the desktop repository.
- Every existing calculation and major planner feature is available in a usable phone layout; the mobile project has its own tests and versions.
- The owner can test the full mobile preview on Windows before deciding to package it.
- After Stage 2 approval and access to macOS signing tools, the app runs on the owner's iPhone without a public App Store release and without a server connection for its core planning functions.
- Plans remain device-local, with an explicit portable JSON backup and a documented manual transfer path between versions.

## Implementation-agent handoff checklist

Before starting, read this file and inspect the live desktop repository. Record the desktop source commit and current file status. Create the sibling mobile repository, then carry out Stage 1 completely. Keep a short progress log in the mobile README with completed items, test commands/results, and any intentional differences from desktop. At the Stage 1 gate, present the Windows preview, screenshots, and remaining iPhone-only risks for owner review. Begin Stage 2 only after that review is approved. At each milestone, verify the desktop repository's tracked source and workflow remain unchanged.

# FIRE Projector Desktop

A private, local-first Windows desktop app for FIRE planning and scenario comparison, built with Electron, React, TypeScript, Vite, and Recharts.

## Install on Windows

Run `npm install`, followed by:

```bash
npm run build:desktop
```

The Windows installer is written to `release/FIRE-Projector-Setup-1.0.2.exe`. The installer creates desktop and Start menu shortcuts. All calculations run locally and plan data stays in the app's local profile unless you explicitly export it.

For a standalone executable instead of an installer, run `npm run build:portable`.

## Run locally

```bash
npm install
npm run dev:desktop
```

This starts the Vite development server and opens it in the desktop shell.

## Verify and build

```bash
npm test
npm run build
```

The production UI bundle is written to `dist/`. Plan data is autosaved locally; use the app’s Export and Import controls for backups or moving a plan between computers.

## Projection conventions

- Contributions are added at the beginning of each month, then the monthly investment return is applied.
- Monthly rates are derived with `(1 + annualRate)^(1/12) - 1`.
- Real-dollar mode keeps the FIRE target in today’s dollars; nominal mode inflates the target each month.
- Scenario calculations are deterministic. The required-contribution result uses a binary search against the same monthly, multi-phase projection engine.

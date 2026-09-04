# FIRE Projector

A local-first FIRE planning and scenario comparison app built with React, TypeScript, Vite, and Recharts.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

## Verify and build

```bash
npm test
npm run build
```

The production bundle is written to `dist/`. Plan data is autosaved in browser LocalStorage; use the app’s Export and Import controls to move a plan between browsers.

## Projection conventions

- Contributions are added at the beginning of each month, then the monthly investment return is applied.
- Monthly rates are derived with `(1 + annualRate)^(1/12) - 1`.
- Real-dollar mode keeps the FIRE target in today’s dollars; nominal mode inflates the target each month.
- Scenario calculations are deterministic. The required-contribution result uses a binary search against the same monthly, multi-phase projection engine.

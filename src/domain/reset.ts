import type { AppData } from './types';
import { INITIAL_INFLATION_RATE, INITIAL_MAX_AGE, INITIAL_NOMINAL_RETURN, INITIAL_WITHDRAWAL_RATE } from './assumptions';

function zeroNumbers(value: unknown): unknown {
  if (typeof value === 'number') return 0;
  if (Array.isArray(value)) return value.map(zeroNumbers);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, zeroNumbers(item)]),
  );
  return value;
}

export function resetPlannerInputs(data: AppData): AppData {
  const next = zeroNumbers(data) as AppData;
  next.version = 1;
  next.contributionInputMode = 'amount';
  next.profile = {
    ...next.profile,
    customFireNumber: null,
    maxAge: INITIAL_MAX_AGE,
    nominalReturn: INITIAL_NOMINAL_RETURN,
    inflationRate: INITIAL_INFLATION_RATE,
    withdrawalRate: INITIAL_WITHDRAWAL_RATE,
    realReturn: (1 + INITIAL_NOMINAL_RETURN) / (1 + INITIAL_INFLATION_RATE) - 1,
  };
  // Each scenario starts from the cleared shared inputs. Remove overrides so
  // an old multiplier or account override cannot affect newly entered values.
  next.scenarios = data.scenarios.map((scenario) => ({ ...scenario, overrides: {} }));
  return next;
}

import { defaultData } from './defaults';
import { resetPlannerInputs } from './reset';
import type { AppData } from './types';

/** A new user's blank planner, using the same numeric defaults as Reset. */
export function createInitialData(): AppData {
  const blank = resetPlannerInputs(defaultData);
  return {
    ...blank,
    profile: {
      ...blank.profile,
      name: 'My FIRE plan',
    },
    accounts: blank.accounts.map((account) => ({ ...account, holdings: [], notes: '' })),
    scenarios: blank.scenarios.map((scenario, index) => ({
      ...scenario,
      name: index === 0 ? 'My FIRE plan' : 'Alternative plan',
    })),
  };
}

import { defaultData } from '../domain/defaults';
import { nominalReturnFromReal, realReturnFromNominal } from '../domain/calculations';
import type { AppData } from '../domain/types';

const STORAGE_KEY = 'fire-projector-v1';
const SAVES_KEY = 'fire-projector-saves-v1';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  data: AppData;
}
const legacyStarterScenarios = [
  { id: 'base', name: 'Base FIRE at 50', overrides: {} },
  { id: 'conservative', name: 'Conservative returns', overrides: { nominalReturn: 0.066 } },
  { id: 'higher', name: 'Higher contributions', overrides: { contributionScale: 1.2, contributions: { taxable: { personal: 1342 } } } },
  { id: 'lower', name: 'Lower contributions', overrides: { contributionScale: 0.72 } },
  { id: 'lifestyle', name: 'Higher retirement lifestyle', overrides: { annualSpending: 61250 } },
];
const migrateStarterScenarios = (data: AppData): AppData => {
  const isUntouchedLegacySet = data.scenarios.length === legacyStarterScenarios.length
    && data.scenarios.every((scenario) => {
      const legacy = legacyStarterScenarios.find((item) => item.id === scenario.id);
      return legacy && scenario.name === legacy.name && scenario.visible
        && JSON.stringify(scenario.overrides) === JSON.stringify(legacy.overrides);
    });
  return isUntouchedLegacySet ? { ...data, scenarios: clone(defaultData.scenarios) } : data;
};
const normalizeData = (data: AppData): AppData => {
  const profile = { ...data.profile, realReturn: realReturnFromNominal(data.profile.nominalReturn, data.profile.inflationRate) };
  return {
    ...data,
    profile,
    scenarios: data.scenarios.map((scenario) => {
      const { realReturn, ...overrides } = scenario.overrides;
      return {
        ...scenario,
        overrides: {
          ...overrides,
          ...(scenario.overrides.nominalReturn === undefined && realReturn !== undefined
            ? { nominalReturn: nominalReturnFromReal(realReturn, scenario.overrides.inflationRate ?? profile.inflationRate) }
            : {}),
        },
      };
    }),
    accounts: data.accounts.map((account) => account.type === 'Crypto' && account.returnMode === undefined
      ? {
          ...account,
          returnMode: 'plan',
          notes: account.notes === 'No growth assumed by default.' ? 'Uses the selected scenario return unless a custom return is chosen.' : account.notes,
        }
      : account),
  };
};

export const loadData = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultData);
    const parsed = JSON.parse(raw) as AppData;
    return parsed.version === 1 ? migrateStarterScenarios(normalizeData(parsed)) : clone(defaultData);
  } catch {
    return clone(defaultData);
  }
};

export const saveData = (data: AppData) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
export const resetData = () => clone(defaultData);

const isAppData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppData>;
  return candidate.version === 1
    && Boolean(candidate.profile)
    && Array.isArray(candidate.accounts)
    && Array.isArray(candidate.phases)
    && Array.isArray(candidate.scenarios)
    && Array.isArray(candidate.budget);
};

const createSaveId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const writeSavedPlans = (plans: SavedPlan[]) => localStorage.setItem(SAVES_KEY, JSON.stringify(plans));

export const listSavedPlans = (): SavedPlan[] => {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): SavedPlan[] => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<SavedPlan>;
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !candidate.name.trim() || typeof candidate.savedAt !== 'string' || !isAppData(candidate.data)) return [];
      return [{ id: candidate.id, name: candidate.name.trim(), savedAt: candidate.savedAt, data: normalizeData(candidate.data) }];
    }).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch {
    return [];
  }
};

export const saveNamedPlan = (name: string, data: AppData): SavedPlan => {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Give this save a name.');
  const plans = listSavedPlans();
  const existing = plans.find((plan) => plan.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  const saved: SavedPlan = {
    id: existing?.id ?? createSaveId(),
    name: cleanName,
    savedAt: new Date().toISOString(),
    data: clone(data),
  };
  writeSavedPlans(existing ? plans.map((plan) => plan.id === existing.id ? saved : plan) : [saved, ...plans]);
  return saved;
};

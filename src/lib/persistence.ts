import { defaultData } from '../domain/defaults';
import { nominalReturnFromReal, realReturnFromNominal } from '../domain/calculations';
import type { AppData } from '../domain/types';

const STORAGE_KEY = 'fire-projector-v1';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
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

export const downloadData = (data: AppData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fire-projector-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const readImport = async (file: File): Promise<AppData> => {
  const parsed = JSON.parse(await file.text()) as AppData;
  if (parsed.version !== 1 || !parsed.profile || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.scenarios)) {
    throw new Error('This file is not a valid FIRE Projector v1 export.');
  }
  return normalizeData(parsed);
};

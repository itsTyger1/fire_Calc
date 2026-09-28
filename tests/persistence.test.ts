import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { deleteSavedPlan, listSavedPlans, loadData, saveData, saveNamedPlan } from '../src/lib/persistence';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('named browser saves', () => {
  it('deletes only the selected save and keeps the current planner autosave', () => {
    const first = saveNamedPlan('First plan', structuredClone(defaultData));
    saveNamedPlan('Second plan', structuredClone(defaultData));
    const activePlan = structuredClone(defaultData);
    activePlan.accounts[0].balance += 1234;
    saveData(activePlan);

    expect(deleteSavedPlan(first.id)).toBe(true);
    expect(listSavedPlans().map((plan) => plan.name)).toEqual(['Second plan']);
    expect(loadData().accounts[0].balance).toBe(activePlan.accounts[0].balance);
  });

  it('returns false for an unknown save id without changing the saved list', () => {
    const saved = saveNamedPlan('Keep me', structuredClone(defaultData));

    expect(deleteSavedPlan('unknown-save-id')).toBe(false);
    expect(listSavedPlans().map((plan) => plan.id)).toEqual([saved.id]);
  });
});

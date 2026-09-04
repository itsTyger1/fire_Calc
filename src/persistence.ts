import { defaultData } from './defaults';
import type { AppData } from './types';

const STORAGE_KEY = 'fire-projector-v1';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const normalizeData = (data: AppData): AppData => ({
  ...data,
  accounts: data.accounts.map((account) => account.type === 'Crypto' && account.returnMode === undefined
    ? {
        ...account,
        returnMode: 'plan',
        notes: account.notes === 'No growth assumed by default.' ? 'Uses the selected scenario return unless a custom return is chosen.' : account.notes,
      }
    : account),
});

export const loadData = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultData);
    const parsed = JSON.parse(raw) as AppData;
    return parsed.version === 1 ? normalizeData(parsed) : clone(defaultData);
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

import type { AppData } from './types';
import { scenarioBudgetAmount, scenarioBudgetMetrics } from './calculations';

export const copyMonthlyPhaseValues = (data: AppData, scenarioId: string, sourcePhaseId: string, targetPhaseId: string): AppData => {
  if (sourcePhaseId === targetPhaseId) return data;
  const sourcePhase = data.phases.find((phase) => phase.id === sourcePhaseId);
  const targetPhase = data.phases.find((phase) => phase.id === targetPhaseId);
  const scenario = data.scenarios.find((item) => item.id === scenarioId);
  if (!sourcePhase || !targetPhase || !scenario) return data;

  const sourceBudget = scenarioBudgetMetrics(data, scenario, 1, sourcePhase.id);
  const phaseContributions = {
    ...scenario.overrides.phaseContributions,
    [targetPhase.id]: Object.fromEntries(sourceBudget.rows.map((row) => [row.account.id, {
      personal: row.personal,
      employer: row.employer,
    }])),
  };
  const phaseBudgetAmounts = {
    ...scenario.overrides.phaseBudgetAmounts,
    [targetPhase.id]: Object.fromEntries(data.budget.map((expense) => [
      expense.id,
      scenarioBudgetAmount(scenario, sourcePhase.id, expense),
    ])),
  };

  return {
    ...data,
    phases: data.phases.map((phase) => phase.id === targetPhase.id
      ? { ...phase, takeHomeIncome: sourcePhase.takeHomeIncome ?? data.profile.netMonthlyIncome }
      : phase),
    scenarios: data.scenarios.map((item) => item.id === scenario.id
      ? { ...item, overrides: { ...item.overrides, phaseContributions, phaseBudgetAmounts } }
      : item),
  };
};

export const resetMonthlyPhaseValues = (data: AppData, scenarioId: string, phaseId: string): AppData => {
  if (!data.phases.some((phase) => phase.id === phaseId) || !data.scenarios.some((scenario) => scenario.id === scenarioId)) return data;
  return {
    ...data,
    phases: data.phases.map((phase) => {
      if (phase.id !== phaseId) return phase;
      const { takeHomeIncome: _resetToSharedDefault, ...resetPhase } = phase;
      return resetPhase;
    }),
    scenarios: data.scenarios.map((scenario) => {
      if (scenario.id !== scenarioId) return scenario;
      const phaseContributions = { ...scenario.overrides.phaseContributions };
      delete phaseContributions[phaseId];
      return { ...scenario, overrides: {
        ...scenario.overrides,
        phaseContributions,
        phaseBudgetAmounts: {
          ...scenario.overrides.phaseBudgetAmounts,
          [phaseId]: Object.fromEntries(data.budget.map((expense) => [expense.id, expense.amount])),
        },
      } };
    }),
  };
};

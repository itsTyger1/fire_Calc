import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import {
  aggregateAccounts, annualToMonthlyRate, applyScenarioOverrides, calculateFireNumber,
  emergencyFundMetrics, findFireCrossing, growAccountOneMonth, projectCore,
  projectScenario, resolvePhase, scenarioBudgetMetrics, solveRequiredAdditionalContribution,
  solveRequiredContributionScale,
} from './calculations';
import type { Account, Profile } from './types';

const profile = { ...defaultData.profile, currentAge: 30, retirementAge: 31, maxAge: 31, annualSpending: 12000, withdrawalRate: 0.04 };
const account: Account = { ...defaultData.accounts[3], id: 'test', balance: 10000, monthlyContribution: 100, employerContribution: 50, fireEligible: true };

describe('financial calculations', () => {
  it('calculates the FIRE number', () => expect(calculateFireNumber(52500, 0.035)).toBeCloseTo(1500000));
  it('converts annual to effective monthly return', () => expect(Math.pow(1 + annualToMonthlyRate(0.12), 12) - 1).toBeCloseTo(0.12, 10));
  it('grows an account with beginning-of-month contributions', () => expect(growAccountOneMonth(1000, 100, 0.12)).toBeCloseTo(1100 * Math.pow(1.12, 1 / 12)));
  it('aggregates only eligible and included accounts', () => {
    const result = aggregateAccounts(defaultData.accounts);
    expect(result.fire).toBe(199600);
    expect(result.netWorth).toBe(265200);
  });
  it('finds the first FIRE crossing', () => {
    const points = projectCore({ profile: { ...profile, customFireNumber: 11000 }, accounts: [account], phases: [] });
    const crossing = findFireCrossing(points);
    expect(crossing?.month).toBeGreaterThan(0);
    expect(crossing!.firePortfolio).toBeGreaterThanOrEqual(crossing!.fireTarget);
  });
  it('solves the monthly contribution required by a target age', () => {
    const zeroReturnProfile: Profile = { ...profile, realReturn: 0, customFireNumber: 22000 };
    const simple = { ...account, balance: 10000, annualReturn: 0 };
    const requiredExtra = solveRequiredAdditionalContribution(zeroReturnProfile, [simple], []);
    expect(requiredExtra).toBeCloseTo(850, 0); // existing $150 + extra $850 = $1,000/mo
    const scale = solveRequiredContributionScale(zeroReturnProfile, [simple], []);
    expect(scale).toBeCloseTo(9.5, 5); // $100 personal × 9.5 + $50 employer = $1,000/mo
  });
  it('changes phases when the emergency fund trigger is met', () => {
    expect(resolvePhase(defaultData.phases, { hysa: 59000 }, 30, '2026-01-01').id).toBe('phase-emergency');
    expect(resolvePhase(defaultData.phases, { hysa: 60000 }, 30, '2026-01-01').id).toBe('phase-fire');
  });
  it('projects through the emergency fund trigger', () => {
    const short = { ...defaultData.profile, currentAge: 30, retirementAge: 32, maxAge: 32 };
    const points = projectCore({ profile: short, accounts: defaultData.accounts, phases: defaultData.phases });
    expect(points.some((point) => point.phaseName === 'FIRE investing')).toBe(true);
  });
  it('applies scenario overrides without mutating base data', () => {
    const result = applyScenarioOverrides(defaultData, defaultData.scenarios[1]);
    expect(result.profile.realReturn).toBe(0.04);
    expect(defaultData.profile.realReturn).toBe(0.05);
  });
  it('raises the nominal FIRE target with inflation but keeps real target constant', () => {
    const real = projectCore({ profile: { ...profile, mode: 'real' }, accounts: [account], phases: [] });
    const nominal = projectCore({ profile: { ...profile, mode: 'nominal' }, accounts: [account], phases: [] });
    expect(real.at(-1)!.fireTarget).toBe(real[0].fireTarget);
    expect(nominal.at(-1)!.fireTarget).toBeGreaterThan(nominal[0].fireTarget);
  });
  it('respects FIRE eligibility toggles', () => {
    const scenario = { ...defaultData.scenarios[0], overrides: { includeCashInFire: true } };
    expect(projectScenario(defaultData, scenario).currentFirePortfolio).toBe(245200);
  });
  it('tracks employer contributions separately', () => {
    const result = projectScenario(defaultData, defaultData.scenarios[0]);
    expect(result.plannedEmployerMonthly).toBe(733);
    expect(result.plannedPersonalMonthly).toBe(2275);
    expect(result.points[1].employerContributions).toBe(733);
  });
  it('computes emergency fund runway and target timing', () => {
    const result = emergencyFundMetrics(45600, 60000, 2100, 3800, 2800);
    expect(result.monthsToTarget).toBe(7);
    expect(result.jobLossRunway).toBeCloseTo(16.29, 1);
  });
  it('applies scenario contribution overrides to both projections and the monthly budget', () => {
    const scenario = {
      ...defaultData.scenarios[0],
      overrides: {
        phaseContributions: {
          'phase-emergency': { taxable: { personal: 500 }, r401k: { personal: 600 } },
        },
      },
    };
    const budget = scenarioBudgetMetrics(defaultData, scenario);
    const projected = projectScenario(defaultData, scenario);
    expect(budget.rows.find((row) => row.account.id === 'taxable')?.personal).toBe(500);
    expect(budget.payrollPersonal).toBe(600);
    expect(budget.takeHomeIncome).toBe(defaultData.profile.netMonthlyIncome);
    expect(budget.remaining).toBe(defaultData.profile.netMonthlyIncome - budget.needs - budget.wants - budget.takeHomeContributions);
    expect(projected.points[1].personalContributions).toBe(1725);
  });
  it('calculates a required account budget that reaches the goal at the target age', () => {
    const result = projectScenario(defaultData, defaultData.scenarios[0]);
    const requiredBudget = scenarioBudgetMetrics(defaultData, defaultData.scenarios[0], result.requiredContributionScale);
    const { profile, accounts, phases } = applyScenarioOverrides(defaultData, defaultData.scenarios[0]);
    const target = projectCore({ profile, accounts, phases, fireContributionScale: result.requiredContributionScale, endAtTarget: true }).at(-1)!;
    expect(target.firePortfolio).toBeCloseTo(target.fireTarget, 2);
    expect(requiredBudget.personalWealth).toBeLessThan(scenarioBudgetMetrics(defaultData, defaultData.scenarios[0]).personalWealth);
  });
  it('uses scenario-specific normal budget line items without changing shared defaults', () => {
    const scenario = { ...defaultData.scenarios[0], overrides: { budgetAmounts: { housing: 1500, fun: 400 } } };
    const metrics = scenarioBudgetMetrics(defaultData, scenario);
    expect(metrics.needs).toBe(2103);
    expect(metrics.wants).toBe(715);
    expect(defaultData.budget.find((item) => item.id === 'housing')?.amount).toBe(1935);
  });
  it('includes contributions and compound growth in each projected account balance', () => {
    const zeroReturn = { ...account, balance: 1000, monthlyContribution: 100, employerContribution: 50, annualReturn: 0 };
    const points = projectCore({ profile: { ...profile, maxAge: 30 + 2 / 12 }, accounts: [zeroReturn], phases: [] });
    expect(points[1].balances.test).toBe(1150);
    expect(points[2].balances.test).toBe(1300);
    const growthAccount = { ...zeroReturn, annualReturn: 0.12 };
    const growthPoints = projectCore({ profile: { ...profile, maxAge: 30 + 1 / 12 }, accounts: [growthAccount], phases: [] });
    expect(growthPoints[1].balances.test).toBeCloseTo(growAccountOneMonth(1000, 150, 0.12));
  });
  it('grows crypto with the scenario return by default', () => {
    const crypto = { ...defaultData.accounts.find((item) => item.id === 'crypto')!, annualReturn: 0, returnMode: undefined };
    const points = projectCore({ profile: { ...profile, maxAge: 30 + 1 / 12, realReturn: 0.05 }, accounts: [crypto], phases: [] });
    expect(points[1].balances.crypto).toBeGreaterThan(20000);
  });
  it('can calculate a scenario budget for the FIRE-investing phase explicitly', () => {
    const metrics = scenarioBudgetMetrics(defaultData, defaultData.scenarios[0], 1, 'phase-fire');
    expect(metrics.phase.id).toBe('phase-fire');
    expect(metrics.rows.find((row) => row.account.id === 'taxable')?.personal).toBe(850);
    expect(metrics.cashSavings).toBe(250);
    expect(metrics.remaining).toBe(1622);
  });
  it('accounts for every take-home dollar in every FIRE-phase scenario', () => {
    defaultData.scenarios.forEach((scenario) => {
      const metrics = scenarioBudgetMetrics(defaultData, scenario, 1, 'phase-fire');
      const fromTakeHome = metrics.takeHomeContributions;
      expect(metrics.needs + metrics.wants + fromTakeHome + metrics.remaining).toBeCloseTo(metrics.takeHomeIncome);
    });
  });
  it('subtracts expenses and Roth IRA only from deposited take-home', () => {
    const exampleData = {
      ...defaultData,
      profile: { ...defaultData.profile, netMonthlyIncome: 5000 },
      budget: [{ id: 'expenses', name: 'All expenses', category: 'Needs' as const, amount: 3500 }],
    };
    const scenario = {
      ...exampleData.scenarios[0],
      overrides: {
        phaseContributions: {
          'phase-fire': {
            'roth-ira': { personal: 500 },
            r401k: { personal: 900 },
            taxable: { personal: 5000 },
            hysa: { personal: 5000 },
          },
        },
      },
    };
    const metrics = scenarioBudgetMetrics(exampleData, scenario, 1, 'phase-fire');
    expect(metrics.takeHomeContributions).toBe(500);
    expect(metrics.remaining).toBe(1000);
    expect(metrics.payrollPersonal).toBe(900);
    const zeroExpenseScenario = { ...scenario, overrides: { ...scenario.overrides, budgetAmounts: { expenses: 0 } } };
    expect(scenarioBudgetMetrics(exampleData, zeroExpenseScenario, 1, 'phase-fire').remaining).toBe(4500);
  });
});

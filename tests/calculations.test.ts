import { describe, expect, it } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { addAccountToData, removeAccountFromData } from '../src/domain/accounts';
import { copyMonthlyPhaseValues, resetMonthlyPhaseValues } from '../src/domain/budget';
import {
  aggregateAccounts, annualToMonthlyRate, applyScenarioOverrides, calculateFireNumber, calculateCoastFire,
  bridgeMetrics, emergencyFundMetrics, findFireCrossing, growAccountOneMonth, projectCore,
  projectScenario, resolvePhase, scenarioBudgetMetrics, solveRequiredAdditionalContribution,
  solveRequiredContributionScale, nominalReturnFromReal, realReturnFromNominal,
} from '../src/domain/calculations';
import type { Account, Profile } from '../src/domain/types';

const profile = { ...defaultData.profile, currentAge: 30, retirementAge: 31, maxAge: 31, annualSpending: 12000, withdrawalRate: 0.04 };
const account: Account = { ...defaultData.accounts[3], id: 'test', balance: 10000, monthlyContribution: 100, employerContribution: 50, fireEligible: true };

describe('financial calculations', () => {
  it('recognizes Coast FIRE below a custom target using planned contributions until retirement', () => {
    const data = structuredClone(defaultData);
    data.profile = { ...profile, currentAge: 60, retirementAge: 65, maxAge: 70, customFireNumber: 1000000, rothTransfers: [], mode: 'real' };
    data.accounts = [{ ...account, balance: 420001, annualReturn: 0, returnMode: 'custom', monthlyContribution: 0, employerContribution: 0 }];
    data.phases = [];
    const result = projectScenario(data, { ...data.scenarios[0], overrides: {} });
    expect(result.targetPoint.firePortfolio).toBeLessThan(result.targetPoint.fireTarget);
    expect(result.coastFire?.reached).toBe(true);
    expect(result.coastFire?.endingBalance).toBeCloseTo(1);
    data.accounts[0].balance = 419000;
    expect(projectScenario(data, { ...data.scenarios[0], overrides: {} }).coastFire?.reached).toBe(false);
    data.accounts[0].monthlyContribution = 10;
    data.accounts[0].employerContribution = 10;
    expect(projectScenario(data, { ...data.scenarios[0], overrides: {} }).coastFire).toEqual({ reached: true, endingBalance: 200 });
  });
  it('matches a growing retirement chart with scenario contribution phase overrides', () => {
    const data = structuredClone(defaultData);
    data.profile = { ...profile, currentAge: 60, retirementAge: 65, maxAge: 100, customFireNumber: 1000000, rothTransfers: [], mode: 'real' };
    data.accounts = [{ ...account, balance: 100000, annualReturn: 0.05, returnMode: 'custom', monthlyContribution: 0, employerContribution: 0 }];
    data.phases = [{ id: 'saving', name: 'Saving', startsWhen: { kind: 'always' }, contributions: { test: { personal: 0, employer: 0 } } }];
    const result = projectScenario(data, { ...data.scenarios[0], overrides: { phaseContributions: { saving: { test: { personal: 2000, employer: 1000 } } } } });
    expect(result.targetPoint.firePortfolio).toBeLessThan(result.targetPoint.fireTarget);
    const retirement = result.points.filter((point) => point.projectionPhase === 'retirement');
    expect(retirement.every((point, index) => index === 0 || point.firePortfolio > retirement[index - 1].firePortfolio)).toBe(true);
    expect(result.coastFire).toEqual({ reached: true, endingBalance: result.points.at(-1)!.firePortfolio });
    expect(projectScenario(data, { ...data.scenarios[0], overrides: {} }).coastFire?.reached).toBe(false);
  });
  it('checks the entire age-100 horizon and applies inflation to coast spending', () => {
    const coastProfile = { ...profile, currentAge: 60, retirementAge: 65, maxAge: 66, rothTransfers: [], mode: 'real' as const };
    const coastAccount = { ...account, balance: 420001, annualReturn: 0, returnMode: 'custom' as const };
    expect(calculateCoastFire(coastProfile, [coastAccount])?.reached).toBe(true);
    expect(calculateCoastFire({ ...coastProfile, mode: 'nominal', inflationRate: 0.03 }, [coastAccount])?.reached).toBe(false);
    expect(calculateCoastFire({ ...coastProfile, maxAge: 110 }, [coastAccount])).toEqual(calculateCoastFire(coastProfile, [coastAccount]));
    expect(calculateCoastFire({ ...coastProfile, retirementAge: 100 }, [coastAccount])).toBeNull();
  });
  it('uses scenario spending overrides for Coast FIRE', () => {
    const data = structuredClone(defaultData);
    data.profile = { ...profile, currentAge: 60, retirementAge: 65, maxAge: 70, rothTransfers: [], mode: 'real' };
    data.accounts = [{ ...account, balance: 420001, annualReturn: 0, returnMode: 'custom' }];
    expect(projectScenario(data, { ...data.scenarios[0], overrides: { annualSpending: 24000 } }).coastFire?.reached).toBe(false);
  });
  it('does not report a hypothetical crossing when planned retirement depletes the portfolio', () => {
    const data = structuredClone(defaultData);
    data.profile = { ...profile, retirementAge: 31, maxAge: 40, customFireNumber: 20000 };
    data.accounts = [{ ...account, balance: 10000, annualReturn: 0, monthlyContribution: 500, employerContribution: 0 }];
    data.phases = [];
    const scenario = { ...data.scenarios[0], overrides: {} };
    expect(findFireCrossing(projectCore({ profile: data.profile, accounts: data.accounts, phases: [] }))).not.toBeNull();
    const result = projectScenario(data, scenario);
    expect(result.firePoint).toBeNull();
    expect(result.retirementSummary.depletionPoint).not.toBeNull();
    expect(bridgeMetrics(result).usesTargetAge).toBe(true);
    expect(bridgeMetrics(result).years).toBe(28.5);
  });
  it('starts the bridge at an earlier FIRE crossing and handles access at 59.5', () => {
    const data = structuredClone(defaultData);
    data.profile = { ...profile, retirementAge: 55, maxAge: 60, customFireNumber: 10000, mode: 'real' };
    data.accounts = [{ ...account, balance: 10000, annualReturn: 0 }];
    data.phases = [];
    const result = projectScenario(data, { ...data.scenarios[0], overrides: {} });
    expect(result.firePoint).toEqual(result.points[0]);
    expect(bridgeMetrics(result)).toMatchObject({ startAge: 30, years: 29.5, need: 354000, usesTargetAge: false });
    const later = { ...result, firePoint: { ...result.points[0], age: 59.5 } };
    expect(bridgeMetrics(later).need).toBe(0);
    expect(bridgeMetrics(later).years).toBe(0);
  });
  it('inflates each bridge month in nominal mode', () => {
    const result = projectScenario(defaultData, defaultData.scenarios[0]);
    const testResult = { ...result, profile: { ...result.profile, annualSpending: 12000, mode: 'nominal' as const, inflationRate: 0.12 }, firePoint: { ...result.points[0], age: 59.25, month: 12 } };
    const expected = [12, 13, 14].reduce((sum, month) => sum + 1000 * Math.pow(1.12, month / 12), 0);
    expect(bridgeMetrics(testResult).need).toBeCloseTo(expected);
  });
  it('calculates the FIRE number', () => expect(calculateFireNumber(52500, 0.035)).toBeCloseTo(1500000));
  it('keeps real and nominal returns consistent with inflation', () => {
    expect(nominalReturnFromReal(0.05, 0.025)).toBeCloseTo(0.07625, 10);
    expect(realReturnFromNominal(0.07625, 0.025)).toBeCloseTo(0.05, 10);
  });
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
  it('stops contributions and starts withdrawals at the target retirement age', () => {
    const retirementProfile = { ...profile, retirementAge: 31, maxAge: 32, annualSpending: 12000, mode: 'real' as const };
    const zeroReturn = { ...account, balance: 10000, monthlyContribution: 100, employerContribution: 50, annualReturn: 0 };
    const points = projectCore({ profile: retirementProfile, accounts: [zeroReturn], phases: [], includeRetirement: true });

    expect(points[12].projectionPhase).toBe('retirement');
    expect(points[12].firePortfolio).toBe(11800);
    expect(points[12].monthlyWithdrawal).toBe(1000);
    expect(points[13].firePortfolio).toBe(10800);
    expect(points[13].personalContributions).toBe(1200);
    expect(points[13].employerContributions).toBe(600);
    expect(points[13].cumulativeWithdrawals).toBe(1000);
    expect(points[24].firePortfolio).toBe(0);
    expect(points[24].cumulativeWithdrawalShortfall).toBe(200);
    expect(points[24].investmentGrowth).toBe(0);
  });
  it('inflates retirement withdrawals only in nominal mode', () => {
    const real = projectCore({ profile: { ...profile, retirementAge: 31, maxAge: 31, annualSpending: 12000, mode: 'real' as const }, accounts: [account], phases: [], includeRetirement: true });
    const nominal = projectCore({ profile: { ...profile, retirementAge: 31, maxAge: 31, annualSpending: 12000, mode: 'nominal' as const, inflationRate: 0.025 }, accounts: [account], phases: [], includeRetirement: true });

    expect(real[12].monthlyWithdrawal).toBe(1000);
    expect(nominal[12].monthlyWithdrawal).toBeCloseTo(1025);
    expect(nominal[12].fireTarget).toBeGreaterThan(nominal[0].fireTarget);
  });
  it('applies scenario overrides without mutating base data', () => {
    const result = applyScenarioOverrides(defaultData, defaultData.scenarios[1]);
    expect(result.profile.realReturn).toBeCloseTo(0.04, 10);
    expect(result.profile.nominalReturn).toBeCloseTo(0.066, 10);
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
  it('uses phase-specific expenses while preserving legacy scenario expense overrides as fallbacks', () => {
    const data = structuredClone(defaultData);
    const housing = data.budget.find((item) => item.id === 'housing')!;
    const scenario = {
      ...data.scenarios[0],
      overrides: {
        budgetAmounts: { housing: 1500 },
        phaseBudgetAmounts: { 'phase-emergency': { housing: 1300 } },
      },
    };
    const emergency = scenarioBudgetMetrics(data, scenario, 1, 'phase-emergency');
    const fire = scenarioBudgetMetrics(data, scenario, 1, 'phase-fire');
    expect(emergency.needs).toBe(fire.needs - 200);
    expect(fire.needs).toBe(defaultData.budget.filter((item) => item.category === 'Needs').reduce((sum, item) => sum + (item.id === housing.id ? 1500 : item.amount), 0));
  });
  it('removes account references and activates phases that depended on its cash balance', () => {
    const data = structuredClone(defaultData);
    data.scenarios[0].overrides = {
      accountBalances: { hysa: 50000 },
      accountReturns: { hysa: 0.03 },
      contributions: { hysa: { personal: 100 } },
      phaseContributions: { 'phase-fire': { hysa: { personal: 250 } } },
    };
    data.profile.rothTransfers = [{ id: 'cash-transfer', kind: 'conversion', age: 30, sourceId: 'hysa', destinationId: 'roth-ira', amount: 100, basis: 0, taxRate: 0, taxAccountId: 'hysa' }];
    const result = removeAccountFromData(data, 'hysa');
    expect(result.accounts.some((item) => item.id === 'hysa')).toBe(false);
    expect(result.phases.find((phase) => phase.id === 'phase-fire')?.startsWhen).toEqual({ kind: 'always' });
    expect(result.phases.every((phase) => !('hysa' in phase.contributions))).toBe(true);
    expect(result.scenarios[0].overrides.accountBalances).not.toHaveProperty('hysa');
    expect(result.scenarios[0].overrides.accountReturns).not.toHaveProperty('hysa');
    expect(result.scenarios[0].overrides.contributions).not.toHaveProperty('hysa');
    expect(result.scenarios[0].overrides.phaseContributions?.['phase-fire']).not.toHaveProperty('hysa');
    expect(result.profile.rothTransfers).toEqual([]);
  });
  it('adds an account with zero contribution rows in every phase', () => {
    const data = structuredClone(defaultData);
    const addedAccount = { ...data.accounts[0], id: 'new-account', name: 'New account', monthlyContribution: 0, employerContribution: 0 };
    const result = addAccountToData(data, addedAccount);
    expect(result.accounts.at(-1)).toEqual(addedAccount);
    expect(result.phases.every((phase) => phase.contributions['new-account']?.personal === 0 && phase.contributions['new-account']?.employer === 0)).toBe(true);
    expect(data.accounts.some((item) => item.id === 'new-account')).toBe(false);
  });
  it('copies income, expenses, and effective contributions from one phase into another', () => {
    const data = structuredClone(defaultData);
    const scenario = data.scenarios[0];
    data.phases.find((phase) => phase.id === 'phase-emergency')!.takeHomeIncome = 5000;
    scenario.overrides = {
      budgetAmounts: { housing: 1500 },
      phaseBudgetAmounts: { 'phase-emergency': { housing: 1300 }, 'phase-fire': { housing: 2000 } },
      phaseContributions: { 'phase-emergency': { taxable: { personal: 777 } } },
    };
    const source = scenarioBudgetMetrics(data, scenario, 1, 'phase-emergency');
    const result = copyMonthlyPhaseValues(data, scenario.id, 'phase-emergency', 'phase-fire');
    const copiedScenario = result.scenarios.find((item) => item.id === scenario.id)!;
    const target = scenarioBudgetMetrics(result, copiedScenario, 1, 'phase-fire');
    expect(result.phases.find((phase) => phase.id === 'phase-fire')?.takeHomeIncome).toBe(5000);
    expect(target.needs).toBe(source.needs);
    expect(target.wants).toBe(source.wants);
    expect(target.rows.map(({ account, personal, employer }) => [account.id, personal, employer]))
      .toEqual(source.rows.map(({ account, personal, employer }) => [account.id, personal, employer]));
    expect(data.phases.find((phase) => phase.id === 'phase-fire')?.takeHomeIncome).toBeUndefined();
    expect(data.scenarios[0].overrides.phaseBudgetAmounts?.['phase-fire']?.housing).toBe(2000);
    expect(result.scenarios[1].overrides.phaseBudgetAmounts).toBeUndefined();
  });
  it('resets only the selected phase and restores shared default income and expense amounts', () => {
    const data = structuredClone(defaultData);
    const scenario = data.scenarios[0];
    data.phases.find((phase) => phase.id === 'phase-fire')!.takeHomeIncome = 5000;
    scenario.overrides = {
      budgetAmounts: { housing: 1500 },
      phaseBudgetAmounts: { 'phase-emergency': { housing: 1100 }, 'phase-fire': { housing: 1700 } },
      phaseContributions: { 'phase-emergency': { taxable: { personal: 200 } }, 'phase-fire': { taxable: { personal: 800 } } },
    };
    const result = resetMonthlyPhaseValues(data, scenario.id, 'phase-fire');
    const resetScenario = result.scenarios[0];
    expect(result.phases.find((phase) => phase.id === 'phase-fire')?.takeHomeIncome).toBeUndefined();
    expect(scenarioBudgetMetrics(result, resetScenario, 1, 'phase-fire').takeHomeIncome).toBe(data.profile.netMonthlyIncome);
    expect(scenarioBudgetMetrics(result, resetScenario, 1, 'phase-fire').needs)
      .toBe(data.budget.filter((item) => item.category === 'Needs').reduce((sum, item) => sum + item.amount, 0));
    expect(scenarioBudgetMetrics(result, resetScenario, 1, 'phase-emergency').needs)
      .toBe(data.budget.filter((item) => item.category === 'Needs').reduce((sum, item) => sum + (item.id === 'housing' ? 1100 : item.amount), 0));
    expect(resetScenario.overrides.phaseContributions?.['phase-fire']).toBeUndefined();
    expect(resetScenario.overrides.phaseContributions?.['phase-emergency']?.taxable?.personal).toBe(200);
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
    expect(metrics.remaining).toBe(522);
  });
  it('uses the deposited take-home amount saved on the selected contribution phase', () => {
    const data = structuredClone(defaultData);
    data.phases.find((phase) => phase.id === 'phase-emergency')!.takeHomeIncome = 5000;
    data.phases.find((phase) => phase.id === 'phase-fire')!.takeHomeIncome = 7000;
    expect(scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-emergency').takeHomeIncome).toBe(5000);
    expect(scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-fire').takeHomeIncome).toBe(7000);
  });
  it('accounts for every take-home dollar in every FIRE-phase scenario', () => {
    defaultData.scenarios.forEach((scenario) => {
      const metrics = scenarioBudgetMetrics(defaultData, scenario, 1, 'phase-fire');
      const fromTakeHome = metrics.takeHomeContributions;
      expect(metrics.needs + metrics.wants + fromTakeHome + metrics.remaining).toBeCloseTo(metrics.takeHomeIncome);
    });
  });
  it('subtracts expenses, Roth IRA, taxable brokerage, and cash savings from deposited take-home', () => {
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
            taxable: { personal: 250 },
            hysa: { personal: 300 },
          },
        },
      },
    };
    const metrics = scenarioBudgetMetrics(exampleData, scenario, 1, 'phase-fire');
    expect(metrics.takeHomeContributions).toBe(1050);
    expect(metrics.remaining).toBe(450);
    expect(metrics.payrollPersonal).toBe(900);
    const zeroExpenseScenario = { ...scenario, overrides: { ...scenario.overrides, budgetAmounts: { expenses: 0 } } };
    expect(scenarioBudgetMetrics(exampleData, zeroExpenseScenario, 1, 'phase-fire').remaining).toBe(3950);
  });
  it('subtracts personal contributions to every non-payroll account from deposited take-home', () => {
    const scenario = {
      ...defaultData.scenarios[0],
      overrides: {
        phaseContributions: {
          'phase-fire': {
            'roth-ira': { personal: 500 },
            taxable: { personal: 250 },
            hysa: { personal: 300 },
            'trad-ira': { personal: 125 },
            crypto: { personal: 75 },
            r401k: { personal: 900 },
          },
        },
      },
    };
    const data = { ...defaultData, profile: { ...defaultData.profile, netMonthlyIncome: 5000 }, budget: [{ id: 'expenses', name: 'All expenses', category: 'Needs' as const, amount: 3500 }] };
    const metrics = scenarioBudgetMetrics(data, scenario, 1, 'phase-fire');
    expect(metrics.takeHomeContributions).toBe(1250);
    expect(metrics.remaining).toBe(250);
    expect(metrics.payrollPersonal).toBe(900);
  });
  it('keeps brokerage cash flow independent of net-worth and FIRE display toggles', () => {
    const data = structuredClone(defaultData);
    const taxable = data.accounts.find((item) => item.id === 'taxable')!;
    taxable.includeInNetWorth = false;
    taxable.fireEligible = false;
    const scenario = structuredClone(data.scenarios[0]);
    scenario.overrides.phaseContributions = { 'phase-fire': { taxable: { personal: 3000 } } };
    const metrics = scenarioBudgetMetrics(data, scenario, 1, 'phase-fire');
    expect(metrics.takeHomeContributions).toBe(3875);
    expect(metrics.remaining).toBe(-1628);
    expect(defaultData.phases.find((phase) => phase.id === 'phase-fire')!.contributions.taxable.personal).toBe(850);
  });
  it('deducts the selected phase cash savings without double-counting payroll or employer money', () => {
    const emergency = scenarioBudgetMetrics(defaultData, defaultData.scenarios[0], 1, 'phase-emergency');
    const fire = scenarioBudgetMetrics(defaultData, defaultData.scenarios[0], 1, 'phase-fire');
    expect(emergency.cashSavings).toBe(2100);
    expect(emergency.takeHomeContributions).toBe(2725);
    expect(emergency.remaining).toBe(-478); // $6,100 - $3,853 - $625 - $2,100
    expect(fire.cashSavings).toBe(250);
    expect(fire.takeHomeContributions).toBe(1725);
    expect(fire.remaining).toBe(522); // $6,100 - $3,853 - $625 - $850 - $250
  });
  it('uses cash overrides per phase and includes cash even when excluded from net worth', () => {
    const data = structuredClone(defaultData);
    data.accounts.find((item) => item.id === 'hysa')!.includeInNetWorth = false;
    const scenario = { ...data.scenarios[0], overrides: { phaseContributions: {
      'phase-emergency': { hysa: { personal: 1000, employer: 999 }, r401k: { personal: 9999 } },
    } } };
    expect(scenarioBudgetMetrics(data, scenario, 1, 'phase-emergency').remaining).toBe(622);
    expect(scenarioBudgetMetrics(data, scenario, 1, 'phase-fire').remaining).toBe(522);
    expect(scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-emergency').remaining).toBe(-478);
  });
  it('includes multiple cash accounts by type, including zero contributions', () => {
    const data = structuredClone(defaultData);
    const cash = data.accounts.find((item) => item.id === 'hysa')!;
    data.accounts.push({ ...cash, id: 'cash-two', name: 'Rainy day fund', monthlyContribution: 100 });
    expect(scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-emergency').remaining).toBe(-578);
    data.accounts.at(-1)!.monthlyContribution = 0;
    expect(scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-emergency').remaining).toBe(-478);
  });
  it('increases bridge basis only for personal Roth IRA contributions', () => {
    const roth = { ...defaultData.accounts.find((item) => item.type === 'Roth IRA')!, balance: 10000, monthlyContribution: 100, employerContribution: 50, annualReturn: 0 };
    const payroll = { ...defaultData.accounts.find((item) => item.id === 'r401k')!, balance: 0, monthlyContribution: 900, employerContribution: 500, annualReturn: 0 };
    const points = projectCore({ profile: { ...profile, rothContributionBasis: 1000 }, accounts: [roth, payroll], phases: [] });
    expect(points[0].accessible).toBe(1000);
    expect(points[1].accessible).toBe(1100);
    expect(points[12].accessible).toBe(2200);
    expect(points[12].personalContributions).toBe(12000);
  });
  it('caps aggregate Roth basis at included balances and avoids double-counting immediate accounts', () => {
    const roth = { ...defaultData.accounts.find((item) => item.type === 'Roth IRA')!, balance: 500, monthlyContribution: 0, employerContribution: 0, annualReturn: 0 };
    const run = (accounts: Account[]) => projectCore({ profile: { ...profile, rothContributionBasis: 2000 }, accounts, phases: [] })[0].accessible;
    expect(run([roth, { ...roth, id: 'second', balance: 750 }])).toBe(1250);
    expect(run([{ ...roth, includeInNetWorth: false }])).toBe(0);
    expect(run([{ ...roth, accessibility: 'Immediate' }])).toBe(500);
  });
});

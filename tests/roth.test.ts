import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { applyScenarioOverrides, projectCore, scenarioBudgetMetrics } from '../src/domain/calculations';
import { accessibleConversionBasis, addConversionLot, consumeRothBasis } from '../src/domain/roth';
import { loadData, saveData } from '../src/lib/persistence';
import type { Account, RothTransfer } from '../src/domain/types';

const source: Account = { ...defaultData.accounts[2], id: 'source', balance: 10000, annualReturn: 0, monthlyContribution: 0, employerContribution: 0 };
const roth: Account = { ...defaultData.accounts[1], id: 'roth', balance: 0, annualReturn: 0, monthlyContribution: 0, employerContribution: 0 };
const cash: Account = { ...defaultData.accounts[4], id: 'cash', balance: 5000, annualReturn: 0, monthlyContribution: 0, employerContribution: 0 };
const transfer: RothTransfer = { id: 'conversion', kind: 'conversion', age: 40, sourceId: 'source', destinationId: 'roth', amount: 10000, basis: 0, taxRate: 0.2, taxAccountId: 'cash' };
const profile = { ...defaultData.profile, currentAge: 40, retirementAge: 50, maxAge: 46, mode: 'real' as const, rothContributionBasis: 0, rothTransfers: [transfer] };
const run = (patch: Partial<typeof profile> = {}, accounts = [source, roth, cash]) => projectCore({ profile: { ...profile, ...patch }, accounts, phases: [] });

describe('Roth transfer planning', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-01T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('transfers existing money and funds tax without inventing contributions or growth', () => {
    const point = run()[0];
    expect(point.balances).toEqual({ source: 0, roth: 10000, cash: 3000 });
    expect(point.netWorth).toBe(13000);
    expect(point.firePortfolio).toBe(10000);
    expect(point.personalContributions).toBe(0);
    expect(point.investmentGrowth).toBe(0);
    expect(point.cumulativeConversionTax).toBe(2000);
    expect(point.accessible).toBe(3000);
  });

  it('executes a scheduled ladder entry once during retirement', () => {
    const points = projectCore({ profile: { ...profile, retirementAge: 40, maxAge: 42, annualSpending: 0, rothTransfers: [{ ...transfer, age: 41 }] }, accounts: [source, roth, cash], phases: [], includeRetirement: true });
    expect(points[11].balances.roth).toBe(0);
    expect(points[12].balances.roth).toBe(10000);
    expect(points.flatMap((point) => point.rothTransfers)).toHaveLength(1);
    expect(points.at(-1)!.cumulativeConversionTax).toBe(2000);
  });

  it('uses contributed Traditional IRA money once for a later backdoor conversion', () => {
    const points = run({ maxAge: 41, rothTransfers: [{ ...transfer, age: 40 + 1 / 12, kind: 'backdoor', amount: 500, basis: 500 }] }, [{ ...source, balance: 0, monthlyContribution: 500 }, roth]);
    expect(points[1].balances.source).toBe(0);
    expect(points[1].balances.roth).toBe(500);
    expect(points[1].personalContributions).toBe(500);
    expect(points[1].investmentGrowth).toBe(0);
    expect(points[1].rothAccessibleBasis).toBe(500);
  });

  it('unlocks conversion principal on January 1 of year + 5, not 60 months later', () => {
    const points = run();
    expect(points[51].date).toBe('2030-12-01');
    expect(points[51].rothAccessibleBasis).toBe(0);
    expect(points[52].date).toBe('2031-01-01');
    expect(points[52].rothAccessibleBasis).toBe(10000);
  });

  it('also releases conversion principal at age 59.5', () => {
    const points = run({ currentAge: 59, retirementAge: 65, maxAge: 60, rothTransfers: [{ ...transfer, age: 59 }] });
    expect(points[5].rothAccessibleBasis).toBe(0);
    expect(points[6].rothAccessibleBasis).toBe(10000);
  });

  it('tracks a nontaxable backdoor without treating it as a regular contribution', () => {
    const point = run({ rothTransfers: [{ ...transfer, kind: 'backdoor', basis: 10000 }] })[0];
    expect(point.cumulativeConversionTax).toBe(0);
    expect(point.rothAccessibleBasis).toBe(10000);
    expect(point.personalContributions).toBe(0);
    expect(point.netWorth).toBe(15000);
  });

  it('keeps nontaxable amounts behind earlier immature taxable conversions', () => {
    const lots = [{ year: 2025, taxable: 1000, nontaxable: 500 }, { year: 2026, taxable: 0, nontaxable: 7000 }];
    expect(accessibleConversionBasis(lots, 2029, 45)).toBe(0);
    expect(accessibleConversionBasis(lots, 2030, 46)).toBe(8500);
    addConversionLot(lots, 2026, 2000, 0);
    expect(accessibleConversionBasis(lots, 2030, 46)).toBe(1500);
  });

  it('consumes regular basis then taxable and nontaxable conversion principal in year order', () => {
    const lots = [{ year: 2024, taxable: 500, nontaxable: 300 }, { year: 2025, taxable: 1000, nontaxable: 0 }];
    expect(consumeRothBasis(100, lots, 700)).toBe(0);
    expect(lots).toEqual([{ year: 2024, taxable: 0, nontaxable: 200 }, { year: 2025, taxable: 1000, nontaxable: 0 }]);
  });

  it('reduces basis after projected Roth withdrawals instead of making it available again', () => {
    const points = run({ retirementAge: 40, maxAge: 41, annualSpending: 1200, rothTransfers: [] }, [{ ...roth, balance: 10000 }]);
    const projected = projectCore({ profile: { ...profile, retirementAge: 40, maxAge: 41, annualSpending: 1200, rothTransfers: [], rothContributionBasis: 500, rothConversionHistory: [{ year: 2020, taxable: 1000, nontaxable: 0 }] }, accounts: [{ ...roth, balance: 10000 }], phases: [], includeRetirement: true });
    expect(points[0].personalContributions).toBe(0);
    expect(projected[0].rothAccessibleBasis).toBe(1500);
    expect(projected[12].rothAccessibleBasis).toBe(300);
  });

  it('rolls over Roth 401(k) basis separately from earnings', () => {
    const point = run({ rothTransfers: [{ ...transfer, kind: 'roth401k', basis: 6000 }] }, [{ ...source, type: 'Roth 401(k)' }, roth, cash])[0];
    expect(point.balances.roth).toBe(10000);
    expect(point.rothAccessibleBasis).toBe(6000);
    expect(point.cumulativeConversionTax).toBe(0);
    expect(point.accessible).toBe(11000);
  });

  it('caps underfunded transfers and prorates the entered nontaxable portion', () => {
    const point = run({ rothTransfers: [{ ...transfer, amount: 20000, basis: 10000 }] })[0];
    expect(point.rothTransfers[0]).toMatchObject({ transferred: 10000, taxable: 5000, tax: 1000 });
    expect(point.rothTransfers[0].warning).toContain('capped');
    expect(point.balances.source).toBe(0);
  });

  it('reports unfunded taxes without taking cash below zero', () => {
    const point = run({}, [source, roth, { ...cash, balance: 100 }])[0];
    expect(point.cumulativeConversionTax).toBe(2000);
    expect(point.cumulativeConversionTaxPaid).toBe(100);
    expect(point.balances.cash).toBe(0);
    expect(point.rothTransfers[0].warning).toContain('Tax funding is insufficient');
  });

  it('rejects missing accounts and invalid source types without moving money', () => {
    for (const patch of [{ sourceId: 'missing' }, { destinationId: 'cash' }, { basis: 20000 }, { taxAccountId: 'source' }]) {
      const point = run({ rothTransfers: [{ ...transfer, ...patch }] })[0];
      expect(point.balances).toEqual({ source: 10000, roth: 0, cash: 5000 });
      expect(point.rothTransfers[0].warning).toBeTruthy();
    }
  });

  it('counts FIRE eligibility transfers and conversion tax separately from market growth', () => {
    const point = run({}, [{ ...source, fireEligible: false }, roth, { ...cash, fireEligible: true }])[0];
    expect(point.firePortfolio).toBe(13000);
    expect(point.investmentGrowth).toBe(0);
  });

  it('does not bypass conversion clocks when Roth accessibility is set to Immediate', () => {
    const point = run({}, [source, { ...roth, accessibility: 'Immediate' }, cash])[0];
    expect(point.accessible).toBe(3000);
  });

  it('adds historical basis without increasing balances and caps access at the Roth balance', () => {
    const point = run({ rothTransfers: [], rothConversionHistory: [{ year: 2020, taxable: 20000, nontaxable: 0 }] }, [{ ...roth, balance: 10000 }])[0];
    expect(point.netWorth).toBe(10000);
    expect(point.accessible).toBe(10000);
  });

  it('saves scenario-specific schedules and shared history while preserving legacy plans', () => {
    let stored: string | null = null;
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    saveData(defaultData);
    expect(loadData().profile.rothTransfers).toBeUndefined();
    const data = structuredClone(defaultData);
    data.profile.rothConversionHistory = [{ year: 2020, taxable: 1000, nontaxable: 0 }];
    data.scenarios[0].overrides.rothTransfers = [transfer];
    saveData(data);
    const loaded = loadData();
    expect(applyScenarioOverrides(loaded, loaded.scenarios[0]).profile.rothTransfers).toEqual([transfer]);
    expect(applyScenarioOverrides(loaded, loaded.scenarios[1]).profile.rothTransfers).toBeUndefined();
    expect(loaded.profile.rothConversionHistory).toEqual(data.profile.rothConversionHistory);
  });
});

describe('mega-backdoor Roth planning', () => {
  const afterTax: Account = { ...source, type: 'After-tax 401(k)', balance: 12000, afterTaxBasis: 10000 };
  const mega: RothTransfer = { ...transfer, kind: 'mega-ira', amount: 12000, basis: 0 };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-01T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('converts after-tax principal plus earnings and taxes only the earnings', () => {
    const point = run({ rothTransfers: [mega] }, [afterTax, roth, cash])[0];
    expect(point.balances).toEqual({ source: 0, roth: 12000, cash: 4600 });
    expect(point.rothTransfers[0]).toMatchObject({ transferred: 12000, nontaxable: 10000, taxable: 2000, tax: 400 });
    expect(point.afterTaxBases.source).toBe(0);
    expect(point.rothAccessibleBasis).toBe(0); // taxable portion precedes nontaxable principal
    expect(point.investmentGrowth).toBe(0);
    expect(point.personalContributions).toBe(0);
  });

  it('takes a proportional share of basis on a partial rollover', () => {
    const point = run({ rothTransfers: [{ ...mega, amount: 6000 }] }, [afterTax, roth, cash])[0];
    expect(point.balances.source).toBe(6000);
    expect(point.afterTaxBases.source).toBe(5000);
    expect(point.rothTransfers[0]).toMatchObject({ nontaxable: 5000, taxable: 1000, tax: 200 });
  });

  it('splits after-tax principal to Roth and pretax earnings to Traditional IRA without tax', () => {
    const traditional = { ...source, id: 'traditional', balance: 0 };
    const point = run({ rothTransfers: [{ ...mega, earningsDestinationId: 'traditional', taxAccountId: '' }] }, [afterTax, roth, traditional])[0];
    expect(point.balances).toEqual({ source: 0, roth: 10000, traditional: 2000 });
    expect(point.rothTransfers[0]).toMatchObject({ rothAmount: 10000, pretaxRollover: 2000, tax: 0 });
    expect(point.rothAccessibleBasis).toBe(10000);
    expect(point.investmentGrowth).toBe(0);
    expect(point.netWorth).toBe(12000);
  });

  it('adds employee contributions to basis but leaves employer money and growth pretax', () => {
    const points = run({ maxAge: 40 + 1 / 12, rothTransfers: [] }, [{ ...afterTax, balance: 0, afterTaxBasis: 0, monthlyContribution: 100, employerContribution: 50, annualReturn: 0.12 }]);
    expect(points[1].afterTaxBases.source).toBe(100);
    expect(points[1].balances.source).toBeGreaterThan(150);
  });

  it('sweeps monthly contributions once each and stops at the last transfer month', () => {
    const points = run({ maxAge: 41, rothTransfers: [{ ...mega, fullBalance: true, amount: 0, age: 40 + 1 / 12, repeat: 'monthly', endAge: 40.25, taxRate: 0 }] }, [{ ...afterTax, balance: 0, afterTaxBasis: 0, monthlyContribution: 500 }, roth]);
    expect(points.flatMap((point) => point.rothTransfers)).toHaveLength(3);
    expect(points[3].balances.roth).toBe(1500);
    expect(points[3].personalContributions).toBe(1500);
    expect(points[4].balances.source).toBe(500);
    expect(points[4].afterTaxBases.source).toBe(500);
    expect(points[4].investmentGrowth).toBe(0);
  });

  it('supports annual transfers without repeating them every month', () => {
    const points = run({ maxAge: 42, rothTransfers: [{ ...mega, amount: 1000, repeat: 'annual', endAge: 42 }] }, [afterTax, roth, cash]);
    expect(points.flatMap((point) => point.rothTransfers).map((event) => event.date)).toEqual(['2026-09-01', '2027-09-01', '2028-09-01']);
    expect(points.at(-1)!.balances.roth).toBe(3000);
  });

  it('handles losses without a negative taxable amount or orphaned basis after a full sweep', () => {
    const point = run({ rothTransfers: [{ ...mega, fullBalance: true }] }, [{ ...afterTax, balance: 8000 }, roth, cash])[0];
    expect(point.rothTransfers[0]).toMatchObject({ nontaxable: 8000, taxable: 0, tax: 0 });
    expect(point.afterTaxBases.source).toBe(0);
    expect(point.rothAccessibleBasis).toBe(8000);
  });

  it('keeps in-plan conversions restricted and separate from accessible Roth IRA basis', () => {
    const plan = { ...roth, type: 'Roth 401(k)' as const, accessibility: 'Immediate' as const };
    const point = run({ rothTransfers: [{ ...mega, kind: 'mega-plan' }] }, [afterTax, plan, cash])[0];
    expect(point.balances.roth).toBe(12000);
    expect(point.rothAccessibleBasis).toBe(0);
    expect(point.accessible).toBe(4600);
    expect(point.cumulativeConversionTax).toBe(400);
  });

  it('flags a subsequent IRA rollover during an in-plan conversion recapture period', () => {
    const plan = { ...roth, type: 'Roth 401(k)' as const, id: 'plan' };
    const points = run({ rothTransfers: [{ ...mega, kind: 'mega-plan', destinationId: 'plan' }, { ...transfer, id: 'later', kind: 'roth401k', sourceId: 'plan', age: 41, amount: 12000, basis: 12000 }] }, [afterTax, plan, roth, cash]);
    expect(points[12].balances.roth).toBe(0);
    expect(points[12].rothTransfers[0].warning).toContain('recapture period');
  });

  it('reduces after-tax basis proportionally when retirement draws from that account', () => {
    const points = projectCore({ profile: { ...profile, retirementAge: 40, annualSpending: 1200, rothTransfers: [], maxAge: 41 }, accounts: [afterTax], phases: [], includeRetirement: true });
    expect(points[12].balances.source).toBe(10800);
    expect(points[12].afterTaxBases.source).toBeCloseTo(9000);
  });

  it('rejects missing basis and incorrect source or split destinations', () => {
    const cases = [
      { accounts: [source, roth, cash], schedule: mega },
      { accounts: [{ ...afterTax, afterTaxBasis: undefined }, roth, cash], schedule: mega },
      { accounts: [afterTax, roth, cash], schedule: { ...mega, earningsDestinationId: 'cash' } },
      { accounts: [afterTax, roth, cash], schedule: { ...mega, repeat: 'monthly' as const, endAge: 39 } },
    ];
    for (const { accounts, schedule } of cases) {
      const point = run({ rothTransfers: [schedule] }, accounts)[0];
      expect(point.rothTransfers[0].warning).toBeTruthy();
      expect(point.balances.roth).toBe(0);
    }
  });

  it('treats after-tax 401(k) deposits as payroll without subtracting them from take-home twice', () => {
    const data = structuredClone(defaultData);
    data.accounts.push({ ...afterTax, monthlyContribution: 500 });
    const budget = scenarioBudgetMetrics(data, data.scenarios[0], 1, 'phase-fire');
    expect(budget.rows.find((row) => row.account.id === 'source')?.isPayroll).toBe(true);
    expect(budget.payrollPersonal).toBe(1300);
    expect(budget.remaining).toBe(522);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { projectScenario } from '../src/domain/calculations';
import { retirementFundingMessage, retirementFundingStatus, retirementReady } from '../src/domain/outlook';
import type { Account, AppData } from '../src/domain/types';

const account = (id: string, type: Account['type'], balance: number, patch: Partial<Account> = {}): Account => ({
  ...defaultData.accounts[3], id, type, name: id, balance, monthlyContribution: 0, employerContribution: 0,
  annualReturn: 0, returnMode: 'custom', fireEligible: true, holdings: [],
  accessibility: type.includes('401(k)') || type.includes('IRA') || type === 'HSA' ? 'Restricted' : 'Immediate', ...patch,
});
const plan = (accounts: Account[]): AppData => ({ ...structuredClone(defaultData), accounts, phases: [],
  profile: { ...defaultData.profile, currentAge: 50, retirementAge: 50, maxAge: 100, annualSpending: 12000,
    mode: 'real', customFireNumber: 300000, withdrawalRate: 0.04, rothContributionBasis: 0, rothTransfers: [], rothConversionHistory: [] } });
const run = (data: AppData) => projectScenario(data, { ...data.scenarios[0], overrides: {} });

describe('monthly retirement access and bridge coverage', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 15)); });
  afterEach(() => vi.useRealTimers());

  it('does not mark a funded portfolio ready when its money is locked before 59½', () => {
    const result = run(plan([account('locked', 'Traditional 401(k)', 1000000)]));
    expect(result.firePoint?.age).toBe(50);
    expect(result.portfolioFunding.funded).toBe(true);
    expect(result.retirementFunding.funded).toBe(false);
    expect(result.retirementFunding.firstAccessGapAge).toBe(50);
    expect(result.bridge).toMatchObject({ startAge: 50, years: 9.5, funded: false, firstGapAge: 50, accessible: 0 });
    expect(result.bridge.need).toBeCloseTo(114000);
    expect(result.bridge.fundedAmount).toBe(0);
    expect(retirementReady(result)).toBe(false);
    expect(retirementFundingStatus(result)).toBe('Spending gap at age 50.0');
    expect(retirementFundingMessage(result)).toBe('Your investments are projected to last, but money available for living expenses falls short at age 50.0.');
    expect(result.retirementFunding.points[114].balances.locked).toBe(1000000);
    expect(result.retirementFunding.points[115].balances.locked).toBeCloseTo(999000);
    expect(result.retirementFunding.laterFirePoint).toBeNull();
  });
  it('funds the whole bridge using accessible assets and unlocks retirement accounts at 59½', () => {
    const result = run(plan([account('cash', 'Taxable Brokerage', 114000), account('locked', 'Traditional IRA', 600000)]));
    expect(result.bridge.funded).toBe(true);
    expect(result.bridge.shortfall).toBeCloseTo(0);
    expect(result.bridge.fundedAmount).toBeCloseTo(114000);
    expect(result.retirementFunding.points[114].balances.cash).toBeCloseTo(0);
    expect(retirementReady(result)).toBe(true);
  });
  it('keeps the last bridge month gap even after accounts unlock and spending resumes', () => {
    const result = run(plan([account('cash', 'Taxable Brokerage', 113000), account('locked', 'Traditional IRA', 1000000)]));
    expect(result.bridge.funded).toBe(false);
    expect(result.bridge.firstGapAge).toBeCloseTo(59 + 5 / 12);
    expect(result.bridge.shortfall).toBeCloseTo(1000);
    expect(result.retirementFunding.points.at(-1)!.firePortfolio).toBeGreaterThan(0);
    expect(retirementReady(result)).toBe(false);
  });
  it('can cover the bridge from growth even with less accessible money than a static spending total', () => {
    const result = run(plan([account('cash', 'Taxable Brokerage', 80000, { annualReturn: 0.1 }), account('locked', 'Traditional IRA', 1000000)]));
    expect(result.bridge.accessible).toBeLessThan(result.bridge.need);
    expect(result.bridge.funded).toBe(true);
    expect(retirementReady(result)).toBe(true);
  });
  it('uses a conversion unlock to continue spending after liquid funds last five years', () => {
    const data = plan([account('cash', 'Taxable Brokerage', 60000), account('source', 'Traditional IRA', 1000000), account('roth', 'Roth IRA', 0)]);
    data.profile.rothTransfers = [{ id: 'ladder', kind: 'conversion', age: 50, sourceId: 'source', destinationId: 'roth', amount: 120000, basis: 0, taxRate: 0, taxAccountId: 'cash' }];
    const result = run(data);
    expect(result.bridge.funded).toBe(true);
    expect(result.retirementFunding.points[59].balances.roth).toBe(120000);
    expect(result.retirementFunding.points[60].spendable).toBe(120000);
    expect(result.retirementFunding.points[61].balances.roth).toBe(119000);
    expect(result.retirementFunding.points[61].rothAccessibleBasis).toBe(119000);
    expect(retirementReady(result)).toBe(true);
    data.accounts[0].balance = 59000;
    const gap = run(data);
    expect(gap.bridge.firstGapAge).toBeCloseTo(54 + 11 / 12);
    expect(gap.bridge.shortfall).toBeCloseTo(1000);
    expect(gap.bridge.funded).toBe(false);
  });
  it('consumes shared Roth basis once across multiple IRAs and cannot spend earnings early', () => {
    const data = plan([account('roth-a', 'Roth IRA', 100000, { accessibility: 'Immediate' }), account('roth-b', 'Roth IRA', 100000)]);
    data.profile.rothContributionBasis = 12000;
    const result = run(data);
    expect(result.retirementFunding.points[12].rothAccessibleBasis).toBeCloseTo(0);
    expect(result.retirementFunding.points[12].cumulativeWithdrawals).toBeCloseTo(12000);
    expect(result.bridge.firstGapAge).toBe(51);
    expect(result.retirementFunding.points[13].balances['roth-a']).toBeCloseTo(94000);
    expect(result.retirementFunding.points[13].balances['roth-b']).toBeCloseTo(94000);
  });
  it('respects conversion ordering, including an immature taxable lot blocking later principal', () => {
    const data = plan([account('roth', 'Roth IRA', 300000)]);
    data.profile.rothContributionBasis = 5000;
    data.profile.rothConversionHistory = [{ year: 2020, taxable: 10000, nontaxable: 0 }, { year: 2025, taxable: 100000, nontaxable: 0 }, { year: 2026, taxable: 0, nontaxable: 50000 }];
    const result = run(data);
    expect(result.retirementFunding.points[0].spendable).toBe(15000);
    expect(result.bridge.firstGapAge).toBe(51.25);
    expect(result.retirementFunding.points[16].balances.roth).toBe(285000);
    expect(result.retirementFunding.points[48].spendable).toBe(150000);
    expect(result.bridge.funded).toBe(false);
  });
  it('does not silently spend emergency cash or other excluded accounts', () => {
    const data = plan([account('cash', 'HYSA / Cash', 1000000, { fireEligible: false }), account('locked', 'Traditional IRA', 1000000)]);
    const result = run(data);
    expect(result.bridge.accessible).toBe(0);
    expect(result.bridge.funded).toBe(false);
    expect(result.retirementFunding.points.at(-1)!.balances.cash).toBe(1000000);
    const included = projectScenario(data, { ...data.scenarios[0], overrides: { includeCashInFire: true } });
    expect(included.bridge.funded).toBe(true);
    expect(retirementReady(included)).toBe(true);
  });
  it('does not let an Immediate label bypass IRA or 401(k) access restrictions', () => {
    for (const type of ['Traditional IRA', 'Traditional 401(k)', 'Roth 401(k)', 'After-tax 401(k)'] as const) {
      const result = run(plan([account('locked', type, 1000000, { accessibility: 'Immediate', afterTaxBasis: 1000000 })]));
      expect(result.bridge.accessible).toBe(0);
      expect(result.bridge.firstGapAge).toBe(50);
    }
  });
  it('deducts conversion taxes before assessing the cash available for bridge spending', () => {
    const data = plan([account('cash', 'Taxable Brokerage', 60000), account('source', 'Traditional IRA', 1000000), account('roth', 'Roth IRA', 0)]);
    data.profile.rothTransfers = [{ id: 'tax', kind: 'conversion', age: 50, sourceId: 'source', destinationId: 'roth', amount: 120000, basis: 0, taxRate: 0.2, taxAccountId: 'cash' }];
    const result = run(data);
    expect(result.bridge.conversionTax).toBe(24000);
    expect(result.bridge.need).toBeCloseTo(138000);
    expect(result.bridge.accessible).toBe(36000);
    expect(result.bridge.firstGapAge).toBe(53);
    expect(result.bridge.shortfall).toBeCloseTo(24000);
    expect(result.portfolioFunding.funded).toBe(true);
    data.accounts[0].balance = 10000;
    const unpaid = run(data);
    expect(unpaid.bridge.funded).toBe(false);
    expect(unpaid.bridge.firstGapAge).toBe(50);
    expect(unpaid.retirementFunding.unpaidConversionTax).toBe(14000);
  });
  it('prorates a bridge boundary inside a month and spends unlocked funds only afterward', () => {
    const data = plan([account('cash', 'Taxable Brokerage', 1200), account('locked', 'Traditional IRA', 1000000)]);
    data.profile.currentAge = data.profile.retirementAge = 59.4;
    const result = run(data);
    expect(result.bridge.need).toBeCloseTo(1200);
    expect(result.bridge.funded).toBe(true);
    expect(result.retirementFunding.points[2].balances.locked).toBeCloseTo(999200);
    data.accounts[0].balance = 1100;
    const gap = run(data);
    expect(gap.bridge.shortfall).toBeCloseTo(100);
    expect(gap.bridge.firstGapAge).toBeCloseTo(59.4 + 1 / 12);
  });
  it('reports a date when small recurring tax shortfalls accumulate past the funding tolerance', () => {
    const data = plan([account('cash', 'Taxable Brokerage', 0), account('source', 'Traditional IRA', 1000000), account('roth', 'Roth IRA', 0)]);
    data.profile.annualSpending = 0;
    data.profile.rothTransfers = [{ id: 'tiny-tax', kind: 'conversion', age: 50, endAge: 51, repeat: 'monthly', sourceId: 'source', destinationId: 'roth', amount: 1, basis: 0, taxRate: 0.001, taxAccountId: 'cash' }];
    const result = run(data);
    expect(result.bridge.funded).toBe(false);
    expect(result.bridge.firstGapAge).not.toBeNull();
    expect(retirementFundingStatus(result)).toContain('Tax funding gap at age');
  });
  it('does not require a bridge from 59½ but keeps other withdrawal access gaps visible', () => {
    const data = plan([account('locked', 'Traditional IRA', 1000000)]);
    data.profile.currentAge = data.profile.retirementAge = 59.5;
    expect(run(data).bridge).toMatchObject({ funded: true, years: 0, need: 0 });
    expect(retirementReady(run(data))).toBe(true);
    data.accounts = [account('hsa', 'HSA', 1000000, { accessibility: 'Immediate' })];
    data.profile.currentAge = data.profile.retirementAge = 60;
    const hsa = run(data);
    expect(hsa.bridge.funded).toBe(true);
    expect(hsa.retirementFunding.firstAccessGapAge).toBe(60);
    expect(retirementReady(hsa)).toBe(false);
    data.profile.currentAge = data.profile.retirementAge = 65;
    expect(retirementReady(run(data))).toBe(true);
  });
  it('uses scenario retirement overrides and leaves the saved plan unchanged', () => {
    const data = plan([account('locked', 'Traditional IRA', 1000000)]);
    const before = structuredClone(data);
    const result = projectScenario(data, { ...data.scenarios[0], overrides: { retirementAge: 60 } });
    expect(result.bridge.startAge).toBe(60);
    expect(result.bridge.years).toBe(0);
    expect(retirementReady(result)).toBe(true);
    expect(data).toEqual(before);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { projectScenario } from '../src/domain/calculations';
import { fundedTargetCrossing } from '../src/domain/outlook';
import { retirementPortfolioComposition } from '../src/domain/portfolioComposition';
import type { AppData } from '../src/domain/types';

const plan = (): AppData => ({
  ...structuredClone(defaultData),
  profile: { ...defaultData.profile, currentAge: 60, retirementAge: 65, maxAge: 100,
    annualSpending: 12000, customFireNumber: 400000, mode: 'real', rothTransfers: [], rothConversionHistory: [] },
  accounts: [{ ...defaultData.accounts[3], id: 'portfolio', balance: 200000, monthlyContribution: 0,
    employerContribution: 0, annualReturn: 0.07, returnMode: 'custom', holdings: [] }],
  phases: [],
});
const run = (data: AppData) => projectScenario(data, { ...data.scenarios[0], overrides: {} });
const expectReconciled = (portfolio: ReturnType<typeof retirementPortfolioComposition>) => {
  expect(portfolio.slices.reduce((sum, slice) => sum + slice.value, 0)).toBeCloseTo(portfolio.total, 6);
  expect(portfolio.slices.reduce((sum, slice) => sum + slice.percentage, 0)).toBeCloseTo(portfolio.total > 0 ? 100 : 0, 8);
  for (const slice of portfolio.slices) {
    expect(slice.value).toBeGreaterThanOrEqual(0);
    expect(slice.percentage).toBeGreaterThanOrEqual(0);
    expect(slice.percentage).toBeLessThanOrEqual(100);
  }
};

describe('retirement portfolio pie', () => {
  it('uses the pre-withdrawal retirement balance even when FIRE is reached later', () => {
    const result = run(plan());
    const crossing = fundedTargetCrossing(result)!;
    expect(crossing.age).toBeGreaterThan(result.profile.retirementAge);
    expect(crossing.cumulativeWithdrawals).toBeGreaterThan(0);
    const portfolio = retirementPortfolioComposition(result);
    expect(portfolio.total).toBeCloseTo(280510.34614);
    expect(portfolio.total).toBe(result.targetPoint.firePortfolio);
    expect(portfolio.slices.find((slice) => slice.name === 'Investment growth')!.value).toBeCloseTo(80510.34614);
    expect(portfolio.hasDeductions).toBe(false);
    expectReconciled(portfolio);
  });
  it('keeps a growth share over 90% and the other shares within a combined 100%', () => {
    const data = plan();
    data.profile.retirementAge = 100;
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.slices.find((slice) => slice.name === 'Investment growth')!.percentage).toBeGreaterThan(90);
    expectReconciled(portfolio);
  });
  it('deducts investment losses from the remaining invested money', () => {
    const data = plan();
    data.accounts[0].annualReturn = -0.1;
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.hasDeductions).toBe(true);
    expect(portfolio.slices[0].value).toBeCloseTo(200000 * 0.9 ** 5);
    expect(portfolio.slices.find((slice) => slice.name === 'Investment growth')!.value).toBe(0);
    expectReconciled(portfolio);
  });
  it('accounts for conversion taxes paid from FIRE money without inflated slices', () => {
    const data = plan();
    data.accounts[0].annualReturn = 0;
    data.accounts.push({ ...data.accounts[0], id: 'traditional', type: 'Traditional IRA', balance: 100000, accessibility: 'Restricted' });
    data.accounts.push({ ...data.accounts[0], id: 'roth', type: 'Roth IRA', balance: 0, accessibility: 'Potential' });
    data.profile.rothTransfers = [{ id: 'convert', kind: 'conversion', age: 61, sourceId: 'traditional', destinationId: 'roth', amount: 100000, basis: 0, taxRate: 0.2, taxAccountId: 'portfolio' }];
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.total).toBe(280000);
    expect(portfolio.hasDeductions).toBe(true);
    expect(portfolio.slices[0].value).toBe(280000);
    expectReconciled(portfolio);
  });
  it('shows a transfer into FIRE separately from investment growth', () => {
    const data = plan();
    data.accounts[0].annualReturn = 0;
    data.accounts.push({ ...data.accounts[0], id: 'reserve', type: 'Traditional IRA', balance: 100000, accessibility: 'Restricted', fireEligible: false });
    data.accounts.push({ ...data.accounts[0], id: 'roth', type: 'Roth IRA', balance: 0, accessibility: 'Potential' });
    data.profile.rothTransfers = [{ id: 'convert', kind: 'conversion', age: 61, sourceId: 'reserve', destinationId: 'roth', amount: 100000, basis: 0, taxRate: 0, taxAccountId: 'portfolio' }];
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.slices.find((slice) => slice.name === 'Transfers into FIRE')!.value).toBe(100000);
    expect(portfolio.slices.find((slice) => slice.name === 'Investment growth')!.value).toBe(0);
    expectReconciled(portfolio);
  });
  it('rounds three equal shares to exactly 100% and handles an empty portfolio', () => {
    const data = plan();
    data.profile.retirementAge = 61;
    data.accounts[0] = { ...data.accounts[0], balance: 12, monthlyContribution: 1, employerContribution: 1, annualReturn: 0 };
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.slices.map((slice) => slice.percentage)).toEqual([33.4, 33.3, 33.3, 0]);
    expectReconciled(portfolio);
    data.accounts[0] = { ...data.accounts[0], balance: 0, monthlyContribution: 0, employerContribution: 0 };
    expectReconciled(retirementPortfolioComposition(run(data)));
  });
  it('shows a positive balance smaller than one cent without losing its percentage', () => {
    const data = plan();
    data.accounts[0] = { ...data.accounts[0], balance: 0, annualReturn: 0 };
    data.accounts.push({ ...data.accounts[0], id: 'reserve', type: 'Traditional IRA', balance: 0.004, accessibility: 'Restricted', fireEligible: false });
    data.accounts.push({ ...data.accounts[0], id: 'roth', type: 'Roth IRA', accessibility: 'Potential' });
    data.profile.rothTransfers = [{ id: 'convert', kind: 'conversion', age: 61, sourceId: 'reserve', destinationId: 'roth', amount: 0.004, basis: 0, taxRate: 0, taxAccountId: 'portfolio' }];
    const portfolio = retirementPortfolioComposition(run(data));
    expect(portfolio.total).toBe(0.004);
    expect(portfolio.slices.find((slice) => slice.name === 'Transfers into FIRE')!.percentage).toBe(100);
    expectReconciled(portfolio);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultData } from '../src/domain/defaults';
import { calculateCoastFire, calculateRetirementFunding, projectCore, projectScenario, realReturnFromNominal } from '../src/domain/calculations';
import { coastFireMessage, retirementFundingMessage } from '../src/domain/outlook';
import type { Account, AppData } from '../src/domain/types';

const investment = (patch: Partial<Account> = {}): Account => ({ ...defaultData.accounts[3], id: 'portfolio', balance: 420000,
  monthlyContribution: 0, employerContribution: 0, annualReturn: 0, returnMode: 'custom', holdings: [], ...patch });
const plan = (): AppData => ({ ...structuredClone(defaultData), profile: { ...defaultData.profile, currentAge: 60, retirementAge: 65,
  maxAge: 70, annualSpending: 12000, withdrawalRate: 0.04, customFireNumber: 1000000, mode: 'real', rothTransfers: [] },
  accounts: [investment()], phases: [] });
const scenario = (data: AppData) => ({ ...data.scenarios[0], overrides: {} });

describe('retirement funding and true Coast FIRE', () => {
  it('funds every withdrawal through 100 even below the target, including an exactly zero endpoint', () => {
    const data = plan();
    const result = projectScenario(data, scenario(data));
    expect(result.retirementFunding.funded).toBe(true);
    expect(result.retirementFunding.endingBalance).toBeCloseTo(0);
    expect(result.retirementFunding.horizonAge).toBe(100);
    expect(result.retirementFunding.laterFirePoint).toBeNull();
    expect(result.coastFire?.eligibilityPoint).toBeNull();
    expect(result.points.at(-1)!.age).toBe(70);
    expect(result.retirementFunding.points.at(-1)!.age).toBe(100);
    expect(retirementFundingMessage(result)).toBe('Below your FIRE target, but your projected portfolio funds retirement through age 100.');
  });
  it('reports the first spending shortfall at its actual withdrawal age, even above the FIRE target', () => {
    const data = plan();
    data.profile.customFireNumber = 300000;
    data.accounts = [investment({ balance: 300000 })];
    const result = projectScenario(data, scenario(data));
    expect(result.retirementFunding.funded).toBe(false);
    expect(result.retirementFunding.firstUnfundedAge).toBeCloseTo(90);
    expect(retirementFundingMessage(result)).toBe('Projected spending runs out of money at age 90.0.');
    expect(result.coastFire).toMatchObject({ reached: false, eligibilityPoint: null, targetFundingGap: 'spending' });
  });
  it('detects a later target crossing while withdrawing and uses the requested copy', () => {
    const data = plan();
    data.profile.customFireNumber = 400000;
    data.accounts = [investment({ balance: 200000, annualReturn: 0.07 })];
    const result = projectScenario(data, scenario(data));
    expect(result.targetPoint.firePortfolio).toBeLessThan(result.targetPoint.fireTarget);
    expect(result.retirementFunding.funded).toBe(true);
    const crossing = result.retirementFunding.laterFirePoint!;
    expect(crossing.age).toBeGreaterThan(65);
    expect(crossing.cumulativeWithdrawals).toBeGreaterThan(0);
    expect(crossing.firePortfolio).toBeGreaterThanOrEqual(crossing.fireTarget);
    expect(retirementFundingMessage(result)).toBe(`Below your FIRE Target, but projected to reach your FIRE target at age ${crossing.age.toFixed(1)} while withdrawing.`);
  });
  it('does not promise funded retirement when a later transfer repairs an earlier shortfall', () => {
    const data = plan();
    data.profile.customFireNumber = 50000;
    data.accounts = [investment({ balance: 1000 }), investment({ id: 'reserve', balance: 100000, fireEligible: false, type: 'Traditional IRA' }), investment({ id: 'roth', balance: 0, type: 'Roth IRA' })];
    data.profile.rothTransfers = [{ id: 'later', kind: 'conversion', age: 67, sourceId: 'reserve', destinationId: 'roth', amount: 100000, basis: 100000, taxRate: 0, taxAccountId: 'portfolio' }];
    const result = projectScenario(data, scenario(data));
    expect(result.retirementFunding.funded).toBe(false);
    expect(result.retirementFunding.firstUnfundedAge).toBeCloseTo(65 + 1 / 12);
    expect(result.retirementFunding.laterFirePoint).toBeNull();
    expect(retirementFundingMessage(result)).toContain('runs out of money');
  });
  it('recognizes funded Coast FIRE today without either contribution source', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 500000 };
    data.accounts = [investment({ balance: 310000, annualReturn: 0.05, monthlyContribution: 9000, employerContribution: 9000 })];
    const coast = calculateCoastFire(data.profile, data.accounts)!;
    expect(coast.reached).toBe(true);
    expect(coast.eligibilityPoint?.month).toBe(0);
    expect(coast.balanceAtRetirement).toBeCloseTo(310000 * 1.05 ** 10);
    const path = projectCore({ profile: data.profile, accounts: data.accounts, phases: [], includeRetirement: true, contributionsStopMonth: 0 });
    expect(path[120].personalContributions).toBe(0);
    expect(path[120].employerContributions).toBe(0);
    expect(path[120].cumulativeWithdrawals).toBe(0);
    expect(path[120].firePortfolio).toBeCloseTo(coast.balanceAtRetirement!);
  });
  it('finds the earliest future month using planned personal and employer contributions until then', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 100000, annualSpending: 1200 };
    data.accounts = [investment({ balance: 0 })];
    data.phases = [{ id: 'saving', name: 'Saving', startsWhen: { kind: 'always' }, contributions: { portfolio: { personal: 500, employer: 500 } } }];
    const result = projectScenario(data, scenario(data));
    const coast = result.coastFire!;
    expect(coast.reached).toBe(false);
    expect(coast.eligibilityPoint?.month).toBe(100);
    expect(coast.balanceAtRetirement).toBeCloseTo(100000);
    expect(coastFireMessage(result)).toContain('age 38.3');
    const path = projectCore({ profile: result.profile, accounts: result.accounts, phases: result.phases, includeRetirement: true, contributionsStopMonth: 100 });
    expect(path[120].firePortfolio).toBeCloseTo(100000);
    expect(path[120].personalContributions).toBe(50000);
    expect(path[120].employerContributions).toBe(50000);
    expect(path[121].cumulativeWithdrawals).toBe(100);
  });
  it('does not call reaching the target on the retirement date an earlier Coast milestone', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 120000 };
    data.accounts = [investment({ balance: 0, monthlyContribution: 1000 })];
    expect(calculateCoastFire(data.profile, data.accounts)).toMatchObject({ reached: false, eligibilityPoint: null });
    expect(calculateCoastFire({ ...data.profile, retirementAge: 30 }, data.accounts)).toBeNull();
    expect(calculateCoastFire({ ...data.profile, customFireNumber: 0 }, data.accounts)).toBeNull();
  });
  it('keeps Coast eligibility consistent in real and nominal dollars and excludes ineligible accounts', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 500000, nominalReturn: 0.08, inflationRate: 0.03, realReturn: realReturnFromNominal(0.08, 0.03) };
    data.accounts = [investment({ balance: 325000, annualReturn: undefined, returnMode: 'plan' }), investment({ id: 'excluded', balance: 9000000, fireEligible: false })];
    expect(calculateCoastFire(data.profile, data.accounts)?.reached).toBe(true);
    expect(calculateCoastFire({ ...data.profile, mode: 'nominal' }, data.accounts)?.reached).toBe(true);
    data.accounts[0].balance = 100000;
    expect(calculateCoastFire(data.profile, data.accounts)?.eligibilityPoint).toBeNull();
  });
  it('respects scenario contributions and returns without changing saved inputs', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 100000, annualSpending: 1200 };
    data.accounts = [investment({ balance: 0 })];
    data.phases = [{ id: 'saving', name: 'Saving', startsWhen: { kind: 'always' }, contributions: { portfolio: { personal: 0, employer: 0 } } }];
    const before = structuredClone(data);
    const result = projectScenario(data, { ...scenario(data), overrides: { phaseContributions: { saving: { portfolio: { personal: 1000 } } } } });
    expect(result.coastFire?.eligibilityPoint?.month).toBe(100);
    expect(projectScenario(data, scenario(data)).coastFire?.eligibilityPoint).toBeNull();
    expect(data).toEqual(before);
  });
  it('uses account-specific returns in Coast growth and honors scheduled taxes', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 400000 };
    data.accounts = [investment({ balance: 200000, annualReturn: 0.1 }), investment({ id: 'slow', balance: 50000, annualReturn: 0 })];
    const coast = calculateCoastFire(data.profile, data.accounts)!;
    expect(coast.reached).toBe(true);
    expect(coast.balanceAtRetirement).toBeCloseTo(200000 * 1.1 ** 10 + 50000);
    const taxPlan = plan();
    taxPlan.profile.customFireNumber = 300000;
    taxPlan.accounts = [investment({ type: 'Traditional IRA' }), investment({ id: 'roth', balance: 0, type: 'Roth IRA' }), investment({ id: 'cash', balance: 0, type: 'HYSA / Cash', fireEligible: false })];
    taxPlan.profile.rothTransfers = [{ id: 'taxed', kind: 'conversion', age: 62, sourceId: 'portfolio', destinationId: 'roth', amount: 100000, basis: 0, taxRate: 0.2, taxAccountId: 'cash' }];
    expect(calculateRetirementFunding(taxPlan.profile, taxPlan.accounts).funded).toBe(false);
    expect(calculateCoastFire(taxPlan.profile, taxPlan.accounts)?.eligibilityPoint).toBeNull();
  });
  it('extends the funding check beyond 100 when an older maximum age is selected', () => {
    const data = plan();
    const funding = calculateRetirementFunding({ ...data.profile, maxAge: 110 }, data.accounts);
    expect(funding.horizonAge).toBe(110);
    expect(funding.funded).toBe(false);
    expect(funding.firstUnfundedAge).toBeCloseTo(100);
  });
  it('uses the actual retirement balance when the visible chart ends before retirement', () => {
    const data = plan();
    data.profile.retirementAge = 80;
    data.accounts = [investment({ balance: 100000, monthlyContribution: 1000 })];
    const result = projectScenario(data, scenario(data));
    expect(result.points.at(-1)!.age).toBe(70);
    expect(result.targetPoint.age).toBe(80);
    expect(result.targetPoint.firePortfolio).toBeCloseTo(340000);
    expect(result.retirementFunding.balanceAtRetirement).toBeCloseTo(result.targetPoint.firePortfolio);
  });
  it('finds future Coast eligibility after a savings gap with recurring transfers', () => {
    const data = plan();
    data.profile = { ...data.profile, currentAge: 30, retirementAge: 40, customFireNumber: 100000, annualSpending: 240 };
    data.accounts = [investment({ balance: 0, type: 'Traditional IRA' }), investment({ id: 'roth', balance: 0, type: 'Roth IRA' })];
    data.phases = [
      { id: 'pause', name: 'Pause', startsWhen: { kind: 'always' }, contributions: { portfolio: { personal: 0, employer: 0 } } },
      { id: 'resume', name: 'Resume', startsWhen: { kind: 'age', age: 35 }, contributions: { portfolio: { personal: 2000, employer: 0 } } },
    ];
    data.profile.rothTransfers = [{ id: 'monthly', kind: 'conversion', age: 30, endAge: 40, repeat: 'monthly', sourceId: 'portfolio', destinationId: 'roth', amount: 100, basis: 100, taxRate: 0, taxAccountId: 'portfolio' }];
    const coast = calculateCoastFire(data.profile, data.accounts, data.phases)!;
    expect(coast.eligibilityPoint?.month).toBe(110);
    expect(coast.balanceAtRetirement).toBeCloseTo(100000);
    const path = projectCore({ profile: data.profile, accounts: data.accounts, phases: data.phases, endAtTarget: true, contributionsStopMonth: 110 });
    expect(path.at(-1)!.firePortfolio).toBeCloseTo(coast.balanceAtRetirement!);
    expect(path.at(-1)!.personalContributions).toBeCloseTo(100000);
  });
});

import type {
  Account, AppData, ContributionAmount, ContributionPhase, Profile, ProjectionPoint,
  Scenario, ScenarioBudgetMetrics, ScenarioResult, RothConversionLot, RothTransferResult,
} from './types';
import { accessibleConversionBasis, addConversionLot, consumeRothBasis, isMegaBackdoor, rothTransferError } from './roth';

const safe = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, safe(value, min)));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const calculateFireNumber = (annualSpending: number, withdrawalRate: number) =>
  withdrawalRate > 0 ? Math.max(0, annualSpending) / withdrawalRate : Infinity;

export const annualToMonthlyRate = (annualRate: number) =>
  Math.pow(1 + Math.max(-0.999999, annualRate), 1 / 12) - 1;

export const nominalReturnFromReal = (realReturn: number, inflationRate: number) =>
  (1 + realReturn) * (1 + Math.max(-0.999999, inflationRate)) - 1;

export const realReturnFromNominal = (nominalReturn: number, inflationRate: number) =>
  (1 + nominalReturn) / (1 + Math.max(-0.999999, inflationRate)) - 1;

export const growAccountOneMonth = (balance: number, contribution: number, annualRate: number) =>
  (Math.max(0, balance) + Math.max(0, contribution)) * (1 + annualToMonthlyRate(annualRate));

export const effectiveFireNumber = (profile: Profile) =>
  profile.customFireNumber ?? calculateFireNumber(profile.annualSpending, profile.withdrawalRate);

const dateAtMonth = (start: Date, month: number) => {
  const date = new Date(start.getFullYear(), start.getMonth() + month, 1);
  return date.toISOString().slice(0, 10);
};

const triggerMet = (
  trigger: ContributionPhase['startsWhen'], balances: Record<string, number>, age: number, date: string,
) => {
  switch (trigger.kind) {
    case 'always': return true;
    case 'cashTarget': return (balances[trigger.accountId] ?? 0) >= trigger.amount;
    case 'age': return age >= trigger.age;
    case 'date': return date >= trigger.date;
  }
};

export const resolvePhase = (
  phases: ContributionPhase[], balances: Record<string, number>, age: number, date: string,
) => phases.reduce((active, phase) => triggerMet(phase.startsWhen, balances, age, date) ? phase : active, phases[0]);

export const applyScenarioOverrides = (data: AppData, scenario: Scenario) => {
  const profile = clone(data.profile);
  const accounts = clone(data.accounts);
  const phases = clone(data.phases);
  const overrides = scenario.overrides;
  if (overrides.rothTransfers) profile.rothTransfers = clone(overrides.rothTransfers);

  for (const key of ['currentAge', 'retirementAge', 'annualSpending', 'withdrawalRate', 'realReturn', 'nominalReturn', 'inflationRate'] as const) {
    if (overrides[key] !== undefined) (profile[key] as number) = overrides[key] as number;
  }
  if ('customFireNumber' in overrides) profile.customFireNumber = overrides.customFireNumber ?? null;
  if (overrides.cashTarget !== undefined) {
    profile.emergencyTarget = overrides.cashTarget;
    phases.forEach((phase) => {
      if (phase.startsWhen.kind === 'cashTarget') phase.startsWhen.amount = overrides.cashTarget!;
    });
  }
  accounts.forEach((account) => {
    if (overrides.accountBalances?.[account.id] !== undefined) account.balance = Math.max(0, overrides.accountBalances[account.id]);
    if (overrides.accountReturns && account.id in overrides.accountReturns) {
      account.annualReturn = overrides.accountReturns[account.id];
      account.returnMode = 'custom';
    }
    if (overrides.includeCashInFire && account.type === 'HYSA / Cash') account.fireEligible = true;
    if (overrides.includeCryptoInFire && account.type === 'Crypto') account.fireEligible = true;
  });
  const scale = overrides.contributionScale ?? 1;
  phases.forEach((phase, phaseIndex) => {
    Object.entries(phase.contributions).forEach(([accountId, amount]) => {
      const account = accounts.find((item) => item.id === accountId);
      if (account?.fireEligible) amount.personal *= scale;
    });
    if (phaseIndex > 0) {
      Object.entries(overrides.contributions ?? {}).forEach(([accountId, amount]) => {
        const current = phase.contributions[accountId] ?? { personal: 0, employer: 0 };
        phase.contributions[accountId] = {
          personal: amount.personal ?? current.personal,
          employer: amount.employer ?? current.employer,
        };
      });
    }
    Object.entries(overrides.phaseContributions?.[phase.id] ?? {}).forEach(([accountId, amount]) => {
      const current = phase.contributions[accountId] ?? { personal: 0, employer: 0 };
      phase.contributions[accountId] = {
        personal: amount.personal ?? current.personal,
        employer: amount.employer ?? current.employer,
      };
    });
  });
  profile.realReturn = realReturnFromNominal(profile.nominalReturn, profile.inflationRate);
  return { profile, accounts, phases };
};

const annualReturnFor = (account: Account, profile: Profile) => {
  if (account.returnMode === 'plan' || (account.type === 'Crypto' && account.returnMode === undefined)) {
    return profile.mode === 'real' ? profile.realReturn : profile.nominalReturn;
  }
  if (account.annualReturn !== undefined) return account.annualReturn;
  return profile.mode === 'real' ? profile.realReturn : profile.nominalReturn;
};

const totalsFor = (accounts: Account[], balances: Record<string, number>, rothBasis: number) => {
  let firePortfolio = 0;
  let netWorth = 0;
  let accessible = 0;
  let cash = 0;
  for (const account of accounts) {
    const balance = balances[account.id] ?? 0;
    if (account.fireEligible) firePortfolio += balance;
    if (account.includeInNetWorth) netWorth += balance;
    if (account.type === 'HYSA / Cash') cash += balance;
    if (account.includeInNetWorth && account.accessibility === 'Immediate' && account.type !== 'Roth IRA' && !account.type.includes('401(k)')) accessible += balance;
  }
  const rothBalance = accounts.filter((account) => account.type === 'Roth IRA' && account.includeInNetWorth)
    .reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  accessible += Math.min(rothBalance, Math.max(0, rothBasis));
  return { firePortfolio, netWorth, accessible, cash };
};

interface CoreProjection {
  profile: Profile;
  accounts: Account[];
  phases: ContributionPhase[];
  extraMonthlyContribution?: number;
  fireContributionScale?: number;
  endAtTarget?: boolean;
  includeRetirement?: boolean;
}

export const isScalableFireAccount = (account: Account) => account.fireEligible && account.type !== 'HYSA / Cash';

const monthlyRetirementWithdrawal = (profile: Profile, month: number) => {
  const inflationFactor = profile.mode === 'nominal'
    ? Math.pow(1 + Math.max(-0.999999, profile.inflationRate), month / 12)
    : 1;
  return Math.max(0, safe(profile.annualSpending)) / 12 * inflationFactor;
};

const withdrawFromFirePortfolio = (accounts: Account[], balances: Record<string, number>, requested: number) => {
  const available = accounts.reduce((sum, account) => sum + (account.fireEligible ? Math.max(0, balances[account.id] ?? 0) : 0), 0);
  const actual = Math.min(Math.max(0, requested), available);
  if (actual > 0 && available > 0) {
    accounts.forEach((account) => {
      if (!account.fireEligible) return;
      const balance = Math.max(0, balances[account.id] ?? 0);
      balances[account.id] = Math.max(0, balance - actual * balance / available);
    });
  }
  return { actual, shortfall: Math.max(0, requested - actual) };
};

export const projectCore = ({ profile, accounts, phases, extraMonthlyContribution = 0, fireContributionScale = 1, endAtTarget = false, includeRetirement = false }: CoreProjection) => {
  const maxAge = endAtTarget ? profile.retirementAge : profile.maxAge;
  const totalMonths = Math.max(0, Math.ceil((maxAge - profile.currentAge) * 12));
  const retirementStartMonth = Math.max(0, Math.round((profile.retirementAge - profile.currentAge) * 12));
  const balances = Object.fromEntries(accounts.map((account) => [account.id, Math.max(0, account.balance)]));
  const monthlyRates = Object.fromEntries(
    accounts.map((account) => [account.id, annualToMonthlyRate(annualReturnFor(account, profile))]),
  );
  const start = new Date();
  const baseFireNumber = effectiveFireNumber(profile);
  const startingTotals = totalsFor(accounts, balances, profile.rothContributionBasis);
  const startingPrincipal = startingTotals.firePortfolio;
  let personalContributions = 0;
  let rothBasis = Math.max(0, profile.rothContributionBasis);
  let employerContributions = 0;
  let cumulativeWithdrawals = 0;
  let cumulativeWithdrawalShortfall = 0;
  let cumulativeConversionTax = 0;
  let cumulativeConversionTaxPaid = 0;
  let fireTransferAdjustment = 0;
  const conversionLots: RothConversionLot[] = [];
  const afterTaxBases = Object.fromEntries(accounts.filter((account) => account.type === 'After-tax 401(k)').map((account) => [account.id, Math.max(0, safe(account.afterTaxBasis ?? 0))]));
  const inPlanTaxYears: Record<string, number[]> = {};
  for (const lot of profile.rothConversionHistory ?? []) {
    if (Number.isInteger(lot.year) && lot.year <= start.getFullYear() && lot.year >= 1998
      && Number.isFinite(lot.taxable) && Number.isFinite(lot.nontaxable)) {
      addConversionLot(conversionLots, lot.year, Math.max(0, lot.taxable), Math.max(0, lot.nontaxable));
    }
  }
  const points: ProjectionPoint[] = [];
  const extraAccount = accounts.find((account) => account.fireEligible && account.type === 'Taxable Brokerage')
    ?? accounts.find((account) => account.fireEligible);

  for (let month = 0; month <= totalMonths; month += 1) {
    const age = profile.currentAge + month / 12;
    const date = dateAtMonth(start, month);
    const year = Number(date.slice(0, 4));
    const rothTransfers: RothTransferResult[] = [];
    for (const transfer of profile.rothTransfers ?? []) {
      if (transfer.age < profile.currentAge || transfer.age > maxAge) continue;
      const firstMonth = Math.round((transfer.age - profile.currentAge) * 12);
      const repeat = transfer.repeat ?? 'once';
      if (month < firstMonth) continue;
      if (month !== firstMonth && (repeat === 'once'
        || month > Math.round(((transfer.endAge ?? transfer.age) - profile.currentAge) * 12)
        || (repeat === 'annual' && (month - firstMonth) % 12 !== 0))) continue;
      const mega = isMegaBackdoor(transfer);
      const recentInPlan = transfer.kind === 'roth401k' && age < 59.5 && (inPlanTaxYears[transfer.sourceId] ?? []).some((conversionYear) => year < conversionYear + 5);
      const error = rothTransferError(transfer, accounts) ?? (recentInPlan ? 'This Roth 401(k) contains a recent taxable in-plan conversion. Its subsequent IRA rollover during the recapture period is not modeled; transfer skipped.' : undefined);
      if (error) {
        rothTransfers.push({ id: transfer.id, date, requested: transfer.amount, transferred: 0, taxable: 0, tax: 0, taxPaid: 0, accessYear: null, warning: error });
        continue;
      }
      const source = accounts.find((account) => account.id === transfer.sourceId)!;
      const destination = accounts.find((account) => account.id === transfer.destinationId)!;
      const requested = mega && transfer.fullBalance ? balances[source.id] : transfer.amount;
      const amount = Math.min(requested, balances[source.id]);
      if (mega && transfer.fullBalance && amount === 0) continue;
      const proportionalBasis = mega && balances[source.id] > 0 ? afterTaxBases[source.id] * amount / balances[source.id] : 0;
      const basis = mega ? Math.min(amount, proportionalBasis) : transfer.basis * amount / transfer.amount;
      const earningsDestination = mega && transfer.earningsDestinationId ? accounts.find((account) => account.id === transfer.earningsDestinationId) : undefined;
      const pretaxRollover = earningsDestination ? amount - basis : 0;
      const rothAmount = amount - pretaxRollover;
      const taxable = transfer.kind === 'roth401k' ? 0 : rothAmount - basis;
      const tax = taxable * transfer.taxRate;
      const taxAccount = accounts.find((account) => account.id === transfer.taxAccountId);
      const taxPaid = Math.min(tax, taxAccount ? balances[taxAccount.id] : 0);
      balances[source.id] -= amount;
      balances[destination.id] += rothAmount;
      if (mega) afterTaxBases[source.id] = Math.max(0, afterTaxBases[source.id] - proportionalBasis);
      if (earningsDestination) balances[earningsDestination.id] += pretaxRollover;
      if (taxAccount) balances[taxAccount.id] -= taxPaid;
      fireTransferAdjustment += rothAmount * Number(destination.fireEligible) + pretaxRollover * Number(earningsDestination?.fireEligible ?? false) - amount * Number(source.fireEligible)
        - (taxAccount?.fireEligible ? taxPaid : 0);
      cumulativeConversionTax += tax;
      cumulativeConversionTaxPaid += taxPaid;
      if (transfer.kind === 'roth401k') rothBasis += basis;
      else if (transfer.kind === 'mega-plan') {
        if (taxable > 0) (inPlanTaxYears[destination.id] ??= []).push(year);
      }
      else addConversionLot(conversionLots, year, taxable, basis);
      const warnings = [];
      if (amount < requested) warnings.push('Source balance is insufficient; transfer was capped.');
      if (taxPaid < tax) warnings.push('Tax funding is insufficient; unpaid tax is not deducted from other accounts.');
      rothTransfers.push({ id: transfer.id, date, requested, transferred: amount, taxable, tax, taxPaid, nontaxable: basis, pretaxRollover, rothAmount,
        accessYear: taxable > 0 ? year + 5 : null, warning: warnings.join(' ') || undefined });
    }
    const phase = resolvePhase(phases, balances, age, date);
    const rothAccessibleBasis = rothBasis + accessibleConversionBasis(conversionLots, year, age);
    const totals = totalsFor(accounts, balances, rothAccessibleBasis);
    const years = month / 12;
    const fireTarget = profile.mode === 'nominal' ? baseFireNumber * Math.pow(1 + profile.inflationRate, years) : baseFireNumber;
    const inRetirement = includeRetirement && month >= retirementStartMonth;
    const monthlyWithdrawal = inRetirement ? monthlyRetirementWithdrawal(profile, month) : 0;
    points.push({
      month, age, date, fireTarget, ...totals, balances: { ...balances }, phaseName: inRetirement ? 'Retirement drawdown' : phase?.name ?? 'Base contributions',
      startingPrincipal, personalContributions, employerContributions,
      investmentGrowth: totals.firePortfolio - startingPrincipal - personalContributions - employerContributions + cumulativeWithdrawals - fireTransferAdjustment,
      projectionPhase: inRetirement ? 'retirement' : 'accumulation',
      monthlyWithdrawal,
      cumulativeWithdrawals,
      cumulativeWithdrawalShortfall,
      rothAccessibleBasis, cumulativeConversionTax, cumulativeConversionTaxPaid, rothTransfers,
      afterTaxBases: { ...afterTaxBases },
    });
    if (month === totalMonths) break;

    if (inRetirement) {
      const balancesBeforeWithdrawal = { ...balances };
      const rothBefore = accounts.filter((account) => account.type === 'Roth IRA').reduce((sum, account) => sum + balances[account.id], 0);
      const withdrawal = withdrawFromFirePortfolio(accounts, balances, monthlyWithdrawal);
      const rothAfter = accounts.filter((account) => account.type === 'Roth IRA').reduce((sum, account) => sum + balances[account.id], 0);
      for (const id of Object.keys(afterTaxBases)) {
        if (balancesBeforeWithdrawal[id] > 0) afterTaxBases[id] *= balances[id] / balancesBeforeWithdrawal[id];
      }
      rothBasis = consumeRothBasis(rothBasis, conversionLots, Math.max(0, rothBefore - rothAfter));
      cumulativeWithdrawals += withdrawal.actual;
      cumulativeWithdrawalShortfall += withdrawal.shortfall;
      accounts.forEach((account) => {
        balances[account.id] = Math.max(0, balances[account.id] ?? 0) * (1 + monthlyRates[account.id]);
      });
      continue;
    }

    for (const account of accounts) {
      const planned: ContributionAmount = phase?.contributions[account.id] ?? {
        personal: account.monthlyContribution,
        employer: account.employerContribution,
      };
      const extra = extraAccount?.id === account.id ? extraMonthlyContribution : 0;
      const scaledPersonal = isScalableFireAccount(account) ? planned.personal * Math.max(0, fireContributionScale) : planned.personal;
      const personal = Math.max(0, scaledPersonal + extra);
      const employer = Math.max(0, planned.employer);
      if (account.type === 'Roth IRA') rothBasis += personal;
      if (account.type === 'After-tax 401(k)') afterTaxBases[account.id] += personal;
      balances[account.id] = (Math.max(0, balances[account.id]) + personal + employer) * (1 + monthlyRates[account.id]);
      if (account.fireEligible) {
        personalContributions += personal;
        employerContributions += employer;
      }
    }
  }
  return points;
};

export const findFireCrossing = (points: ProjectionPoint[]) =>
  points.find((point) => point.firePortfolio >= point.fireTarget) ?? null;

export const solveRequiredAdditionalContribution = (
  profile: Profile, accounts: Account[], phases: ContributionPhase[], maxMonthly = 100000,
) => {
  const reaches = (extra: number) => {
    const points = projectCore({ profile, accounts, phases, extraMonthlyContribution: extra, endAtTarget: true });
    const final = points[points.length - 1];
    return final.firePortfolio >= final.fireTarget;
  };
  if (reaches(0)) return 0;
  if (!reaches(maxMonthly)) return Infinity;
  let low = 0;
  let high = maxMonthly;
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    if (reaches(mid)) high = mid; else low = mid;
  }
  return high;
};

export const solveRequiredContributionScale = (
  profile: Profile, accounts: Account[], phases: ContributionPhase[], maxScale = 100,
) => {
  const reaches = (scale: number) => {
    const points = projectCore({ profile, accounts, phases, fireContributionScale: scale, endAtTarget: true });
    const final = points[points.length - 1];
    return final.firePortfolio >= final.fireTarget;
  };
  if (reaches(0)) return 0;
  let high = 1;
  while (high < maxScale && !reaches(high)) high *= 2;
  high = Math.min(high, maxScale);
  if (!reaches(high)) return Infinity;
  let low = 0;
  // 32 bisections are already far more precise than a cent at this range.
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    if (reaches(mid)) high = mid; else low = mid;
  }
  return high;
};

export const calculateCoastFire = (profile: Profile, accounts: Account[], phases: ContributionPhase[] = []) => {
  if (profile.currentAge >= 100 || profile.retirementAge >= 100 || profile.retirementAge < profile.currentAge) return null;
  const points = projectCore({
    profile: { ...profile, maxAge: 100 },
    accounts,
    phases,
    includeRetirement: true,
  });
  const ending = points.at(-1)!;
  return {
    reached: ending.cumulativeWithdrawalShortfall < 0.01
      && points.every((point) => point.projectionPhase !== 'retirement' || point.age >= 100 || point.firePortfolio > 0 || profile.annualSpending === 0)
      && ending.cumulativeConversionTax - ending.cumulativeConversionTaxPaid < 0.01,
    endingBalance: ending.firePortfolio,
  };
};

export const projectScenario = (data: AppData, scenario: Scenario): ScenarioResult => {
  const { profile, accounts, phases } = applyScenarioOverrides(data, scenario);
  const points = projectCore({ profile, accounts, phases, includeRetirement: true });
  const firePoint = findFireCrossing(points);
  const targetMonth = clamp(Math.round((profile.retirementAge - profile.currentAge) * 12), 0, points.length - 1);
  const targetPoint = points[targetMonth];
  const current = points[0];
  const activePhase = resolvePhase(phases, current.balances, profile.currentAge, current.date);
  const planningPhase = phases.find((phase) => phase.name.toLowerCase().includes('fire')) ?? activePhase;
  let plannedPersonalMonthly = 0;
  let plannedEmployerMonthly = 0;
  accounts.forEach((account) => {
    if (!account.fireEligible) return;
    const amount = planningPhase?.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution };
    plannedPersonalMonthly += amount.personal;
    plannedEmployerMonthly += amount.employer;
  });
  const requiredContributionScale = solveRequiredContributionScale(profile, accounts, phases);
  const requiredPlanningPersonal = accounts.reduce((sum, account) => {
    if (!account.fireEligible) return sum;
    const amount = planningPhase?.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution };
    return sum + (isScalableFireAccount(account) ? amount.personal * requiredContributionScale : amount.personal);
  }, 0);
  const requiredPersonalMonthly = Number.isFinite(requiredContributionScale) ? requiredPlanningPersonal : Infinity;
  const retirementPoints = points.filter((point) => point.projectionPhase === 'retirement');
  const endingPoint = points.at(-1)!;
  const depletionPoint = retirementPoints.find((point) => point.firePortfolio <= 0) ?? null;
  const retirementSummary = {
    startAge: profile.retirementAge,
    startDate: targetPoint.date,
    firstYearWithdrawal: targetPoint.monthlyWithdrawal * 12,
    balanceAtRetirement: targetPoint.firePortfolio,
    endingBalance: endingPoint.firePortfolio,
    lowestBalance: Math.min(...(retirementPoints.length ? retirementPoints : [targetPoint]).map((point) => point.firePortfolio)),
    totalWithdrawals: endingPoint.cumulativeWithdrawals,
    totalWithdrawalShortfall: endingPoint.cumulativeWithdrawalShortfall,
    depletionPoint,
  };
  return {
    scenario, profile, accounts, points, fireNumber: effectiveFireNumber(profile), firePoint, targetPoint,
    currentFirePortfolio: current.firePortfolio, currentNetWorth: current.netWorth, currentAccessible: current.accessible,
    plannedPersonalMonthly, plannedEmployerMonthly, requiredPersonalMonthly, requiredContributionScale,
    contributionGap: Number.isFinite(requiredPersonalMonthly) ? requiredPersonalMonthly - plannedPersonalMonthly : Infinity,
    retirementSummary,
    coastFire: calculateCoastFire(profile, accounts, phases),
  };
};

export const bridgeMetrics = (result: ScenarioResult) => {
  const point = result.firePoint ?? result.targetPoint;
  const years = Math.max(0, 59.5 - point.age);
  // Sum spending in the same dollar mode as the projected accessible balance.
  let need = 0;
  for (let month = 0; month < Math.ceil(years * 12); month += 1) {
    need += monthlyRetirementWithdrawal(result.profile, point.month + month)
      * Math.min(1, years * 12 - month);
  }
  return { startAge: point.age, years, need, accessible: point.accessible, usesTargetAge: !result.firePoint };
};

export const aggregateAccounts = (accounts: Account[]) => accounts.reduce((totals, account) => ({
  netWorth: totals.netWorth + (account.includeInNetWorth ? account.balance : 0),
  fire: totals.fire + (account.fireEligible ? account.balance : 0),
  personal: totals.personal + (account.fireEligible ? account.monthlyContribution : 0),
  employer: totals.employer + (account.fireEligible ? account.employerContribution : 0),
}), { netWorth: 0, fire: 0, personal: 0, employer: 0 });

export const emergencyFundMetrics = (cash: number, target: number, monthlySavings: number, normalSpend: number, jobLossSpend: number) => {
  const remaining = Math.max(0, target - cash);
  const monthsToTarget = remaining === 0 ? 0 : monthlySavings > 0 ? Math.ceil(remaining / monthlySavings) : Infinity;
  return {
    normalRunway: normalSpend > 0 ? cash / normalSpend : Infinity,
    jobLossRunway: jobLossSpend > 0 ? cash / jobLossSpend : Infinity,
    remaining, monthsToTarget,
  };
};

// Personal contributions to non-payroll accounts are funded from deposited
// take-home.  401(k) contributions are withheld before the deposited amount
// reaches the user's bank account, so they are intentionally excluded.
export const isTakeHomeBudgetAccount = (account: Account) => !account.type.includes('401(k)');

export const scenarioBudgetAmount = (scenario: Scenario, phaseId: string, item: AppData['budget'][number]) =>
  scenario.overrides.phaseBudgetAmounts?.[phaseId]?.[item.id]
    ?? scenario.overrides.budgetAmounts?.[item.id]
    ?? item.amount;

export const scenarioBudgetMetrics = (data: AppData, scenario: Scenario, fireContributionScale = 1, phaseId?: string): ScenarioBudgetMetrics => {
  const { profile, accounts, phases } = applyScenarioOverrides(data, scenario);
  const balances = Object.fromEntries(accounts.map((account) => [account.id, account.balance]));
  const activePhase = resolvePhase(phases, balances, profile.currentAge, new Date().toISOString().slice(0, 10));
  const phase = phases.find((item) => item.id === phaseId) ?? activePhase;
  const rows = accounts.map((account) => {
    const amount = phase?.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution };
    const personal = isScalableFireAccount(account) ? amount.personal * Math.max(0, fireContributionScale) : amount.personal;
    return { account, personal, employer: amount.employer, isPayroll: account.type.includes('401(k)') };
  });
  const budgetAmount = (item: AppData['budget'][number]) => scenarioBudgetAmount(scenario, phase.id, item);
  const needs = data.budget.filter((item) => item.category === 'Needs').reduce((sum, item) => sum + budgetAmount(item), 0);
  const wants = data.budget.filter((item) => item.category === 'Wants').reduce((sum, item) => sum + budgetAmount(item), 0);
  const includedRows = rows.filter((row) => row.account.includeInNetWorth);
  const personalWealth = includedRows.reduce((sum, row) => sum + row.personal, 0);
  const employerWealth = includedRows.reduce((sum, row) => sum + row.employer, 0);
  const payrollPersonal = includedRows.filter((row) => row.isPayroll).reduce((sum, row) => sum + row.personal, 0);
  const fireInvesting = rows.filter((row) => row.account.fireEligible).reduce((sum, row) => sum + row.personal + row.employer, 0);
  const cashSavings = rows.filter((row) => row.account.type === 'HYSA / Cash').reduce((sum, row) => sum + row.personal, 0);
  // Deposited take-home is the user's stated cash available. Payroll retirement is
  // shown separately and never deducted from it a second time.
  const takeHomeIncome = phase?.takeHomeIncome ?? data.profile.netMonthlyIncome;
  const incomeBasis = takeHomeIncome + payrollPersonal;
  // Personal contributions to non-payroll accounts are funded from take-home
  // in every contribution phase. Payroll contributions are already withheld
  // and must not be deducted twice.
  const takeHomeContributions = rows
    .filter((row) => isTakeHomeBudgetAccount(row.account))
    .reduce((sum, row) => sum + row.personal, 0);
  const remaining = takeHomeIncome - needs - wants - takeHomeContributions;
  return { phase, rows, needs, wants, personalWealth, employerWealth, fireInvesting, cashSavings, payrollPersonal, takeHomeContributions, takeHomeIncome, incomeBasis, remaining };
};

export const allocationByClass = (accounts: Account[]) => {
  const totals: Record<string, number> = {};
  accounts.flatMap((account) => account.holdings).forEach((holding) => {
    totals[holding.assetClass] = (totals[holding.assetClass] ?? 0) + holding.value;
  });
  return Object.entries(totals).map(([name, value]) => ({ name, value }));
};

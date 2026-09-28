import type {
  Account, AppData, ContributionAmount, ContributionPhase, Profile, ProjectionPoint,
  Scenario, ScenarioBudgetMetrics, ScenarioResult, RothConversionLot, RothTransferResult, CoastFireResult, RetirementFunding, RetirementBridge,
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
  contributionsStopMonth?: number;
  endMonth?: number;
  onlyFinalPoint?: boolean;
  enforceAccess?: boolean;
  stopOnFundingGap?: boolean;
}

export const isScalableFireAccount = (account: Account) => account.fireEligible && account.type !== 'HYSA / Cash';

const monthlyRetirementWithdrawal = (profile: Profile, month: number) => {
  const inflationFactor = profile.mode === 'nominal'
    ? Math.pow(1 + Math.max(-0.999999, profile.inflationRate), month / 12)
    : 1;
  return Math.max(0, safe(profile.annualSpending)) / 12 * inflationFactor;
};

const withdrawalCapacities = (accounts: Account[], balances: Record<string, number>, age: number, rothAccessibleBasis: number, enforceAccess = true) => {
  const capacities: Record<string, number> = {};
  const rothBalance = accounts.reduce((sum, account) => sum + (account.fireEligible && account.type === 'Roth IRA' ? Math.max(0, balances[account.id] ?? 0) : 0), 0);
  const rothAvailable = Math.min(rothBalance, Math.max(0, rothAccessibleBasis));
  for (const account of accounts) {
    const balance = Math.max(0, balances[account.id] ?? 0);
    let capacity = 0;
    if (account.fireEligible) {
      if (!enforceAccess) capacity = balance;
      else if (account.type === 'Roth IRA') capacity = age >= 59.5 ? balance : rothBalance > 0 ? balance / rothBalance * rothAvailable : 0;
      else if (account.type.includes('401(k)') || account.type === 'Traditional IRA') capacity = age >= 59.5 ? balance : 0;
      // General HSA spending is modeled from 65; medical-receipt exceptions
      // are not assumed, and ordinary income tax is outside this projection.
      else if (account.type === 'HSA') capacity = age >= 65 ? balance : 0;
      else if (account.accessibility === 'Immediate') capacity = balance;
    }
    capacities[account.id] = capacity;
  }
  return capacities;
};

const withdrawFromFirePortfolio = (accounts: Account[], balances: Record<string, number>, requested: number, age: number, rothAccessibleBasis: number, enforceAccess: boolean) => {
  const capacities = withdrawalCapacities(accounts, balances, age, rothAccessibleBasis, enforceAccess);
  let remaining = Math.max(0, requested);
  // Preserve Roth basis until liquid funds are exhausted during the bridge.
  const groups = enforceAccess && age < 59.5
    ? [accounts.filter((account) => account.type !== 'Roth IRA'), accounts.filter((account) => account.type === 'Roth IRA')]
    : [accounts];
  for (const group of groups) {
    const available = group.reduce((sum, account) => sum + capacities[account.id], 0);
    const amount = Math.min(remaining, available);
    if (amount > 0) for (const account of group) {
      balances[account.id] = Math.max(0, balances[account.id] - amount * capacities[account.id] / available);
    }
    remaining -= amount;
  }
  const remainingPortfolio = accounts.reduce((sum, account) => sum + (account.fireEligible ? balances[account.id] : 0), 0);
  return { actual: Math.max(0, requested) - remaining, shortfall: remaining,
    accessShortfall: enforceAccess ? Math.min(remaining, remainingPortfolio) : 0 };
};

export const projectCore = ({ profile, accounts, phases, extraMonthlyContribution = 0, fireContributionScale = 1, endAtTarget = false, includeRetirement = false, contributionsStopMonth = Infinity, endMonth, onlyFinalPoint = false, enforceAccess = true, stopOnFundingGap = false }: CoreProjection) => {
  const maxAge = endAtTarget ? profile.retirementAge : profile.maxAge;
  const totalMonths = endMonth ?? Math.max(0, Math.ceil((maxAge - profile.currentAge) * 12));
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
  let cumulativeAccessShortfall = 0;
  let cumulativeBridgeNeed = 0;
  let cumulativeBridgeWithdrawals = 0;
  let cumulativeBridgeShortfall = 0;
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
    const inRetirement = includeRetirement && month >= retirementStartMonth;
    const monthlyWithdrawal = inRetirement ? monthlyRetirementWithdrawal(profile, month) : 0;
    const fundingGap = stopOnFundingGap && (cumulativeWithdrawalShortfall >= 0.01 || cumulativeConversionTax - cumulativeConversionTaxPaid >= 0.01);
    if (!onlyFinalPoint || month === totalMonths || fundingGap) {
      const rothAccessibleBasis = rothBasis + accessibleConversionBasis(conversionLots, year, age);
      const totals = totalsFor(accounts, balances, rothAccessibleBasis);
      const fireTarget = profile.mode === 'nominal' ? baseFireNumber * Math.pow(1 + profile.inflationRate, month / 12) : baseFireNumber;
      points.push({
        month, age, date, fireTarget, ...totals, balances: { ...balances }, phaseName: inRetirement ? 'Retirement drawdown' : month >= contributionsStopMonth ? 'Coasting · no new contributions' : phase?.name ?? 'Base contributions',
        startingPrincipal, personalContributions, employerContributions,
        investmentGrowth: totals.firePortfolio - startingPrincipal - personalContributions - employerContributions + cumulativeWithdrawals - fireTransferAdjustment,
        projectionPhase: inRetirement ? 'retirement' : 'accumulation',
        monthlyWithdrawal,
        cumulativeWithdrawals,
        cumulativeWithdrawalShortfall,
        cumulativeAccessShortfall, cumulativeBridgeNeed, cumulativeBridgeWithdrawals, cumulativeBridgeShortfall,
        spendable: Object.values(withdrawalCapacities(accounts, balances, age, rothAccessibleBasis)).reduce((sum, value) => sum + value, 0),
        rothAccessibleBasis, cumulativeConversionTax, cumulativeConversionTaxPaid, rothTransfers,
        afterTaxBases: { ...afterTaxBases },
      });
    }
    if (month === totalMonths || fundingGap) break;

    if (inRetirement) {
      const withdraw = (requested: number, withdrawalAge: number) => {
        const balancesBefore = { ...balances };
        const rothBefore = accounts.filter((account) => account.type === 'Roth IRA').reduce((sum, account) => sum + balances[account.id], 0);
        const basis = rothBasis + accessibleConversionBasis(conversionLots, year, withdrawalAge);
        const withdrawal = withdrawFromFirePortfolio(accounts, balances, requested, withdrawalAge, basis, enforceAccess);
        const rothAfter = accounts.filter((account) => account.type === 'Roth IRA').reduce((sum, account) => sum + balances[account.id], 0);
        for (const id of Object.keys(afterTaxBases)) {
          if (balancesBefore[id] > 0) afterTaxBases[id] *= balances[id] / balancesBefore[id];
        }
        rothBasis = consumeRothBasis(rothBasis, conversionLots, Math.max(0, rothBefore - rothAfter));
        cumulativeWithdrawals += withdrawal.actual;
        cumulativeWithdrawalShortfall += withdrawal.shortfall;
        cumulativeAccessShortfall += withdrawal.accessShortfall;
        return withdrawal;
      };
      // Prorate the final bridge month when age 59½ falls inside it.
      const bridgeFraction = clamp((59.5 - age) * 12, 0, 1);
      if (bridgeFraction > 0) {
        const bridgeWithdrawal = withdraw(monthlyWithdrawal * bridgeFraction, age);
        cumulativeBridgeNeed += monthlyWithdrawal * bridgeFraction;
        cumulativeBridgeWithdrawals += bridgeWithdrawal.actual;
        cumulativeBridgeShortfall += bridgeWithdrawal.shortfall;
      }
      if (bridgeFraction < 1) withdraw(monthlyWithdrawal * (1 - bridgeFraction), Math.max(age, 59.5));
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
      const personal = month >= contributionsStopMonth ? 0 : Math.max(0, scaledPersonal + extra);
      const employer = month >= contributionsStopMonth ? 0 : Math.max(0, planned.employer);
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

export const calculateCoastFire = (profile: Profile, accounts: Account[], phases: ContributionPhase[] = [], plannedPoints?: ProjectionPoint[]): CoastFireResult | null => {
  const retirementMonth = Math.round((profile.retirementAge - profile.currentAge) * 12);
  const goal = effectiveFireNumber(profile);
  if (profile.currentAge <= 0 || retirementMonth <= 0 || !Number.isFinite(goal) || goal <= 0) return null;
  const points = plannedPoints ?? projectCore({ profile, accounts, phases, endAtTarget: true, endMonth: retirementMonth });
  const retirementTarget = points[retirementMonth].fireTarget;
  const fundingProfile = { ...profile, maxAge: Math.max(100, profile.maxAge, profile.retirementAge) };
  let targetFundingGap: CoastFireResult['targetFundingGap'] = null;
  const eligible = accounts.filter((account) => account.fireEligible);
  const monthlyFactors = eligible.map((account) => 1 + annualToMonthlyRate(annualReturnFor(account, profile)));
  // Screen target growth first, then check accessible spending and scheduled
  // taxes through the full horizon. Scan months without assuming monotonicity.
  const hasTransfers = Boolean(profile.rothTransfers?.some((transfer) => transfer.age >= profile.currentAge && transfer.age <= profile.retirementAge && !rothTransferError(transfer, accounts)));
  for (let month = 0; month < retirementMonth; month += 1) {
    if (month > 0) {
      const previous = points[month - 1];
      const phase = resolvePhase(phases, previous.balances, previous.age, previous.date);
      // Delaying the stop across a month with no additions changes nothing.
      if (!accounts.some((account) => {
        const contribution = phase?.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution };
        return contribution.personal > 0 || contribution.employer > 0;
      })) continue;
    }
    let balance: number;
    let unpaidTax = 0;
    if (hasTransfers) {
      // Replay transfers, basis, caps, and tax funding with contributions stopped.
      // Keep only the endpoint instead of allocating a second full chart per candidate.
      const ending = projectCore({ profile, accounts, phases, endAtTarget: true, endMonth: retirementMonth, contributionsStopMonth: month, onlyFinalPoint: true })[0];
      balance = ending.firePortfolio;
      unpaidTax = ending.cumulativeConversionTax - ending.cumulativeConversionTaxPaid;
    } else {
      balance = eligible.reduce((sum, account, index) => sum + Math.max(0, points[month].balances[account.id] ?? 0) * Math.pow(monthlyFactors[index], retirementMonth - month), 0);
    }
    if (!Number.isFinite(balance) || balance + 0.000001 < retirementTarget) continue;
    if (unpaidTax >= 0.01) {
      targetFundingGap ??= 'conversion-tax';
      continue;
    }
    // Failed candidates only need an endpoint, and stop as soon as a gap
    // occurs. Later growth or account unlocks cannot repair unpaid spending.
    const ending = projectCore({ profile: fundingProfile, accounts, phases, includeRetirement: true,
      contributionsStopMonth: month, onlyFinalPoint: true, stopOnFundingGap: true })[0];
    if (ending.cumulativeWithdrawalShortfall >= 0.01) {
      targetFundingGap ??= 'spending';
      continue;
    }
    if (ending.cumulativeConversionTax - ending.cumulativeConversionTaxPaid >= 0.01) {
      targetFundingGap ??= 'conversion-tax';
      continue;
    }
    // Keep the accepted path so the card and chart share the same projection.
    const coastPoints = projectCore({ profile: fundingProfile, accounts, phases, includeRetirement: true, contributionsStopMonth: month });
    const funding = calculateRetirementFunding(profile, accounts, phases, coastPoints);
    if (funding.balanceAtRetirement + 0.000001 < retirementTarget) continue;
    const bridge = calculateRetirementBridge(profile, funding);
    if (!funding.funded || !bridge.funded) {
      targetFundingGap ??= funding.totalWithdrawalShortfall > 0 ? 'spending' : 'conversion-tax';
      continue;
    }
    return { reached: month === 0, eligibilityPoint: points[month], retirementTarget,
      balanceAtRetirement: funding.balanceAtRetirement, funding, targetFundingGap: null };
  }
  return { reached: false, eligibilityPoint: null, retirementTarget, balanceAtRetirement: null, funding: null, targetFundingGap };
};

export const summarizeRetirement = (profile: Profile, points: ProjectionPoint[]) => {
  const retirementPoints = points.filter((point) => point.projectionPhase === 'retirement');
  const target = points[clamp(Math.round((profile.retirementAge - profile.currentAge) * 12), 0, points.length - 1)];
  const ending = points.at(-1)!;
  return {
    startAge: profile.retirementAge, startDate: target.date,
    firstYearWithdrawal: target.monthlyWithdrawal * 12,
    balanceAtRetirement: target.firePortfolio, endingBalance: ending.firePortfolio,
    lowestBalance: Math.min(...(retirementPoints.length ? retirementPoints : [target]).map((point) => point.firePortfolio)),
    totalWithdrawals: ending.cumulativeWithdrawals, totalWithdrawalShortfall: ending.cumulativeWithdrawalShortfall,
    depletionPoint: retirementPoints.find((point) => point.firePortfolio <= 0) ?? null,
  };
};

export const calculateRetirementFunding = (profile: Profile, accounts: Account[], phases: ContributionPhase[] = [], plannedPoints?: ProjectionPoint[], enforceAccess = true): RetirementFunding => {
  const horizonAge = Math.max(100, profile.maxAge, profile.retirementAge);
  const points = plannedPoints ?? projectCore({ profile: { ...profile, maxAge: horizonAge }, accounts, phases, includeRetirement: true, enforceAccess });
  const ending = points.at(-1)!;
  const summary = summarizeRetirement(profile, points);
  const firstShortfallIndex = points.findIndex((point) => point.cumulativeWithdrawalShortfall >= 0.01);
  // Each point records the previous month's withdrawal. Report the age when
  // spending actually went unpaid, not the following month's chart balance.
  const firstUnfundedAge = firstShortfallIndex < 0 ? null : points[Math.max(0, firstShortfallIndex - 1)].age;
  const firstAccessIndex = points.findIndex((point) => point.cumulativeAccessShortfall >= 0.01);
  const firstAccessGapAge = firstAccessIndex < 0 ? null : points[Math.max(0, firstAccessIndex - 1)].age;
  const unpaidConversionTax = Math.max(0, ending.cumulativeConversionTax - ending.cumulativeConversionTaxPaid);
  const retirementMonth = Math.round((profile.retirementAge - profile.currentAge) * 12);
  const retirementPoint = points[clamp(retirementMonth, 0, points.length - 1)];
  const laterFirePoint = retirementPoint.firePortfolio >= retirementPoint.fireTarget ? null : points.find((point) => point.month > retirementMonth && point.projectionPhase === 'retirement' && point.firePortfolio >= point.fireTarget && point.cumulativeWithdrawalShortfall < 0.01) ?? null;
  return { ...summary, horizonAge, points, firstUnfundedAge, firstAccessGapAge, unpaidConversionTax, laterFirePoint,
    funded: ending.cumulativeWithdrawalShortfall < 0.01 && unpaidConversionTax < 0.01 };
};

export const calculateRetirementBridge = (profile: Profile, funding: RetirementFunding): RetirementBridge => {
  const points = funding.points;
  const retirementMonth = clamp(Math.round((profile.retirementAge - profile.currentAge) * 12), 0, points.length - 1);
  const retirement = points[retirementMonth];
  const ending = points.at(-1)!;
  const bridgeTransfers = points.filter((point) => point.month >= retirementMonth && point.age < 59.5)
    .flatMap((point) => point.rothTransfers.map((transfer) => ({ ...transfer, age: point.age })));
  const conversionTax = bridgeTransfers.reduce((sum, transfer) => sum + transfer.tax, 0);
  const taxPaid = bridgeTransfers.reduce((sum, transfer) => sum + transfer.taxPaid, 0);
  const shortfall = ending.cumulativeBridgeShortfall + Math.max(0, conversionTax - taxPaid);
  let unpaidBridgeTax = 0;
  let firstGapAge: number | null = null;
  for (let index = retirementMonth; index < points.length; index += 1) {
    const point = points[index];
    if (firstGapAge == null && point.cumulativeBridgeShortfall + unpaidBridgeTax >= 0.01) firstGapAge = points[Math.max(0, index - 1)].age;
    if (point.age < 59.5) unpaidBridgeTax += point.rothTransfers.reduce((sum, transfer) => sum + Math.max(0, transfer.tax - transfer.taxPaid), 0);
    if (firstGapAge == null && point.cumulativeBridgeShortfall + unpaidBridgeTax >= 0.01) firstGapAge = point.age;
  }
  return { startAge: retirement.age, years: Math.max(0, 59.5 - retirement.age),
    need: ending.cumulativeBridgeNeed + conversionTax, accessible: retirement.spendable,
    fundedAmount: ending.cumulativeBridgeWithdrawals + taxPaid, shortfall, conversionTax,
    firstGapAge, funded: shortfall < 0.01 };
};

export const projectScenario = (data: AppData, scenario: Scenario): ScenarioResult => {
  const { profile, accounts, phases } = applyScenarioOverrides(data, scenario);
  const funding = calculateRetirementFunding(profile, accounts, phases);
  // Only replay the unrestricted portfolio when an access gap needs explanation.
  const portfolioFunding = funding.firstAccessGapAge == null ? funding
    : calculateRetirementFunding(profile, accounts, phases, undefined, false);
  const points = profile.maxAge >= funding.horizonAge ? funding.points : funding.points.slice(0, Math.max(0, Math.ceil((profile.maxAge - profile.currentAge) * 12)) + 1);
  const firePoint = findFireCrossing(points);
  const targetMonth = clamp(Math.round((profile.retirementAge - profile.currentAge) * 12), 0, funding.points.length - 1);
  const targetPoint = funding.points[targetMonth];
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
  const retirementSummary = summarizeRetirement(profile, points);
  return {
    scenario, profile, accounts, phases, points, fireNumber: effectiveFireNumber(profile), firePoint, targetPoint,
    currentFirePortfolio: current.firePortfolio, currentNetWorth: current.netWorth, currentAccessible: current.accessible,
    plannedPersonalMonthly, plannedEmployerMonthly, requiredPersonalMonthly, requiredContributionScale,
    contributionGap: Number.isFinite(requiredPersonalMonthly) ? requiredPersonalMonthly - plannedPersonalMonthly : Infinity,
    retirementSummary,
    retirementFunding: funding,
    portfolioFunding,
    bridge: calculateRetirementBridge(profile, funding),
    coastFire: calculateCoastFire(profile, accounts, phases, funding.points),
  };
};

export const bridgeMetrics = (result: ScenarioResult) => result.bridge;

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

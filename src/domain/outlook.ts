import type { RetirementFunding, ScenarioResult } from './types';

export const retirementReady = (result: ScenarioResult) => result.retirementFunding.funded && result.bridge.funded;

// Points record the previous month's withdrawal. End the funded path at the
// start of the first month whose planned spending cannot be fully paid.
export const spendingGapPoint = (funding: RetirementFunding) => {
  const index = funding.points.findIndex((point) => point.cumulativeWithdrawalShortfall >= 0.01);
  return index < 0 ? null : funding.points[Math.max(0, index - 1)];
};

export const fundedTargetCrossing = (result: ScenarioResult) => {
  const gap = spendingGapPoint(result.retirementFunding);
  return result.firePoint && (!gap || result.firePoint.month < gap.month) ? result.firePoint : null;
};

export const retirementHeadline = (result: ScenarioResult) => {
  if (retirementReady(result)) return 'Your plan is projected to cover retirement.';
  const funding = result.retirementFunding;
  if (funding.firstAccessGapAge != null && funding.firstAccessGapAge === funding.firstUnfundedAge) return 'Your plan needs more accessible money.';
  if (funding.firstUnfundedAge != null) return 'Your plan needs more retirement money.';
  return 'Your plan needs money for conversion taxes.';
};

export const retirementFundingMessage = (result: ScenarioResult) => {
  const funding = result.retirementFunding;
  if (funding.firstAccessGapAge != null && (funding.firstUnfundedAge == null || funding.firstAccessGapAge <= funding.firstUnfundedAge)) {
    const gapAge = funding.firstAccessGapAge.toFixed(1);
    return result.portfolioFunding.funded
      ? `Your investments are projected to last, but money available for living expenses falls short at age ${gapAge}.`
      : `Money available for living expenses falls short at age ${gapAge}. Some investments cannot yet be used under the account rules in this projection.`;
  }
  if (funding.firstUnfundedAge != null) return `Projected spending runs out of money at age ${funding.firstUnfundedAge.toFixed(1)}.`;
  if (funding.unpaidConversionTax >= 0.01) return 'Projected spending is covered, but scheduled Roth conversion taxes are not fully funded.';
  if (result.targetPoint.firePortfolio < result.targetPoint.fireTarget) {
    if (funding.laterFirePoint) return `Below your FIRE Target, but projected to reach your FIRE target at age ${funding.laterFirePoint.age.toFixed(1)} while withdrawing.`;
    return `Below your FIRE target, but your projected portfolio funds retirement through age ${funding.horizonAge}.`;
  }
  return `Your projected portfolio funds retirement through age ${funding.horizonAge}.`;
};

export const retirementFundingStatus = (result: ScenarioResult) => {
  const funding = result.retirementFunding;
  if (retirementReady(result)) return `Spending covered through age ${funding.horizonAge}`;
  if (funding.firstUnfundedAge != null) return `Spending gap at age ${funding.firstUnfundedAge.toFixed(1)}`;
  if (!result.bridge.funded) return `Tax funding gap at age ${result.bridge.firstGapAge?.toFixed(1) ?? result.bridge.startAge.toFixed(1)}`;
  return 'Conversion taxes need funding';
};

export const coastFireMessage = (result: ScenarioResult) => {
  const coast = result.coastFire;
  if (!coast) return 'Set a future retirement age and a positive FIRE target to calculate Coast FIRE.';
  if (coast.eligibilityPoint) return `You could stop adding to retirement savings ${coast.reached ? 'now' : `at age ${coast.eligibilityPoint.age.toFixed(1)}`}, provided income covers your living expenses until retirement at age ${result.profile.retirementAge.toFixed(1)}. The Coast path reaches your FIRE target by retirement and covers projected retirement spending through age ${coast.funding!.horizonAge}, including the early retirement bridge and scheduled conversion taxes.`;
  if (coast.targetFundingGap === 'spending') return 'Keep investing: the Coast path has a retirement spending gap.';
  if (coast.targetFundingGap === 'conversion-tax') return 'Keep investing: the Coast path cannot fully cover scheduled conversion taxes.';
  return 'Coast FIRE isn’t reached before your planned retirement age.';
};

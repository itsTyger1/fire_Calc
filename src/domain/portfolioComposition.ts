import type { ScenarioResult } from './types';

export type PortfolioSource = 'Starting principal' | 'Personal contributions' | 'Employer contributions' | 'Investment growth' | 'Transfers into FIRE';

export interface PortfolioSlice {
  name: PortfolioSource;
  value: number;
  percentage: number;
}

export const retirementPortfolioComposition = (result: ScenarioResult) => {
  // Use the retirement snapshot before spending withdrawals. Lifetime earnings
  // at a later FIRE crossing can include money that has already been spent.
  const point = result.targetPoint;
  const total = Math.max(0, point.firePortfolio);
  // Growth excludes transfers and conversion taxes; account for their net
  // effect separately rather than presenting transferred money as earnings.
  const transferChange = total - point.startingPrincipal - point.personalContributions
    - point.employerContributions - point.investmentGrowth + point.cumulativeWithdrawals;
  const sources: Array<{ name: PortfolioSource; value: number }> = [
    { name: 'Starting principal', value: Math.max(0, point.startingPrincipal) },
    { name: 'Personal contributions', value: Math.max(0, point.personalContributions) },
    { name: 'Employer contributions', value: Math.max(0, point.employerContributions) },
    { name: 'Investment growth', value: Math.max(0, point.investmentGrowth) },
  ];
  if (transferChange >= 0.005 || (transferChange > 0 && sources.every((source) => source.value === 0))) {
    sources.push({ name: 'Transfers into FIRE', value: transferChange });
  }
  const sourceTotal = sources.reduce((sum, source) => sum + source.value, 0);
  // A pie cannot represent negative losses or money taken out. Attribute any
  // deductions proportionally to the positive sources of the remaining money.
  const scale = sourceTotal > 0 ? total / sourceTotal : 0;
  const tenths = sources.map((source) => sourceTotal > 0 && total > 0 ? source.value / sourceTotal * 1000 : 0);
  const rounded = tenths.map(Math.floor);
  const remainderOrder = tenths.map((value, index) => ({ index, remainder: value - rounded[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remainingTenths = total > 0 && sourceTotal > 0 ? 1000 - rounded.reduce((sum, value) => sum + value, 0) : 0;
  for (let index = 0; index < remainingTenths; index += 1) rounded[remainderOrder[index].index] += 1;
  const slices: PortfolioSlice[] = sources.map((source, index) => ({
    ...source, value: source.value * scale, percentage: rounded[index] / 10,
  }));
  return { total, slices, hasDeductions: sourceTotal - total >= 0.005 };
};

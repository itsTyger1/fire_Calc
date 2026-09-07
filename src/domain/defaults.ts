import type { Account, AppData, AssetClass, ContributionPhase, Scenario } from './types';

const holding = (id: string, symbol: string, value: number, assetClass: AssetClass) => ({ id, symbol, value, assetClass });

export const defaultAccounts: Account[] = [
  { id: 'r401k', name: 'Roth 401(k)', type: 'Roth 401(k)', balance: 180000, monthlyContribution: 450, employerContribution: 733, fireEligible: true, includeInNetWorth: true, taxTreatment: 'Roth', accessibility: 'Restricted', notes: 'S&P 500 index fund', holdings: [holding('sp500', 'S&P 500 index fund', 180000, 'Broad US equity')] },
  { id: 'roth-ira', name: 'Roth IRA', type: 'Roth IRA', balance: 14000, monthlyContribution: 625, employerContribution: 0, fireEligible: true, includeInNetWorth: true, taxTreatment: 'Roth', accessibility: 'Potential', notes: 'Regular contributions may be accessible; earnings have restrictions.', holdings: [holding('ibit-r', 'IBIT', 8500, 'Bitcoin / Crypto'), holding('swppx', 'SWPPX', 5400, 'Broad US equity')] },
  { id: 'trad-ira', name: 'Traditional IRA', type: 'Traditional IRA', balance: 2700, monthlyContribution: 0, employerContribution: 0, fireEligible: true, includeInNetWorth: true, taxTreatment: 'Traditional', accessibility: 'Restricted', notes: '', holdings: [holding('ibit-t', 'IBIT', 2700, 'Bitcoin / Crypto'), holding('meta-t', 'META', 11, 'Individual stock')] },
  { id: 'taxable', name: 'Taxable Brokerage', type: 'Taxable Brokerage', balance: 2900, monthlyContribution: 0, employerContribution: 0, fireEligible: true, includeInNetWorth: true, taxTreatment: 'Taxable', accessibility: 'Immediate', notes: '', holdings: [holding('orcl', 'ORCL', 424, 'Individual stock'), holding('glw', 'GLW', 313, 'Individual stock'), holding('mu', 'MU', 514, 'Individual stock'), holding('nvda', 'NVDA', 477, 'Individual stock'), holding('msft', 'MSFT', 1172, 'Individual stock')] },
  { id: 'hysa', name: 'HYSA / Cash', type: 'HYSA / Cash', balance: 45600, monthlyContribution: 2100, employerContribution: 0, annualReturn: 0.033, fireEligible: false, includeInNetWorth: true, taxTreatment: 'Cash', accessibility: 'Immediate', notes: 'Emergency fund', holdings: [holding('cash', 'Cash', 45600, 'Cash')] },
  { id: 'crypto', name: 'Other Crypto', type: 'Crypto', balance: 20000, monthlyContribution: 0, employerContribution: 0, returnMode: 'plan', fireEligible: false, includeInNetWorth: true, taxTreatment: 'Other', accessibility: 'Immediate', notes: 'Uses the selected scenario return unless a custom return is chosen.', holdings: [holding('other-crypto', 'Other crypto', 20000, 'Bitcoin / Crypto')] },
];

const contributions = (entries: Array<[string, number, number?]>) => Object.fromEntries(entries.map(([id, personal, employer = 0]) => [id, { personal, employer }]));

export const defaultPhases: ContributionPhase[] = [
  { id: 'phase-emergency', name: 'Emergency fund build', startsWhen: { kind: 'always' }, contributions: contributions([['hysa', 2100], ['roth-ira', 625], ['r401k', 450, 733], ['taxable', 0], ['trad-ira', 0], ['crypto', 0]]) },
  { id: 'phase-fire', name: 'FIRE investing', startsWhen: { kind: 'cashTarget', accountId: 'hysa', amount: 60000 }, contributions: contributions([['hysa', 250], ['roth-ira', 625], ['r401k', 800, 733], ['taxable', 850], ['trad-ira', 0], ['crypto', 0]]) },
];

const colors = ['#37d39a', '#f4b860', '#65a7ff', '#ad7bff', '#ff718d', '#40c7d9', '#e69245', '#93c95b'];
const scenario = (id: string, name: string, color: string, overrides: Scenario['overrides']): Scenario => ({ id, name, color, visible: true, overrides });

export const defaultData: AppData = {
  version: 1,
  profile: {
    name: 'FIRE at 50 – Base Plan', currentAge: 30, retirementAge: 50, annualSpending: 52500,
    withdrawalRate: 0.035, customFireNumber: null, realReturn: 0.05, nominalReturn: 0.07625,
    inflationRate: 0.025, mode: 'real', maxAge: 100, rothContributionBasis: 10000,
    emergencyTarget: 60000, normalMonthlySpending: 3853, jobLossMonthlySpending: 2800,
    grossMonthlyIncome: 8500, netMonthlyIncome: 6100, payrollRetirement: 450,
    budgetTargets: { needs: 0.4, wants: 0.2, wealth: 0.4 },
  },
  accounts: defaultAccounts,
  phases: defaultPhases,
  scenarios: [
    scenario('base', 'Base FIRE at 50', colors[0], {}),
    scenario('conservative', 'Conservative returns', colors[1], { realReturn: 0.04 }),
  ],
  budget: [
    { id: 'housing', name: 'Housing', category: 'Needs', amount: 1935 },
    { id: 'transport', name: 'Transportation', category: 'Needs', amount: 203 },
    { id: 'groceries', name: 'Groceries', category: 'Needs', amount: 400 },
    { id: 'restaurants', name: 'Restaurants', category: 'Wants', amount: 200 },
    { id: 'subscriptions', name: 'Subscriptions', category: 'Wants', amount: 115 },
    { id: 'fun', name: 'Fun / discretionary', category: 'Wants', amount: 1000 },
  ],
};

export const scenarioColors = colors;

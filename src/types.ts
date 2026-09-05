export type ProjectionMode = 'real' | 'nominal';
export type TaxTreatment = 'Roth' | 'Traditional' | 'Taxable' | 'Cash' | 'Other';
export type Accessibility = 'Immediate' | 'Potential' | 'Restricted';
export type AccountType =
  | 'Roth 401(k)' | 'Traditional 401(k)' | 'Roth IRA' | 'Traditional IRA'
  | 'Taxable Brokerage' | 'HYSA / Cash' | 'Treasury / Bonds' | 'Crypto' | 'HSA' | 'Other';
export type AssetClass = 'Broad US equity' | 'International equity' | 'Bonds' | 'Cash' | 'Bitcoin / Crypto' | 'Individual stock' | 'Other';

export interface Holding { id: string; symbol: string; value: number; assetClass: AssetClass }

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  monthlyContribution: number;
  employerContribution: number;
  annualReturn?: number;
  returnMode?: 'plan' | 'custom';
  fireEligible: boolean;
  includeInNetWorth: boolean;
  taxTreatment: TaxTreatment;
  accessibility: Accessibility;
  notes: string;
  holdings: Holding[];
}

export type PhaseTrigger =
  | { kind: 'always' }
  | { kind: 'cashTarget'; accountId: string; amount: number }
  | { kind: 'age'; age: number }
  | { kind: 'date'; date: string };

export interface ContributionAmount { personal: number; employer: number }
export interface ContributionPhase {
  id: string;
  name: string;
  startsWhen: PhaseTrigger;
  contributions: Record<string, ContributionAmount>;
}

export interface BudgetItem { id: string; name: string; category: 'Needs' | 'Wants'; amount: number }

export interface Profile {
  name: string;
  currentAge: number;
  retirementAge: number;
  annualSpending: number;
  withdrawalRate: number;
  customFireNumber: number | null;
  realReturn: number;
  nominalReturn: number;
  inflationRate: number;
  mode: ProjectionMode;
  maxAge: number;
  rothContributionBasis: number;
  emergencyTarget: number;
  normalMonthlySpending: number;
  jobLossMonthlySpending: number;
  grossMonthlyIncome: number;
  netMonthlyIncome: number;
  payrollRetirement: number;
  budgetTargets: { needs: number; wants: number; wealth: number };
}

export interface ScenarioOverrides {
  currentAge?: number;
  retirementAge?: number;
  annualSpending?: number;
  withdrawalRate?: number;
  customFireNumber?: number | null;
  realReturn?: number;
  nominalReturn?: number;
  inflationRate?: number;
  cashTarget?: number;
  contributionScale?: number;
  accountBalances?: Record<string, number>;
  contributions?: Record<string, Partial<ContributionAmount>>;
  phaseContributions?: Record<string, Record<string, Partial<ContributionAmount>>>;
  budgetAmounts?: Record<string, number>;
  accountReturns?: Record<string, number | undefined>;
  includeCashInFire?: boolean;
  includeCryptoInFire?: boolean;
}

export interface ScenarioBudgetMetrics {
  phase: ContributionPhase;
  rows: Array<{ account: Account; personal: number; employer: number; isPayroll: boolean }>;
  needs: number;
  wants: number;
  personalWealth: number;
  employerWealth: number;
  fireInvesting: number;
  cashSavings: number;
  payrollPersonal: number;
  takeHomeContributions: number;
  takeHomeIncome: number;
  incomeBasis: number;
  remaining: number;
}

export interface Scenario {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  overrides: ScenarioOverrides;
}

export interface AppData {
  version: 1;
  profile: Profile;
  accounts: Account[];
  phases: ContributionPhase[];
  scenarios: Scenario[];
  budget: BudgetItem[];
}

export interface ProjectionPoint {
  month: number;
  age: number;
  date: string;
  fireTarget: number;
  firePortfolio: number;
  netWorth: number;
  accessible: number;
  cash: number;
  startingPrincipal: number;
  personalContributions: number;
  employerContributions: number;
  investmentGrowth: number;
  balances: Record<string, number>;
  phaseName: string;
}

export interface ScenarioResult {
  scenario: Scenario;
  profile: Profile;
  accounts: Account[];
  points: ProjectionPoint[];
  fireNumber: number;
  firePoint: ProjectionPoint | null;
  targetPoint: ProjectionPoint;
  currentFirePortfolio: number;
  currentNetWorth: number;
  currentAccessible: number;
  plannedPersonalMonthly: number;
  plannedEmployerMonthly: number;
  requiredPersonalMonthly: number;
  requiredContributionScale: number;
  contributionGap: number;
}

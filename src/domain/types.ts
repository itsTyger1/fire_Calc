export type ProjectionMode = 'real' | 'nominal';
export type TaxTreatment = 'Roth' | 'Traditional' | 'Taxable' | 'Cash' | 'Other';
export type Accessibility = 'Immediate' | 'Potential' | 'Restricted';
export type AccountType =
  | 'Roth 401(k)' | 'Traditional 401(k)' | 'After-tax 401(k)' | 'Roth IRA' | 'Traditional IRA'
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
  afterTaxBasis?: number;
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
  takeHomeIncome?: number;
}

export interface BudgetItem { id: string; name: string; category: 'Needs' | 'Wants'; amount: number }

export interface RothTransfer {
  id: string;
  kind: 'conversion' | 'backdoor' | 'roth401k' | 'mega-ira' | 'mega-plan';
  age: number;
  sourceId: string;
  destinationId: string;
  amount: number;
  // For conversions: verified nontaxable portion. For Roth 401(k): contribution basis.
  basis: number;
  taxRate: number;
  taxAccountId: string;
  repeat?: 'once' | 'monthly' | 'annual';
  endAge?: number;
  fullBalance?: boolean;
  earningsDestinationId?: string;
}

export interface RothConversionLot { year: number; taxable: number; nontaxable: number }
export interface RothTransferResult {
  id: string; date: string; requested: number; transferred: number;
  taxable: number; tax: number; taxPaid: number; accessYear: number | null; warning?: string;
  nontaxable?: number; pretaxRollover?: number; rothAmount?: number;
}

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
  rothTransfers?: RothTransfer[];
  rothConversionHistory?: RothConversionLot[];
  emergencyTarget: number;
  normalMonthlySpending: number;
  jobLossMonthlySpending: number;
  grossMonthlyIncome: number;
  netMonthlyIncome: number;
  payrollRetirement: number;
  budgetTargets: { needs: number; wants: number; wealth: number };
}

export interface ScenarioOverrides {
  rothTransfers?: RothTransfer[];
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

export type ProjectionPhase = 'accumulation' | 'retirement';

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
  projectionPhase: ProjectionPhase;
  monthlyWithdrawal: number;
  cumulativeWithdrawals: number;
  cumulativeWithdrawalShortfall: number;
  rothAccessibleBasis: number;
  cumulativeConversionTax: number;
  cumulativeConversionTaxPaid: number;
  rothTransfers: RothTransferResult[];
  afterTaxBases: Record<string, number>;
}

export interface RetirementSummary {
  startAge: number;
  startDate: string;
  firstYearWithdrawal: number;
  balanceAtRetirement: number;
  endingBalance: number;
  lowestBalance: number;
  totalWithdrawals: number;
  totalWithdrawalShortfall: number;
  depletionPoint: ProjectionPoint | null;
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
  retirementSummary: RetirementSummary;
}

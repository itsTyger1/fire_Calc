import type { Account, AppData, RothTransfer } from './types';

export const createNewAccount = (): Account => ({
  id: crypto.randomUUID(),
  name: 'New account',
  type: 'Other',
  balance: 0,
  monthlyContribution: 0,
  employerContribution: 0,
  fireEligible: true,
  includeInNetWorth: true,
  taxTreatment: 'Other',
  accessibility: 'Immediate',
  notes: '',
  holdings: [],
});

export const addAccountToData = (data: AppData, account: Account): AppData => ({
  ...data,
  accounts: [...data.accounts, account],
  phases: data.phases.map((phase) => ({
    ...phase,
    contributions: { ...phase.contributions, [account.id]: { personal: 0, employer: 0 } },
  })),
});

const removeRecordEntry = <T,>(record: Record<string, T> | undefined, id: string) => {
  if (!record || !(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
};

const transferUsesAccount = (transfer: RothTransfer, accountId: string) =>
  transfer.sourceId === accountId
  || transfer.destinationId === accountId
  || transfer.taxAccountId === accountId
  || transfer.earningsDestinationId === accountId;

const removeAccountTransfers = (transfers: RothTransfer[] | undefined, accountId: string) =>
  transfers?.filter((transfer) => !transferUsesAccount(transfer, accountId));

export const removeAccountFromData = (data: AppData, accountId: string): AppData => ({
  ...data,
  accounts: data.accounts.filter((account) => account.id !== accountId),
  phases: data.phases.map((phase) => {
    const contributions = { ...phase.contributions };
    delete contributions[accountId];
    return {
      ...phase,
      contributions,
      startsWhen: phase.startsWhen.kind === 'cashTarget' && phase.startsWhen.accountId === accountId
        ? { kind: 'always' as const }
        : phase.startsWhen,
    };
  }),
  profile: { ...data.profile, rothTransfers: removeAccountTransfers(data.profile.rothTransfers, accountId) },
  scenarios: data.scenarios.map((scenario) => {
    const phaseContributions = scenario.overrides.phaseContributions
      ? Object.fromEntries(Object.entries(scenario.overrides.phaseContributions).map(([phaseId, entries]) => [
        phaseId,
        (() => { const next = { ...entries }; delete next[accountId]; return next; })(),
      ]))
      : undefined;
    return {
      ...scenario,
      overrides: {
        ...scenario.overrides,
        accountBalances: removeRecordEntry(scenario.overrides.accountBalances, accountId),
        accountReturns: removeRecordEntry(scenario.overrides.accountReturns, accountId),
        contributions: removeRecordEntry(scenario.overrides.contributions, accountId),
        phaseContributions,
        rothTransfers: removeAccountTransfers(scenario.overrides.rothTransfers, accountId),
      },
    };
  }),
});

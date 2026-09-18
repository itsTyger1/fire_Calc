import type { Account, RothConversionLot, RothTransfer } from './types';

export const isMegaBackdoor = (transfer: RothTransfer) => transfer.kind === 'mega-ira' || transfer.kind === 'mega-plan';

export const rothTransferError = (transfer: RothTransfer, accounts: Account[]) => {
  const source = accounts.find((account) => account.id === transfer.sourceId);
  const destination = accounts.find((account) => account.id === transfer.destinationId);
  if (!source || !destination) return 'Choose existing source and destination accounts.';
  const mega = isMegaBackdoor(transfer);
  const destinationType = transfer.kind === 'mega-plan' ? 'Roth 401(k)' : 'Roth IRA';
  if (destination.type !== destinationType || source.id === destination.id) return `The destination must be a different ${destinationType} account.`;
  const validSource = mega ? source.type === 'After-tax 401(k)' : transfer.kind === 'roth401k' ? source.type === 'Roth 401(k)'
    : transfer.kind === 'backdoor' ? source.type === 'Traditional IRA'
      : source.type === 'Traditional IRA' || source.type === 'Traditional 401(k)';
  if (!validSource) return 'The source account type does not match this transfer.';
  if (![transfer.age, transfer.amount, transfer.basis, transfer.taxRate].every(Number.isFinite)
    || (!(mega && transfer.fullBalance) && transfer.amount <= 0) || transfer.basis < 0 || (!mega && transfer.basis > transfer.amount)
    || transfer.taxRate < 0 || transfer.taxRate > 1) return 'Enter a positive amount, basis between zero and the amount, and a tax rate from 0% to 100%.';
  if (mega && (!Number.isFinite(source.afterTaxBasis) || source.afterTaxBasis! < 0)) return 'Enter the source account’s current after-tax contribution basis (zero for a new account).';
  if (transfer.repeat && !['once', 'monthly', 'annual'].includes(transfer.repeat)) return 'Choose a supported repeat schedule.';
  if (transfer.repeat && transfer.repeat !== 'once' && (!Number.isFinite(transfer.endAge) || transfer.endAge! < transfer.age)) return 'The repeat end age must be at or after the first transfer age.';
  if (mega && transfer.earningsDestinationId) {
    if (transfer.kind !== 'mega-ira' || accounts.find((account) => account.id === transfer.earningsDestinationId)?.type !== 'Traditional IRA') return 'Split earnings can only go to a Traditional IRA with a mega-backdoor Roth IRA rollover.';
  }
  if (transfer.kind !== 'roth401k' && transfer.taxRate > 0 && (mega ? !transfer.earningsDestinationId : transfer.amount > transfer.basis)) {
    const taxAccount = accounts.find((account) => account.id === transfer.taxAccountId);
    if (!taxAccount || !['HYSA / Cash', 'Taxable Brokerage'].includes(taxAccount.type)
      || taxAccount.accessibility !== 'Immediate') return 'Choose an immediate-access cash or brokerage account to pay conversion tax.';
  }
  return undefined;
};

// Roth IRA ordering: regular basis first, then conversions by tax year,
// taxable before nontaxable amounts within each year. An immature taxable
// amount blocks penalty-free access to the later amounts behind it.
export const accessibleConversionBasis = (lots: RothConversionLot[], year: number, age: number) => {
  let accessible = 0;
  for (const lot of [...lots].sort((a, b) => a.year - b.year)) {
    if (lot.taxable > 0 && age < 59.5 && year < lot.year + 5) break;
    accessible += lot.taxable + lot.nontaxable;
  }
  return accessible;
};

export const addConversionLot = (lots: RothConversionLot[], year: number, taxable: number, nontaxable: number) => {
  const existing = lots.find((lot) => lot.year === year);
  if (existing) { existing.taxable += taxable; existing.nontaxable += nontaxable; }
  else { lots.push({ year, taxable, nontaxable }); lots.sort((a, b) => a.year - b.year); }
};

export const consumeRothBasis = (regularBasis: number, lots: RothConversionLot[], withdrawal: number) => {
  const regularUsed = Math.min(regularBasis, withdrawal);
  let remaining = withdrawal - regularUsed;
  for (const lot of lots) {
    const taxableUsed = Math.min(lot.taxable, remaining);
    lot.taxable -= taxableUsed; remaining -= taxableUsed;
    const nontaxableUsed = Math.min(lot.nontaxable, remaining);
    lot.nontaxable -= nontaxableUsed; remaining -= nontaxableUsed;
  }
  return regularBasis - regularUsed;
};

import type { AppData, Scenario, ScenarioBudgetMetrics } from '../domain/types';
import { isTakeHomeBudgetAccount } from '../domain/calculations';
import { money, percent, Section } from './ui';
export function BudgetSummary({ data, selectedScenario, selectedBudget, comparisonBudgets, setSelected }: {
  data: AppData; selectedScenario: Scenario; selectedBudget: ScenarioBudgetMetrics;
  comparisonBudgets: { scenario: Scenario; budget: ScenarioBudgetMetrics }[]; setSelected: (id: string) => void;
}) {
  const base = { scenario: selectedScenario };
  const allocationRows = [
    ...data.budget.map((item) => { const amount = selectedScenario.overrides.budgetAmounts?.[item.id] ?? item.amount; return { id: item.id, kind: 'budget' as const, group: item.category, name: item.name, planned: amount }; }),
    ...selectedBudget.rows.filter((row) => isTakeHomeBudgetAccount(row.account)).map((row) => ({
      id: row.account.id,
      kind: 'personal' as const,
      group: 'Paid from deposited take-home',
      name: row.account.name,
      planned: row.personal,
    })),
  ];
  const payrollRows = selectedBudget.rows.filter((row) => row.account.type.includes('401(k)'));
  const comparisonRows = [
    ...data.budget.map((item) => ({ id: item.id, kind: 'budget' as const, group: item.category, name: item.name })),
    ...data.accounts.filter((account) => isTakeHomeBudgetAccount(account)).map((account) => ({ id: account.id, kind: 'personal' as const, group: 'Paid from deposited take-home', name: account.name })),
    { id: 'remaining', kind: 'remaining' as const, group: 'Budget check', name: 'Unassigned take-home / overage' },
    { id: 'take-home', kind: 'income' as const, group: 'Zero-based take-home', name: 'Deposited take-home assigned' },
  ];
  const comparisonValue = (row: typeof comparisonRows[number], scenario: Scenario, budget: typeof selectedBudget) => {
    if (row.kind === 'budget') return scenario.overrides.budgetAmounts?.[row.id] ?? data.budget.find((item) => item.id === row.id)?.amount ?? 0;
    if (row.kind === 'remaining') return budget.remaining;
    if (row.kind === 'income') return budget.takeHomeIncome;
    const accountRow = budget.rows.find((item) => item.account.id === row.id);
    return accountRow?.personal ?? 0;
  };


  return (      <div className="budget-summary">
        <Section title="Monthly budget breakdown" eyebrow={`${base.scenario.name} · ${selectedBudget.phase?.name ?? 'Base contributions'}`}>
          <div className="scale-explanation"><strong>What counts here</strong><span>Deposited take-home is the pay received in your bank account. Every expense and personal contribution to a non-payroll account is subtracted from it. 401(k) payroll contributions and employer contributions are shown separately because they do not come out of deposited take-home. Edit these amounts in Monthly money at the top.</span></div>
          <div className="budget-bars">{[
            ['Needs', selectedBudget.needs, '#65a7ff'], ['Wants', selectedBudget.wants, '#f4b860'], ['Take-home savings & investments', selectedBudget.takeHomeContributions, '#37d39a'],
          ].map(([label, value, color]) => { const share = selectedBudget.takeHomeIncome > 0 ? Number(value) / selectedBudget.takeHomeIncome : 0; return <div key={String(label)}><div><span>{label}</span><b>{money(Number(value))} · {percent(share)}</b><small>of deposited take-home</small></div><div className="bar-track"><span style={{ width: `${Math.min(100, Math.max(0, share * 100))}%`, background: String(color) }} /></div></div>; })}</div>
          <div className="allocation-table"><div className="allocation-row allocation-head"><span>Take-home-funded item</span><span>Monthly amount</span><span /><span /></div>{allocationRows.map((row) => <div className="allocation-row" key={`${row.group}-${row.id}`}><span><small>{row.group}</small><strong>{row.name}</strong></span><span>{money(row.planned)}</span><span /><span /></div>)}<div className="allocation-row zero-sum-adjustment"><span><small>Budget check</small><strong>{selectedBudget.remaining >= 0 ? 'Unassigned take-home' : 'Budget exceeds take-home'}</strong></span><span className={selectedBudget.remaining === 0 ? 'positive-text' : selectedBudget.remaining < 0 ? 'negative-text' : 'unassigned-text'}>{money(Math.abs(selectedBudget.remaining))}</span><span /><span /></div><div className="allocation-row zero-sum-total"><span><small>Reconciliation</small><strong>Deposited take-home accounted for</strong></span><span>{money(selectedBudget.needs + selectedBudget.wants + selectedBudget.takeHomeContributions + selectedBudget.remaining)}</span><span>Must equal</span><span>{money(selectedBudget.takeHomeIncome)}</span></div></div>
          <div className="cashflow-math"><div><span>Deposited take-home</span><strong>{money(selectedBudget.takeHomeIncome)}</strong><small>Received in your bank account</small></div><i>−</i><div><span>All expenses</span><strong>{money(selectedBudget.needs + selectedBudget.wants)}</strong><small>Every entered budget item</small></div><i>−</i><div><span>Take-home savings & investments</span><strong>{money(selectedBudget.takeHomeContributions)}</strong><small>Paid from deposited take-home</small></div><i>=</i><div className={selectedBudget.remaining >= 0 ? 'cashflow-positive' : 'cashflow-negative'}><span>{selectedBudget.remaining >= 0 ? 'Unassigned take-home' : 'Budget exceeds take-home'}</span><strong>{money(Math.abs(selectedBudget.remaining))}</strong><small>{selectedBudget.remaining > 0 ? 'Assign this amount manually to reach $0' : selectedBudget.remaining < 0 ? 'Your assignments exceed deposited take-home' : 'Every take-home dollar is assigned'}</small></div></div>
          <div className="budget-detail-strip">{payrollRows.map((row) => <span key={row.account.id}><b>{money(row.personal)}</b> {row.account.name} · payroll withholding, not subtracted</span>)}<span><b>{money(selectedBudget.employerWealth)}</b> employer contributions · not subtracted</span></div>
          <p className="fine-print">Formula: deposited take-home − expenses − personal non-payroll contributions = unassigned take-home. Payroll 401(k) and employer contributions are not deducted again.</p>
          <div className="budget-comparison"><div className="comparison-title"><div><span className="eyebrow">Selected contribution phase</span><h3>Monthly line-item comparison</h3></div><small>{comparisonBudgets[0]?.budget.phase?.name ?? 'FIRE investing'} · payroll retirement and employer contributions are excluded from this take-home comparison.</small></div><div className="comparison-scroll"><div className="comparison-grid" style={{ '--scenario-count': data.scenarios.length } as React.CSSProperties}><div className="comparison-corner">Take-home-funded item</div>{comparisonBudgets.map(({ scenario }) => <button key={scenario.id} className={`comparison-scenario ${scenario.id === base.scenario.id ? 'active' : ''}`} onClick={() => setSelected(scenario.id)}><i style={{ background: scenario.color }} /><span>{scenario.name}</span></button>)}{comparisonRows.flatMap((row) => {
            const baseline = comparisonBudgets[0] ? comparisonValue(row, comparisonBudgets[0].scenario, comparisonBudgets[0].budget) : 0;
            return [<div className={`comparison-label ${['remaining', 'income'].includes(row.kind) ? 'summary' : ''}`} key={`label-${row.kind}-${row.id}`}><small>{row.group}</small><strong>{row.name}</strong></div>, ...comparisonBudgets.map(({ scenario, budget }) => { const value = comparisonValue(row, scenario, budget); const difference = value - baseline; return <button key={`${row.kind}-${row.id}-${scenario.id}`} className={`comparison-value ${scenario.id === base.scenario.id ? 'active' : ''} ${row.kind === 'remaining' ? (value < 0 ? 'negative-text' : value > 0 ? 'unassigned-text' : 'positive-text') : ''}`} onClick={() => setSelected(scenario.id)}><strong>{money(value)}</strong><small>{scenario === comparisonBudgets[0]?.scenario || Math.abs(difference) < .5 ? '—' : `${difference > 0 ? '+' : '−'}${money(Math.abs(difference))} vs base`}</small></button>; })];
          })}</div></div></div>
        </Section>
      </div>

);
}

import { useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { Account, AccountType, AppData, AssetClass, ContributionPhase, TaxTreatment, Accessibility } from './types';
import { Field, SelectField, TextField, Toggle, money } from './ui';

type Setter = Dispatch<SetStateAction<AppData>>;
const accountTypes: AccountType[] = ['Roth 401(k)', 'Traditional 401(k)', 'Roth IRA', 'Traditional IRA', 'Taxable Brokerage', 'HYSA / Cash', 'Treasury / Bonds', 'Crypto', 'HSA', 'Other'];
const assetClasses: AssetClass[] = ['Broad US equity', 'International equity', 'Bonds', 'Cash', 'Bitcoin / Crypto', 'Individual stock', 'Other'];

export function ProfileEditor({ data, setData }: { data: AppData; setData: Setter }) {
  const update = <K extends keyof AppData['profile']>(key: K, value: AppData['profile'][K]) => setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  const p = data.profile;
  return <div className="editor-stack">
    <div className="editor-grid">
      <TextField label="Plan name" value={p.name} onChange={(v) => update('name', v)} />
      <Field label="Current age" value={p.currentAge} min={1} step={0.1} onChange={(v) => update('currentAge', v)} error={p.currentAge <= 0 ? 'Enter an age above zero.' : undefined} />
      <Field label="Target retirement age" value={p.retirementAge} min={p.currentAge + .1} step={0.1} onChange={(v) => update('retirementAge', v)} error={p.retirementAge <= p.currentAge ? 'Must be after your current age.' : undefined} />
      <Field label="Maximum projection age" value={p.maxAge} min={p.retirementAge + .1} step={1} onChange={(v) => update('maxAge', v)} error={p.maxAge <= p.retirementAge ? 'Must be after retirement age.' : undefined} />
      <Field label="Annual retirement spending" value={p.annualSpending} min={0} step={500} prefix="$" onChange={(v) => update('annualSpending', Math.max(0, v))} />
      <Field label="Safe withdrawal rate" value={p.withdrawalRate * 100} min={0.1} max={99.9} step={0.05} suffix="%" onChange={(v) => update('withdrawalRate', v / 100)} hint="FIRE number = annual spending ÷ withdrawal rate." />
    </div>
    <div className="goal-override">
      <div><span className="eyebrow">FIRE goal source</span><strong>{p.customFireNumber == null ? 'Spending-based calculation' : 'Custom target'}</strong></div>
      {p.customFireNumber == null
        ? <button className="button secondary" onClick={() => update('customFireNumber', p.annualSpending / p.withdrawalRate)}>Override target</button>
        : <><Field label="Custom FIRE target" value={p.customFireNumber} min={0} prefix="$" step={10000} onChange={(v) => update('customFireNumber', Math.max(0, v))} /><button className="button secondary" onClick={() => update('customFireNumber', null)}>Reset to calculation</button></>}
    </div>
    <div className="editor-grid">
      <SelectField label="Projection dollars" value={p.mode} onChange={(v) => update('mode', v as 'real' | 'nominal')}><option value="real">Today’s dollars (real)</option><option value="nominal">Future dollars (nominal)</option></SelectField>
      <Field label="Expected real return" value={p.realReturn * 100} min={-99} step={0.1} suffix="%" onChange={(v) => update('realReturn', v / 100)} />
      <Field label="Expected nominal return" value={p.nominalReturn * 100} min={-99} step={0.1} suffix="%" onChange={(v) => update('nominalReturn', v / 100)} />
      <Field label="Inflation rate" value={p.inflationRate * 100} min={-99} step={0.1} suffix="%" onChange={(v) => update('inflationRate', v / 100)} />
      <Field label="Roth IRA contribution basis" value={p.rothContributionBasis} min={0} step={500} prefix="$" onChange={(v) => update('rothContributionBasis', Math.max(0, v))} hint="Enter regular contributions only—not the full balance or earnings." />
    </div>
  </div>;
}

const newAccount = (): Account => ({ id: crypto.randomUUID(), name: 'New account', type: 'Other', balance: 0, monthlyContribution: 0, employerContribution: 0, fireEligible: true, includeInNetWorth: true, taxTreatment: 'Other', accessibility: 'Immediate', notes: '', holdings: [] });

export function AccountsEditor({ data, setData }: { data: AppData; setData: Setter }) {
  const [expanded, setExpanded] = useState<string | null>(data.accounts[0]?.id ?? null);
  const updateAccount = (id: string, patch: Partial<Account>) => setData((old) => ({ ...old, accounts: old.accounts.map((account) => account.id === id ? { ...account, ...patch } : account) }));
  const remove = (id: string) => setData((old) => ({ ...old, accounts: old.accounts.filter((a) => a.id !== id), phases: old.phases.map((phase) => { const next = { ...phase, contributions: { ...phase.contributions } }; delete next.contributions[id]; return next; }) }));
  const move = (index: number, by: number) => setData((old) => { const accounts = [...old.accounts]; const target = index + by; if (target < 0 || target >= accounts.length) return old; [accounts[index], accounts[target]] = [accounts[target], accounts[index]]; return { ...old, accounts }; });
  const add = () => { const account = newAccount(); setData((old) => ({ ...old, accounts: [...old.accounts, account], phases: old.phases.map((phase) => ({ ...phase, contributions: { ...phase.contributions, [account.id]: { personal: 0, employer: 0 } } })) })); setExpanded(account.id); };
  const returnModeFor = (account: Account) => account.returnMode ?? (account.type === 'Crypto' ? 'plan' : account.annualReturn === undefined ? 'plan' : 'custom');

  return <div className="account-list">
    {data.accounts.map((account, index) => <div className={`account-editor ${expanded === account.id ? 'expanded' : ''}`} key={account.id}>
      <button className="account-summary" onClick={() => setExpanded(expanded === account.id ? null : account.id)}>
        <span className="account-icon">{account.name.slice(0, 2).toUpperCase()}</span><span><strong>{account.name}</strong><small>{account.type} · {account.fireEligible ? 'FIRE eligible' : 'Net worth only'}</small></span><b>{money(account.balance)}</b>
      </button>
      {expanded === account.id && <div className="account-body">
        <div className="editor-grid">
          <TextField label="Account name" value={account.name} onChange={(v) => updateAccount(account.id, { name: v })} />
          <SelectField label="Account type" value={account.type} onChange={(v) => updateAccount(account.id, { type: v as AccountType })}>{accountTypes.map((v) => <option key={v}>{v}</option>)}</SelectField>
          <Field label="Current balance" value={account.balance} min={0} prefix="$" step={100} onChange={(v) => updateAccount(account.id, { balance: Math.max(0, v) })} />
          <Field label="Base personal contribution" value={account.monthlyContribution} min={0} prefix="$" suffix="/mo" onChange={(v) => updateAccount(account.id, { monthlyContribution: Math.max(0, v) })} />
          <Field label="Base employer contribution" value={account.employerContribution} min={0} prefix="$" suffix="/mo" onChange={(v) => updateAccount(account.id, { employerContribution: Math.max(0, v) })} />
          <SelectField label="Projected return" value={returnModeFor(account)} onChange={(value) => updateAccount(account.id, value === 'plan' ? { returnMode: 'plan' } : { returnMode: 'custom', annualReturn: account.annualReturn ?? (data.profile.mode === 'real' ? data.profile.realReturn : data.profile.nominalReturn) })}><option value="plan">Use scenario return</option><option value="custom">Use custom return</option></SelectField>
          {returnModeFor(account) === 'custom' && <Field label="Custom annual return" value={(account.annualReturn ?? (data.profile.mode === 'real' ? data.profile.realReturn : data.profile.nominalReturn)) * 100} min={-99} suffix="%" step={0.1} onChange={(v) => updateAccount(account.id, { returnMode: 'custom', annualReturn: v / 100 })} hint="This account will use this rate instead of the selected scenario’s return." />}
          <SelectField label="Tax treatment" value={account.taxTreatment} onChange={(v) => updateAccount(account.id, { taxTreatment: v as TaxTreatment })}>{['Roth', 'Traditional', 'Taxable', 'Cash', 'Other'].map((v) => <option key={v}>{v}</option>)}</SelectField>
          <SelectField label="Accessibility" value={account.accessibility} onChange={(v) => updateAccount(account.id, { accessibility: v as Accessibility })}>{['Immediate', 'Potential', 'Restricted'].map((v) => <option key={v}>{v}</option>)}</SelectField>
        </div>
        <div className="toggle-grid"><Toggle label="Count toward FIRE" checked={account.fireEligible} onChange={(v) => updateAccount(account.id, { fireEligible: v })} /><Toggle label="Count in net worth" checked={account.includeInNetWorth} onChange={(v) => updateAccount(account.id, { includeInNetWorth: v })} /></div>
        <TextField label="Notes" value={account.notes} onChange={(v) => updateAccount(account.id, { notes: v })} placeholder="Holdings, purpose, or planning notes" />
        <div className="holdings-head"><strong>Optional holdings</strong><button className="text-button" onClick={() => updateAccount(account.id, { holdings: [...account.holdings, { id: crypto.randomUUID(), symbol: 'New holding', value: 0, assetClass: 'Other' }] })}><Plus size={14} /> Add holding</button></div>
        {account.holdings.map((holding) => <div className="holding-row" key={holding.id}>
          <input aria-label="Holding symbol" value={holding.symbol} onChange={(e) => updateAccount(account.id, { holdings: account.holdings.map((h) => h.id === holding.id ? { ...h, symbol: e.target.value } : h) })} />
          <input aria-label="Holding value" type="number" min="0" value={holding.value} onChange={(e) => updateAccount(account.id, { holdings: account.holdings.map((h) => h.id === holding.id ? { ...h, value: Math.max(0, Number(e.target.value)) } : h) })} />
          <select aria-label="Asset class" value={holding.assetClass} onChange={(e) => updateAccount(account.id, { holdings: account.holdings.map((h) => h.id === holding.id ? { ...h, assetClass: e.target.value as AssetClass } : h) })}>{assetClasses.map((v) => <option key={v}>{v}</option>)}</select>
          <button className="icon-button danger" aria-label="Remove holding" onClick={() => updateAccount(account.id, { holdings: account.holdings.filter((h) => h.id !== holding.id) })}><X size={15} /></button>
        </div>)}
        <div className="account-actions"><div><button className="icon-button" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button className="icon-button" disabled={index === data.accounts.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button></div><button className="text-button danger" onClick={() => remove(account.id)}><Trash2 size={15} /> Delete account</button></div>
      </div>}
    </div>)}
    <button className="add-card" onClick={add}><Plus size={18} /> Add account</button>
  </div>;
}

export function PhasesEditor({ data, setData }: { data: AppData; setData: Setter }) {
  const updatePhase = (id: string, updater: (phase: ContributionPhase) => ContributionPhase) => setData((old) => ({ ...old, phases: old.phases.map((phase) => phase.id === id ? updater(phase) : phase) }));
  const add = () => setData((old) => ({ ...old, phases: [...old.phases, { id: crypto.randomUUID(), name: 'New contribution phase', startsWhen: { kind: 'age', age: old.profile.currentAge + 1 }, contributions: Object.fromEntries(old.accounts.map((a) => [a.id, { personal: a.monthlyContribution, employer: a.employerContribution }])) }] }));
  return <div className="editor-stack">
    <p className="muted">The last phase whose start trigger has been met is used each month. Drag-free ordering keeps the transition logic explicit.</p>
    {data.phases.map((phase, index) => <div className="phase-card" key={phase.id}>
      <div className="phase-title"><span>{index + 1}</span><input value={phase.name} onChange={(e) => updatePhase(phase.id, (p) => ({ ...p, name: e.target.value }))} />{data.phases.length > 1 && <button className="icon-button danger" onClick={() => setData((old) => ({ ...old, phases: old.phases.filter((p) => p.id !== phase.id) }))}><Trash2 size={15} /></button>}</div>
      <div className="editor-grid trigger-grid">
        <SelectField label="Starts when" value={phase.startsWhen.kind} onChange={(kind) => updatePhase(phase.id, (p) => ({ ...p, startsWhen: kind === 'always' ? { kind: 'always' } : kind === 'cashTarget' ? { kind: 'cashTarget', accountId: data.accounts.find((a) => a.type === 'HYSA / Cash')?.id ?? data.accounts[0].id, amount: data.profile.emergencyTarget } : kind === 'date' ? { kind: 'date', date: new Date().toISOString().slice(0, 10) } : { kind: 'age', age: data.profile.currentAge + 1 } }))}><option value="always">Immediately</option><option value="cashTarget">Cash reaches target</option><option value="age">At age</option><option value="date">On date</option></SelectField>
        {phase.startsWhen.kind === 'cashTarget' && <><SelectField label="Cash account" value={phase.startsWhen.accountId} onChange={(v) => updatePhase(phase.id, (p) => ({ ...p, startsWhen: { kind: 'cashTarget', accountId: v, amount: phase.startsWhen.kind === 'cashTarget' ? phase.startsWhen.amount : data.profile.emergencyTarget } }))}>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField><Field label="Target balance" value={phase.startsWhen.amount} prefix="$" min={0} onChange={(v) => updatePhase(phase.id, (p) => ({ ...p, startsWhen: { kind: 'cashTarget', accountId: phase.startsWhen.kind === 'cashTarget' ? phase.startsWhen.accountId : data.accounts[0].id, amount: Math.max(0, v) } }))} /></>}
        {phase.startsWhen.kind === 'age' && <Field label="Start age" value={phase.startsWhen.age} min={data.profile.currentAge} step={0.1} onChange={(v) => updatePhase(phase.id, (p) => ({ ...p, startsWhen: { kind: 'age', age: v } }))} />}
        {phase.startsWhen.kind === 'date' && <label className="field"><span className="field-label">Start date</span><input className="text-input" type="date" value={phase.startsWhen.date} onChange={(e) => updatePhase(phase.id, (p) => ({ ...p, startsWhen: { kind: 'date', date: e.target.value } }))} /></label>}
      </div>
      <div className="phase-contributions"><span className="phase-col-head">Account</span><span className="phase-col-head">Personal / mo</span><span className="phase-col-head">Employer / mo</span>{data.accounts.map((account) => { const amount = phase.contributions[account.id] ?? { personal: 0, employer: 0 }; return <div className="phase-row" key={account.id}><strong>{account.name}</strong><span className="mini-money">$<input type="number" min="0" value={amount.personal} onChange={(e) => updatePhase(phase.id, (p) => ({ ...p, contributions: { ...p.contributions, [account.id]: { ...amount, personal: Math.max(0, Number(e.target.value)) } } }))} /></span><span className="mini-money">$<input type="number" min="0" value={amount.employer} onChange={(e) => updatePhase(phase.id, (p) => ({ ...p, contributions: { ...p.contributions, [account.id]: { ...amount, employer: Math.max(0, Number(e.target.value)) } } }))} /></span></div>; })}</div>
    </div>)}
    <button className="add-card" onClick={add}><Plus size={18} /> Add contribution phase</button>
  </div>;
}

export function BudgetEditor({ data, setData }: { data: AppData; setData: Setter }) {
  const p = data.profile;
  const updateProfile = <K extends keyof typeof p>(key: K, value: typeof p[K]) => setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  return <div className="editor-stack">
    <div className="editor-grid"><Field label="Gross monthly income" value={p.grossMonthlyIncome} prefix="$" min={0} onChange={(v) => updateProfile('grossMonthlyIncome', v)} /><Field label="Deposited take-home" value={p.netMonthlyIncome} prefix="$" min={0} onChange={(v) => updateProfile('netMonthlyIncome', v)} /><Field label="Payroll retirement" value={p.payrollRetirement} prefix="$" min={0} onChange={(v) => updateProfile('payrollRetirement', v)} hint="Tracked outside deposited take-home to prevent double-counting." /></div>
    <div className="ratio-target"><span>Custom budget target</span>{(['needs', 'wants', 'wealth'] as const).map((key) => <Field key={key} label={key[0].toUpperCase() + key.slice(1)} value={p.budgetTargets[key] * 100} suffix="%" min={0} max={100} onChange={(v) => updateProfile('budgetTargets', { ...p.budgetTargets, [key]: v / 100 })} />)}</div>
    <div className="budget-items">{data.budget.map((item) => <div className="budget-row" key={item.id}><input value={item.name} onChange={(e) => setData((old) => ({ ...old, budget: old.budget.map((b) => b.id === item.id ? { ...b, name: e.target.value } : b) }))} /><select value={item.category} onChange={(e) => setData((old) => ({ ...old, budget: old.budget.map((b) => b.id === item.id ? { ...b, category: e.target.value as 'Needs' | 'Wants' } : b) }))}><option>Needs</option><option>Wants</option></select><span className="mini-money">$<input type="number" min="0" value={item.amount} onChange={(e) => setData((old) => ({ ...old, budget: old.budget.map((b) => b.id === item.id ? { ...b, amount: Math.max(0, Number(e.target.value)) } : b) }))} /></span><button className="icon-button danger" onClick={() => setData((old) => ({ ...old, budget: old.budget.filter((b) => b.id !== item.id) }))}><Trash2 size={15} /></button></div>)}</div>
    <button className="add-card" onClick={() => setData((old) => ({ ...old, budget: [...old.budget, { id: crypto.randomUUID(), name: 'New expense', category: 'Needs', amount: 0 }] }))}><Plus size={18} /> Add budget item</button>
  </div>;
}

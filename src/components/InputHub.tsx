import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, Copy, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import type { AppData, Scenario } from '../domain/types';
import { scenarioColors } from '../domain/defaults';
import { applyScenarioOverrides, isTakeHomeBudgetAccount, scenarioBudgetMetrics } from '../domain/calculations';
import { AccountsEditor, BudgetEditor, ProfileEditor } from './Editors';
import { CommittedNumberInput, Field, money, SelectField, Toggle } from './ui';

type Setter = Dispatch<SetStateAction<AppData>>;
type Tab = 'plan' | 'money' | 'accounts';
const MAX_SCENARIOS = 3;
const tabs: { id: Tab; title: string; description: string }[] = [
  { id: 'plan', title: 'Plan', description: 'Goals & assumptions' },
  { id: 'money', title: 'Monthly money', description: 'Income, expenses & investing' },
  { id: 'accounts', title: 'Accounts', description: 'Balances & account details' },
];

export function InputHub({ data, setData, scenario, setSelected, phaseId, setPhaseId }: {
  data: AppData; setData: Setter; scenario: Scenario; setSelected: (id: string) => void;
  phaseId?: string; setPhaseId: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('money');
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [scenarioDraftName, setScenarioDraftName] = useState(scenario.name);
  const scenarioPickerRef = useRef<HTMLDivElement>(null);
  const scenarioOptionsRef = useRef<HTMLDetailsElement>(null);
  const budget = scenarioBudgetMetrics(data, scenario, 1, phaseId);
  const effective = applyScenarioOverrides(data, scenario);
  const patchScenario = (patch: Partial<Scenario>) => setData((old) => ({ ...old, scenarios: old.scenarios.map((item) => item.id === scenario.id ? { ...item, ...patch } : item) }));
  const patchOverride = (patch: Scenario['overrides']) => patchScenario({ overrides: { ...scenario.overrides, ...patch } });
  useEffect(() => setScenarioDraftName(scenario.name), [scenario.id, scenario.name]);
  const commitScenarioName = () => {
    const nextName = scenarioDraftName.trim();
    if (!nextName) setScenarioDraftName(scenario.name);
    else if (nextName !== scenario.name) patchScenario({ name: nextName });
  };
  const selectScenario = (id: string) => {
    const next = data.scenarios.find((item) => item.id === id);
    if (!next) return;
    setScenarioDraftName(next.name);
    setScenarioMenuOpen(false);
    setSelected(id);
  };
  const deleteScenario = (id: string) => {
    if (data.scenarios.length <= 1) return;
    const target = data.scenarios.find((item) => item.id === id);
    if (!target || !window.confirm(`Delete ${target.name}?`)) return;
    const remaining = data.scenarios.filter((item) => item.id !== id);
    setData((old) => ({ ...old, scenarios: remaining }));
    if (id === scenario.id) setSelected(remaining[0].id);
  };
  const visibleScenarioOptions = scenarioDraftName === scenario.name
    ? data.scenarios
    : data.scenarios.filter((item) => item.name.toLowerCase().includes(scenarioDraftName.trim().toLowerCase()));
  useEffect(() => {
    if (!scenarioMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (scenarioPickerRef.current?.contains(event.target as Node)) return;
      commitScenarioName();
      setScenarioMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [scenarioMenuOpen, scenarioDraftName, scenario.name]);
  useEffect(() => {
    const closeScenarioOptionsOnOutsideClick = (event: PointerEvent) => {
      const options = scenarioOptionsRef.current;
      if (!options?.open || options.contains(event.target as Node)) return;
      options.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeScenarioOptionsOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeScenarioOptionsOnOutsideClick);
  }, []);
  const updateShared = <K extends keyof AppData['profile']>(key: K, value: AppData['profile'][K]) => setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  const addScenario = (duplicate: boolean) => {
    if (data.scenarios.length >= MAX_SCENARIOS) return;
    const next: Scenario = {
      ...(duplicate ? structuredClone(scenario) : { overrides: {} }),
      id: crypto.randomUUID(), name: duplicate ? `${scenario.name} copy` : `Scenario ${data.scenarios.length + 1}`,
      visible: true, color: scenarioColors[data.scenarios.length % scenarioColors.length],
    };
    setData((old) => ({ ...old, scenarios: [...old.scenarios, next] }));
    setSelected(next.id);
  };
  const resetBudget = () => setData((old) => ({ ...old, scenarios: old.scenarios.map((item) => {
    if (item.id !== scenario.id) return item;
    const { budgetAmounts: _budget, ...overrides } = item.overrides;
    const phaseContributions = { ...overrides.phaseContributions };
    if (budget.phase) delete phaseContributions[budget.phase.id];
    return { ...item, overrides: { ...overrides, phaseContributions } };
  }) }));

  return <section id="inputs" className="input-hub" aria-labelledby="input-heading">
    <div className="input-intro"><div><span className="eyebrow">Set up once. Explore below.</span><h1 id="input-heading">Your FIRE plan</h1><p>All your inputs in one place. Press <kbd>Enter</kbd> to apply a number; <kbd>Esc</kbd> to cancel. Changes save automatically.</p></div><a href="#results" className="button primary">View results ↓</a></div>
    <div className="scenario-toolbar">
      <div ref={scenarioPickerRef} className="field scenario-picker"><span className="field-label">Scenario you’re editing</span><span className="scenario-picker-control"><span className="scenario-picker-input-wrap"><input className="text-input" role="combobox" aria-label="Scenario you’re editing" aria-expanded={scenarioMenuOpen} aria-controls="scenario-options" value={scenarioDraftName} onFocus={() => setScenarioMenuOpen(true)} onClick={() => setScenarioMenuOpen(true)} onChange={(event) => { setScenarioDraftName(event.target.value); setScenarioMenuOpen(true); }} onBlur={() => { window.setTimeout(() => { commitScenarioName(); setScenarioMenuOpen(false); }, 0); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitScenarioName(); setScenarioMenuOpen(false); } else if (event.key === 'Escape') { event.preventDefault(); setScenarioDraftName(scenario.name); setScenarioMenuOpen(false); } }} /><ChevronDown className="scenario-picker-chevron" size={15} aria-hidden="true" /></span><button type="button" className="icon-button" disabled={data.scenarios.length >= MAX_SCENARIOS} onClick={() => addScenario(false)} aria-label="Add scenario" title="Add scenario"><Plus size={17} /></button></span>{scenarioMenuOpen && <div className="scenario-picker-menu" id="scenario-options" role="listbox">{visibleScenarioOptions.length > 0 ? visibleScenarioOptions.map((item) => <div className="scenario-option-row" role="option" aria-selected={item.id === scenario.id} key={item.id} onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; event.preventDefault(); selectScenario(item.id); }}><span>{item.name}</span><button type="button" className="scenario-option-delete" disabled={data.scenarios.length <= 1} aria-label={`Delete ${item.name}`} title={`Delete ${item.name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => deleteScenario(item.id)}><Trash2 size={14} /></button></div>) : <span className="scenario-picker-empty">No matching scenarios</span>}</div>}</div>
      <p>Goals and monthly amounts apply to this scenario. Fields marked “shared” apply to every scenario.</p>
      <div className="scenario-toolbar-actions"><details ref={scenarioOptionsRef} className="scenario-options"><summary>Manage scenarios</summary><div className="scenario-options-body">
        <Toggle label="Show on timeline" checked={scenario.visible} onChange={(visible) => patchScenario({ visible })} />
        <div className="scenario-modal-actions"><button className="button secondary" disabled={data.scenarios.length >= MAX_SCENARIOS} onClick={() => addScenario(false)}><Plus size={14} /> New</button><button className="button secondary" disabled={data.scenarios.length >= MAX_SCENARIOS} onClick={() => addScenario(true)}><Copy size={14} /> Duplicate</button></div>
        <button className="button secondary" onClick={() => { if (window.confirm(`Reset all overrides for ${scenario.name}?`)) patchScenario({ overrides: {} }); }}><RefreshCcw size={14} /> Reset scenario</button>
        <button className="button danger" disabled={data.scenarios.length <= 1} onClick={() => {
          if (!window.confirm(`Delete ${scenario.name}?`)) return;
          setData((old) => ({ ...old, scenarios: old.scenarios.filter((item) => item.id !== scenario.id) }));
          setSelected(data.scenarios.find((item) => item.id !== scenario.id)!.id);
        }}><Trash2 size={14} /> Delete scenario</button>
      </div></details></div>
    </div>
    <div className="input-tabs" role="tablist" aria-label="Plan inputs">
      {tabs.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus();
      }}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.description}</small></div></button>)}
    </div>
    <div className="input-panel" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} key={`${scenario.id}-${tab}`}>
      {tab === 'plan' && <>
        <div className="input-section-heading"><h2>Goals & assumptions</h2><p>These are the values used for {scenario.name}.</p></div>
        <ProfileEditor data={data} setData={setData} scenario={scenario} />
        <details className="advanced-inputs"><summary>Emergency fund & FIRE eligibility</summary><div className="editor-grid">
          <Field label="Emergency cash target" value={effective.profile.emergencyTarget} min={0} prefix="$" onChange={(cashTarget) => patchOverride({ cashTarget })} hint="Also controls contribution phases that start when cash reaches this target." />
          <Field label="Normal monthly spend · shared" value={data.profile.normalMonthlySpending} min={1} prefix="$" onChange={(value) => updateShared('normalMonthlySpending', value)} />
          <Field label="Job-loss monthly spend · shared" value={data.profile.jobLossMonthlySpending} min={1} prefix="$" onChange={(value) => updateShared('jobLossMonthlySpending', value)} />
        </div><div className="toggle-grid">
          <Toggle label="Include cash in FIRE" detail="Adds cash to the accounts already marked FIRE eligible" checked={scenario.overrides.includeCashInFire ?? false} onChange={(includeCashInFire) => patchOverride({ includeCashInFire })} />
          <Toggle label="Include crypto in FIRE" detail="Adds crypto to the accounts already marked FIRE eligible" checked={scenario.overrides.includeCryptoInFire ?? false} onChange={(includeCryptoInFire) => patchOverride({ includeCryptoInFire })} />
        </div></details>
      </>}
      {tab === 'money' && <>
        <div className="input-section-heading"><div><h2>Monthly take-home budget</h2><p>Enter expenses once. Deposited take-home and contributions are saved by contribution phase.</p></div><button className="button ghost" onClick={() => { if (window.confirm('Reset this scenario’s expenses and the selected phase’s contributions?')) resetBudget(); }}><RefreshCcw size={14} /> Reset monthly amounts</button></div>
        <div className="budget-live-total" role="status"><div><span>Deposited take-home</span><strong>{money(budget.takeHomeIncome)}</strong></div><div><span>Expenses</span><strong>− {money(budget.needs + budget.wants)}</strong></div><div><span>Take-home savings & investments</span><strong>− {money(budget.takeHomeContributions)}</strong></div><div className={budget.remaining < 0 ? 'negative-text' : budget.remaining > 0 ? 'unassigned-text' : 'positive-text'}><span>{budget.remaining < 0 ? 'Over budget' : 'Unassigned take-home'}</span><strong>{money(Math.abs(budget.remaining))}</strong></div></div>
        <div className="monthly-input-grid"><div><h3>Income & expenses</h3><BudgetEditor data={data} setData={setData} scenario={scenario} budget={budget} /></div><div><h3>Investments & savings</h3>
          <ContributionsEditor data={data} setData={setData} scenario={scenario} phaseId={phaseId} setPhaseId={setPhaseId} />
        </div></div>
      </>}
      {tab === 'accounts' && <><div className="input-section-heading"><h2>Account balances & details</h2><p>Shared across scenarios. Monthly contributions are entered in Monthly money.</p></div><AccountsEditor data={data} setData={setData} /></>}
    </div>
  </section>;
}

function ContributionsEditor({ data, setData, scenario, phaseId, setPhaseId }: {
  data: AppData; setData: Setter; scenario: Scenario; phaseId?: string; setPhaseId: (id: string) => void;
}) {
  const budget = scenarioBudgetMetrics(data, scenario, 1, phaseId);
  const phase = budget.phase;
  const update = (accountId: string, key: 'personal' | 'employer', value: number) => setData((old) => ({ ...old,
    scenarios: old.scenarios.map((item) => item.id === scenario.id ? { ...item, overrides: { ...item.overrides,
      phaseContributions: { ...item.overrides.phaseContributions, [phase.id]: { ...item.overrides.phaseContributions?.[phase.id],
        [accountId]: { ...item.overrides.phaseContributions?.[phase.id]?.[accountId], [key]: value },
      } },
    } } : item),
  }));
  if (!phase) return <p className="muted">Add a contribution phase to edit monthly contributions.</p>;
  const trigger = phase.startsWhen;
  const triggerText = trigger.kind === 'always' ? 'Starts immediately' : trigger.kind === 'cashTarget' ? `Starts when ${data.accounts.find((account) => account.id === trigger.accountId)?.name ?? 'cash'} reaches ${money(trigger.amount)}` : trigger.kind === 'age' ? `Starts at age ${trigger.age}` : `Starts on ${trigger.date}`;
  return <div className="editor-stack">
    <SelectField label="Contribution phase" value={phase.id} onChange={setPhaseId}>{data.phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
    <p className="muted">{triggerText}. The budget breakdown below shows this phase; the FIRE projection follows all phases.</p>
    <div className="monthly-contributions"><div className="monthly-contribution-head"><span>Account</span><span>You / month</span><span>Employer / month</span></div>
      {[...budget.rows].sort((a, b) => Number(isTakeHomeBudgetAccount(b.account)) - Number(isTakeHomeBudgetAccount(a.account))).map((row) => <div className="monthly-contribution-row" key={row.account.id}><div><strong>{row.account.name}</strong><small>{row.isPayroll ? 'Payroll · already withheld' : 'Deducted from take-home'}</small></div>
        <span className="mini-money">$<CommittedNumberInput ariaLabel={`${row.account.name} monthly contribution`} min={0} value={Math.round(row.personal * 100) / 100} onCommit={(value) => update(row.account.id, 'personal', value)} /></span>
        <span className="mini-money">$<CommittedNumberInput ariaLabel={`${row.account.name} employer contribution`} min={0} value={Math.round(row.employer * 100) / 100} onCommit={(value) => update(row.account.id, 'employer', value)} /></span>
      </div>)}
    </div>
    <p className="fine-print">Personal contributions to non-payroll accounts reduce unassigned take-home in every phase. Payroll 401(k) and employer contributions are already withheld or paid separately and are not deducted again.</p>
  </div>;
}

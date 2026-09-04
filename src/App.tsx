import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowRight, BarChart3, Check, ChevronRight, CircleDollarSign, Copy, Download,
  Eye, EyeOff, Flame, Gauge, Landmark, Menu, Plus, RefreshCcw, Save, Settings2,
  ShieldCheck, SlidersHorizontal, Trash2, Upload, WalletCards, X,
} from 'lucide-react';
import type { AppData, ProjectionPoint, Scenario, ScenarioResult } from './types';
import { defaultData, scenarioColors } from './defaults';
import {
  allocationByClass, applyScenarioOverrides, calculateFireNumber, emergencyFundMetrics,
  projectCore, projectScenario, scenarioBudgetMetrics,
} from './calculations';
import { downloadData, loadData, readImport, resetData, saveData } from './persistence';
import { AccountsEditor, BudgetEditor, PhasesEditor, ProfileEditor } from './editors';
import { age, Field, Metric, money, percent, Section, TextField, Toggle } from './ui';

type SettingsTab = 'plan' | 'accounts' | 'phases' | 'budget' | 'emergency';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const allocationColors = ['#37d39a', '#65a7ff', '#f4b860', '#ad7bff', '#ff718d', '#40c7d9', '#8191a1'];

const monthStatus = (result: ScenarioResult) => {
  if (!result.firePoint) return { text: 'Not reached by max age', tone: 'negative' as const };
  const delta = (result.profile.retirementAge - result.firePoint.age) * 12;
  if (Math.abs(delta) < 1) return { text: 'On target', tone: 'positive' as const };
  return delta > 0
    ? { text: `${Math.abs(delta / 12).toFixed(1)} years early`, tone: 'positive' as const }
    : { text: `${Math.abs(delta / 12).toFixed(1)} years late`, tone: 'negative' as const };
};

interface ChartDatum { month: number; age: number; year: number; date: string; [key: string]: number | string }

function TimelineChart({ results, selected, onSelect }: { results: ScenarioResult[]; selected: string; onSelect: (id: string) => void }) {
  const [axis, setAxis] = useState<'age' | 'year'>('age');
  const [range, setRange] = useState<'target' | '70' | 'max'>('70');
  const visible = results.filter((result) => result.scenario.visible);
  const first = visible[0] ?? results[0];
  const maxMonth = range === 'target' ? Math.max(...visible.map((r) => Math.ceil((r.profile.retirementAge - r.profile.currentAge) * 12))) : range === '70' ? Math.max(...visible.map((r) => Math.ceil((70 - r.profile.currentAge) * 12))) : Math.max(...visible.map((r) => r.points.length - 1));
  const chartData = useMemo(() => {
    if (!first) return [];
    const rows: ChartDatum[] = [];
    for (let month = 0; month <= maxMonth; month += 3) {
      const point = first.points[Math.min(month, first.points.length - 1)];
      const date = new Date(point.date);
      const row: ChartDatum = { month, age: point.age, year: date.getFullYear() + date.getMonth() / 12, date: point.date };
      visible.forEach((result) => { const item = result.points[Math.min(month, result.points.length - 1)]; if (item) row[result.scenario.id] = item.firePortfolio; });
      rows.push(row);
    }
    return rows;
  }, [first, maxMonth, visible.map((r) => r.scenario.id + r.points.length).join('|')]);

  const tooltip = ({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string; color?: string }>; label?: number | string }) => {
    if (!active || !payload?.length) return null;
    return <div className="chart-tooltip"><strong>{axis === 'age' ? `Age ${Number(label).toFixed(1)}` : `Year ${Math.floor(Number(label))}`}</strong>{payload.map((item) => { const key = String(item.dataKey ?? ''); const value = Number(item.value ?? 0); const result = visible.find((r) => r.scenario.id === key); const startDate = new Date(first.points[0].date); const startYear = startDate.getFullYear() + startDate.getMonth() / 12; const month = Math.round(((Number(label) - (axis === 'age' ? first.profile.currentAge : startYear)) * 12)); const p = result?.points[Math.max(0, Math.min(month, (result?.points.length ?? 1) - 1))]; return <div className="tooltip-row" key={key}><span style={{ background: item.color }} /><div><b>{result?.scenario.name}</b><small>{money(value)} · {p ? money(value - p.fireTarget) : '—'} vs target</small>{p && <small>{money(p.personalContributions + p.employerContributions)} contributed · {money(p.investmentGrowth)} growth</small>}</div></div>; })}</div>;
  };

  if (!first) return <div className="empty-chart">Show at least one scenario to draw the timeline.</div>;
  return <>
    <div className="chart-controls"><div className="segmented"><button className={axis === 'age' ? 'active' : ''} onClick={() => setAxis('age')}>Age</button><button className={axis === 'year' ? 'active' : ''} onClick={() => setAxis('year')}>Calendar year</button></div><select value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="target">Through target age</option><option value="70">Through age 70</option><option value="max">Full projection</option></select></div>
    <div className="main-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 16, right: 18, bottom: 6, left: 4 }}>
      <defs>{visible.map((r) => <filter key={r.scenario.id} id={`glow-${r.scenario.id}`}><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>)}</defs>
      <CartesianGrid vertical={false} stroke="#193642" strokeDasharray="4 5" />
      <XAxis dataKey={axis} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis === 'age' ? Number(v).toFixed(0) : String(Math.floor(v))} stroke="#78909a" tickLine={false} axisLine={false} />
      <YAxis tickFormatter={(v) => money(v, true)} stroke="#78909a" tickLine={false} axisLine={false} width={64} />
      <Tooltip content={tooltip as never} />
      <Legend formatter={(id) => visible.find((r) => r.scenario.id === id)?.scenario.name ?? id} onClick={(item) => onSelect(String(item.dataKey))} />
      {visible.map((result, index) => <ReferenceLine key={`goal-${result.scenario.id}`} y={result.fireNumber} stroke={result.scenario.color} strokeDasharray={`${3 + index} 6`} strokeOpacity={0.35} />)}
      {visible.map((result) => <Line key={result.scenario.id} dataKey={result.scenario.id} type="monotone" stroke={result.scenario.color} strokeWidth={selected === result.scenario.id ? 4 : 2.4} dot={false} activeDot={{ r: 5 }} opacity={selected && selected !== result.scenario.id ? .42 : 1} style={selected === result.scenario.id ? { filter: `url(#glow-${result.scenario.id})` } : undefined} />)}
      {visible.map((result) => result.firePoint && result.firePoint.month <= maxMonth ? <ReferenceDot key={`dot-${result.scenario.id}`} x={axis === 'age' ? result.firePoint.age : new Date(result.firePoint.date).getFullYear() + new Date(result.firePoint.date).getMonth() / 12} y={result.firePoint.firePortfolio} r={5} fill={result.scenario.color} stroke="#071b24" strokeWidth={2} /> : null)}
    </ComposedChart></ResponsiveContainer></div>
    <div className="chart-key"><span><i className="solid-line" /> Portfolio projection</span><span><i className="dash-line" /> Matching FIRE target</span><span><i className="dot-key" /> First target crossing</span></div>
  </>;
}

function ScenarioStrip({ data, setData, selected, setSelected }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; selected: string; setSelected: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const current = data.scenarios.find((s) => s.id === editing);
  const currentCalculatedGoal = current
    ? calculateFireNumber(current.overrides.annualSpending ?? data.profile.annualSpending, current.overrides.withdrawalRate ?? data.profile.withdrawalRate)
    : 0;
  const currentGoal = current
    ? ('customFireNumber' in current.overrides ? current.overrides.customFireNumber ?? currentCalculatedGoal : data.profile.customFireNumber ?? currentCalculatedGoal)
    : 0;
  const patch = (id: string, values: Partial<Scenario>) => setData((old) => ({ ...old, scenarios: old.scenarios.map((s) => s.id === id ? { ...s, ...values } : s) }));
  const patchOverride = (id: string, key: string, value: unknown) => setData((old) => ({ ...old, scenarios: old.scenarios.map((s) => s.id === id ? { ...s, overrides: { ...s.overrides, [key]: value } } : s) }));
  const add = () => {
    if (data.scenarios.length >= 8) return;
    const scenario: Scenario = { id: crypto.randomUUID(), name: `Scenario ${data.scenarios.length + 1}`, visible: true, color: scenarioColors[data.scenarios.length % scenarioColors.length], overrides: {} };
    setData((old) => ({ ...old, scenarios: [...old.scenarios, scenario] })); setSelected(scenario.id); setEditing(scenario.id);
  };
  const duplicate = (scenario: Scenario) => {
    if (data.scenarios.length >= 8) return;
    const copy = { ...clone(scenario), id: crypto.randomUUID(), name: `${scenario.name} copy`, color: scenarioColors[data.scenarios.length % scenarioColors.length] };
    setData((old) => ({ ...old, scenarios: [...old.scenarios, copy] })); setSelected(copy.id);
  };
  const useAsBase = (scenario: Scenario) => {
    setData((old) => {
      const applied = applyScenarioOverrides(old, scenario);
      const budget = old.budget.map((item) => ({ ...item, amount: scenario.overrides.budgetAmounts?.[item.id] ?? item.amount }));
      return { ...old, ...applied, budget, scenarios: old.scenarios.map((item) => item.id === scenario.id ? { ...item, overrides: {} } : item) };
    });
    setEditing(null);
  };
  return <>
    <div className="scenario-strip">{data.scenarios.map((scenario) => <div className={`scenario-chip ${selected === scenario.id ? 'active' : ''} ${scenario.visible ? '' : 'hidden-line'}`} key={scenario.id} style={{ '--scenario': scenario.color } as React.CSSProperties}>
      <button className="scenario-main" onClick={() => setSelected(scenario.id)}><span /><b>{scenario.name}</b></button>
      <button className="chip-icon" aria-label={scenario.visible ? 'Hide scenario' : 'Show scenario'} onClick={() => patch(scenario.id, { visible: !scenario.visible })}>{scenario.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
      <button className="chip-icon" aria-label="Edit scenario" onClick={() => setEditing(scenario.id)}><Settings2 size={14} /></button>
    </div>)}<button className="scenario-add" onClick={add} disabled={data.scenarios.length >= 8}><Plus size={15} /> {data.scenarios.length}/8</button></div>
    {current && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}><div className="modal"><header><div><span className="eyebrow">Scenario overrides</span><h2>Edit {current.name}</h2></div><button className="icon-button" onClick={() => setEditing(null)}><X /></button></header><div className="modal-content">
      <TextField label="Scenario name" value={current.name} onChange={(v) => patch(current.id, { name: v })} />
      <div className="scenario-goal-editor"><Field label="FIRE goal for this scenario" value={currentGoal} prefix="$" min={1} step={10000} onChange={(v) => patchOverride(current.id, 'customFireNumber', Math.max(1, v))} hint="Overrides the spending-based target for this scenario and updates every dependent result." /><div><span>Formula target</span><strong>{money(currentCalculatedGoal)}</strong><button className="text-button" onClick={() => patchOverride(current.id, 'customFireNumber', null)}>Use spending ÷ withdrawal rate</button></div></div>
      <div className="editor-grid"><Field label="Real return" value={(current.overrides.realReturn ?? data.profile.realReturn) * 100} suffix="%" step={0.1} min={-99} onChange={(v) => patchOverride(current.id, 'realReturn', v / 100)} /><Field label="Annual spending" value={current.overrides.annualSpending ?? data.profile.annualSpending} prefix="$" min={0} step={500} onChange={(v) => patchOverride(current.id, 'annualSpending', v)} /><Field label="Withdrawal rate" value={(current.overrides.withdrawalRate ?? data.profile.withdrawalRate) * 100} suffix="%" step={0.05} min={0.1} onChange={(v) => patchOverride(current.id, 'withdrawalRate', v / 100)} /><Field label="Target retirement age" value={current.overrides.retirementAge ?? data.profile.retirementAge} step={0.1} min={data.profile.currentAge + .1} onChange={(v) => patchOverride(current.id, 'retirementAge', v)} /><Field label="Emergency cash target" value={current.overrides.cashTarget ?? data.profile.emergencyTarget} prefix="$" min={0} onChange={(v) => patchOverride(current.id, 'cashTarget', v)} /></div>
      <p className="scenario-budget-note">Edit exact monthly expenses and account contributions in the selected scenario budget below the charts.</p>
      <div className="toggle-grid"><Toggle label="Count cash toward FIRE" detail="Scenario only" checked={current.overrides.includeCashInFire ?? false} onChange={(v) => patchOverride(current.id, 'includeCashInFire', v)} /><Toggle label="Count crypto toward FIRE" detail="Scenario only; uses its account return" checked={current.overrides.includeCryptoInFire ?? false} onChange={(v) => patchOverride(current.id, 'includeCryptoInFire', v)} /></div>
      <div className="scenario-modal-actions"><button className="button secondary" onClick={() => useAsBase(current)}><Flame size={15} /> Set as base</button><button className="button secondary" onClick={() => duplicate(current)} disabled={data.scenarios.length >= 8}><Copy size={15} /> Duplicate</button><button className="button secondary" onClick={() => patch(current.id, { overrides: {} })}><RefreshCcw size={15} /> Reset overrides</button>{data.scenarios.length > 1 && <button className="button danger" onClick={() => { setData((old) => ({ ...old, scenarios: old.scenarios.filter((s) => s.id !== current.id) })); setSelected(data.scenarios.find((s) => s.id !== current.id)!.id); setEditing(null); }}><Trash2 size={15} /> Delete</button>}</div>
    </div></div></div>}
  </>;
}

function SummaryTable({ results, selected, onSelect }: { results: ScenarioResult[]; selected: string; onSelect: (id: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>FIRE goal</th><th>FIRE age / date</th><th>At target age</th><th>Monthly investing</th><th>Surplus / shortfall</th><th>Status</th></tr></thead><tbody>{results.map((result) => { const delta = result.targetPoint.firePortfolio - result.targetPoint.fireTarget; const status = monthStatus(result); return <tr key={result.scenario.id} className={selected === result.scenario.id ? 'selected' : ''} onClick={() => onSelect(result.scenario.id)}><td><i style={{ background: result.scenario.color }} /><strong>{result.scenario.name}</strong></td><td>{money(result.fireNumber, true)}</td><td><strong>{age(result.firePoint?.age)}</strong><small>{result.firePoint ? new Date(result.firePoint.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : `By age ${result.profile.maxAge}`}</small></td><td>{money(result.targetPoint.firePortfolio, true)}</td><td>{money(result.plannedPersonalMonthly + result.plannedEmployerMonthly)}/mo<small>{money(result.plannedEmployerMonthly)} employer</small></td><td className={delta >= 0 ? 'positive-text' : 'negative-text'}>{delta >= 0 ? '+' : ''}{money(delta, true)}</td><td><span className={`status ${status.tone}`}>{status.text}</span></td></tr>; })}</tbody></table></div>;
}

function Analytics({ result, data }: { result: ScenarioResult; data: AppData }) {
  const focus = result.firePoint ?? result.targetPoint;
  const composition = [
    { name: 'Starting principal', value: focus.startingPrincipal, color: '#65a7ff' },
    { name: 'Personal contributions', value: focus.personalContributions, color: '#37d39a' },
    { name: 'Employer contributions', value: focus.employerContributions, color: '#f4b860' },
    { name: 'Investment growth', value: Math.max(0, focus.investmentGrowth), color: '#ad7bff' },
  ];
  const accountData = result.points.filter((_, index) => index % 12 === 0 && index <= Math.min(result.points.length - 1, Math.ceil((65 - result.profile.currentAge) * 12))).map((p) => ({ age: p.age, ...p.balances }));
  const allocations = allocationByClass(data.accounts);
  return <div className="analytics-grid">
    <Section title="What builds the portfolio" eyebrow={result.firePoint ? 'At FIRE date' : 'At target age'}>
      <div className="composition"><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={composition} dataKey="value" innerRadius={48} outerRadius={76} paddingAngle={3}>{composition.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(v) => money(Number(v))} /></PieChart></ResponsiveContainer><div><strong>{money(focus.firePortfolio, true)}</strong><small>Total</small></div></div><div className="legend-list">{composition.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><b>{money(item.value, true)}</b><small>{percent(item.value / Math.max(1, focus.firePortfolio))}</small></div>)}</div></div>
    </Section>
    <Section title="All-account allocation" eyebrow="Current holdings">
      <div className="allocation-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={allocations} layout="vertical" margin={{ left: 16, right: 20 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={112} tick={{ fill: '#a9bac0', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="value" radius={[0, 5, 5, 0]}>{allocations.map((_, i) => <Cell key={i} fill={allocationColors[i % allocationColors.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
    </Section>
    <Section title="Account balances over time" eyebrow="Selected scenario · independent balances" className="wide-panel">
      <div className="account-chart-note"><span>Each line is one account—not a cumulative stack.</span><span>Monthly contribution → monthly compounded growth</span></div>
      <div className="account-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={accountData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="#193642" /><XAxis dataKey="age" tickFormatter={(v) => Number(v).toFixed(0)} stroke="#78909a" axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => money(v, true)} stroke="#78909a" width={58} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => `Age ${Number(v).toFixed(0)}`} />{result.accounts.map((account, i) => <Line key={account.id} type="monotone" dataKey={account.id} name={account.name} stroke={scenarioColors[i % scenarioColors.length]} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />)}</LineChart></ResponsiveContainer></div>
    </Section>
  </div>;
}

function BridgeAndEmergency({ result, data, setData }: { result: ScenarioResult; data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const firePoint = result.firePoint;
  const fireAge = firePoint?.age ?? result.profile.retirementAge;
  const bridgeYears = Math.max(0, 59.5 - fireAge);
  const bridgeNeed = bridgeYears * result.profile.annualSpending;
  const accessible = firePoint?.accessible ?? result.targetPoint.accessible;
  const cashAccount = data.accounts.find((a) => a.type === 'HYSA / Cash');
  const phase = data.phases[0];
  const cashSavings = cashAccount ? (phase?.contributions[cashAccount.id]?.personal ?? cashAccount.monthlyContribution) : 0;
  const emergency = emergencyFundMetrics(cashAccount?.balance ?? 0, data.profile.emergencyTarget, cashSavings, data.profile.normalMonthlySpending, data.profile.jobLossMonthlySpending);
  const update = (key: keyof AppData['profile'], value: number) => setData((old) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  return <div className="bridge-grid">
    <Section title="Early retirement bridge" eyebrow="Access before 59½"><div className="bridge-callout"><div className={`bridge-ring ${accessible >= bridgeNeed ? 'good' : 'warn'}`}><strong>{percent(Math.min(1, accessible / Math.max(1, bridgeNeed)), 0)}</strong><small>funded</small></div><div><h3>{accessible >= bridgeNeed ? 'Your estimated bridge is covered' : `${money(bridgeNeed - accessible)} bridge gap`}</h3><p>{money(accessible)} accessible against an estimated {money(bridgeNeed)} needed for {bridgeYears.toFixed(1)} years.</p></div></div><div className="mini-metrics"><div><span>Accessible at FIRE</span><strong>{money(accessible)}</strong></div><div><span>Annual spending</span><strong>{money(result.profile.annualSpending)}</strong></div><div><span>Bridge years</span><strong>{bridgeYears.toFixed(1)}</strong></div></div><p className="fine-print">Planning estimate only. “Potentially accessible” includes only the Roth IRA contribution basis you entered; tax and withdrawal rules may change.</p></Section>
    <Section title="Emergency fund" eyebrow="Cash runway"><div className="editor-grid compact-fields"><Field label="Cash target" value={data.profile.emergencyTarget} prefix="$" min={0} onChange={(v) => update('emergencyTarget', v)} /><Field label="Normal monthly spend" value={data.profile.normalMonthlySpending} prefix="$" min={1} onChange={(v) => update('normalMonthlySpending', v)} /><Field label="Job-loss monthly spend" value={data.profile.jobLossMonthlySpending} prefix="$" min={1} onChange={(v) => update('jobLossMonthlySpending', v)} /></div><div className="mini-metrics"><div><span>Normal runway</span><strong>{emergency.normalRunway.toFixed(1)} mo</strong></div><div><span>Job-loss runway</span><strong>{emergency.jobLossRunway.toFixed(1)} mo</strong></div><div><span>Target ETA</span><strong>{Number.isFinite(emergency.monthsToTarget) ? `${emergency.monthsToTarget} mo` : 'No savings'}</strong></div></div><div className="progress"><span style={{ width: `${Math.min(100, (cashAccount?.balance ?? 0) / Math.max(1, data.profile.emergencyTarget) * 100)}%` }} /></div><small className="muted">{money(emergency.remaining)} remaining · {money(cashSavings)}/mo current cash savings</small></Section>
  </div>;
}

function Sensitivity({ data, selectedScenario }: { data: AppData; selectedScenario: Scenario }) {
  const fireAgeFor = (scenario: Scenario) => {
    const { profile, accounts, phases } = applyScenarioOverrides(data, scenario);
    const crossing = projectCore({ profile, accounts, phases }).find((p) => p.firePortfolio >= p.fireTarget);
    return crossing?.age;
  };
  const returns = [.03, .04, .05, .06, .07].map((value) => ({ label: percent(value, 0), age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, realReturn: value } }) }));
  const contributions = [-1000, -500, -250, 0, 250, 500, 1000].map((delta) => { const current = selectedScenario.overrides.contributionScale ?? 1; const base = Math.max(1, data.phases.at(-1) ? Object.values(data.phases.at(-1)!.contributions).reduce((s, v) => s + v.personal, 0) : 1); return { label: delta === 0 ? 'Base' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`, age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, contributionScale: Math.max(0, current + delta / base) } }) }; });
  const spending = [-.2, -.1, 0, .1, .2].map((delta) => ({ label: delta === 0 ? 'Base' : `${delta > 0 ? '+' : ''}${percent(delta, 0)}`, age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, annualSpending: (selectedScenario.overrides.annualSpending ?? data.profile.annualSpending) * (1 + delta) } }) }));
  const rates = [.03, .0325, .035, .0375, .04].map((value) => ({ label: percent(value, value % .01 ? 2 : 1), age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, withdrawalRate: value } }) }));
  const group = (title: string, items: { label: string; age?: number }[]) => <div className="sensitivity-group"><strong>{title}</strong><div>{items.map((item) => <span key={item.label}><small>{item.label}</small><b>{item.age ? item.age.toFixed(1) : '—'}</b></span>)}</div></div>;
  return <Section title="Sensitivity explorer" eyebrow="One assumption at a time"><p className="muted">Resulting FIRE age for <strong>{selectedScenario.name}</strong>. Each row changes only the labeled assumption.</p><div className="sensitivity-grid">{group('Real return', returns)}{group('Monthly contribution', contributions)}{group('Annual spending', spending)}{group('Withdrawal rate', rates)}</div></Section>;
}

function ScenarioContributionEditor({ open, close, data, setData, scenario }: { open: boolean; close: () => void; data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; scenario: Scenario }) {
  const metrics = useMemo(() => scenarioBudgetMetrics(data, scenario), [data, scenario]);
  const [phaseId, setPhaseId] = useState(metrics.phase.id);
  useEffect(() => { if (open) setPhaseId(metrics.phase.id); }, [open, scenario.id, metrics.phase.id]);
  const effective = useMemo(() => applyScenarioOverrides(data, scenario), [data, scenario]);
  const phase = effective.phases.find((item) => item.id === phaseId) ?? effective.phases[0];
  const phaseTotals = effective.accounts.reduce((totals, account) => {
    const amount = phase.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution };
    if (account.includeInNetWorth) totals.personal += amount.personal;
    totals.employer += amount.employer;
    if (account.fireEligible) totals.fire += amount.personal + amount.employer;
    if (account.type === 'HYSA / Cash') totals.cash += amount.personal;
    return totals;
  }, { personal: 0, employer: 0, fire: 0, cash: 0 });
  const update = (accountId: string, key: 'personal' | 'employer', value: number) => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((item) => item.id === scenario.id ? {
      ...item,
      overrides: {
        ...item.overrides,
        phaseContributions: {
          ...item.overrides.phaseContributions,
          [phase.id]: {
            ...item.overrides.phaseContributions?.[phase.id],
            [accountId]: {
              ...item.overrides.phaseContributions?.[phase.id]?.[accountId],
              [key]: Math.max(0, value),
            },
          },
        },
      },
    } : item),
  }));
  const resetPhase = () => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((item) => {
      if (item.id !== scenario.id) return item;
      const phaseContributions = { ...(item.overrides.phaseContributions ?? {}) };
      delete phaseContributions[phase.id];
      return { ...item, overrides: { ...item.overrides, phaseContributions } };
    }),
  }));
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal contribution-modal"><header><div><span className="eyebrow">{scenario.name}</span><h2>Scenario contributions</h2></div><button className="icon-button" onClick={close}><X /></button></header><div className="modal-content">
    <p className="muted">These amounts override this scenario only. They update the FIRE projection and monthly budget together.</p>
    <label className="field"><span className="field-label">Contribution phase</span><span className="select-shell"><select value={phase.id} onChange={(event) => setPhaseId(event.target.value)}>{effective.phases.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === metrics.phase.id ? ' · active now' : ''}</option>)}</select></span></label>
    <div className="scenario-contribution-head"><span>Account</span><span>Personal / month</span><span>Employer / month</span></div>
    <div className="scenario-contribution-list">{effective.accounts.map((account) => { const amount = phase.contributions[account.id] ?? { personal: account.monthlyContribution, employer: account.employerContribution }; return <div className="scenario-contribution-row" key={account.id}><div><strong>{account.name}</strong><small>{account.type.includes('401(k)') ? 'Payroll' : account.fireEligible ? 'From deposited pay · FIRE' : 'From deposited pay'}</small></div><span className="mini-money">$<input aria-label={`${account.name} personal contribution`} type="number" min="0" value={Math.round(amount.personal * 100) / 100} onChange={(event) => update(account.id, 'personal', Number(event.target.value))} /></span><span className="mini-money">$<input aria-label={`${account.name} employer contribution`} type="number" min="0" value={Math.round(amount.employer * 100) / 100} onChange={(event) => update(account.id, 'employer', Number(event.target.value))} /></span></div>; })}</div>
    <div className="contribution-totals"><div><span>Personal wealth building</span><strong>{money(phaseTotals.personal)}/mo</strong></div><div><span>Employer</span><strong>{money(phaseTotals.employer)}/mo</strong></div><div><span>Total FIRE investing</span><strong>{money(phaseTotals.fire)}/mo</strong></div><div><span>Cash savings</span><strong>{money(phaseTotals.cash)}/mo</strong></div></div>
    <div className="scenario-modal-actions"><button className="button secondary" onClick={resetPhase}><RefreshCcw size={15} /> Reset this phase</button><button className="button primary" onClick={close}>Done</button></div>
  </div></div></div>;
}

function SettingsDrawer({ open, close, tab, setTab, data, setData }: { open: boolean; close: () => void; tab: SettingsTab; setTab: (tab: SettingsTab) => void; data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const tabs: Array<[SettingsTab, string, React.ReactNode]> = [['plan', 'Plan', <SlidersHorizontal size={17} />], ['accounts', 'Accounts', <WalletCards size={17} />], ['phases', 'Contributions', <ArrowRight size={17} />], ['budget', 'Budget', <BarChart3 size={17} />], ['emergency', 'Emergency', <ShieldCheck size={17} />]];
  return <><div className={`drawer-backdrop ${open ? 'show' : ''}`} onClick={close} /><aside className={`settings-drawer ${open ? 'open' : ''}`}><header><div><span className="eyebrow">Inherited by every scenario</span><h2>Shared defaults</h2></div><button className="icon-button" onClick={close}><X /></button></header><nav>{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{icon}{label}</button>)}</nav><div className="drawer-content"><p className="shared-default-note">These values are starting defaults. Edit the selected scenario’s monthly amounts directly in its allocation table.</p>{tab === 'plan' && <ProfileEditor data={data} setData={setData} />}{tab === 'accounts' && <AccountsEditor data={data} setData={setData} />}{tab === 'phases' && <PhasesEditor data={data} setData={setData} />}{tab === 'budget' && <BudgetEditor data={data} setData={setData} />}{tab === 'emergency' && <div className="editor-stack"><p className="muted">Emergency savings are included in net worth, but excluded from the FIRE portfolio by default.</p><Field label="Emergency fund target" value={data.profile.emergencyTarget} prefix="$" min={0} onChange={(v) => setData((old) => ({ ...old, profile: { ...old.profile, emergencyTarget: v } }))} /><Field label="Normal monthly spending" value={data.profile.normalMonthlySpending} prefix="$" min={1} onChange={(v) => setData((old) => ({ ...old, profile: { ...old.profile, normalMonthlySpending: v } }))} /><Field label="Job-loss monthly spending" value={data.profile.jobLossMonthlySpending} prefix="$" min={1} onChange={(v) => setData((old) => ({ ...old, profile: { ...old.profile, jobLossMonthlySpending: v } }))} /></div>}</div></aside></>;
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selected, setSelected] = useState(() => data.scenarios[0]?.id ?? '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('plan');
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => data.scenarios.map((scenario) => projectScenario(data, scenario)), [data]);
  const base = results.find((result) => result.scenario.id === selected) ?? results[0];
  const selectedScenario = data.scenarios.find((scenario) => scenario.id === base?.scenario.id) ?? data.scenarios[0];
  const fireInvestingPhaseId = data.phases.find((phase) => phase.name.toLowerCase().includes('fire'))?.id ?? data.phases[data.phases.length - 1]?.id;
  const selectedBudget = useMemo(() => selectedScenario ? scenarioBudgetMetrics(data, selectedScenario) : null, [data, selectedScenario]);
  const requiredBudget = useMemo(() => selectedScenario && base && Number.isFinite(base.requiredContributionScale) ? scenarioBudgetMetrics(data, selectedScenario, base.requiredContributionScale) : selectedBudget, [data, selectedScenario, base, selectedBudget]);
  const comparisonBudgets = useMemo(() => data.scenarios.map((scenario) => ({ scenario, budget: scenarioBudgetMetrics(data, scenario, 1, fireInvestingPhaseId) })), [data, fireInvestingPhaseId]);
  const selectedPhaseId = selectedBudget?.phase.id ?? data.phases[0]?.id ?? '';
  const status = base ? monthStatus(base) : { text: 'No scenario', tone: 'negative' as const };

  useEffect(() => { const timeout = window.setTimeout(() => saveData(data), 350); return () => window.clearTimeout(timeout); }, [data]);
  useEffect(() => { if (toast) { const timeout = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timeout); } }, [toast]);

  const openSettings = (tab: SettingsTab) => { setSettingsTab(tab); setSettingsOpen(true); };
  const handleImport = async (file?: File) => { if (!file) return; try { const next = await readImport(file); setData(next); setSelected(next.scenarios[0]?.id ?? ''); setToast('Plan imported successfully'); } catch (error) { setToast(error instanceof Error ? error.message : 'Import failed'); } };
  const handleReset = () => { if (!window.confirm('Reset the entire planner to its seeded defaults?')) return; const next = resetData(); setData(next); setSelected(next.scenarios[0].id); setToast('Planner reset'); };
  const setActiveFireGoal = (value: number) => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((scenario) => scenario.id === base.scenario.id
      ? { ...scenario, overrides: { ...scenario.overrides, customFireNumber: Math.max(1, value) } }
      : scenario),
  }));
  const resetActiveFireGoal = () => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((scenario) => scenario.id === base.scenario.id
      ? { ...scenario, overrides: { ...scenario.overrides, customFireNumber: null } }
      : scenario),
  }));
  const updateSelectedBudgetItem = (itemId: string, value: number) => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((scenario) => scenario.id === base.scenario.id ? { ...scenario, overrides: { ...scenario.overrides, budgetAmounts: { ...scenario.overrides.budgetAmounts, [itemId]: Math.max(0, value) } } } : scenario),
  }));
  const updateSelectedContribution = (accountId: string, key: 'personal' | 'employer', value: number) => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((scenario) => scenario.id === base.scenario.id ? { ...scenario, overrides: { ...scenario.overrides, phaseContributions: { ...scenario.overrides.phaseContributions, [selectedPhaseId]: { ...scenario.overrides.phaseContributions?.[selectedPhaseId], [accountId]: { ...scenario.overrides.phaseContributions?.[selectedPhaseId]?.[accountId], [key]: Math.max(0, value) } } } } } : scenario),
  }));
  const resetSelectedBudget = () => setData((old) => ({
    ...old,
    scenarios: old.scenarios.map((scenario) => {
      if (scenario.id !== base.scenario.id) return scenario;
      const phaseContributions = { ...(scenario.overrides.phaseContributions ?? {}) };
      delete phaseContributions[selectedPhaseId];
      const { budgetAmounts: _budgetAmounts, ...otherOverrides } = scenario.overrides;
      return { ...scenario, overrides: { ...otherOverrides, phaseContributions } };
    }),
  }));

  if (!base || !selectedScenario || !selectedBudget || !requiredBudget) return <main className="fatal"><Flame /><h1>No scenarios found</h1><button className="button primary" onClick={() => setData(clone(defaultData))}>Restore defaults</button></main>;
  const delta = base.targetPoint.firePortfolio - base.targetPoint.fireTarget;
  const fireProgress = base.currentFirePortfolio / Math.max(1, base.fireNumber);
  const wealthShare = requiredBudget.personalWealth / Math.max(1, requiredBudget.incomeBasis);
  const contributionDifference = base.plannedPersonalMonthly - base.requiredPersonalMonthly;
  const allocationRows = [
    ...data.budget.map((item) => { const amount = selectedScenario.overrides.budgetAmounts?.[item.id] ?? item.amount; return { id: item.id, kind: 'budget' as const, group: item.category, name: item.name, planned: amount, required: amount }; }),
    ...selectedBudget.rows.filter((row) => row.account.includeInNetWorth).map((row) => ({
      id: row.account.id,
      kind: 'personal' as const,
      group: row.isPayroll ? 'Payroll investing' : row.account.type === 'HYSA / Cash' ? 'Cash savings' : 'Investing',
      name: row.account.name,
      planned: row.personal,
      required: requiredBudget.rows.find((item) => item.account.id === row.account.id)?.personal ?? row.personal,
    })),
    ...selectedBudget.rows.filter((row) => row.employer > 0).map((row) => ({ id: `${row.account.id}-employer`, accountId: row.account.id, kind: 'employer' as const, group: 'Employer · not from your budget', name: `${row.account.name} employer`, planned: row.employer, required: row.employer })),
  ];
  const comparisonRows = [
    ...data.budget.map((item) => ({ id: item.id, kind: 'budget' as const, group: item.category, name: item.name })),
    ...data.accounts.filter((account) => account.includeInNetWorth).map((account) => ({ id: account.id, kind: 'personal' as const, group: account.type.includes('401(k)') ? 'Before take-home · not counted' : account.type === 'HYSA / Cash' ? 'Cash savings' : 'Investing', name: account.name })),
    { id: 'remaining', kind: 'remaining' as const, group: 'Zero-based take-home', name: 'Flexible buffer / needed cuts' },
    { id: 'take-home', kind: 'income' as const, group: 'Zero-based take-home', name: 'Deposited take-home assigned' },
    { id: 'unassigned', kind: 'unassigned' as const, group: 'Zero-based take-home', name: 'Unassigned dollars' },
  ];
  const comparisonValue = (row: typeof comparisonRows[number], scenario: Scenario, budget: typeof selectedBudget) => {
    if (row.kind === 'budget') return scenario.overrides.budgetAmounts?.[row.id] ?? data.budget.find((item) => item.id === row.id)?.amount ?? 0;
    if (row.kind === 'remaining') return budget.remaining;
    if (row.kind === 'income') return budget.takeHomeIncome;
    if (row.kind === 'unassigned') return 0;
    const accountRow = budget.rows.find((item) => item.account.id === row.id);
    return accountRow?.personal ?? 0;
  };

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span><Flame size={19} /></span><div><strong>FIRE Projector</strong><small>{data.profile.mode === 'real' ? 'Today’s dollars' : 'Future nominal dollars'}</small></div></div><div className="top-actions"><button className="button ghost" onClick={() => { saveData(data); setToast('Saved locally'); }}><Save size={16} /> <span>Save</span></button><button className="button ghost" onClick={() => downloadData(data)}><Download size={16} /> <span>Export</span></button><button className="button ghost" onClick={() => importRef.current?.click()}><Upload size={16} /> <span>Import</span></button><button className="button ghost" onClick={handleReset}><RefreshCcw size={16} /> <span>Reset</span></button><button className="button primary" onClick={() => openSettings('plan')}><Settings2 size={16} /> Shared defaults</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => void handleImport(e.target.files?.[0])} /></div></header>

    <main className="workspace">
      <section className="hero"><div><span className="eyebrow">{data.profile.name}</span><h1>{base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'You’re on track.' : 'Your target needs a nudge.'}</h1><p>{base.firePoint ? <>At your current plan, <strong>{base.scenario.name}</strong> reaches financial independence at <strong>age {base.firePoint.age.toFixed(1)}</strong>—<span className={status.tone === 'positive' ? 'positive-text' : 'negative-text'}>{status.text}</span>.</> : <>This scenario does not reach its FIRE target by age {base.profile.maxAge}. Increase contributions, reduce spending, or revisit the timeline.</>}</p></div><div className={`hero-status ${status.tone}`}><span>{status.tone === 'positive' ? <Check size={17} /> : <Gauge size={17} />}</span><div><small>At target age {base.profile.retirementAge}</small><strong>{delta >= 0 ? '+' : ''}{money(delta, true)}</strong><em>{delta >= 0 ? 'projected surplus' : 'projected shortfall'}</em></div></div></section>

      <section className="metrics-grid">
        <Metric label="Total net worth" value={money(base.currentNetWorth)} sub="All included accounts" info="Everything included in net worth, whether or not it funds FIRE." />
        <Metric label="FIRE portfolio" value={money(base.currentFirePortfolio)} sub={`${percent(fireProgress)} of target`} tone="accent" info="Only accounts marked FIRE eligible." />
        <div className="metric fire-goal-metric">
          <span className="metric-label">FIRE goal <span className="hint" title="Edit this number to override the target for the active scenario."><CircleDollarSign size={13} /></span></span>
          <span className="goal-input"><span>$</span><input aria-label="FIRE goal" type="number" min="1" step="10000" value={Math.round(base.fireNumber)} onChange={(event) => setActiveFireGoal(Number(event.target.value))} /></span>
          {base.profile.customFireNumber == null
            ? <small>{money(base.profile.annualSpending)}/yr ÷ {percent(base.profile.withdrawalRate)} · editable</small>
            : <button className="goal-reset" onClick={resetActiveFireGoal}>Custom target · reset to formula</button>}
        </div>
        <Metric label="Projected FIRE" value={age(base.firePoint?.age)} sub={base.firePoint ? new Date(base.firePoint.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `Not by age ${base.profile.maxAge}`} tone={base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'positive' : 'negative'} />
        <Metric label="Monthly FIRE investing" value={`${money(base.plannedPersonalMonthly + base.plannedEmployerMonthly)}/mo`} sub={`${money(base.plannedEmployerMonthly)} from employer`} />
        <Metric label="Required FIRE contribution" value={Number.isFinite(base.requiredPersonalMonthly) ? `${money(base.requiredPersonalMonthly)}/mo` : 'Not reachable'} sub={!Number.isFinite(base.requiredPersonalMonthly) ? 'Goal is outside the solver range' : Math.abs(contributionDifference) < 1 ? 'Current allocation is on target' : contributionDifference > 0 ? `${money(contributionDifference)}/mo above minimum` : `${money(-contributionDifference)}/mo more needed`} tone={contributionDifference >= 0 ? 'positive' : 'negative'} info="Minimum personal FIRE contribution, preserving this scenario’s account allocation proportions across its phases." />
      </section>

      <nav className="quick-nav"><button onClick={() => openSettings('plan')}><SlidersHorizontal />Shared assumptions<ChevronRight /></button><button onClick={() => openSettings('accounts')}><WalletCards />Shared accounts<ChevronRight /></button><button onClick={() => openSettings('phases')}><ArrowRight />Default phases<ChevronRight /></button><button onClick={() => openSettings('budget')}><BarChart3 />Default budget items<ChevronRight /></button></nav>

      <Section title="Scenario timelines" eyebrow="Compare every path" action={<span className="panel-note"><CircleDollarSign size={14} /> Monthly compounding</span>}>
        <ScenarioStrip data={data} setData={setData} selected={base.scenario.id} setSelected={setSelected} />
        <TimelineChart results={results} selected={base.scenario.id} onSelect={setSelected} />
      </Section>

      <Section title="Scenario scorecard" eyebrow="Click a row to focus"><SummaryTable results={results} selected={base.scenario.id} onSelect={setSelected} /></Section>
      <Analytics result={base} data={data} />
      <BridgeAndEmergency result={base} data={data} setData={setData} />

      <div className="budget-summary">
        <Section title="Selected scenario monthly budget" eyebrow={`${base.scenario.name} · ${selectedBudget.phase.name} · Goal ${money(base.fireNumber)} by age ${base.profile.retirementAge}`} action={<div className="budget-actions"><button className="text-button" onClick={() => openSettings('budget')}>Edit shared item list</button><button className="button secondary" onClick={resetSelectedBudget}><RefreshCcw size={14} /> Reset selected budget</button></div>}>
          <div className={`allocation-summary ${contributionDifference >= 0 ? 'positive' : 'negative'}`}><div><strong>{contributionDifference >= 0 ? 'Your planned contributions are sufficient' : 'Your current plan needs more monthly FIRE investing'}</strong><span>{contributionDifference >= 0 ? `${money(contributionDifference)}/mo above the modeled minimum for this target.` : `Add ${money(-contributionDifference)}/mo across FIRE accounts to reach the target at the specified age.`}</span></div><b>{percent(base.requiredContributionScale, 0)}<small>of planned FIRE allocations required</small></b></div>
          <div className="budget-bars">{[
            ['Needs', requiredBudget.needs, data.profile.budgetTargets.needs, '#65a7ff'], ['Wants', requiredBudget.wants, data.profile.budgetTargets.wants, '#f4b860'], ['Required wealth building', requiredBudget.personalWealth, data.profile.budgetTargets.wealth, '#37d39a'],
          ].map(([label, value, target, color]) => { const share = Number(value) / Math.max(1, requiredBudget.incomeBasis); return <div key={String(label)}><div><span>{label}</span><b>{money(Number(value))} · {percent(share)}</b><small>Target {percent(Number(target))}</small></div><div className="bar-track"><span style={{ width: `${Math.min(100, share * 100)}%`, background: String(color) }} /><i style={{ left: `${Math.min(100, Number(target) * 100)}%` }} /></div></div>; })}</div>
          <div className="allocation-table"><div className="allocation-row allocation-head"><span>Monthly item</span><span>Scenario amount</span><span>Required</span><span>Difference</span></div>{allocationRows.map((row) => { const change = row.required - row.planned; const accountId = 'accountId' in row ? row.accountId : row.id; return <div className="allocation-row" key={`${row.group}-${row.id}`}><span><small>{row.group}</small><strong>{row.name}</strong></span><span className="inline-budget-input"><i>$</i><input aria-label={`${row.name} scenario amount`} type="number" min="0" value={Math.round(row.planned * 100) / 100} onChange={(event) => row.kind === 'budget' ? updateSelectedBudgetItem(row.id, Number(event.target.value)) : updateSelectedContribution(accountId, row.kind, Number(event.target.value))} /></span><span>{money(row.required)}</span><span className={change > .5 ? 'negative-text' : change < -.5 ? 'positive-text' : ''}>{Math.abs(change) < .5 ? '—' : `${change > 0 ? '+' : '−'}${money(Math.abs(change))}`}</span></div>; })}<div className="allocation-row zero-sum-adjustment"><span><small>Zero-based take-home</small><strong>Flexible buffer / needed cuts</strong></span><span className={selectedBudget.remaining < 0 ? 'negative-text' : ''}>{money(selectedBudget.remaining)}</span><span className={requiredBudget.remaining < 0 ? 'negative-text' : ''}>{money(requiredBudget.remaining)}</span><span>{Math.abs(requiredBudget.remaining - selectedBudget.remaining) < .5 ? '—' : money(requiredBudget.remaining - selectedBudget.remaining)}</span></div><div className="allocation-row zero-sum-total"><span><small>Zero-based check</small><strong>Unassigned dollars</strong></span><span>$0</span><span>$0</span><span>—</span></div></div>
          <div className="cashflow-math"><div><span>Stated take-home</span><strong>{money(requiredBudget.takeHomeIncome)}</strong><small>Payroll retirement stays outside this amount</small></div><i>−</i><div><span>Needs + wants</span><strong>{money(requiredBudget.needs + requiredBudget.wants)}</strong><small>Normal monthly budget</small></div><i>−</i><div><span>From deposited pay</span><strong>{money(requiredBudget.personalWealth - requiredBudget.payrollPersonal)}</strong><small>Required investing and cash savings</small></div><i>=</i><div className={requiredBudget.remaining >= 0 ? 'cashflow-positive' : 'cashflow-negative'}><span>{requiredBudget.remaining >= 0 ? 'Flexible spending buffer' : 'Cuts or income needed'}</span><strong>{money(Math.abs(requiredBudget.remaining))}</strong><small>{requiredBudget.remaining >= 0 ? 'Assigned as the zero-sum balancing line' : 'Reduce another line or increase take-home'}</small></div></div>
          <div className="budget-detail-strip"><span><b>{money(requiredBudget.fireInvesting)}</b> required FIRE investing</span><span><b>{money(requiredBudget.cashSavings)}</b> cash savings</span><span><b>{money(requiredBudget.employerWealth)}</b> employer contribution</span><span><b>{money(selectedBudget.personalWealth)}</b> currently planned wealth building</span></div>
          <p className="fine-print">Required amounts are solved against this scenario’s goal and target age, preserving its FIRE-account contribution proportions across phases. Deposited take-home is fully assigned across expenses, non-payroll wealth building, and the zero-sum adjustment. Payroll and employer contributions stay outside take-home to prevent double-counting. Required wealth-building share: {percent(wealthShare)}.</p>
          <div className="budget-comparison"><div className="comparison-title"><div><span className="eyebrow">FIRE-investing phase · zero-based</span><h3>Monthly line-item comparison</h3></div><small>{comparisonBudgets[0]?.budget.phase.name ?? 'FIRE investing'} · every take-home dollar is assigned; payroll is shown separately.</small></div><div className="comparison-scroll"><div className="comparison-grid" style={{ '--scenario-count': data.scenarios.length } as React.CSSProperties}><div className="comparison-corner">Monthly item</div>{comparisonBudgets.map(({ scenario }) => <button key={scenario.id} className={`comparison-scenario ${scenario.id === base.scenario.id ? 'active' : ''}`} onClick={() => setSelected(scenario.id)}><i style={{ background: scenario.color }} /><span>{scenario.name}</span></button>)}{comparisonRows.flatMap((row) => {
            const baseline = comparisonBudgets[0] ? comparisonValue(row, comparisonBudgets[0].scenario, comparisonBudgets[0].budget) : 0;
            return [<div className={`comparison-label ${['remaining', 'income', 'unassigned'].includes(row.kind) ? 'summary' : ''}`} key={`label-${row.kind}-${row.id}`}><small>{row.group}</small><strong>{row.name}</strong></div>, ...comparisonBudgets.map(({ scenario, budget }) => { const value = comparisonValue(row, scenario, budget); const difference = value - baseline; return <button key={`${row.kind}-${row.id}-${scenario.id}`} className={`comparison-value ${scenario.id === base.scenario.id ? 'active' : ''} ${row.kind === 'remaining' && value < 0 ? 'negative-text' : ''}`} onClick={() => setSelected(scenario.id)}><strong>{money(value)}</strong><small>{scenario === comparisonBudgets[0]?.scenario || Math.abs(difference) < .5 ? '—' : `${difference > 0 ? '+' : '−'}${money(Math.abs(difference))} vs base`}</small></button>; })];
          })}</div></div></div>
        </Section>
      </div>

      <Sensitivity data={data} selectedScenario={selectedScenario} />
      <footer><div><Landmark size={18} /><strong>Private by design</strong><span>Your plan is saved in this browser. No login or backend.</span></div><p>This tool is for planning and educational purposes. Investment returns, inflation, tax laws, withdrawal rules, and future expenses are uncertain. Projections are estimates, not guarantees or individualized tax/legal advice.</p></footer>
    </main>
    <SettingsDrawer open={settingsOpen} close={() => setSettingsOpen(false)} tab={settingsTab} setTab={setSettingsTab} data={data} setData={setData} />
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

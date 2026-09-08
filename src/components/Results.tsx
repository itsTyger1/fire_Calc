import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppData, Scenario, ScenarioResult } from '../domain/types';
import { scenarioColors } from '../domain/defaults';
import { allocationByClass, applyScenarioOverrides, emergencyFundMetrics, nominalReturnFromReal, projectCore, scenarioBudgetMetrics } from '../domain/calculations';
import { age, money, percent, Section } from './ui';
const allocationColors = ['#37d39a', '#65a7ff', '#f4b860', '#ad7bff', '#ff718d', '#40c7d9', '#8191a1'];

export const monthStatus = (result: ScenarioResult) => {
  if (!result.firePoint) return { text: 'Not reached by max age', tone: 'negative' as const };
  const delta = (result.profile.retirementAge - result.firePoint.age) * 12;
  if (Math.abs(delta) < 1) return { text: 'On target', tone: 'positive' as const };
  return delta > 0
    ? { text: `${Math.abs(delta / 12).toFixed(1)} years early`, tone: 'positive' as const }
    : { text: `${Math.abs(delta / 12).toFixed(1)} years late`, tone: 'negative' as const };
};

interface ChartDatum { month: number; age: number; year: number; date: string; [key: string]: number | string }
interface TimelineTooltipItem { dataKey?: string | number; value?: number | string; color?: string; payload?: ChartDatum }

export function TimelineChart({ results, selected, onSelect }: { results: ScenarioResult[]; selected: string; onSelect: (id: string) => void }) {
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
      visible.forEach((result) => {
        const item = result.points[Math.min(month, result.points.length - 1)];
        if (item) {
          row[result.scenario.id] = item.firePortfolio;
          row[`${result.scenario.id}__target`] = item.fireTarget;
        }
      });
      rows.push(row);
    }
    return rows;
  }, [first, maxMonth, visible.map((r) => r.scenario.id + r.points.length).join('|')]);

  const tooltip = ({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<TimelineTooltipItem>; label?: number | string }) => {
    const portfolioPayload = payload?.filter((item) => visible.some((result) => result.scenario.id === String(item.dataKey))) ?? [];
    if (!active || !portfolioPayload.length) return null;
    const anchor = portfolioPayload[0]?.payload;
    const anchorAge = Number(anchor?.age ?? label);
    const anchorDate = anchor?.date ? new Date(anchor.date) : null;
    const dateLabel = anchorDate && !Number.isNaN(anchorDate.getTime())
      ? anchorDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : undefined;
    return <div className="chart-tooltip">
      <div className="tooltip-heading">
        <strong>{axis === 'age' ? `Age ${anchorAge.toFixed(1)}` : `Calendar year ${anchorDate?.getFullYear() ?? Math.floor(Number(label))}`}</strong>
        <span>{axis === 'age' ? dateLabel : `Age ${anchorAge.toFixed(1)}`}</span>
      </div>
      {portfolioPayload.map((item) => {
        const key = String(item.dataKey ?? '');
        const value = Number(item.value ?? 0);
        const result = visible.find((r) => r.scenario.id === key);
        const month = Number(item.payload?.month ?? 0);
        const point = result?.points[Math.max(0, Math.min(Number.isFinite(month) ? month : 0, (result?.points.length ?? 1) - 1))];
        if (!result) return null;
        const delta = point ? value - point.fireTarget : 0;
        const signedDelta = `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}`;
        return <div className="tooltip-row" key={key}>
          <div className="tooltip-scenario"><span style={{ background: item.color ?? result.scenario.color }} /><strong>{result.scenario.name}</strong></div>
          {point ? <dl className="tooltip-stats">
            <div><dt>Phase</dt><dd>{point.projectionPhase === 'retirement' ? 'Retirement' : 'Accumulation'}</dd></div>
            <div><dt>Portfolio</dt><dd>{money(value)}</dd></div>
            <div><dt>FIRE target</dt><dd>{money(point.fireTarget)}</dd></div>
            <div><dt>{delta >= 0 ? 'Above target' : 'Below target'}</dt><dd className={delta >= 0 ? 'positive-text' : 'negative-text'}>{signedDelta}</dd></div>
            {point.projectionPhase === 'retirement' && <div><dt>Planned withdrawal</dt><dd>{money(point.monthlyWithdrawal)}/mo</dd></div>}
            <div><dt>Contributions to date</dt><dd>{money(point.personalContributions + point.employerContributions)}</dd></div>
            <div><dt>Investment growth</dt><dd>{money(point.investmentGrowth)}</dd></div>
          </dl> : <small className="tooltip-unavailable">Value details unavailable</small>}
        </div>;
      })}
    </div>;
  };

  if (!first || !visible.length) return <div className="empty-chart">Show at least one scenario to draw the timeline.</div>;
  return <>
    <div className="chart-controls"><div className="segmented"><button className={axis === 'age' ? 'active' : ''} onClick={() => setAxis('age')}>Age</button><button className={axis === 'year' ? 'active' : ''} onClick={() => setAxis('year')}>Calendar year</button></div><select value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="target">Through target age</option><option value="70">Through age 70</option><option value="max">Full projection</option></select></div>
    <div className="main-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 16, right: 18, bottom: 6, left: 4 }}>
      <defs>{visible.map((r) => <filter key={r.scenario.id} id={`glow-${r.scenario.id}`}><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>)}</defs>
      <CartesianGrid vertical={false} stroke="#193642" strokeDasharray="4 5" />
      <XAxis dataKey={axis} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis === 'age' ? Number(v).toFixed(0) : String(Math.floor(v))} stroke="#78909a" tickLine={false} axisLine={false} />
      <YAxis tickFormatter={(v) => money(v, true)} stroke="#78909a" tickLine={false} axisLine={false} width={64} />
      <Tooltip content={tooltip as never} />
      <Legend formatter={(id) => visible.find((r) => r.scenario.id === id)?.scenario.name ?? id} onClick={(item) => onSelect(String(item.dataKey))} />
      {visible.map((result, index) => <Line key={`target-${result.scenario.id}`} dataKey={`${result.scenario.id}__target`} stroke={result.scenario.color} strokeWidth={1.4} strokeDasharray={`${3 + index} 6`} strokeOpacity={0.35} dot={false} activeDot={false} legendType="none" />)}
      {visible.map((result) => {
        const retirementPoint = result.points.find((point) => point.projectionPhase === 'retirement');
        if (!retirementPoint) return null;
        const retirementDate = new Date(retirementPoint.date);
        const x = axis === 'age' ? retirementPoint.age : retirementDate.getFullYear() + retirementDate.getMonth() / 12;
        return <ReferenceLine key={`retirement-${result.scenario.id}`} x={x} stroke={result.scenario.color} strokeDasharray="7 5" strokeOpacity={0.6} />;
      })}
      {visible.map((result) => <Line key={result.scenario.id} dataKey={result.scenario.id} type="monotone" stroke={result.scenario.color} strokeWidth={selected === result.scenario.id ? 4 : 2.4} dot={false} activeDot={{ r: 5 }} opacity={selected && selected !== result.scenario.id ? .42 : 1} style={selected === result.scenario.id ? { filter: `url(#glow-${result.scenario.id})` } : undefined} />)}
      {visible.map((result) => result.firePoint && result.firePoint.month <= maxMonth ? <ReferenceDot key={`dot-${result.scenario.id}`} x={axis === 'age' ? result.firePoint.age : new Date(result.firePoint.date).getFullYear() + new Date(result.firePoint.date).getMonth() / 12} y={result.firePoint.firePortfolio} r={5} fill={result.scenario.color} stroke="#071b24" strokeWidth={2} /> : null)}
    </ComposedChart></ResponsiveContainer></div>
    <div className="chart-key"><span><i className="solid-line" /> Portfolio balance</span><span><i className="dash-line" /> FIRE target</span><span><i className="retirement-line" /> Retirement begins</span><span><i className="dot-key" /> First target crossing</span></div>
  </>;
}

export function SummaryTable({ results, selected, onSelect }: { results: ScenarioResult[]; selected: string; onSelect: (id: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>FIRE goal</th><th>FIRE age / date</th><th>At target age</th><th>Monthly investing</th><th>Surplus / shortfall</th><th>Status</th></tr></thead><tbody>{results.map((result) => { const delta = result.targetPoint.firePortfolio - result.targetPoint.fireTarget; const status = monthStatus(result); return <tr key={result.scenario.id} className={selected === result.scenario.id ? 'selected' : ''} onClick={() => onSelect(result.scenario.id)}><td><i style={{ background: result.scenario.color }} /><strong>{result.scenario.name}</strong></td><td>{money(result.fireNumber, true)}</td><td><strong>{age(result.firePoint?.age)}</strong><small>{result.firePoint ? new Date(result.firePoint.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : `By age ${result.profile.maxAge}`}</small></td><td>{money(result.targetPoint.firePortfolio, true)}</td><td>{money(result.plannedPersonalMonthly + result.plannedEmployerMonthly)}/mo<small>{money(result.plannedEmployerMonthly)} employer</small></td><td className={delta >= 0 ? 'positive-text' : 'negative-text'}>{delta >= 0 ? '+' : ''}{money(delta, true)}</td><td><span className={`status ${status.tone}`}>{status.text}</span></td></tr>; })}</tbody></table></div>;
}

export function RetirementDrawdown({ result }: { result: ScenarioResult }) {
  const summary = result.retirementSummary;
  const endingPoint = result.points.at(-1)!;
  const depleted = Boolean(summary.depletionPoint);
  const withdrawalMode = result.profile.mode === 'nominal' ? 'rises with inflation' : 'stays level in today’s dollars';
  const targetMethod = result.profile.customFireNumber == null
    ? `${percent(result.profile.withdrawalRate)} withdrawal rate sizes the FIRE target; withdrawals use your spending amount.`
    : 'Your custom FIRE target is used; withdrawals use your spending amount.';
  return <Section
    title="Retirement drawdown"
    eyebrow="Withdrawal phase"
    action={<span className={`status ${depleted ? 'negative' : 'positive'}`}>{depleted ? 'Projected depletion' : 'Lasts through projection'}</span>}
  >
    <div className={`drawdown-callout ${depleted ? 'negative' : 'positive'}`}>
      <div>
        <strong>{depleted ? `Projected depletion at age ${summary.depletionPoint!.age.toFixed(1)}` : `Projected to last through age ${endingPoint.age.toFixed(1)}`}</strong>
        <p>Contributions stop at age {summary.startAge.toFixed(1)}. {targetMethod} Planned withdrawals {withdrawalMode}; this baseline uses deterministic returns and does not model taxes or account withdrawal order.</p>
      </div>
    </div>
    <div className="mini-metrics drawdown-metrics">
      <div><span>Retirement starts</span><strong>Age {summary.startAge.toFixed(1)}</strong></div>
      <div><span>First-year withdrawal</span><strong>{money(summary.firstYearWithdrawal)}/yr</strong></div>
      <div><span>Balance at retirement</span><strong>{money(summary.balanceAtRetirement)}</strong></div>
      <div><span>Balance at max age</span><strong>{money(summary.endingBalance)}</strong></div>
      <div><span>Lowest projected balance</span><strong>{money(summary.lowestBalance)}</strong></div>
    </div>
    {summary.totalWithdrawalShortfall > 0 && <p className="drawdown-warning">{money(summary.totalWithdrawalShortfall)} of planned withdrawals could not be funded after the FIRE portfolio reached $0.</p>}
  </Section>;
}

export function Analytics({ result, data }: { result: ScenarioResult; data: AppData }) {
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
      <div className="account-chart-note"><span>Each line is one account—not a cumulative stack.</span><span>Contributions before retirement · withdrawals after</span></div>
      <div className="account-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={accountData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="#193642" /><XAxis dataKey="age" tickFormatter={(v) => Number(v).toFixed(0)} stroke="#78909a" axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => money(v, true)} stroke="#78909a" width={58} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => `Age ${Number(v).toFixed(0)}`} />{result.accounts.map((account, i) => <Line key={account.id} type="monotone" dataKey={account.id} name={account.name} stroke={scenarioColors[i % scenarioColors.length]} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />)}</LineChart></ResponsiveContainer></div>
    </Section>
  </div>;
}

export function BridgeAndEmergency({ result, data }: { result: ScenarioResult; data: AppData }) {
  const firePoint = result.firePoint;
  const fireAge = firePoint?.age ?? result.profile.retirementAge;
  const bridgeYears = Math.max(0, 59.5 - fireAge);
  const bridgeNeed = bridgeYears * result.profile.annualSpending;
  const accessible = firePoint?.accessible ?? result.targetPoint.accessible;
  const currentBudget = scenarioBudgetMetrics(data, result.scenario);
  const cashAccount = result.accounts.find((a) => a.type === 'HYSA / Cash');
  const phase = currentBudget.phase;
  const cashSavings = cashAccount ? (phase?.contributions[cashAccount.id]?.personal ?? cashAccount.monthlyContribution) : 0;
  const emergency = emergencyFundMetrics(cashAccount?.balance ?? 0, result.profile.emergencyTarget, cashSavings, data.profile.normalMonthlySpending, data.profile.jobLossMonthlySpending);
  return <div className="bridge-grid">
    <Section title="Early retirement bridge" eyebrow="Access before 59½"><div className="bridge-callout"><div className={`bridge-ring ${accessible >= bridgeNeed ? 'good' : 'warn'}`}><strong>{percent(Math.min(1, accessible / Math.max(1, bridgeNeed)), 0)}</strong><small>funded</small></div><div><h3>{accessible >= bridgeNeed ? 'Your estimated bridge is covered' : `${money(bridgeNeed - accessible)} bridge gap`}</h3><p>{money(accessible)} accessible against an estimated {money(bridgeNeed)} needed for {bridgeYears.toFixed(1)} years.</p></div></div><div className="mini-metrics"><div><span>Accessible at FIRE</span><strong>{money(accessible)}</strong></div><div><span>Annual spending</span><strong>{money(result.profile.annualSpending)}</strong></div><div><span>Bridge years</span><strong>{bridgeYears.toFixed(1)}</strong></div></div><p className="fine-print">Planning estimate only. “Potentially accessible” includes your entered Roth IRA contribution basis plus projected personal Roth IRA contributions; tax and withdrawal rules may change.</p></Section>
    <Section title="Emergency fund" eyebrow="Cash runway"><p className="muted">Cash target: {money(result.profile.emergencyTarget)} · Normal spending: {money(data.profile.normalMonthlySpending)}/mo · Job-loss spending: {money(data.profile.jobLossMonthlySpending)}/mo</p><div className="mini-metrics"><div><span>Normal runway</span><strong>{emergency.normalRunway.toFixed(1)} mo</strong></div><div><span>Job-loss runway</span><strong>{emergency.jobLossRunway.toFixed(1)} mo</strong></div><div><span>Target ETA</span><strong>{Number.isFinite(emergency.monthsToTarget) ? `${emergency.monthsToTarget} mo` : 'No savings'}</strong></div></div><div className="progress"><span style={{ width: `${Math.min(100, (cashAccount?.balance ?? 0) / Math.max(1, result.profile.emergencyTarget) * 100)}%` }} /></div><small className="muted">{money(emergency.remaining)} remaining · {money(cashSavings)}/mo current cash savings</small></Section>
  </div>;
}

export function Sensitivity({ data, selectedScenario }: { data: AppData; selectedScenario: Scenario }) {
  const fireAgeFor = (scenario: Scenario) => {
    const { profile, accounts, phases } = applyScenarioOverrides(data, scenario);
    const crossing = projectCore({ profile, accounts, phases }).find((p) => p.firePortfolio >= p.fireTarget);
    return crossing?.age;
  };
  const selectedProfile = applyScenarioOverrides(data, selectedScenario).profile;
  const returns = [.03, .04, .05, .06, .07].map((value) => ({ label: percent(value, 0), age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, nominalReturn: nominalReturnFromReal(value, selectedProfile.inflationRate) } }) }));
  const contributions = [-1000, -500, -250, 0, 250, 500, 1000].map((delta) => { const current = selectedScenario.overrides.contributionScale ?? 1; const base = Math.max(1, data.phases.at(-1) ? Object.values(data.phases.at(-1)!.contributions).reduce((s, v) => s + v.personal, 0) : 1); return { label: delta === 0 ? 'Base' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`, age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, contributionScale: Math.max(0, current + delta / base) } }) }; });
  const spending = [-.2, -.1, 0, .1, .2].map((delta) => ({ label: delta === 0 ? 'Base' : `${delta > 0 ? '+' : ''}${percent(delta, 0)}`, age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, annualSpending: (selectedScenario.overrides.annualSpending ?? data.profile.annualSpending) * (1 + delta) } }) }));
  const rates = [.03, .0325, .035, .0375, .04].map((value) => ({ label: percent(value, value % .01 ? 2 : 1), age: fireAgeFor({ ...selectedScenario, overrides: { ...selectedScenario.overrides, withdrawalRate: value } }) }));
  const group = (title: string, items: { label: string; age?: number }[]) => <div className="sensitivity-group"><strong>{title}</strong><div>{items.map((item) => <span key={item.label}><small>{item.label}</small><b>{item.age ? item.age.toFixed(1) : '—'}</b></span>)}</div></div>;
  return <Section title="Sensitivity explorer" eyebrow="One assumption at a time"><p className="muted">Resulting FIRE age for <strong>{selectedScenario.name}</strong>. Each row changes only the labeled assumption.</p><div className="sensitivity-grid">{group('Real return', returns)}{group('Monthly contribution', contributions)}{group('Annual spending', spending)}{group('Withdrawal rate', rates)}</div></Section>;
}

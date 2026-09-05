import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleDollarSign, Download, Flame, Gauge, Landmark, RefreshCcw, Save, Upload } from 'lucide-react';
import type { AppData } from './domain/types';
import { defaultData } from './domain/defaults';
import { projectScenario, scenarioBudgetMetrics } from './domain/calculations';
import { downloadData, loadData, readImport, resetData, saveData } from './lib/persistence';
import { InputHub } from './components/InputHub';
import { BudgetSummary } from './components/BudgetSummary';
import { Analytics, BridgeAndEmergency, monthStatus, Sensitivity, SummaryTable, TimelineChart } from './components/Results';
import { age, Metric, money, percent, Section } from './components/ui';
const clone = <T,>(value: T): T => structuredClone(value);
export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selected, setSelected] = useState(() => data.scenarios[0]?.id ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const [requestedPhaseId, setPhaseId] = useState<string>();
  const importRef = useRef<HTMLInputElement>(null);
  // Keep controlled inputs responsive while projection and chart updates are
  // calculated in React's lower-priority render pass.
  const projectionData = useDeferredValue(data);
  const results = useMemo(
    () => projectionData.scenarios.map((scenario) => projectScenario(projectionData, scenario)),
    [projectionData],
  );
  const base = results.find((result) => result.scenario.id === selected) ?? results[0];
  const selectedScenario = data.scenarios.find((scenario) => scenario.id === base?.scenario.id) ?? data.scenarios[0];
  const projectedSelectedScenario = projectionData.scenarios.find((scenario) => scenario.id === base?.scenario.id)
    ?? projectionData.scenarios[0];
  const fireInvestingPhaseId = data.phases.find((phase) => phase.id === requestedPhaseId)?.id
    ?? data.phases.find((phase) => phase.name.toLowerCase().includes('fire'))?.id ?? data.phases[data.phases.length - 1]?.id;
  const selectedBudget = useMemo(() => selectedScenario ? scenarioBudgetMetrics(data, selectedScenario, 1, fireInvestingPhaseId) : null, [data, selectedScenario, fireInvestingPhaseId]);
  const comparisonBudgets = useMemo(() => data.scenarios.map((scenario) => ({ scenario, budget: scenarioBudgetMetrics(data, scenario, 1, fireInvestingPhaseId) })), [data, fireInvestingPhaseId]);
  const status = base ? monthStatus(base) : { text: 'No scenario', tone: 'negative' as const };

  useEffect(() => { const timeout = window.setTimeout(() => saveData(data), 350); return () => window.clearTimeout(timeout); }, [data]);
  useEffect(() => { if (toast) { const timeout = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timeout); } }, [toast]);

  const handleImport = async (file?: File) => { if (!file) return; try { const next = await readImport(file); setData(next); setSelected(next.scenarios[0]?.id ?? ''); setToast('Plan imported successfully'); } catch (error) { setToast(error instanceof Error ? error.message : 'Import failed'); } };
  const handleReset = () => { if (!window.confirm('Reset the entire planner to its seeded defaults?')) return; const next = resetData(); setData(next); setSelected(next.scenarios[0].id); setToast('Planner reset'); };
  if (!base || !selectedScenario || !selectedBudget) return <main className="fatal"><Flame /><h1>No scenarios found</h1><button className="button primary" onClick={() => setData(clone(defaultData))}>Restore defaults</button></main>;
  const delta = base.targetPoint.firePortfolio - base.targetPoint.fireTarget;
  const fireProgress = base.currentFirePortfolio / Math.max(1, base.fireNumber);
  const contributionDifference = base.plannedPersonalMonthly - base.requiredPersonalMonthly;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span><Flame size={19} /></span><div><strong>FIRE Projector</strong><small>{data.profile.mode === 'real' ? 'Today’s dollars' : 'Future nominal dollars'}</small></div></div><div className="top-actions"><button className="button ghost" onClick={() => { saveData(data); setToast('Saved locally'); }}><Save size={16} /> <span>Save</span></button><button className="button ghost" onClick={() => downloadData(data)}><Download size={16} /> <span>Export</span></button><button className="button ghost" onClick={() => importRef.current?.click()}><Upload size={16} /> <span>Import</span></button><button className="button ghost" onClick={handleReset}><RefreshCcw size={16} /> <span>Reset</span></button><input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => void handleImport(e.target.files?.[0])} /></div></header>

    <main className="workspace">
      <InputHub data={data} setData={setData} scenario={selectedScenario} setSelected={setSelected} phaseId={fireInvestingPhaseId} setPhaseId={setPhaseId} />
      <div id="results" className="results-area">
      <div className="results-heading"><div><span className="eyebrow">Your results</span><h2>{selectedScenario.name}</h2></div><a href="#inputs" className="button secondary">Edit inputs ↑</a></div>
      <section className="hero"><div><span className="eyebrow">{data.profile.name}</span><h1>{base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'You’re on track.' : 'Your target needs a nudge.'}</h1><p>{base.firePoint ? <>At your current plan, <strong>{base.scenario.name}</strong> reaches financial independence at <strong>age {base.firePoint.age.toFixed(1)}</strong>—<span className={status.tone === 'positive' ? 'positive-text' : 'negative-text'}>{status.text}</span>.</> : <>This scenario does not reach its FIRE target by age {base.profile.maxAge}. Increase contributions, reduce spending, or revisit the timeline.</>}</p></div><div className={`hero-status ${status.tone}`}><span>{status.tone === 'positive' ? <Check size={17} /> : <Gauge size={17} />}</span><div><small>At target age {base.profile.retirementAge}</small><strong>{delta >= 0 ? '+' : ''}{money(delta, true)}</strong><em>{delta >= 0 ? 'projected surplus' : 'projected shortfall'}</em></div></div></section>

      <section className="metrics-grid">
        <Metric label="Total net worth" value={money(base.currentNetWorth)} sub="All included accounts" info="Everything included in net worth, whether or not it funds FIRE." />
        <Metric label="FIRE portfolio" value={money(base.currentFirePortfolio)} sub={`${percent(fireProgress)} of target`} tone="accent" info="Only accounts marked FIRE eligible." />
        <Metric label="FIRE goal" value={money(base.fireNumber)} sub={base.profile.customFireNumber == null ? "Based on spending and withdrawal rate" : "Custom target"} />
        <Metric label="Projected FIRE" value={age(base.firePoint?.age)} sub={base.firePoint ? new Date(base.firePoint.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `Not by age ${base.profile.maxAge}`} tone={base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'positive' : 'negative'} />
        <Metric label="Monthly FIRE investing" value={`${money(base.plannedPersonalMonthly + base.plannedEmployerMonthly)}/mo`} sub={`${money(base.plannedEmployerMonthly)} from employer`} />
        <Metric label="Required FIRE contribution" value={Number.isFinite(base.requiredPersonalMonthly) ? `${money(base.requiredPersonalMonthly)}/mo` : 'Not reachable'} sub={!Number.isFinite(base.requiredPersonalMonthly) ? 'Goal is outside the solver range' : Math.abs(contributionDifference) < 1 ? 'Current allocation is on target' : contributionDifference > 0 ? `${money(contributionDifference)}/mo above minimum` : `${money(-contributionDifference)}/mo more needed`} tone={contributionDifference >= 0 ? 'positive' : 'negative'} info="Minimum personal FIRE contribution, preserving this scenario’s account allocation proportions across its phases." />
      </section>

      <Section title="Scenario timelines" eyebrow="Compare every path" action={<span className="panel-note"><CircleDollarSign size={14} /> Monthly compounding</span>}>
        <TimelineChart results={results} selected={base.scenario.id} onSelect={setSelected} />
      </Section>

      <Section title="Scenario scorecard" eyebrow="Click a row to focus"><SummaryTable results={results} selected={base.scenario.id} onSelect={setSelected} /></Section>
      <Analytics result={base} data={data} />
      <BridgeAndEmergency result={base} data={data} />

      <BudgetSummary data={data} selectedScenario={selectedScenario} selectedBudget={selectedBudget} comparisonBudgets={comparisonBudgets} setSelected={setSelected} />

      {projectedSelectedScenario && <Sensitivity data={projectionData} selectedScenario={projectedSelectedScenario} />}
      </div>
      <footer><div><Landmark size={18} /><strong>Private by design</strong><span>Your plan is saved on this computer. No login or backend.</span></div><p>This tool is for planning and educational purposes. Investment returns, inflation, tax laws, withdrawal rules, and future expenses are uncertain. Projections are estimates, not guarantees or individualized tax/legal advice.</p></footer>
    </main>
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

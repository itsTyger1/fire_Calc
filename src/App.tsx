import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleDollarSign, Flame, FolderOpen, Gauge, Landmark, RefreshCcw, Save } from 'lucide-react';
import type { AppData } from './domain/types';
import { defaultData } from './domain/defaults';
import { projectScenario, scenarioBudgetMetrics } from './domain/calculations';
import { listSavedPlans, loadData, resetData, saveData, saveNamedPlan, type SavedPlan } from './lib/persistence';
import { InputHub } from './components/InputHub';
import { BudgetSummary } from './components/BudgetSummary';
import { Analytics, BridgeAndEmergency, monthStatus, RetirementDrawdown, Sensitivity, SummaryTable, TimelineChart } from './components/Results';
import { age, Metric, money, percent, Section } from './components/ui';
type UpdateCheck = { currentVersion: string; latestVersion?: string; updateAvailable: boolean; downloadUrl?: string | null; releaseUrl?: string; noPublishedRelease?: boolean };
declare global { interface Window {
  fireUpdater?: { check: () => Promise<UpdateCheck>; install: (downloadUrl: string) => Promise<{ started: boolean }> };
  firePlans?: { save: (name: string, data: AppData) => Promise<{ canceled: true } | { canceled: false; name: string; filePath: string }> };
} }
const clone = <T,>(value: T): T => structuredClone(value);
export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selected, setSelected] = useState(() => data.scenarios[0]?.id ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [requestedPhaseId, setPhaseId] = useState<string>();
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => listSavedPlans());
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const loadMenuRef = useRef<HTMLDivElement>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState<{ name: string; location: string; warning?: string } | null>(null);
  const saveDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (saveConfirmation) saveDialogRef.current?.showModal(); }, [saveConfirmation]);
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
  useEffect(() => {
    if (!loadMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (loadMenuRef.current && !loadMenuRef.current.contains(event.target as Node)) setLoadMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [loadMenuOpen]);

  const handleSave = async () => {
    if (savingPlan) return;
    setSavingPlan(true);
    try {
      if (window.firePlans) {
        const result = await window.firePlans.save(selectedScenario?.name ?? 'My FIRE plan', data);
        if (result.canceled) return;
        let warning: string | undefined;
        try {
          saveNamedPlan(result.name, data);
          setSavedPlans(listSavedPlans());
        } catch { warning = 'The file was saved, but the app could not add a copy to the Load menu.'; }
        setSaveConfirmation({ name: result.name, location: result.filePath, warning });
        return;
      }
      const requestedName = window.prompt('Save this plan as:', selectedScenario?.name ?? 'My FIRE plan');
      if (requestedName == null) return;
      const name = requestedName.trim();
      if (!name) { setToast('Enter a name to save this plan'); return; }
      const existing = listSavedPlans().find((plan) => plan.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing && !window.confirm(`A save named “${existing.name}” already exists. Replace it?`)) return;
      saveNamedPlan(name, data);
      setSavedPlans(listSavedPlans());
      setSaveConfirmation({ name, location: 'This browser’s local storage. Open Load to restore this plan.' });
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save this plan'); }
    finally { setSavingPlan(false); }
  };
  const handleToggleLoadMenu = () => {
    if (!loadMenuOpen) setSavedPlans(listSavedPlans());
    setLoadMenuOpen((open) => !open);
  };
  const handleLoad = (saved: SavedPlan) => {
    const next = clone(saved.data);
    setData(next);
    setSelected(next.scenarios[0]?.id ?? '');
    setLoadMenuOpen(false);
    setToast(`Loaded “${saved.name}”`);
  };
  const handleReset = () => { if (!window.confirm('Are you sure you want to reset the entire planner to its seeded defaults?')) return; const next = resetData(); setData(next); setSelected(next.scenarios[0].id); setToast('Planner reset'); };
  const handleRefresh = () => window.location.reload();
  const handleUpdate = async () => {
    setUpdate(null);
    setUpdatePromptOpen(false);
    if (!window.fireUpdater) { setToast('Update checks are available in the desktop app'); return; }
    setCheckingUpdate(true);
    try {
      const result = await window.fireUpdater.check();
      setUpdate(result);
      if (result.noPublishedRelease) setToast('No desktop release is available yet. Repository changes must finish building before they can be installed.');
      else if (!result.updateAvailable) setToast(`You’re up to date (${result.currentVersion})`);
      else if (!result.downloadUrl) setToast(`Version ${result.latestVersion} is available, but no installer was published`);
      else setUpdatePromptOpen(true);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not check for updates'); }
    finally { setCheckingUpdate(false); }
  };
  const installUpdate = async () => {
    const downloadUrl = update?.downloadUrl;
    if (!downloadUrl || !window.fireUpdater) return;
    setUpdatePromptOpen(false);
    setInstallingUpdate(true);
    setToast('Downloading update…');
    try {
      saveData(data);
      const result = await window.fireUpdater.install(downloadUrl);
      if (!result.started) setToast('Update canceled');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Update failed'); }
    finally { setInstallingUpdate(false); }
  };
  if (!base || !selectedScenario || !selectedBudget) return <main className="fatal"><Flame /><h1>No scenarios found</h1><button className="button primary" onClick={() => setData(clone(defaultData))}>Restore defaults</button></main>;
  const delta = base.targetPoint.firePortfolio - base.targetPoint.fireTarget;
  const fireProgress = base.currentFirePortfolio / Math.max(1, base.fireNumber);
  const monthlyFireInvesting = base.plannedPersonalMonthly + base.plannedEmployerMonthly;
  const requiredMonthlyFireInvesting = Number.isFinite(base.requiredPersonalMonthly)
    ? base.requiredPersonalMonthly + base.plannedEmployerMonthly
    : Infinity;
  const contributionDifference = monthlyFireInvesting - requiredMonthlyFireInvesting;
  const contributionStatus = !Number.isFinite(requiredMonthlyFireInvesting)
    ? 'Goal is outside the solver range'
    : Math.abs(contributionDifference) < 1
      ? 'Current contributions are on target'
      : contributionDifference > 0
        ? `${money(contributionDifference)}/mo above amount needed`
        : `${money(-contributionDifference)}/mo more needed`;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span><Flame size={19} /></span><div><strong>FIRE Projector</strong><small>{data.profile.mode === 'real' ? 'Today’s dollars' : 'Future nominal dollars'}</small></div></div><div className="top-actions"><button className="button ghost" onClick={() => void handleSave()} disabled={savingPlan}><Save size={16} /> <span>{savingPlan ? 'Saving…' : 'Save'}</span></button><div className="load-menu" ref={loadMenuRef}><button className="button ghost" onClick={handleToggleLoadMenu} aria-haspopup="menu" aria-expanded={loadMenuOpen}><FolderOpen size={16} /> <span>Load</span></button>{loadMenuOpen && <div className="load-menu-panel" role="menu" aria-label="Saved plans"><div className="load-menu-heading"><strong>Saved plans</strong><small>{savedPlans.length ? `${savedPlans.length} saved ${savedPlans.length === 1 ? 'plan' : 'plans'}` : 'No saves yet'}</small></div>{savedPlans.length ? savedPlans.map((saved) => <button key={saved.id} className="load-menu-item" role="menuitem" onClick={() => handleLoad(saved)}><span><strong>{saved.name}</strong><small>Saved {new Date(saved.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></span></button>) : <p className="load-menu-empty">Use Save to create a named plan.</p>}</div>}</div><button className="button ghost" onClick={handleRefresh}><RefreshCcw size={16} /> <span>Refresh app</span></button><button className="button ghost" onClick={handleUpdate} disabled={checkingUpdate || installingUpdate}><RefreshCcw size={16} /> <span>{checkingUpdate ? 'Checking…' : installingUpdate ? 'Downloading…' : 'Check updates'}</span></button><button className="button danger" onClick={handleReset}><RefreshCcw size={16} /> <span>Reset</span></button></div></header>

    <main className="workspace">
      <InputHub data={data} setData={setData} scenario={selectedScenario} setSelected={setSelected} phaseId={fireInvestingPhaseId} setPhaseId={setPhaseId} />
      <div id="results" className="results-area">
      <div className="results-heading"><div><span className="eyebrow">Your results</span><h2>{selectedScenario.name}</h2></div></div>
      <section className="hero"><div><span className="eyebrow">{selectedScenario.name}</span><h1>{base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'You’re on track.' : 'Your target needs a nudge.'}</h1><p>{base.firePoint ? <>At your current plan, <strong>{base.scenario.name}</strong> reaches financial independence at <strong>age {base.firePoint.age.toFixed(1)}</strong>—<span className={status.tone === 'positive' ? 'positive-text' : 'negative-text'}>{status.text}</span>.</> : <>This scenario does not reach its FIRE target by age {base.profile.maxAge}. Increase contributions, reduce spending, or revisit the timeline.</>}</p></div><div className={`hero-status ${status.tone}`}><span>{status.tone === 'positive' ? <Check size={17} /> : <Gauge size={17} />}</span><div><small>At target age {base.profile.retirementAge}</small><strong>{delta >= 0 ? '+' : ''}{money(delta, true)}</strong><em>{delta >= 0 ? 'projected surplus' : 'projected shortfall'}</em></div></div></section>

      <section className="metrics-grid">
        <Metric label="Total net worth" value={money(base.currentNetWorth)} sub="All included accounts" info="Everything included in net worth, whether or not it funds FIRE." />
        <Metric label="FIRE portfolio" value={money(base.currentFirePortfolio)} sub={`${percent(fireProgress)} of target`} tone="accent" info="Only accounts marked FIRE eligible." />
        <Metric label="FIRE goal" value={money(base.fireNumber)} sub={base.profile.customFireNumber == null ? "Based on spending and withdrawal rate" : "Custom target"} />
        <Metric label="Projected FIRE" value={age(base.firePoint?.age)} sub={base.firePoint ? new Date(base.firePoint.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `Not by age ${base.profile.maxAge}`} tone={base.firePoint && base.firePoint.age <= base.profile.retirementAge ? 'positive' : 'negative'} />
        <Metric label="Monthly FIRE investing" value={`${money(monthlyFireInvesting)}/mo`} sub={<><span className="metric-secondary-value">Required monthly: {money(requiredMonthlyFireInvesting)}/mo</span><span>{contributionStatus}</span></>} tone={contributionDifference >= 0 ? 'positive' : 'negative'} info="The main number is the total currently budgeted for the FIRE investing phase, including employer contributions. The projection uses all contribution phases in sequence; the smaller number is the total monthly amount needed to reach the FIRE goal while employer contributions remain constant." />
      </section>

      <RetirementDrawdown result={base} />

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
    {updatePromptOpen && update?.updateAvailable && update.latestVersion && update.downloadUrl && <div className="update-modal-backdrop" role="presentation" onMouseDown={() => setUpdatePromptOpen(false)}>
      <div className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="eyebrow">Update available</span>
        <h2 id="update-modal-title">FIRE Projector {update.latestVersion} is ready</h2>
        <p>You’re running version {update.currentVersion}. Download and install the newer version now?</p>
        <div className="update-modal-actions"><button className="button secondary" onClick={() => setUpdatePromptOpen(false)}>Not now</button><button className="button primary" onClick={() => void installUpdate()} disabled={installingUpdate}>{installingUpdate ? 'Downloading…' : 'Update now'}</button></div>
      </div>
    </div>}
    {saveConfirmation && <dialog ref={saveDialogRef} className="update-modal save-confirmation" aria-labelledby="save-confirmation-title" onClose={() => setSaveConfirmation(null)}>
      <h2 id="save-confirmation-title">Plan saved</h2>
      <p>Saved “{saveConfirmation.name}” to:</p>
      <p className="save-location">{saveConfirmation.location}</p>
      {saveConfirmation.warning && <p role="alert">{saveConfirmation.warning}</p>}
      <form method="dialog" className="update-modal-actions"><button autoFocus className="button primary">Done</button></form>
    </dialog>}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

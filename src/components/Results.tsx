import { useEffect, useId, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { AppData, Scenario, ScenarioResult } from '../domain/types';
import { chartColors, neonStyle, scenarioColor } from '../theme';
import { allocationByClass, applyScenarioOverrides, bridgeMetrics, findFireCrossing, emergencyFundMetrics, nominalReturnFromReal, projectCore, scenarioBudgetMetrics } from '../domain/calculations';
import { age, money, percent, Section } from './ui';
import { ChartSurface, useDockedChartTooltip } from './ChartInteraction';
import { ColorCard } from './ColorCard';
import { DraggableChartTooltip } from './DraggableChartTooltip';
import { chartGlowDefinition } from './ChartGlow';
import { coastFireMessage, fundedTargetCrossing, retirementFundingStatus, retirementReady, spendingGapPoint } from '../domain/outlook';
import { retirementPortfolioComposition } from '../domain/portfolioComposition';
const allocationColors = chartColors;

export const monthStatus = (result: ScenarioResult) => {
  return { text: retirementFundingStatus(result), tone: retirementReady(result) ? 'positive' as const : 'negative' as const };
};

interface ChartDatum { month: number; age: number; year: number; date: string; [key: string]: number | string | null }
interface TimelineTooltipItem { dataKey?: string | number; value?: number | string; color?: string; payload?: ChartDatum }

const accountTooltip = ({ active, payload, label, highlightedKey }: Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & { highlightedKey: string | null }) => {
  const items = payload?.filter((item) => item.value != null) ?? [];
  if (!active || !items.length) return null;
  const numericLabel = Number(label);
  return <div className="chart-tooltip account-chart-tooltip">
    <div className="tooltip-heading">
      <strong>Age {Number.isFinite(numericLabel) ? numericLabel.toFixed(0) : '—'}</strong>
    </div>
    <div className="account-tooltip-items">
      {items.map((item) => <div className="account-tooltip-item" key={String(item.dataKey ?? item.name)}>
        <span className="account-tooltip-name"><i className="series-dot" data-series-active={highlightedKey === String(item.dataKey) || undefined} style={{ background: item.color ?? item.stroke ?? 'var(--muted)', ...neonStyle(item.color ?? item.stroke ?? 'var(--muted)') }} />{String(item.name ?? item.dataKey)}</span>
        <strong>{money(Number(item.value ?? 0))}</strong>
      </div>)}
    </div>
  </div>;
};

export function TimelineChart({ results, selected, fundingHorizonRequest = 0 }: { results: ScenarioResult[]; selected: string; fundingHorizonRequest?: number }) {
  const glowId = `timeline-glow-${useId().replace(/:/g, '')}`;
  const [axis, setAxis] = useState<'age' | 'year'>('age');
  const [range, setRange] = useState<'target' | '70' | 'max' | 'horizon'>('max');
  const [showCoast, setShowCoast] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (fundingHorizonRequest > 0) setRange('horizon'); }, [fundingHorizonRequest]);
  const dockedTooltip = useDockedChartTooltip();
  const [highlightedScenario, setHighlightedScenario] = useState<string | null>(null);
  const [tooltipPortal, setTooltipPortal] = useState<HTMLDivElement | null>(null);
  const visible = results.filter((result) => result.scenario.visible);
  const gaps = useMemo(() => new Map(results.map((result) => [result.scenario.id, spendingGapPoint(result.retirementFunding)])), [results]);
  const first = visible[0] ?? results[0];
  const focused = visible.find((result) => result.scenario.id === selected) ?? first;
  const coastKey = `${focused?.scenario.id}__coast`;
  const coastShown = showCoast && !hiddenSeries.has(coastKey) && Boolean(focused?.coastFire?.eligibilityPoint);
  const toggleSeries = (key: string) => {
    setHighlightedScenario(null);
    setHiddenSeries((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleCoastPath = () => {
    setHighlightedScenario(null);
    if (coastShown) setShowCoast(false);
    else {
      setShowCoast(true);
      setHiddenSeries((previous) => {
        const next = new Set(previous);
        next.delete(coastKey);
        return next;
      });
    }
  };
  const coastFunding = showCoast ? focused?.coastFire?.funding ?? null : null;
  const coastPoints = coastFunding?.points ?? null;
  const maxMonth = Math.max(0, ...visible.map((result) => range === 'target' ? Math.round((result.profile.retirementAge - result.profile.currentAge) * 12) : range === '70' ? Math.min(result.retirementFunding.points.length - 1, Math.ceil((70 - result.profile.currentAge) * 12)) : range === 'horizon' ? result.retirementFunding.points.length - 1 : result.points.length - 1));
  const horizonAge = Math.max(100, ...visible.map((result) => result.retirementFunding.horizonAge));
  const pointsFor = (result: ScenarioResult) => range === 'max' ? result.points : result.retirementFunding.points;
  const focusedGap = focused && !hiddenSeries.has(focused.scenario.id) ? gaps.get(focused.scenario.id) ?? null : null;
  const reserveGapSpace = focusedGap && maxMonth > 0 && focusedGap.month <= maxMonth && focusedGap.month / maxMonth > (dockedTooltip ? 0.55 : 0.88);
  const coastGap = coastFunding ? spendingGapPoint(coastFunding) : null;
  const hasVisibleGap = visible.some((result) => {
    if (hiddenSeries.has(result.scenario.id)) return false;
    const gap = gaps.get(result.scenario.id);
    return gap && gap.month <= maxMonth && gap.month < pointsFor(result).length - 1;
  }) || Boolean(coastShown && coastGap && coastGap.month <= maxMonth);
  const chartData = useMemo(() => {
    if (!first) return [];
    const rows: ChartDatum[] = [];
    const months = new Set<number>();
    for (let month = 0; month <= maxMonth; month += 3) months.add(month);
    visible.forEach((result) => {
      if (result.firePoint && result.firePoint.month <= maxMonth) months.add(result.firePoint.month);
      const gap = gaps.get(result.scenario.id);
      if (gap && gap.month <= maxMonth) months.add(gap.month);
    });
    if (coastGap && coastGap.month <= maxMonth) months.add(coastGap.month);
    if (focused?.coastFire?.eligibilityPoint && focused.coastFire.eligibilityPoint.month <= maxMonth) months.add(focused.coastFire.eligibilityPoint.month);
    months.add(maxMonth);
    for (const month of [...months].sort((a, b) => a - b)) {
      const point = pointsFor(first)[Math.min(month, pointsFor(first).length - 1)];
      const date = new Date(point.date);
      const row: ChartDatum = { month, age: point.age, year: date.getFullYear() + date.getMonth() / 12, date: point.date };
      visible.forEach((result) => {
        const item = pointsFor(result)[month];
        if (item) {
          const gap = gaps.get(result.scenario.id);
          row[result.scenario.id] = !gap || month <= gap.month ? item.firePortfolio : null;
          row[`${result.scenario.id}__remaining`] = showRemaining && gap && month >= gap.month ? item.firePortfolio : null;
          row[`${result.scenario.id}__target`] = item.fireTarget;
        }
      });
      if (coastPoints?.[month]) {
        row[coastKey] = !coastGap || month <= coastGap.month ? coastPoints[month].firePortfolio : null;
        row[`${coastKey}__remaining`] = showRemaining && coastGap && month >= coastGap.month ? coastPoints[month].firePortfolio : null;
      }
      rows.push(row);
    }
    return rows;
  }, [results, maxMonth, range, coastPoints, coastKey, focused, coastFunding, showRemaining, gaps]);
  const tooltip = ({ active, payload, label, coordinate }: { active?: boolean; payload?: ReadonlyArray<TimelineTooltipItem>; label?: number | string; coordinate?: { x: number; y: number } }) => {
    const seen = new Set<string>();
    const portfolioPayload = payload?.filter((item) => {
      const key = String(item.dataKey).replace(/__remaining$/, '');
      if (item.value == null || hiddenSeries.has(key) || seen.has(key) || !(visible.some((result) => result.scenario.id === key) || (coastShown && coastPoints && key === coastKey))) return false;
      seen.add(key);
      return true;
    }) ?? [];
    if (!active || !portfolioPayload.length) return null;
    const anchor = portfolioPayload[0]?.payload;
    const anchorAge = Number(anchor?.age ?? label);
    const anchorDate = anchor?.date ? new Date(anchor.date) : null;
    const dateLabel = anchorDate && !Number.isNaN(anchorDate.getTime())
      ? anchorDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : undefined;
    return <DraggableChartTooltip boundary={tooltipPortal} coordinate={coordinate} heading={<>
        <strong>{axis === 'age' ? `Age ${anchorAge.toFixed(1)}` : `Calendar year ${anchorDate?.getFullYear() ?? Math.floor(Number(label))}`}</strong>
        <span>{axis === 'age' ? dateLabel : `Age ${anchorAge.toFixed(1)}`}</span>
      </>}>
      {portfolioPayload.map((item) => {
        const key = String(item.dataKey ?? '').replace(/__remaining$/, '');
        const value = Number(item.value ?? 0);
        const isCoast = key === coastKey;
        const result = isCoast ? focused : visible.find((r) => r.scenario.id === key);
        const month = Number(item.payload?.month ?? 0);
        const point = (isCoast ? coastPoints : result ? pointsFor(result) : null)?.[Math.max(0, Number.isFinite(month) ? month : 0)];
        if (!result) return null;
        const gap = isCoast ? coastGap : gaps.get(result.scenario.id);
        const afterGap = Boolean(gap && month >= gap.month);
        const delta = point ? value - point.fireTarget : 0;
        const signedDelta = `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}`;
        return <div className="tooltip-row" key={key}>
          <div className="tooltip-scenario"><span className="series-dot" data-series-active={highlightedScenario === key || undefined} style={{ background: item.color ?? scenarioColor(result.scenario.color), ...neonStyle(item.color ?? scenarioColor(result.scenario.color)) }} /><strong>{isCoast ? `${result.scenario.name} · Coast path` : result.scenario.name}</strong></div>
          {afterGap && <p className="tooltip-gap-note">{month === gap!.month ? 'Spending gap starts here.' : 'Some spending is unpaid. This shows remaining investments.'}</p>}
          {point ? <dl className="tooltip-stats">
            <div><dt>Phase</dt><dd>{point.projectionPhase === 'retirement' ? 'Retirement' : isCoast && month >= result.coastFire!.eligibilityPoint!.month ? 'Coasting · no contributions' : 'Accumulation'}</dd></div>
            <div><dt>{afterGap ? 'Remaining investments' : 'Investments'}</dt><dd>{money(value)}</dd></div>
            <div><dt>FIRE target</dt><dd>{money(point.fireTarget)}</dd></div>
            <div><dt>{delta >= 0 ? 'Above target' : 'Below target'}</dt><dd className={delta >= 0 ? 'positive-text' : 'negative-text'}>{signedDelta}</dd></div>
            {point.projectionPhase === 'retirement' && <div><dt>Planned withdrawal</dt><dd>{money(point.monthlyWithdrawal)}/mo</dd></div>}
            {point.cumulativeWithdrawalShortfall >= 0.01 && <div><dt>Unpaid spending to date</dt><dd className="negative-text">{money(point.cumulativeWithdrawalShortfall)}</dd></div>}
            <div><dt>Contributions to date</dt><dd>{money(point.personalContributions + point.employerContributions)}</dd></div>
            <div><dt>Investment growth</dt><dd>{money(point.investmentGrowth)}</dd></div>
          </dl> : <small className="tooltip-unavailable">Value details unavailable</small>}
        </div>;
      })}
    </DraggableChartTooltip>;
  };

  if (!first || !visible.length) return <div className="empty-chart">Show at least one scenario to draw the timeline.</div>;
  return <>
    <p className="chart-phase-note muted">The main line shows investments while your planned living expenses can be paid. It ends if spending falls short.</p>
    <div className="chart-controls"><div className="segmented"><button className={axis === 'age' ? 'active' : ''} onClick={() => setAxis('age')}>Age</button><button className={axis === 'year' ? 'active' : ''} onClick={() => setAxis('year')}>Calendar year</button></div>{hasVisibleGap && <button className="button secondary remaining-path-toggle" aria-pressed={showRemaining} onClick={() => setShowRemaining((show) => !show)}>{showRemaining ? 'Hide remaining investments' : 'Show remaining investments'}</button>}<button className="button secondary coast-path-toggle" aria-pressed={coastShown} disabled={!focused?.coastFire?.eligibilityPoint} onClick={toggleCoastPath}>{coastShown ? 'Hide Coast path' : 'Show Coast path'}</button><select aria-label="Timeline range" value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="target">Through target age</option><option value="70">Through age 70</option><option value="max">Full projection</option><option value="horizon">Through age {horizonAge}</option></select></div>
    {focusedGap && <p className="timeline-gap-note" role="note"><strong>{focused.scenario.name}: spending falls short at age {focusedGap.age.toFixed(1)}.</strong> {showRemaining && hasVisibleGap ? 'The dotted continuation shows remaining investments while some spending goes unpaid.' : 'Later investment growth does not cover this earlier spending gap.'}{focusedGap.month > maxMonth && ' Choose a longer timeline to see the gap.'}</p>}
    {showRemaining && hasVisibleGap && !focusedGap && <p className="timeline-gap-note" role="note">Dotted continuations show remaining investments while some spending goes unpaid.</p>}
    {coastShown && coastFunding && <p className="coast-path-note muted">Coast path: stop investing at age {focused.coastFire!.eligibilityPoint!.age.toFixed(1)} and cover living expenses with income until retirement at age {focused.profile.retirementAge.toFixed(1)}. Retirement spending is projected to be covered through age {coastFunding.horizonAge}.</p>}
    <ChartSurface className="main-chart" svgGlowId={glowId} onHighlightChange={setHighlightedScenario}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 16, right: 18, bottom: 6, left: 4 }}>
      {chartGlowDefinition(glowId)}
      <defs><marker id={`${glowId}-gap-arrow`} viewBox="0 0 6 6" refX={5} refY={3} markerWidth={6} markerHeight={6} orient="auto"><path d="M 0 0 L 6 3 L 0 6 Z" fill="var(--amber)" /></marker></defs>
      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 5" />
      {focusedGap && focusedGap.month <= maxMonth && <ReferenceArea x1={axis === 'age' ? focusedGap.age : new Date(focusedGap.date).getFullYear() + new Date(focusedGap.date).getMonth() / 12} x2={Number(chartData.at(-1)?.[axis])} fill="var(--muted)" fillOpacity={0.07} strokeOpacity={0} />}
      <XAxis dataKey={axis} type="number" domain={['dataMin', 'dataMax']} padding={{ right: reserveGapSpace ? 112 : 0 }} tickFormatter={(v) => axis === 'age' ? Number(v).toFixed(0) : String(Math.floor(v))} stroke="var(--muted)" tickLine={false} axisLine={false} />
      <YAxis tickFormatter={(v) => money(v, true)} stroke="var(--muted)" tickLine={false} axisLine={false} width={64} />
      <Tooltip content={tooltip as never} portal={tooltipPortal} active={dockedTooltip ? highlightedScenario !== null : undefined} isAnimationActive={false} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 5' }} wrapperStyle={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      <Legend content={() => <ul className="timeline-legend" aria-label="Show or hide chart lines">
        {[...visible.map((result) => ({ key: result.scenario.id, name: result.scenario.name, color: scenarioColor(result.scenario.color), coast: false })), ...(coastPoints ? [{ key: coastKey, name: `Coast path · ${focused.scenario.name}`, color: chartColors[2], coast: true }] : [])].map((series) => <li key={series.key}><button type="button" className="timeline-legend-button series-label" aria-pressed={!hiddenSeries.has(series.key)} aria-label={`${hiddenSeries.has(series.key) ? 'Show' : 'Hide'} ${series.name}`} title={`${hiddenSeries.has(series.key) ? 'Show' : 'Hide'} line`} data-series-active={!hiddenSeries.has(series.key) && highlightedScenario === series.key || undefined} style={{ color: series.color, ...neonStyle(series.color) }} onClick={() => toggleSeries(series.key)}><i className={series.coast ? 'legend-coast-line' : ''} aria-hidden="true" /><span>{series.name}</span></button></li>)}
      </ul>} />
      {visible.map((result, index) => <Line key={`target-${result.scenario.id}`} hide={hiddenSeries.has(result.scenario.id)} dataKey={`${result.scenario.id}__target`} data-chart-key={result.scenario.id} stroke={scenarioColor(result.scenario.color)} style={neonStyle(scenarioColor(result.scenario.color))} strokeWidth={1.4} strokeDasharray={`${3 + index} 6`} strokeOpacity={0.35} dot={false} activeDot={false} legendType="none" />)}
      {visible.map((result) => {
        const retirementPoint = result.points.find((point) => point.projectionPhase === 'retirement');
        if (!retirementPoint || hiddenSeries.has(result.scenario.id)) return null;
        const retirementDate = new Date(retirementPoint.date);
        const x = axis === 'age' ? retirementPoint.age : retirementDate.getFullYear() + retirementDate.getMonth() / 12;
        return <ReferenceLine key={`retirement-${result.scenario.id}`} x={x} stroke={scenarioColor(result.scenario.color)} style={neonStyle(scenarioColor(result.scenario.color))} strokeDasharray="7 5" strokeOpacity={0.6} />;
      })}
      {visible.map((result) => <Line key={result.scenario.id} hide={hiddenSeries.has(result.scenario.id)} dataKey={result.scenario.id} data-chart-key={result.scenario.id} type="monotone" stroke={scenarioColor(result.scenario.color)} style={neonStyle(scenarioColor(result.scenario.color))} strokeWidth={selected === result.scenario.id ? 3 : 2} dot={false} activeDot={false} isAnimationActive={false} opacity={selected && selected !== result.scenario.id ? .42 : 1} />)}
      {showRemaining && visible.map((result) => <Line key={`${result.scenario.id}__remaining`} hide={hiddenSeries.has(result.scenario.id)} dataKey={`${result.scenario.id}__remaining`} data-chart-key={result.scenario.id} type="monotone" stroke={scenarioColor(result.scenario.color)} style={neonStyle(scenarioColor(result.scenario.color))} strokeWidth={2} strokeDasharray="2 6" strokeOpacity={0.45} legendType="none" dot={false} activeDot={false} isAnimationActive={false} opacity={selected && selected !== result.scenario.id ? .42 : 1} />)}
      {coastPoints && <Line key={coastKey} hide={!coastShown} dataKey={coastKey} data-chart-key={coastKey} type="monotone" stroke={chartColors[2]} style={neonStyle(chartColors[2])} strokeWidth={2.5} strokeDasharray="9 5" dot={false} activeDot={false} isAnimationActive={false} />}
      {showRemaining && coastPoints && <Line key={`${coastKey}__remaining`} hide={!coastShown} dataKey={`${coastKey}__remaining`} data-chart-key={coastKey} type="monotone" stroke={chartColors[2]} style={neonStyle(chartColors[2])} strokeWidth={2} strokeDasharray="2 6" strokeOpacity={0.45} legendType="none" dot={false} activeDot={false} isAnimationActive={false} />}
      {visible.map((result) => {
        const gap = gaps.get(result.scenario.id);
        if (!gap || gap.month > maxMonth || hiddenSeries.has(result.scenario.id)) return null;
        return <ReferenceDot key={`gap-${result.scenario.id}`} x={axis === 'age' ? gap.age : new Date(gap.date).getFullYear() + new Date(gap.date).getMonth() / 12} y={gap.firePortfolio} r={5} fill="var(--surface)" stroke="var(--amber)" strokeWidth={2} label={result === focused ? ({ viewBox }) => {
          const box = viewBox as { x: number; y: number; width: number; height: number };
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const labelX = cx + 36;
          const labelY = Math.max(28, cy - 18);
          return <g className="spending-gap-annotation" pointerEvents="none" aria-label="Spending gap starts here">
            <path d={`M ${labelX - 8} ${labelY + 6} L ${cx + 9} ${cy - 1}`} fill="none" stroke="var(--amber)" strokeWidth={1.3} markerEnd={`url(#${glowId}-gap-arrow)`} />
            <text x={labelX} y={labelY} textAnchor="start" fill="var(--text-secondary)" fontSize={11}><tspan x={labelX}>Spending gap</tspan><tspan x={labelX} dy={14}>starts here</tspan></text>
          </g>;
        } : undefined} />;
      })}
      {visible.map((result) => {
        const crossing = fundedTargetCrossing(result);
        return crossing && crossing.month <= maxMonth && !hiddenSeries.has(result.scenario.id) ? <ReferenceDot key={`dot-${result.scenario.id}`} x={axis === 'age' ? crossing.age : new Date(crossing.date).getFullYear() + new Date(crossing.date).getMonth() / 12} y={crossing.firePortfolio} r={5} fill={scenarioColor(result.scenario.color)} style={neonStyle(scenarioColor(result.scenario.color))} stroke="var(--surface)" strokeWidth={2} /> : null;
      })}
    </ComposedChart></ResponsiveContainer>{visible.every((result) => hiddenSeries.has(result.scenario.id)) && !coastShown && <p className="timeline-empty-state">All lines hidden. Tap a name below to show a line.</p>}<div className="timeline-floating-layer" ref={setTooltipPortal} /></ChartSurface>
    <div className="chart-key"><span><i className="solid-line" /> Spending covered</span>{showRemaining && hasVisibleGap && <span><i className="dotted-line" /> Some spending unpaid</span>}<span><i className="dash-line" /> FIRE target</span><span><i className="retirement-line" /> Retirement begins</span></div>
  </>;
}

export function RetirementOutlook({ result, onViewHorizon }: { result: ScenarioResult; onViewHorizon: () => void }) {
  const funding = result.retirementFunding;
  const coast = result.coastFire;
  const eligibility = coast?.eligibilityPoint;
  return <div className="retirement-outlook">
    <Section title="Can this plan cover retirement?" eyebrow="Your living expenses" className="funding-card">
      <div className="outlook-body">
        <strong className={`outlook-status ${retirementReady(result) ? 'positive-text' : 'negative-text'}`}>{retirementFundingStatus(result)}</strong>
        <p className="outlook-summary muted">Retire at {funding.startAge.toFixed(1)} · Spend {money(funding.firstYearWithdrawal / 12)}/mo · Checked to age {funding.horizonAge}.</p>
        <details className="result-details"><summary>View details</summary>
          <p className="muted">Living expenses must be paid from available money every month. Includes the early retirement bridge and scheduled conversion taxes. Uses your entered returns and spending.</p>
          <div className="mini-metrics outlook-metrics"><div><span>Investments at retirement</span><strong>{money(funding.balanceAtRetirement, true)}</strong></div><div><span>At age {funding.horizonAge}</span><strong>{money(funding.endingBalance, true)}</strong></div></div>
          {funding.totalWithdrawalShortfall >= 0.01 && <p className="outlook-detail-warning">{money(funding.totalWithdrawalShortfall)} of spending goes unpaid across the projection. Remaining balances do not deduct unpaid spending; this total is not additional savings needed today.</p>}
          {funding.unpaidConversionTax >= 0.01 && <p className="outlook-detail-warning">{money(funding.unpaidConversionTax)} of scheduled conversion taxes is unpaid.</p>}
          {funding.points.some((point) => point.rothTransfers.some((transfer) => transfer.warning)) && <p className="outlook-detail-warning">Some scheduled Roth transfers need attention. Review them under Accounts.</p>}
          <p className="muted">Market downturns, other taxes, and access strategies not modeled here can change the outcome.</p>
          {result.profile.maxAge < funding.horizonAge && <button className="button secondary" onClick={onViewHorizon}>View through age {funding.horizonAge}</button>}
        </details>
      </div>
    </Section>
    <Section title="Coast FIRE" eyebrow="When investing becomes optional" className="coast-card">
      <div className="outlook-body">
        <strong className={`outlook-status ${eligibility ? 'positive-text' : 'negative-text'}`}>{coast?.reached ? 'Reached now' : eligibility ? `Projected eligibility at age ${eligibility.age.toFixed(1)}` : coast?.targetFundingGap ? 'Keep investing: retirement funding gap' : 'Not reached before retirement'}</strong>
        <p className="outlook-summary muted">{eligibility ? `Work or other income still pays your bills until age ${result.profile.retirementAge.toFixed(1)}. After that, the Coast path covers projected spending through age ${coast!.funding!.horizonAge}.` : coastFireMessage(result)}</p>
        <details className="result-details"><summary>View details</summary>{eligibility && <p>{coastFireMessage(result)}</p>}<div className="mini-metrics outlook-metrics"><div><span>Full retirement</span><strong>Age {result.profile.retirementAge.toFixed(1)}</strong></div><div><span>FIRE goal at retirement</span><strong>{coast ? money(coast.retirementTarget, true) : '—'}</strong></div></div><p className="muted">Eligibility requires reaching your FIRE goal by retirement and paying every month's living expenses and scheduled conversion taxes through age {result.retirementFunding.horizonAge}, including the early retirement bridge. {eligibility && 'Keep investing until the eligibility age, then stop new contributions, including employer contributions. '}Based on your account returns and inflation assumptions.</p>{eligibility && <p className="muted">Compare this alternative using Show Coast path in Scenario timelines.</p>}</details>
      </div>
    </Section>
  </div>;
}

export function SummaryTable({ results, selected, onSelect }: { results: ScenarioResult[]; selected: string; onSelect: (id: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>FIRE goal</th><th>Target age / date</th><th>At retirement age</th><th>Monthly investing</th><th>Surplus / shortfall</th><th>Spending coverage</th></tr></thead><tbody>{results.map((result) => { const delta = result.targetPoint.firePortfolio - result.targetPoint.fireTarget; const status = monthStatus(result); const crossing = fundedTargetCrossing(result); const gap = spendingGapPoint(result.retirementFunding); return <tr key={result.scenario.id} className={selected === result.scenario.id ? 'selected' : ''} onClick={() => onSelect(result.scenario.id)}><td><i className="color-swatch" style={{ background: scenarioColor(result.scenario.color), ...neonStyle(scenarioColor(result.scenario.color)) }} /><strong>{result.scenario.name}</strong></td><td>{money(result.fireNumber, true)}</td><td><strong>{crossing ? age(crossing.age) : gap ? 'Spending gap' : 'Not reached'}</strong><small>{crossing ? new Date(crossing.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : gap ? `Age ${gap.age.toFixed(1)}` : `By age ${result.profile.maxAge}`}</small></td><td>{money(result.targetPoint.firePortfolio, true)}</td><td>{money(result.plannedPersonalMonthly + result.plannedEmployerMonthly)}/mo<small>{money(result.plannedEmployerMonthly)} employer</small></td><td className={delta >= 0 ? 'positive-text' : 'negative-text'}>{delta >= 0 ? '+' : ''}{money(delta, true)}</td><td><span className={`status ${status.tone}`}>{status.text}</span></td></tr>; })}</tbody></table></div>;
}

export function Analytics({ result, data }: { result: ScenarioResult; data: AppData }) {
  const glowId = `analytics-glow-${useId().replace(/:/g, '')}`;
  const [compositionPortal, setCompositionPortal] = useState<HTMLDivElement | null>(null);
  const [allocationPortal, setAllocationPortal] = useState<HTMLDivElement | null>(null);
  const [highlightedComposition, setHighlightedComposition] = useState<string | null>(null);
  const [highlightedAccount, setHighlightedAccount] = useState<string | null>(null);
  const dockedTooltip = useDockedChartTooltip();
  const portfolio = retirementPortfolioComposition(result);
  const compositionColors = ['#98adb8', '#d3a17e', '#a6b69f', '#b5a1bb', '#40c7d9'];
  const composition = portfolio.slices.map((slice, index) => ({ ...slice, color: compositionColors[index] }));
  const accountData = result.points.filter((_, index) => index % 12 === 0 && index <= Math.min(result.points.length - 1, Math.ceil((65 - result.profile.currentAge) * 12))).map((p) => ({ age: p.age, ...p.balances }));
  const allocations = allocationByClass(data.accounts);
  return <div className="analytics-grid">
    <Section title="What builds the portfolio" eyebrow="At retirement age">
      <div className="composition"><ChartSurface className="donut" svgGlowId={`${glowId}-pie`} onHighlightChange={setHighlightedComposition}><ResponsiveContainer width="100%" height="100%"><PieChart>{chartGlowDefinition(`${glowId}-pie`)}<Pie data={composition} dataKey="value" innerRadius={48} outerRadius={76} paddingAngle={3} stroke="var(--surface)">{composition.map((item) => <Cell key={item.name} data-chart-key={item.name} fill={item.color} style={neonStyle(item.color)} />)}</Pie><Tooltip
        portal={compositionPortal}
        active={dockedTooltip ? true : undefined}
        isAnimationActive={false}
        wrapperStyle={{ width: '100%', height: '100%', position: 'relative' }}
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const item = composition.find((part) => part.name === String(payload[0].name));
          const color = item?.color ?? String(payload[0].color);
          return <div className="composition-tooltip"><i className="series-dot" data-series-active={highlightedComposition === item?.name || undefined} style={{ background: color, ...neonStyle(color) }} /><span>{payload[0].name}</span><strong>{money(Number(payload[0].value))}</strong></div>;
        }}
      /></PieChart></ResponsiveContainer><div><strong>{money(portfolio.total, true)}</strong><small>Total</small></div></ChartSurface><div className="legend-list">{composition.map((item) => <div key={item.name}><i className="color-swatch series-dot" data-series-active={highlightedComposition === item.name || undefined} style={{ background: item.color, ...neonStyle(item.color) }} /><span>{item.name}</span><b>{money(item.value, true)}</b><small>{item.percentage.toFixed(1)}%</small></div>)}</div></div>
      {portfolio.hasDeductions && <p className="chart-phase-note muted">Slices show money remaining at retirement. Losses, conversion taxes, or transfers out reduce these amounts proportionally.</p>}
      <div className="composition-readout" ref={setCompositionPortal}><p>Hover or tap a segment to see its value here.</p></div>
    </Section>
    <Section title="All-account allocation" eyebrow="Current holdings" className="allocation-panel">
      <ChartSurface className="allocation-chart" svgGlowId={`${glowId}-bars`}><ResponsiveContainer width="100%" height="100%"><BarChart data={allocations} layout="vertical" margin={{ left: 16, right: 20 }}>{chartGlowDefinition(`${glowId}-bars`)}<XAxis type="number" hide /><YAxis type="category" dataKey="name" width={112} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false}
        portal={allocationPortal}
        active={dockedTooltip ? true : undefined}
        isAnimationActive={false}
        wrapperStyle={{ width: '100%', height: '100%', position: 'relative' }}
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const item = payload[0];
          const name = String(item.payload?.name ?? 'Allocation');
          const index = allocations.findIndex((allocation) => allocation.name === name);
          const color = allocationColors[Math.max(0, index) % allocationColors.length];
          return <div className="composition-tooltip"><i className="color-swatch" style={{ background: color, ...neonStyle(color) }} /><span>{name}</span><strong>{money(Number(item.value))}</strong></div>;
        }}
      /><Bar dataKey="value" radius={[0, 5, 5, 0]} activeBar={false}>{allocations.map((_, i) => <Cell key={i} fill={allocationColors[i % allocationColors.length]} style={neonStyle(allocationColors[i % allocationColors.length])} />)}</Bar></BarChart></ResponsiveContainer></ChartSurface>
      <div className="composition-readout allocation-readout" ref={setAllocationPortal}><p>Hover or tap a bar to see its value here.</p></div>
    </Section>
    <Section title="Account balances over time" eyebrow="Selected scenario · independent balances" className="wide-panel">
      <div className="account-chart-note"><span>Each line is one account—not a cumulative stack.</span><span>Contributions before retirement · withdrawals after</span></div>
      {result.retirementFunding.firstUnfundedAge != null && <p className="chart-phase-note muted">These lines show remaining investments, including money you cannot yet use. Some living expenses go unpaid from age {result.retirementFunding.firstUnfundedAge.toFixed(1)}.</p>}
      <ChartSurface className="account-chart" svgGlowId={`${glowId}-accounts`} onHighlightChange={setHighlightedAccount}><ResponsiveContainer width="100%" height="100%"><LineChart data={accountData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>{chartGlowDefinition(`${glowId}-accounts`)}<CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="age" tickFormatter={(v) => Number(v).toFixed(0)} stroke="var(--muted)" axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => money(v, true)} stroke="var(--muted)" width={58} axisLine={false} tickLine={false} /><Tooltip content={(props) => accountTooltip({ ...props, highlightedKey: highlightedAccount })} active={dockedTooltip ? highlightedAccount !== null : undefined} isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }} />{result.accounts.map((account, i) => <Line key={account.id} type="monotone" dataKey={account.id} data-chart-key={account.id} name={account.name} stroke={chartColors[i % chartColors.length]} style={neonStyle(chartColors[i % chartColors.length])} strokeWidth={2.2} dot={false} activeDot={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></ChartSurface>
    </Section>
  </div>;
}

export function BridgeAndEmergency({ result, data }: { result: ScenarioResult; data: AppData }) {
  const bridge = bridgeMetrics(result);
  const { startAge, years: bridgeYears, need: bridgeNeed, accessible } = bridge;
  const coverage = bridgeNeed === 0 ? 1 : Math.min(bridge.funded ? 1 : 0.999, bridge.fundedAmount / bridgeNeed);
  const currentBudget = scenarioBudgetMetrics(data, result.scenario);
  const cashAccount = result.accounts.find((a) => a.type === 'HYSA / Cash');
  const phase = currentBudget.phase;
  const cashSavings = cashAccount ? (phase?.contributions[cashAccount.id]?.personal ?? cashAccount.monthlyContribution) : 0;
  const emergency = emergencyFundMetrics(cashAccount?.balance ?? 0, result.profile.emergencyTarget, cashSavings, data.profile.normalMonthlySpending, data.profile.jobLossMonthlySpending);
  return <div className="bridge-grid">
    <Section title="Living expenses before age 59½" eyebrow="Early retirement bridge" className="bridge-panel">
      <p className="muted">{bridgeYears > 0 ? `From retirement at age ${startAge.toFixed(1)} until age 59½, living expenses need money you can already use.` : 'Your retirement starts at or after 59½, so no early retirement bridge is needed.'}</p>
      <div className="bridge-callout">
        <ChartSurface className={`bridge-ring ${bridge.funded ? 'good' : 'warn'}`} style={neonStyle(bridge.funded ? chartColors[1] : chartColors[6])}><strong>{percent(coverage, 1)}</strong><small>covered</small></ChartSurface>
        <div><h3>{bridgeYears === 0 ? 'No bridge needed' : bridge.funded ? 'Living expenses are covered' : `Money falls short at age ${(bridge.firstGapAge ?? startAge).toFixed(1)}`}</h3><p>{bridgeYears === 0 ? 'Retirement spending is checked separately through the full projection.' : bridge.funded ? 'Accessible money covers your planned spending until retirement accounts become available.' : 'Some money is unavailable or insufficient when needed. Later investment growth does not cover the earlier gap.'}</p></div>
      </div>
      <details className="result-details panel-details"><summary>View details</summary>
      <div className="mini-metrics"><div><span>Accessible at retirement</span><strong>{money(accessible)}</strong></div><div><span>First-year spending</span><strong>{money(result.retirementFunding.firstYearWithdrawal)}</strong></div><div><span>Bridge years</span><strong>{bridgeYears.toFixed(1)}</strong></div></div>
      <p className="muted">{percent(coverage, 1)} of projected spending and scheduled conversion taxes is covered: {money(bridge.fundedAmount)} of {money(bridgeNeed)}.{!bridge.funded && ` ${money(bridge.shortfall)} goes unpaid. This total is not the additional savings needed today.`}</p>
      {bridge.conversionTax > 0 && <p className="muted">Bridge funding includes {money(bridge.conversionTax)} of scheduled conversion taxes.</p>}
      <p className="fine-print">Only accounts marked to fund FIRE are used for spending. The model uses liquid funds first, then Roth IRA regular contributions and accessible conversion principal in tax-year order. Taxable conversions follow their five-tax-year clocks; later unlocks, investment growth, inflation, and scheduled conversion taxes are included. IRA and 401(k) access cannot be made unrestricted by changing their accessibility label. Ordinary retirement accounts unlock at 59½; HSA general spending is modeled from 65. Rule of 55, SEPP/72(t), medical-receipt exceptions, ordinary withdrawal taxes, and Roth earnings qualification are not modeled. A shortfall in any month prevents an overall funded result, even if balances recover later.</p>
      </details>
    </Section>
    <Section title="Emergency fund" eyebrow="Cash runway"><p className="muted">Cash target: {money(result.profile.emergencyTarget)} · Normal spending: {money(data.profile.normalMonthlySpending)}/mo · Job-loss spending: {money(data.profile.jobLossMonthlySpending)}/mo</p><div className="mini-metrics"><div><span>Normal runway</span><strong>{emergency.normalRunway.toFixed(1)} mo</strong></div><div><span>Job-loss runway</span><strong>{emergency.jobLossRunway.toFixed(1)} mo</strong></div><div><span>Target ETA</span><strong>{Number.isFinite(emergency.monthsToTarget) ? `${emergency.monthsToTarget} mo` : 'No savings'}</strong></div></div><ChartSurface className="progress" style={neonStyle(chartColors[1])}><span style={{ width: `${Math.min(100, (cashAccount?.balance ?? 0) / Math.max(1, result.profile.emergencyTarget) * 100)}%` }} /></ChartSurface><small className="muted">{money(emergency.remaining)} remaining · {money(cashSavings)}/mo current cash savings</small></Section>
  </div>;
}

export function Sensitivity({ data, selectedScenario }: { data: AppData; selectedScenario: Scenario }) {
  const { profile, accounts, phases } = applyScenarioOverrides(data, selectedScenario);
  const fireAgeFor = (settings: Parameters<typeof projectCore>[0]) => findFireCrossing(projectCore(settings))?.age;
  const base = { profile, accounts, phases };
  const baselineAge = fireAgeFor(base);
  const returns = [.03, .04, .05, .06, .07].map((value) => ({ label: percent(value, 0), age: fireAgeFor({ ...base, profile: { ...profile, realReturn: value, nominalReturn: nominalReturnFromReal(value, profile.inflationRate) } }) }));
  const extraAccount = accounts.find((account) => account.fireEligible && account.type === 'Taxable Brokerage') ?? accounts.find((account) => account.fireEligible);
  const contributions = [0, 250, 500, 1000].map((extra) => ({ label: extra === 0 ? 'Current' : `+${money(extra)}/mo`, age: fireAgeFor({ ...base, extraMonthlyContribution: extra }) }));
  const spending = [-.2, -.1, 0, .1, .2].map((delta) => ({ label: money(profile.annualSpending * (1 + delta)), age: fireAgeFor({ ...base, profile: { ...profile, annualSpending: profile.annualSpending * (1 + delta) } }) }));
  const rates = [.03, .0325, .035, .0375, .04].map((value) => ({ label: percent(value, 2), age: fireAgeFor({ ...base, profile: { ...profile, withdrawalRate: value } }) }));
  const group = (title: string, items: { label: string; age?: number }[]) => <ColorCard className="sensitivity-group"><strong>{title}</strong><div>{items.map((item) => {
    const difference = item.age == null || baselineAge == null ? undefined : item.age - baselineAge;
    return <span key={item.label}><small>{item.label}</small><b>{item.age == null ? 'Not reached' : `Age ${item.age.toFixed(1)}`}</b><small>{difference == null ? `By age ${profile.maxAge}` : Math.abs(difference) < 1 / 12 ? 'Same age' : `${Math.abs(difference).toFixed(1)} years ${difference < 0 ? 'earlier' : 'later'}`}</small></span>;
  })}</div></ColorCard>;
  return <Section title="Sensitivity explorer" eyebrow="What could move your FIRE date?">
    <p className="muted">For <strong>{selectedScenario.name}</strong>, the current assumptions {baselineAge == null ? `do not reach FIRE by age ${profile.maxAge}` : `reach FIRE at age ${baselineAge.toFixed(1)}`}. Each row changes one assumption and compares with that baseline. These previews do not change your plan.</p>
    <p className="muted">This explorer assumes you keep contributing until FIRE, even beyond your chosen retirement age. The main chart includes retirement withdrawals, so its result can differ. These are fixed-return estimates, not probabilities of success. Custom account returns stay unchanged.</p>
    <div className="sensitivity-grid">{group('Real annual return · after inflation', returns)}{extraAccount && group(`Extra monthly investing → ${extraAccount.name}`, contributions)}{profile.customFireNumber == null ? <>{group('Annual retirement spending', spending)}{group('Withdrawal rate · sizes your goal', rates)}</> : <p className="muted">Your custom FIRE target is fixed. Spending and withdrawal-rate changes do not change that target. Reset it to the spending-based calculation in Plan to explore those assumptions.</p>}</div>
  </Section>;
}

import type { ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';

export const money = (value: number, compact = false) => {
  if (!Number.isFinite(value)) return 'Not reachable';
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};
export const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
export const age = (value?: number | null) => value == null || !Number.isFinite(value) ? 'Not reached' : `Age ${value.toFixed(1)}`;

export function Field({ label, value, onChange, prefix, suffix, step = 1, min, max, hint, error }: {
  label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string;
  step?: number; min?: number; max?: number; hint?: string; error?: string;
}) {
  return <label className="field">
    <span className="field-label">{label}{hint && <span className="hint" title={hint}><Info size={13} /></span>}</span>
    <span className={`input-shell ${error ? 'invalid' : ''}`}>
      {prefix && <span>{prefix}</span>}
      <input type="number" value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max}
        onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))} />
      {suffix && <span>{suffix}</span>}
    </span>
    {error && <small className="field-error">{error}</small>}
  </label>;
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="field"><span className="field-label">{label}</span><input className="text-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}

export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span><span className="select-shell"><select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select><ChevronDown size={15} /></span></label>;
}

export function Toggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (value: boolean) => void; detail?: string }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span><button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}><span /></button></label>;
}

export function Section({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

export function Metric({ label, value, sub, tone = 'default', info }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'positive' | 'negative' | 'accent'; info?: string }) {
  return <div className={`metric tone-${tone}`}><span className="metric-label">{label}{info && <span className="hint" title={info}><Info size={13} /></span>}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

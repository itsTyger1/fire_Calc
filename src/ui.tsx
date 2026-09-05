import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const numberText = (value: number) => Number.isFinite(value) ? String(value) : '';

export function CommittedNumberInput({ value, onCommit, min, max, step = 1, ariaLabel, className }: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => numberText(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(numberText(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(numberText(value));
      return;
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(numberText(next));
    onCommit(next);
  };
  const pending = draft !== numberText(value);

  return <input
    ref={inputRef}
    className={[className, pending ? 'pending-value' : ''].filter(Boolean).join(' ')}
    aria-label={ariaLabel}
    title="Press Enter to apply this value. Press Escape to cancel."
    type="number"
    value={draft}
    step={step}
    min={min}
    max={max}
    onChange={(event) => setDraft(event.target.value)}
    onFocus={(event) => event.currentTarget.select()}
    onClick={(event) => { if (!pending) event.currentTarget.select(); }}
    onBlur={() => setDraft(numberText(value))}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        setDraft(numberText(value));
        event.currentTarget.blur();
      }
    }}
  />;
}

export function Field({ label, value, onChange, prefix, suffix, step = 1, min, max, hint, error }: {
  label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string;
  step?: number; min?: number; max?: number; hint?: string; error?: string;
}) {
  return <label className="field">
    <span className="field-label">{label}{hint && <span className="hint" title={hint}><Info size={13} /></span>}</span>
    <span className={`input-shell ${error ? 'invalid' : ''}`}>
      {prefix && <span>{prefix}</span>}
      <CommittedNumberInput value={value} step={step} min={min} max={max} onCommit={onChange} />
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

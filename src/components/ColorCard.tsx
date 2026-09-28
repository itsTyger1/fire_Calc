import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { observeVisibleCard } from './VisibleCardGlow';

// Touch screens keep the selected card bright until another card is touched.
export function ColorCard({ as: Tag = 'div', className = '', onPointerDown, onPointerCancel, ...props }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' }) {
  const [touched, setTouched] = useState(false);
  const card = useRef<HTMLElement | null>(null);
  useEffect(() => card.current ? observeVisibleCard(card.current) : undefined, []);
  useEffect(() => {
    if (!touched) return;
    const clear = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) setTouched(false);
    };
    document.addEventListener('pointerdown', clear);
    return () => document.removeEventListener('pointerdown', clear);
  }, [touched]);
  return <Tag {...props} ref={(node) => { card.current = node; }} className={`${className} color-card`} data-card-active={touched || undefined}
    onPointerDown={(event) => { onPointerDown?.(event); if (event.pointerType === 'touch') setTouched(true); }}
    onPointerCancel={(event) => { onPointerCancel?.(event); setTouched(false); }} />;
}

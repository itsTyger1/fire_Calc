import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const dockedTooltipQuery = '(max-width: 760px), (pointer: coarse)';
const chartMarkSelector = '.recharts-line-curve, .recharts-sector, .recharts-rectangle, .bar-track > span, .progress > span, .bridge-ring';
const activeMarkSelector = '[data-chart-highlight="true"]';

function nearestLine(target: Element, clientX: number, clientY: number): SVGPathElement | null {
  const svg = target.closest('svg.recharts-surface');
  if (!svg) return null;

  let nearest: SVGPathElement | null = null;
  let nearestDistance = 26;
  svg.querySelectorAll<SVGPathElement>('.recharts-line-curve').forEach((path) => {
    const matrix = path.getScreenCTM();
    const length = path.getTotalLength();
    const point = path.ownerSVGElement?.createSVGPoint();
    if (!matrix || !point || !length) return;

    // Lines are only a few pixels wide, which makes them difficult to tap on a phone.
    // Sample each visible line in screen space and select only the closest one.
    const samples = Math.min(160, Math.max(2, Math.ceil(length / 6)));
    for (let index = 0; index <= samples; index += 1) {
      const localPoint = path.getPointAtLength((length * index) / samples);
      point.x = localPoint.x;
      point.y = localPoint.y;
      const screenPoint = point.matrixTransform(matrix);
      const distance = Math.hypot(screenPoint.x - clientX, screenPoint.y - clientY);
      if (distance < nearestDistance) {
        nearest = path;
        nearestDistance = distance;
      }
    }
  });
  return nearest;
}

export function useDockedChartTooltip() {
  const [docked, setDocked] = useState(() => window.matchMedia(dockedTooltipQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(dockedTooltipQuery);
    const update = () => setDocked(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return docked;
}

export function ChartSurface({ className, children, style, svgGlowId, onHighlightChange }: { className: string; children: ReactNode; style?: CSSProperties; svgGlowId?: string; onHighlightChange?: (key: string | null) => void }) {
  const [touched, setTouched] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const pendingPointer = useRef<{ target: Element; x: number; y: number } | null>(null);
  const pointerFrame = useRef<number | null>(null);
  const highlightedKey = useRef<string | null>(null);
  const highlightedMark = useRef<{ element: Element; index: number; key: string | null } | null>(null);
  const highlight = useCallback((mark: Element | null) => {
    highlightedMark.current = mark && surface.current ? {
      element: mark,
      index: Array.from(surface.current.querySelectorAll(chartMarkSelector)).indexOf(mark),
      key: mark.getAttribute('data-chart-key'),
    } : null;
    const current = surface.current?.querySelector(activeMarkSelector);
    if (current !== mark) {
      current?.removeAttribute('data-chart-highlight');
      mark?.setAttribute('data-chart-highlight', 'true');
    }
    // Linked dots update only when the selected series changes, not on every move.
    const key = mark?.getAttribute('data-chart-key') ?? null;
    if (highlightedKey.current !== key) {
      highlightedKey.current = key;
      onHighlightChange?.(key);
    }
  }, [onHighlightChange]);
  useEffect(() => {
    const root = surface.current;
    if (!root) return;
    // Recharts can replace SVG marks while redrawing. Keep the exact selected
    // mark synchronized with its legend without changing the selected series.
    const observer = new MutationObserver(() => {
      const selected = highlightedMark.current;
      if (!selected) return;
      const mark = root.contains(selected.element) ? selected.element : root.querySelectorAll(chartMarkSelector)[selected.index];
      if (!mark || mark.getAttribute('data-chart-key') !== selected.key) return;
      selected.element = mark;
      if (mark.getAttribute('data-chart-highlight') !== 'true') mark.setAttribute('data-chart-highlight', 'true');
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chart-highlight'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!touched) return;
    const clearOnOutsideTouch = (event: PointerEvent) => {
      if (!surface.current?.contains(event.target as Node)) {
        highlight(null);
        setTouched(false);
      }
    };
    document.addEventListener('pointerdown', clearOnOutsideTouch);
    return () => document.removeEventListener('pointerdown', clearOnOutsideTouch);
  }, [touched, highlight]);
  useEffect(() => () => {
    if (pointerFrame.current !== null) window.cancelAnimationFrame(pointerFrame.current);
  }, []);
  return <div
    ref={surface}
    style={{ ...style, ...(svgGlowId ? { '--chart-svg-glow': `url(#${svgGlowId})` } : {}) } as CSSProperties}
    className={`${className} chart-surface`}
    onMouseMoveCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) event.stopPropagation();
    }}
    onPointerMoveCapture={(event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.chart-tooltip')) {
        event.stopPropagation();
        return;
      }
      // A tap owns touch selection. Compatibility mouse events after a touch
      // must not replace it, and dragging to scroll must remain native.
      if (event.pointerType === 'touch') return;
      pendingPointer.current = { target: event.target, x: event.clientX, y: event.clientY };
      if (pointerFrame.current !== null) return;
      pointerFrame.current = window.requestAnimationFrame(() => {
        pointerFrame.current = null;
        const pointer = pendingPointer.current;
        if (!pointer) return;
        const directMark = pointer.target.closest(chartMarkSelector);
        const target = directMark ?? nearestLine(pointer.target, pointer.x, pointer.y);
        const mark = target && surface.current?.contains(target) ? target : null;
        highlight(mark);
      });
    }}
    onTouchMoveCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) event.stopPropagation();
    }}
    onTouchStartCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) event.stopPropagation();
    }}
    onTouchEndCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) event.stopPropagation();
    }}
    onClickCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) event.stopPropagation();
    }}
    onPointerLeave={(event) => {
      if (event.pointerType === 'touch') return;
      if (surface.current?.querySelector('[data-tooltip-dragging="true"]')) return;
      pendingPointer.current = null;
      if (pointerFrame.current !== null) {
        window.cancelAnimationFrame(pointerFrame.current);
        pointerFrame.current = null;
      }
      highlight(null);
    }}
    onPointerDown={(event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.chart-tooltip')) return;
      pendingPointer.current = null;
      if (pointerFrame.current !== null) {
        window.cancelAnimationFrame(pointerFrame.current);
        pointerFrame.current = null;
      }
      const target = event.target.closest(chartMarkSelector) ?? nearestLine(event.target, event.clientX, event.clientY);
      const mark = target && surface.current?.contains(target) ? target : null;
      highlight(mark);
      setTouched(event.pointerType === 'touch' && !!mark);
    }}
    onPointerCancel={(event) => {
      if (event.target instanceof Element && event.target.closest('.chart-tooltip')) return;
      highlight(null);
      setTouched(false);
    }}
  >{children}</div>;
}

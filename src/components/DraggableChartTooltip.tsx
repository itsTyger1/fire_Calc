import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

type Position = { x: number; y: number };

export function DraggableChartTooltip({ boundary, coordinate, heading, children }: {
  boundary: HTMLElement | null;
  coordinate?: Position;
  heading: ReactNode;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [automatic, setAutomatic] = useState<Position>({ x: 8, y: 8 });
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; origin: Position } | null>(null);
  const pending = useRef<Position | null>(null);
  const frame = useRef<number | null>(null);
  const placed = position ?? automatic;

  const clamp = (next: Position): Position => ({
    x: Math.max(8, Math.min(next.x, (boundary?.clientWidth ?? 0) - (popup.current?.offsetWidth ?? 0) - 8)),
    y: Math.max(8, Math.min(next.y, (boundary?.clientHeight ?? 0) - (popup.current?.offsetHeight ?? 0) - 8)),
  });

  useLayoutEffect(() => {
    if (!boundary || !popup.current) return;
    const place = () => {
      const width = popup.current?.offsetWidth ?? 0;
      const height = popup.current?.offsetHeight ?? 0;
      const x = coordinate?.x ?? 0;
      const y = coordinate?.y ?? 0;
      const next = clamp({
        x: x + width + 12 < boundary.clientWidth ? x + 12 : x - width - 12,
        y: y + height + 12 < boundary.clientHeight ? y + 12 : y - height - 12,
      });
      setAutomatic((previous) => previous.x === next.x && previous.y === next.y ? previous : next);
      setPosition((previous) => {
        if (!previous) return null;
        const clamped = clamp(previous);
        return previous.x === clamped.x && previous.y === clamped.y ? previous : clamped;
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(boundary);
    observer.observe(popup.current);
    return () => observer.disconnect();
  }, [boundary, coordinate?.x, coordinate?.y]);

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    event.stopPropagation();
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    if (pending.current) setPosition(pending.current);
    pending.current = null;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div ref={popup} className="chart-tooltip timeline-chart-tooltip draggable-chart-tooltip" role="group" aria-label="Projection details"
    data-tooltip-dragging={dragging || undefined} style={{ left: placed.x, top: placed.y }}>
    <div className="tooltip-heading tooltip-drag-handle" role="button" tabIndex={0} aria-label="Move projection details" title="Drag to move details"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: placed };
        pending.current = null;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        pending.current = clamp({ x: drag.current.origin.x + event.clientX - drag.current.x, y: drag.current.origin.y + event.clientY - drag.current.y });
        if (frame.current !== null) return;
        frame.current = window.requestAnimationFrame(() => {
          frame.current = null;
          if (pending.current) setPosition(pending.current);
        });
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={(event) => {
        const movement = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
        if (!movement) return;
        event.preventDefault();
        event.stopPropagation();
        setPosition(clamp({ x: placed.x + movement[0], y: placed.y + movement[1] }));
      }}>
      <i className="tooltip-grip" aria-hidden="true" />{heading}
    </div>
    <div className="tooltip-scroll-body">{children}</div>
  </div>;
}

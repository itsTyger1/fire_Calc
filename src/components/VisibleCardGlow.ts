// One observer and one passive scroll listener serve every card. Glow changes
// update a DOM attribute only; scrolling never recalculates the financial plan.
const cards = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | null = null;
let sizes: ResizeObserver | null = null;
let frame: number | null = null;
let current: HTMLElement | null = null;

function update() {
  frame = null;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const left = viewport?.offsetLeft ?? 0;
  const bottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const right = left + (viewport?.width ?? window.innerWidth);
  const top = Math.max(viewportTop, document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0);
  let best: HTMLElement | null = null;
  let bestScore = 0;
  let currentScore = 0;
  visible.forEach((card) => {
    // A nested group belongs to its section until the user interacts with it.
    if (!card.isConnected || card.parentElement?.closest('.color-card')) return;
    const box = card.getBoundingClientRect();
    const clippedTop = Math.max(top, box.top);
    const clippedBottom = Math.min(bottom, box.bottom);
    const visibleHeight = Math.max(0, clippedBottom - clippedTop);
    const area = visibleHeight * Math.max(0, Math.min(right, box.right) - Math.max(left, box.left));
    const coverage = Math.min(1, visibleHeight / Math.max(1, Math.min(box.height, bottom - top)));
    const distance = Math.abs((clippedTop + clippedBottom) / 2 - (top + bottom) / 2) / Math.max(1, bottom - top);
    // Favor a fully visible section over the edge of a much taller next section.
    // Cap the denominator at the screen height so large charts can still win.
    const score = area * (.25 + .75 * coverage) * (1 - .4 * distance);
    if (card === current) currentScore = score;
    if (score > bestScore) { best = card; bestScore = score; }
  });
  // Keep ties stable while two adjacent sections exchange screen space.
  if (current && currentScore > 0 && currentScore >= bestScore * .97) best = current;
  if (best === current) return;
  current?.removeAttribute('data-card-visible');
  current = best;
  current?.setAttribute('data-card-visible', 'true');
}

function schedule() {
  if (frame === null) frame = window.requestAnimationFrame(update);
}

export function observeVisibleCard(card: HTMLElement) {
  cards.add(card);
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
        else visible.delete(entry.target as HTMLElement);
      });
      schedule();
    });
    sizes = new ResizeObserver(schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  }
  observer.observe(card);
  sizes?.observe(card);
  schedule();
  return () => {
    observer?.unobserve(card);
    sizes?.unobserve(card);
    cards.delete(card);
    visible.delete(card);
    if (current === card) { card.removeAttribute('data-card-visible'); current = null; }
    if (cards.size) { schedule(); return; }
    observer?.disconnect();
    observer = null;
    sizes?.disconnect();
    sizes = null;
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
}

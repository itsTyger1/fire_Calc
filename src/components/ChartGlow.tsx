// Keep the glow in the chart's own SVG so touch and hover use the same
// rendering path, including on WebKit. sRGB preserves the neon palette.
export function chartGlowDefinition(id: string) {
  return <defs>
    <filter id={id} filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="halo" />
      <feMerge>
        <feMergeNode in="halo" />
        <feMergeNode in="halo" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>;
}

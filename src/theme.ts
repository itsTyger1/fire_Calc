// Translate the original built-in colors at render time so saved plans keep
// their data and scenario identities while adopting the quieter palette.
import type { CSSProperties } from 'react';

export const chartColors = ['#d3a17e', '#a6b69f', '#98adb8', '#b5a1bb', '#d79a91', '#93b6b0', '#c6b18a', '#bbb99a'];
const neonColors = ['#ff9d45', '#a3ff57', '#52d5ff', '#da70ff', '#ff6b86', '#42ffd7', '#ffe34d', '#ddff65'];
export const neonStyle = (color: string): CSSProperties => ({
  '--chart-neon': neonColors[chartColors.indexOf(color.toLowerCase())] ?? color,
} as CSSProperties);
const originalColors = ['#37d39a', '#f4b860', '#65a7ff', '#ad7bff', '#ff718d', '#40c7d9', '#e69245', '#93c95b'];

export const scenarioColor = (color: string): string => {
  const index = originalColors.indexOf(color.toLowerCase());
  return index < 0 ? color : chartColors[index];
};

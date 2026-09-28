// Approximate long-run U.S. stock total return, including reinvested dividends.
// https://www.fidelity.com/learning-center/trading-investing/sp-500-average-return
export const INITIAL_NOMINAL_RETURN = 0.10;
// CPI annualized growth, 1913–2025: (321.9 / 9.9) ** (1 / 112) - 1,
// rounded to 3.2%. Use completed years, not the partial 2026 estimate.
// https://www.minneapolisfed.org/about-us/monetary-policy/inflation-calculator/consumer-price-index-1913-
export const INITIAL_INFLATION_RATE = 0.032;
export const INITIAL_WITHDRAWAL_RATE = 0.04;
export const INITIAL_MAX_AGE = 100;

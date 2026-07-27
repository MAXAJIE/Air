/**
 * Default currency symbol used across the shopping page.
 * Can be overridden at runtime by setting `setCurrencySymbol()`.
 * Initial default: "RM" (Malaysian Ringgit).
 */
let _currencySymbol = "RM";

/**
 * Override the global currency symbol at runtime.
 * Useful for making currency configurable per group or per locale.
 */
export function setCurrencySymbol(symbol: string) {
  _currencySymbol = symbol;
}

/**
 * Get the current currency symbol.
 */
export function getCurrencySymbol(): string {
  return _currencySymbol;
}

/**
 * Format a number as a price string with currency symbol.
 * Optionally accepts a custom symbol; defaults to the configured one.
 * Example: formatPrice(12.5) → "RM 12.50"
 */
export function formatPrice(amount: number, symbol?: string): string {
  const sym = symbol ?? _currencySymbol;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym} ${formatted}`;
}

/**
 * Format a number as a price string with currency symbol.
 * Handles null/undefined by returning "—".
 */
export function formatPriceNullable(amount: number | null | undefined, symbol?: string): string {
  if (amount == null) return "—";
  return formatPrice(amount, symbol);
}

/**
 * Set the currency symbol from an i18n translation key value.
 * Call this once at app startup (e.g. in __root.tsx) with t("shop.currencySymbol").
 */
export function initCurrencyFromI18n(currencyKey: string) {
  if (currencyKey && currencyKey.trim()) {
    _currencySymbol = currencyKey.trim();
  }
}

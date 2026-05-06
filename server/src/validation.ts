const SYMBOL_PATTERN = /^[A-Z0-9]+([.-][A-Z0-9]+)*$/;
const MAX_SYMBOL_LENGTH = 10;

export function normalizeSymbol(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

export function isValidSymbol(symbol: string): boolean {
  return symbol.length > 0
    && symbol.length <= MAX_SYMBOL_LENGTH
    && SYMBOL_PATTERN.test(symbol);
}

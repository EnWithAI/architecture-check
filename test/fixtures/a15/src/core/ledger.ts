export function balance(entries: number[]): number {
  return entries.reduce((sum, n) => sum + n, 0);
}

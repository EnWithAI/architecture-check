import { balance } from "../core/ledger.js";

export function main(): number {
  return balance([1, 2, 3]);
}

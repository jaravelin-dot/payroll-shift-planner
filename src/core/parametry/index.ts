import type { ParametryRoku } from './typy';
import { parametry2026 } from './2026';
import { parametry2027 } from './2027';
import { zmrazit } from './zmrazit';

export type { ParametryRoku } from './typy';

/** Parametry pro daný rok: roky do 2026 → 2026, od 2027 výše → 2027 (před 2026 a nad 2027 s poznámkou v `predbezne`). */
export function parametryRoku(rok: number): ParametryRoku {
  if (rok < 2026) return zmrazit({ ...parametry2026, predbezne: [...parametry2026.predbezne, `Rok ${rok} používá parametry 2026 — ověř`] });
  if (rok === 2026) return parametry2026;
  if (rok === 2027) return parametry2027;
  return zmrazit({ ...parametry2027, predbezne: [...parametry2027.predbezne, `rok ${rok} nemá vlastní parametry`] });
}

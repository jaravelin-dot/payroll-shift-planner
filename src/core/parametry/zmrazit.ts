import type { ParametryRoku } from './typy';

/** Zmrazí parametry včetně polí (hloubkově; jiné vnořené hodnoty tu nejsou), aby je nešlo omylem změnit. */
export function zmrazit(p: ParametryRoku): ParametryRoku {
  for (const hodnota of Object.values(p)) {
    if (Array.isArray(hodnota)) Object.freeze(hodnota);
  }
  return Object.freeze(p);
}

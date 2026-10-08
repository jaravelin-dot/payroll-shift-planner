import { Banknote, CalendarDays, Ellipsis, FileText, Settings, Users, type LucideIcon } from 'lucide-react';

export interface PolozkaNavigace {
  cesta: string;
  nazev: string;
  ikona: LucideIcon;
  /** Cesty (a jejich podstránky), na kterých je položka aktivní. */
  aktivniNa: string[];
}

const VYPLATY: PolozkaNavigace = { cesta: '/', nazev: 'Výplaty', ikona: Banknote, aktivniNa: ['/', '/clovek'] };
const SMENY: PolozkaNavigace = { cesta: '/smeny', nazev: 'Směny', ikona: CalendarDays, aktivniNa: ['/smeny'] };
const LIDE: PolozkaNavigace = { cesta: '/lide', nazev: 'Lidé', ikona: Users, aktivniNa: ['/lide'] };
const VYSTUPY: PolozkaNavigace = { cesta: '/vystupy', nazev: 'Výstupy', ikona: FileText, aktivniNa: ['/vystupy'] };
const NASTAVENI: PolozkaNavigace = { cesta: '/nastaveni', nazev: 'Nastavení', ikona: Settings, aktivniNa: ['/nastaveni'] };
// Na mobilu se Výstupy a Nastavení otevírají přes Více, takže tam patří i jejich aktivní stav.
const VICE: PolozkaNavigace = { cesta: '/vice', nazev: 'Více', ikona: Ellipsis, aktivniNa: ['/vice', '/vystupy', '/nastaveni'] };

/** Levý panel na PC. */
export const NAVIGACE_PC = [VYPLATY, SMENY, LIDE, VYSTUPY, NASTAVENI];
/** Spodní lišta na mobilu. */
export const NAVIGACE_MOBIL = [VYPLATY, SMENY, LIDE, VICE];

export function jeAktivni(polozka: PolozkaNavigace, pathname: string): boolean {
  return polozka.aktivniNa.some((cesta) => (cesta === '/' ? pathname === '/' : pathname === cesta || pathname.startsWith(`${cesta}/`)));
}

// Souhrn hodin a dnů jednoho měsíce: z docházky (dnů) udělá čísla, na kterých staví složky mzdy.
import type { Den, NastaveniFirmy, Smlouva } from '../shared/api';
import { denVTydnu, jeSvatek } from './kalendar';
import type { SouhrnHodin } from './typy';

/** Hodiny z minut pro texty: „300", „37,5", „0,33". */
export function formatHodin(minuty: number): string {
  const hodiny = minuty / 60;
  return Number.isInteger(hodiny) ? String(hodiny) : String(Math.round(hodiny * 100) / 100).replace('.', ',');
}

/** Práce od 3 hodin zakládá nárok na stravné, práce nad 11 hodin na druhé (spec 5.5). */
const STRAVNE_OD_MIN = 180;
const STRAVNE_DRUHE_NAD_MIN = 660;

export function souhrnHodin(dny: Den[], nastaveni: NastaveniFirmy, smlouva: Smlouva): SouhrnHodin {
  const s: SouhrnHodin = {
    praceMin: 0, praceVsedniMin: 0, sobotaMin: 0, nedeleMin: 0, svatekPraceMin: 0,
    dovolenaMin: 0, svatekZavrenoMin: 0, nahradniVolnoMin: 0, nemocMin: 0, neplaceneMin: 0, absenceMin: 0,
    odpracovaneDny: 0, dnyVsedni: 0, dnySobota: 0, dnyNedele: 0, dnySvatek: 0,
    dnyKasa: 0, dnyNemocKalendarni: 0, dnyDovolena: 0, dnySvatekZavreno: 0,
    smenyStravne: 0, nahradniVolnoZiskaneMin: 0,
  };
  const stravneNarok = smlouva === 'HPP' || nastaveni.stravneProDpp;

  for (const d of dny) {
    switch (d.typ) {
      case 'PRACE': {
        s.praceMin += d.minuty;
        if (d.minuty <= 0) break; // den bez odpracovaných minut není odpracovaný den
        s.odpracovaneDny += 1;
        if (d.kasa) s.dnyKasa += 1;
        const denTydne = denVTydnu(d.datum);
        const svatek = jeSvatek(d.datum);
        if (denTydne === 6) { s.sobotaMin += d.minuty; s.dnySobota += 1; }
        if (denTydne === 7) { s.nedeleMin += d.minuty; s.dnyNedele += 1; }
        if (svatek) { s.svatekPraceMin += d.minuty; s.dnySvatek += 1; }
        if (denTydne < 6 && !svatek) { s.praceVsedniMin += d.minuty; s.dnyVsedni += 1; }
        if (stravneNarok && d.minuty >= STRAVNE_OD_MIN) s.smenyStravne += d.minuty > STRAVNE_DRUHE_NAD_MIN ? 2 : 1;
        break;
      }
      case 'DOVOLENA':
        s.dovolenaMin += d.minuty;
        if (d.minuty > 0) s.dnyDovolena += 1;
        break;
      case 'SVATEK_ZAVRENO':
        s.svatekZavrenoMin += d.minuty;
        if (d.minuty > 0) s.dnySvatekZavreno += 1;
        break;
      case 'NAHRADNI_VOLNO': s.nahradniVolnoMin += d.minuty; break;
      case 'NEMOC':
        s.nemocMin += d.minuty;
        s.dnyNemocKalendarni += 1; // NEMOC se eviduje na každý kalendářní den, i s 0 minutami
        break;
      case 'NEPLACENE': s.neplaceneMin += d.minuty; break;
      case 'ABSENCE': s.absenceMin += d.minuty; break;
    }
  }

  if (nastaveni.praceVeSvatek === 'NAHRADNI_VOLNO') s.nahradniVolnoZiskaneMin = s.svatekPraceMin;
  return s;
}

// Složky hrubé mzdy jednoho zaměstnance a měsíce (spec 5.4, 5.9, 5.11): základ z hodinových sazeb, příplatky,
// odměny, doplatek do minimální mzdy, náhrady mzdy a náhrada za nemoc. Vše v haléřích. Součty se drží jako
// přesné zlomky (sazba × minuty, ne po dnech zaokrouhlené) a každá složka se zaokrouhlí na celé Kč jednou, až na konci.
import type { Sazba } from '../shared/api';
import { formatHodin, souhrnHodin } from './hodiny';
import { denVTydnu, dnyMesice, hodinovaMinimalniMzdaProZamestnance } from './kalendar';
import { dnyNahradyNemoci, redukovanyPvHal } from './nemoc';
import { parametryRoku } from './parametry';
import { formatKc, zaokrouhliHalNaKc, zaokrouhliZlomekNaKc } from './penize';
import type { KodSlozky, Slozka, SouhrnHodin, Varovani, VstupVypoctu } from './typy';

/** Typografické minus; escapem, aby bylo v kódu vidět. */
const MINUS = '\u2212';

export interface VysledekSlozek {
  slozky: Slozka[];
  hrubaHal: number;
  nahradaNemocHal: number;
  nahradaNemocVzorec: string;
  /**
   * Odměna za den, jak by vyšla bez podmínky „propadá při nemoci" (pro porovnání variant).
   * U DPP je 0, když je `odmenyIProDpp` vypnuté (odměna za den se tam nevyplácí).
   */
  odmenaZaDenBezPodminkyHal: number;
  hodiny: SouhrnHodin;
  /** Minuty nemoci z prvních 14 kalendářních dnů epizody, za které zaměstnavatel platí náhradu mzdy. */
  nahrazovaneNemocMin: number;
  varovani: Varovani[];
}

/** Hodinová sazba (haléře/h) platná v daný den: poslední sazba s `platiOd` ≤ datum; `null`, když žádná neplatí. */
export function sazbaProDen(sazby: readonly Sazba[], datum: string): number | null {
  let nejlepsi: Sazba | null = null;
  for (const s of sazby) {
    if (s.platiOd <= datum && (nejlepsi === null || s.platiOd > nejlepsi.platiOd)) nejlepsi = s;
  }
  return nejlepsi === null ? null : nejlepsi.hodinovaHal;
}

/**
 * Hodinová sazba, ze které se pro měsíc odhaduje (průměrný výdělek, sjednaný příjem): sazba platná k 1. dni měsíce,
 * jinak nejdřívější sazba, která začíná během měsíce (nástup uprostřed měsíce). `odDne` je den, od kterého sazba platí
 * (1. den měsíce, nebo začátek sazby). `null`, když v měsíci žádná sazba neplatí.
 */
export function sazbaProMesic(sazby: readonly Sazba[], rok: number, mesic: number): { hodinovaHal: number; odDne: string } | null {
  const dny = dnyMesice(rok, mesic);
  const prvniDen = dny[0]!;
  const posledniDen = dny[dny.length - 1]!;
  const kPrvnimuDni = sazbaProDen(sazby, prvniDen);
  if (kPrvnimuDni !== null) return { hodinovaHal: kPrvnimuDni, odDne: prvniDen };
  let nejdrivejsi: Sazba | null = null;
  for (const s of sazby) {
    if (s.platiOd <= posledniDen && (nejdrivejsi === null || s.platiOd < nejdrivejsi.platiOd)) nejdrivejsi = s; // žádná neplatí k 1. dni, tedy všechny začínají později
  }
  return nejdrivejsi === null ? null : { hodinovaHal: nejdrivejsi.hodinovaHal, odDne: nejdrivejsi.platiOd };
}

/** „1 den", „2 dny", „5 dní". */
function dnyText(pocet: number): string {
  if (pocet === 1) return '1 den';
  return `${pocet} ${pocet >= 2 && pocet <= 4 ? 'dny' : 'dní'}`;
}

/** Částka vždy s haléři: „180,00 Kč" (hodinová sazba v náhradě za nemoc bývá na haléře). */
function formatKcSHaleri(hal: number): string {
  const text = formatKc(hal);
  return text.includes(',') ? text : text.replace(' Kč', ',00 Kč');
}

/** `2026-10-15` → „15. 10. 2026". */
export function formatDatum(datum: string): string {
  const [rok, mesic, den] = datum.split('-');
  return `${Number(den)}. ${Number(mesic)}. ${rok}`;
}

export function vypocitejSlozky(v: VstupVypoctu, pvHal: number): VysledekSlozek {
  const n = v.nastaveni;
  const p = parametryRoku(v.rok);
  const hodiny = souhrnHodin(v.dny, n, v.zamestnanec.smlouva);
  const hpp = v.zamestnanec.smlouva === 'HPP';
  // Odměny (za den, aktivita, kasa) a paušál za So/Ne: HPP vždy, DPP jen když je firma pro DPP vyplácí.
  const odmeny = hpp || n.odmenyIProDpp;
  const slozky: Slozka[] = [];
  const varovani: Varovani[] = [];

  /**
   * Částku `citatelHal / jmenovatel` zaokrouhlí na celé Kč (přesně v integerech), nenulovou složku přidá do pole
   * (v pořadí volání) a vrátí zaokrouhlenou částku.
   */
  const pridej = (kod: KodSlozky, popis: string, vzorec: string, citatelHal: number, jmenovatel = 1): number => {
    const castkaHal = zaokrouhliZlomekNaKc(citatelHal, jmenovatel);
    if (castkaHal !== 0) slozky.push({ kod, popis, vzorec, castkaHal });
    return castkaHal;
  };

  // --- Základ: Σ sazba platná ten den × minuty / 60 ---
  let zakladSazbaMin = 0;
  let zakladMin = 0;
  let bezSazbyMin = 0;
  let bezSazbyDny = 0;
  let prvniBezSazby = '';
  const pouziteSazby = new Set<number>();
  for (const d of v.dny) {
    if (d.typ !== 'PRACE' || d.minuty <= 0) continue;
    const sazbaHal = sazbaProDen(v.sazby, d.datum);
    if (sazbaHal === null) {
      bezSazbyMin += d.minuty;
      bezSazbyDny += 1;
      if (prvniBezSazby === '' || d.datum < prvniBezSazby) prvniBezSazby = d.datum;
      continue;
    }
    pouziteSazby.add(sazbaHal);
    zakladSazbaMin += sazbaHal * d.minuty;
    zakladMin += d.minuty;
  }
  if (bezSazbyDny > 0) {
    varovani.push({ kod: 'CHYBI_SAZBA', text:
      `Chybí hodinová sazba pro ${dnyText(bezSazbyDny)} práce (nejdřív ${formatDatum(prvniBezSazby)}), `
      + `${formatHodin(bezSazbyMin)} h se do základu mzdy nezapočítalo.` });
  }
  const zakladVzorec = pouziteSazby.size > 1
    ? `${formatHodin(zakladMin)} h podle sazeb platných v jednotlivé dny`
    : `${formatHodin(zakladMin)} h × ${formatKc([...pouziteSazby][0] ?? 0)}`;
  const zakladHal = pridej('ZAKLAD', 'Základní mzda', zakladVzorec, zakladSazbaMin, 60);

  // DPP: sazba pod minimální mzdou je porušení v samotné dohodě; doplatek do minima se počítá níž stejně jako u HPP.
  if (!hpp) {
    const pod = [...pouziteSazby].filter((s) => s < p.minMzdaHodHal).sort((a, b) => a - b);
    if (pod.length > 0) {
      const sazbyText = pod.map(formatKc).join(' a ');
      varovani.push({ kod: 'DPP_SAZBA_POD_MINIMEM', text:
        `${pod.length === 1 ? 'Sazba' : 'Sazby'} ${sazbyText} za hodinu ${pod.length === 1 ? 'je' : 'jsou'} pod minimální mzdou `
        + `${formatKc(p.minMzdaHodHal)} za hodinu. Odměna z dohody nesmí být nižší (§ 111 zákoníku práce), `
        + `proto se doplácí do minima; zkontroluj sazbu v dohodě.` });
    }
  }

  // --- Příplatek za sobotu / neděli: za každý odpracovaný den max(paušál, 10 % PV × hodiny) ---
  // Zákonných 10 % PV (§ 138 ZP) náleží vždy i u DPP; paušál firmy jen tam, kde se vyplácejí odměny.
  const priplatekVikendu = (
    kod: 'PRIPLATEK_SOBOTA' | 'PRIPLATEK_NEDELE', popis: string, kdy: string, denTydne: 6 | 7, pausalNastaveniHal: number,
  ): void => {
    const pausalHal = odmeny ? pausalNastaveniHal : 0;
    // Zlomky se jmenovatelem 600: 10 % × PV × minuty / 60 = PV × minuty / 600.
    let soucet600 = 0;
    let minut = 0;
    let dnu = 0;
    let dnuSPv = 0;
    for (const d of v.dny) {
      if (d.typ !== 'PRACE' || d.minuty <= 0 || denVTydnu(d.datum) !== denTydne) continue;
      dnu += 1;
      minut += d.minuty;
      const zPv = pvHal * d.minuty;
      if (zPv > pausalHal * 600) { soucet600 += zPv; dnuSPv += 1; } else soucet600 += pausalHal * 600;
    }
    const jenZakonne = pausalHal === 0;
    const vzorec = jenZakonne
      ? `${formatHodin(minut)} h × 10 % × ${formatKc(pvHal)}`
      : dnuSPv > 0
        ? `${dnyText(dnu)}, vyšší z paušálu ${formatKc(pausalHal)} a 10 % PV × odpracované hodiny`
        : `${dnyText(dnu)} × ${formatKc(pausalHal)}`;
    const castkaHal = pridej(kod, popis, vzorec, soucet600, 600);
    if (!jenZakonne && dnuSPv > 0) {
      varovani.push({ kod: 'PRIPLATEK_POD_MINIMEM', text:
        `Příplatek za práci v ${kdy}: u ${dnuSPv} z ${dnu} odpracovaných dnů vychází 10 % průměrného výdělku výš `
        + `než paušál ${formatKc(pausalHal)}, proto se vyplácí vyšší částka (celkem ${formatKc(castkaHal)} místo `
        + `${formatKc(zaokrouhliHalNaKc(pausalHal * dnu))} podle paušálu).` });
    }
  };
  priplatekVikendu('PRIPLATEK_SOBOTA', 'Příplatek za práci v sobotu', 'sobotu', 6, n.priplatekSobotaHal);
  priplatekVikendu('PRIPLATEK_NEDELE', 'Příplatek za práci v neděli', 'neděli', 7, n.priplatekNedeleHal);

  // --- Příplatek za práci ve svátek: 100 % PV (platí i pro DPP) ---
  if (n.praceVeSvatek === 'PRIPLATEK') {
    pridej('PRIPLATEK_SVATEK', 'Příplatek za práci ve svátek',
      `${formatHodin(hodiny.svatekPraceMin)} h × 100 % × ${formatKc(pvHal)}`, pvHal * hodiny.svatekPraceMin, 60);
  }

  // --- Odměna za den (propadá při nemoci, když to firma má nastavené) ---
  const odmenaZaDenHal = v.vstup?.odmenaZaDenHal ?? 0;
  const odmenaBezPodminkyHal = odmeny ? zaokrouhliHalNaKc(odmenaZaDenHal * hodiny.odpracovaneDny) : 0;
  const odmenaPropadla = odmenaBezPodminkyHal !== 0 && n.odmenaZaDenPropadaPriNemoci && hodiny.dnyNemocKalendarni > 0;
  if (odmenaPropadla) {
    varovani.push({ kod: 'ODMENA_PROPADLA_NEMOC', text:
      `Odměna za den ${formatKc(odmenaBezPodminkyHal)} (${dnyText(hodiny.odpracovaneDny)} × ${formatKc(odmenaZaDenHal)}) propadla, `
      + `protože byl zaměstnanec v měsíci nemocný. Inspekce práce takovou podmínku pokutuje (viz výzkum).` });
  }
  const odmenaHal = odmenaPropadla ? 0 : pridej('ODMENA_ZA_DEN', 'Odměna za odpracovaný den',
    `${dnyText(hodiny.odpracovaneDny)} × ${formatKc(odmenaZaDenHal)}`, odmenaBezPodminkyHal);

  // --- Aktivita, kasa, jiné odměny ---
  const aktivitaZaDenHal = v.vstup?.aktivitaHal ?? 0;
  const aktivitaHal = odmeny ? pridej('AKTIVITA', 'Aktivita',
    `${dnyText(hodiny.odpracovaneDny)} × ${formatKc(aktivitaZaDenHal)}`, aktivitaZaDenHal * hodiny.odpracovaneDny) : 0;
  const kasaHal = odmeny ? pridej('KASA', 'Příplatek za kasu',
    `${dnyText(hodiny.dnyKasa)} × ${formatKc(n.priplatekKasaHal)}`, n.priplatekKasaHal * hodiny.dnyKasa) : 0;
  const jineHal = pridej('JINE_ODMENY', 'Jiné odměny', 'z měsíčního vstupu', v.vstup?.jineOdmenyHal ?? 0);

  // --- Doplatek do minimální mzdy (HPP i DPP, § 111 ZP): hodinové minimum × odpracované hodiny − mzda a odměny ---
  // HPP s minimem podle stanovené týdenní doby, DPP se základním minimem. Příplatky a náhrady se nezapočítávají.
  // Dny bez sazby se do hodin nepočítají (nevstoupily ani do základu), jinak by se jejich mzda dorovnala doplatkem.
  const minHodHal = hodinovaMinimalniMzdaProZamestnance(p, n, v.zamestnanec.smlouva);
  const dosazenoHal = zakladHal + odmenaHal + aktivitaHal + kasaHal + jineHal;
  const doplatekHal = pridej('DOPLATEK_MIN_MZDA', 'Doplatek do minimální mzdy',
    `${formatKc(minHodHal)} × ${formatHodin(zakladMin)} h ${MINUS} ${formatKc(dosazenoHal)} (mzda a odměny)`,
    Math.max(0, minHodHal * zakladMin - dosazenoHal * 60), 60);
  if (doplatekHal > 0) {
    varovani.push({ kod: 'DOPLATEK_MIN_MZDA', text:
      `Mzda a odměny za ${formatHodin(zakladMin)} h nedosahují minimální mzdy `
      + `(${formatKc(minHodHal)} za hodinu, celkem ${formatKc(zaokrouhliZlomekNaKc(minHodHal * zakladMin, 60))}); `
      + `doplatek činí ${formatKc(doplatekHal)}.` });
  }

  // --- Náhrady mzdy: PV × hodiny ---
  const nahrada = (kod: KodSlozky, popis: string, minuty: number): void => {
    pridej(kod, popis, `${formatHodin(minuty)} h × ${formatKc(pvHal)}`, pvHal * minuty, 60);
  };
  nahrada('NAHRADA_DOVOLENA', 'Náhrada mzdy za dovolenou', hodiny.dovolenaMin);
  if (hpp) nahrada('NAHRADA_SVATEK', 'Náhrada mzdy za svátek', hodiny.svatekZavrenoMin);
  nahrada('NAHRADA_NAHRADNI_VOLNO', 'Náhrada mzdy za náhradní volno', hodiny.nahradniVolnoMin);

  // --- Náhrada za nemoc (nepatří do hrubé mzdy; u nepojištěné DPP ji vynuluje až celkový výpočet) ---
  const { nahrazovane, nadLimit } = dnyNahradyNemoci(v.dny, v.dnyPredchozi);
  const nahrazovaneMin = nahrazovane.reduce((soucet, d) => soucet + d.minuty, 0);
  const redukovanyHal = redukovanyPvHal(pvHal, p.redukcniHraniceHal);
  // 60 % × redukovaný PV × minuty / 60 = redukovaný PV × minuty / 100
  const nahradaNemocHal = zaokrouhliZlomekNaKc(redukovanyHal * nahrazovaneMin, 100);
  const nahradaNemocVzorec = nahrazovane.length === 0 ? ''
    : `${dnyText(nahrazovane.length)}, ${formatHodin(nahrazovaneMin)} h × 60 % × ${formatKcSHaleri(redukovanyHal)}`;
  if (nadLimit.length > 0) {
    const nadLimitMin = nadLimit.reduce((soucet, d) => soucet + d.minuty, 0);
    varovani.push({ kod: 'NEMOC_PRES_14_DNU', text:
      `Nemoc trvá déle než 14 kalendářních dnů: za ${dnyText(nadLimit.length)} (${formatHodin(nadLimitMin)} h) po 14. dni `
      + `už zaměstnavatel náhradu mzdy neplatí, od 15. dne vyplácí nemocenské ČSSZ.` });
  }

  const hrubaHal = slozky.reduce((soucet, s) => soucet + s.castkaHal, 0);
  return {
    slozky, hrubaHal, nahradaNemocHal, nahradaNemocVzorec, odmenaZaDenBezPodminkyHal: odmenaBezPodminkyHal,
    hodiny, nahrazovaneNemocMin: nahrazovaneMin, varovani,
  };
}

// Celkový výpočet výplaty jednoho zaměstnance a měsíce (spec 5.5, 5.8, 5.9, 5.11): z hrubých složek, stravného,
// pojistného a daně složí čistou mzdu, částku k výplatě a náklad firmy. Vše v celých haléřích (částky) a celých Kč
// (pojistné, daň); násobení Kč × 100 je jediný převod mezi nimi.
import { vypocitejDan } from './dan';
import { formatHodin } from './hodiny';
import { hodinovaMinimalniMzdaProZamestnance } from './kalendar';
import { parametryRoku } from './parametry';
import { deleniDolu, formatKc, halNaKcDolu, halNaKcNahoru } from './penize';
import { vypocitejPojisteni } from './pojisteni';
import { formatDatum, sazbaProMesic, vypocitejSlozky } from './slozky';
import type { Varovani, VstupVypoctu, VysledekVypoctu } from './typy';

/** Průměrný počet týdnů v měsíci (4,348) v tisícinách; jím se násobí týdenní úvazek při výpočtu sjednaného příjmu. */
const TYDNU_V_MESICI_TISICINY = 4348;

/** Odstraní duplicity (stejný kód i text), pořadí zůstává podle prvního výskytu. */
function bezDuplicit(varovani: Varovani[]): Varovani[] {
  const videno = new Set<string>();
  return varovani.filter((v) => {
    const klic = `${v.kod}\u0000${v.text}`;
    if (videno.has(klic)) return false;
    videno.add(klic);
    return true;
  });
}

export function vypocitejMzdu(v: VstupVypoctu): VysledekVypoctu {
  const p = parametryRoku(v.rok);
  const n = v.nastaveni;
  const smlouva = v.zamestnanec.smlouva;

  // --- Sazba měsíce a průměrný hodinový výdělek: zadaný, jinak sazba platná k 1. dni měsíce (při nástupu v měsíci první
  // sazba v měsíci), nejméně hodinová minimální mzda (§ 357 ZP) ---
  const minHodHal = hodinovaMinimalniMzdaProZamestnance(p, n, smlouva);
  const sazbaMesice = sazbaProMesic(v.sazby, v.rok, v.mesic);
  const varovaniPv: Varovani[] = [];
  let pvZdrojHal = v.prumernyVydelekHal;
  if (pvZdrojHal === null) {
    if (sazbaMesice === null) {
      pvZdrojHal = minHodHal;
      varovaniPv.push({ kod: 'CHYBI_SAZBA', text:
        `Zaměstnanec nemá v tomto měsíci žádnou hodinovou sazbu, průměrný hodinový výdělek se proto odhadl `
        + `z hodinové minimální mzdy ${formatKc(minHodHal)}. Doplň sazbu u zaměstnance.` });
      varovaniPv.push({ kod: 'PV_ODHADNUT', text:
        `Průměrný hodinový výdělek není zadaný ani spočítaný z minulého čtvrtletí; odhadl se z hodinové `
        + `minimální mzdy ${formatKc(minHodHal)}. Náhrady mzdy tím můžou vyjít nepřesně.` });
    } else {
      pvZdrojHal = sazbaMesice.hodinovaHal;
      const prvniDen = `${v.rok}-${String(v.mesic).padStart(2, '0')}-01`;
      const platnost = sazbaMesice.odDne === prvniDen
        ? 'platné k 1. dni měsíce'
        : `platné od ${formatDatum(sazbaMesice.odDne)} (první sazba v tomto měsíci)`;
      varovaniPv.push({ kod: 'PV_ODHADNUT', text:
        `Průměrný hodinový výdělek není zadaný ani spočítaný z minulého čtvrtletí; odhadl se z hodinové sazby `
        + `${formatKc(sazbaMesice.hodinovaHal)} ${platnost}. Náhrady mzdy tím můžou vyjít nepřesně.` });
    }
  }
  if (!Number.isInteger(pvZdrojHal)) {
    throw new RangeError(`Průměrný hodinový výdělek musí být celé číslo v haléřích, dostal jsem ${pvZdrojHal}.`);
  }
  const pvHal = Math.max(pvZdrojHal, minHodHal);

  // --- Složky mzdy a stravné ---
  const s = vypocitejSlozky(v, pvHal);
  const hrubaHal = s.hrubaHal;
  const stravneCelkemHal = s.hodiny.smenyStravne * n.stravnePausalHal;
  const stravneOsvobozenoHal = s.hodiny.smenyStravne * Math.min(n.stravnePausalHal, p.stravneLimitHal);
  const stravneZdanitelneHal = stravneCelkemHal - stravneOsvobozenoHal;
  // Skutečný zdanitelný příjem: vyměřovací základ (výše pojistného, záloha) je z něj nahoru; účast na pojištění,
  // srážková daň a bonus se posuzují z příjmu dolů na Kč.
  const zdanitelnyPrijemHal = hrubaHal + stravneZdanitelneHal;
  const vzKc = halNaKcNahoru(zdanitelnyPrijemHal);
  const prijemKc = halNaKcDolu(zdanitelnyPrijemHal);

  // --- Pojistné a daň ---
  // Sjednaný měsíční příjem HPP (§ 6 z. 187/2006): týdenní úvazek × 4,348 × hodinová sazba, přesný zlomek v integerech
  // (úvazek v minutách × 4348 × sazba v haléřích / 6 000 000) dolů na celé Kč; bez sazby neznámý. Rozhodný příjem je celé Kč,
  // takže „výsledek < rozhodný příjem“ platí právě tehdy, když je přesná hodnota pod ním (nic se před porovnáním nezaokrouhluje nahoru).
  const sjednanyPrijemKc = smlouva === 'HPP' && sazbaMesice !== null
    ? deleniDolu(v.zamestnanec.uvazekMinTydne * TYDNU_V_MESICI_TISICINY * sazbaMesice.hodinovaHal, 60 * 1000 * 100)
    : null;
  // Hodiny pro slevu 5 % (§ 7a odst. 3 z. 589/1992): odpracované i hodiny s náhradou mzdy.
  const h = s.hodiny;
  const hodinyProSlevuMin = h.praceMin + h.dovolenaMin + h.svatekZavrenoMin + h.nahradniVolnoMin + s.nahrazovaneNemocMin;
  const { pojisteni, varovani: varovaniPojisteni } = vypocitejPojisteni({
    smlouva, vzKc, prijemHal: zdanitelnyPrijemHal, zamestnanec: v.zamestnanec, rok: v.rok, mesic: v.mesic,
    dnyNemocKalendarni: h.dnyNemocKalendarni, hodinyProSlevuMin, sjednanyPrijemKc, p,
  });
  const dan = vypocitejDan({ smlouva, vzKc, prijemKc, zamestnanec: v.zamestnanec, p });

  // Náhrada za nemoc náleží DPP jen v měsíci, kdy je pojištěná (spec 5.9).
  const bezNahradyNemoci = smlouva === 'DPP' && !pojisteni.pojisteny;
  const nahradaNemocHal = bezNahradyNemoci ? 0 : s.nahradaNemocHal;
  const nahradaNemocVzorec = bezNahradyNemoci ? '' : s.nahradaNemocVzorec;

  // --- Čistá mzda, k výplatě, náklad firmy (spec 5.8) ---
  const srazkyHal = v.vstup?.srazkyHal ?? 0;
  const odvodyKc = pojisteni.socialniZamKc + pojisteni.zdravotniZamKc + pojisteni.doplatekZpKc + dan.danKc - dan.bonusKc;
  const cistaHal = hrubaHal + stravneZdanitelneHal - odvodyKc * 100;
  const kVyplateHal = cistaHal + nahradaNemocHal + stravneOsvobozenoHal - srazkyHal;
  const pojistneFirmyKc = pojisteni.socialniFirmaKc - pojisteni.slevaPojistneKc + pojisteni.zdravotniFirmaKc;
  const nakladFirmyHal = hrubaHal + nahradaNemocHal + stravneCelkemHal + pojistneFirmyKc * 100;

  // --- Varování: docházka mimo pracovní poměr, odhad PV, složky, pojistné, daň (žádná nemá), limit DPP, záporná výplata,
  // předběžné parametry ---
  const varovani: Varovani[] = [];
  const mimoPomer = v.dnyMimoPomer ?? [];
  if (mimoPomer.length > 0) {
    const ukonceni = v.zamestnanec.ukonceni;
    varovani.push({ kod: 'DEN_MIMO_POMER', text:
      `Docházka mimo pracovní poměr se nezapočítá: ${mimoPomer.map(formatDatum).join(', ')}. Pracovní poměr je `
      + `od ${formatDatum(v.zamestnanec.nastup)}${ukonceni === null ? '' : ` do ${formatDatum(ukonceni)}`}. `
      + `Ty dny v docházce smaž, nebo oprav datum nástupu či ukončení.` });
  }
  varovani.push(...varovaniPv, ...s.varovani, ...varovaniPojisteni);
  const dppMinutRoku = v.dppMinutyPredMesicem + s.hodiny.praceMin;
  if (smlouva === 'DPP' && dppMinutRoku > p.dppLimitHodin * 60) {
    varovani.push({ kod: 'DPP_LIMIT_300H', text:
      `Zaměstnanec má na dohodě po tomto měsíci odpracováno ${formatHodin(dppMinutRoku)} h, limit u jednoho `
      + `zaměstnavatele je ${p.dppLimitHodin} h za kalendářní rok (§ 75 zákoníku práce).` });
  }
  if (kVyplateHal < 0) {
    varovani.push({ kod: 'VYPLATA_ZAPORNA', text: srazkyHal > 0
      ? `Částka k výplatě vychází záporná (${formatKc(kVyplateHal)}). Srážky jsou vyšší než výplata. Zkontroluj srážky.`
      : `Výplata vychází záporná (např. doplatek zdravotního pojištění do minima nebo neplacené volno). `
        + `Zkontroluj docházku. Částka k výplatě: ${formatKc(kVyplateHal)}.` });
  }
  if (p.predbezne.length > 0) {
    varovani.push({ kod: 'PREDBEZNY_PARAMETR', text:
      `Pro rok ${v.rok} nejsou všechny zákonné hodnoty závazně vyhlášené, počítá se s předběžnými: ${p.predbezne.join(', ')}.` });
  }

  return {
    slozky: s.slozky,
    hrubaHal,
    nahradaNemocHal, nahradaNemocVzorec,
    stravne: { smen: s.hodiny.smenyStravne, celkemHal: stravneCelkemHal, osvobozenoHal: stravneOsvobozenoHal, zdanitelneHal: stravneZdanitelneHal },
    vzKc,
    pojisteni,
    dan,
    cistaHal, kVyplateHal, nakladFirmyHal,
    odmenaZaDenBezPodminkyHal: s.odmenaZaDenBezPodminkyHal,
    hodiny: s.hodiny,
    pvHal,
    varovani: bezDuplicit(varovani),
    parametry: { rok: p.rok, predbezne: [...p.predbezne] },
  };
}

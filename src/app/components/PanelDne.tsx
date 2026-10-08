import { CopyPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { denVTydnu, dnyMesice, jeSvatek, posunDatum, predchoziMesic, svatky } from '../../core/kalendar';
import type { Den, TypDne, ZamestnanecSeSazbami } from '../../shared/api';
import { formatHodin, minutyNaText, textNaMinuty } from '../cisla';
import { jeDatum } from '../datum';
import { dnyNemoci, nazevDne, obvykleMinuty, pondeliTydne, TYPY_DNU, typyProDny, vychoziMinuty, zkopirujMinulyTyden, type NovyDen } from '../dochazka';
import { Pole } from './Pole';
import { PoleHodin } from './PoleHodin';
import { Prepinac } from './Prepinac';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko } from './Tlacitko';
import { VolbaTypuDne } from './VolbaTypuDne';

export type ZmenaDnu = { dny: NovyDen[]; smazat?: string[] };

type Props = {
  /** Otevřené dny (seřazené); u režimu „nemoc" začátek rozsahu. */
  datumy: string[];
  rezim: 'den' | 'nemoc';
  rok: number;
  mesic: number;
  zamestnanec: ZamestnanecSeSazbami;
  /** Dny osoby (tento a předchozí měsíc): předvyplnění, výchozí hodiny, kopie týdne. */
  dnyOsoby: Den[];
  /** Uloží změnu; `hlaska` je krátká zpráva pro uživatele (např. kolik dní se zkopírovalo). */
  onUloz: (zmena: ZmenaDnu, hlaska?: string) => void;
  onZavrit: () => void;
};

const NEMOC_DO_DALSIHO_MESICE = 'Nemoc, která pokračuje do dalšího měsíce, zadej v dalším měsíci od 1. dne — počítání 14 dní na to naváže.';

function dniText(pocet: number, tvary: [string, string, string]): string {
  return `${pocet} ${pocet === 1 ? tvary[0] : pocet <= 4 && pocet > 0 ? tvary[1] : tvary[2]}`;
}
const jeVolnyDen = (datum: string) => denVTydnu(datum) >= 6 || jeSvatek(datum);
const kratkeDatum = (datum: string) => `${Number(datum.slice(8))}. ${Number(datum.slice(5, 7))}.`;
/** Hodnota společná všem vybraným dnům, jinak `undefined` (různé). */
function spolecna<T>(hodnoty: (T | undefined)[]): T | undefined {
  const prvni = hodnoty[0];
  return prvni !== undefined && hodnoty.every((h) => h === prvni) ? prvni : undefined;
}
/** Jdou seřazené dny za sebou bez mezery? */
const souvisle = (datumy: string[]) => datumy.every((d, i) => i === 0 || posunDatum(datumy[i - 1], 1) === d);
const MAX_VYPSANYCH = 5;
/** „u 1 dne", „u 3 dní". */
const udnu = (pocet: number) => (pocet === 1 ? '1 dne' : `${pocet} dní`);

/** „Přepíšou se 2 už vyplněné dny: 6. 10. Práce 8 h, 7. 10. Dovolená 8 h." (nejvýš 5 dnů, pak „a 3 další"). */
function textPrepisu(prepsane: Den[]): string {
  if (prepsane.length === 0) return 'Žádný vyplněný den se nepřepíše.';
  const n = prepsane.length;
  const uvod = n === 1 ? 'Přepíše se 1 už vyplněný den' : n <= 4 ? `Přepíšou se ${n} už vyplněné dny` : `Přepíše se ${n} už vyplněných dní`;
  const vypis = prepsane.slice(0, MAX_VYPSANYCH).map((d) => `${kratkeDatum(d.datum)} ${TYPY_DNU[d.typ].nazev} ${formatHodin(d.minuty)}`).join(', ');
  const zbyva = n - MAX_VYPSANYCH;
  return `${uvod}: ${vypis}${zbyva > 0 ? ` a ${zbyva} ${zbyva <= 4 ? 'další' : 'dalších'}` : ''}.`;
}

/**
 * Panel jednoho dne nebo vybraných dní: typ, hodiny, kasa, poznámka; u nemoci rozsah od–do; kopie minulého týdne.
 * U víc dní je předvyplněné jen to, co mají všechny vybrané dny stejné; ostatní pole jsou „různé" a uloží se jen,
 * když je uživatel změní (jinak si každý den nechá svou hodnotu).
 */
export function PanelDne({ datumy, rezim, rok, mesic, zamestnanec: z, dnyOsoby, onUloz, onZavrit }: Props) {
  const idHodin = useId();
  const podleData = new Map(dnyOsoby.map((d) => [d.datum, d]));
  const zaznamy = datumy.map((d) => podleData.get(d));
  const existujici = datumy.filter((d) => podleData.has(d));
  const prazdneDny = datumy.filter((d) => !podleData.has(d));
  const prazdne = prazdneDny.length;
  const vsePrazdne = existujici.length === 0;
  const typy = typyProDny(datumy, z.smlouva);
  // Prázdný den nemá typ (je „jiný" než vyplněný), kasu má vypnutou a poznámku prázdnou. Hodiny jsou „různé", jen když
  // se liší aspoň dva vyplněné dny; prázdné dny dostanou hodiny z pole.
  const spolecnyTyp = spolecna(zaznamy.map((d) => d?.typ));
  const spolecneMinuty = spolecna(existujici.map((d) => podleData.get(d)!.minuty));
  const spolecnaKasa = spolecna(zaznamy.map((d) => d?.kasa ?? false));
  const pocatecniTyp: TypDne | undefined = rezim === 'nemoc' ? 'NEMOC' : vsePrazdne ? 'PRACE'
    : spolecnyTyp === undefined ? undefined : typy.includes(spolecnyTyp) ? spolecnyTyp : 'PRACE';

  /** `undefined` = různé typy, které uživatel nezměnil. */
  const [typ, nastavTyp] = useState<TypDne | undefined>(pocatecniTyp);
  /** Text zadaný uživatelem; `null` = hodiny nezměnil. */
  const [hodinyText, nastavHodinyText] = useState<string | null>(null);
  /** `undefined` = různé a nezměněné. */
  const [kasa, nastavKasu] = useState<boolean | undefined>(spolecnaKasa);
  /** Text zadaný uživatelem; `null` = poznámku nezměnil. */
  const [poznamka, nastavPoznamku] = useState<string | null>(null);
  /** Výslovné „Smazat poznámky" u různých poznámek (vymazané pole samo nic nemaže). */
  const [smazatPoznamky, nastavSmazatPoznamky] = useState(false);
  const [od, nastavOd] = useState(datumy[0]);
  const [do_, nastavDo] = useState(datumy[datumy.length - 1]);
  /** Poslední platný rozsah nemoci pro výchozí hodiny (při psaní data se nemění). */
  const [rozsahVychozich, nastavRozsahVychozich] = useState<[string, string]>([datumy[0], datumy[datumy.length - 1]]);
  const [chybaTypu, nastavChybuTypu] = useState<string>();
  const [chybaHodin, nastavChybuHodin] = useState<string>();
  const [chybaRozsahu, nastavChybuRozsahu] = useState<string>();
  const [hlaska, nastavHlasku] = useState<string>();

  const nemoc = typ === 'NEMOC';
  const nemocRozsah = nemoc && od !== do_;
  const nazvySvatku = svatky(rok);
  const svatkyVyberu = datumy.flatMap((datum) => {
    const nazev = nazvySvatku.get(datum);
    return nazev ? [{ datum, nazev }] : [];
  });
  const nadpis = rezim === 'nemoc' ? 'Zadat nemoc' : datumy.length === 1 ? nazevDne(datumy[0]) : `Vybrané dny (${datumy.length})`;

  // Nemoc jde zapsat jen do dnů, které panel vidí (tento a předchozí měsíc); jinak by výpis přepisu nemusel sedět.
  const predchozi = predchoziMesic(rok, mesic);
  const prvniDenOkna = dnyMesice(predchozi.rok, predchozi.mesic)[0];
  const posledniDenOkna = dnyMesice(rok, mesic).at(-1)!;
  const mimoOkno = (datum: string) => (!nemoc || !jeDatum(datum) ? undefined
    : datum > posledniDenOkna ? NEMOC_DO_DALSIHO_MESICE
    : datum < prvniDenOkna ? `Nemoc jde tady zadat nejdřív od ${kratkeDatum(prvniDenOkna)}. Dřívější dny zadej v jejich měsíci.` : undefined);
  const chybaOd = mimoOkno(od);
  const chybaDo = mimoOkno(do_);
  const vOkne = (zacatek: string, konec: string) =>
    jeDatum(zacatek) && jeDatum(konec) && zacatek <= konec && zacatek >= prvniDenOkna && konec <= posledniDenOkna;

  /** Obvyklá směna: hodiny nemoci v pracovní den, na kterém ještě nemoc zapsaná není. */
  const smenaNemoci = obvykleMinuty(dnyOsoby, z);
  /** Platí pole hodin na den nemoci? U jediného dne ano, v rozsahu jen v pracovní dny. */
  const ridiHodiny = (datum: string, zacatek: string, konec: string) => zacatek === konec || !jeVolnyDen(datum);
  /**
   * Hodiny dne nemoci: zadané (jen když je uživatel změnil) na dny, které pole řídí. Jinak si už zapsaná nemoc nechá své
   * hodiny; den s jiným typem a hodinami (práce, dovolená…) je nemá za směnu, kterou by odpracoval, a bere jeho hodiny
   * („Svátek – zavřeno" ne, ten den se nepracuje). Ostatní dny dostanou výchozí: víkend a svátek 0 h, pracovní den obvyklou směnu.
   */
  const minutyNemoci = (datum: string, zacatek: string, konec: string, zadane: number | null) => {
    const puvodni = podleData.get(datum);
    if (zadane !== null && ridiHodiny(datum, zacatek, konec)) return zadane;
    if (puvodni?.typ === 'NEMOC') return puvodni.minuty;
    if (puvodni && puvodni.typ !== 'SVATEK_ZAVRENO' && puvodni.minuty > 0) return puvodni.minuty;
    return jeVolnyDen(datum) ? 0 : smenaNemoci;
  };
  // Pole hodin u nemoci: hodiny společné dnům, které řídí (v posledním platném rozsahu, při psaní data se nemění).
  const [rozsahOd, rozsahDo] = rozsahVychozich;
  const rizeneNemoci = nemoc && vOkne(rozsahOd, rozsahDo)
    ? dnyNemoci(rozsahOd, rozsahDo, 0, z).map((d) => d.datum).filter((d) => ridiHodiny(d, rozsahOd, rozsahDo)) : [];
  const spolecneNemoci = spolecna(rizeneNemoci.map((d) => minutyNemoci(d, rozsahOd, rozsahDo, null)));
  // Bez řízených dnů (např. od–do jen přes víkend) pole jen nabízí obvyklou směnu.
  const hodinyNemoci = rizeneNemoci.length === 0 ? minutyNaText(smenaNemoci) : spolecneNemoci === undefined ? '' : minutyNaText(spolecneNemoci);
  // Hodiny vybraných dnů: společné hodiny vyplněných, u samých prázdných výchozí typu, jinak „různé" ('').
  const hodinyDnu = spolecneMinuty !== undefined ? minutyNaText(spolecneMinuty)
    : vsePrazdne ? minutyNaText(vychoziMinuty(typ ?? 'PRACE', datumy[0], dnyOsoby, z)) : '';
  const hodinyPredvyplnene = nemoc ? hodinyNemoci : hodinyDnu;
  const hodinyRuzne = hodinyPredvyplnene === '';
  // Vymazané pole u „různých" hodin znamená zase „nechat každému dni své".
  const hodinyZmenene = hodinyText !== null && !(hodinyRuzne && hodinyText.trim() === '');
  const hodiny = hodinyZmenene ? hodinyText ?? '' : hodinyPredvyplnene;

  // Poznámka: u jediného cílového dne nebo shodných poznámek předvyplněná (vymazání ji smaže). U různých poznámek a u nemoci
  // od–do prázdná a nezměněná, dokud uživatel nic nenapíše (vymazání vrátí „každý den svou"); smazat jde jen tlačítkem.
  const spolecnaPoznamka = nemocRozsah ? undefined : spolecna((nemoc ? [od] : datumy).map((d) => podleData.get(d)?.poznamka ?? ''));
  const poznamkaVolna = spolecnaPoznamka === undefined;
  const poznamkaZadana = poznamka !== null && (poznamka.trim() !== '' || !poznamkaVolna);
  const smazatVsechny = poznamkaVolna && smazatPoznamky && !poznamkaZadana;
  const ukazKasu = typ === 'PRACE' || (typ === undefined && zaznamy.some((d) => d?.typ === 'PRACE'));

  const zmenTyp = (novy: TypDne) => {
    nastavTyp(novy);
    nastavChybuTypu(undefined);
  };

  const zmenRozsah = (noveOd: string, noveDo: string) => {
    nastavOd(noveOd);
    nastavDo(noveDo);
    nastavChybuRozsahu(undefined);
    if (jeDatum(noveOd) && jeDatum(noveDo)) nastavRozsahVychozich([noveOd, noveDo]);
  };

  /** Poznámka dne: zadaná pro všechny, výslovně smazaná, jinak jeho vlastní. */
  const poznamkaDne = (datum: string) =>
    (poznamkaZadana ? (poznamka ?? '').trim() || null : smazatVsechny ? null : podleData.get(datum)?.poznamka ?? null);
  /** Dny nemoci od–do k uložení: každý kalendářní den v pracovním poměru. */
  const dnyNemociKUlozeni = (zacatek: string, konec: string, zadane: number | null): NovyDen[] =>
    dnyNemoci(zacatek, konec, 0, z).map((d) => ({ ...d, minuty: minutyNemoci(d.datum, zacatek, konec, zadane), poznamka: poznamkaDne(d.datum) }));

  const platnyRozsah = jeDatum(od) && jeDatum(do_) && od <= do_;
  // Náhled jen pro dny, které panel vidí; neplatné zadané hodiny (NaN) počítá jako změnu.
  const dnyNemociNahled = nemoc && vOkne(od, do_) ? dnyNemociKUlozeni(od, do_, hodinyZmenene ? textNaMinuty(hodiny) ?? Number.NaN : null) : [];
  const volnychDnu = dnyNemociNahled.filter((d) => jeVolnyDen(d.datum) && d.minuty === 0).length;
  // Přepíše se vyplněný den, kterému se změní typ, hodiny nebo kasa; den, kterému se změní jen poznámka, se počítá zvlášť.
  const prepsaneNemoci: Den[] = [];
  let jenPoznamkaNemoci = 0;
  for (const d of dnyNemociNahled) {
    const p = podleData.get(d.datum);
    if (!p) continue;
    if (p.typ !== d.typ || p.minuty !== d.minuty || p.kasa !== d.kasa) prepsaneNemoci.push(p);
    else if (p.poznamka !== d.poznamka) jenPoznamkaNemoci++;
  }
  const textZmenNemoci = prepsaneNemoci.length === 0 && jenPoznamkaNemoci > 0 ? `Změní se jen poznámka u ${udnu(jenPoznamkaNemoci)}.`
    : textPrepisu(prepsaneNemoci) + (prepsaneNemoci.length > 0 && jenPoznamkaNemoci > 0
      ? ` Poznámka se změní i u ${jenPoznamkaNemoci === 1 ? '1 dalšího dne' : `${jenPoznamkaNemoci} dalších dní`}.` : '');
  const zmenaNemoci = prepsaneNemoci.length > 0 || jenPoznamkaNemoci > 0;
  // Nemoc od–do píše každý kalendářní den; u výběru s mezerami by přepsala i dny mezi vybranými.
  const vyberSMezerami = rezim === 'den' && datumy.length > 1 && !souvisle(datumy);

  // Nápověda k hodinám: co se stane s dny, které si nechají své hodiny, a co dostanou ostatní.
  const vychoziPrazdnych = !nemoc && typ !== undefined ? prazdneDny.map((d) => vychoziMinuty(typ, d, dnyOsoby, z)) : [];
  const spolecnaVychoziPrazdnych = spolecna(vychoziPrazdnych);
  const textPrazdnych = vychoziPrazdnych.length === 0 ? ''
    : spolecnaVychoziPrazdnych === undefined
      ? ` Prázdné dny dostanou výchozí hodiny: ${prazdneDny.map((d, i) => `${kratkeDatum(d)} ${formatHodin(vychoziPrazdnych[i])}`).join(', ')}.`
      : ` ${prazdne === 1 ? 'Prázdný den dostane' : 'Prázdné dny dostanou'} ${formatHodin(spolecnaVychoziPrazdnych)}.`;
  const prazdnychNemoci = rizeneNemoci.filter((d) => !podleData.has(d)).length;
  const vikendSHodinami = dnyNemociNahled.some((d) => jeVolnyDen(d.datum) && d.minuty > 0);
  const poznamkaVikendHodin = vikendSHodinami ? ' (už zapsaný den si hodiny nechá)' : '';
  // Rozsah jen z víkendů a svátků: pole hodin se nepoužije, zadané hodiny by se tiše zahodily.
  const jenVolneDny = nemocRozsah && rizeneNemoci.length === 0 && dnyNemociNahled.length > 0;
  const napovedaHodin = !nemoc
    ? (hodinyRuzne && !hodinyZmenene ? `Vybrané dny mají různé hodiny. Když je nezměníš, každý den si nechá své.${textPrazdnych}` : undefined)
    : !nemocRozsah ? undefined
    : jenVolneDny && hodinyZmenene
      ? `V tomhle rozsahu jsou jen víkendy a svátky, zadané hodiny se nepoužijí: zůstanou s 0 h${poznamkaVikendHodin}. Každý den jde pak upravit.`
    : hodinyRuzne && !hodinyZmenene
      ? `Dny nemoci mají různé hodiny. Když je nezměníš, každý den si nechá své hodiny${prazdnychNemoci > 0 ? `, prázdné pracovní dny dostanou ${formatHodin(smenaNemoci)}` : ''}.`
      : `Délka směny, kterou by měl. Víkendy a svátky se zapíšou s 0 h${poznamkaVikendHodin}, každý den jde pak upravit.`;

  // Nápověda k poznámce a nabídka výslovného smazání různých poznámek.
  const cilovePoznamky = nemoc ? dnyNemociNahled.map((d) => d.datum) : datumy;
  const nabidnoutSmazani = poznamkaVolna && !poznamkaZadana && cilovePoznamky.some((d) => podleData.get(d)?.poznamka);
  const napovedaPoznamky = smazatVsechny ? `Poznámky ${nemocRozsah ? 'dnů od–do' : 'vybraných dní'} se smažou.`
    : nemocRozsah
      ? (poznamkaZadana ? 'Poznámka se zapíše ke všem dnům od–do.' : 'Napsaná poznámka se zapíše ke všem dnům od–do. Když nic nenapíšeš, každý den si nechá svou.')
      : poznamkaVolna && !poznamkaZadana ? 'Vybrané dny mají různé poznámky. Když tu nic nenapíšeš, každý den si nechá svou.' : undefined;

  const chybaHodinText = (min: number) => `Zadej hodiny od ${min === 0 ? '0' : '0,25'} do 24, např. 8 nebo 7,5.`;
  const chybaVHodinach = (text: string) => {
    nastavChybuHodin(text);
    document.getElementById(idHodin)?.focus();
  };

  const uloz = () => {
    nastavChybuHodin(undefined);
    if (nemoc) {
      // Nezměněné hodiny: každý den dostane, co ukazuje pole a nápověda (zapsaná nemoc své, ostatní výchozí).
      const zadane = hodinyZmenene ? textNaMinuty(hodiny) : null;
      if (hodinyZmenene && (zadane === null || zadane < 0 || zadane > 1440)) return chybaVHodinach(chybaHodinText(0));
      if (!jeDatum(od) || !jeDatum(do_)) return nastavChybuRozsahu('Vyplň začátek i konec nemoci.');
      if (chybaOd || chybaDo) return; // hláška už je u pole
      if (do_ < od) return nastavChybuRozsahu('Konec nemoci nesmí být před začátkem.');
      const dny = dnyNemociKUlozeni(od, do_, zadane);
      if (dny.length === 0) return nastavChybuRozsahu('V tomhle rozsahu není žádný den v pracovním poměru.');
      return onUloz({ dny }, undefined);
    }
    if (typ === undefined && prazdne > 0) {
      const kolik = prazdne === 1 ? '1 vybraný den je zatím prázdný' : prazdne <= 4 ? `${prazdne} vybrané dny jsou zatím prázdné` : `${prazdne} vybraných dní je zatím prázdných`;
      return nastavChybuTypu(`Vyber typ dne: ${kolik}.`);
    }
    // Nezměněné „různé" hodiny: každý den si nechá své, prázdný den dostane výchozí hodiny svého typu.
    const minutyVsem = hodinyRuzne && !hodinyZmenene ? undefined : textNaMinuty(hodiny);
    if (minutyVsem === null || (minutyVsem !== undefined && (minutyVsem < 0 || minutyVsem > 1440))) return chybaVHodinach(chybaHodinText(15));
    const dny: NovyDen[] = datumy.map((datum) => {
      const puvodni = podleData.get(datum);
      const t = typ ?? puvodni!.typ;
      return {
        datum,
        typ: t,
        minuty: minutyVsem ?? puvodni?.minuty ?? vychoziMinuty(t, datum, dnyOsoby, z),
        kasa: t === 'PRACE' && (kasa ?? puvodni?.kasa ?? false),
        poznamka: poznamkaDne(datum),
      };
    });
    if (dny.some((d) => d.typ !== 'NEMOC' && d.minuty < 15)) return chybaVHodinach(chybaHodinText(15));
    onUloz({ dny }, undefined);
  };

  const zkopiruj = () => {
    const { dny, preskocenySvatek } = zkopirujMinulyTyden(datumy[0], dnyOsoby, rok, mesic, z);
    const svatekText = preskocenySvatek.length > 0 ? ` Svátek ${preskocenySvatek.map(kratkeDatum).join(', ')} zůstal prázdný, zadej ho zvlášť.` : '';
    if (dny.length === 0) return nastavHlasku(`V minulém týdnu není nic, co by šlo zkopírovat do prázdných dnů.${svatekText}`);
    const kolik = dny.length === 1 ? 'Zkopírován 1 den' : dny.length <= 4 ? `Zkopírovány ${dny.length} dny` : `Zkopírováno ${dny.length} dní`;
    onUloz({ dny }, `${kolik} z minulého týdne.${svatekText}`);
  };
  const pondeli = pondeliTydne(datumy[0]);

  return (
    <SpodniPanel
      otevreno
      onZavrit={onZavrit}
      nadpis={nadpis}
      paticka={
        <>
          <Tlacitko onClick={uloz} className="flex-1 sm:flex-none">{nemoc ? 'Uložit nemoc' : 'Uložit'}</Tlacitko>
          {existujici.length > 0 && rezim === 'den' && (
            <Tlacitko varianta="nebezpecneTiche" onClick={() => onUloz({ dny: [], smazat: existujici }, undefined)}>
              {datumy.length === 1 ? 'Smazat den' : 'Smazat vybrané dny'}
            </Tlacitko>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {datumy.length === 1 && svatkyVyberu.length === 1 && (
          <p className="flex items-center gap-2 rounded-lg border-l-[3px] border-den-svatek bg-den-svatek/8 py-2 pr-3 pl-3 text-15">
            <span className="font-semibold text-den-svatek">Svátek</span>
            <span>{svatkyVyberu[0].nazev}</span>
          </p>
        )}
        {datumy.length > 1 && svatkyVyberu.length > 0 && (
          <div className="flex flex-col gap-0.5 rounded-lg border-l-[3px] border-den-svatek bg-den-svatek/8 py-2 pr-3 pl-3 text-15">
            <span className="font-semibold text-den-svatek">{svatkyVyberu.length === 1 ? 'Svátek ve výběru' : 'Svátky ve výběru'}</span>
            <ul>
              {svatkyVyberu.map((s) => <li key={s.datum}><span className="tabular-nums">{kratkeDatum(s.datum)}</span> {s.nazev}</li>)}
            </ul>
          </div>
        )}
        {rezim === 'nemoc' ? (
          // „Zadat nemoc" má typ pevně daný; jiný typ se zadává klepnutím na den.
          <p className="text-13 text-tlumeny">{TYPY_DNU.NEMOC.popis}</p>
        ) : (
          <VolbaTypuDne typy={typy} hodnota={typ} onZmena={zmenTyp} chyba={chybaTypu} />
        )}

        {nemoc && (
          <div className="flex flex-col gap-2">
            {vyberSMezerami && (
              <p className="rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-2 pr-3 pl-3 text-13">
                Vybrané dny nejdou za sebou. Nemoc se zapíše na každý den od–do, i na dny mezi nimi: 14 dní náhrady se počítá
                po kalendářních dnech.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Pole type="date" popisek="Nemoc od" value={od} min={prvniDenOkna} max={posledniDenOkna} onChange={(e) => zmenRozsah(e.target.value, do_)}
                chyba={chybaOd !== chybaDo ? chybaOd : undefined} />
              <Pole type="date" popisek="Nemoc do" value={do_} min={od} max={posledniDenOkna} onChange={(e) => zmenRozsah(od, e.target.value)} chyba={chybaDo ?? chybaRozsahu} />
            </div>
            {platnyRozsah && dnyNemociNahled.length > 0 && (
              <p className="text-13 text-tlumeny">
                Zapíše se {dniText(dnyNemociNahled.length, ['den', 'dny', 'dní'])}
                {nemocRozsah && volnychDnu > 0 && `, z toho ${dniText(volnychDnu, ['den', 'dny', 'dní'])} víkendu nebo svátku s 0 h`}.
                {' '}<span className={zmenaNemoci ? 'font-medium text-inkoust' : ''}>{textZmenNemoci}</span>
              </p>
            )}
          </div>
        )}

        <PoleHodin
          id={idHodin}
          popisek={nemocRozsah ? 'Hodiny v pracovní dny' : 'Hodiny'}
          hodnota={hodiny}
          placeholder={hodinyRuzne ? 'různé' : undefined}
          onZmena={(text) => { nastavHodinyText(text); nastavChybuHodin(undefined); }}
          chyba={chybaHodin}
          napoveda={napovedaHodin}
        />

        {ukazKasu && (
          <Prepinac
            zapnuto={kasa ?? false}
            onZmena={nastavKasu}
            popisek={kasa === undefined ? 'Kasa (různé)' : 'Kasa'}
            napoveda={kasa === undefined
              ? 'U kasy byly jen některé vybrané dny. Když přepínač nezměníš, každý den si to nechá.'
              : 'Ten den byl u kasy, dostane příplatek za kasu.'}
          />
        )}

        <div className="flex flex-col gap-1">
          <Pole
            popisek="Poznámka" nepovinne value={poznamka ?? spolecnaPoznamka ?? ''} maxLength={500}
            placeholder={poznamkaVolna && !nemocRozsah && !poznamkaZadana && !smazatVsechny ? 'různé' : undefined}
            napoveda={napovedaPoznamky}
            onChange={(e) => { nastavPoznamku(e.target.value); nastavSmazatPoznamky(false); }}
          />
          {(nabidnoutSmazani || smazatVsechny) && (
            <Tlacitko varianta="tiche" onClick={() => nastavSmazatPoznamky(!smazatVsechny)} className="-ml-4 self-start">
              {smazatVsechny ? 'Nechat poznámky' : 'Smazat poznámky'}
            </Tlacitko>
          )}
        </div>

        {rezim === 'den' && datumy.length === 1 && (
          <div className="flex flex-col items-start gap-1 border-t border-linka pt-4">
            <Tlacitko varianta="tiche" ikona={CopyPlus} onClick={zkopiruj} className="-ml-4">Zkopírovat minulý týden</Tlacitko>
            <p className="text-13 text-tlumeny">
              Do týdne {kratkeDatum(pondeli)}–{kratkeDatum(posunDatum(pondeli, 6))} doplní prázdné dny podle týdne předtím.
            </p>
            {hlaska && <p role="status" className="text-13 font-medium text-inkoust">{hlaska}</p>}
          </div>
        )}
      </div>
    </SpodniPanel>
  );
}

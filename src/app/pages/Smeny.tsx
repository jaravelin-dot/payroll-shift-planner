import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ClipboardCheck, Copy, MessageCircle, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { denVTydnu, dnyMesice, posunDatum } from '../../core/kalendar';
import { doplnPlan, dnyTydne, jeVPomeru, pondeliTydne } from '../../core/plan';
import { sestavRozpis, textRozpisu } from '../../core/rozpis';
import { jeNepritomnost, kontrolaTydne, navrhniTyden, type VstupPlanovace } from '../../core/planovac';
import type { Den, PlanSmeny, SablonaSmeny, UlozPlan, VysledekPrevodu, Zamestnanec } from '../../shared/api';
import { useMesice, usePrevedPlan, useUlozPlany } from '../api/dotazy';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { KontrolaObsazeni } from '../components/KontrolaObsazeni';
import { Nacitani } from '../components/Nacitani';
import { NastaveniPlanovace } from '../components/NastaveniPlanovace';
import { OdkazyRozpisu } from '../components/OdkazyRozpisu';
import { PanelPlanu } from '../components/PanelPlanu';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { klicBunky, RozpisTydne } from '../components/RozpisTydne';
import { SablonySmen } from '../components/SablonySmen';
import { SpodniPanel } from '../components/SpodniPanel';
import { Stitek } from '../components/Stitek';
import { Tlacitko, tridyTlacitka } from '../components/Tlacitko';
import { Volba } from '../components/Volba';
import { dnesniDatum } from '../datum';
import type { Razeni } from '../../core/razeniRozpisu';
import { useVyber } from '../stav/vyber';

const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MESICE_V = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];

/** Tvar podle počtu: 1 → jeden, 2–4 → dva, jinak (i 0) → pět. */
const tvar = (pocet: number, jeden: string, dva: string, pet: string) => (pocet === 1 ? jeden : pocet >= 2 && pocet <= 4 ? dva : pet);
const dni = (pocet: number) => `${pocet} ${tvar(pocet, 'den', 'dny', 'dní')}`;

/** Věty výsledku převodu, každá zvlášť (co vzniklo, co se přeskočilo a proč). */
function textPrevodu(v: VysledekPrevodu, nazevMesice: string): string[] {
  if (v.vytvoreno + v.preskoceno + v.preskocenoDpp + v.mimoPomer === 0) return [`V plánu na ${nazevMesice} není nic k převodu, jen volno nebo prázdné dny.`];
  const vety = [
    (v.vytvoreno === 0 ? 'Žádný nový den nevznikl' : `${tvar(v.vytvoreno, 'Vytvořen', 'Vytvořeny', 'Vytvořeno')} ${dni(v.vytvoreno)}`) +
      (v.preskoceno > 0 ? `, ${v.preskoceno} už v docházce ${tvar(v.preskoceno, 'byl', 'byly', 'bylo')}.` : '.'),
  ];
  if (v.preskocenoDpp > 0) {
    vety.push(`${dni(v.preskocenoDpp)} „Zavřeno“ u dohody se ${tvar(v.preskocenoDpp, 'nepřevedl', 'nepřevedly', 'nepřevedlo')}: dohoda na náhradu za svátek nárok nemá.`);
  }
  if (v.mimoPomer > 0) vety.push(`${dni(v.mimoPomer)} mimo pracovní poměr se ${tvar(v.mimoPomer, 'nepřevedl', 'nepřevedly', 'nepřevedlo')}.`);
  return vety;
}

/** „5.–11. 10.", přes hranici měsíce „28. 9. – 4. 10.", přes rok „28. 12. – 3. 1. 2027" (rok jinak ukazuje přepínač měsíce). */
function popisTydne(pondeli: string): string {
  const nedele = posunDatum(pondeli, 6);
  const [r1, m1, d1] = pondeli.split('-').map(Number);
  const [r2, m2, d2] = nedele.split('-').map(Number);
  if (r1 !== r2) return `${d1}. ${m1}. – ${d2}. ${m2}. ${r2}`;
  if (m1 !== m2) return `${d1}. ${m1}. – ${d2}. ${m2}.`;
  return `${d1}.–${d2}. ${m2}.`;
}

/** Konec věty: popis týdne většinou končí tečkou za měsícem, přes přelom roku rokem. */
const tecka = (text: string) => (text.endsWith('.') ? text : `${text}.`);

const podleJmena = (a: Zamestnanec, b: Zamestnanec) => a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs');
const mesicDne = (datum: string) => ({ rok: Number(datum.slice(0, 4)), mesic: Number(datum.slice(5, 7)) });

/** Obvyklá délka směny člověka (výchozí hodiny dovolené a „zavřeno"): směna týž den před týdnem, jinak v tomto týdnu, jinak úvazek / 5. */
function obvykleMinuty(z: Zamestnanec, datum: string, dny: string[], plan: Map<string, PlanSmeny>): number {
  const smena = [posunDatum(datum, -7), ...dny].map((d) => plan.get(klicBunky(z.id, d))).find((p) => p?.typ === 'SMENA');
  if (smena) return smena.minuty;
  return z.smlouva === 'HPP' && z.uvazekMinTydne > 0 ? Math.round(z.uvazekMinTydne / 5) : 480;
}

const KLIC_RAZENI = 'mzdy.smeny.razeni';
const MOZNOSTI_RAZENI = [{ hodnota: 'CAS', nazev: 'Podle času' }, { hodnota: 'JMENO', nazev: 'Podle jména' }] as const;

/** Uložené řazení rozpisu; chybějící, neplatná hodnota nebo nedostupný localStorage (soukromý režim) dá výchozí „podle času". */
function nactiRazeni(): Razeni {
  try {
    return localStorage.getItem(KLIC_RAZENI) === 'JMENO' ? 'JMENO' : 'CAS';
  } catch {
    return 'CAS';
  }
}

const SIPKA = 'grid size-11 shrink-0 place-items-center rounded-lg text-inkoust transition-colors duration-150 hover:bg-inkoust/6 active:bg-inkoust/10';

export function Smeny() {
  const vyber = useVyber();
  const { firmaId, rok, mesic } = vyber;
  const dnes = dnesniDatum();
  const [zvolenePondeli, nastavPondeli] = useState<string | null>(null);
  const [otevrena, nastavOtevrenou] = useState<{ clovek: Zamestnanec; datum: string } | null>(null);
  const [potvrzeniPrevodu, nastavPotvrzeniPrevodu] = useState(false);
  const [razeni, nastavRazeniStav] = useState<Razeni>(nactiRazeni);
  // Zpráva po akci patří k firmě a měsíci, ve kterém vznikla; po přepnutí jinam se neukazuje.
  const [zpravaAkce, nastavZpravuAkce] = useState<{ klic: string; vety: string[] } | null>(null);
  const ulozPlany = useUlozPlany();
  const prevod = usePrevedPlan();

  // Týden je vždy jeden z týdnů vybraného měsíce (i ty, které do něj zasahují jen zčásti).
  const dnyMesiceVyber = dnyMesice(rok, mesic);
  const prvniPondeli = pondeliTydne(dnyMesiceVyber[0]);
  const posledniPondeli = pondeliTydne(dnyMesiceVyber[dnyMesiceVyber.length - 1]);
  const dnesVMesici = dnyMesiceVyber.includes(dnes);
  const pondeli = zvolenePondeli && zvolenePondeli >= prvniPondeli && zvolenePondeli <= posledniPondeli
    ? zvolenePondeli
    : dnesVMesici ? pondeliTydne(dnes) : prvniPondeli;
  const dny = dnyTydne(pondeli);

  // Data všech měsíců, do kterých zasahuje tento a minulý týden (kvůli kopii), a vybraného měsíce.
  const mesice = [{ rok, mesic }];
  for (const d of [posunDatum(pondeli, -7), pondeli, dny[6]]) {
    const m = mesicDne(d);
    if (!mesice.some((x) => x.rok === m.rok && x.mesic === m.mesic)) mesice.push(m);
  }
  const dotazy = useMesice(firmaId, mesice);
  const hlavni = dotazy[0];
  const nacteno = dotazy.every((d) => d.data);
  const chyba = dotazy.find((d) => !d.data && d.error)?.error;

  const plan = new Map<string, PlanSmeny>();
  const lideVsech = new Map<string, Zamestnanec>();
  for (const d of dotazy) {
    for (const p of d.data?.plan ?? []) plan.set(klicBunky(p.zamestnanecId, p.datum), p);
    for (const z of d.data?.zamestnanci ?? []) if (!lideVsech.has(z.id)) lideVsech.set(z.id, z);
  }
  const dochazka = new Map<string, Den>();
  for (const d of dotazy) for (const den of d.data?.dny ?? []) if (jeNepritomnost(den.typ)) dochazka.set(klicBunky(den.zamestnanecId, den.datum), den);
  const lide = [...lideVsech.values()].filter((z) => dny.some((d) => jeVPomeru(z, d))).sort(podleJmena);
  const seznamSablon: SablonaSmeny[] = [...(hlavni.data?.sablony ?? [])].sort((a, b) => a.zacatek.localeCompare(b.zacatek) || a.nazev.localeCompare(b.nazev, 'cs'));
  const sablony = new Map(seznamSablon.map((s) => [s.id, s]));
  const uzavreno = !!hlavni.data?.uzaverka;
  const nazevMesice = MESICE[mesic - 1];
  const nastaveniFirmy = vyber.firma?.nastaveni;
  const vstupPlanovace: VstupPlanovace | null = nastaveniFirmy
    ? { pondeli, lide, plan: [...plan.values()], dochazka: [...dochazka.values()], sablony: seznamSablon, nastaveni: nastaveniFirmy }
    : null;
  const upozorneni = vstupPlanovace && nacteno ? kontrolaTydne(vstupPlanovace) : [];
  const planovacPripraven = (nastaveniFirmy?.planovacSablony.length ?? 0) > 0;
  // Kontrola obsazení jen tam, kde se plánovač používá: firma bez něj (všichni mimo plán, žádné šablony plánovače) upozornění nedostane.
  const ukazKontrolu = planovacPripraven || lide.some((z) => z.rolePlanu !== 'MIMO_PLAN');
  const klicZpravy = `${firmaId}|${rok}-${mesic}`;
  const zprava = zpravaAkce?.klic === klicZpravy ? zpravaAkce.vety : null;
  const nastavZpravu = (vety: string[] | null) => nastavZpravuAkce(vety && { klic: klicZpravy, vety });

  const nastavRazeni = (nove: Razeni) => {
    nastavRazeniStav(nove);
    try {
      localStorage.setItem(KLIC_RAZENI, nove);
    } catch {
      // Soukromý režim prohlížeče apod.: volba platí do zavření stránky.
    }
  };

  const posunTyden = (smer: 1 | -1) => {
    const nove = posunDatum(pondeli, 7 * smer);
    nastavPondeli(nove);
    nastavZpravu(null);
    // Týden celý mimo vybraný měsíc: přepne se i měsíc (v přepínači nahoře).
    if (nove < prvniPondeli || nove > posledniPondeli) vyber.nastavMesic(mesicDne(nove).rok, mesicDne(nove).mesic);
  };
  const naTentoTyden = () => {
    nastavPondeli(pondeliTydne(dnes));
    nastavZpravu(null);
    if (!dnesVMesici) vyber.nastavMesic(mesicDne(dnes).rok, mesicDne(dnes).mesic);
  };

  /** Uloží nové položky (po lidech) a pak ukáže zprávu. */
  const ulozDoplnene = (nove: PlanSmeny[], hotovo: string[], nic: string) => {
    nastavZpravu(null);
    if (!firmaId) return;
    if (nove.length === 0) {
      nastavZpravu([nic]);
      return;
    }
    const plany = new Map<string, UlozPlan>();
    for (const { zamestnanecId, ...polozka } of nove) {
      const p = plany.get(zamestnanecId) ?? { zamestnanecId, polozky: [] };
      p.polozky.push(polozka);
      plany.set(zamestnanecId, p);
    }
    ulozPlany.mutate({ firmaId, plany: [...plany.values()] }, { onSuccess: () => nastavZpravu(hotovo) });
  };

  const navrhni = () => {
    if (!vstupPlanovace) return;
    const { nove, upozorneni: poNavrhu } = navrhniTyden(vstupPlanovace);
    ulozDoplnene(
      nove,
      [
        tecka(`${tvar(nove.length, 'Navržena', 'Navrženy', 'Navrženo')} ${nove.length} ${tvar(nove.length, 'směna', 'směny', 'směn')} na ${popisTydne(pondeli)}`),
        poNavrhu.length === 0 ? 'Obsazení je v pořádku.' : `Kontrola obsazení má ${poNavrhu.length} upozornění, najdeš je nad rozpisem.`,
      ],
      'Není co navrhnout: pracovní dny týdne už všichni mají vyplněné.',
    );
  };

  const zkopirujMinulyTyden = () => {
    const nove = doplnPlan([...plan.values()], lide, dny, (d) => posunDatum(d, -7));
    ulozDoplnene(
      nove,
      [`${tvar(nove.length, 'Zkopírován', 'Zkopírovány', 'Zkopírováno')} ${dni(nove.length)} z minulého týdne.`, 'Vyplněné dny, svátky a dovolená se nekopírují.'],
      'Z minulého týdne nebylo co zkopírovat. Kopírují se směny a volno do prázdných dnů, mimo svátky.',
    );
  };

  const vyplnMesic = () => {
    const lideMesice = hlavni.data?.zamestnanci ?? [];
    const nove = doplnPlan([...plan.values()], lideMesice, dnyMesiceVyber, (d) => posunDatum(pondeli, denVTydnu(d) - 1));
    ulozDoplnene(
      nove,
      [tecka(`${tvar(nove.length, 'Vyplněn', 'Vyplněny', 'Vyplněno')} ${dni(nove.length)} v ${MESICE_V[mesic - 1]} podle týdne ${popisTydne(pondeli)}`), 'Vyplněné dny a svátky zůstaly beze změny.'],
      `V ${MESICE_V[mesic - 1]} nebylo co vyplnit: prázdné dny mají v tomhle týdnu prázdný vzor, nebo je všechno vyplněné.`,
    );
  };

  const prevest = () => {
    if (!firmaId) return;
    nastavZpravu(null);
    prevod.mutate({ firmaId, rok, mesic }, {
      onSuccess: (v) => {
        nastavPotvrzeniPrevodu(false);
        nastavZpravu(textPrevodu(v, nazevMesice));
      },
    });
  };

  /**
   * Text týdne do WhatsAppu: na mobilu (dotykový ukazatel) přes Web Share API, kde si uživatel vybere WhatsApp;
   * jinak rovnou `wa.me` (na počítači by sdílecí okno systému WhatsApp Web nenabídlo).
   * `window.open` se volá synchronně v kliknutí, aby ho Safari neblokovalo jako vyskakovací okno.
   * Stejný model jako veřejný rozpis, takže nemoc, dovolená ani jiná nepřítomnost v textu nejsou.
   */
  const posliRozpis = () => {
    const text = textRozpisu(sestavRozpis({ pondeli, dnes, lide, plan: [...plan.values()], sablony: seznamSablon, nepritomnosti: [...dochazka.values()] }));
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const mobil = typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches;
    if (!mobil) {
      window.open(waUrl, '_blank', 'noopener');
      return;
    }
    navigator.share({ text }).catch((chyba: unknown) => {
      // Zavření sdílecího okna není chyba; jiné selhání (zakázáno, nepodporováno) přejde na wa.me.
      // Navigace na rozdíl od `window.open` po `await` blokaci vyskakovacích oken nepodléhá.
      if (chyba instanceof DOMException && chyba.name === 'AbortError') return;
      window.location.href = waUrl;
    });
  };

  const otevrenaPolozka = otevrena ? plan.get(klicBunky(otevrena.clovek.id, otevrena.datum)) : undefined;

  return (
    <>
      <title>Směny – Mzdy</title>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-28 font-semibold">Směny</h1>
          {vyber.firma && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-15 text-tlumeny">
              {vyber.firma.nazev}
              {uzavreno && <Stitek ton="neutralni">Uzavřeno</Stitek>}
            </p>
          )}
        </div>
        {hlavni.data && (
          <Tlacitko ikona={ClipboardCheck} onClick={() => nastavPotvrzeniPrevodu(true)} disabled={uzavreno} className="w-full sm:w-auto">
            Převést do docházky
          </Tlacitko>
        )}
      </header>

      {!hlavni.data && !chyba && <Nacitani />}
      {chyba && <ChybaHlaska chyba={chyba} onZnovu={() => dotazy.forEach((d) => void d.refetch())} />}

      {hlavni.data && firmaId && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex items-center gap-1">
              <div role="group" aria-label="Týden" className="-ml-3 flex items-center">
                <button type="button" className={SIPKA} onClick={() => posunTyden(-1)} aria-label="Předchozí týden">
                  <ChevronLeft aria-hidden className="size-5" />
                </button>
                <span aria-live="polite" className="min-w-[8.5rem] text-center text-17 font-semibold whitespace-nowrap tabular-nums">
                  {popisTydne(pondeli)}
                </span>
                <button type="button" className={SIPKA} onClick={() => posunTyden(1)} aria-label="Další týden">
                  <ChevronRight aria-hidden className="size-5" />
                </button>
              </div>
              {pondeli !== pondeliTydne(dnes) && (
                <Tlacitko varianta="tiche" onClick={naTentoTyden}>
                  Tento týden
                </Tlacitko>
              )}
            </div>
            {lide.length > 0 && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <Tlacitko ikona={Sparkles} onClick={navrhni} disabled={!nacteno || ulozPlany.isPending || !planovacPripraven}>
                  Navrhnout týden
                </Tlacitko>
                <Tlacitko varianta="vedlejsi" ikona={Copy} onClick={zkopirujMinulyTyden} disabled={!nacteno || ulozPlany.isPending}>
                  Zkopírovat minulý týden
                </Tlacitko>
                <Tlacitko varianta="vedlejsi" ikona={CalendarRange} onClick={vyplnMesic} disabled={!nacteno || ulozPlany.isPending}>
                  Vyplnit celý měsíc podle tohoto týdne
                </Tlacitko>
                <Tlacitko varianta="vedlejsi" ikona={MessageCircle} onClick={posliRozpis} disabled={!nacteno}>
                  Poslat rozpis do WhatsAppu
                </Tlacitko>
              </div>
            )}
            {lide.length > 0 && !planovacPripraven && (
              <p className="w-full text-13 text-tlumeny">
                Vyber šablony plánovače <a href="#planovac" className="font-medium text-akce underline">v nastavení pod rozpisem</a>.
              </p>
            )}
          </div>

          {uzavreno && (
            <p className="text-15 text-tlumeny">
              {nazevMesice[0].toUpperCase() + nazevMesice.slice(1)} je uzavřený, převod do docházky nejde. Plán se dá upravovat dál.
            </p>
          )}

          <div role="status">
            {zprava && (
              <div className="flex flex-col gap-1 rounded-lg border-l-[3px] border-akce bg-akce/6 py-3 pr-4 pl-4 text-15">
                {zprava.map((veta, i) => (
                  <p key={veta} className={i === 0 ? 'font-semibold' : ''}>
                    {veta}
                  </p>
                ))}
              </div>
            )}
          </div>
          {ulozPlany.error && <ChybaHlaska chyba={ulozPlany.error} />}
          {prevod.error && !potvrzeniPrevodu && <ChybaHlaska chyba={prevod.error} />}

          {!nacteno ? (
            !chyba && <Nacitani text="Načítám týden…" />
          ) : lide.length > 0 ? (
            <>
              {ukazKontrolu && <KontrolaObsazeni upozorneni={upozorneni} />}
              <Volba popisek="Řadit" moznosti={MOZNOSTI_RAZENI} hodnota={razeni} onZmena={nastavRazeni} />
              <RozpisTydne dny={dny} lide={lide} plan={plan} sablony={sablony} dochazka={dochazka} dnes={dnes} razeni={razeni} onOtevri={(clovek, datum) => nastavOtevrenou({ clovek, datum })} />
            </>
          ) : (
            <PrazdnyStav
              ikona={Users}
              nadpis="V tomhle týdnu tu nikdo nepracuje"
              akce={
                <Link to={vyber.odkaz('/lide')} className={tridyTlacitka('vedlejsi')}>
                  Otevřít lidi
                </Link>
              }
            >
              Rozpis má řádek pro každého, kdo je v tomhle týdnu v pracovním poměru. Přidej lidi v sekci Lidé.
            </PrazdnyStav>
          )}

          <SablonySmen firmaId={firmaId} sablony={seznamSablon} />
          <OdkazyRozpisu firmaId={firmaId} dnes={dnes} />
          {vyber.firma && <NastaveniPlanovace key={vyber.firma.id} firma={vyber.firma} sablony={seznamSablon} />}
        </div>
      )}

      {otevrena && firmaId && (
        <PanelPlanu
          key={klicBunky(otevrena.clovek.id, otevrena.datum)}
          firmaId={firmaId}
          clovek={otevrena.clovek}
          datum={otevrena.datum}
          polozka={otevrenaPolozka}
          sablony={seznamSablon}
          obvykleMinuty={obvykleMinuty(otevrena.clovek, otevrena.datum, dny, plan)}
          onZavrit={() => nastavOtevrenou(null)}
        />
      )}

      <SpodniPanel
        otevreno={potvrzeniPrevodu}
        onZavrit={() => nastavPotvrzeniPrevodu(false)}
        nadpis="Převést plán do docházky"
        paticka={
          <>
            <Tlacitko ikona={ClipboardCheck} onClick={prevest} nacita={prevod.isPending}>
              Převést
            </Tlacitko>
            <Tlacitko varianta="vedlejsi" onClick={() => nastavPotvrzeniPrevodu(false)}>
              Zpět
            </Tlacitko>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-15">
          <p>
            Z plánu na {nazevMesice} {rok} vznikne docházka všech lidí: směna jako práce, dovolená jako dovolená a „Zavřeno“ jako svátek. Volno se
            nepřevádí.
          </p>
          <p>Dny, které už v docházce jsou, zůstanou, jak jsou. U dohod se „Zavřeno“ nepřevede, na náhradu za svátek nemají nárok.</p>
          <p className="flex items-center gap-2 text-tlumeny">
            <CalendarDays aria-hidden className="size-[18px] shrink-0" />
            Převádí se celý měsíc, ne jen zobrazený týden.
          </p>
          {prevod.error && <ChybaHlaska chyba={prevod.error} />}
        </div>
      </SpodniPanel>
    </>
  );
}

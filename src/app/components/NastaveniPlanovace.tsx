import { Plus, Save, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Firma, NastaveniPlanovace as Nastaveni, SablonaSmeny } from '../../shared/api';
import { useUlozFirmu } from '../api/dotazy';
import { jeDatum } from '../datum';
import { ChybaHlaska } from './ChybaHlaska';
import { Pole } from './Pole';
import { casSablony } from './SablonySmen';
import { Sekce } from './Sekce';
import { Tlacitko, tridyTlacitka } from './Tlacitko';

const CAS = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Nejvíc oken obsazení (jako server). */
const NEJVIC_OKEN = 24;

type Okno = { klic: string; od: string; do: string; lidi: string; aspon: boolean };
let citac = 0;
const novyKlic = () => `okno-${++citac}`;

/** Sekce záložky Směny: kdy hlídat kasaře, otevírací doba, obsazení prodejny, šablony pro plánovač a kotva pevného střídání. */
export function NastaveniPlanovace({ firma, sablony }: { firma: Firma; sablony: SablonaSmeny[] }) {
  const n = firma.nastaveni;
  const [k, nastavK] = useState({
    kasaOd: n.planovacKasaOd, kasaDo: n.planovacKasaDo, minKasaru: String(n.planovacMinKasaru),
    otevrenoOd: n.planovacOtevrenoOd, otevrenoDo: n.planovacOtevrenoDo, sablony: n.planovacSablony, kotva: n.planovacKotva,
    dozorDo: n.planovacDozorNaKaseDo,
  });
  const [okna, nastavOkna] = useState<Okno[]>(() => n.planovacObsazeni.map((o) => ({ klic: novyKlic(), od: o.od, do: o.do, lidi: String(o.lidi), aspon: o.aspon === true })));
  const [pridane, nastavPridane] = useState<string | null>(null);
  const pridat = useRef<HTMLButtonElement>(null);
  const [chyby, nastavChyby] = useState<Record<string, string | undefined>>({});
  const [ulozeno, nastavUlozeno] = useState(false);
  const uloz = useUlozFirmu();
  const zmen = (zmena: Partial<typeof k>) => {
    nastavK((x) => ({ ...x, ...zmena }));
    nastavUlozeno(false);
  };
  const zmenOkna = (nova: Okno[]) => {
    nastavOkna(nova);
    nastavUlozeno(false);
  };
  const zmenOkno = (klic: string, zmena: Partial<Okno>) => zmenOkna(okna.map((o) => (o.klic === klic ? { ...o, ...zmena } : o)));

  const odesli = () => {
    const c: Record<string, string> = {};
    for (const pole of ['kasaOd', 'kasaDo', 'otevrenoOd', 'otevrenoDo', 'dozorDo'] as const) if (!CAS.test(k[pole])) c[pole] = 'Čas ve tvaru HH:MM, např. 08:00.';
    if (!c.kasaOd && !c.kasaDo && k.kasaOd >= k.kasaDo) c.kasaDo = 'Konec musí být po začátku.';
    if (!c.otevrenoOd && !c.otevrenoDo && k.otevrenoOd >= k.otevrenoDo) c.otevrenoDo = 'Konec musí být po začátku.';
    const min = Number(k.minKasaru);
    if (!Number.isInteger(min) || min < 1 || min > 20) c.minKasaru = 'Celé číslo od 1 do 20.';
    if (!jeDatum(k.kotva)) c.kotva = 'Zadej datum.';
    for (const o of okna) {
      if (!CAS.test(o.od)) c[`${o.klic}-od`] = 'Čas ve tvaru HH:MM, např. 08:00.';
      if (!CAS.test(o.do)) c[`${o.klic}-do`] = 'Čas ve tvaru HH:MM, např. 08:00.';
      else if (!c[`${o.klic}-od`] && o.od >= o.do) c[`${o.klic}-do`] = 'Konec musí být po začátku.';
      if (!/^\d+$/.test(o.lidi.trim()) || Number(o.lidi) > 50) c[`${o.klic}-lidi`] = 'Celé číslo od 0 do 50.';
    }
    nastavChyby(c);
    if (Object.keys(c).length > 0) return;
    const nastaveni: Nastaveni = {
      planovacKasaOd: k.kasaOd, planovacKasaDo: k.kasaDo, planovacMinKasaru: min, planovacOtevrenoOd: k.otevrenoOd,
      planovacOtevrenoDo: k.otevrenoDo, planovacSablony: k.sablony.filter((id) => sablony.some((s) => s.id === id)), planovacKotva: k.kotva,
      planovacDozorNaKaseDo: k.dozorDo, planovacObsazeni: okna.map((o) => ({ od: o.od, do: o.do, lidi: Number(o.lidi), ...(o.aspon ? { aspon: true } : {}) })),
    };
    uloz.mutate({ id: firma.id, data: { nazev: firma.nazev, nastaveni } }, { onSuccess: () => nastavUlozeno(true) });
  };

  return (
    <div id="planovac">
      <Sekce nadpis="Plánovač směn" popis="Podle tohohle tlačítko „Navrhnout týden“ rozděluje směny a kontrola hlídá obsazení.">
        <div className="flex flex-wrap gap-4">
          <Pole popisek="Kasaře hlídat od" type="time" value={k.kasaOd} onChange={(e) => zmen({ kasaOd: e.target.value })} chyba={chyby.kasaOd} className="w-36" />
          <Pole popisek="Kasaře hlídat do" type="time" value={k.kasaDo} onChange={(e) => zmen({ kasaDo: e.target.value })} chyba={chyby.kasaDo} className="w-36" />
          <Pole popisek="Zodpovědných kasařů aspoň" inputMode="numeric" value={k.minKasaru} onChange={(e) => zmen({ minKasaru: e.target.value })} chyba={chyby.minKasaru} className="w-48" />
        </div>
        <div className="flex flex-wrap gap-4">
          <Pole popisek="Otevřeno Po–Pá od" type="time" value={k.otevrenoOd} onChange={(e) => zmen({ otevrenoOd: e.target.value })} chyba={chyby.otevrenoOd} className="w-36" />
          <Pole popisek="Otevřeno do" type="time" value={k.otevrenoDo} onChange={(e) => zmen({ otevrenoDo: e.target.value })} chyba={chyby.otevrenoDo} className="w-36" />
        </div>
        <Pole popisek="Dozor se počítá na kasu do" type="time" value={k.dozorDo} onChange={(e) => zmen({ dozorDo: e.target.value })} chyba={chyby.dozorDo}
          napoveda="Do té doby stojí člověk s rolí dozor na kase jako zodpovědný kasař, potom už ne." className="w-72" />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-15 font-medium">Kolik lidí má být na prodejně</legend>
          <p className="-mt-2 text-13 text-tlumeny">
            Počítají se kasaři, učící se a prodejna, dozor jen do času výše. Návrh se snaží počet trefit přesně, u okna „aspoň“ víc lidí nevadí. Mimo tato okna se nehlídá.
          </p>
          {okna.length > 0 && (
            <ul className="flex flex-col gap-3">
              {okna.map((o, i) => (
                <li key={o.klic} className="flex flex-wrap items-start gap-x-4 gap-y-3">
                  <Pole popisek={`Okno ${i + 1} od`} type="time" value={o.od} onChange={(e) => zmenOkno(o.klic, { od: e.target.value })}
                    chyba={chyby[`${o.klic}-od`]} autoFocus={o.klic === pridane} className="w-36" />
                  <Pole popisek={`Okno ${i + 1} do`} type="time" value={o.do} onChange={(e) => zmenOkno(o.klic, { do: e.target.value })}
                    chyba={chyby[`${o.klic}-do`]} className="w-36" />
                  <Pole popisek={`Okno ${i + 1} lidí`} inputMode="numeric" autoComplete="off" value={o.lidi} onChange={(e) => zmenOkno(o.klic, { lidi: e.target.value })}
                    chyba={chyby[`${o.klic}-lidi`]} className="w-36" />
                  <label className="mt-7 flex min-h-11 items-center gap-3 text-15">
                    <input type="checkbox" className="size-5" checked={o.aspon} onChange={(e) => zmenOkno(o.klic, { aspon: e.target.checked })} />
                    <span><span className="sr-only">Okno {i + 1}</span> Aspoň <span className="text-13 text-tlumeny">(víc lidí nevadí)</span></span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      zmenOkna(okna.filter((x) => x.klic !== o.klic));
                      // Tlačítko mizí s řádkem; fokus dostane „Přidat okno", aby nespadl na začátek stránky.
                      pridat.current?.focus();
                    }}
                    aria-label={`Odebrat okno ${i + 1}`}
                    className="mt-7 grid size-11 shrink-0 place-items-center rounded-lg text-tlumeny transition-colors duration-150 hover:bg-chyba/8 hover:text-chyba"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <button
              ref={pridat}
              type="button"
              disabled={okna.length >= NEJVIC_OKEN}
              onClick={() => {
                const klic = novyKlic();
                nastavPridane(klic);
                zmenOkna([...okna, { klic, od: okna.at(-1)?.do ?? '08:00', do: '', lidi: '', aspon: false }]);
              }}
              className={tridyTlacitka('tiche')}
            >
              <Plus aria-hidden className="size-[18px]" />
              Přidat okno
            </button>
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-15 font-medium">Směny, ze kterých plánovač vybírá</legend>
          <p className="-mt-1 text-13 text-tlumeny">Pro lidi bez pevných směn. Každý dostane jednu z nich na celý týden.</p>
          {sablony.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-3 text-15">
              <input type="checkbox" className="size-5" checked={k.sablony.includes(s.id)}
                onChange={(e) => zmen({ sablony: e.target.checked ? [...k.sablony, s.id] : k.sablony.filter((x) => x !== s.id) })} />
              {s.nazev} <span className="text-13 text-tlumeny tabular-nums">{casSablony(s)}</span>
            </label>
          ))}
        </fieldset>
        <Pole popisek="Pevné směny: týden, kdy platí první v pořadí" type="date" value={k.kotva} onChange={(e) => zmen({ kotva: e.target.value })} chyba={chyby.kotva}
          napoveda="Stačí kterýkoli den toho týdne. Další týden platí druhá směna v pořadí a tak dál." className="w-60" />
        <div className="flex items-center gap-3">
          <Tlacitko ikona={Save} onClick={odesli} nacita={uloz.isPending}>Uložit nastavení plánovače</Tlacitko>
          {ulozeno && <span role="status" className="text-15 text-tlumeny">Uloženo.</span>}
        </div>
        {uloz.error && <ChybaHlaska chyba={uloz.error} />}
      </Sekce>
    </div>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { minutySablony } from '../../core/plan';
import type { NovaSablona, SablonaSmeny } from '../../shared/api';
import { useSmazSablonu, useUlozSablonu } from '../api/dotazy';
import { formatHodin } from '../cisla';
import { ChybaHlaska } from './ChybaHlaska';
import { Pole } from './Pole';
import { Sekce } from './Sekce';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko } from './Tlacitko';

/** Barvy šablon: dost syté na levý okraj a čitelné jako 10% výplň pod inkoustem; fialová patří „zavřeno ve svátek". */
export const BARVY_SABLON = [
  { hodnota: '#2B3FBF', nazev: 'Modrá' },
  { hodnota: '#0E7C86', nazev: 'Tyrkysová' },
  { hodnota: '#4F6B2A', nazev: 'Olivová' },
  { hodnota: '#9C2F6E', nazev: 'Švestková' },
  { hodnota: '#8A5A1C', nazev: 'Hnědá' },
  { hodnota: '#44546A', nazev: 'Břidlicová' },
] as const;

/** Barva šablony pro styl; cokoli jiného než #RRGGBB (barva je volný text v DB) nahradí akční modř. */
export function barvaSablony(s: Pick<SablonaSmeny, 'barva'> | undefined): string {
  return s?.barva && /^#[0-9a-f]{6}$/i.test(s.barva) ? s.barva : '#2B3FBF';
}

/** „08:00" → „8", „16:30" → „16:30" (celé hodiny bez minut, aby se čas vešel do buňky rozpisu). */
const cas = (hhmm: string) => {
  const [hodina, minuta] = hhmm.split(':');
  return minuta === '00' ? String(Number(hodina)) : `${Number(hodina)}:${minuta}`;
};

/** „8–16:30", „12–20". */
export function casSablony(s: Pick<SablonaSmeny, 'zacatek' | 'konec'>): string {
  return `${cas(s.zacatek)}–${cas(s.konec)}`;
}

/** Délka šablony; neplatný čas (nemělo by nastat, server ho nepřijme) jako 0. */
function delka(s: Pick<SablonaSmeny, 'zacatek' | 'konec' | 'prestavkaMin'>): number {
  try {
    return minutySablony(s);
  } catch {
    return 0;
  }
}

type Rozpracovana = { id?: string; nazev: string; zacatek: string; konec: string; prestavka: string; barva: string };

const PRAZDNA: Rozpracovana = { nazev: '', zacatek: '08:00', konec: '16:00', prestavka: '30', barva: BARVY_SABLON[0].hodnota };

function zeSablony(s: SablonaSmeny): Rozpracovana {
  return { id: s.id, nazev: s.nazev, zacatek: s.zacatek, konec: s.konec, prestavka: String(s.prestavkaMin), barva: barvaSablony(s) };
}

type Chyby = Partial<Record<'nazev' | 'zacatek' | 'konec' | 'prestavka', string>>;

const CAS = /^([01]\d|2[0-3]):[0-5]\d$/;

function zkontroluj(r: Rozpracovana): Chyby {
  const chyby: Chyby = {};
  if (!r.nazev.trim()) chyby.nazev = 'Napiš název, třeba Ranní.';
  if (!CAS.test(r.zacatek)) chyby.zacatek = 'Zadej čas začátku, např. 8:00.';
  if (!CAS.test(r.konec)) chyby.konec = 'Zadej čas konce, např. 16:30.';
  else if (r.konec === r.zacatek) chyby.konec = 'Konec musí být jindy než začátek.';
  if (!/^\d{1,4}$/.test(r.prestavka.trim())) chyby.prestavka = 'Zadej přestávku v celých minutách, např. 30.';
  else if (!chyby.zacatek && !chyby.konec && delka({ zacatek: r.zacatek, konec: r.konec, prestavkaMin: 0 }) <= Number(r.prestavka)) {
    chyby.prestavka = 'Přestávka je delší než celá směna.';
  }
  return chyby;
}

function EditorSablony({ firmaId, sablona, onZavrit }: { firmaId: string; sablona: Rozpracovana; onZavrit: () => void }) {
  const [r, nastavR] = useState(sablona);
  const [ukazChyby, nastavUkazChyby] = useState(false);
  const [mazani, nastavMazani] = useState(false);
  const uloz = useUlozSablonu();
  const smaz = useSmazSablonu();
  const formId = useId();
  const barvyId = useId();
  const chyby = zkontroluj(r);
  const viditelne = ukazChyby ? chyby : {};
  const platne = Object.keys(chyby).length === 0;
  const casyPlatne = !chyby.zacatek && !chyby.konec && !chyby.prestavka;
  const pres = r.konec <= r.zacatek;

  const zmen = (zmena: Partial<Rozpracovana>) => nastavR((puvodni) => ({ ...puvodni, ...zmena }));

  const odesli = (e: FormEvent) => {
    e.preventDefault();
    if (!platne) {
      nastavUkazChyby(true);
      return;
    }
    const data: NovaSablona = { firmaId, nazev: r.nazev.trim(), zacatek: r.zacatek, konec: r.konec, prestavkaMin: Number(r.prestavka), barva: r.barva };
    uloz.mutate({ id: r.id, data }, { onSuccess: onZavrit });
  };

  const paticka = mazani ? (
    <>
      <p className="w-full text-15">
        Smazat šablonu {r.nazev || 'bez názvu'}? Naplánované směny zůstanou i s hodinami, jen bez názvu šablony.
      </p>
      <Tlacitko varianta="nebezpecne" ikona={Trash2} nacita={smaz.isPending} onClick={() => r.id && smaz.mutate({ id: r.id, firmaId }, { onSuccess: onZavrit })}>
        Smazat
      </Tlacitko>
      <Tlacitko varianta="vedlejsi" onClick={() => nastavMazani(false)}>
        Zpět
      </Tlacitko>
    </>
  ) : (
    <>
      <Tlacitko type="submit" form={formId} nacita={uloz.isPending}>
        Uložit
      </Tlacitko>
      {r.id && (
        <Tlacitko varianta="nebezpecneTiche" ikona={Trash2} onClick={() => nastavMazani(true)} className="ml-auto">
          Smazat
        </Tlacitko>
      )}
    </>
  );

  return (
    <SpodniPanel otevreno onZavrit={onZavrit} nadpis={r.id ? `Šablona ${sablona.nazev}` : 'Nová šablona'} paticka={paticka}>
      <form id={formId} onSubmit={odesli} noValidate className="flex flex-col gap-5">
        <Pole popisek="Název" value={r.nazev} onChange={(e) => zmen({ nazev: e.target.value })} chyba={viditelne.nazev} maxLength={200} autoComplete="off" />
        <div className="grid grid-cols-2 gap-4">
          <Pole popisek="Začátek" type="time" value={r.zacatek} onChange={(e) => zmen({ zacatek: e.target.value })} chyba={viditelne.zacatek} />
          <Pole popisek="Konec" type="time" value={r.konec} onChange={(e) => zmen({ konec: e.target.value })} chyba={viditelne.konec} />
        </div>
        <Pole
          popisek="Přestávka"
          pripona="min"
          inputMode="numeric"
          value={r.prestavka}
          onChange={(e) => zmen({ prestavka: e.target.value })}
          chyba={viditelne.prestavka}
          napoveda="Přestávka na jídlo a oddech se do odpracované doby nepočítá."
        />
        <p className="rounded-lg bg-papir px-4 py-3 text-15 tabular-nums">
          {casyPlatne
            ? `Délka směny ${formatHodin(minutySablony({ zacatek: r.zacatek, konec: r.konec, prestavkaMin: Number(r.prestavka) }))}${pres ? ', přes půlnoc' : ''}`
            : 'Délka směny se ukáže, až budou časy v pořádku.'}
        </p>
        <fieldset className="flex flex-col gap-1.5">
          <legend id={barvyId} className="mb-1.5 text-15 font-medium">
            Barva v rozpisu
          </legend>
          <div className="flex flex-wrap gap-2">
            {BARVY_SABLON.map((b) => {
              const vybrana = b.hodnota === r.barva;
              return (
                <label
                  key={b.hodnota}
                  title={b.nazev}
                  className={[
                    'grid size-11 cursor-pointer place-items-center rounded-lg border transition-colors duration-150',
                    'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-akce',
                    vybrana ? 'border-inkoust' : 'border-linka hover:border-tlumeny',
                  ].join(' ')}
                >
                  <input type="radio" name={barvyId} value={b.hodnota} checked={vybrana} onChange={() => zmen({ barva: b.hodnota })} className="sr-only" aria-label={b.nazev} />
                  <span aria-hidden className={`size-6 rounded-md ${vybrana ? 'ring-2 ring-karta ring-offset-0' : ''}`} style={{ backgroundColor: b.hodnota }} />
                </label>
              );
            })}
          </div>
        </fieldset>
        {(uloz.error || smaz.error) && <ChybaHlaska chyba={uloz.error ?? smaz.error} />}
      </form>
    </SpodniPanel>
  );
}

/** Správa šablon směn firmy: seznam s časem, přestávkou a délkou; klik otevře úpravu. */
export function SablonySmen({ firmaId, sablony }: { firmaId: string; sablony: SablonaSmeny[] }) {
  const [upravovana, nastavUpravovanou] = useState<Rozpracovana | null>(null);
  const serazene = [...sablony].sort((a, b) => a.zacatek.localeCompare(b.zacatek) || a.nazev.localeCompare(b.nazev, 'cs'));

  return (
    <Sekce nadpis="Šablony směn" popis="Pojmenované směny pro rozpis. Délka se počítá bez přestávky a jde v rozpisu u každého dne přepsat.">
      {serazene.length > 0 ? (
        <ul className="-my-1 divide-y divide-linka">
          {serazene.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => nastavUpravovanou(zeSablony(s))}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg py-2 pr-2 pl-0 text-left transition-colors duration-150 hover:bg-papir/70"
              >
                <span aria-hidden className="h-9 w-[5px] shrink-0 rounded-full" style={{ backgroundColor: barvaSablony(s) }} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-15 font-semibold">{s.nazev}</span>
                  <span className="text-13 text-tlumeny tabular-nums">
                    {casSablony(s)}
                    {s.prestavkaMin > 0 && `, přestávka ${s.prestavkaMin} min`}
                  </span>
                </span>
                <span className="text-15 font-medium tabular-nums">{formatHodin(delka(s))}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-15 text-tlumeny">Zatím žádné šablony. Přidej třeba Ranní 8:00–16:30 s půlhodinovou přestávkou.</p>
      )}
      <div>
        <Tlacitko varianta="vedlejsi" ikona={Plus} onClick={() => nastavUpravovanou(PRAZDNA)}>
          Přidat šablonu
        </Tlacitko>
      </div>
      {upravovana && <EditorSablony key={upravovana.id ?? 'nova'} firmaId={firmaId} sablona={upravovana} onZavrit={() => nastavUpravovanou(null)} />}
    </Sekce>
  );
}

import { CircleAlert, RotateCw } from 'lucide-react';
import { useState } from 'react';
import type { UlozDny } from '../../shared/api';
import { useUlozDny } from '../api/dotazy';
import { formatHodin } from '../cisla';
import { TYPY_DNU } from '../dochazka';
import { odeberNeulozenouDochazku, useNeulozenaDochazka } from '../stav/neulozenaDochazka';
import { Tlacitko } from './Tlacitko';

const NEJVIC_DNU = 5;
const kratkeDatum = (datum: string) => `${Number(datum.slice(8))}. ${Number(datum.slice(5, 7))}.`;

/** „5. 10. Dovolená 8 h, 6. 10. smazání" (nejvýš 5 dnů, pak „a 3 další"). */
function popisZmeny(zmena: UlozDny): string {
  const dny = [
    ...zmena.dny.map((d) => ({ datum: d.datum, text: `${kratkeDatum(d.datum)} ${TYPY_DNU[d.typ].nazev} ${formatHodin(d.minuty)}` })),
    ...(zmena.smazat ?? []).map((datum) => ({ datum, text: `${kratkeDatum(datum)} smazání` })),
  ].sort((a, b) => a.datum.localeCompare(b.datum));
  const zbyva = dny.length - NEJVIC_DNU;
  return dny.slice(0, NEJVIC_DNU).map((d) => d.text).join(', ') + (zbyva > 0 ? ` a ${zbyva} ${zbyva <= 4 ? 'další' : 'dalších'}` : '');
}

/**
 * Hláška na každé stránce, když se změna docházky neuložila (výpadek sítě, chyba serveru, uzavřený měsíc), i když
 * uživatel mezitím odešel jinam. Data drží `neulozenaDochazka`; „Zkusit znovu" změny pošle znovu (co se zase nepovede,
 * v hlášce zůstane s novým důvodem), „Zahodit" je vědomě zahodí.
 */
export function NeulozenaDochazka() {
  const polozky = useNeulozenaDochazka();
  const ulozDny = useUlozDny();
  const [ukladam, nastavUkladam] = useState(false);
  if (polozky.length === 0) return null;

  const znovu = async () => {
    nastavUkladam(true);
    for (const p of polozky) {
      try {
        await ulozDny.mutateAsync({ ...p.zmena, firmaId: p.firmaId, kdo: p.kdo });
      } catch {
        // Uložení ji vrátí do seznamu s novým důvodem, hláška zůstane.
      }
    }
    nastavUkladam(false);
  };

  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-l-[3px] border-chyba bg-chyba/8 py-3 pr-3 pl-4">
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-15 text-chyba">
        <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">Změny docházky se neuložily:</p>
          <ul className="flex flex-col gap-0.5">
            {polozky.map((p) => (
              <li key={p.id}>
                {p.kdo && <span className="font-semibold">{p.kdo}: </span>}
                <span className="tabular-nums">{popisZmeny(p.zmena)}</span>. {p.duvod}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Tlacitko varianta="tiche" ikona={RotateCw} nacita={ukladam} onClick={() => void znovu()}>Zkusit znovu</Tlacitko>
        <Tlacitko varianta="nebezpecneTiche" disabled={ukladam} onClick={() => polozky.forEach(odeberNeulozenouDochazku)}>Zahodit</Tlacitko>
      </div>
    </div>
  );
}

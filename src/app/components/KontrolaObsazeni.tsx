import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { Upozorneni } from '../../core/planovac';

const ZKRATKY_DNU = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const den = (datum: string) => `${ZKRATKY_DNU[new Date(`${datum}T00:00:00Z`).getUTCDay()]} ${Number(datum.slice(8, 10))}. ${Number(datum.slice(5, 7))}.`;
/** „1 člověk", „2 lidé", „5 lidí", „0 lidí". */
const lidi = (n: number) => `${n} ${n === 1 ? 'člověk' : n >= 2 && n <= 4 ? 'lidé' : 'lidí'}`;

/** Věta upozornění pro člověka. */
export function textUpozorneni(u: Upozorneni): string {
  const kdy = `${den(u.datum)} ${u.od}–${u.do}`;
  switch (u.druh) {
    case 'CHYBI_KASAR': return `${kdy}: chybí zodpovědný kasař`;
    case 'ZASKAKUJE': return `${kdy}: kasu jistí ${u.jmena.join(', ')} (učí se)`;
    case 'OBSAZENI':
      // Okno „aspoň“ hlásí jen nedostatek.
      if (u.aspon) return `${kdy}: ${lidi(u.pocet ?? 0)}, má být aspoň ${u.cil ?? 0}`;
      return `${kdy}: ${lidi(u.pocet ?? 0)}, ${(u.pocet ?? 0) > (u.cil ?? 0) ? 'stačí' : 'má být'} ${u.cil ?? 0}`;
    case 'MALO_LIDI': return `${kdy}: na prodejně je méně než 2 lidé`;
    case 'ODPOLEDNE_PODRUHE': return `${u.jmena[0]} má odpolední týden podruhé po sobě`;
    case 'PODLE_DOCHAZKY': return `${den(u.datum)}: ${u.jmena[0]} má v plánu směnu, ale v docházce nepřítomnost`;
  }
}

/** Panel nad rozpisem: co v obsazení týdne nesedí (chybějící kasař jako chyba, ostatní oranžově). */
export function KontrolaObsazeni({ upozorneni }: { upozorneni: Upozorneni[] }) {
  return (
    <section aria-label="Kontrola obsazení" className="rounded-xl border border-linka bg-karta px-4 py-3">
      {upozorneni.length === 0 ? (
        <p className="flex items-center gap-2 text-15">
          <CircleCheck aria-hidden className="size-[18px] shrink-0 text-akce" />
          Obsazení v pořádku: kasa i prodejna jsou pokryté.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-15">
          {upozorneni.map((u, i) => {
            const chyba = u.druh === 'CHYBI_KASAR';
            const Ikona = chyba ? CircleAlert : TriangleAlert;
            return (
              <li key={`${u.druh}-${u.datum}-${u.od}-${i}`} className="flex items-start gap-2">
                <Ikona aria-hidden className={`mt-0.5 size-[18px] shrink-0 ${chyba ? 'text-chyba' : 'text-varovani'}`} />
                {textUpozorneni(u)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

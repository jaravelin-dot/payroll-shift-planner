// Platby měsíce: komu kolik, na jaký účet a QR Platba k naskenování v bankovní aplikaci. Lidé bez platného účtu jsou
// „Hotově" a jejich součet je zvlášť, ať je jasné, kolik peněz připravit v hotovosti.
import { useEffect, useMemo, useState } from 'react';
import { formatKc } from '../../core/penize';
import type { Zamestnanec } from '../../shared/api';
import type { RadekVyplaty } from '../radkyVyplat';
import { platbyMesice, type PolozkaPlatby, type SoucetPlateb } from '../vystupy/platby';
import { Stitek } from './Stitek';

const UZKA_MEZERA = ' ';
const kc = (hal: number) => formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`);
const pocetLidi = (n: number) => (n === 1 ? '1 člověk' : n >= 2 && n <= 4 ? `${n} lidé` : `${n} lidí`);

interface QrKody {
  kody: ReadonlyMap<string, string>;
  /** Knihovnu nebo kód se nepodařilo načíst nebo vytvořit (např. chybí připojení pro líný balík). */
  selhalo: boolean;
}

/** QR kódy jako SVG v data: adrese (CSP povoluje obrázky z data:). Klíčem je text platby, takže se nikdy neukáže starý kód. */
function useQrKody(texty: string[]): QrKody {
  const [kody, nastavKody] = useState<ReadonlyMap<string, string>>(new Map());
  const [selhalo, nastavSelhalo] = useState(false);
  const klic = texty.join('\n');
  useEffect(() => {
    let platne = true;
    const seznam = klic ? klic.split('\n') : [];
    nastavSelhalo(false);
    void (async () => {
      try {
        const modul = await import('qrcode');
        const qrcode = (modul as unknown as { default?: typeof modul }).default ?? modul;
        const svg = await Promise.all(seznam.map((text) => qrcode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#16202bff', light: '#ffffffff' } })));
        if (platne) nastavKody(new Map(seznam.map((text, i) => [text, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg[i]!)}`])));
      } catch {
        if (platne) nastavSelhalo(true);
      }
    })();
    return () => {
      platne = false;
    };
  }, [klic]);
  return { kody, selhalo };
}

function Soucet({ nazev, soucet }: { nazev: string; soucet: SoucetPlateb }) {
  return (
    <div className="flex flex-col">
      <span className="text-15 text-tlumeny">{nazev}</span>
      <data value={soucet.castkaHal / 100} className="text-21 font-semibold whitespace-nowrap tabular-nums">{kc(soucet.castkaHal)}</data>
      <span className="text-13 text-tlumeny">{pocetLidi(soucet.pocet)}</span>
    </div>
  );
}

function Zpusob({ p, qr, qrSelhalo }: { p: PolozkaPlatby; qr: string | undefined; qrSelhalo: boolean }) {
  switch (p.stav) {
    case 'QR':
      if (!qr && qrSelhalo) return <span className="text-13 font-medium text-chyba">QR kód se nepodařilo vytvořit</span>;
      return (
        <figure className="flex flex-col items-center gap-1">
          {qr ? (
            <img src={qr} alt={`QR platba pro ${p.jmeno}: ${formatKc(p.kVyplateHal)}`} width={136} height={136} className="size-34 rounded-md border border-linka" />
          ) : (
            <span aria-hidden className="size-34 animate-pulse rounded-md bg-papir motion-reduce:animate-none" />
          )}
          <figcaption className="text-13 text-tlumeny">QR platba</figcaption>
        </figure>
      );
    case 'HOTOVE':
      return <Stitek ton="neutralni">Hotově</Stitek>;
    case 'NEZNAMY':
      return <Stitek ton="varovani">Účet neznámý</Stitek>;
    case 'NIC':
      return <span className="text-15 text-tlumeny">Nic k výplatě</span>;
    case 'ZAPORNA':
      return <Stitek ton="chyba">Výplata vychází záporná — zkontroluj</Stitek>;
  }
}

function Polozka({ p, qr, qrSelhalo }: { p: PolozkaPlatby; qr: string | undefined; qrSelhalo: boolean }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-17 font-semibold lg:text-15">{p.jmeno}</span>
        {p.stav === 'QR' && (
          <>
            <span className="text-15 tabular-nums">{p.ucet}</span>
            <span className="text-13 text-tlumeny">Zpráva: {p.zprava} · VS {p.vs}</span>
          </>
        )}
        {p.stav === 'NEZNAMY' && <span className="text-13 text-tlumeny">Už není mezi lidmi firmy, účet neznáme. Zjisti, jak výplatu poslat.</span>}
        {p.stav !== 'QR' && p.neplatnyUcet && <span className="text-13 text-varovani">Číslo účtu {p.ucet} nesedí, oprav ho v Lidé.</span>}
        {p.stav !== 'QR' && !p.neplatnyUcet && p.ucet && <span className="text-15 text-tlumeny tabular-nums">{p.ucet}</span>}
      </div>
      <data
        value={p.kVyplateHal / 100}
        className={`text-17 font-semibold whitespace-nowrap tabular-nums sm:w-32 sm:text-right ${p.kVyplateHal < 0 ? 'text-chyba' : p.kVyplateHal === 0 ? 'text-tlumeny' : 'text-penize'}`}
      >
        {kc(p.kVyplateHal)}
      </data>
      <div className="flex sm:w-40 sm:justify-center">
        <Zpusob p={p} qr={qr} qrSelhalo={qrSelhalo} />
      </div>
    </li>
  );
}

/** Seznam plateb měsíce se součty na účty a v hotovosti. */
export function Platby({ radky, zamestnanci, rok, mesic }: {
  radky: RadekVyplaty[]; zamestnanci: Pick<Zamestnanec, 'id' | 'ucet'>[]; rok: number; mesic: number;
}) {
  const { polozky, naUcet, hotove, neznamy } = useMemo(() => platbyMesice({ radky, zamestnanci, rok, mesic }), [radky, zamestnanci, rok, mesic]);
  const { kody: qr, selhalo: qrSelhalo } = useQrKody(polozky.flatMap((p) => (p.spayd ? [p.spayd] : [])));
  return (
    <div className="flex flex-col gap-2">
      {qrSelhalo && polozky.some((p) => p.stav === 'QR') && (
        <p role="alert" className="rounded-lg border-l-[3px] border-chyba bg-chyba/8 py-3 pr-3 pl-4 text-15 font-medium text-chyba">
          QR kódy se nepodařilo vytvořit. Platby zadej v bance ručně podle účtu a částky, nebo obnov stránku.
        </p>
      )}
      <section aria-label="Součty plateb" className="flex flex-wrap gap-x-12 gap-y-4 pb-3">
        <Soucet nazev="Na účty" soucet={naUcet} />
        <Soucet nazev="Hotově" soucet={hotove} />
        {neznamy.pocet > 0 && <Soucet nazev="Neznámý účet" soucet={neznamy} />}
      </section>
      <ul aria-label="Platby lidí" className="-mx-5 divide-y divide-linka border-t border-linka px-5 sm:-mx-6 sm:px-6">
        {polozky.map((p) => (
          <Polozka key={p.zamestnanecId} p={p} qr={p.spayd ? qr.get(p.spayd) : undefined} qrSelhalo={qrSelhalo} />
        ))}
      </ul>
    </div>
  );
}

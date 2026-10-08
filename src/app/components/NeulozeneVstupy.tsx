import { CircleAlert, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useUlozVstup } from '../api/dotazy';
import { odeberNeulozeny, useNeulozeneVstupy } from '../stav/neulozeneVstupy';
import { Tlacitko } from './Tlacitko';

/**
 * Hláška na každé stránce, když se odměny člověka neuložily až po odchodu z jeho stránky (výpadek sítě, chyba serveru).
 * Data drží `neulozeneVstupy`; „Zkusit znovu" je pošle znovu, „Zahodit" změny vědomě zahodí.
 */
export function NeulozeneVstupy() {
  const polozky = useNeulozeneVstupy();
  const ulozVstup = useUlozVstup();
  const [ukladam, nastavUkladam] = useState(false);
  if (polozky.length === 0) return null;

  const znovu = async () => {
    nastavUkladam(true);
    for (const p of polozky) {
      try {
        await ulozVstup.mutateAsync({ ...p.vstup, firmaId: p.firmaId });
        odeberNeulozeny(p);
      } catch {
        // Zůstane v seznamu, hláška zůstane.
      }
    }
    nastavUkladam(false);
  };

  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-l-[3px] border-chyba bg-chyba/8 py-3 pr-3 pl-4">
      <p className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-15 font-medium text-chyba">
        <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
        Změny odměn se neuložily: {polozky.map((p) => p.popis).join('; ')}.
      </p>
      <div className="flex flex-wrap gap-1">
        <Tlacitko varianta="tiche" ikona={RotateCw} nacita={ukladam} onClick={() => void znovu()}>Zkusit znovu</Tlacitko>
        <Tlacitko varianta="nebezpecneTiche" disabled={ukladam} onClick={() => polozky.forEach(odeberNeulozeny)}>Zahodit</Tlacitko>
      </div>
    </div>
  );
}

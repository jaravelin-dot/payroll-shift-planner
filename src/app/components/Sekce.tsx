import { useId, type ReactNode } from 'react';

type Props = {
  nadpis: string;
  popis?: ReactNode;
  children: ReactNode;
  /** Id nadpisu, když se na něj má odkázat i pole uvnitř (např. jediné textové pole sekce). */
  nadpisId?: string;
  className?: string;
};

/** Skupina formuláře nebo stránky: bílá karta s jemnou linkou, bez stínu. Pro čtečky je to pojmenovaná oblast. */
export function Sekce({ nadpis, popis, children, nadpisId, className = '' }: Props) {
  const vlastniId = useId();
  const id = nadpisId ?? vlastniId;
  return (
    <section aria-labelledby={id} className={`rounded-xl border border-linka bg-karta p-5 sm:p-6 ${className}`}>
      <h2 id={id} className="text-17 font-semibold">
        {nadpis}
      </h2>
      {popis && <p className="mt-1 text-13 text-tlumeny">{popis}</p>}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

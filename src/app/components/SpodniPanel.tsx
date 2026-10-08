import { X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  otevreno: boolean;
  onZavrit: () => void;
  nadpis: string;
  children: ReactNode;
  /** Tlačítka dole (Uložit, Smazat…), zůstávají vidět i při posunu obsahu. */
  paticka?: ReactNode;
};

const FOKUSOVATELNE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modální panel: na mobilu vyjede zdola (sheet), na PC (≥ 1024 px) zprava.
 * Fokus zůstává uvnitř, Esc a klepnutí mimo zavírají, po zavření se fokus vrátí, odkud přišel.
 */
export function SpodniPanel({ otevreno, onZavrit, nadpis, children, paticka }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const nadpisId = useId();
  const zavri = useEffectEvent(onZavrit);

  useEffect(() => {
    if (!otevreno) return;
    const predtim = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const koren = document.getElementById('root');
    const puvodniOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    koren?.setAttribute('inert', '');
    panel.current?.focus();

    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        zavri();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const prvky = [...panel.current.querySelectorAll<HTMLElement>(FOKUSOVATELNE)];
      if (prvky.length === 0) {
        e.preventDefault();
        return;
      }
      const prvni = prvky[0];
      const posledni = prvky[prvky.length - 1];
      const aktivni = document.activeElement;
      const venku = !panel.current.contains(aktivni);
      if (e.shiftKey && (aktivni === prvni || aktivni === panel.current || venku)) {
        e.preventDefault();
        posledni.focus();
      } else if (!e.shiftKey && (aktivni === posledni || venku)) {
        e.preventDefault();
        prvni.focus();
      }
    };
    document.addEventListener('keydown', naKlavesu);

    return () => {
      document.removeEventListener('keydown', naKlavesu);
      document.body.style.overflow = puvodniOverflow;
      koren?.removeAttribute('inert');
      predtim?.focus();
    };
  }, [otevreno]);

  if (!otevreno) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div data-testid="pozadi-panelu" aria-hidden className="absolute inset-0 animate-pozadi bg-inkoust/40" onClick={onZavrit} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        tabIndex={-1}
        className={[
          'absolute flex flex-col bg-karta outline-none',
          'inset-x-0 bottom-0 max-h-[88dvh] animate-panel-zdola rounded-t-2xl',
          'lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[440px] lg:animate-panel-zprava lg:rounded-none lg:border-l lg:border-linka',
        ].join(' ')}
      >
        <header className="flex items-center justify-between gap-3 border-b border-linka py-2 pr-2 pl-5">
          <h2 id={nadpisId} className="text-17 font-semibold">
            {nadpis}
          </h2>
          <button type="button" onClick={onZavrit} aria-label="Zavřít" className="grid size-11 place-items-center rounded-lg text-tlumeny transition-colors hover:bg-inkoust/6 hover:text-inkoust">
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {paticka && (
          <footer className="flex flex-wrap gap-3 border-t border-linka px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{paticka}</footer>
        )}
        {!paticka && <div aria-hidden className="h-[env(safe-area-inset-bottom)] shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}

// Stažení souboru vytvořeného v prohlížeči (PDF, Excel). CSP appky nepovoluje rámy s blob: adresou, proto se soubor
// neotevírá v iframe, jen se stáhne přes `<a download>`: na PC jako stažený soubor, na iPhonu ho Safari ukáže
// s nabídkou Sdílet / Uložit do Souborů.

/** Text do názvu souboru: bez diakritiky, malá písmena, slova spojená pomlčkou („Ukázková s.r.o." → „ukazkova-s-r-o"). */
export function nazevSouboru(text: string): string {
  const cisty = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cisty || 'soubor';
}

/** Stáhne data pod daným jménem. Adresa blobu se uvolní až po chvíli, ať ji Safari stihne otevřít. */
export function stahni(data: Blob, nazev: string): void {
  const adresa = URL.createObjectURL(data);
  const odkaz = document.createElement('a');
  odkaz.href = adresa;
  odkaz.download = nazev;
  odkaz.rel = 'noopener';
  odkaz.style.display = 'none';
  document.body.append(odkaz);
  odkaz.click();
  odkaz.remove();
  setTimeout(() => URL.revokeObjectURL(adresa), 60_000);
}

import { formatDatum } from './datum';
import { firma, zamestnanec } from './test-utils';
import { CHYBA_SAZBY_RADEK, CHYBA_UCTU, konceptZ, over, overUcet, type Koncept } from './validaceZamestnance';

const DNES = '2026-10-06';

/** Platný nový člověk: jméno, příjmení a sazba doplněné k prázdnému konceptu. */
function platny(zmeny: Partial<Koncept> = {}): Koncept {
  const k = konceptZ(undefined, firma(), DNES);
  return { ...k, jmeno: 'Jana', prijmeni: 'Nováková', sazby: [{ ...k.sazby[0], kc: '165' }], ...zmeny };
}

test('platný formulář dá údaje v minutách a haléřích, prázdné hodnoty jako null', () => {
  const { udaje, chyby } = over(platny({ jmeno: ' Jana ', uvazek: '30', sazby: [{ klic: 'a', platiOd: DNES, kc: '165,50' }] }));

  expect(chyby).toEqual({});
  expect(udaje).toMatchObject({
    jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 1800, nastup: DNES, ukonceni: null, ucet: null, poznamka: null,
    sazby: [{ platiOd: DNES, hodinovaHal: 16550 }],
  });
});

test('prázdné jméno a příjmení, úvazek mimo rozsah a chybějící sazba mají hlášku u svého pole', () => {
  const { udaje, chyby } = over(platny({ jmeno: '  ', prijmeni: '', uvazek: '41', sazby: [{ klic: 'a', platiOd: DNES, kc: '' }] }));

  expect(udaje).toBeNull();
  expect(chyby.jmeno).toBe('Napiš jméno.');
  expect(chyby.prijmeni).toBe('Napiš příjmení.');
  expect(chyby.uvazek).toBe('Úvazek musí být víc než 0 a nejvýš 40 hodin týdně.');
  expect(chyby['a.kc']).toBe('Vyplň sazbu v Kč za hodinu.');
});

test('dohoda nekontroluje úvazek a pošle ho jako 0, sleva na pojistném se vypne', () => {
  const { udaje, chyby } = over(platny({ smlouva: 'DPP', uvazek: 'nesmysl', slevaNaPojistnem: true }));

  expect(chyby).toEqual({});
  expect(udaje).toMatchObject({ smlouva: 'DPP', uvazekMinTydne: 0, slevaNaPojistnem: false });
});

test('ukončení před nástupem je chyba ukončení', () => {
  const { chyby } = over(platny({ ukonceni: '2026-10-01' }));

  expect(chyby.ukonceni).toBe('Ukončení nesmí být před nástupem.');
});

test('dvě sazby od stejného dne: hláška historie a označený první řádek, který se opakuje', () => {
  const sazby = [
    { klic: 'a', platiOd: '2026-01-01', kc: '150' },
    { klic: 'b', platiOd: DNES, kc: '160' },
    { klic: 'c', platiOd: DNES, kc: '170' },
  ];
  const { udaje, chyby } = over(platny({ nastup: '2026-01-01', sazby }));

  expect(udaje).toBeNull();
  expect(chyby.sazby).toBe('Dvě sazby nemůžou platit od stejného dne.');
  expect(chyby[CHYBA_SAZBY_RADEK]).toBe('b');
});

test('první sazba až po nástupu: hláška s oběma dny a označený řádek první sazby', () => {
  const sazby = [
    { klic: 'a', platiOd: '2026-11-01', kc: '170' },
    { klic: 'b', platiOd: '2026-10-20', kc: '160' },
  ];
  const { udaje, chyby } = over(platny({ sazby }));

  expect(udaje).toBeNull();
  expect(chyby.sazby).toContain(`První sazba platí až od ${formatDatum('2026-10-20')}, ale nástup je ${formatDatum(DNES)}.`);
  expect(chyby[CHYBA_SAZBY_RADEK]).toBe('b');
});

test('platná historie sazeb nemá chybu historie ani označený řádek', () => {
  const sazby = [
    { klic: 'a', platiOd: '2026-11-01', kc: '170' },
    { klic: 'b', platiOd: DNES, kc: '160' },
  ];
  const { udaje, chyby } = over(platny({ sazby }));

  expect(chyby).toEqual({});
  expect(udaje?.sazby).toEqual([{ platiOd: '2026-11-01', hodinovaHal: 17000 }, { platiOd: DNES, hodinovaHal: 16000 }]);
});

test('číslo účtu: prázdné projde, špatné dá hlášku, mezery se při uložení odstraní', () => {
  expect(overUcet('')).toBeUndefined();
  expect(overUcet('   ')).toBeUndefined();
  expect(overUcet('19-24619/0800')).toBeUndefined();
  expect(overUcet('123456789/0100')).toBe(CHYBA_UCTU);

  expect(over(platny({ ucet: '123456789/0100' })).chyby.ucet).toBe(CHYBA_UCTU);
  expect(over(platny({ ucet: ' 19-24619 / 0800 ' })).udaje?.ucet).toBe('19-24619/0800');
});

test('pořadí v podkladu: prázdné = null, celé číslo 1–999 projde, jinak hláška', () => {
  expect(over(platny({ poradi: '' })).udaje?.poradiPodkladu).toBeNull();
  expect(over(platny({ poradi: '  ' })).udaje?.poradiPodkladu).toBeNull();
  expect(over(platny({ poradi: ' 7 ' })).udaje?.poradiPodkladu).toBe(7);
  expect(over(platny({ poradi: '1' })).udaje?.poradiPodkladu).toBe(1);
  expect(over(platny({ poradi: '999' })).udaje?.poradiPodkladu).toBe(999);
  for (const spatne of ['0', '1000', '-1', '1,5', '2.5', 'abc', '1e2']) {
    const { udaje, chyby } = over(platny({ poradi: spatne }));
    expect(udaje, spatne).toBeNull();
    expect(chyby.poradi, spatne).toBe('Celé číslo od 1 do 999.');
  }
});

test('zahrnutí do podkladů: nový člověk má zapnuto, hodnota se propíše do údajů', () => {
  expect(konceptZ(undefined, firma(), DNES).vPodkladu).toBe(true);
  expect(over(platny()).udaje?.vPodkladu).toBe(true);
  expect(over(platny({ vPodkladu: false })).udaje?.vPodkladu).toBe(false);
});

test('poznámka nad 500 znaků je chyba, při uložení se ořízne', () => {
  expect(over(platny({ poznamka: 'x'.repeat(501) })).chyby.poznamka).toBe('Poznámka může mít nejvýš 500 znaků.');
  expect(over(platny({ poznamka: '  Pozor  ' })).udaje?.poznamka).toBe('Pozor');
});

test('koncept z existujícího člověka převede minuty a haléře na text', () => {
  const k = konceptZ(zamestnanec({ uvazekMinTydne: 2250 }), firma(), DNES);

  expect(k).toMatchObject({ jmeno: 'Jana', uvazek: '37,5', nastup: '2025-01-01', ukonceni: '' });
  expect(k.sazby).toMatchObject([{ platiOd: '2025-01-01', kc: '165' }]);
});

test('koncept: vPodkladu se převezme z existujícího člověka', () => {
  expect(konceptZ(zamestnanec({ vPodkladu: false }), firma(), DNES).vPodkladu).toBe(false);
  expect(konceptZ(zamestnanec({ vPodkladu: true }), firma(), DNES).vPodkladu).toBe(true);
});

test('koncept: pořadí v podkladu jako text, bez pořadí a u nového člověka prázdné', () => {
  expect(konceptZ(zamestnanec({ poradiPodkladu: 3 }), firma(), DNES).poradi).toBe('3');
  expect(konceptZ(zamestnanec({ poradiPodkladu: null }), firma(), DNES).poradi).toBe('');
  expect(konceptZ(undefined, firma(), DNES).poradi).toBe('');
});

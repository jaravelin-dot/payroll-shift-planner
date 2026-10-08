CREATE TABLE `den` (
	`zamestnanec_id` text NOT NULL,
	`datum` text NOT NULL,
	`typ` text NOT NULL,
	`minuty` integer NOT NULL,
	`kasa` integer NOT NULL,
	`poznamka` text,
	PRIMARY KEY(`zamestnanec_id`, `datum`),
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dovolena_zustatek` (
	`zamestnanec_id` text NOT NULL,
	`rok` integer NOT NULL,
	`prevod_min` integer NOT NULL,
	`narok_navic_min` integer NOT NULL,
	PRIMARY KEY(`zamestnanec_id`, `rok`),
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `firma` (
	`id` text PRIMARY KEY NOT NULL,
	`nazev` text NOT NULL,
	`ico` text,
	`adresa` text,
	`ucet` text,
	`nastaveni` text NOT NULL,
	`vytvoreno` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mesicni_vstup` (
	`zamestnanec_id` text NOT NULL,
	`rok` integer NOT NULL,
	`mesic` integer NOT NULL,
	`odmena_za_den_hal` integer NOT NULL,
	`aktivita_hal` integer NOT NULL,
	`jine_odmeny_hal` integer NOT NULL,
	`srazky_hal` integer NOT NULL,
	`prumerny_vydelek_hal` integer,
	`poznamka` text,
	PRIMARY KEY(`zamestnanec_id`, `rok`, `mesic`),
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_smeny` (
	`zamestnanec_id` text NOT NULL,
	`datum` text NOT NULL,
	`typ` text NOT NULL,
	`sablona_id` text,
	`minuty` integer NOT NULL,
	PRIMARY KEY(`zamestnanec_id`, `datum`),
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sablona_id`) REFERENCES `sablona_smeny`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sablona_smeny` (
	`id` text PRIMARY KEY NOT NULL,
	`firma_id` text NOT NULL,
	`nazev` text NOT NULL,
	`zacatek` text NOT NULL,
	`konec` text NOT NULL,
	`prestavka_min` integer NOT NULL,
	`barva` text,
	FOREIGN KEY (`firma_id`) REFERENCES `firma`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sazba` (
	`id` text PRIMARY KEY NOT NULL,
	`zamestnanec_id` text NOT NULL,
	`plati_od` text NOT NULL,
	`hodinova_hal` integer NOT NULL,
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `uzaverka` (
	`firma_id` text NOT NULL,
	`rok` integer NOT NULL,
	`mesic` integer NOT NULL,
	`uzavreno` text NOT NULL,
	`vysledky` text NOT NULL,
	PRIMARY KEY(`firma_id`, `rok`, `mesic`),
	FOREIGN KEY (`firma_id`) REFERENCES `firma`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `zamestnanec` (
	`id` text PRIMARY KEY NOT NULL,
	`firma_id` text NOT NULL,
	`jmeno` text NOT NULL,
	`prijmeni` text NOT NULL,
	`smlouva` text NOT NULL,
	`uvazek_min_tydne` integer NOT NULL,
	`nastup` text NOT NULL,
	`ukonceni` text,
	`prohlaseni` integer NOT NULL,
	`invalidita` text NOT NULL,
	`ztpp` integer NOT NULL,
	`deti` text NOT NULL,
	`statni_pojistenec` integer NOT NULL,
	`sleva_na_pojistnem` integer NOT NULL,
	`ucet` text,
	`poznamka` text,
	`aktivni` integer NOT NULL,
	FOREIGN KEY (`firma_id`) REFERENCES `firma`(`id`) ON UPDATE no action ON DELETE cascade
);

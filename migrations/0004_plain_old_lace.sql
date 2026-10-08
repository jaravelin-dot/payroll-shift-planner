CREATE TABLE `odkaz_rozpisu` (
	`id` text PRIMARY KEY NOT NULL,
	`firma_id` text NOT NULL,
	`zamestnanec_id` text,
	`token` text NOT NULL,
	`nazev` text NOT NULL,
	`vytvoreno` text NOT NULL,
	`zruseno` text,
	FOREIGN KEY (`firma_id`) REFERENCES `firma`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zamestnanec_id`) REFERENCES `zamestnanec`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `odkaz_rozpisu_token_unique` ON `odkaz_rozpisu` (`token`);
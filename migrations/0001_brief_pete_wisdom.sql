ALTER TABLE `zamestnanec` ADD `role_planu` text DEFAULT 'MIMO_PLAN' NOT NULL;--> statement-breakpoint
ALTER TABLE `zamestnanec` ADD `stridani_smen` text DEFAULT '[]' NOT NULL;
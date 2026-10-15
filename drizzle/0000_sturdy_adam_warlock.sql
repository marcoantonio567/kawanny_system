CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`record_id` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`birthday` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`income_cents` integer DEFAULT 0 NOT NULL,
	`expense_cents` integer DEFAULT 0 NOT NULL,
	`reserve_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goals_period_unique` ON `goals` (`period`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`name` text NOT NULL,
	`previous_cents` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`reason` text NOT NULL,
	`raw` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` text,
	`service_id` text,
	`client_id` text,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment` text NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`installments` integer DEFAULT 1 NOT NULL,
	`due_date` text,
	`source` text,
	`notes` text DEFAULT '' NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_amount" CHECK("movements"."amount_cents">0),
	CONSTRAINT "valid_kind" CHECK("movements"."kind" IN ('income','expense')),
	CONSTRAINT "valid_status" CHECK("movements"."status" IN ('paid','pending'))
);
--> statement-breakpoint
CREATE INDEX `movements_date_idx` ON `movements` (`date`);--> statement-breakpoint
CREATE INDEX `movements_client_idx` ON `movements` (`client_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`movement_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_payment" CHECK("payments"."amount_cents">0)
);
--> statement-breakpoint
CREATE INDEX `payments_debt_idx` ON `payments` (`debt_id`);--> statement-breakpoint
CREATE TABLE `reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`target_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`duration` integer DEFAULT 60 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

ALTER TABLE "processos" ALTER COLUMN "numero" DROP NOT NULL;--> statement-breakpoint
-- Os processos que já existem têm número: entram como protocolados. Os novos começam na triagem.
-- (Pelo DEFAULT, e não por UPDATE, porque o RLS forçado também vale para o dono da tabela.)
ALTER TABLE "processos" ADD COLUMN "fase" text DEFAULT 'protocolado' NOT NULL;--> statement-breakpoint
ALTER TABLE "processos" ALTER COLUMN "fase" SET DEFAULT 'triagem';--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "tipo" text;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "data_atendimento" date;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "data_inicio" date;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "prescricao" date;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "data_protocolo" date;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "comarca" text;
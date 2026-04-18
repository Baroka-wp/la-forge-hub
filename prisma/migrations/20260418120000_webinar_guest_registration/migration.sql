-- AlterTable: colonnes invité + email_key
ALTER TABLE "webinar_registrations" ADD COLUMN "email_key" TEXT;
ALTER TABLE "webinar_registrations" ADD COLUMN "guest_phone" TEXT;
ALTER TABLE "webinar_registrations" ADD COLUMN "guest_name" TEXT;

-- Remplir email_key depuis les comptes existants
UPDATE "webinar_registrations" AS r
SET "email_key" = lower(trim(u.email))
FROM "users" AS u
WHERE r.user_id = u.id;

-- Anciennes lignes sans user (ne devrait pas arriver)
DELETE FROM "webinar_registrations" WHERE "user_id" IS NOT NULL AND "email_key" IS NULL;

-- Ancienne contrainte unique (webinaire + utilisateur)
ALTER TABLE "webinar_registrations" DROP CONSTRAINT IF EXISTS "webinar_registrations_webinar_id_user_id_key";

ALTER TABLE "webinar_registrations" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "webinar_registrations" ALTER COLUMN "email_key" SET NOT NULL;

CREATE UNIQUE INDEX "webinar_registrations_webinar_id_email_key_key" ON "webinar_registrations"("webinar_id", "email_key");

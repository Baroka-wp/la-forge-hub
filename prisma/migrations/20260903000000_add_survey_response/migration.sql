CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "offre_principale" TEXT NOT NULL,
    "offres_interessantes" JSONB NOT NULL,
    "profil" JSONB NOT NULL,
    "motivation" JSONB NOT NULL,
    "motivation_autre" TEXT,
    "format_apprentissage" TEXT NOT NULL,
    "ville_presentiel" TEXT,
    "disponibilite" JSONB NOT NULL,
    "budget" TEXT NOT NULL,
    "contact_nom" TEXT NOT NULL,
    "contact_whatsapp" TEXT NOT NULL,
    "contact_email" TEXT,
    "consentement" BOOLEAN NOT NULL DEFAULT false,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "survey_responses_offre_principale_idx" ON "survey_responses"("offre_principale");
CREATE INDEX "survey_responses_created_at_idx" ON "survey_responses"("created_at");

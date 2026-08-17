-- Attestations NOAI 2026 / Bootcamp IOAI 2026

CREATE TYPE "CertificateKind" AS ENUM ('NOAI', 'BOOTCAMP');

-- Liste officielle des participants. Les coordonnees sont renseignees
-- au fil des demandes faites depuis la page /attestations.
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "table_number" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "declared_name" TEXT,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "first_request_at" TIMESTAMP(3),
    "last_request_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "participants_table_number_key" ON "participants"("table_number");
CREATE INDEX "participants_email_idx" ON "participants"("email");

CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "kind" "CertificateKind" NOT NULL,
    "file_name" TEXT,
    "pdf" BYTEA,
    "preview_image" BYTEA,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificates_participant_id_kind_key" ON "certificates"("participant_id", "kind");

ALTER TABLE "certificates"
ADD CONSTRAINT "certificates_participant_id_fkey"
FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "certificate_requests" (
    "id" TEXT NOT NULL,
    "table_number" TEXT NOT NULL,
    "provided_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certificate_requests_table_number_idx" ON "certificate_requests"("table_number");
CREATE INDEX "certificate_requests_outcome_idx" ON "certificate_requests"("outcome");

CREATE TABLE "certificate_downloads" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "email" TEXT,
    "downloaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_downloads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certificate_downloads_certificate_id_idx" ON "certificate_downloads"("certificate_id");

ALTER TABLE "certificate_downloads"
ADD CONSTRAINT "certificate_downloads_certificate_id_fkey"
FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Limitation persistante des recherches publiques. Seule une empreinte HMAC
-- de l'adresse réseau est conservée, jamais l'adresse brute.
CREATE TABLE "certificate_rate_limits" (
    "ip_hash" TEXT NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_rate_limits_pkey" PRIMARY KEY ("ip_hash")
);

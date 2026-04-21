-- CreateTable
CREATE TABLE "webinar_replay_views" (
  "id" TEXT NOT NULL,
  "webinar_id" TEXT NOT NULL,
  "viewer_key" TEXT NOT NULL,
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webinar_replay_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webinar_replay_views_webinar_id_viewed_at_idx"
ON "webinar_replay_views"("webinar_id", "viewed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webinar_replay_views_webinar_id_viewer_key_key"
ON "webinar_replay_views"("webinar_id", "viewer_key");

-- AddForeignKey
ALTER TABLE "webinar_replay_views"
ADD CONSTRAINT "webinar_replay_views_webinar_id_fkey"
FOREIGN KEY ("webinar_id") REFERENCES "webinars"("id") ON DELETE CASCADE ON UPDATE CASCADE;


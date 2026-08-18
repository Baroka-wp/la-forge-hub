-- Migration LMS additive : aucune table ni donnée existante n'est supprimée.
CREATE TYPE "Segment" AS ENUM ('COLLEGE', 'LYCEE');
CREATE TYPE "Discipline" AS ENUM ('PYTHON', 'MATH', 'ML', 'DEEP', 'NLP', 'SOFT');
CREATE TYPE "LessonKind" AS ENUM ('VIDEO', 'READING', 'EXERCISE', 'QUIZ', 'PROJECT');
CREATE TYPE "AttemptStatus" AS ENUM ('PASSED', 'FAILED', 'PENDING_REVIEW');

ALTER TABLE "users"
  ADD COLUMN "segment" "Segment",
  ADD COLUMN "birth_year" INTEGER;

CREATE TABLE "tracks" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "discipline" "Discipline" NOT NULL,
  "segment" "Segment" NOT NULL,
  "position" INTEGER NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "prerequisite_track_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tracks_slug_key" UNIQUE ("slug"),
  CONSTRAINT "tracks_prerequisite_track_id_fkey" FOREIGN KEY ("prerequisite_track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "tracks_segment_discipline_published_idx" ON "tracks"("segment", "discipline", "published");

CREATE TABLE "modules" (
  "id" TEXT NOT NULL,
  "track_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "position" INTEGER NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "modules_track_id_position_key" UNIQUE ("track_id", "position"),
  CONSTRAINT "modules_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "lessons"
  ADD COLUMN "module_id" TEXT,
  ADD COLUMN "kind" "LessonKind" NOT NULL DEFAULT 'VIDEO',
  ADD COLUMN "body_markdown" TEXT,
  ADD COLUMN "duration_min" INTEGER,
  ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true,
  ALTER COLUMN "youtube_id" DROP NOT NULL,
  ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "lessons_module_id_idx" ON "lessons"("module_id");

ALTER TABLE "enrollments"
  ADD COLUMN "track_id" TEXT,
  ADD CONSTRAINT "enrollments_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "enrollments_track_id_idx" ON "enrollments"("track_id");

CREATE TABLE "exercises" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "starter_code" TEXT,
  "solution_code" TEXT,
  "tests" JSONB NOT NULL,
  "hints" JSONB,
  "points" INTEGER NOT NULL DEFAULT 10,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exercises_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercises_lesson_id_position_key" UNIQUE ("lesson_id", "position"),
  CONSTRAINT "exercises_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "quiz_questions" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "choices" JSONB NOT NULL,
  "correct_choice_ids" JSONB NOT NULL,
  "explanation" TEXT,
  "points" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quiz_questions_lesson_id_position_key" UNIQUE ("lesson_id", "position"),
  CONSTRAINT "quiz_questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "attempts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "exercise_id" TEXT,
  "payload" JSONB NOT NULL,
  "score" INTEGER NOT NULL,
  "max_score" INTEGER NOT NULL,
  "status" "AttemptStatus" NOT NULL,
  "feedback" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "attempts_user_id_lesson_id_created_at_idx" ON "attempts"("user_id", "lesson_id", "created_at" DESC);

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT,
  "track_id" TEXT,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "rubric" JSONB NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "projects_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "projects_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "projects_track_id_published_idx" ON "projects"("track_id", "published");

CREATE TABLE "project_submissions" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "repo_url" TEXT,
  "notebook_url" TEXT,
  "notes" TEXT,
  "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "score" INTEGER,
  "reviewer_id" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_submissions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "project_submissions_user_id_submitted_at_idx" ON "project_submissions"("user_id", "submitted_at" DESC);
CREATE INDEX "project_submissions_status_submitted_at_idx" ON "project_submissions"("status", "submitted_at");

CREATE TABLE "badges" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rule" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badges_code_key" UNIQUE ("code")
);

CREATE TABLE "user_badges" (
  "user_id" TEXT NOT NULL,
  "badge_id" TEXT NOT NULL,
  "awarded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_id"),
  CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

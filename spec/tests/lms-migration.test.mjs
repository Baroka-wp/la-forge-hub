import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import test from 'node:test';

const DB_NAME = 'laforge_lms_spec';
const DATABASE_URL = `postgresql://baroka@127.0.0.1:5432/${DB_NAME}`;
const MIGRATION = 'prisma/migrations/20260818150000_lms_foundation/migration.sql';
const BACKFILL = 'scripts/backfill-lms.mjs';
const ROLLBACK = 'scripts/rollback-lms-backfill.mjs';

function psql(database, sql) {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-d', database, '-Atqc', sql], { encoding: 'utf8' }).trim();
}

function run(file) {
  return execFileSync('node', [file], { env: { ...process.env, DATABASE_URL }, encoding: 'utf8' });
}

function legacySnapshot() {
  const projections = {
    users: 'id,email,password_hash,display_name,role,auth_version,marketing_opt_in,created_at',
    lessons: 'lesson_id,course_slug,position,title,description,youtube_id,tag,collab_url,recorded_at,created_at,updated_at',
    lesson_progress: 'user_id,lesson_id,completed,last_position_sec,updated_at',
    enrollments: 'id,user_id,course_slug,enrolled_at',
    community_posts: 'id,lesson_id,user_id,parent_id,body,created_at',
  };
  return Object.fromEntries(Object.entries(projections).map(([table, cols]) => [
    table,
    psql(DB_NAME, `SELECT COALESCE(json_agg(t ORDER BY row_to_json(t)::text)::text,'[]') FROM (SELECT ${cols} FROM ${table}) t`),
  ]));
}

test.before(() => {
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
  psql('postgres', `CREATE DATABASE ${DB_NAME}`);
  psql(DB_NAME, `
    CREATE TYPE "UserRole" AS ENUM ('learner','admin');
    CREATE TABLE users (
      id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
      display_name text NOT NULL, role "UserRole" NOT NULL DEFAULT 'learner',
      auth_version integer NOT NULL DEFAULT 0, marketing_opt_in boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE lessons (
      lesson_id text PRIMARY KEY, course_slug text NOT NULL DEFAULT 'formation-ia', position integer NOT NULL,
      title text NOT NULL, description text, youtube_id text NOT NULL, tag text NOT NULL,
      collab_url text, recorded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(course_slug, position)
    );
    CREATE TABLE lesson_progress (
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id text NOT NULL,
      completed boolean NOT NULL DEFAULT false, last_position_sec integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, lesson_id)
    );
    CREATE TABLE enrollments (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_slug text NOT NULL DEFAULT 'formation-ia', enrolled_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, course_slug)
    );
    CREATE TABLE community_posts (
      id text PRIMARY KEY, lesson_id text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id text REFERENCES community_posts(id) ON DELETE CASCADE, body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO users(id,email,password_hash,display_name,role,auth_version,marketing_opt_in)
      VALUES ('u1','eleve@example.com','hash-intact','Awa K.','learner',3,true),
             ('a1','admin@example.com','hash-admin','Admin','admin',2,false);
    INSERT INTO lessons(lesson_id,course_slug,position,title,description,youtube_id,tag)
      VALUES ('legacy-video-1','formation-ia',1,'Python 1','Introduction','abcDEF123','python'),
             ('legacy-video-2','formation-ia',2,'Maths 1',NULL,'ghiJKL456','math');
    INSERT INTO lesson_progress(user_id,lesson_id,completed,last_position_sec)
      VALUES ('u1','legacy-video-1',true,312),('u1','legacy-video-2',false,87);
    INSERT INTO enrollments(id,user_id,course_slug) VALUES ('e1','u1','formation-ia');
    INSERT INTO community_posts(id,lesson_id,user_id,body) VALUES ('p1','legacy-video-1','u1','Question existante');
  `);
});

test.after(() => {
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
});

test('lot 1 fournit une migration additive et les scripts de backfill/restauration', () => {
  assert.equal(existsSync(MIGRATION), true, 'migration LMS absente');
  assert.equal(existsSync(BACKFILL), true, 'script de backfill absent');
  assert.equal(existsSync(ROLLBACK), true, 'script de restauration absent');
});

test('la migration conserve toutes les donnees historiques et rend youtube_id nullable', () => {
  const before = legacySnapshot();
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', DATABASE_URL, '-f', MIGRATION], { stdio: 'pipe' });
  assert.deepEqual(legacySnapshot(), before);
  assert.equal(psql(DB_NAME, `SELECT is_nullable FROM information_schema.columns WHERE table_name='lessons' AND column_name='youtube_id'`), 'YES');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('tracks','modules','exercises','quiz_questions','attempts','projects','project_submissions','badges','user_badges')`), '9');
});

test('le backfill est idempotent et ne modifie que les nouvelles colonnes', () => {
  const before = legacySnapshot();
  run(BACKFILL);
  assert.deepEqual(legacySnapshot(), before);
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM tracks WHERE slug='formation-ia'`), '1');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM modules WHERE title='Programme initial'`), '1');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM lessons WHERE module_id IS NOT NULL AND kind='VIDEO' AND published=true`), '2');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM enrollments WHERE track_id IS NOT NULL`), '1');
  const stateAfterFirstPass = psql(DB_NAME, `SELECT json_build_object('tracks',(SELECT count(*) FROM tracks),'modules',(SELECT count(*) FROM modules),'lesson_modules',(SELECT count(*) FROM lessons WHERE module_id IS NOT NULL),'enrollments',(SELECT count(*) FROM enrollments WHERE track_id IS NOT NULL))`);
  run(BACKFILL);
  assert.equal(psql(DB_NAME, `SELECT json_build_object('tracks',(SELECT count(*) FROM tracks),'modules',(SELECT count(*) FROM modules),'lesson_modules',(SELECT count(*) FROM lessons WHERE module_id IS NOT NULL),'enrollments',(SELECT count(*) FROM enrollments WHERE track_id IS NOT NULL))`), stateAfterFirstPass);
  assert.deepEqual(legacySnapshot(), before);
});

test('la restauration annule le backfill sans toucher aux donnees historiques', () => {
  const before = legacySnapshot();
  run(ROLLBACK);
  assert.deepEqual(legacySnapshot(), before);
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM tracks WHERE slug='formation-ia'`), '0');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM lessons WHERE module_id IS NOT NULL`), '0');
  assert.equal(psql(DB_NAME, `SELECT count(*) FROM enrollments WHERE track_id IS NOT NULL`), '0');
});

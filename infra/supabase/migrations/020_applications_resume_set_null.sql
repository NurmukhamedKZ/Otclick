-- applications.resume_id FK had no ON DELETE clause (NO ACTION) → blocked
-- resume deletes during sync after reconnecting a new hh account (the new
-- account's resume ids differ, so old resumes get deleted, but old
-- applications still reference them → 23503 FK violation).
-- Switch to ON DELETE SET NULL: keep application history, null the dead ref.
alter table applications drop constraint if exists applications_resume_id_fkey;
alter table applications
  add constraint applications_resume_id_fkey
  foreign key (resume_id) references resumes(id) on delete set null;

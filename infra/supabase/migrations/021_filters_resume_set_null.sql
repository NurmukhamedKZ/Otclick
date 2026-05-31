-- filters.resume_id was ON DELETE CASCADE → reconnecting a new hh account
-- (sync deletes the old account's resumes) silently cascade-deleted the user's
-- filters. Switch to ON DELETE SET NULL: the filter survives, just loses its
-- resume binding so the user can re-point it at a resume from the new account.
-- has_active_filter() requires a non-null resume_id, so a nulled filter stays
-- dormant until rebound.
alter table filters drop constraint if exists filters_resume_id_fkey;
alter table filters
  add constraint filters_resume_id_fkey
  foreign key (resume_id) references resumes(id) on delete set null;

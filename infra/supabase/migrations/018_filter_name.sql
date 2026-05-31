-- Optional user-given filter name (UI falls back to derived title when null)
alter table filters add column if not exists name text;

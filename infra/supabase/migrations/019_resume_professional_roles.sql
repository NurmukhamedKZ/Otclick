-- hh professional_role ids from the resume, used to seed a new filter's search
-- so a bare filter narrows to the candidate's profession (not all vacancies).
alter table resumes add column if not exists professional_roles int[];

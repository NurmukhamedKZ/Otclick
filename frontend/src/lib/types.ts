export type Resume = {
  id: string;
  hh_resume_id: string;
  title: string | null;
  status: string | null;
  synced_at: string | null;
};

export type ResumesList = { items: Resume[] };

export type Filter = {
  id: string;
  resume_id: string | null;
  text: string | null;
  area: number | null;
  salary_min: number | null;
  experience: string | null;
  schedule: string | null;
  employment: string | null;
  professional_role: number[] | null;
  excluded_regex: string | null;
  enabled: boolean;
  created_at: string | null;
};

export type FilterCreate = {
  resume_id?: string | null;
  text?: string | null;
  area?: number | null;
  salary_min?: number | null;
  experience?: string | null;
  schedule?: string | null;
  employment?: string | null;
  excluded_regex?: string | null;
  enabled?: boolean;
};

export type VacancyPreviewItem = {
  id: string | null;
  name: string | null;
  employer: string | null;
  area: string | null;
  salary: Record<string, unknown> | null;
  url: string | null;
};

export type FilterPreview = {
  found: number;
  items: VacancyPreviewItem[];
};

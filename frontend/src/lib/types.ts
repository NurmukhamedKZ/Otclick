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

export type WorkerStatus = {
  state: "running" | "paused_captcha" | "paused_limit" | "stopped";
  today_count: number;
  daily_limit: number;
  queued: number;
  next_run_at: string | null;
  last_error: string | null;
};

export type WorkerStartResponse = {
  state: string;
  queued: number;
};

export type WorkerStopResponse = {
  stopped: boolean;
};

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

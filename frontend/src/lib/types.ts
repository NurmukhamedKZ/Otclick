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
  skipped_has_test: number;
};

export type WorkerStartResponse = {
  state: string;
  queued: number;
};

export type WorkerStopResponse = {
  stopped: boolean;
};

export type Application = {
  id: string;
  user_id: string;
  resume_id: string | null;
  vacancy_id: string;
  employer_id: string | null;
  status: string;
  cover_letter: string | null;
  applied_at: string | null;
  error: string | null;
  created_at: string;
};

export type CaptchaRequest = {
  id: string;
  user_id: string;
  storage_path: string | null;
  captcha_url: string | null;
  solved: boolean;
  created_at: string;
  solved_at: string | null;
};

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

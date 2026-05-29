# AI Vacancy Relevance Filter — Design

**Date:** 2026-05-29
**Status:** Approved (pending spec review)

## Problem

The worker applies to vacancies that don't match the candidate's resume. Example:
an AI engineer's bot sent applications to "Android Developer" and "Sales Manager"
roles. Mechanical filters (`text`, `professional_role`, `excluded_regex`) don't
catch semantic mismatches.

## Goal

Add a semantic relevance check that drops clearly-irrelevant vacancies before they
reach the apply queue. Layered on top of existing mechanical filters — does not
replace them. Per-filter toggle, batched LLM call, cached verdicts.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Granularity | Batch (1 LLM call per search page, ≤50 vacancies) — not per-vacancy |
| Signal | `name` + `snippet` (requirement / responsibility) from search payload |
| Rejected handling | Silent skip — not queued, no `applications` row; reason logged + cached |
| Cache | New table `relevance_cache`, keyed `(resume_id, vacancy_id)` |
| Toggle | Per-filter `filters.ai_filter_enabled`, default `true` |
| Strictness | Conservative — drop only clear mismatches; when in doubt, keep |
| Failure mode | Fail-open — empty key / parse error / exception → keep all |

## Architecture

### Hook point

`vacancy_producer.produce_jobs`, per search page, AFTER existing dedup /
blacklist / `excluded_regex` checks, BEFORE `queue.put`. Runs only for filters
where `ai_filter_enabled = true`.

The current per-item loop queues inline. Restructure the per-page loop to:

1. Collect items surviving the mechanical checks into a candidate list.
2. Read `relevance_cache` for `(resume_id, candidate vacancy_ids)` → split into
   cached vs uncached.
3. Uncached → one batch LLM call → verdicts → write back to `relevance_cache`.
4. Queue only the relevant (cached-relevant + new-relevant). Drop irrelevant.

Per-page batch is ≤ `PER_PAGE` (50) = at most one LLM call per page.

### New module: `services/relevance.py`

```python
async def filter_relevant(
    llm, resume_summary: str, items: list[dict]
) -> dict[str, tuple[bool, str]]:
    """Return {vacancy_id: (relevant, reason)} for each input item.

    items carry {id, name, snippet_requirement, snippet_responsibility}.
    One batched LLM call. Conservative: drop only clear mismatches.
    Fail-open: no llm / parse error / exception → all relevant, reason="fail_open".
    """
```

- Input fields all come from the existing search payload — no extra hh fetch.
- Prompt: resume summary + numbered list of candidates → LLM returns JSON
  listing irrelevant ids with a short reason. Builder lives in `ai/prompts.py`
  (`build_relevance_prompt`), consistent with the other prompt builders.
- Parsing is defensive: any item not explicitly marked irrelevant defaults to
  relevant (conservative). Malformed JSON → fail-open (all relevant).

### Centralized AI: route through `HHAgent`

Per the centralized-AI rule, no per-call LLM construction. Add to `ai/agent.py`:

```python
async def filter_relevant_vacancies(
    self, resume_id: str, items: list[dict]
) -> dict[str, tuple[bool, str]]:
    """Relevance verdicts grounded in the filter's resume summary."""
```

- Grounds in the resume summary for that filter's `resume_id` (each filter has
  its own resume). Resume summaries cached per `resume_id` on the agent
  (mirrors the existing `_full_resumes` / `_resume_summary` caching), since the
  producer may process multiple filters with different resumes in one run.
- Reuses `form_filler.load_resume(user_id, resume_id)` + `_resume_summary`.
- Empty `OPENAI_API_KEY` → `self.llm is None` → returns all-relevant (fail-open).

`produce_jobs` signature gains the agent: `produce_jobs(user_id, agent: HHAgent)`.
The runner already owns one per user — `runner.py:246` passes `handle.agent`.

### Cache table — migration `015_relevance_cache.sql`

```sql
create table if not exists relevance_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  resume_id uuid references resumes(id) on delete cascade,
  vacancy_id text not null,
  relevant bool not null,
  reason text,
  created_at timestamptz default now(),
  unique (resume_id, vacancy_id)
);

create index if not exists relevance_cache_lookup
  on relevance_cache (resume_id, vacancy_id);

alter table relevance_cache enable row level security;
-- service_role only; no policies (full RLS denial), matching form_drafts.
```

- Keyed `(resume_id, vacancy_id)`: relevance depends on resume content, not the
  user. `unique` constraint enables upsert and one-LLM-call-per-vacancy-ever.
- `reason` stored for debug/audit only — not surfaced in the UI.

Same migration adds the toggle column:

```sql
alter table filters add column if not exists ai_filter_enabled bool default true;
```

Default `true` so the active pain is fixed without manual opt-in; user can
disable per filter.

### Toggle plumbing

- `vacancy_producer._load_enabled_filters`: add `ai_filter_enabled` to the select.
- `filters_service._FILTER_COLUMNS`: add `ai_filter_enabled`.
- `schemas/filters.py`: add `ai_filter_enabled: bool` to `FilterCreate`
  (default `True`), `FilterUpdate` (optional), `FilterResponse` (default `True`).
- Frontend `lib/types` `Filter`: add `ai_filter_enabled: boolean`.
- `components/filters-drawer.tsx` `FilterEditor`: add a `Toggle`
  ("AI-фильтр релевантности") wired to `commit({ ai_filter_enabled })`.

### Rejected handling

Silent skip: irrelevant vacancies are not queued and get no `applications` row.
The verdict + reason live in `relevance_cache` and a producer log line. No new
application status, no UI surface.

## Data flow

```
produce_jobs(user_id, agent)
  for each enabled filter (with resume_id):
    for each search page:
      items = search(filter params)
      survivors = items - already_applied - blacklisted - relations - regex_excluded
      if filter.ai_filter_enabled and survivors:
        cached = relevance_cache.get(resume_id, [v.id for v in survivors])
        uncached = survivors not in cached
        verdicts = agent.filter_relevant_vacancies(resume_id, uncached)   # 1 LLM call
        relevance_cache.upsert(resume_id, verdicts)
        survivors = [v for v in survivors if (cached|verdicts)[v.id].relevant]
      queue.put(each survivor)
```

## Error handling

- LLM unavailable / errors / malformed output → fail-open (keep all). The worker
  never blocks on the relevance filter.
- Cache read/write failures → log + proceed (treat as cache miss; never crash).
- `ai_filter_enabled = false` → skip the whole relevance step for that filter.

## Testing

- `tests/test_relevance.py`
  - parses verdicts from well-formed LLM JSON.
  - conservative default: item absent from response → relevant.
  - fail-open on malformed JSON.
  - fail-open when `llm is None` (empty key).
- `tests/test_vacancy_producer.py` (extend)
  - drops irrelevant survivors; queues relevant only.
  - cache hit → no LLM call for cached vacancies.
  - `ai_filter_enabled = false` → relevance step bypassed entirely.

Tests are unit-level with mocked Supabase (fluent `MagicMock`) and a stub `llm`,
following the existing test conventions.

## Out of scope

- No UI for viewing/overriding rejected vacancies (silent skip by decision).
- No per-vacancy full-description fetch (search snippet is sufficient).
- No new env/config (reuses `OPENAI_MODEL` and the shared rate-limited LLM).
- No tuning of mechanical filters / `excluded_regex` behavior.

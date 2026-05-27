# Cover Letter Indicator — Design

**Date:** 2026-05-27

## Goal

Show in the dashboard and the applications list when the AI wrote a cover letter,
mirroring how form-filler answers (`form_answers`) are already surfaced.

## Scope

Frontend only. No backend, schema, or worker changes.

`cover_letter` already persists on the `applications` table and is already declared
on the `Application` type (`frontend/src/lib/types.ts:101`). The data exists — this
is purely about displaying it.

Two files change:
- `frontend/src/app/(app)/applications/page.tsx`
- `frontend/src/app/(app)/dashboard/recent-applications-card.tsx`

## Indicator condition

Show the indicator when `cover_letter` is non-empty after trimming
(`(a.cover_letter ?? "").trim().length > 0`).

This fires across multiple statuses — `sent`, `captcha`, `skipped`, `failed` —
anywhere `response_letter_required` was true and the AI generated text (see
`backend/app/services/apply.py`: `cover_letter` is recorded on those paths).

Form-test answers and a cover letter are mutually exclusive per application: the
form path (`has_test`) returns before the letter path runs. So a row shows at most
one expandable section — never both.

## Applications page (`applications/page.tsx`)

Mirror the existing `form_answers` pattern:

- Under the vacancy cell, where the `тест · N вопр.` toggle renders today, add a
  parallel toggle `▸ AI письмо` / `▾ AI письмо` shown when `cover_letter` is present.
  Same styling as the form toggle (coral, 11px, font-weight 600).
- Reuse the existing `openId` expand state. Since a row has either form answers or a
  cover letter (never both), one `openId` per row is sufficient.
- When expanded, render the cover letter text in a panel matching the existing
  expanded form panel (`var(--bg-deep)` background, same padding/border). Preserve
  the letter's line breaks with `whiteSpace: "pre-wrap"`.

## Dashboard card (`recent-applications-card.tsx`)

Rows here are compact (avatar, vacancy link, status tag, time) with no expand
affordance. Keep it compact:

- Add a small `✎ AI` tag (`Tag` component, `neutral` tone) on rows where
  `cover_letter` is present, placed near the status tag.
- It signals only that a letter was written. Full text is read on the Applications
  page.

## Verification

- A row with a cover letter shows the expandable `AI письмо` toggle on the
  Applications page and reveals the full text when clicked.
- The same row shows the `✎ AI` badge on the dashboard card.
- Form-test rows (`form_answers`) still render their `тест · N вопр.` toggle
  unchanged.
- `npm run build` / typecheck passes clean.

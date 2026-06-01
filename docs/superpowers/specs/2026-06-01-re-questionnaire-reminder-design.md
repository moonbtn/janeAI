# Re-Questionnaire & Hired Reminder — Design Spec

**Date:** 2026-06-01

## Problem

After a recruiter posts a job, if hiring fails after ~1 month, they need to re-engage the hiring manager (sếp) with an updated questionnaire. The current app has no way to re-send a questionnaire or track whether a position was filled.

## Scope

1. Recruiter can manually send a new questionnaire for an existing JD (pre-filled from previous answers)
2. App reminds recruiter after 30 days if a JD is still active — prompting them to mark hired or re-send questionnaire
3. JD history splits into "đang tuyển" (active) and "đã tuyển xong" (hired)

Out of scope: email reminders, notification history/inbox, multi-round tracking beyond status.

---

## Data Changes

### `jd_history` table
Add column:
```
status: 'active' | 'hired'   default: 'active'
```

No new tables needed. The reminder logic is computed on-the-fly from existing `questionnaires` + `questionnaire_answers` data.

---

## Feature 1: Re-send Questionnaire

**Trigger:** Recruiter clicks "Gửi bảng hỏi mới" button on any JD card in history.

**Flow:**
1. Frontend calls `POST /api/questionnaire/generate` with an additional `prefill_from_questionnaire_id` param
2. API fetches the latest `questionnaire_answers` for that questionnaire → passes answers as `prefilled_answers` in the new questionnaire row
3. New questionnaire is created (same `jd_history_id`, new token, `status: 'pending'`)
4. Recruiter gets the new link — shares with sếp as usual

**Sếp-side:** `QuestionnaireWizard` detects `prefilled_answers` is non-empty → shows a banner at the top:
> "Bảng hỏi này đã được điền sẵn từ lần trước — vui lòng xem lại và cập nhật nếu có thay đổi"

Fields are pre-populated; sếp edits only what changed and submits.

---

## Feature 2: 1-Month In-App Reminder

**Trigger:** On app page load, client calls a new API `GET /api/reminders` which returns JDs needing attention.

**Logic (server-side):**
- Fetch all `jd_history` for the user where `status = 'active'`
- For each JD, find the latest `questionnaire_answers.submitted_at`
- If `submitted_at` is ≥ 30 days ago (and there's no newer pending questionnaire) → include in reminder list

**UI:** For each reminded JD, show a dismissible banner above the main content:
> "**[Job title]** — đã 1 tháng rồi, tuyển được chưa?"

Two action buttons:
- **Đã tuyển xong** → `PATCH /api/jd-history/[id]/status` with `{ status: 'hired' }` → dismiss banner
- **Gửi bảng hỏi mới** → triggers Feature 1 flow → dismiss banner

Banners are dismissed in local state only (no persistence needed — if recruiter ignores and reloads, it reappears until they act).

---

## Feature 3: JD History Status Split

The history panel (`showHistory` section in `app/page.tsx`) separates JDs into two groups:
- **Đang tuyển** — `status = 'active'`
- **Đã tuyển xong** — `status = 'hired'`

Collapsed by default for "đã tuyển xong" to keep the UI clean.

---

## API Surface

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/questionnaire/generate` | Extended with `prefill_from_questionnaire_id` param |
| `GET` | `/api/reminders` | Returns JDs needing 30-day follow-up |
| `PATCH` | `/api/jd-history/[id]/status` | Update `status` to `'hired'` |

---

## Error Handling

- If no previous answers exist when generating a new questionnaire, treat as a fresh questionnaire (no prefill, no banner)
- If `PATCH` to mark hired fails, show inline error on the banner button; do not dismiss
- Reminders API failure is silent — app loads normally without banners

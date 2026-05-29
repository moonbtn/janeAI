# Design: Questionnaire Language Selection

**Date:** 2026-05-27  
**Status:** Approved

## Problem

Hiring managers who are foreigners receive the questionnaire link and see everything in Vietnamese — unusable. Recruiter knows in advance whether the hiring manager is Vietnamese or foreign, so they should choose the language at generation time.

## Approach

Generate the questionnaire directly in the chosen language (VI or EN) by passing a `language` parameter to the AI prompt. No translation step needed — AI writes natively in the target language.

If recruiter needs both languages, they generate twice and get two separate links.

## Design

### 1. Recruiter UI — `/src/app/app/page.tsx`

- Add a VN / EN toggle beside the "Tạo bảng hỏi" button
- Default: `vi`
- Selected language is stored in local state (`language: 'vi' | 'en'`)
- Passed as `language` in the body of the `/api/questionnaire/generate` POST request
- When a link is shown, display a small badge `[VN]` or `[EN]` next to it so recruiter knows which is which

### 2. Generate API — `/src/app/api/questionnaire/generate/route.ts`

- Accept `language: 'vi' | 'en'` in the request body (default `'vi'` if missing)
- If `language === 'en'`: replace the Vietnamese system prompt with an English-language equivalent — question texts, options, and prefilled_answers all in English
- Store `language` in the `questionnaires` Supabase row

### 3. Database — `questionnaires` table

- Add column: `language text NOT NULL DEFAULT 'vi'`
- Allowed values: `'vi'`, `'en'`

### 4. Token API — `/src/app/api/q/[token]/route.ts`

- Include `language` in the JSON response returned to the questionnaire page

### 5. Questionnaire Page — `/src/app/q/[token]/page.tsx`

- Pass `language` from API response down to `QuestionnaireWizard` as a prop

### 6. QuestionnaireWizard — `/src/components/QuestionnaireWizard.tsx`

- Accept `language: 'vi' | 'en'` prop
- Replace hardcoded Vietnamese strings with a `t()` lookup object keyed by language:
  - `PAGE_LABELS`: "Bối cảnh tuyển dụng" → "Recruitment Context", etc.
  - `SECTION_LABELS`: "Outcome of the job", etc. (already in English — no change needed)
  - Buttons: "Tiếp theo →" → "Next →", "Quay lại" → "Back", "Đang gửi..." → "Sending...", "Gửi xác nhận →" → "Submit →"
  - `skill_matrix` add button: "+ Thêm" → "+ Add", placeholder text
  - `skill_matrix` level badges: `'Bắt buộc'` → `'Required'`, `'Có thì tốt'` → `'Nice to have'` (these are hardcoded in the component, not from DB)
  - Prefill note: "✦ Jane gợi ý — nhấn để sửa" → "✦ Jane's suggestion — tap to edit"
  - Amber hint text, footer note, success screen text

## Files Changed

| File | Change |
|------|--------|
| `src/app/app/page.tsx` | Add language toggle UI + pass to API |
| `src/app/api/questionnaire/generate/route.ts` | Accept `language`, switch prompt, store in DB |
| `src/app/api/q/[token]/route.ts` | Return `language` in response |
| `src/app/q/[token]/page.tsx` | Pass `language` to QuestionnaireWizard |
| `src/components/QuestionnaireWizard.tsx` | Accept `language` prop, translate all UI strings |
| Supabase migration | Add `language` column to `questionnaires` |

## Out of Scope

- Landing page language toggle (separate feature)
- More than 2 languages
- Hiring manager switching language after opening the link

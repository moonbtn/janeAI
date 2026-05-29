# Questionnaire Language Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recruiter chọn ngôn ngữ (VN/EN) khi tạo bảng hỏi — AI generate thẳng bằng ngôn ngữ đó, hiring manager nhận link và thấy đúng ngôn ngữ.

**Architecture:** Thêm `language` param vào generate API, AI sinh câu hỏi bằng ngôn ngữ được chọn, lưu vào DB. Token API trả về `language`, `QuestionnaireWizard` dùng để render đúng UI labels. Recruiter chọn VN/EN trong app trước khi nhấn "Tạo bảng hỏi".

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres), Anthropic Claude API, TypeScript, Tailwind CSS

---

## File Map

| File | Thay đổi |
|------|----------|
| `src/lib/supabase.ts` | Thêm `language` vào type `Questionnaire` |
| `src/app/api/questionnaire/generate/route.ts` | Nhận `language`, chọn prompt EN/VI, lưu `language` vào DB |
| `src/app/api/q/[token]/route.ts` | Select thêm `language`, trả về trong response |
| `src/app/q/[token]/page.tsx` | Pass `language` xuống `QuestionnaireWizard` |
| `src/components/QuestionnaireWizard.tsx` | Nhận `language` prop, translate toàn bộ UI strings |
| `src/app/app/page.tsx` | Thêm VN/EN toggle, pass vào API, show badge trên link |

---

## Task 1: Cập nhật type `Questionnaire` trong supabase.ts

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Thêm `language` vào type Questionnaire**

Mở `src/lib/supabase.ts`, tìm type `Questionnaire` (dòng 33-43), sửa thành:

```typescript
export type Questionnaire = {
  id: string
  jd_history_id: string
  token: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  status: 'pending' | 'answered'
  language: 'vi' | 'en'
  expires_at: string
  created_at: string
}
```

- [ ] **Step 2: Thêm cột `language` vào bảng Supabase**

Vào Supabase Dashboard → SQL Editor, chạy:

```sql
ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'vi'
CHECK (language IN ('vi', 'en'));
```

- [ ] **Step 3: Verify**

Chạy query kiểm tra:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'questionnaires' AND column_name = 'language';
```

Expected: trả về 1 row với `column_default = 'vi'`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add language field to Questionnaire type and DB schema"
```

---

## Task 2: Cập nhật generate API để nhận `language` và dùng prompt phù hợp

**Files:**
- Modify: `src/app/api/questionnaire/generate/route.ts`

- [ ] **Step 1: Nhận `language` từ request body**

Tìm dòng:
```typescript
const { jdText, jobTitle: providedTitle } = await req.json()
```
Sửa thành:
```typescript
const { jdText, jobTitle: providedTitle, language = 'vi' } = await req.json() as {
  jdText: string
  jobTitle?: string
  language?: 'vi' | 'en'
}
```

- [ ] **Step 2: Thêm hàm `buildPrompt` ngay trước hàm `POST`**

```typescript
function buildPrompt(jdText: string, providedTitle: string | undefined, language: 'vi' | 'en'): string {
  if (language === 'en') {
    return `You are a recruitment expert. Based on the following JD, please:
1. ${providedTitle ? `Use the provided job title: "${providedTitle}" (no need to re-extract)` : 'Extract the job title (jobTitle)'}
2. Create a 7-section questionnaire for the HIRING MANAGER (direct supervisor), NOT HR

Questions must cover things the hiring manager knows and decides: reason for opening the role, actual criteria, team culture, interview schedule, team highlights. Do NOT ask about insurance packages, training budget (that is HR's responsibility).

**JD:**
${jdText}

Return JSON in exactly this format, no additional text:

{
  "jobTitle": "Senior Frontend Developer",
  "questions": [
    {
      "id": "outcome_1",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "What problem does this role solve?",
      "type": "open",
      "aiPrefilled": true
    },
    {
      "id": "outcome_2",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "How urgent is this hire?",
      "type": "yes_no",
      "options": ["Urgent — need someone within 1 month", "Normal — 2-3 months"],
      "aiPrefilled": true
    }
  ],
  "prefilled_answers": {
    "outcome_1": "This role was opened to...",
    "outcome_2": "Normal — 2-3 months",
    "req_2": [
      {"skill": "React", "level": "MUST"},
      {"skill": "TypeScript", "level": "MUST"},
      {"skill": "Next.js", "level": "NICE"}
    ]
  }
}

IMPORTANT — skill_matrix type: prefilled_answers for skill_matrix MUST be an array of objects: [{"skill": "Skill name", "level": "MUST"}, ...]. Do NOT use strings, do NOT leave empty. Level must be "MUST" or "NICE" only. Pick at most 5 most important skills from the JD.

Create all 7 sections as follows:
- Section 1 (Outcome): 3 questions — problem solved (open, aiPrefilled), urgency (yes_no, aiPrefilled), confidential (yes_no, options: ["Open recruitment — public posting", "Confidential — no public posting"], NOT aiPrefilled, question text: "Is this a public or confidential search?")
- Section 2 (History): 2 questions — how long has the search been ongoing (multiple_choice, options: ["Brand new role","1-2 months","3+ months"]), have candidates been interviewed and why not hired yet (open)
- Section 3 (Requirements): 2-3 questions depending on JD:
  + open, aiPrefilled: "The JD states [X] years of experience — how flexible is that? What is the real minimum?" (replace [X] with actual number from JD, pre-fill with a comment based on JD context)
  + open, aiPrefilled, ONLY if JD mentions management/leadership experience: "The JD requires [Y] years of management experience — is this mandatory? What is the real minimum?" (replace [Y] with actual number). If JD does NOT mention management, skip this question.
  + skill_matrix, aiPrefilled (tech stack from JD)
  + multiple_choice, aiPrefilled, question text: "English proficiency required", options: ["Basic — can read technical docs","Conversational — can communicate with foreign colleagues","Fluent / Bilingual — write emails, present, lead meetings"]
- Section 4 (Culture fit): 4 questions — 3 trait pairs as yes_no (NOT aiPrefilled, manager decides), 1 open question at the end:
  + yes_no, text: "Working style", options: ["Frequent check-ins with manager", "Works independently, reports when needed"]
  + yes_no, text: "Approach to work", options: ["Follows clear instructions", "Proactively identifies problems and proposes solutions"]
  + yes_no, text: "Work environment fit", options: ["Stable, few priority changes", "Flexible, comfortable with fast-changing priorities"]
  + open, text: "Anything else you're looking for in candidates?", NOT aiPrefilled
- Section 5 (Package): 2 questions — salary and title flexibility (yes_no, fixed text: "Is the salary and title flexible for an exceptional candidate?", fixed options: ["Yes — flexible for the right person", "No — budget and title are fixed"], aiPrefilled based on JD context), team highlight (open)
- Section 6 (Interview process): 3 questions — number of rounds (multiple_choice, options: ["2 rounds","3 rounds","4+ rounds"]), technical test (multiple_choice, options: ["Yes — take-home assignment","No test"]), available schedule (open)
- Section 7 (USP): 3 questions — all aiPrefilled: true, pre-fill based on JD content:
  + open, aiPrefilled: "Why should a strong candidate choose your team over another offer?"
  + open, aiPrefilled: "What career growth opportunities will this person have in 1-2 years?"
  + open, aiPrefilled: "What is the biggest challenge of this role?"

Pre-fill all questions with aiPrefilled: true based on information in the JD.

IMPORTANT — prefilled_answers must be SHORT: max 1-2 sentences, written as a manager's direct answer — not an explanation, not repeating the question. Example correct: "Minimum 6 years, flexible with strong background". Example wrong: "The JD requires 8+ years for this senior role, please confirm with hiring manager..."

LANGUAGE: All content — question texts, options, and prefilled_answers — must be written in natural, professional English. Technical tool names (React, Python, SQL, etc.) are fine as-is.`
  }

  // Default: Vietnamese prompt (existing prompt)
  return `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy:
1. ${providedTitle ? `Dùng tên vị trí đã cho: "${providedTitle}" (không cần extract lại)` : 'Extract tên vị trí tuyển dụng (jobTitle)'}
2. Tạo bảng hỏi 7 nhóm dành cho HIRING MANAGER (sếp trực tiếp), KHÔNG phải HR

Câu hỏi phải là những gì sếp biết và quyết định được: lý do mở vị trí, tiêu chí thực sự, văn hoá team, lịch phỏng vấn, điểm đặc biệt của team. KHÔNG hỏi về gói bảo hiểm, training budget (đó là việc HR).

**JD:**
${jdText}

Trả về JSON theo đúng format sau, không thêm bất kỳ text nào khác:

{
  "jobTitle": "Senior Frontend Developer",
  "questions": [
    {
      "id": "outcome_1",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Vị trí này được tạo ra để giải quyết vấn đề gì?",
      "type": "open",
      "aiPrefilled": true
    },
    {
      "id": "outcome_2",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Mức độ urgent?",
      "type": "yes_no",
      "options": ["Gấp — cần người trong 1 tháng", "Bình thường — 2-3 tháng"],
      "aiPrefilled": true
    }
  ],
  "prefilled_answers": {
    "outcome_1": "Lý do mở vị trí dựa trên JD...",
    "outcome_2": "Bình thường — 2-3 tháng",
    "req_2": [
      {"skill": "React", "level": "MUST"},
      {"skill": "TypeScript", "level": "MUST"},
      {"skill": "Next.js", "level": "NICE"}
    ]
  }
}

LƯU Ý QUAN TRỌNG: Câu loại skill_matrix PHẢI được pre-fill trong prefilled_answers dưới dạng array of objects: [{"skill": "Tên kỹ năng", "level": "MUST"}, ...]. KHÔNG dùng string, KHÔNG bỏ trống. Mức level chỉ dùng "MUST" hoặc "NICE". Chỉ chọn TỐI ĐA 5 kỹ năng quan trọng nhất từ JD — không liệt kê hết tất cả.

Tạo đủ 7 nhóm theo cấu trúc:
- Section 1 (Outcome): 3 câu — vấn đề cần giải quyết (open, aiPrefilled), urgent (yes_no, aiPrefilled), confidential (yes_no, options: ["Tuyển công khai bình thường", "Confidential — không đăng public, tuyển kín"], KHÔNG aiPrefilled — để sếp tự chọn, text câu hỏi: "Vị trí này tuyển công khai hay confidential?")
- Section 2 (History): 2 câu — tuyển bao lâu (multiple_choice, options: ["Mới mở","1-2 tháng","3+ tháng"]), đã gặp UV chưa lý do chưa chốt (open)
- Section 3 (Requirements): 2-3 câu tùy JD:
  + open, aiPrefilled: "JD nêu [X] năm kinh nghiệm — anh/chị có thể linh hoạt không? Minimum thực tế là bao nhiêu?" (thay [X] bằng số năm thực tế trong JD, pre-fill bằng nhận xét từ JD)
  + open, aiPrefilled, CHỈ THÊM NẾU JD có yêu cầu kinh nghiệm management/leadership: "JD yêu cầu [Y] năm kinh nghiệm management — có bắt buộc không? Nếu có, minimum thực tế là bao nhiêu?" (thay [Y] bằng số năm trong JD). Nếu JD KHÔNG đề cập management thì KHÔNG tạo câu này.
  + skill_matrix, aiPrefilled (tech stack)
  + multiple_choice, aiPrefilled, options: ["Cơ bản — đọc được tài liệu kỹ thuật","Giao tiếp được — trao đổi công việc với người nước ngoài","Thành thạo / Song ngữ — viết email, present, lead meeting"] (tiếng Anh)
- Section 4 (Culture fit): 4 câu — 3 cặp trait dạng yes_no (KHÔNG aiPrefilled, sếp tự chọn), 1 câu mở cuối:
  + yes_no, text: "Phong cách làm việc", options: ["Check-in thường xuyên với sếp", "Tự xử lý, báo cáo khi cần"]
  + yes_no, text: "Cách tiếp cận công việc", options: ["Làm theo yêu cầu rõ ràng", "Tự tìm hiểu vấn đề và đề xuất hướng giải quyết"]
  + yes_no, text: "Môi trường phù hợp", options: ["Ổn định, ít thay đổi ưu tiên", "Linh hoạt, chịu được thay đổi nhanh"]
  + open, text: "Còn điều gì khác anh/chị muốn ở ứng viên?", KHÔNG aiPrefilled
- Section 5 (Package): 2 câu — lương và title flex (yes_no, text cố định: "Mức lương và title có linh hoạt không nếu gặp ứng viên xuất sắc?", options cố định: ["Có — linh hoạt nếu gặp ứng viên thực sự tốt", "Không — budget và title đã cố định"], aiPrefilled: chọn 1 trong 2 option tuỳ theo ngữ cảnh JD), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — text câu hỏi cố định, TẤT CẢ đều aiPrefilled: true, pre-fill dựa trên thông tin trong JD:
  + open, aiPrefilled: "Tại sao một ứng viên giỏi nên chọn team anh/chị thay vì offer khác?"
  + open, aiPrefilled: "Trong 1-2 năm tới, người vào vị trí này có cơ hội phát triển như thế nào?"
  + open, aiPrefilled: "Thách thức lớn nhất của vị trí này là gì?"

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.

QUAN TRỌNG về prefilled_answers: Phải NGẮN GỌN, tối đa 1-2 câu, viết như câu trả lời của sếp — không phải giải thích, không lặp lại câu hỏi, không nói "cần xác nhận với HM". Ví dụ đúng: "Minimum 6 năm, linh hoạt nếu background tốt". Ví dụ sai: "JD yêu cầu 8+ năm, đây là vị trí cấp cao nên cần xác nhận với hiring manager..."

NGÔN NGỮ: Tất cả prefilled_answers phải viết HOÀN TOÀN bằng tiếng Việt. Không dùng từ tiếng Anh trừ tên kỹ thuật/tool (React, Python, SQL, v.v.). Không dùng "flexible", "senior", "junior", "budget", "open", "priority", "urgent" hay bất kỳ từ tiếng Anh thông thường nào — thay bằng tiếng Việt tương đương.`
}
```

- [ ] **Step 3: Dùng `buildPrompt` trong `POST` handler**

Tìm đoạn gọi `client.messages.create`, thay nội dung `content` bằng:

```typescript
const message = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 6000,
  messages: [
    {
      role: 'user',
      content: buildPrompt(jdText, providedTitle, language),
    },
  ],
})
```

(Xoá toàn bộ template string cũ bên trong `content`.)

- [ ] **Step 4: Lưu `language` vào DB khi insert questionnaire**

Tìm đoạn insert vào bảng `questionnaires`:
```typescript
.insert({
  jd_history_id: jdRecord.id,
  questions: parsed.questions,
  prefilled_answers: parsed.prefilled_answers,
})
```
Sửa thành:
```typescript
.insert({
  jd_history_id: jdRecord.id,
  questions: parsed.questions,
  prefilled_answers: parsed.prefilled_answers,
  language,
})
```

- [ ] **Step 5: Verify thủ công**

Mở app, paste một JD, chọn EN, nhấn "Tạo bảng hỏi". Kiểm tra trong Supabase Dashboard → Table Editor → `questionnaires`: row mới phải có `language = 'en'` và câu hỏi phải bằng tiếng Anh.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/questionnaire/generate/route.ts
git commit -m "feat: generate questionnaire in chosen language (vi/en)"
```

---

## Task 3: Token API trả về `language`

**Files:**
- Modify: `src/app/api/q/[token]/route.ts`

- [ ] **Step 1: Thêm `language` vào select query**

Tìm dòng:
```typescript
.select('id, questions, prefilled_answers, status, expires_at')
```
Sửa thành:
```typescript
.select('id, questions, prefilled_answers, status, expires_at, language')
```

- [ ] **Step 2: Trả về `language` trong response**

Tìm:
```typescript
return NextResponse.json({
  id: data.id,
  questions: data.questions,
  prefilled_answers: data.prefilled_answers,
})
```
Sửa thành:
```typescript
return NextResponse.json({
  id: data.id,
  questions: data.questions,
  prefilled_answers: data.prefilled_answers,
  language: (data.language ?? 'vi') as 'vi' | 'en',
})
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/q/[token]/route.ts
git commit -m "feat: include language in questionnaire token API response"
```

---

## Task 4: Questionnaire page pass `language` xuống wizard

**Files:**
- Modify: `src/app/q/[token]/page.tsx`

- [ ] **Step 1: Cập nhật type của response và pass `language` vào QuestionnaireWizard**

Tìm đoạn:
```typescript
const data = await res.json() as {
  id: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
}

return (
  <QuestionnaireWizard
    questionnaireId={data.id}
    token={token}
    questions={data.questions}
    prefilledAnswers={data.prefilled_answers}
  />
)
```
Sửa thành:
```typescript
const data = await res.json() as {
  id: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  language: 'vi' | 'en'
}

return (
  <QuestionnaireWizard
    questionnaireId={data.id}
    token={token}
    questions={data.questions}
    prefilledAnswers={data.prefilled_answers}
    language={data.language ?? 'vi'}
  />
)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/q/[token]/page.tsx
git commit -m "feat: pass language prop to QuestionnaireWizard"
```

---

## Task 5: QuestionnaireWizard — nhận language prop và dịch UI strings

**Files:**
- Modify: `src/components/QuestionnaireWizard.tsx`

- [ ] **Step 1: Thêm `language` vào Props type**

Tìm:
```typescript
type Props = {
  questionnaireId: string
  token: string
  questions: Question[]
  prefilledAnswers: Record<string, unknown>
}
```
Sửa thành:
```typescript
type Props = {
  questionnaireId: string
  token: string
  questions: Question[]
  prefilledAnswers: Record<string, unknown>
  language?: 'vi' | 'en'
}
```

- [ ] **Step 2: Thêm translation object ngay sau các hằng `PAGE_SECTIONS`, `PAGE_LABELS`, `SECTION_LABELS`**

```typescript
const UI = {
  vi: {
    pageLabels: { 1: 'Bối cảnh tuyển dụng', 2: 'Yêu cầu & văn hoá', 3: 'Quyền lợi & quy trình' } as Record<number, string>,
    headerTitle: 'Xác nhận yêu cầu tuyển dụng',
    prefilledNote: '✦ Jane gợi ý — nhấn để sửa',
    amberHint: 'Jane đã đọc JD và <span class="font-semibold">điền trước</span> một số ô. Anh/chị chỉ cần xem lại và sửa nếu sai.',
    next: 'Tiếp theo →',
    back: '← Quay lại',
    submit: 'Gửi xác nhận →',
    submitting: 'Đang gửi...',
    skillMust: 'Bắt buộc',
    skillNice: 'Có thì tốt',
    addSkillBtn: '+ Thêm',
    addSkillPlaceholder: 'Thêm skill... VD: React, SQL',
    successTitle: 'Đã gửi xác nhận!',
    successDesc: 'Recruiter sẽ nhận được câu trả lời của anh/chị và tinh chỉnh lại JD.',
    footer: 'Không cần tài khoản · Câu trả lời gửi thẳng cho recruiter',
  },
  en: {
    pageLabels: { 1: 'Recruitment Context', 2: 'Requirements & Culture', 3: 'Package & Process' } as Record<number, string>,
    headerTitle: 'Confirm Job Requirements',
    prefilledNote: "✦ Jane's suggestion — tap to edit",
    amberHint: 'Jane has read the JD and <span class="font-semibold">pre-filled</span> some fields. Please review and correct if needed.',
    next: 'Next →',
    back: '← Back',
    submit: 'Submit →',
    submitting: 'Sending...',
    skillMust: 'Required',
    skillNice: 'Nice to have',
    addSkillBtn: '+ Add',
    addSkillPlaceholder: 'Add skill... e.g. React, SQL',
    successTitle: 'Submitted!',
    successDesc: 'The recruiter will receive your answers and refine the JD accordingly.',
    footer: 'No account needed · Answers go directly to the recruiter',
  },
}
```

- [ ] **Step 3: Nhận `language` trong component và lấy `t`**

Tìm dòng destructure props:
```typescript
export default function QuestionnaireWizard({
  token,
  questions,
  prefilledAnswers,
}: Props) {
```
Sửa thành:
```typescript
export default function QuestionnaireWizard({
  token,
  questions,
  prefilledAnswers,
  language = 'vi',
}: Props) {
  const t = UI[language]
```

- [ ] **Step 4: Thay hardcoded strings trong JSX**

Thực hiện lần lượt các thay thế sau trong phần JSX của component:

**4a. Header title:**
```tsx
// Cũ:
<h1 className="text-xl font-bold mt-1">Xác nhận yêu cầu tuyển dụng</h1>
// Mới:
<h1 className="text-xl font-bold mt-1">{t.headerTitle}</h1>
```

**4b. Progress page label:**
```tsx
// Cũ:
<span className="text-xs font-semibold text-indigo-600">
  {PAGE_LABELS[step]}
</span>
// Mới:
<span className="text-xs font-semibold text-indigo-600">
  {t.pageLabels[step]}
</span>
```

**4c. Amber hint (dùng dangerouslySetInnerHTML vì có thẻ `<span>`):**
```tsx
// Cũ:
<p className="text-xs text-amber-700">
  Jane đã đọc JD và <span className="font-semibold">điền trước</span> một số ô. Anh/chị chỉ cần xem lại và sửa nếu sai.
</p>
// Mới:
<p className="text-xs text-amber-700" dangerouslySetInnerHTML={{ __html: t.amberHint }} />
```

**4d. Prefilled note:**
```tsx
// Cũ:
<p className="text-xs text-amber-600">✦ Jane gợi ý — nhấn để sửa</p>
// Mới:
<p className="text-xs text-amber-600">{t.prefilledNote}</p>
```

**4e. skill_matrix labels:**
```tsx
// Cũ:
{([['MUST', 'Bắt buộc'], ['NICE', 'Có thì tốt']] as const).map(([level, label]) => (
// Mới:
{([['MUST', t.skillMust], ['NICE', t.skillNice]] as const).map(([level, label]) => (
```

**4f. skill_matrix add input:**
```tsx
// Cũ:
placeholder="Thêm skill... VD: React, SQL"
// Mới:
placeholder={t.addSkillPlaceholder}
```

**4g. skill_matrix add button:**
```tsx
// Cũ:
>
  + Thêm
</button>
// Mới:
>
  {t.addSkillBtn}
</button>
```

**4h. Back button:**
```tsx
// Cũ:
← Quay lại
// Mới:
{t.back}
```

**4i. Next button:**
```tsx
// Cũ:
Tiếp theo →
// Mới:
{t.next}
```

**4j. Submit button:**
```tsx
// Cũ:
{submitting ? 'Đang gửi...' : 'Gửi xác nhận →'}
// Mới:
{submitting ? t.submitting : t.submit}
```

**4k. Footer note:**
```tsx
// Cũ:
Không cần tài khoản · Câu trả lời gửi thẳng cho recruiter
// Mới:
{t.footer}
```

**4l. Success screen:**
```tsx
// Cũ:
<h2 className="text-xl font-bold text-gray-900 mb-2">Đã gửi xác nhận!</h2>
<p className="text-gray-500 text-sm">Recruiter sẽ nhận được câu trả lời của anh/chị và tinh chỉnh lại JD.</p>
// Mới:
<h2 className="text-xl font-bold text-gray-900 mb-2">{t.successTitle}</h2>
<p className="text-gray-500 text-sm">{t.successDesc}</p>
```

- [ ] **Step 5: Xoá `PAGE_LABELS` cũ (không còn dùng trực tiếp)**

Xoá block:
```typescript
const PAGE_LABELS: Record<number, string> = {
  1: 'Bối cảnh tuyển dụng',
  2: 'Yêu cầu & văn hoá',
  3: 'Quyền lợi & quy trình',
}
```

- [ ] **Step 6: Verify thủ công**

Mở `/q/[token]` của một questionnaire đã tạo bằng tiếng Anh. Kiểm tra:
- Header, buttons, labels đều bằng tiếng Anh
- Câu hỏi bằng tiếng Anh (từ DB)
- Skill matrix hiện "Required" / "Nice to have"

Mở `/q/[token]` của questionnaire tiếng Việt. Kiểm tra không bị vỡ gì.

- [ ] **Step 7: Commit**

```bash
git add src/components/QuestionnaireWizard.tsx
git commit -m "feat: QuestionnaireWizard supports language prop for EN/VI UI"
```

---

## Task 6: Recruiter UI — thêm VN/EN toggle và badge trên link

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Thêm `questionnaireLanguage` state**

Tìm block các useState gần đầu component, thêm vào sau `const [generatingQ, setGeneratingQ]`:
```typescript
const [questionnaireLanguage, setQuestionnaireLanguage] = useState<'vi' | 'en'>('vi')
const [generatedLanguage, setGeneratedLanguage] = useState<'vi' | 'en'>('vi')
```

(`questionnaireLanguage` = ngôn ngữ đang chọn; `generatedLanguage` = ngôn ngữ của link đã tạo, dùng để hiện badge)

- [ ] **Step 2: Pass `language` vào generate API call**

Tìm trong `handleCreateQuestionnaire`:
```typescript
body: JSON.stringify({ jdText: pastedJd, jobTitle: pastedTitle.trim() || undefined }),
```
Sửa thành:
```typescript
body: JSON.stringify({ jdText: pastedJd, jobTitle: pastedTitle.trim() || undefined, language: questionnaireLanguage }),
```

Và ngay sau `setQuestionnaireId(data.id)`, thêm:
```typescript
setGeneratedLanguage(questionnaireLanguage)
```

- [ ] **Step 3: Thêm VN/EN toggle buttons trước nút "Tạo bảng hỏi"**

Tìm đoạn button "Tạo bảng hỏi":
```tsx
<button
  onClick={handleCreateQuestionnaire}
  disabled={generatingQ || !pastedJd.trim()}
  className="w-full bg-indigo-600 ..."
>
```

Thêm toggle VN/EN ngay phía trên button đó:
```tsx
<div className="flex gap-2">
  {(['vi', 'en'] as const).map((lang) => (
    <button
      key={lang}
      onClick={() => setQuestionnaireLanguage(lang)}
      className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
        questionnaireLanguage === lang
          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 text-gray-500 hover:border-gray-300'
      }`}
    >
      {lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
    </button>
  ))}
</div>
<button
  onClick={handleCreateQuestionnaire}
  disabled={generatingQ || !pastedJd.trim()}
  className="w-full bg-indigo-600 ..."
>
```

- [ ] **Step 4: Thêm badge ngôn ngữ trên link card**

Tìm trong phần hiển thị link (sau `{questionnaireToken && (`):
```tsx
<div className="flex items-center gap-2 mb-2">
  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
  <p className="text-sm font-medium text-gray-700">Bảng hỏi đã tạo xong</p>
</div>
```
Sửa thành:
```tsx
<div className="flex items-center gap-2 mb-2">
  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
  <p className="text-sm font-medium text-gray-700">Bảng hỏi đã tạo xong</p>
  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
    generatedLanguage === 'en'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-red-100 text-red-700'
  }`}>
    {generatedLanguage === 'en' ? '🇬🇧 EN' : '🇻🇳 VN'}
  </span>
</div>
```

- [ ] **Step 5: Reset `questionnaireLanguage` về `'vi'` khi bắt đầu generate mới**

Tìm trong `handleCreateQuestionnaire`, ngay sau `setQuestionnaireToken(null)`:
```typescript
setQuestionnaireToken(null)
```
Không cần reset `questionnaireLanguage` — recruiter muốn giữ lựa chọn để tạo lần 2 cùng ngôn ngữ là hợp lý.

- [ ] **Step 6: Verify thủ công**

1. Mở app, chọn 🇬🇧 English, paste JD, nhấn "Tạo bảng hỏi"
2. Sau khi xong: badge `🇬🇧 EN` hiện trên link card
3. Mở link → bảng hỏi bằng tiếng Anh, toàn bộ UI labels bằng tiếng Anh
4. Quay lại, chọn 🇻🇳 Tiếng Việt, tạo lại → badge `🇻🇳 VN`, bảng hỏi tiếng Việt

- [ ] **Step 7: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: add VN/EN language toggle for questionnaire generation"
```

# Progressive Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `src/app/app/page.tsx` to guide recruiters step-by-step through the job posting flow, revealing each section only when the previous step is complete.

**Architecture:** Single-file UI change in `src/app/app/page.tsx`. Remove the static 3-step indicator. Merge the "Chưa có JD" accordion into the main card. Add a `Bước 1` block that fades in when JD is pasted. Add `Bước 2` and `Bước 3` teaser blocks that appear progressively after each step completes.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS

---

## File Map

- **Modify:** `src/app/app/page.tsx` — all changes are in this file only

---

### Task 1: Remove static 3-step indicator from main card

The current card has a `grid grid-cols-3` block rendering "Bước 1/2/3" as static info boxes. Remove it.

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Delete the 3-step grid block**

In `src/app/app/page.tsx`, find and remove this entire block (currently between the language picker and textarea, around line 455–466):

```tsx
// DELETE THIS ENTIRE BLOCK:
<div className="grid grid-cols-3 gap-2 text-center">
  {[
    { step: '1', text: 'Jane đọc JD', sub: 'tạo bảng hỏi phù hợp' },
    { step: '2', text: 'Sếp xác nhận', sub: 'tiêu chí thật, không đoán mò' },
    { step: '3', text: 'Tinh chỉnh JD', sub: 'on-point, tìm đúng người' },
  ].map(({ step, text, sub }) => (
    <div key={step} className="bg-gray-50 rounded-lg px-2 py-2.5">
      <p className="text-xs font-semibold text-indigo-600 mb-0.5">Bước {step}: {text}</p>
      <p className="text-xs text-gray-400 leading-tight">{sub}</p>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Verify the app still renders**

Run: `npm run dev`  
Open: `http://localhost:3000/app`  
Expected: Main card shows without the 3-box indicator. Language picker and "Tạo bảng hỏi" button still visible.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: remove static 3-step indicator from main card"
```

---

### Task 2: Move "Chưa có JD" accordion into the main card

Currently the accordion is a separate `<div>` card below the main card. Move it inside the main card, right below the textarea (and urlError block).

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Add accordion inside main card, below urlError**

Inside the main card (`<div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">`), find the `urlError` block then insert the accordion immediately after it, before the language picker:

```tsx
{urlError && (
  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{urlError} — hãy copy paste nội dung JD trực tiếp nhé.</p>
)}

{/* Accordion: Chưa có JD — MOVED HERE from separate card below */}
<div className="border border-gray-100 rounded-lg overflow-hidden">
  <button
    onClick={() => setShowDraftPanel(!showDraftPanel)}
    className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
  >
    <span>Chưa có JD? Để Jane gợi ý draft</span>
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${showDraftPanel ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {showDraftPanel && (
    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Vị trí tuyển dụng</label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="VD: Senior Frontend Developer"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Yêu cầu thô</label>
        <textarea
          rows={4}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="3 năm React, tiếng Anh tốt, lương 2000-3000 USD..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
        />
      </div>
      <button
        onClick={handleGenerateDraft}
        disabled={generatingDraft || !jobTitle.trim() || !rawInput.trim()}
        className="w-full border border-indigo-300 text-indigo-600 rounded-lg py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors"
      >
        {generatingDraft ? 'Đang gợi ý...' : 'Gợi ý JD draft →'}
      </button>

      {draftJd && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-700">✦ Jane gợi ý — chưa chính xác</p>
            <button
              onClick={handleUseDraft}
              className="text-xs text-indigo-600 font-medium border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 bg-white"
            >
              Dùng draft này →
            </button>
          </div>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
            {draftJd}
          </pre>
        </div>
      )}
    </div>
  )}
</div>

{/* Language picker — unchanged, follows accordion */}
```

- [ ] **Step 2: Remove the old standalone accordion card**

Find and delete the entire separate card block below the main card (currently around line 501–564):

```tsx
// DELETE THIS ENTIRE BLOCK:
{/* Accordion: Chưa có JD */}
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <button
    onClick={() => setShowDraftPanel(!showDraftPanel)}
    ...
  </button>
  {showDraftPanel && (
    <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
      ...
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify accordion behavior**

Open: `http://localhost:3000/app`  
Expected:
- "Chưa có JD? Để Jane gợi ý draft" appears inside the main card, below the textarea
- Click to expand — inputs appear
- Fill in job title + raw input → "Gợi ý JD draft →" button works
- Click "Dùng draft này →" → populates textarea above

- [ ] **Step 4: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: move 'chưa có JD' accordion into main card"
```

---

### Task 3: Add Bước 1 block with progressive reveal

Add a new card that appears (with fade-in animation) when `pastedJd.trim()` has content. This card contains the Job Specification explanation + language picker + the CTA button. Remove the language picker and button from the main card (they move here).

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Remove language picker and CTA button from main card**

Inside the main card, delete the language picker `<div className="flex gap-2">` block and the `<button onClick={handleCreateQuestionnaire}...>` block. They will live in the new Bước 1 card instead.

- [ ] **Step 2: Add Bước 1 card after the main card**

After the closing `</div>` of the main card, add:

```tsx
{/* Bước 1: Job Specification — hiện khi có JD */}
{pastedJd.trim() && (
  <div className="bg-white rounded-xl border border-indigo-100 p-6 space-y-4 animate-fadeIn">
    <div>
      <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">Bước 1 · Job Specification</p>
      <p className="text-sm text-gray-500 leading-relaxed">
        JD chỉ là bề nổi. Jane hỏi sếp để khai thác insight thật sự đằng sau — narrow down kỳ vọng, để bạn submit ứng viên với rationale rõ ràng hơn.
      </p>
    </div>

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
      className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
    >
      {generatingQ ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tạo bảng hỏi... (~15s)
        </>
      ) : (
        <>✦ Tạo bảng hỏi cho sếp</>
      )}
    </button>
  </div>
)}
```

- [ ] **Step 3: Add fadeIn animation to Tailwind config**

Open `tailwind.config.ts` (or `tailwind.config.js`). Add the animation:

```ts
theme: {
  extend: {
    animation: {
      fadeIn: 'fadeIn 0.3s ease-in-out',
    },
    keyframes: {
      fadeIn: {
        '0%': { opacity: '0', transform: 'translateY(6px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
    },
  },
},
```

- [ ] **Step 4: Verify progressive reveal**

Open: `http://localhost:3000/app`  
Expected:
- Empty textarea → Bước 1 card NOT visible
- Type/paste anything into textarea → Bước 1 card fades in with explanation + language picker + button
- Clear textarea → Bước 1 card disappears
- Language picker works, "Tạo bảng hỏi" triggers generation as before

- [ ] **Step 5: Commit**

```bash
git add src/app/app/page.tsx tailwind.config.ts
git commit -m "feat: add Bước 1 job specification block with progressive reveal"
```

---

### Task 4: Add Bước 2 teaser and Bước 3 placeholder

After `QuestionnaireSummary` appears (`answersData` present), show a Bước 2 teaser that triggers `PostingCard`. After `postingJdId` is set, show a Bước 3 "coming soon" block.

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Replace the existing Bước 2 / PostingCard rendering with new teaser structure**

Find the existing `{answersData && (...)}` block that contains `QuestionnaireSummary` and the `PostingCard`. Replace the `onPost` flow so that instead of `QuestionnaireSummary` calling `onPost` to set `postingJdId`, a new Bước 2 teaser block below does it.

Replace the `{answersData && (...)}` block with:

```tsx
{answersData && (
  <div className="max-w-2xl mx-auto space-y-3">
    <QuestionnaireSummary
      data={answersData}
      collapsed={!!postingJdId}
      onPost={() => { if (activeJdHistoryId) setPostingJdId(activeJdHistoryId) }}
    />

    {/* Bước 2 teaser */}
    {!postingJdId && (
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 animate-fadeIn">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Bước 2 · Đăng tuyển</p>
        <p className="text-sm text-gray-500">Đăng JD đã tinh chỉnh lên LinkedIn, TopCV và các kênh khác.</p>
        <button
          onClick={() => { if (activeJdHistoryId) setPostingJdId(activeJdHistoryId) }}
          className="w-full border border-indigo-300 text-indigo-600 rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          Đăng tuyển ngay →
        </button>
      </div>
    )}

    {postingJdId && (
      <PostingCard jdHistoryId={postingJdId} />
    )}

    {/* Bước 3 placeholder */}
    {postingJdId && (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-5 animate-fadeIn">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bước 3 · Search ứng viên</p>
          <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">coming soon</span>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: Remove the now-redundant standalone PostingCard block**

Find and delete this block (currently around line 641–643):

```tsx
{/* Posting Card (from history, no summary context) */}
{!answersData && postingJdId && (
  <PostingCard jdHistoryId={postingJdId} />
)}
```

Note: This block handled the case where posting was triggered from history without answersData. With the new flow, posting is only accessible after answersData, so this path is no longer needed.

- [ ] **Step 3: Verify Bước 2 and Bước 3 flow**

Open: `http://localhost:3000/app`  
Simulate the full flow:
1. Paste JD → Bước 1 appears
2. Create questionnaire → link appears
3. When `answersData` loads (or simulate by checking history for a completed one) → QuestionnaireSummary + Bước 2 teaser appears
4. Click "Đăng tuyển ngay →" → PostingCard appears + Bước 3 "coming soon" appears
5. Bước 2 teaser disappears when PostingCard is active

- [ ] **Step 4: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: add Bước 2 teaser and Bước 3 coming soon block"
```

---

## Self-Review

**Spec coverage:**
- ✅ Remove 3-step static indicator → Task 1
- ✅ Move "Chưa có JD" accordion into main card → Task 2
- ✅ Bước 1 block with explanation + progressive reveal → Task 3
- ✅ Language picker + CTA move to Bước 1 card → Task 3
- ✅ Bước 2 teaser (Đăng tuyển) after answersData → Task 4
- ✅ Bước 3 placeholder after postingJdId → Task 4

**No placeholders:** All steps include exact JSX.

**Type consistency:** All state variables (`pastedJd`, `questionnaireLanguage`, `generatingQ`, `questionnaireToken`, `answersData`, `postingJdId`, `activeJdHistoryId`) match existing declarations in `page.tsx`.

# Progressive Onboarding Flow — Design Spec

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** Redesign `src/app/app/page.tsx` main flow

---

## Problem

Users paste JD vào nhưng không biết phải làm gì tiếp. 3-step indicator tĩnh hiện tại không đủ để guide họ. "Chưa có JD" accordion nằm tận dưới cùng, sai vị trí trong flow.

---

## Goal

"Cầm tay chỉ việc" — reveal từng bước khi user hoàn thành bước trước. User chỉ thấy đúng thứ họ cần làm lúc đó.

---

## Approach

**Inline progressive reveal (Approach A):** Các block xuất hiện tuần tự theo state, không có locked/grayed-out UI. Không overwhelm user với thứ họ chưa cần.

---

## Layout Structure (top to bottom)

### 1. Card: Input JD (luôn hiển thị)

- "Bạn đang tuyển vị trí gì?" (giữ nguyên)
- Input tên vị trí
- Textarea paste JD hoặc link
- **"Chưa có JD? Jane gợi ý →" accordion ngay dưới textarea** (move từ card riêng bên dưới lên đây)
  - Cơ chế expand/collapse giữ nguyên như hiện tại
  - Chỉ thay đổi vị trí: nằm trong card chính thay vì card riêng

### 2. Bước 1: Job Specification (hiện khi `pastedJd.trim()` có nội dung)

- Animate xuất hiện (fade-in hoặc slide-down)
- **Label:** `Bước 1 · Job Specification`
- **Copy:**  
  > JD chỉ là bề nổi. Jane hỏi sếp để khai thác insight thật sự đằng sau — narrow down kỳ vọng, để bạn submit ứng viên với rationale rõ ràng hơn.
- Language picker: `🇻🇳 Tiếng Việt` / `🇬🇧 English`
- CTA: `✦ Tạo bảng hỏi cho sếp`

### 3. Link bảng hỏi + trạng thái (hiện sau khi `questionnaireToken` có)

- Giữ nguyên UI hiện tại
- Thêm 1 dòng hướng dẫn: *"Gửi link này cho sếp qua Zalo/email để xác nhận tiêu chí. Không cần đăng nhập, điền trong 5 phút."*
- Trạng thái chờ sếp điền (giữ nguyên)

### 4. Job Specification Summary (hiện khi `answersData` có)

- `QuestionnaireSummary` component giữ nguyên

### 5. Bước 2: Đăng tuyển (hiện khi `answersData` có)

- Dạng teaser block nhỏ bên dưới summary
- Label: `Bước 2 · Đăng tuyển`
- Subtitle: *"Đăng JD đã tinh chỉnh lên LinkedIn, TopCV, ..."*
- CTA: `Đăng tuyển ngay →` (trigger `PostingCard` như hiện tại)

### 6. Bước 3: Search ứng viên (future)

- Placeholder text: `Bước 3 · Search ứng viên` + badge `coming soon`
- Hiển thị sau khi `postingJdId` có (hoặc luôn hiện sau Bước 2)
- Không có action, chỉ để user thấy roadmap

---

## State Mapping

| State | Hiển thị |
|---|---|
| Default (empty) | Card input JD |
| `pastedJd` có nội dung | + Bước 1 block |
| `generatingQ` | Bước 1 block với loading state |
| `questionnaireToken` có | + Link bảng hỏi |
| `answersData` có | + QuestionnaireSummary + Bước 2 teaser |
| `postingJdId` có | PostingCard + Bước 3 teaser |

---

## Removed

- 3-step static indicator grid (3 ô Bước 1/2/3 tĩnh trong card input) — bỏ hẳn
- Card riêng "Chưa có JD" bên dưới — merge vào card chính

---

## Out of Scope

- Build Bước 2 hoặc Bước 3 functionality mới (chỉ tái sử dụng PostingCard đã có)
- Thay đổi API hay backend
- Thay đổi `QuestionnaireSummary`, `PostingCard` components

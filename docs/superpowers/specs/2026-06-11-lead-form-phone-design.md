# Lead form: thu số điện thoại thay vì hỏi lại email — Design

**Date:** 2026-06-11
**Status:** Approved

## Problem

Form "Để Jane follow up" trong RecruitingChatPanel bắt khách gõ email — nhưng app đã có email từ Clerk (mỗi conversation đã lưu `user_email`). Thông tin liên hệ duy nhất Clerk *không* có là số điện thoại, trong khi Jane follow up khách chủ yếu qua gọi điện/Zalo (kèm email). Ngoài ra form đang gửi `hiringNeed` = nội dung đang gõ dở trong ô chat, thường rỗng hoặc nửa câu.

## Decision (Approach 1 — approved)

Phone là field bắt buộc mới; email prefill từ Clerk, sửa được; giữ Tên + Công ty optional. Không đập lại form, không bỏ cột email.

## UI — RecruitingChatPanel

- Ô **Số điện thoại** thay vị trí ô Email hiện tại (đầu form, giữ nguyên style), `type="tel"`, placeholder `09xx xxx xxx`. Bắt buộc.
- Ô **Email** prefill từ `useUser()` (email Clerk đầu tiên), vẫn hiển thị và sửa được, xuống dưới phone.
- Tên + Công ty giữ nguyên (optional).
- Nút "Gửi thông tin" disable khi phone trống (thay vì email trống như hiện tại).
- `hiringNeed` gửi lên = text của tin nhắn **user gần nhất đã gửi** trong hội thoại (lấy từ `messages`), không phải `input` đang gõ.

## Server — validation & API

- `normalizeLeadPayload` (src/lib/recruiting-rag/persistence.ts) thêm `phone` **bắt buộc**:
  - Chuẩn hoá: bỏ khoảng trắng, chấm, gạch, ngoặc; giữ `+` đầu nếu có.
  - Hợp lệ: `0` + 9–10 số, hoặc `+` + 10–12 số (cover +84). Cố tình thoáng — thà nhận số lạ còn hơn mất lead.
  - Sai → `LeadValidationError` (route đã trả 400 kèm lý do từ fix trước).
- Email: validate như cũ (luôn có giá trị nhờ prefill).
- `saveRecruitingLead` (db.ts) insert thêm cột `phone`.
- Route `/api/recruiting-leads` không đổi cấu trúc (đã tách 400/500 từ trước).

## DB

Migration mới `supabase/migrations/20260611*_add_recruiting_leads_phone.sql`:

```sql
alter table public.recruiting_leads add column if not exists phone text;
```

Cột nullable để data cũ (lead chỉ có email) không vỡ. Khi apply, chạy cùng 2 migration 2026-06-09 còn pending nếu prod chưa có.

## Testing

- TDD cho `normalizeLeadPayload` phone: hợp lệ (`0912345678`, `+84 91 234-5678`, có khoảng trắng/gạch), không hợp lệ (thiếu, quá ngắn, quá dài, không phải string, chữ cái) — assert `LeadValidationError`.
- Component không có test infra → verify UI thủ công sau deploy.

## Out of scope

- Checkbox Zalo, SMS verification, format quốc tế đầy đủ.
- Backfill phone cho lead cũ; đổi `email` thành nullable.

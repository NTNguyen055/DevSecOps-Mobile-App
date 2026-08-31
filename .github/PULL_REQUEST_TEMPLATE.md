## Mô tả

<!-- Tóm tắt ngắn gọn PR này làm gì và tại sao cần thiết -->

## Loại thay đổi

- [ ] `feat` – Tính năng mới
- [ ] `fix` – Sửa bug
- [ ] `security` – Vá lỗ hổng bảo mật
- [ ] `refactor` – Refactor code, không đổi behavior
- [ ] `docs` – Chỉ thay đổi tài liệu
- [ ] `chore` / `test` / `style` – Việc khác

## Liên kết Issue

Closes #

## Checklist trước khi merge

### Backend & Infrastructure

- [ ] Backend dependencies: `npm install` & `npm test` pass
- [ ] Docker build: `docker compose up --build` thành công
- [ ] Database schema: Nếu có thay đổi, cần migration scripts
- [ ] Không có secret / API key / password hardcode
- [ ] Đã cập nhật tài liệu liên quan (README, openapi.yaml, docs/)

### Mobile Client

- [ ] Dependencies: `npm --prefix client install`
- [ ] Tested on: (Expo Go / Android Emulator / iOS Simulator / Physical device)
- [ ] Không có hardcode API URL hoặc secrets
- [ ] Có responsive UI cho cả Android & iOS

### Code Quality & Security

- [ ] Đã tự review lại diff của chính mình trước khi request review
- [ ] CI (test, audit, security scan) đã pass ✅
- [ ] Lint/format: `npm run lint` (nếu có script)

## Ghi chú cho reviewer

<!-- Có điểm nào cần reviewer chú ý đặc biệt không? Trade-off? Cách test thủ công? -->

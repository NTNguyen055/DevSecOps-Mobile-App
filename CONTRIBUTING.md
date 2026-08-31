# Contributing Guide

Tài liệu này mô tả quy trình làm việc với Git/GitHub cho dự án NK-Forge Storefront.
Xem chi tiết roadmap DevSecOps đầy đủ tại [docs/devsecops-roadmap.md](docs/devsecops-roadmap.md).

## 1. Mô hình branch (Git Flow)

| Branch | Mục đích | Branch từ | Merge về |
|--------|----------|-----------|----------|
| `main` | Production-ready code | — | — |
| `develop` | Integration branch | `main` | `main` (qua release) |
| `feature/xxx` | Tính năng mới | `develop` | `develop` |
| `bugfix/xxx` | Sửa bug | `develop` | `develop` |
| `hotfix/xxx` | Sửa khẩn cấp production | `main` | `main` + `develop` |
| `release/x.y.z` | Chuẩn bị release | `develop` | `main` + tag version |

**Quy tắc:**
- Không bao giờ commit thẳng vào `main` hoặc `develop` — luôn qua Pull Request.
- Đặt tên branch mô tả rõ việc đang làm: `feature/add-stripe-refund`, `bugfix/cart-quantity-negative`.
- Xoá branch sau khi merge để giữ repo sạch.

## 2. Commit convention

Format: `type(scope): message`

| Type | Khi nào dùng |
|------|--------------|
| `feat` | Thêm tính năng mới |
| `fix` | Sửa bug |
| `docs` | Chỉ thay đổi tài liệu |
| `style` | Format code, không đổi logic |
| `refactor` | Refactor code, không đổi behavior |
| `test` | Thêm/sửa test |
| `chore` | Việc linh tinh (deps, config, build) |
| `security` | Vá lỗ hổng bảo mật |

Ví dụ:
```
feat(cart): add quantity validation before checkout
fix(auth): prevent JWT expiry crash on /auth/me
security(payments): validate stripe webhook signature
```

## 3. Quy trình mở Pull Request

1. Tạo branch từ `develop` (hoặc `main` nếu là `hotfix/`).
2. Code + viết/cập nhật test trong `test/`.
3. Chạy local trước khi push:
   ```bash
   npm test
   npm run build
   ```
4. Push branch, mở PR nhắm vào `develop` (hoặc `main` cho hotfix).
5. Điền đầy đủ PR template (checklist tests pass, không secret, docs updated).
6. Chờ CI (lint, test, security scan) chạy xanh và ít nhất 1 approval trước khi merge.
7. Dùng **Squash and merge** để giữ lịch sử `develop`/`main` gọn gàng.

## 4. Release

1. Tạo `release/x.y.z` từ `develop`.
2. Kiểm tra changelog, version bump, chạy full test.
3. Merge `release/x.y.z` vào `main`, tag `vX.Y.Z`.
4. Merge ngược `main` vào `develop` để đồng bộ.

## 5. (Tuỳ chọn) Enforce commit convention tự động

Có thể cài `commitlint` + `husky` để chặn commit sai format ngay trên máy dev:
```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky init
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```

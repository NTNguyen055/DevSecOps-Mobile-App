# 🚀 Hướng Dẫn Chạy Dự Án NK-Forge Storefront (Docker + Local DB)

Tài liệu này hướng dẫn cách chạy dự án bằng **Docker** (chuẩn containerization) với cơ sở dữ liệu **PostgreSQL cũng chạy trong Docker**, chỉ sử dụng luồng đăng ký / đăng nhập tài khoản thông thường (Email & Mật khẩu), không cần cấu hình Google OAuth hay Stripe.

---

## 📋 1. Cấu Hình File Biến Môi Trường (`.env`)

Dự án đã được tinh gọn, bạn chỉ cần các thông tin cơ bản:

### 🔹 File 1: `.env` (Đặt tại thư mục gốc `DevSecOps-App/.env`)

Tạo file `.env` ở thư mục gốc với nội dung:

```env
PORT=4001
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=devsecops_jwt_secret_key_random_2026

# Kết nối tới PostgreSQL Container chạy trên máy cục bộ (cổng 5432)
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/ecommerce_db
```

> 💡 **Giải thích các biến:**
> - `PORT=4001`: Cổng chạy Express Backend.
> - `CLIENT_ORIGIN=http://localhost:5173`: Địa chỉ Frontend khi chạy local dev.
> - `JWT_SECRET`: Chuỗi ký tự bất kỳ dùng để mã hóa mã đăng nhập (JWT Token).
> - `DATABASE_URL`: Đường dẫn kết nối đến PostgreSQL do Docker quản lý.

---

### 🔹 File 2: `client/.env` (Đặt tại thư mục `DevSecOps-App/client/.env`)

Tạo file `client/.env` với nội dung:

```env
VITE_API_BASE_URL=http://localhost:4001
```

---

## 🐳 2. Cách Chạy Dự Án (2 Phương Án)

---

### 👉 PHƯƠNG ÁN 1: Chạy Toàn Bộ Bằng Docker Compose (Khuyên dùng - Chuẩn DevOps)

Phương án này đóng gói cả **Database PostgreSQL** và **Fullstack App (React + Express)** vào các container độc lập. Bạn **không cần cài Node.js hay PostgreSQL** trên máy thật.

#### 1. Khởi động hệ thống:
Mở PowerShell tại thư mục dự án và chạy:
```powershell
docker compose up --build -d
```

> ⚡ *Lưu ý:* Database sẽ tự động nạp toàn bộ 6 bảng dữ liệu từ file `db/schema.sql` ngay khi khởi tạo container lần đầu.

#### 2. Kiểm tra các container đang chạy:
```powershell
docker compose ps
```
Bạn sẽ thấy 2 containers:
- `devsecops-postgres` (PostgreSQL - Port 5432)
- `devsecops-ecommerce-app` (Fullstack App - Port 4001)

#### 3. Truy cập ứng dụng:
- **Giao diện Web Khách hàng (React + API):** [http://localhost:4001](http://localhost:4001)
- **API Documentation (Swagger UI):** [http://localhost:4001/api-docs](http://localhost:4001/api-docs)
- **Kiểm tra kết nối Database:** [http://localhost:4001/health/db](http://localhost:4001/health/db)

#### 4. Dừng hệ thống:
```powershell
docker compose down
```
*(Nếu muốn xóa sạch dữ liệu database cũ để khởi tạo lại: `docker compose down -v`)*

---

### 👉 PHƯƠNG ÁN 2: Chạy PostgreSQL trong Docker + Chạy Code trực tiếp trên máy

Phù hợp khi bạn đang phát triển, chỉnh sửa mã nguồn backend/frontend và muốn hot-reload code ngay lập tức.

#### Bước 1: Khởi động riêng container PostgreSQL
```powershell
docker compose up -d postgres_db
```

#### Bước 2: Cài đặt thư viện dependencies
```powershell
# Cài đặt cho Backend
npm install

# Cài đặt cho Frontend
npm install --prefix client
```

#### Bước 3: Nạp cấu trúc Database (Schema)
Chạy script tự động tạo 6 bảng vào PostgreSQL:
```powershell
npm run db:schema
```
*(Thông báo `Database schema applied successfully.` là thành công)*

#### Bước 4: Khởi động Backend & Frontend (Mở 2 Terminal)

- **Terminal 1 - Chạy Backend:**
  ```powershell
  npm run dev
  ```
  *(Backend lắng nghe tại `http://localhost:4001`)*

- **Terminal 2 - Chạy Frontend:**
  ```powershell
  cd client
  npm run dev
  ```
  *(Frontend Vite khởi động tại `http://localhost:5173`)*

---

## 🔍 3. Kiểm Tra & Trải Nghiệm Tính Năng

1. **Đăng ký tài khoản:**
   - Vào trang [http://localhost:4001/register](http://localhost:4001/register) (hoặc `http://localhost:5173/register` nếu chạy phương án 2).
   - Nhập Email và Mật khẩu để đăng ký tài khoản nội bộ.
2. **Đăng nhập:**
   - Đăng nhập tài khoản vừa tạo để nhận JWT Session.
3. **Mua sắm:**
   - Duyệt danh sách sản phẩm, thêm vào giỏ hàng (`/cart`), cập nhật số lượng và đặt đơn hàng (`/orders`).
4. **Chạy Smoke Test tự động:**
   ```powershell
   npm test
   ```
   Bộ kiểm thử tự động kiểm tra toàn bộ API và phân quyền người dùng.
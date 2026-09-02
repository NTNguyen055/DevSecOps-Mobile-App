# 🛒 NK-Forge: Storefront — DevSecOps Full-Stack E-Commerce

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Dự án ứng dụng thương mại điện tử **Full-Stack (Monorepo)** được thiết kế và chuẩn hóa cho quy trình **DevSecOps**, tích hợp sẵn **Containerization (Docker & Docker Compose)**, xác thực bảo mật bằng **JWT & Bcrypt**, cơ sở dữ liệu **PostgreSQL** với cơ chế tự động nạp cấu trúc (schema migration) và seed dữ liệu.

---

## 📌 Mục lục

1. [Kiến Trúc & Tech Stack](#-kiến-trúc--tech-stack)
2. [Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
3. [Tính Năng Chính](#-tính-năng-chính)
4. [Cơ Sở Dữ Liệu (Database Schema)](#-cơ-sở-dữ-liệu-database-schema)
5. [Hướng Dẫn Cài Đặt & Chạy Dự Án](#-hướng-dẫn-cài-đặt--chạy-dự-án)
   - [Cách 1: Chạy bằng Docker Compose (Khuyên Dùng)](#-cách-1-chạy-toàn-bộ-bằng-docker-compose-chuẩn-devsecops)
   - [Cách 2: Chạy Local Development](#-cách-2-chạy-local-development)
6. [Tài Liệu API & Swagger UI](#-tài-liệu-api--swagger-ui)
7. [Kiểm Thử Tự Động (Smoke Tests)](#-kiểm-thử-tự-động-smoke-tests)
8. [DevSecOps & Tiêu Chuẩn Bảo Mật](#-devsecops--tiêu-chuẩn-bảo-mật)

---

## 🏗️ Kiến Trúc & Tech Stack

```mermaid
graph TB
    subgraph "Client Layer (Frontend)"
        A["React 19 SPA"] --> B["React Router v7"]
        A --> C["Auth Context (JWT in LocalStorage)"]
        A --> D["API Client (Fetch)"]
    end
    
    subgraph "Server Layer (Backend - Docker)"
        E["Express 5 Server"] --> F["Security Middleware (JWT Auth, CORS)"]
        F --> G["REST API Routes"]
        G --> H["Data Models (User, Product, Cart, Order)"]
        H --> I["PostgreSQL Pool (pg)"]
        E --> J["Swagger UI (/api-docs)"]
    end
    
    subgraph "Data Layer (PostgreSQL Container)"
        K[("PostgreSQL 16 DB")]
    end
    
    D -->|HTTP Request| E
    I -->|TCP Connection| K
```

### Chi tiết Công nghệ:
- **Frontend**: React 19, Vite, React Router v7, Modern Vanilla CSS (Glassmorphism & Responsive UI).
- **Backend**: Node.js (>=22), Express 5, `pg` (PostgreSQL client pool), `jsonwebtoken`, `bcrypt`.
- **Database**: PostgreSQL 16 Alpine.
- **Containerization**: Multi-stage Dockerfile (non-root security), Docker Compose orchestration.
- **API Documentation**: OpenAPI 3.0 YAML, Swagger UI.
- **Testing**: Mocha, Chai, Supertest (hơn 30 smoke test cases).

---

## 📁 Cấu Trúc Thư Mục

```text
.
├── client/                     # Mã nguồn Frontend (React + Vite)
│   ├── src/
│   │   ├── api/                # API Client module
│   │   ├── auth/               # AuthProvider, useAuth hook, context
│   │   ├── components/         # ProtectedRoute, UI components
│   │   ├── pages/              # Pages: Home, Products, Cart, Orders, Login, Register...
│   │   ├── App.jsx             # Router layout & navigation
│   │   └── App.css             # Design system & responsive styles
│   ├── index.html              # HTML entrypoint
│   └── package.json            # Frontend dependencies
├── db/
│   ├── index.js                # PostgreSQL connection pool & SSL config
│   └── schema.sql              # 6 DDL tables & Seed data
├── docs/
│   ├── openapi.yaml            # OpenAPI 3.0 Specification
│   ├── api-plan.md             # Kế hoạch thiết kế API
│   └── devsecops-roadmap.md    # Lộ trình chuẩn hóa DevSecOps
├── middleware/
│   └── authMiddleware.js       # JWT validation & user ownership check
├── models/                     # Data access layer (User, Product, Cart, Order)
├── routes/                     # Express REST API routes
├── scripts/
│   └── apply-schema.js         # Script áp dụng schema vào database
├── test/
│   └── smoke.test.js           # Bộ kiểm thử tự động toàn diện
├── .dockerignore               # Danh sách loại trừ khi build Docker image
├── .env.example                # Biến môi trường mẫu
├── docker-compose.yml          # Docker Compose orchestration (App + DB)
├── Dockerfile                  # Multi-stage Dockerfile tối ưu bảo mật
├── package.json                # Backend dependencies & npm scripts
└── README.md                   # Tài liệu dự án
```

---

## ✨ Tính Năng Chính

- **Quản lý tài khoản**: Đăng ký, đăng nhập tài khoản bằng Email & Mật khẩu mã hóa Bcrypt; Cấp phát JWT token (1h).
- **Catalog sản phẩm**: Duyệt danh sách sản phẩm, xem chi tiết, hiển thị giá và số lượng tồn kho tức thời.
- **Giỏ hàng (Cart)**: Thêm sản phẩm, tăng/giảm số lượng, xóa item, làm sạch giỏ hàng với cơ chế kiểm soát quyền sở hữu (`requireSameUser`).
- **Đơn hàng (Orders)**: Chuyển đổi giỏ hàng thành đơn hàng với **Database Transaction** (BEGIN / COMMIT / ROLLBACK) đảm bảo trừ số lượng tồn kho an toàn và lưu snapshot giá tại thời điểm mua.
- **Tài liệu trực quan**: Tích hợp Swagger UI tương tác trực tiếp với API tại `/api-docs`.
- **Đóng gói container hoàn chỉnh**: Chạy toàn bộ ứng dụng chỉ với một lệnh duy nhất.

---

## 🗄️ Cơ Sở Dữ Liệu (Database Schema)

Dự án gồm **6 bảng quan hệ**:

```mermaid
erDiagram
    users ||--o| carts : "sở hữu 1"
    users ||--o{ orders : "đặt nhiều"
    carts ||--o{ cart_items : "chứa"
    products ||--o{ cart_items : "trong giỏ"
    orders ||--o{ order_items : "chứa"
    products ||--o{ order_items : "được mua"

    users {
        int id PK
        string username UK
        string email UK
        string password_hash
        timestamp created_at
    }
    products {
        int id PK
        string name
        text description
        numeric price
        int inventory_quantity
        timestamp created_at
    }
    carts {
        int id PK
        int user_id FK,UK
    }
    cart_items {
        int id PK
        int cart_id FK
        int product_id FK
        int quantity
    }
    orders {
        int id PK
        int user_id FK
        string status
        numeric total
        timestamp created_at
    }
    order_items {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        numeric price_at_purchase
    }
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Cấu hình biến môi trường (`.env`)

Tạo file `.env` tại thư mục gốc của dự án:

```env
PORT=4001
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=************************************************

# Thông tin tài khoản PostgreSQL
POSTGRES_USER=your
POSTGRES_PASSWORD=your
POSTGRES_DB=your

# Chuỗi kết nối khi chạy ngoài máy thật (Local Dev)
DATABASE_URL=postgresql://your:your@localhost:5432/ecommerce_db
```

Tạo file `client/.env` tại thư mục `client/`:
```env
VITE_API_BASE_URL=http://localhost:4001
```

---

### 🐳 Cách 1: Chạy toàn bộ bằng Docker Compose (Chuẩn DevSecOps)

> **Yêu cầu:** Máy tính đã cài đặt và khởi động **Docker Desktop**.

1. Khởi chạy toàn bộ hệ thống (App + Database PostgreSQL):
   ```bash
   docker compose up --build -d
   ```

2. Kiểm tra trạng thái các container:
   ```bash
   docker compose ps
   ```
   *Cả 2 containers `devsecops-postgres` và `devsecops-ecommerce-app` đều ở trạng thái `healthy`.*

3. Truy cập ứng dụng:
   - **Giao diện Web Khách hàng (React + API):** [http://localhost:4001](http://localhost:4001)
   - **Swagger API Docs:** [http://localhost:4001/api-docs](http://localhost:4001/api-docs)
   - **Database Health Check:** [http://localhost:4001/health/db](http://localhost:4001/health/db)

4. Dừng hệ thống:
   ```bash
   docker compose down
   # Nếu muốn xóa sạch volume database cũ:
   docker compose down -v
   ```

---

### 💻 Cách 2: Chạy Local Development

1. Khởi động riêng container PostgreSQL:
   ```bash
   docker compose up -d postgres_db
   ```

2. Cài đặt dependencies:
   ```bash
   npm install
   npm install --prefix client
   ```

3. Nạp database schema & dữ liệu mẫu:
   ```bash
   npm run db:schema
   ```

4. Khởi động ứng dụng (mở 2 terminal):
   - **Terminal 1 (Backend):**
     ```bash
     npm run dev
     # Backend chạy tại: http://localhost:4001
     ```
   - **Terminal 2 (Frontend):**
     ```bash
     cd client
     npm run dev
     # Frontend chạy tại: http://localhost:5173
     ```

---

## 📖 Tài Liệu API & Swagger UI

Toàn bộ tài liệu chi tiết các Endpoint có thể tra cứu và test trực tiếp tại:  
👉 **[http://localhost:4001/api-docs](http://localhost:4001/api-docs)**

### Tóm tắt các Endpoint chính:

| Nhóm | Method | Endpoint | Yêu cầu Auth | Mô tả |
|:---|:---|:---|:---:|:---|
| **Health** | `GET` | `/health/db` | ❌ | Kiểm tra kết nối cơ sở dữ liệu |
| **Auth** | `POST` | `/auth/register` | ❌ | Đăng ký tài khoản người dùng mới |
| | `POST` | `/auth/login` | ❌ | Đăng nhập & nhận Bearer JWT Token |
| | `GET` | `/auth/me` | 🔒 JWT | Lấy thông tin user hiện tại |
| **Products** | `GET` | `/products` | ❌ | Lấy danh sách toàn bộ sản phẩm |
| | `GET` | `/products/:id` | ❌ | Lấy thông tin chi tiết 1 sản phẩm |
| **Cart** | `GET` | `/cart/:userId` | 🔒 JWT + 👤 Owner | Lấy thông tin giỏ hàng của user |
| | `POST` | `/cart/:userId/items` | 🔒 JWT + 👤 Owner | Thêm sản phẩm vào giỏ hàng |
| | `PUT` | `/cart/:userId/items/:productId` | 🔒 JWT + 👤 Owner | Cập nhật số lượng sản phẩm |
| | `DELETE` | `/cart/:userId/items/:productId` | 🔒 JWT + 👤 Owner | Xóa 1 item khỏi giỏ hàng |
| | `DELETE` | `/cart/:userId` | 🔒 JWT + 👤 Owner | Làm trống giỏ hàng |
| **Orders** | `POST` | `/orders/:userId` | 🔒 JWT + 👤 Owner | Tạo đơn hàng từ giỏ hàng (Transaction) |
| | `GET` | `/orders/user/:userId` | 🔒 JWT + 👤 Owner | Xem lịch sử đơn hàng của user |
| | `GET` | `/orders/:id` | 🔒 JWT | Xem chi tiết 1 đơn hàng |

---

## 🧪 Kiểm Thử Tự Động (Smoke Tests)

Dự án tích hợp bộ kiểm thử tự động với Mocha, Chai và Supertest kiểm tra toàn bộ luồng Auth, CRUD sản phẩm, giỏ hàng, đặt hàng và bảo mật phân quyền:

```bash
npm test
```

---

## 🛡️ DevSecOps & Tiêu Chuẩn Bảo Mật

- **Mã hóa mật khẩu**: Sử dụng `bcrypt` với 10 vòng salt rounds.
- **Xác thực & Ủy quyền**: Sử dụng JSON Web Token (JWT) có thời hạn (1h); Middleware `requireSameUser` ngăn chặn truy cập trái phép vào giỏ hàng / đơn hàng của người khác (IDOR protection).
- **Toàn vẹn dữ liệu (ACID)**: Sử dụng Database Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) khi tạo đơn hàng nhằm tránh tình trạng race condition và sai lệch tồn kho.
- **Container Security**: 
  - Dockerfile sử dụng `node:22-alpine` đa tầng (Multi-stage build) giúp giảm kích thước image (<200MB).
  - Khởi chạy tiến trình dưới tài khoản người dùng không đặc quyền (`ntnuser`), không chạy quyền `root`.
  - Tích hợp `HEALTHCHECK` định kỳ.
- **Secret Management**: Tất cả secrets nhạy cảm được quản lý qua biến môi trường (`.env`), không hardcode trong Dockerfile hay source code.
- **Roadmap DevSecOps hoàn chỉnh**: Xem chi tiết kế hoạch triển khai CI/CD, SonarQube, Gitleaks, Trivy, AWS & Monitoring tại [docs/devsecops-roadmap.md](docs/devsecops-roadmap.md).

---

## 📄 Giấy Phép (License)

Dự án được phân phối dưới giấy phép **MIT License**.
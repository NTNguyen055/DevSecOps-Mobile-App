# DevSecOps Roadmap – NK-Forge Storefront

> **Dự án**: Full-Stack E-Commerce App (Node.js + React + PostgreSQL)  
> **Role**: DevOps + Security Engineer  
> **Ngày tạo**: 2026-08-29  
> **Trạng thái**: Planning — chưa triển khai

---

## 1. Quản lý mã nguồn & Cộng tác

### 1.1 GitHub – Quản lý Repository

**Mục tiêu**: Chuẩn hóa cách team quản lý code, review, và release.

#### Việc cần làm

| Hạng mục | Mô tả |
|----------|--------|
| Branch protection trên `main` | Require PR, ≥1 approval, require status checks pass, no force push |
| Branch protection trên `develop` | Require PR, require status checks pass |
| CODEOWNERS | File `.github/CODEOWNERS` – chỉ định reviewer cho từng phần code |
| Issue templates | Bug report, feature request, security vulnerability |
| PR template | Checklist: tests pass, no secrets, docs updated |
| Labels | `bug`, `feature`, `security`, `devops`, `hotfix`, `breaking-change` |
| Environments | `development`, `staging`, `production` trên GitHub Settings |

#### Files cần tạo

- `.github/CODEOWNERS`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/security_vulnerability.md`

#### Điều kiện tích hợp

- [ ] Repo đã tồn tại trên GitHub
- [ ] Cấu hình branch protection rules trên GitHub Settings
- [ ] Tạo GitHub Environments (development, staging, production)
- [ ] Cấu hình Secrets trên GitHub → Settings → Secrets and variables → Actions

---

### 1.2 Git Flow – Chuẩn hóa quy trình Branch/PR

**Mô hình branch đề xuất**:

| Branch | Mục đích | Branch từ | Merge về |
|--------|----------|-----------|----------|
| `main` | Production-ready code | — | — |
| `develop` | Integration branch | `main` | `main` (qua release) |
| `feature/xxx` | Tính năng mới | `develop` | `develop` |
| `bugfix/xxx` | Sửa bug | `develop` | `develop` |
| `hotfix/xxx` | Sửa khẩn cấp production | `main` | `main` + `develop` |
| `release/x.y.z` | Chuẩn bị release | `develop` | `main` + tag version |

#### Commit convention

Áp dụng format: `type(scope): message`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `security`

#### Điều kiện tích hợp

- [ ] Team đồng thuận về branching model
- [ ] Document quy trình trong `CONTRIBUTING.md`
- [ ] (Tùy chọn) Cài commitlint + husky cho commit convention enforcement

---

## 2. CI/CD

### 2.1 GitHub Actions – Tự động hóa Pipeline

**Mục tiêu**: Mỗi push/PR tự động chạy build → lint → test → security scan → deploy.

#### Workflow files cần tạo

| File | Trigger | Các bước chính |
|------|---------|----------------|
| `.github/workflows/ci.yml` | PR & push vào `develop`/`main` | Lint (backend + client) → Test (mocha) → Build client |
| `.github/workflows/security-scan.yml` | PR & push & scheduled | Gitleaks → Trivy → OWASP Dep-Check → SonarQube |
| `.github/workflows/docker-build-push.yml` | Push to `main` hoặc tag `v*` | Docker build → Trivy scan image → Push Docker Hub |
| `.github/workflows/deploy.yml` | Manual dispatch hoặc sau Docker push | SSH vào EC2 → docker pull → docker-compose up → health check |

#### GitHub Secrets cần cấu hình

| Secret | Mục đích | Dùng ở workflow |
|--------|----------|-----------------|
| `DATABASE_URL` | PostgreSQL connection cho test | ci.yml |
| `JWT_SECRET` | JWT signing cho test | ci.yml |
| `DOCKERHUB_USERNAME` | Docker Hub login | docker-build-push.yml |
| `DOCKERHUB_TOKEN` | Docker Hub access token | docker-build-push.yml |
| `AWS_EC2_HOST` | EC2 public IP/DNS | deploy.yml |
| `AWS_EC2_USER` | SSH user (ec2-user / ubuntu) | deploy.yml |
| `AWS_EC2_SSH_KEY` | SSH private key | deploy.yml |
| `SONAR_TOKEN` | SonarQube/SonarCloud token | security-scan.yml |
| `SONAR_HOST_URL` | SonarQube server URL | security-scan.yml |
| `NVD_API_KEY` | OWASP Dependency-Check NVD access | security-scan.yml |

#### Điều kiện tích hợp

- [ ] Repo trên GitHub (đã có)
- [ ] GitHub Secrets đã cấu hình đầy đủ
- [ ] Database riêng cho CI test (Neon branch hoặc PostgreSQL service container)
- [ ] Dockerfile sẵn sàng (xem Section 3)
- [ ] AWS EC2 đã provision (xem Section 4)

---

## 3. Containerization

### 3.1 Docker – Đóng gói Backend

**Mục tiêu**: Image production nhẹ, bảo mật, health check sẵn có.

#### Yêu cầu Dockerfile

| Yêu cầu | Chi tiết |
|----------|----------|
| Base image | `node:22-alpine` |
| Multi-stage build | Stage 1: build client, Stage 2: production (chỉ copy `client/dist`) |
| Non-root user | Tạo `appuser` để chạy app |
| HEALTHCHECK | `GET /health/db` mỗi 30s |
| Image size mục tiêu | < 200MB |
| Loại bỏ file không cần | `test/`, `docs/`, `scripts/`, `.env.example`, `.git/` |

#### Files cần tạo

- `Dockerfile` (root)
- `.dockerignore`

#### Điều kiện tích hợp

- [ ] Tạo `Dockerfile` + `.dockerignore`
- [ ] Test build local: `docker build -t devsecops-app .`
- [ ] Test run: `docker run -p 4001:4001 --env-file .env devsecops-app`
- [ ] Verify health check: `curl http://localhost:4001/health/db`

---

### 3.2 Docker Compose – Môi trường phát triển Local

**Mục tiêu**: `docker-compose up` là đủ để chạy toàn bộ app + database locally.

#### Services cần define

| Service | Image | Ports | Ghi chú |
|---------|-------|-------|---------|
| `db` | `postgres:16-alpine` | 5432 | Volume persistent, schema tự apply qua `docker-entrypoint-initdb.d/` |
| `api` | Build từ `Dockerfile` | 4001 | depends_on `db`, env vars inject trực tiếp |

#### Files cần tạo

- `docker-compose.yml` (root)
- `docker-compose.override.yml` (tùy chọn – bind mount cho hot reload dev)

#### Điều kiện tích hợp

- [ ] Docker Desktop (hoặc Docker Engine) đã cài
- [ ] Test: `docker-compose up -d` → verify API + DB hoạt động
- [ ] Schema tự apply khi DB container khởi tạo lần đầu

---

### 3.3 Docker Hub – Container Registry

| Hạng mục | Chi tiết |
|----------|----------|
| Repository name | `<dockerhub-user>/devsecops-app` |
| Tagging strategy | `latest`, `v1.0.0`, `sha-<git-short-hash>`, `develop` |
| Access | Dùng Access Token (không dùng password) |

#### Điều kiện tích hợp

- [ ] Docker Hub account + repository đã tạo
- [ ] Access Token đã tạo
- [ ] `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` trong GitHub Secrets
- [ ] Test push thành công từ local

---

## 4. Hạ tầng Cloud (AWS)

### 4.1 Kiến trúc tổng quan

```text
VPC
├── Public Subnet
│   └── EC2 (Docker → App container, Monitoring stack)
│       └── Security Group: SSH(22), HTTP(80), HTTPS(443), API(4001)
│
└── Private Subnet
    └── RDS PostgreSQL
        └── Security Group: 5432 chỉ từ EC2 SG

S3: Backup bucket (private)
IAM: EC2 Instance Role, GitHub Actions OIDC Role
Secrets Manager: Tất cả secrets của ứng dụng
```

### 4.2 AWS EC2 – Compute

| Config | Đề xuất |
|--------|---------|
| Instance type | `t3.small` (2 vCPU, 2GB RAM) |
| AMI | Amazon Linux 2023 hoặc Ubuntu 24.04 LTS |
| Storage | 20GB gp3 |
| Elastic IP | 1 Elastic IP cố định |
| Software cần cài | Docker, Docker Compose, (tùy chọn) Nginx |

#### Điều kiện tích hợp

- [ ] AWS Account
- [ ] VPC + Subnet đã cấu hình
- [ ] EC2 instance đã launch, Security Group phù hợp
- [ ] Elastic IP đã gán
- [ ] Docker + Docker Compose đã cài trên EC2
- [ ] SSH key đã thêm vào GitHub Secrets

---

### 4.3 AWS RDS – Managed PostgreSQL

| Config | Đề xuất |
|--------|---------|
| Engine | PostgreSQL 16 |
| Instance class | `db.t3.micro` (Free Tier) hoặc `db.t3.small` |
| Storage | 20GB gp3, auto-scaling |
| Public access | **Không** – chỉ EC2 trong cùng VPC |
| Backup | Automated, retention 7 ngày |
| Encryption | At-rest enabled (KMS) |

> **Lưu ý**: File `db/index.js` hiện có `ssl: { rejectUnauthorized: false }` — khi chuyển sang RDS cần cấu hình đúng CA cert với `rejectUnauthorized: true`.

#### Điều kiện tích hợp

- [ ] RDS instance trong private subnet
- [ ] Security Group chỉ cho phép EC2 SG truy cập port 5432
- [ ] Schema đã apply (`db/schema.sql`)
- [ ] Data đã migrate từ Neon (nếu có)
- [ ] `DATABASE_URL` đã lưu trong Secrets Manager
- [ ] Test kết nối từ EC2

---

### 4.4 AWS S3 – Lưu trữ

| Bucket | Mục đích | Access |
|--------|----------|--------|
| `devsecops-app-backups` | DB backups, log archives | Private, lifecycle policy (xóa sau 90 ngày) |
| `devsecops-app-assets` | Product images (tương lai) | Public read hoặc presigned URLs |

#### Điều kiện tích hợp

- [ ] S3 bucket đã tạo với Block Public Access (cho backups)
- [ ] Lifecycle policy đã cấu hình
- [ ] IAM role cho EC2 có quyền S3 access
- [ ] Encryption at rest enabled

---

### 4.5 AWS IAM – Phân quyền (Least Privilege)

#### Roles cần tạo

| Role | Gán cho | Permissions chính |
|------|---------|-------------------|
| `EC2-ECommerceApp-Role` | EC2 Instance Profile | SecretsManager:GetSecretValue, S3 backup access, CloudWatch Logs |
| `GithubActions-Deploy-Role` | GitHub Actions (OIDC) | EC2 SSH (qua SSM), S3 access |

#### Nguyên tắc

- Không dùng IAM user access keys trên EC2 → dùng Instance Role
- GitHub Actions dùng OIDC provider thay vì static credentials
- MFA enabled cho tất cả IAM users
- Không dùng root account cho daily operations

#### Điều kiện tích hợp

- [ ] IAM roles đã tạo với least privilege
- [ ] EC2 Instance Profile đã gán
- [ ] (Tùy chọn) GitHub OIDC provider đã cấu hình
- [ ] MFA enabled cho IAM users

---

### 4.6 AWS Secrets Manager – Quản lý Secret tập trung

#### Secrets cần lưu

| Secret Name | Keys | Mô tả |
|-------------|------|--------|
| `devsecops-app/database` | `DATABASE_URL` | RDS connection string |
| `devsecops-app/jwt` | `JWT_SECRET` | JWT signing secret |
| `devsecops-app/stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | Stripe credentials |
| `devsecops-app/google-oauth` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth |
| `devsecops-app/app-config` | `CLIENT_ORIGIN`, `PORT`, `NODE_ENV` | App config |

#### Cách inject secrets vào container

**Đề xuất**: Docker entrypoint script dùng AWS CLI để lấy secrets → export thành env vars → chạy `node server.js`. Cách này không cần thay đổi code ứng dụng.

#### Điều kiện tích hợp

- [ ] Secrets Manager đã tạo tất cả secrets
- [ ] EC2 IAM Role có quyền `secretsmanager:GetSecretValue`
- [ ] Entrypoint script đã sẵn sàng
- [ ] Loại bỏ `.env` file trên production

---

## 5. Security Tooling (DevSecOps)

### Tổng quan Security Pipeline

| Phase | Tool | Type | Target | Trigger |
|-------|------|------|--------|---------|
| Commit | **Gitleaks** | Secret scanning | Source code + git history | Mỗi PR/push |
| Build | **SonarQube** | SAST | JS/JSX code | Mỗi PR/push |
| Build | **OWASP Dependency-Check** | SCA | npm packages | Mỗi PR + weekly |
| Build | **npm audit** | SCA | npm packages | Mỗi PR/push |
| Package | **Trivy** (image scan) | Container scan | Docker image | Sau Docker build |
| Build | **Trivy** (fs scan) | SCA | Dependencies | Mỗi PR/push |
| Deploy | **OWASP ZAP** | DAST | Running app (staging) | Sau deploy staging |

---

### 5.1 SonarQube – SAST

| Hạng mục | Chi tiết |
|----------|----------|
| Option A | **SonarCloud** (SaaS, free cho open source) — dễ setup |
| Option B | **SonarQube Community** (self-hosted trên EC2 via Docker) — full control |
| Quét | Code smells, bugs, vulnerabilities, security hotspots |
| File cần tạo | `sonar-project.properties` |
| Quality Gate | Sonar way (recommended) — block merge nếu không pass |

#### Điều kiện tích hợp

- [ ] SonarCloud account hoặc SonarQube server đã setup
- [ ] `SONAR_TOKEN` trong GitHub Secrets
- [ ] `sonar-project.properties` đã tạo ở root
- [ ] PR decoration enabled (comment kết quả trên PR)

---

### 5.2 Gitleaks – Secret Scanning

| Hạng mục | Chi tiết |
|----------|----------|
| Quét | API keys, passwords, tokens, private keys trong code & git history |
| GitHub Action | `gitleaks/gitleaks-action@v2` |
| File tùy chọn | `.gitleaks.toml` (custom rules, allowlist) |

#### Điều kiện tích hợp

- [ ] Gitleaks action trong CI workflow
- [ ] (Tùy chọn) `.gitleaks.toml` cho custom rules
- [ ] (Tùy chọn) Pre-commit hook: `gitleaks protect --staged`
- [ ] Verify: không có secrets trong git history hiện tại

---

### 5.3 Trivy – Container Image / Dependency Scan

| Hạng mục | Chi tiết |
|----------|----------|
| Scan types | Image scan (sau Docker build) + Filesystem scan (dependencies) |
| Severity policy | CRITICAL, HIGH → fail pipeline |
| Output | SARIF → upload lên GitHub Security tab |
| GitHub Action | `aquasecurity/trivy-action@master` |

#### Điều kiện tích hợp

- [ ] Trivy action trong Docker build workflow
- [ ] SARIF upload cho GitHub Security tab
- [ ] Quyết định policy: block deploy khi CRITICAL? hoặc chỉ warning?
- [ ] (Tùy chọn) `.trivyignore` cho false positives

---

### 5.4 OWASP Dependency-Check – SCA

| Hạng mục | Chi tiết |
|----------|----------|
| Quét | CVE đã biết trong npm dependencies |
| CVSS threshold | Fail khi CVSS ≥ 7 (đề xuất) |
| NVD API key | Cần để tránh rate limiting (free) |
| Output | HTML + JSON report → upload artifact |

#### Điều kiện tích hợp

- [ ] OWASP Dependency-Check action trong CI workflow
- [ ] `NVD_API_KEY` trong GitHub Secrets
- [ ] Quyết định CVSS threshold
- [ ] Review report, tạo exceptions cho false positives

---

### 5.5 OWASP ZAP – DAST

| Hạng mục | Chi tiết |
|----------|----------|
| Scan types | Baseline scan (nhanh, ~5 phút) + Full scan (weekly, ~30+ phút) |
| Môi trường | **Chỉ chạy trên staging**, không chạy trên production |
| File tùy chọn | `.zap-rules.tsv` (ignore/warn rules) |

#### Lỗ hổng ZAP có thể phát hiện trên dự án hiện tại

| Potential Finding | Nguyên nhân |
|-------------------|-------------|
| Missing CSP header | `app.js` chưa set Content-Security-Policy |
| Missing X-Content-Type-Options | Chưa set security headers |
| Missing X-Frame-Options | Chưa có `helmet` middleware |

> **Đề xuất bổ sung**: Cài npm package `helmet` vào `app.js` để tự động set security headers — sẽ fix phần lớn DAST findings.

#### Điều kiện tích hợp

- [ ] Staging environment đã có
- [ ] ZAP action trong workflow (chạy sau deploy staging)
- [ ] (Tùy chọn) `.zap-rules.tsv` cho exceptions
- [ ] (Khuyến nghị) Cài `helmet` cho security headers

---

## 6. Monitoring & Logging

### 6.1 Kiến trúc tổng quan

```text
App (Node.js + prom-client) ──metrics──► Prometheus ──► Grafana (dashboards + alerts)
EC2 (Node Exporter)         ──metrics──► Prometheus ──► Grafana

App logs / Docker logs ──► Promtail ──► Loki ──► Grafana (log explorer)
```

### 6.2 Các thành phần

| Tool | Mục đích | Port | Deploy as |
|------|----------|------|-----------|
| **Prometheus** | Thu thập & lưu metrics | 9090 | Docker container trên EC2 |
| **Grafana** | Dashboard trực quan, alerts | 3000 | Docker container trên EC2 |
| **Node Exporter** | Export metrics hệ thống (CPU, RAM, Disk, Network) | 9100 | Docker container trên EC2 |
| **Loki** | Log storage tập trung | 3100 | Docker container trên EC2 |
| **Promtail** | Thu thập Docker logs + system logs → gửi về Loki | 9080 | Docker container trên EC2 |

### 6.3 Files cần tạo

- `monitoring/prometheus/prometheus.yml` – scrape targets config
- `monitoring/grafana/provisioning/datasources/datasources.yml` – auto-configure data sources
- `monitoring/loki/loki-config.yml` – storage + retention config
- `monitoring/promtail/promtail-config.yml` – log sources config
- `monitoring/docker-compose.monitoring.yml` – tất cả monitoring services

### 6.4 Dashboards cần thiết

| Dashboard | Data Source | Panels chính |
|-----------|------------|--------------|
| System Overview | Prometheus → Node Exporter | CPU, RAM, Disk, Network |
| Application Metrics | Prometheus → prom-client | Request rate, latency, error rate |
| Logs Explorer | Loki | Log search, error filtering |

### 6.5 Yêu cầu thay đổi code backend (nhỏ)

- Cài `prom-client` và thêm endpoint `GET /metrics` vào `app.js` để Prometheus scrape application-level metrics

### 6.6 Security cho monitoring

- Prometheus (9090), Loki (3100): chỉ internal access
- Grafana (3000): chỉ admin IP, đổi admin password mặc định

#### Điều kiện tích hợp

- [ ] Tạo thư mục `monitoring/` với config files
- [ ] Docker Compose cho monitoring stack
- [ ] (Cần thay đổi code nhỏ) Cài `prom-client` + thêm `/metrics` endpoint
- [ ] Grafana dashboards imported + alerts cấu hình
- [ ] Security Groups cho monitoring ports

---

## 7. Backup & Cost Governance

### 7.1 PostgreSQL Backup trên AWS RDS

| Cơ chế | Chi tiết |
|--------|----------|
| RDS Automated Backup | Daily snapshot, retention 7–35 ngày |
| Manual Snapshot | Trước mỗi deployment lớn |
| Point-in-Time Recovery | Restore DB đến bất kỳ thời điểm trong retention window |
| S3 Export (bổ sung) | Cron job `pg_dump` → gzip → upload S3 hàng ngày |

#### Điều kiện tích hợp

- [ ] RDS automated backup đã enabled
- [ ] (Tùy chọn) Cron job pg_dump → S3
- [ ] Test restore procedure thành công ít nhất 1 lần
- [ ] Document restore process trong `docs/runbook.md`

---

### 7.2 Theo dõi & Cảnh báo Chi phí AWS

#### AWS Budgets cần tạo

| Budget | Threshold | Alert |
|--------|-----------|-------|
| Monthly overall | $50/tháng (điều chỉnh) | 50%, 80% actual + 100% forecasted → email |
| EC2 specific | $30/tháng | 80% actual → email |
| RDS specific | $15/tháng | 80% actual → email |

#### Resource Tagging Standard

| Tag Key | Example Value | Bắt buộc |
|---------|---------------|----------|
| `Project` | `devsecops-app` | ✅ |
| `Environment` | `production` / `staging` / `development` | ✅ |
| `Owner` | `devops-team` | ✅ |

#### Cost optimization checklist

- EC2: Cân nhắc Reserved Instance nếu chạy ổn định (~30-40% saving)
- EC2: Right-sizing dựa trên CloudWatch metrics
- RDS: Stop dev/staging DB ngoài giờ (~60% saving)
- S3: Lifecycle policy Standard → IA → Glacier
- EIP: Release Elastic IPs không dùng ($3.6/tháng mỗi cái)
- Snapshots: Xóa RDS/EBS snapshots cũ

#### Điều kiện tích hợp

- [ ] AWS Budgets đã tạo
- [ ] Cost Explorer đã enable
- [ ] Resource tagging đã áp dụng
- [ ] Monthly cost review process đã document

---

## 8. Lộ trình triển khai đề xuất

| Phase | Tuần | Nội dung | Priority |
|-------|------|----------|----------|
| **1. Foundation** | 1–2 | GitHub setup (branch protection, templates, CODEOWNERS) · Git Flow · Dockerfile · Docker Compose · Docker Hub | 🔴 HIGH |
| **2. CI/CD** | 3–4 | CI workflow (lint + test + build) · Docker build + push · Gitleaks · Trivy · npm audit | 🔴 HIGH |
| **3. AWS Infra** | 5–6 | VPC + SG · EC2 · RDS PostgreSQL · IAM Roles · Secrets Manager · Deploy workflow | 🔴 HIGH |
| **4. Security** | 7–8 | SonarQube · OWASP Dep-Check · OWASP ZAP · `helmet` middleware · SSL/TLS | 🟡 MEDIUM-HIGH |
| **5. Monitoring** | 9–10 | Prometheus · Node Exporter · Grafana · Loki · Promtail · `prom-client` | 🟡 MEDIUM |
| **6. Governance** | 11–12 | S3 backup · RDS backup verify · AWS Budgets · Cost tagging · Runbook | 🟢 MEDIUM-LOW |

---

## 9. Tóm tắt Files & Thư mục cần tạo

```text
DevSecOps-App/
├── Dockerfile                              # Phase 1
├── .dockerignore                           # Phase 1
├── docker-compose.yml                      # Phase 1
├── sonar-project.properties                # Phase 4
├── .gitleaks.toml                          # Phase 2 (tùy chọn)
├── .trivyignore                            # Phase 2 (tùy chọn)
├── .zap-rules.tsv                          # Phase 4 (tùy chọn)
│
├── .github/
│   ├── CODEOWNERS                          # Phase 1
│   ├── PULL_REQUEST_TEMPLATE.md            # Phase 1
│   ├── ISSUE_TEMPLATE/                     # Phase 1
│   └── workflows/
│       ├── ci.yml                          # Phase 2
│       ├── security-scan.yml               # Phase 2/4
│       ├── docker-build-push.yml           # Phase 2
│       └── deploy.yml                      # Phase 3
│
├── monitoring/
│   ├── prometheus/prometheus.yml           # Phase 5
│   ├── grafana/provisioning/datasources/   # Phase 5
│   ├── loki/loki-config.yml                # Phase 5
│   ├── promtail/promtail-config.yml        # Phase 5
│   └── docker-compose.monitoring.yml       # Phase 5
│
└── docs/
    ├── devsecops-roadmap.md                # File này
    ├── CONTRIBUTING.md                     # Phase 1
    └── runbook.md                          # Phase 6
```

---

## 10. Tóm tắt GitHub Secrets cần cấu hình

| Secret | Mục đích | Phase |
|--------|----------|-------|
| `DATABASE_URL` | CI tests | 2 |
| `JWT_SECRET` | CI tests | 2 |
| `DOCKERHUB_USERNAME` | Docker Hub | 2 |
| `DOCKERHUB_TOKEN` | Docker Hub | 2 |
| `AWS_EC2_HOST` | Deploy | 3 |
| `AWS_EC2_USER` | Deploy | 3 |
| `AWS_EC2_SSH_KEY` | Deploy | 3 |
| `SONAR_TOKEN` | SonarQube | 4 |
| `SONAR_HOST_URL` | SonarQube | 4 |
| `NVD_API_KEY` | OWASP Dep-Check | 4 |

---

> **Ghi chú**: Đây là living document — cập nhật khi triển khai từng phase. Mỗi section có checklist "Điều kiện tích hợp" — hoàn thành tất cả trước khi chuyển sang phase tiếp theo.

# Deploy on Plesk with Docker

## 1. Upload the project

- **Option A:** In Plesk → **Domains** → your domain → **Git** (if available), clone the repo.
- **Option B:** Upload the project via **File Manager** or SFTP to a folder (e.g. `security`).

## 2. Set environment variables on the server

In the project root, create or edit `.env` (and keep `backend/.env` for backend-only vars if you prefer).

**Project root `.env`** (for docker-compose and frontend build):

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

**Backend `backend/.env`** (copy from `backend/.env`, then set production values):

- `DATABASE_URL` – e.g. keep SQLite `sqlite:///./data/security.db` or use PostgreSQL
- `SECRET_KEY` – strong random secret
- `CORS_ORIGINS` – comma-separated frontend origins, e.g. `https://yourdomain.com,https://www.yourdomain.com`
- Mail settings if you use email

## 3. Run with Docker in Plesk

### Using Plesk Docker extension

1. In Plesk sidebar click **Docker**.
2. If **Docker Compose** is available: choose the project directory, use `docker-compose.yml`, set the env vars above, then start.
3. If you only have **Containers**: build and run the two images manually (see “Without compose” below).

### Using SSH

```bash
cd /path/to/security
export NEXT_PUBLIC_API_URL=https://api.yourdomain.com
docker compose up -d --build
```

Create super admin (one-time):

```bash
docker compose --profile admin run --rm create-super-admin
```

## 4. Point your domain to the app

- **Frontend:** In **Websites & Domains** → your domain → **Hosting & DNS** → set **Proxy mode** or **Redirect** to `http://127.0.0.1:3000` (or use Plesk’s reverse proxy to the frontend container).
- **Backend (API):** Create a subdomain (e.g. `api.yourdomain.com`) and proxy it to `http://127.0.0.1:8000`.

Use the same URLs in `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS` so the frontend can call the API.

## 5. Ports

- Frontend: **3000**
- Backend: **8000**

Ensure these ports are not blocked and that the proxy targets match where Docker exposes them (usually `127.0.0.1:3000` and `127.0.0.1:8000`).

# TopEdu API (NestJS)

NestJS authentication backend for `topedu-app`.

## Features

- PostgreSQL + Prisma
- Register / Verify Email / Resend Verification / Login / Refresh / Logout / Me
- JWT access token
- HTTP-only refresh token cookie with rotation

## 1) Install

```bash
cd topedu-api
npm install
```

## 2) Configure env

Copy `.env.example` to `.env` and set values:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_ORIGIN`
- `EMAIL_VERIFICATION_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## 3) Create DB tables

```bash
npx prisma generate
npx prisma migrate dev --name init_auth
```

## 4) Run

```bash
npm run start:dev
```

Default API base URL: `http://localhost:3000/api`

## Frontend compatibility

This API matches the frontend calls in `topedu-app/js/auth.js`:

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Cookie notes

- Refresh token is set as HTTP-only cookie (`refreshToken`)
- Path is `/api/auth`
- In production, cookie is `secure: true`

## SMTP notes

- Email verification is sent via SMTP using `nodemailer`
- `SMTP_SECURE=true` is usually used with port `465`
- `SMTP_SECURE=false` is usually used with port `587`

## Deploy on Vercel + Neon

- This project includes a Vercel serverless entry at `api/index.ts` and config in `vercel.json`
- Keep frontend calls as `/api/auth/*` (global prefix is `api`)
- Set Vercel environment variables for all keys from `.env.example`
- For Neon, use pooled URL for `DATABASE_URL` and direct URL for `DIRECT_URL`
- Run migrations with `npx prisma migrate deploy` in CI/CD before or during release

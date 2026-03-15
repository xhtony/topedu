# TopEdu API (NestJS)

NestJS authentication backend for `topedu-app`.

## Features

- MySQL + Prisma
- Register / Verify Email / Resend Verification / Login / Change Password / Refresh / Logout / Me
- Student timetable selection with admin approval
- Admin timetable publishing for this week and future weeks
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
- `PASSWORD_RESET_EXPIRES_IN_MINUTES`
- `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`

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
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/student/timetable`
- `POST /api/student/select-course`
- `GET /api/admin/users?email=...`
- `GET /api/admin/users/:userId`
- `GET /api/admin/timetable?weekOffset=0`
- `POST /api/admin/timetable/publish`
- `POST /api/admin/selections/:selectionId/approve`

## Default admin account

- Username: `admin`
- Email: `topedu.co.nz@gmail.com`
- Initial password: `88888888`
- The admin account must change password after first successful login

## Cookie notes

- Refresh token is set as HTTP-only cookie (`refreshToken`)
- Path is `/api/auth`
- In production, cookie is `secure: true`

## SendGrid API notes

- Email verification is sent using SendGrid API (`@sendgrid/mail`)
- Password reset code is sent using SendGrid API (`@sendgrid/mail`)
- Set `SENDGRID_API_KEY` to a SendGrid API key with Mail Send permission
- `SENDGRID_FROM_EMAIL` must be a verified sender in SendGrid

## Deploy on Vercel + MySQL

- This project includes a Vercel serverless entry at `api/index.ts` and config in `vercel.json`
- Keep frontend calls as `/api/auth/*` (global prefix is `api`)
- Set Vercel environment variables for all keys from `.env.example`
- Use `DATABASE_URL` and `DIRECT_URL` with your MySQL connection strings
- Run migrations with `npx prisma migrate deploy` in CI/CD before or during release

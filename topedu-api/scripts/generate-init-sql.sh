#!/bin/bash
# Regenerate prisma/sql/init.sql from schema.prisma
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/prisma/sql/init.sql"

mkdir -p "$(dirname "$OUT")"

{
  cat <<'HEADER'
-- TopEdu production database schema (MySQL 8+)
-- Generated from prisma/schema.prisma — do not edit by hand.
-- Regenerate: npm run prisma:sql-init
--
-- Usage (empty database):
--   mysql -h HOST -u USER -p DATABASE < prisma/sql/init.sql
--
-- Notes:
-- - No foreign keys (relationMode = "prisma" in schema.prisma)
-- - Default admin account is created on first API startup (auth.service.ts)

HEADER
  npx prisma migrate diff \
    --from-empty \
    --to-schema-datamodel prisma/schema.prisma \
    --script
} > "$OUT"

echo "Wrote $OUT"

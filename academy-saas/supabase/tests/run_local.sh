#!/bin/sh
# Runs the schema + RLS tests on a throwaway local PostgreSQL (needs psql and a running server).
# Usage: PGURL=postgres://postgres@localhost:5432/postgres sh supabase/tests/run_local.sh
set -e
cd "$(dirname "$0")"
psql "$PGURL" -q -c 'drop schema if exists public cascade; drop schema if exists app cascade; drop schema if exists auth cascade; drop schema if exists t cascade; create schema public;'
psql "$PGURL" -q -v ON_ERROR_STOP=1 -f local_auth_stub.sql $(for f in ../migrations/*.sql; do printf -- '-f %s ' "$f"; done) -f rls_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|ALL TESTS"

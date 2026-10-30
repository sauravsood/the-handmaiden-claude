#!/usr/bin/env bash
# Applies the migrations to a scratch database on a local Postgres and runs
# the SQL tests. Usage: PGHOST=... PGPORT=... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGUSER=${PGUSER:-postgres}
psql -q -d postgres -c 'drop database if exists handmaiden_test' -c 'create database handmaiden_test'
psql -q -v ON_ERROR_STOP=1 -d handmaiden_test -f supabase/tests/local_stubs.sql
psql -q -v ON_ERROR_STOP=1 -d handmaiden_test -f supabase/migrations/20261030000001_init.sql
psql -q -v ON_ERROR_STOP=1 -d handmaiden_test -c 'grant all on all tables in schema public to authenticated, service_role; grant all on all sequences in schema public to authenticated, service_role; grant select, insert on storage.objects to authenticated'
psql -q -v ON_ERROR_STOP=1 -d handmaiden_test -f supabase/tests/tests.sql
echo "SQL tests passed"

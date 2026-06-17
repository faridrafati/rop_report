-- DrillIQ RLS: tenant isolation on every client-scoped table.
-- Policy: a row is visible/writable only when its client_id matches the
-- per-request GUC app.current_client_id (set via SET LOCAL inside the request txn).
-- The app connects as drilliq_app (non-owner, NO BYPASSRLS); FORCE applies RLS to owners too.
-- See docs/data-model.md §Contractor isolation.

-- Ensure the restricted app role can use the schema + future objects.
GRANT USAGE ON SCHEMA public TO drilliq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO drilliq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO drilliq_app;

-- Fail-closed accessor: empty/unset GUC -> NULL -> predicate is false (no rows).
CREATE OR REPLACE FUNCTION app_current_client_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_client_id', true), '')::uuid
  $$;

-- rig
ALTER TABLE "rig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rig";
CREATE POLICY tenant_isolation ON "rig"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- well
ALTER TABLE "well" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "well" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "well";
CREATE POLICY tenant_isolation ON "well"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- wellbore
ALTER TABLE "wellbore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wellbore" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "wellbore";
CREATE POLICY tenant_isolation ON "wellbore"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- well_section
ALTER TABLE "well_section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "well_section" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "well_section";
CREATE POLICY tenant_isolation ON "well_section"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- formation_top
ALTER TABLE "formation_top" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "formation_top" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "formation_top";
CREATE POLICY tenant_isolation ON "formation_top"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- lithology_interval
ALTER TABLE "lithology_interval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lithology_interval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "lithology_interval";
CREATE POLICY tenant_isolation ON "lithology_interval"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- trajectory
ALTER TABLE "trajectory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trajectory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trajectory";
CREATE POLICY tenant_isolation ON "trajectory"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- survey_station
ALTER TABLE "survey_station" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_station" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "survey_station";
CREATE POLICY tenant_isolation ON "survey_station"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- bit_master
ALTER TABLE "bit_master" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bit_master" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bit_master";
CREATE POLICY tenant_isolation ON "bit_master"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- bit_run
ALTER TABLE "bit_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bit_run" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bit_run";
CREATE POLICY tenant_isolation ON "bit_run"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- bit_nozzle
ALTER TABLE "bit_nozzle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bit_nozzle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bit_nozzle";
CREATE POLICY tenant_isolation ON "bit_nozzle"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- daily_report
ALTER TABLE "daily_report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_report" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "daily_report";
CREATE POLICY tenant_isolation ON "daily_report"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- activity
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity";
CREATE POLICY tenant_isolation ON "activity"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- fluid
ALTER TABLE "fluid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fluid" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fluid";
CREATE POLICY tenant_isolation ON "fluid"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- plan
ALTER TABLE "plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "plan";
CREATE POLICY tenant_isolation ON "plan"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- recommendation
ALTER TABLE "recommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "recommendation";
CREATE POLICY tenant_isolation ON "recommendation"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- app_user
ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_user" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "app_user";
CREATE POLICY tenant_isolation ON "app_user"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- audit_log
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_log";
CREATE POLICY tenant_isolation ON "audit_log"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

-- approval
ALTER TABLE "approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "approval";
CREATE POLICY tenant_isolation ON "approval"
  USING (client_id = app_current_client_id())
  WITH CHECK (client_id = app_current_client_id());

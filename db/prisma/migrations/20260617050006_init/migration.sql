-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MANAGEMENT', 'OFFICE_ENGINEER', 'OPERATION_ENGINEER', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "WellStatus" AS ENUM ('PLANNED', 'DRILLING', 'SUSPENDED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "BitFamily" AS ENUM ('TCI', 'MILLED_TOOTH', 'PDC', 'DIAMOND', 'OTHER');

-- CreateEnum
CREATE TYPE "BitClass" AS ENUM ('N', 'U');

-- CreateEnum
CREATE TYPE "ActivityClass" AS ENUM ('PLANNED', 'UNPLANNED', 'DOWNTIME');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('BIT_PROGRAM', 'PARAMETER_OPT', 'OFFSET_BENCHMARK');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN');

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legacy_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "refresh_token_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rig" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contractor_id" UUID,
    "rig_type" TEXT,
    "rating_hp" INTEGER,
    "day_rate" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "well" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT,
    "field_code" TEXT,
    "spud_date" DATE,
    "rig_id" UUID,
    "contractor_id" UUID,
    "well_type_id" UUID,
    "well_profile_id" UUID,
    "surface_lat" DECIMAL(9,6),
    "surface_lon" DECIMAL(9,6),
    "status" "WellStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "well_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wellbore" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "well_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_wellbore_id" UUID,
    "kickoff_md" DECIMAL(10,2),
    "total_md" DECIMAL(10,2),
    "total_tvd" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wellbore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "well_section" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "wellbore_id" UUID NOT NULL,
    "hole_size_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "top_md" DECIMAL(10,2),
    "base_md" DECIMAL(10,2),
    "casing_size" TEXT,
    "cement_top_md" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "well_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formation" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "abbreviation" TEXT,
    "name_en" TEXT NOT NULL,
    "name_fa" TEXT,
    "period" TEXT,

    CONSTRAINT "formation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formation_top" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "well_section_id" UUID NOT NULL,
    "formation_id" UUID NOT NULL,
    "top_md" DECIMAL(10,2),
    "top_tvd" DECIMAL(10,2),
    "prognosed_md" DECIMAL(10,2),

    CONSTRAINT "formation_top_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lithology" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hardness_class" TEXT,

    CONSTRAINT "lithology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lithology_interval" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "formation_top_id" UUID NOT NULL,
    "lithology_id" UUID NOT NULL,
    "top_md" DECIMAL(10,2),
    "base_md" DECIMAL(10,2),
    "pct" DECIMAL(5,2),

    CONSTRAINT "lithology_interval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "wellbore_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "survey_tool" TEXT,
    "run_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trajectory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_station" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "trajectory_id" UUID NOT NULL,
    "md" DECIMAL(10,2) NOT NULL,
    "inc" DECIMAL(7,3) NOT NULL,
    "azm" DECIMAL(7,3) NOT NULL,
    "tvd" DECIMAL(10,2) NOT NULL,
    "ns" DECIMAL(12,3) NOT NULL,
    "ew" DECIMAL(12,3) NOT NULL,
    "dls" DECIMAL(7,3),

    CONSTRAINT "survey_station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bit_master" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "serial_no" TEXT,
    "manufacturer" TEXT NOT NULL,
    "type_bit" TEXT NOT NULL,
    "bit_family" "BitFamily" NOT NULL,
    "dia_bit" DECIMAL(7,3) NOT NULL,
    "hole_size_id" UUID,
    "code_iadc" TEXT,
    "tfa" DECIMAL(8,4),
    "bit_cost" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bit_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bit_run" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "wellbore_id" UUID NOT NULL,
    "well_section_id" UUID,
    "bit_master_id" UUID NOT NULL,
    "num_bit" INTEGER,
    "depth_in" DECIMAL(10,2),
    "depth_out" DECIMAL(10,2),
    "footage" DECIMAL(10,2),
    "rotating_hours" DECIMAL(8,2),
    "trip_hours" DECIMAL(8,2),
    "wob" DECIMAL(12,4),
    "rpm" DECIMAL(8,2),
    "torque" DECIMAL(12,4),
    "rop" DECIMAL(12,4),
    "flow_rate" DECIMAL(10,2),
    "mud_weight" DECIMAL(7,3),
    "p_bit" DECIMAL(12,4),
    "dh_motor_type_id" UUID,
    "reason_pulled_id" UUID,
    "cond_final_inner" INTEGER,
    "cond_final_outer" INTEGER,
    "cond_final_dull_char" CHAR(2),
    "cond_final_location" TEXT,
    "cond_final_bearing" TEXT,
    "cond_final_gauge" TEXT,
    "cond_final_other" CHAR(2),
    "cond_final_reason" TEXT,
    "cond_init_inner" INTEGER,
    "cond_init_outer" INTEGER,
    "cond_init_dull_char" CHAR(2),
    "cond_init_location" TEXT,
    "cond_init_bearing" TEXT,
    "cond_init_gauge" TEXT,
    "cond_init_other" CHAR(2),
    "cond_init_reason" TEXT,
    "bit_class" "BitClass",
    "mse" DECIMAL(14,4),
    "mse_efficiency" DECIMAL(6,4),
    "friction_mu" DECIMAL(8,5),
    "hhp_bit" DECIMAL(12,4),
    "hsi" DECIMAL(8,4),
    "cost_per_foot" DECIMAL(14,4),
    "founder_flag" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bit_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bit_nozzle" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "bit_run_id" UUID NOT NULL,
    "nozzle_size_id" UUID NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER,

    CONSTRAINT "bit_nozzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "wellbore_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "report_no" INTEGER,
    "depth_start_md" DECIMAL(10,2),
    "depth_end_md" DECIMAL(10,2),
    "status_info" TEXT,
    "present_operation" TEXT,
    "day_cost" DECIMAL(14,2),
    "cum_cost" DECIMAL(14,2),
    "personnel_count" INTEGER,
    "incidents" TEXT,
    "approval_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "daily_report_id" UUID NOT NULL,
    "activity_type_id" UUID,
    "iadc_op_code" TEXT,
    "start_time" TIMESTAMPTZ(6),
    "end_time" TIMESTAMPTZ(6),
    "duration_hr" DECIMAL(7,2),
    "depth_md" DECIMAL(10,2),
    "classification" "ActivityClass" NOT NULL,
    "is_productive" BOOLEAN NOT NULL,
    "npt_category" TEXT,
    "description" TEXT,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluid" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "daily_report_id" UUID NOT NULL,
    "mud_type_id" UUID,
    "check_depth_md" DECIMAL(10,2),
    "mw" DECIMAL(7,3),
    "pv" DECIMAL(8,3),
    "yp" DECIMAL(8,3),
    "gel_10s" DECIMAL(8,3),
    "gel_10m" DECIMAL(8,3),
    "ph" DECIMAL(4,2),
    "ecd" DECIMAL(7,3),
    "funnel_visc" DECIMAL(8,2),
    "solids_pct" DECIMAL(5,2),

    CONSTRAINT "fluid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "well_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PlanKind" NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "well_section_id" UUID,
    "bit_master_id" UUID,
    "target_wob" DECIMAL(12,4),
    "target_rpm" DECIMAL(8,2),
    "target_flow" DECIMAL(10,2),
    "predicted_rop" DECIMAL(12,4),
    "predicted_mse" DECIMAL(14,4),
    "rationale" TEXT,

    CONSTRAINT "recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "diff" JSONB,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hole_size" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "diameter_in" DECIMAL(7,3),

    CONSTRAINT "hole_size_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nozzle_size" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "size_32nds" INTEGER,

    CONSTRAINT "nozzle_size_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mud_type" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,

    CONSTRAINT "mud_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_pulled" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "reason_pulled_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "well_type" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "well_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "well_profile" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,

    CONSTRAINT "well_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh_motor_type" (
    "id" UUID NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "dh_motor_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_type" (
    "id" UUID NOT NULL,
    "group_code" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "activity_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_legacy_code_key" ON "client"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_client_id_email_idx" ON "app_user"("client_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_client_id_email_key" ON "app_user"("client_id", "email");

-- CreateIndex
CREATE INDEX "rig_client_id_contractor_id_idx" ON "rig"("client_id", "contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "rig_client_id_name_key" ON "rig"("client_id", "name");

-- CreateIndex
CREATE INDEX "well_client_id_field_idx" ON "well"("client_id", "field");

-- CreateIndex
CREATE INDEX "well_client_id_spud_date_idx" ON "well"("client_id", "spud_date");

-- CreateIndex
CREATE UNIQUE INDEX "well_client_id_name_key" ON "well"("client_id", "name");

-- CreateIndex
CREATE INDEX "wellbore_client_id_well_id_idx" ON "wellbore"("client_id", "well_id");

-- CreateIndex
CREATE UNIQUE INDEX "wellbore_client_id_well_id_name_key" ON "wellbore"("client_id", "well_id", "name");

-- CreateIndex
CREATE INDEX "well_section_client_id_wellbore_id_seq_idx" ON "well_section"("client_id", "wellbore_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "well_section_client_id_wellbore_id_seq_key" ON "well_section"("client_id", "wellbore_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "formation_legacy_code_key" ON "formation"("legacy_code");

-- CreateIndex
CREATE INDEX "formation_top_client_id_well_section_id_top_md_idx" ON "formation_top"("client_id", "well_section_id", "top_md");

-- CreateIndex
CREATE UNIQUE INDEX "lithology_legacy_code_key" ON "lithology"("legacy_code");

-- CreateIndex
CREATE INDEX "lithology_interval_client_id_formation_top_id_top_md_idx" ON "lithology_interval"("client_id", "formation_top_id", "top_md");

-- CreateIndex
CREATE INDEX "trajectory_client_id_wellbore_id_idx" ON "trajectory"("client_id", "wellbore_id");

-- CreateIndex
CREATE INDEX "survey_station_client_id_trajectory_id_md_idx" ON "survey_station"("client_id", "trajectory_id", "md");

-- CreateIndex
CREATE INDEX "bit_master_client_id_manufacturer_type_bit_idx" ON "bit_master"("client_id", "manufacturer", "type_bit");

-- CreateIndex
CREATE INDEX "bit_run_client_id_wellbore_id_depth_in_idx" ON "bit_run"("client_id", "wellbore_id", "depth_in");

-- CreateIndex
CREATE INDEX "bit_run_client_id_bit_master_id_idx" ON "bit_run"("client_id", "bit_master_id");

-- CreateIndex
CREATE INDEX "bit_nozzle_client_id_bit_run_id_idx" ON "bit_nozzle"("client_id", "bit_run_id");

-- CreateIndex
CREATE INDEX "daily_report_client_id_wellbore_id_report_date_idx" ON "daily_report"("client_id", "wellbore_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_report_client_id_wellbore_id_report_date_key" ON "daily_report"("client_id", "wellbore_id", "report_date");

-- CreateIndex
CREATE INDEX "activity_client_id_daily_report_id_start_time_idx" ON "activity"("client_id", "daily_report_id", "start_time");

-- CreateIndex
CREATE INDEX "fluid_client_id_daily_report_id_idx" ON "fluid"("client_id", "daily_report_id");

-- CreateIndex
CREATE INDEX "plan_client_id_well_id_idx" ON "plan"("client_id", "well_id");

-- CreateIndex
CREATE INDEX "recommendation_client_id_plan_id_idx" ON "recommendation"("client_id", "plan_id");

-- CreateIndex
CREATE INDEX "approval_client_id_status_idx" ON "approval"("client_id", "status");

-- CreateIndex
CREATE INDEX "approval_client_id_subject_type_subject_id_idx" ON "approval"("client_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "audit_log_client_id_created_at_idx" ON "audit_log"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_client_id_entity_type_entity_id_idx" ON "audit_log"("client_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_legacy_code_key" ON "contractor"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "hole_size_legacy_code_key" ON "hole_size"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "nozzle_size_legacy_code_key" ON "nozzle_size"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "mud_type_legacy_code_key" ON "mud_type"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "reason_pulled_code_key" ON "reason_pulled"("code");

-- CreateIndex
CREATE UNIQUE INDEX "well_type_legacy_code_key" ON "well_type"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "well_profile_legacy_code_key" ON "well_profile"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "dh_motor_type_legacy_code_key" ON "dh_motor_type"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX "activity_type_code_key" ON "activity_type"("code");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rig" ADD CONSTRAINT "rig_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rig" ADD CONSTRAINT "rig_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well" ADD CONSTRAINT "well_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well" ADD CONSTRAINT "well_rig_id_fkey" FOREIGN KEY ("rig_id") REFERENCES "rig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well" ADD CONSTRAINT "well_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well" ADD CONSTRAINT "well_well_type_id_fkey" FOREIGN KEY ("well_type_id") REFERENCES "well_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well" ADD CONSTRAINT "well_well_profile_id_fkey" FOREIGN KEY ("well_profile_id") REFERENCES "well_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellbore" ADD CONSTRAINT "wellbore_well_id_fkey" FOREIGN KEY ("well_id") REFERENCES "well"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellbore" ADD CONSTRAINT "wellbore_parent_wellbore_id_fkey" FOREIGN KEY ("parent_wellbore_id") REFERENCES "wellbore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well_section" ADD CONSTRAINT "well_section_wellbore_id_fkey" FOREIGN KEY ("wellbore_id") REFERENCES "wellbore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "well_section" ADD CONSTRAINT "well_section_hole_size_id_fkey" FOREIGN KEY ("hole_size_id") REFERENCES "hole_size"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formation_top" ADD CONSTRAINT "formation_top_well_section_id_fkey" FOREIGN KEY ("well_section_id") REFERENCES "well_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formation_top" ADD CONSTRAINT "formation_top_formation_id_fkey" FOREIGN KEY ("formation_id") REFERENCES "formation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lithology_interval" ADD CONSTRAINT "lithology_interval_formation_top_id_fkey" FOREIGN KEY ("formation_top_id") REFERENCES "formation_top"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lithology_interval" ADD CONSTRAINT "lithology_interval_lithology_id_fkey" FOREIGN KEY ("lithology_id") REFERENCES "lithology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory" ADD CONSTRAINT "trajectory_wellbore_id_fkey" FOREIGN KEY ("wellbore_id") REFERENCES "wellbore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_station" ADD CONSTRAINT "survey_station_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_master" ADD CONSTRAINT "bit_master_hole_size_id_fkey" FOREIGN KEY ("hole_size_id") REFERENCES "hole_size"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_run" ADD CONSTRAINT "bit_run_wellbore_id_fkey" FOREIGN KEY ("wellbore_id") REFERENCES "wellbore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_run" ADD CONSTRAINT "bit_run_well_section_id_fkey" FOREIGN KEY ("well_section_id") REFERENCES "well_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_run" ADD CONSTRAINT "bit_run_bit_master_id_fkey" FOREIGN KEY ("bit_master_id") REFERENCES "bit_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_run" ADD CONSTRAINT "bit_run_dh_motor_type_id_fkey" FOREIGN KEY ("dh_motor_type_id") REFERENCES "dh_motor_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_run" ADD CONSTRAINT "bit_run_reason_pulled_id_fkey" FOREIGN KEY ("reason_pulled_id") REFERENCES "reason_pulled"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_nozzle" ADD CONSTRAINT "bit_nozzle_bit_run_id_fkey" FOREIGN KEY ("bit_run_id") REFERENCES "bit_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bit_nozzle" ADD CONSTRAINT "bit_nozzle_nozzle_size_id_fkey" FOREIGN KEY ("nozzle_size_id") REFERENCES "nozzle_size"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report" ADD CONSTRAINT "daily_report_wellbore_id_fkey" FOREIGN KEY ("wellbore_id") REFERENCES "wellbore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluid" ADD CONSTRAINT "fluid_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluid" ADD CONSTRAINT "fluid_mud_type_id_fkey" FOREIGN KEY ("mud_type_id") REFERENCES "mud_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_well_id_fkey" FOREIGN KEY ("well_id") REFERENCES "well"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_well_section_id_fkey" FOREIGN KEY ("well_section_id") REFERENCES "well_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_bit_master_id_fkey" FOREIGN KEY ("bit_master_id") REFERENCES "bit_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

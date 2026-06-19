#!/usr/bin/env python3
"""
Legacy NIDC SQLite (new.sqlite, ex-Access new.mdb) -> ddr-app Supabase Postgres ETL.

Report-centric model: daily_reports is the hub (one row per distinct WellCode+date).
Every operational child resolves its (WellCode, fDate) to a report_id.

Env:
  SAMPLE_N   if >0, restrict to the first N wells (dry-run). 0/unset = full load.
  PG_DSN     override Postgres DSN.
Usage: python etl.py
"""
import os, sys, re, sqlite3, uuid, datetime
import psycopg

# Source sqlite. Resolves to <repo-root>/sqlite_DB/new.sqlite regardless of OS
# (this script lives in <repo>/migration/), so it works the same on Windows and
# Ubuntu. Override with SQLITE_SRC if the file lives elsewhere.
SRC = os.environ.get("SQLITE_SRC") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sqlite_DB", "new.sqlite"
)
if not os.path.exists(SRC):
    sys.exit(
        f"[etl] source sqlite not found: {SRC}\n"
        f"      Copy new.sqlite into <repo>/sqlite_DB/ or set SQLITE_SRC=/path/to/new.sqlite"
    )
PG_DSN = os.environ.get("PG_DSN", "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres")
MIG_USER = "697e3424-00c6-4263-9490-01523dbede98"  # existing profile (faridrafati@gmail.com)
SAMPLE_N = int(os.environ.get("SAMPLE_N", "0"))

# ---------------------------------------------------------------- helpers
def txt(v):
    if v is None: return None
    s = str(v).strip()
    if s == "" or s.lower() in ("null", "none", "n/a", "."): return None
    return s

_num_re = re.compile(r"-?\d+(?:\.\d+)?")
def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v
    s = str(v).strip().replace(",", "")
    if s == "": return None
    m = _num_re.search(s)
    return float(m.group()) if m else None

def inum(v):
    f = num(v)
    return int(round(f)) if f is not None else None

def size_parse(v):
    """Parse bit/casing sizes like '12 1/4', '5 7/8', '8 1/2', '5.875'."""
    if v is None: return None
    s = str(v).strip().replace('"', "").replace("”", "")
    if s == "": return None
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s+(\d+)\s*/\s*(\d+)\s*$", s)   # mixed: 12 1/4
    if m:
        return float(m.group(1)) + float(m.group(2)) / float(m.group(3))
    m = re.match(r"^\s*(\d+)\s*/\s*(\d+)\s*$", s)                     # fraction: 1/4
    if m:
        return float(m.group(1)) / float(m.group(2))
    return num(s)

def time_of(v):
    s = txt(v)
    if not s: return None
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", s)
    if not m: return None
    h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if h == 24 and mi == 0: h = 0
    if h > 23 or mi > 59 or se > 59: return None
    return datetime.time(h, mi, se)

def jalali_to_greg(jy, jm, jd):
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33 + 3) // 4) + jd
    if jm < 7: days += (jm - 1) * 31
    else: days += (jm - 7) * 30 + 186
    gy = 400 * (days // 146097); days %= 146097
    if days > 36524:
        days -= 1; gy += 100 * (days // 36524); days %= 36524
        if days >= 365: days += 1
    gy += 4 * (days // 1461); days %= 1461
    if days > 365:
        gy += (days - 1) // 365; days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or (gy % 400 == 0)
    months = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 12 and gd > months[gm]:
        gd -= months[gm]; gm += 1
    return datetime.date(gy, gm + 1, gd)

_date_re = re.compile(r"^\s*(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})")
def gdate(v):
    """Jalali 'YYYY/MM/DD' -> Gregorian date, else None."""
    s = txt(v)
    if not s: return None
    m = _date_re.match(s)
    if not m: return None
    jy, jm, jd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1200 <= jy <= 1450 and 1 <= jm <= 12 and 1 <= jd <= 31): return None
    try: return jalali_to_greg(jy, jm, jd)
    except Exception: return None

def datekey(v):
    """Normalized raw jalali key for joining (children share L04's date strings)."""
    s = txt(v)
    return s if s else None

# ---------------------------------------------------------------- infra
sl = sqlite3.connect(SRC); sl.row_factory = sqlite3.Row
pg = psycopg.connect(PG_DSN, autocommit=False)
counts = {}

WELLSET = None
if SAMPLE_N > 0:
    WELLSET = set(r[0].strip() for r in sl.execute(
        "SELECT DISTINCT TRIM(WellCode) w FROM L04 WHERE TRIM(WellCode)<>'' ORDER BY w LIMIT ?", (SAMPLE_N,)))
    print(f"[dry-run] limiting to {len(WELLSET)} wells")

def srows(table, where_well_col="WellCode"):
    """Yield sqlite rows, applying the dry-run well filter in Python."""
    for r in sl.execute(f"SELECT * FROM {table}"):
        if WELLSET is not None and where_well_col:
            wc = r[where_well_col]
            if wc is None or wc.strip() not in WELLSET:
                continue
        yield r

# max absolute value (exclusive) for each constrained numeric column: 10^(precision-scale)
NUMCONS = {}
with pg.cursor() as _c:
    _c.execute("""SELECT table_name, column_name, numeric_precision, numeric_scale
                  FROM information_schema.columns
                  WHERE table_schema='public' AND data_type='numeric' AND numeric_precision IS NOT NULL""")
    for _t, _col, _p, _s in _c.fetchall():
        NUMCONS[(_t, _col)] = 10 ** (_p - _s)

def copy_into(table, cols, rows):
    limits = [NUMCONS.get((table, c)) for c in cols]   # per-position overflow guard
    guarded = any(l is not None for l in limits)
    n = 0
    with pg.cursor() as cur:
        with cur.copy(f"COPY public.{table} ({','.join(cols)}) FROM STDIN") as cp:
            for row in rows:
                if guarded:
                    row = tuple(
                        (None if (lim is not None and type(v) in (int, float) and abs(v) >= lim) else v)
                        for v, lim in zip(row, limits))
                cp.write_row(row); n += 1
    counts[table] = n
    print(f"  {table:<26} {n:>9,}")
    return n

TARGET_TABLES = ["report_comments","bit_records","mud_records","mud_storage_parameters","bha_records",
    "drill_string_components","downhole_motor","jar_equipment","chemical_materials_usage",
    "solid_control_parameters","time_analysis","operation_analysis","directional_records",
    "formation_tops","casing_records","daily_problems","personnel_on_location","mwd_equipment",
    "stabilizers","equipment_used","daily_drilling_cost","bop_test","tools_failure","rop_records",
    "lithology_intervals","well_formation_tops","daily_reports","wells","rigs","fields","contractors",
    "well_types","well_profiles","mud_types","lithology_types","materials","bit_catalog",
    "casing_catalog","formation_types","equipment_catalog"]

def ensure_clean():
    """Non-destructive by default: require empty target tables. TRUNCATE only with explicit opt-in."""
    with pg.cursor() as cur:
        cur.execute("SELECT COALESCE(SUM(c),0) FROM (" +
            " UNION ALL ".join(f"SELECT count(*) c FROM public.{t}" for t in TARGET_TABLES) + ") s")
        total = cur.fetchone()[0]
    if total == 0:
        print("target tables empty — clean load")
        return
    if os.environ.get("ALLOW_TRUNCATE") == "1":
        with pg.cursor() as cur:
            cur.execute("TRUNCATE TABLE " + ", ".join("public."+t for t in TARGET_TABLES) + " RESTART IDENTITY CASCADE")
        print(f"reset target tables (had {total:,} rows)")
    else:
        raise SystemExit(f"ABORT: target tables hold {total:,} rows. "
                         f"Re-run with ALLOW_TRUNCATE=1 to reset, or clear them first.")

def smap(table, kcol, vfn):
    return {r[kcol].strip(): vfn(r) for r in sl.execute(f"SELECT * FROM {table}") if r[kcol] is not None}

# ---------------------------------------------------------------- lookups
def load_lookups():
    print("LOOKUPS")
    copy_into("fields", ["field_code","field_abri","field_name","area_code"],
        ((txt(r["FieldCode"]), txt(r["FieldAbri"]) or txt(r["FieldCode"]), txt(r["FieldName"]), txt(r["AreaCode"]))
         for r in sl.execute("SELECT * FROM Fields") if txt(r["FieldCode"])))
    # contractors = drilling Contractor + service Companies
    def contractor_rows():
        for r in sl.execute("SELECT * FROM Contractor"):
            if txt(r["ContractorCode"]) is not None:
                yield (txt(r["ContractorCode"]), txt(r["Contractor"]) or txt(r["ContractorCode"]), "drilling")
        for r in sl.execute("SELECT * FROM Companies"):
            if txt(r["CompanyCode"]) is not None:
                yield ("C"+txt(r["CompanyCode"]), txt(r["CompanyName"]) or txt(r["CompanyCode"]), "service")
    copy_into("contractors", ["contractor_code","contractor_name","contractor_type"], contractor_rows())
    copy_into("well_types", ["well_type_code","well_type_name"],
        ((txt(r["WellTypeCode"]), txt(r["WellType"]) or txt(r["WellTypeCode"]))
         for r in sl.execute("SELECT * FROM WellType") if txt(r["WellTypeCode"])))
    copy_into("well_profiles", ["profile_code","profile_name"],
        ((txt(r["WellProfileCode"]), txt(r["WellProfileName"]) or txt(r["WellProfileCode"]))
         for r in sl.execute("SELECT * FROM WellProfiles") if txt(r["WellProfileCode"])))
    copy_into("mud_types", ["mud_code","mud_name","mud_category"],
        ((txt(r["MudCode"]), txt(r["MudName"]) or txt(r["MudCode"]), txt(r["MudTypeAbri"]))
         for r in sl.execute("SELECT * FROM MudType") if txt(r["MudCode"])))
    copy_into("lithology_types", ["lithology_code","lithology_name","color_code"],
        ((txt(r["LithoCode"]), txt(r["LithoLat"]) or txt(r["LithoAbri"]) or txt(r["LithoCode"]), txt(r["LithoColor"]))
         for r in sl.execute("SELECT * FROM Lithology") if txt(r["LithoCode"])))
    mtype = smap("MaterialTypes", "MaterialTypeCode", lambda r: txt(r["MaterialType"]))
    copy_into("materials", ["material_code","material_name","material_type"],
        ((txt(r["MaterialCode"]), txt(r["Material"]) or txt(r["MaterialCode"]), mtype.get(txt(r["MaterialsTypeCode"])))
         for r in sl.execute("SELECT * FROM Materials") if txt(r["MaterialCode"])))
    copy_into("bit_catalog", ["bit_code","bit_size","bit_type","iadc_code","manufacturer","model"],
        ((txt(r["BitCode"]), size_parse(r["Size"]), txt(r["BitName"]), txt(r["IADC"]), txt(r["Make"]), txt(r["Type"]))
         for r in sl.execute("SELECT * FROM Bit") if txt(r["BitCode"])))
    copy_into("casing_catalog", ["casing_code","casing_name","size","grade","weight_per_foot","thread_type"],
        ((txt(r["CasingCode"]), txt(r["CasingName"]) or txt(r["CasingCode"]), num(r["OuterDiameter"]),
          txt(r["Grade"]), num(r["Pound_Foot"]), txt(r["Thread"]))
         for r in sl.execute("SELECT * FROM Casing") if txt(r["CasingCode"])))
    copy_into("formation_types", ["form_code","form_name","form_lat","color_code"],
        ((txt(r["FormCode"]), txt(r["FormLat"]) or txt(r["FormAbri"]) or txt(r["FormCode"]),
          txt(r["FormLat"]), txt(r["FormColor"]))
         for r in sl.execute("SELECT * FROM Formation") if txt(r["FormCode"])))

# ---------------------------------------------------------------- master
RIG_MAP = {}; WELL_ID = {}; WELL_META = {}
def load_master():
    global RIG_MAP, WELL_ID, WELL_META
    print("MASTER")
    field_name = smap("Fields", "FieldCode", lambda r: txt(r["FieldName"]))
    owner_name = smap("Owner", "OwnerCode", lambda r: txt(r["OwnerName"]))
    contr_name = smap("Contractor", "ContractorCode", lambda r: txt(r["Contractor"]))
    # rigs
    rigs = {}
    for r in sl.execute("SELECT * FROM A01"):
        rg = txt(r["RIG"])
        if rg and rg not in rigs:
            rigs[rg] = (rg, contr_name.get(txt(r["ContractorCode"])))
    rid = {}
    def rig_rows():
        for name, contractor in rigs.values():
            u = str(uuid.uuid4()); rid[name] = u
            yield (u, name, contractor, "active")
    copy_into("rigs", ["id","name","contractor","status"], rig_rows())
    RIG_MAP = rid
    # wells
    def well_rows():
        for r in srows("A01"):
            wc = txt(r["WellCode"])
            if not wc: continue
            u = str(uuid.uuid4()); WELL_ID[wc] = u
            rg = txt(r["RIG"]); fld = field_name.get(txt(r["FieldCode"]))
            op = owner_name.get(txt(r["OwnerCode"])); contr = contr_name.get(txt(r["ContractorCode"]))
            WELL_META[wc] = {"rig_name": rg, "field": fld, "operator": op, "contractor": contr}
            yield (u, wc, rid.get(rg), op, fld, txt(r["Location"]), gdate(r["SpuddedInDate"]), "drilling",
                   txt(r["WellTypeCode"]), txt(r["WellProfileCode"]), txt(r["FieldCode"]),
                   num(r["FinalForecastedDepth"]), inum(r["EstTTLRigDays"]), gdate(r["SpuddedInDate"]),
                   gdate(r["ReleasedDate"]), gdate(r["RigReleasedDate"]), txt(r["Reservoir"]),
                   num(r["RTLevelSea"]), num(r["WaterDepth"]), txt(r["CompanyCode"]))
    copy_into("wells", ["id","name","rig_id","operator","field","location","spud_date","status",
        "well_type_code","well_profile_code","field_code","final_forecasted_depth","estimated_total_rig_days",
        "spudded_in_date","released_date","rig_released_date","reservoir","rt_elevation","water_depth","company_code"],
        well_rows())

# ---------------------------------------------------------------- daily_reports (hub)
REPORT_ID = {}   # (wellcode, datekey) -> uuid
DATE_TABLES = [("L05","fDate"),("N01","fDate"),("N05","fDate"),("BottomHoleAssembly","fDate"),
    ("DrillString","fDate"),("DHMotor","fDate"),("Jar","fDate"),("ChemicalMaterials","fDate"),
    ("SolidControlParameter","fDate"),("TimeAnalysis","fDate"),("OperationAnalysis","fDate"),
    ("OAMOD","FDATE"),("M04","fDate"),("L08","fDate"),("L06","fDate")]
def load_reports():
    global REPORT_ID
    print("DAILY REPORTS")
    hole = smap("HoleSize", "HoleSizeCode", lambda r: txt(r["HoleSize"]))
    kop = {}
    for r in sl.execute("SELECT * FROM KickOfPoint"):
        wc = txt(r["WellCode"])
        if wc: kop[(wc, datekey(r["fDate"]))] = (num(r["Depth"]), num(r["PrevDrillDepth"]))
    rich = {}   # key -> full row tuple-source
    keyset = []
    # pass 1: L04 rich reports
    for r in srows("L04"):
        wc = txt(r["WellCode"])
        dk = datekey(r["DrillingDate"])
        if not wc or not dk: continue
        key = (wc, dk)
        if key in rich: continue
        gd = gdate(r["DrillingDate"])
        if gd is None: continue
        rich[key] = r
    # pass 2: child-only dates (minimal)
    extra = set()
    for tbl, dcol in DATE_TABLES:
        for r in sl.execute(f"SELECT DISTINCT WellCode, {dcol} d FROM {tbl}"):
            wc = txt(r["WellCode"]); dk = datekey(r["d"])
            if not wc or not dk: continue
            if WELLSET is not None and wc not in WELLSET: continue
            key = (wc, dk)
            if key not in rich and gdate(dk) is not None:
                extra.add(key)
    def report_rows():
        cols_order = None
        for key, r in rich.items():
            wc, dk = key; u = str(uuid.uuid4()); REPORT_ID[key] = u
            meta = WELL_META.get(wc, {})
            k = kop.get(key, (None, None))
            yield (u, MIG_USER, gdate(r["DrillingDate"]), wc, WELL_ID.get(wc),
                   meta.get("rig_name"), meta.get("operator"), meta.get("contractor"), meta.get("field"),
                   inum(r["SerialNo"]), num(r["FromPoint"]), num(r["ToPoint"]), num(r["TotalMeter"]),
                   num(r["DrillingTime"]), num(r["MorningDepth"]), num(r["TotalDRHour"]),
                   txt(r["Description"]), txt(r["Lithology"]), txt(r["WellSiteSupt"]), txt(r["OPNSupt"]),
                   txt(r["ProgEng"]), txt(r["Geologist"]), txt(r["Cont_T_Push1"]), txt(r["Cont_T_Push2"]),
                   txt(r["WindSpeed_Dir"]), txt(r["WaveVisible"]), txt(r["MV"]), num(r["FWater"]), num(r["Fuel"]),
                   hole.get(txt(r["HoleSizeCode"])), k[1], k[0])
        for key in extra:
            wc, dk = key; u = str(uuid.uuid4()); REPORT_ID[key] = u
            meta = WELL_META.get(wc, {})
            k = kop.get(key, (None, None))
            yield (u, MIG_USER, gdate(dk), wc, WELL_ID.get(wc),
                   meta.get("rig_name"), meta.get("operator"), meta.get("contractor"), meta.get("field"),
                   None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
                   None, None, None, None, None, None, k[1], k[0])
    copy_into("daily_reports", ["id","user_id","report_date","well_name","well_id","rig_name","operator",
        "contractor","field","report_number","hole_depth_start","hole_depth_end","progress_24hr","drilling_time",
        "morning_depth","total_drilling_hours","operations_summary","lithology","well_site_superintendent",
        "operation_superintendent","program_engineer","geologist","contractor_tool_pusher_1",
        "contractor_tool_pusher_2","wind_speed_direction","wave_visibility","weather_conditions","fresh_water_used",
        "fuel_consumed","hole_size","previous_drill_depth","kick_off_point"], report_rows())

def rid_of(wc, dk):
    return REPORT_ID.get((txt(wc).strip() if wc else None, datekey(dk)))

# ---------------------------------------------------------------- children
def load_children():
    print("CHILDREN")
    bit = smap("Bit", "BitCode", lambda r: (txt(r["BitName"]), txt(r["Make"])))
    mudname = smap("MudType", "MudCode", lambda r: txt(r["MudName"]))
    casing = smap("Casing", "CasingCode", lambda r: (num(r["OuterDiameter"]), txt(r["Grade"])))

    def bit_rows():
        for r in srows("L05"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            bt = bit.get(txt(r["BitCode"]), (None, None))
            yield (rid, inum(r["BitNo"]), num(r["HoleSize"]), bt[0], bt[1], txt(r["BitSerialNo"]),
                   num(r["FromPoint"]), num(r["ToPoint"]),
                   (num(r["ToPoint"]) - num(r["FromPoint"])) if num(r["FromPoint"]) is not None and num(r["ToPoint"]) is not None else None,
                   num(r["BitHour"]), txt(r["NozzleSize"]), num(r["TFA"]), num(r["BitHSI"]),
                   num(r["MinWeight"]), num(r["MaxWeight"]), num(r["MinRPM"]), num(r["MaxRPM"]),
                   num(r["TorqueOnBottom"]), num(r["TorqueOffBottom"]), txt(r["MudPumpType1Code"]),
                   txt(r["MudPumpType2Code"]), num(r["PumpLinerSize1"]), num(r["PumpLinerSize2"]),
                   num(r["PumpOutput1"]), num(r["PumpOutput2"]), num(r["PumpPressure1"]), num(r["PumpPressure2"]),
                   num(r["AnnularVelocity"]), num(r["CMTDRLMotor"]), num(r["CMTDRLHour"]), num(r["WAndRMeter"]),
                   num(r["WAndRHour"]), num(r["BitChangeIn"]), num(r["BitChangeOut"]),
                   txt(r["ICutterWearCode"]), txt(r["OCutterWearCode"]), txt(r["DullCharacteristicCode"]),
                   txt(r["WearLocationCode"]), txt(r["BearingWearCode"]), txt(r["GaugeWearCode"]),
                   txt(r["ODullCharacteristicCode"]), txt(r["ReasonPulledCode"]), inum(r["UsedPer"]),
                   num(r["BitMeterTotal"]), txt(r["Description"]))
    copy_into("bit_records", ["report_id","bit_number","bit_size","bit_type","bit_manufacturer","bit_serial_number",
        "depth_in","depth_out","footage","hours_run","nozzle_sizes","tfa","bit_hsi","min_weight_on_bit",
        "max_weight_on_bit","min_rpm","max_rpm","torque_on_bottom","torque_off_bottom","pump_type_1_code",
        "pump_type_2_code","pump_liner_size_1","pump_liner_size_2","pump_output_1","pump_output_2",
        "pump_pressure_1","pump_pressure_2","annular_velocity","connection_drilling_motor_meter",
        "connection_drilling_motor_hour","trip_in_out_meter","trip_in_out_hour","bit_change_in_time",
        "bit_change_out_time","inner_cutter_wear_code","outer_cutter_wear_code","dull_characteristic_code",
        "wear_location_code","bearing_wear_code","gauge_wear_code","other_dull_characteristic_code",
        "reason_pulled_code","used_percent","bit_meter_total","jets_configuration"], bit_rows())

    # mud: N01 left-joined with N05 (losses) on (well,serial,fDate,from,to)
    n05 = {}
    for r in sl.execute("SELECT * FROM N05"):
        wc = txt(r["WellCode"])
        if wc: n05[(wc, r["SerialNo"], datekey(r["fDate"]), r["FromPoint"], r["ToPoint"])] = num(r["LossesAtUnit"])
    def mud_rows():
        for r in srows("N01"):
            wc = txt(r["WellCode"]); rid = rid_of(wc, r["fDate"])
            loss = n05.get((wc, r["SerialNo"], datekey(r["fDate"]), r["FromPoint"], r["ToPoint"]))
            yield (rid, mudname.get(txt(r["MudCode"])), num(r["Viscosity"]), num(r["MinWeight"]),
                   num(r["MaxWeight"]), num(r["PH"]), num(r["Calcium"]), num(r["SoildPercent"]),
                   num(r["ReturnTemperature"]), num(r["Fan600"]), num(r["Fan300"]), num(r["InitialGel"]),
                   num(r["Gel10Minutes"]), num(r["OilPercent"]), txt(r["OilPerWaterRatio"]), num(r["HPHT"]),
                   num(r["Stability"]), num(r["MBT"]), num(r["KCL"]), num(r["Salinity"]), num(r["WaterLoss"]),
                   num(r["AirFoamCFM"]), num(r["PF"]), num(r["MF"]), time_of(r["RepTime"]),
                   txt(r["MudChangeDepth"]), wc, gdate(r["fDate"]), num(r["FromPoint"]), num(r["ToPoint"]),
                   inum(r["SerialNo"]), txt(r["MeasureCode"]), txt(r["Description"]), loss)
    copy_into("mud_records", ["report_id","mud_type","viscosity","min_weight","max_weight","ph","calcium",
        "solid_percent","return_temperature","fan_600_rpm","fan_300_rpm","initial_gel","gel_10_minutes",
        "oil_percent","oil_per_water_ratio","hpht_filtrate","stability","mbt","kcl_percent","salinity",
        "water_loss","air_foam_cfm","pf","mf","report_time","mud_change_depth","well_code","report_date",
        "from_point","to_point","serial_no","measure_code","description","losses_at_unit"], mud_rows())

    def bha_rows():
        import json
        for r in srows("BottomHoleAssembly"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            comp = {k: txt(r[k]) for k in ("DragUp","DragDown") if txt(r[k])}
            yield (rid, inum(r["AssemblyNo"]), num(r["Length"]), num(r["Weight"]),
                   txt(r["Specification"]), json.dumps(comp) if comp else None)
    copy_into("bha_records", ["report_id","bha_number","total_length","total_weight","notes","components"], bha_rows())

    def ds_rows():
        for r in srows("DrillString"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, inum(r["SerialNo"]), txt(r["fSize"]), txt(r["Grade"]))
    copy_into("drill_string_components", ["report_id","component_order","size","grade"], ds_rows())

    def dhm_rows():
        for r in srows("DHMotor"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, txt(r["DHMotorTypeCode"]), size_parse(r["DHMotorSize"]), txt(r["DHMotorSerialNo"]), num(r["fHour"]))
    copy_into("downhole_motor", ["report_id","motor_type_code","motor_size","motor_serial_no","motor_hours"], dhm_rows())

    def jar_rows():
        for r in srows("Jar"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, txt(r["JarTypeCode"]), size_parse(r["JarSize"]), txt(r["JarSerialNo"]), num(r["fHour"]))
    copy_into("jar_equipment", ["report_id","jar_type_code","jar_size","jar_serial_no","jar_hours"], jar_rows())

    def chem_rows():
        for r in srows("ChemicalMaterials"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, txt(r["MaterialCode"]) or "?", num(r["Amount"]), num(r["Rec"]), num(r["Stock"]),
                   num(r["OS"]), num(r["Req"]), num(r["Sent"]), txt(r["MeasureCode"]))
    copy_into("chemical_materials_usage", ["report_id","material_code","amount","received","stock","on_site",
        "requested","sent","measure_code"], chem_rows())

    def scp_rows():
        for r in srows("SolidControlParameter"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, num(r["ClayJactorHour"]), num(r["ClayJactorUnderFlow"]), num(r["ClayJactorOverFlow"]),
                   num(r["ClayJactorFeed"]), num(r["ClayJactorFPRS"]), num(r["MudCleanerHour"]),
                   num(r["MudCleanerUnderFlow"]), num(r["MudCleanerOverFlow"]), num(r["MudCleanerFeed"]),
                   num(r["MudCleanerCons"]), num(r["MudCleanerFPRS"]), num(r["ShakerHour"]),
                   txt(r["ShakerSize1"]), txt(r["ShakerSize2"]))
    copy_into("solid_control_parameters", ["report_id","clay_ejector_hour","clay_ejector_underflow",
        "clay_ejector_overflow","clay_ejector_feed","clay_ejector_fprs","mud_cleaner_hour","mud_cleaner_underflow",
        "mud_cleaner_overflow","mud_cleaner_feed","mud_cleaner_cons","mud_cleaner_fprs","shaker_hour",
        "shaker_size_1","shaker_size_2"], scp_rows())

    def ta_rows():
        for r in srows("TimeAnalysis"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, txt(r["ActivityGroupCode"]), txt(r["ActivityTypeCode"]), txt(r["ActivityCode"]),
                   num(r["Hours"]), txt(r["Description"]))
    copy_into("time_analysis", ["report_id","activity_group_code","activity_type_code","activity_code",
        "hours","description"], ta_rows())

    def oa_rows():   # OAMOD is the superset of OperationAnalysis (same well/date coverage)
        for r in srows("OAMOD"):
            rid = rid_of(r["WellCode"], r["FDATE"])
            if not rid: continue
            yield (rid, inum(r["ITEM"]), txt(r["OperationCode"]), time_of(r["FTIME"]), time_of(r["TTIME"]), txt(r["Description"]))
    copy_into("operation_analysis", ["report_id","serial_no","operation_code","from_time","to_time","description"], oa_rows())

    def dir_rows():
        for r in srows("M04"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            yield (rid, num(r["FromPoint"]), num(r["Angle"]), num(r["Azimuth"]), num(r["TVD"]),
                   num(r["N_S"]), num(r["E_W"]), num(r["VS"]), num(r["DLS"]))
    copy_into("directional_records", ["report_id","measured_depth","inclination","azimuth",
        "true_vertical_depth","north_south","east_west","vertical_section","dogleg_severity"], dir_rows())

    def casing_rows():
        for r in srows("L08"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            c = casing.get(txt(r["CasingCode"]), (None, None))
            yield (rid, "casing", c[0], c[1], num(r["DepthPoint"]))
        for r in srows("L06"):
            rid = rid_of(r["WellCode"], r["fDate"])
            if not rid: continue
            c = casing.get(txt(r["LinerCode"]), (None, None))
            yield (rid, "liner", c[0], c[1], num(r["ToPoint"]))
    copy_into("casing_records", ["report_id","casing_string","casing_size","casing_grade","setting_depth"], casing_rows())

# ---------------------------------------------------------------- well-keyed
def load_well_keyed():
    print("WELL-KEYED")
    def lith_rows():
        for r in srows("D04"):
            wc = txt(r["WellCode"]); fp = num(r["FromPoint"]); tp = num(r["ToPoint"])
            if not wc or fp is None or tp is None: continue
            yield (wc, wc, fp, tp, txt(r["Lith1Code"]), num(r["Lith1Per"]), txt(r["Lith2Code"]), num(r["Lith2Per"]),
                   txt(r["Lith3Code"]), num(r["Lith3Per"]), txt(r["Lith4Code"]), num(r["Lith4Per"]),
                   txt(r["Lith5Code"]), num(r["Lith5Per"]), txt(r["Lith6Code"]), num(r["Lith6Per"]), txt(r["Description"]))
    copy_into("lithology_intervals", ["well_code","well_name","from_depth","to_depth","lith1_code","lith1_percent",
        "lith2_code","lith2_percent","lith3_code","lith3_percent","lith4_code","lith4_percent","lith5_code",
        "lith5_percent","lith6_code","lith6_percent","description"], lith_rows())
    valid_forms = set(r[0].strip() for r in sl.execute("SELECT FormCode FROM Formation WHERE FormCode IS NOT NULL"))
    def wft_rows():
        seen = set()   # (well_code, form_code) unique; NULL form_code allowed multiple
        for tbl in ("D07", "D16"):
            for r in srows(tbl):
                wc = txt(r["WellCode"])
                if not wc: continue
                fc = txt(r["FormCode"])
                if fc and fc not in valid_forms: fc = None
                if fc is not None:
                    if (wc, fc) in seen: continue
                    seen.add((wc, fc))
                yield (wc, wc, fc, num(r["DepthPoint"]), num(r["SecondDepth"]),
                       txt(r["TopTypeCode"]) if "TopTypeCode" in r.keys() else None)
    copy_into("well_formation_tops", ["well_code","well_name","form_code","depth_point","tvd","description"], wft_rows())

# ---------------------------------------------------------------- main
def main():
    t0 = datetime.datetime.now()
    dry = os.environ.get("DRY_ROLLBACK") == "1"
    if not dry:
        ensure_clean()
    load_lookups()
    load_master()
    load_reports()
    load_children()
    load_well_keyed()
    total = sum(counts.values())
    if dry:
        pg.rollback()
        print(f"\n[dry-run] rolled back. would-load TOTAL rows: {total:,} in {str(datetime.datetime.now()-t0).split('.')[0]}")
    else:
        pg.commit()
        print(f"\nCOMMITTED. TOTAL rows: {total:,} in {str(datetime.datetime.now()-t0).split('.')[0]}")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        pg.rollback(); raise
    finally:
        sl.close(); pg.close()

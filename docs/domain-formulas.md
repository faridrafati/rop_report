# DrillIQ — Domain Formula Reference (AUTHORITATIVE)

> **DO NOT invent formulas — use these exact equations/units.**
>
> This document is the single source of truth for every drilling-engineering
> calculation in DrillIQ. Implementations in `/api`, `/ml`, and `/web` MUST
> match these equations, variable definitions, units, and field constants
> exactly. The worked numeric examples are normative: the cost-per-foot
> `$48.8/ft` example is a **canonical unit-test fixture** — your tests must
> reproduce it.

---

## Table of Contents

1. [Mechanical Specific Energy (MSE — Teale 1965)](#1-mechanical-specific-energy-mse--teale-1965)
2. [Bit-Specific Sliding Friction (Pessier / Fear)](#2-bit-specific-sliding-friction-pessier--fear)
3. [Hydraulic Horsepower at Bit (HHP_b) and HSI](#3-hydraulic-horsepower-at-bit-hhp_b-and-hsi)
4. [Pressure Drop Across the Bit (P_bit)](#4-pressure-drop-across-the-bit-p_bit)
5. [Total Flow Area (TFA)](#5-total-flow-area-tfa)
6. [Cost per Foot (canonical $48.8/ft fixture)](#6-cost-per-foot-canonical-488ft-fixture)
7. [Effective ROP](#7-effective-rop)
8. [Founder (Flounder) Point Logic](#8-founder-flounder-point-logic)
9. [MSE-Efficiency Notes (table)](#9-mse-efficiency-notes-table)
10. [Drilling Dysfunctions](#10-drilling-dysfunctions)
11. [IADC Dull Grade — Full 8-Position Spec](#11-iadc-dull-grade--full-8-position-spec)
12. [IADC Bit Classification (Roller-Cone + PDC)](#12-iadc-bit-classification-roller-cone--pdc)
13. [Unit Conventions](#13-unit-conventions)

---

## 1. Mechanical Specific Energy (MSE — Teale 1965)

MSE is the energy required to remove a unit volume of rock. Teale's rotary
form combines the axial (WOB) work term with the rotary (torque) work term.

```
MSE = WOB / A_B  +  (120 * pi * N * T) / (A_B * ROP)

where:
  A_B = (pi / 4) * D_B^2
```

### Variables and units

| Symbol | Meaning                         | Units            |
|--------|---------------------------------|------------------|
| MSE    | Mechanical specific energy      | psi (= lbf/in^2) |
| WOB    | Weight on bit                   | lbf              |
| A_B    | Bit cross-sectional area        | in^2             |
| D_B    | Bit diameter                    | in               |
| N      | Rotary speed                    | rpm (rev/min)    |
| T      | Torque at bit                   | ft-lbf           |
| ROP    | Rate of penetration             | ft/hr            |

The constant `120` folds the unit conversions (ft -> in, rev -> radians via
`2*pi`, hr -> consistent rate) so that with the units in the table above the
result is in **psi**.

### Field-constant assumptions

- Torque `T` is **bit torque** (downhole). If only surface torque is
  available, drag/friction losses are not subtracted in this baseline form —
  flag the value as `torque_source = surface` for downstream interpretation.
- `A_B` uses nominal bit diameter `D_B` (not effective hole diameter).
- "Good drilling" energy efficiency target is **~35% MSE efficiency**
  (i.e. MSE ≈ rock confined compressive strength / 0.35). See §9.

### Worked example

12-1/4" PDC run: `WOB = 35,000 lbf`, `N = 100 rpm`, `T = 6,000 ft-lbf`,
`ROP = 80 ft/hr`.

```
A_B   = (pi/4) * 12.25^2            = 117.859 in^2
term1 = 35000 / 117.859            = 297.0 psi      (WOB term)
term2 = (120 * pi * 100 * 6000) / (117.859 * 80)
      = 226,194,671 / 9,428.7      = 23,990 psi     (torque term)
MSE   = 297.0 + 23,990            ≈ 24,287 psi  (~24.3 kpsi)
```

### Source

R. Teale, *"The concept of specific energy in rock drilling,"*
Int. J. Rock Mech. Mining Sci., Vol. 2, 1965, pp. 57-73.

---

## 2. Bit-Specific Sliding Friction (Pessier / Fear)

Dimensionless sliding-friction coefficient `mu` that maps measured torque to
WOB for a bit, used to estimate downhole torque from WOB (and vice-versa) and
to detect bit/BHA dysfunction trends.

```
mu = 36 * T / (D_B * WOB)
```

### Variables and units

| Symbol | Meaning                          | Units    |
|--------|----------------------------------|----------|
| mu     | Bit-specific coefficient of friction | dimensionless |
| T      | Torque at bit                    | ft-lbf   |
| D_B    | Bit diameter                     | in       |
| WOB    | Weight on bit                    | lbf      |

The constant `36` reconciles `T` in **ft-lbf** with `D_B` in **inches**
(`12 in/ft * 3` from the torque-arm geometry of the Pessier formulation).

### Field-constant assumptions

- `T` is bit torque (same caveat as §1: prefer downhole; flag surface torque).
- Typical drilling `mu` ranges ~0.2–0.9; a sharp rise at constant WOB suggests
  balling or whirl-induced over-torque; a drop can indicate bit wear / reduced
  cutter engagement.

### Worked example

Using the §1 run: `T = 6,000 ft-lbf`, `D_B = 12.25 in`, `WOB = 35,000 lbf`.

```
mu = 36 * 6000 / (12.25 * 35000)
   = 216,000 / 428,750
   ≈ 0.504
```

### Source

M. P. Pessier and M. J. Fear, *"Quantifying common drilling problems with
mechanical specific energy and a bit-specific coefficient of sliding
friction,"* SPE 24584, SPE ATCE, 1992.

---

## 3. Hydraulic Horsepower at Bit (HHP_b) and HSI

Hydraulic energy delivered through the bit nozzles, and its concentration per
unit bit face area (Hydraulic Specific Impact / horsepower per square inch).

```
HHP_b = (P_bit * Q) / 1714

HSI   = 1.27 * HHP_b / D_B^2
```

### Variables and units

| Symbol | Meaning                          | Units             |
|--------|----------------------------------|-------------------|
| HHP_b  | Hydraulic horsepower at the bit  | hhp (hydraulic hp)|
| P_bit  | Pressure drop across the bit     | psi               |
| Q      | Flow rate                        | gpm (US gal/min)  |
| HSI    | Horsepower per square inch       | hhp/in^2          |
| D_B    | Bit diameter                     | in                |

`1714` converts `psi * gpm` to hydraulic horsepower. The `1.27` in HSI is
`4/pi`, converting bit cross-sectional area `(pi/4)*D_B^2` to the `D_B^2`
denominator.

### Field-constant assumptions

- **Optimum HSI = 2.5–5.0 hhp/in^2** for effective bottom-hole cleaning;
  below ~2.5 indicates under-cleaning (cuttings re-grinding risk), well above
  ~5 may risk hole erosion in soft formations.
- `P_bit` here is the bit pressure drop only (§4), not total system SPP.

### Worked example

12-1/4" bit, three 20/32" nozzles (`TFA = 0.9204 in^2`, see §5),
`MW = 10.0 ppg`, `Q = 750 gpm`.

```
P_bit = (10.0 * 750^2) / (12031 * 0.95^2 * 0.9204^2)   (see §4)
      ≈ 611.5 psi
HHP_b = (611.5 * 750) / 1714
      ≈ 267.6 hhp
HSI   = 1.27 * 267.6 / 12.25^2
      = 339.85 / 150.0625
      ≈ 2.26 hhp/in^2     (within the 2.5–5.0 optimum band's lower edge)
```

### Source

Standard rotary-drilling hydraulics (Bourgoyne et al., *Applied Drilling
Engineering*, SPE Textbook Series Vol. 2, Ch. 4). Constants `1714` and
`1.27 = 4/pi` are field-standard.

---

## 4. Pressure Drop Across the Bit (P_bit)

Field-units form of the bit-nozzle pressure drop, using a fixed nozzle
discharge coefficient `Cd = 0.95`.

```
P_bit = (MW * Q^2) / (12031 * 0.95^2 * TFA^2)
```

### Variables and units

| Symbol | Meaning                          | Units             |
|--------|----------------------------------|-------------------|
| P_bit  | Pressure drop across the bit     | psi               |
| MW     | Mud weight (density)             | ppg (lb/gal)      |
| Q      | Flow rate                        | gpm               |
| TFA    | Total flow area                  | in^2 (see §5)     |
| Cd     | Nozzle discharge coefficient     | 0.95 (dimensionless) |

`12031` is the field-units constant that, together with `Cd^2`, makes the
result come out in psi for `MW` in ppg, `Q` in gpm, and `TFA` in in^2.

### Field-constant assumptions

- **`Cd = 0.95` is fixed** for DrillIQ. Do not parameterize per-run unless a
  measured value is explicitly supplied; if so, store it as `cd_used`.
- `MW` is surface/static mud weight (ppg). For ECD-sensitive analyses use the
  fluid object's ECD separately — `P_bit` uses static MW.

### Worked example

12-1/4" bit, `MW = 10.0 ppg`, `Q = 750 gpm`, `TFA = 0.9204 in^2`.

```
P_bit = (10.0 * 750^2) / (12031 * 0.95^2 * 0.9204^2)
      = 5,625,000 / (12031 * 0.9025 * 0.84714)
      = 5,625,000 / 9,198.5
      ≈ 611.5 psi
```

### Source

Field-units bit-hydraulics equation (Bourgoyne et al., *Applied Drilling
Engineering*); `Cd = 0.95` per API/contractor standard for roughened nozzles.

---

## 5. Total Flow Area (TFA)

Sum of the open areas of all bit nozzles. Nozzle sizes are given in **32nds of
an inch** (e.g. a "16" nozzle has diameter 16/32 = 0.5 in).

```
TFA = (pi / 4) * sum_over_n( (d_n / 32)^2 )
```

### Variables and units

| Symbol | Meaning                          | Units             |
|--------|----------------------------------|-------------------|
| TFA    | Total flow area                  | in^2              |
| d_n    | Nozzle `n` size                  | 32nds of an inch  |
| n      | Nozzle index (1 .. number of nozzles) | —            |

Each `(d_n / 32)` converts the nozzle size into inches before squaring.

### Field-constant assumptions

- Reference vocabulary nozzle sizes observed in field data: **7/32 .. 24/32**.
- Blanked (plugged) nozzles contribute zero area and must be excluded from the
  sum (store as `nozzle_blanked = true`).

### Worked examples

```
Three 20/32" nozzles:
  TFA = (pi/4) * 3 * (20/32)^2
      = 0.785398 * 3 * 0.390625
      ≈ 0.9204 in^2

Three 13/32" nozzles:
  TFA = (pi/4) * 3 * (13/32)^2
      = 0.785398 * 3 * 0.165039
      ≈ 0.3889 in^2
```

### Source

Standard bit-nozzle geometry; nozzle sizing convention (32nds) per IADC / bit
manufacturer practice.

---

## 6. Cost per Foot (canonical $48.8/ft fixture)

Drilling cost per foot of formation drilled for a single bit run, including
amortized bit cost and rig time (rotating + tripping).

```
C = [ B + R * (t + T) ] / F
```

### Variables and units

| Symbol | Meaning                          | Units             |
|--------|----------------------------------|-------------------|
| C      | Cost per foot                    | $/ft              |
| B      | Bit cost                         | $                 |
| R      | Rig rate                         | $/hr              |
| t      | Rotating (on-bottom drilling) time | hr              |
| T      | Trip time (round-trip for this bit) | hr             |
| F      | Footage drilled by the bit       | ft                |

### Field-constant assumptions

- `t` and `T` are billable rig-time hours; connection/flat time may be folded
  into `t` or tracked separately depending on activity coding (NPT excluded
  from productive footage analysis — see §7 and the WITSML `activity` model).
- Money currency: **USD** unless a `currency` field overrides (see §13).

### Worked example — CANONICAL UNIT-TEST FIXTURE

> This is the **normative** fixture. Your cost-per-foot unit test MUST assert
> `C == 48.8` for these inputs.

```
Inputs:
  B = 27000   ($ bit cost)
  t = 50      (hr rotating)
  R = 3500    ($/hr rig rate)
  T = 12      (hr trip)
  F = 5000    (ft footage)

C = [ 27000 + 3500 * (50 + 12) ] / 5000
  = [ 27000 + 3500 * 62 ] / 5000
  = [ 27000 + 217000 ] / 5000
  = 244000 / 5000
  = 48.8 $/ft
```

### Source

Standard drilling cost-per-foot equation (Bourgoyne et al., *Applied Drilling
Engineering*; widely used IADC bit-economics formula).

---

## 7. Effective ROP

Footage-weighted penetration rate over the full elapsed time of the run,
including non-on-bottom time. Distinguishes raw instantaneous ROP from
realized field performance.

```
Effective_ROP = footage / (rotating + trip + connection/flat time)
```

### Variables and units

| Symbol                | Meaning                              | Units   |
|-----------------------|--------------------------------------|---------|
| Effective_ROP         | Effective rate of penetration        | ft/hr   |
| footage               | Total footage drilled                | ft      |
| rotating              | On-bottom rotating time              | hr      |
| trip                  | Tripping time                        | hr      |
| connection/flat time  | Connections + other flat (non-drilling) time | hr |

### Field-constant assumptions

- The denominator is **total elapsed time** attributable to the run. NPT
  (Non-Productive Time) is captured via the `activity.productive` boolean in
  the WITSML-aligned model; whether NPT is included depends on the metric:
  - `effective_rop_gross` includes all time.
  - `effective_rop_productive` excludes time where `productive = false`.
  - Default `Effective_ROP` = gross (formula above).
- Contrast with instantaneous/on-bottom `ROP = footage / rotating`.

### Worked example

`footage = 5000 ft`, `rotating = 50 hr`, `trip = 12 hr`,
`connection/flat = 8 hr`.

```
Effective_ROP = 5000 / (50 + 12 + 8)
              = 5000 / 70
              ≈ 71.4 ft/hr
```

(On-bottom ROP for comparison: `5000 / 50 = 100 ft/hr`.)

### Source

Standard drilling-performance definition; aligns with IADC daily-time
accounting.

---

## 8. Founder (Flounder) Point Logic

The **founder point** (a.k.a. flounder point) is the WOB (or RPM) beyond which
additional weight (or speed) no longer yields proportional ROP — the point of
diminishing returns where MSE rises while ROP flattens.

### Logic / detection rule

```
1. ROP rises approximately LINEARLY with WOB up to the founder point.
2. Beyond the founder point, ROP flattens (or declines) while WOB keeps rising.
3. Confirmation: MSE RISES while ROP FLATTENS  =>  founder confirmed.
4. Map two cross-plots:
     - WOB vs ROP   (detect the linear-then-flat knee)
     - RPM vs ROP   (detect speed-limited founder / whirl onset)
5. FLAG the founder point (store wob_founder, rpm_founder, mse_at_founder).
```

### Variables and units

| Symbol         | Meaning                         | Units   |
|----------------|---------------------------------|---------|
| WOB            | Weight on bit                   | lbf     |
| RPM (N)        | Rotary speed                    | rpm     |
| ROP            | Rate of penetration             | ft/hr   |
| MSE            | Mechanical specific energy      | psi     |

### Field-constant assumptions

- Founder is detected from the **trend**, not a single point: require the
  linear region's slope to break (ROP slope -> ~0 or negative) **and**
  concurrent MSE increase to avoid false positives from noise.
- A WOB-induced founder typically pairs with **stick-slip** (see §10);
  raise RPM. An RPM-induced founder typically pairs with **whirl**; lower RPM.

### Worked (illustrative) example

| WOB (lbf) | ROP (ft/hr) | MSE (kpsi) |
|-----------|-------------|------------|
| 15,000    | 45          | 22         |
| 25,000    | 72          | 23         |
| 35,000    | 90          | 24  ← linear region |
| 45,000    | 93          | 31  ← ROP flattens, MSE rises => **FOUNDER ≈ 35–45 klbf** |
| 55,000    | 88          | 40  ← past founder (ROP declining) |

`wob_founder ≈ 40,000 lbf` is flagged; further WOB is counter-productive.

### Source

Founder-point concept from drilling-optimization literature (Dupriest &
Koederitz, *"Maximizing drill rates with real-time surveillance of mechanical
specific energy,"* SPE/IADC 92194, 2005).

---

## 9. MSE-Efficiency Notes (table)

MSE efficiency compares the energy actually spent (MSE) to the minimum energy
needed (≈ rock confined compressive strength, CCS). Drilling is "founder-free /
efficient" near the rock-strength floor.

```
MSE_efficiency = CCS / MSE          (expressed as a fraction or %)
target: "good drilling" ~ 35% efficiency  (MSE ≈ CCS / 0.35)
```

| MSE efficiency | MSE relative to CCS | Interpretation | Action |
|----------------|---------------------|----------------|--------|
| ~100%          | MSE ≈ CCS           | Theoretical floor; rarely reached in field | — |
| **~35% (good)**| MSE ≈ 2.9 × CCS     | **Healthy drilling baseline** — DrillIQ "good" threshold | Maintain parameters |
| 20–35%         | MSE ≈ 3–5 × CCS     | Acceptable; minor inefficiency | Tune WOB/RPM toward founder |
| 10–20%         | MSE ≈ 5–10 × CCS    | Inefficient; likely approaching founder or mild dysfunction | Inspect WOB-vs-ROP knee; check cleaning/HSI |
| < 10%          | MSE > 10 × CCS      | Severe inefficiency / dysfunction | Diagnose stick-slip / whirl / balling (§10); reduce/adjust parameter |
| Rising MSE at flat ROP | trend | **Founder confirmed** (§8) | Back off the offending parameter |
| MSE spikes with torque (high mu) | trend | Possible **bit balling** or whirl-induced over-torque | Improve cleaning / adjust RPM |

Notes:
- Compute CCS from formation/lithology + pore/confining pressure inputs
  (lithology model); when CCS is unavailable, report MSE in absolute psi and
  flag efficiency as "n/a".
- MSE efficiency is **per stand / per stationary interval**; do not average
  across formation boundaries.

### Source

Teale (1965) for MSE; Dupriest & Koederitz (SPE/IADC 92194, 2005) for the
efficiency-surveillance / founder workflow and the ~35% practical target.

---

## 10. Drilling Dysfunctions

| Dysfunction | Type        | Induced by      | Diagnostic signature                         | Mitigation        |
|-------------|-------------|-----------------|----------------------------------------------|-------------------|
| Stick-slip  | Torsional   | WOB increase    | Torque/RPM cyclic oscillation; high mu swings | **Raise RPM**     |
| Whirl       | Lateral     | RPM increase    | High lateral vibration; over-gauge; high torque at high RPM | **Lower RPM** |
| Bit bounce  | Axial       | Hard/interbedded formations | Axial WOB oscillation; bit-off-bottom spikes | Adjust WOB/RPM, add damping |
| Bit balling | Cleaning    | Poor hydraulics / soft sticky shale | Rising MSE & torque at flat ROP; low HSI | **Improve cleaning** (HSI, flow, mud) |

Cross-references: balling shows up as low HSI (§3) and rising MSE (§9);
WOB-induced founder (§8) pairs with stick-slip; RPM-induced founder pairs with
whirl.

### Source

Pessier & Fear (SPE 24584, 1992) for MSE/mu dysfunction quantification;
Dupriest & Koederitz (SPE/IADC 92194, 2005).

---

## 11. IADC Dull Grade — Full 8-Position Spec

The IADC dull-grading system records bit wear in **eight positions**. In
DrillIQ each position is a **discrete field**, and per WITSML alignment each is
captured both **initial** (`condInit*`) and **final** (`condFinal*`) where
applicable (the dull grade proper is the final/pull condition; initial fields
mirror the structure for re-run bits).

```
[ 1 ][ 2 ][ 3 ][ 4 ] [ 5 ][ 6 ][ 7 ][ 8 ]
 I    O    D    L      B    G    O    R
```

### Position-by-position

| # | Field name (DrillIQ)        | Meaning                          | Allowed values |
|---|-----------------------------|----------------------------------|----------------|
| 1 | `cond*InnerRows`            | Inner cutting structure wear     | integer **0–8** (0 = no wear, 8 = no usable structure) |
| 2 | `cond*OuterRows`            | Outer cutting structure wear     | integer **0–8** |
| 3 | `cond*DullChar`             | Dull characteristic (primary)    | 2-letter code (table below) |
| 4 | `cond*Location`             | Location of the dull             | see Location codes below |
| 5 | `cond*BearingsSeals`        | Bearings / seals condition       | roller non-sealed **0–8**; sealed **E / F / N**; fixed-cutter **always `X`** |
| 6 | `cond*Gauge`                | Gauge condition                  | **`I`** = in-gauge, else amount undergauge in **1/16"** (e.g. `1/16`, `2/16`) |
| 7 | `cond*OtherDullChar`        | Other (secondary) dull char      | same 2-letter code list as #3 |
| 8 | `cond*ReasonPulled`         | Reason bit was pulled            | reason-pulled code (table below) |

> Field naming: `*` = `Init` or `Final` (e.g. `condFinalInnerRows`,
> `condFinalDullChar`, `condFinalBearingsSeals`). `bitClass` is recorded
> separately as **N** (new) / **U** (used/rerun).

### Position 3 & 7 — Dull Characteristic codes (full list)

| Code | Meaning |
|------|---------|
| BC | Broken Cone |
| BT | Broken Teeth/Cutters |
| BU | Balled Up bit |
| CC | Cracked Cone |
| CD | Cone Dragged |
| CI | Cone Interference |
| CR | Cored |
| CT | Chipped Teeth/Cutters |
| ER | Erosion |
| FC | Flat Crested wear |
| HC | Heat Checking |
| JD | Junk Damage |
| LC | Lost Cone |
| LN | Lost Nozzle |
| LT | Lost Teeth/Cutters |
| NO | No Dull characteristic |
| NR | Not Rerunnable |
| OC | Off-Center wear |
| PB | Pinched Bit |
| PN | Plugged Nozzle/flow passage |
| RG | Rounded Gauge |
| RO | Ring Out |
| RR | Re-Runnable |
| SD | Shirttail Damage |
| SS | Self-Sharpening wear |
| TR | Tracking |
| WO | Washed Out bit |
| WT | Worn Teeth/Cutters |
| BF | Bond Failure |

### Position 4 — Location codes

```
Roller-cone:   N = Nose row
               M = Middle row
               G = Gauge row
               A = All rows
               (optionally suffixed with the cone number, e.g. N1, G2, A3)

Fixed-cutter / PDC:
               C = Cone
               N = Nose
               T = Taper
               S = Shoulder
               G = Gauge
```

### Position 5 — Bearings / Seals codes

```
Roller-cone, NON-sealed bearings:  0–8   (linear life used; 0 = no wear, 8 = locked/failed)
Roller-cone, SEALED bearings:      E = seals Effective
                                   F = seals Failed
                                   N = Not able to grade
Fixed-cutter / PDC:                X     (always — no bearings)
```

### Position 6 — Gauge codes

```
I        = In gauge
1/16     = 1/16" undergauge
2/16     = 2/16" (1/8") undergauge
... (report in sixteenths of an inch undergauge)
```

### Position 8 — Reason Pulled codes (DrillIQ reference vocabulary)

| Code | Meaning |
|------|---------|
| BHA  | Change Bottom-Hole Assembly |
| CM   | Condition Mud |
| CP   | Core Point |
| DMF  | Downhole Motor Failure |
| DP   | Drill Pipe (issue) |
| DSF  | Drill String Failure |
| DST  | Drill Stem Test |
| DTF  | Downhole Tool Failure |
| FM   | Formation change |
| HP   | Hole Problems |
| HR   | Hours on bit (planned) |
| LIH  | Left In Hole |
| LOG  | Run logs |
| PP   | Pump Pressure |
| PR   | Penetration Rate (too low) |
| RIG  | Rig Repair |
| TD   | Total Depth / Casing depth reached |
| TQ   | Torque |
| TW   | Twist Off |
| WO   | Wash Out (in drill string) |

### Worked example (a full dull grade)

```
condFinalInnerRows    = 2
condFinalOuterRows    = 3
condFinalDullChar     = WT     (Worn Teeth/Cutters)
condFinalLocation     = G      (Gauge row)
condFinalBearingsSeals= E      (sealed bearing, effective)
condFinalGauge        = I      (in gauge)
condFinalOtherDullChar= BT     (Broken Teeth/Cutters)
condFinalReasonPulled = TD     (reached Total Depth)

Rendered string:  2-3-WT-G-E-I-BT-TD
```

### Source

IADC Dull Grading System for Roller-Cone and Fixed-Cutter Bits (IADC standard;
codes per the official IADC dull-grading chart).

---

## 12. IADC Bit Classification (Roller-Cone + PDC)

Two distinct schemes — roller-cone uses a **4-character** code; fixed-cutter /
PDC uses a **letter + 3 digits**.

### 12.1 Roller-cone — 4-character code

```
[ digit ][ digit ][ digit ][ letter ]
   1        2        3        4
```

| Char | Field name (DrillIQ)   | Meaning | Range |
|------|------------------------|---------|-------|
| 1 | `iadcSeries`   | Cutting structure type / formation series | **1–3** milled tooth (steel tooth), **4–8** insert (TCI); higher = harder formation |
| 2 | `iadcType`     | Formation hardness sub-class | **1–4** (soft → hard within the series) |
| 3 | `iadcBearingGauge` | Bearing type / gauge protection | **1–7** (see below) |
| 4 | `iadcFeature`  | Additional design feature letter | letter (see below) |

Position-3 bearing/gauge values:
```
1 = Non-sealed roller bearing
2 = Air-cooled roller bearing
3 = Non-sealed roller bearing, gauge protected
4 = Sealed roller bearing
5 = Sealed roller bearing, gauge protected
6 = Sealed friction (journal) bearing
7 = Sealed friction bearing, gauge protected
```

Position-4 feature letters (subset): `A` Air application, `C` Center jet,
`D` Deviation control, `E` Extended nozzle, `G` extra Gauge/body protection,
`J` Jet deflection, `R` Reinforced welding, `S` Standard steel tooth,
`X` chisel insert, `Y` conical insert, `Z` other.

Examples from DrillIQ field data: `131`, `214`, `417`, `517`, `537`
(the 4th feature letter is often omitted when none applies, so 3-digit
roller-cone codes appear in the data).

```
Worked read of "537":
  5  -> insert (TCI) bit, medium-hard formation series
  3  -> hardness sub-class 3
  7  -> sealed friction bearing, gauge protected
```

### 12.2 Fixed-cutter / PDC — letter + 3 digits

```
[ letter ][ digit ][ digit ][ digit ]
    1        2        3        4
```

| Char | Field name (DrillIQ) | Meaning | Values |
|------|----------------------|---------|--------|
| 1 | `pdcBody`     | Cutter/body material | **M** = matrix body, **S** = steel body, (D = natural Diamond, T = TSP) |
| 2 | `pdcSeries`   | Cutter density / formation hardness | **digit** (higher = harder formation / smaller cutters) |
| 3 | `pdcProfile`  | Bit profile | **digit** (1 = fishtail/flat … 4 = long/deep cone) |
| 4 | `pdcCutterSize` | Cutter size class | **digit** (1 = largest cutters … 4 = smallest) |

```
Worked read of "M241":
  M -> Matrix body PDC
  2 -> series 2 (medium-soft to medium formation)
  4 -> profile 4 (long parabolic / deep cone)
  1 -> cutter size 1 (large cutters)
```

DrillIQ records the bit type (`typeBit`: TCI, MT = milled tooth, PDC) and the
manufacturer (`SMITH`, `SLB`, `Baker`, ...) alongside the IADC code
(`codeIADC`) in the `bitRecord` / `BitMaster` entities.

### Source

IADC Roller-Cone Bit Classification and IADC Fixed-Cutter (PDC) Bit
Classification systems (IADC standards).

---

## 13. Unit Conventions

These conventions are **mandatory** across `/db`, `/api`, `/ml`, and `/web`.

### Depths and lengths
- **Internal storage and all computation use METERS** (and meters-derived SI
  where applicable). Convert to feet (or other display units) **at the UI
  layer only** (`/web`).
- Drilling-formula inputs in this document use **field/imperial units**
  (lbf, in, ft, ft-lbf, ft/hr, gpm, ppg, psi) because the IADC/SPE equations
  and their constants (`120`, `36`, `1714`, `12031`, `1.27`, `Cd=0.95`) are
  defined in those units. When a value enters a formula, convert the stored
  metric value to the formula's required field unit, compute, then store the
  result; persist depth/length results back in meters.
- Bit diameter / hole size: stored canonical value plus the human label from
  the reference vocabulary (e.g. `12-1/4"`, `8-1/2"`).

### Timestamps
- **All timestamps are stored and transmitted in UTC** (ISO-8601,
  `timestamptz` in PostgreSQL). Localize for display at the UI only.

### Money / currency
- Monetary amounts (bit cost `B`, rig rate `R`, cost-per-foot `C`) are
  **USD by default**. Persist an explicit `currency` field on cost-bearing
  records; do not mix currencies in an aggregate without conversion.

### Angles, flow, pressure, density
- Inclination / azimuth: **degrees**. Survey stations: MD/Inc/Azm/TVD/NS/EW
  (lengths in meters internally).
- Flow rate `Q`: **gpm** in formulas (store metric L/min or m^3/min canonically
  and convert in).
- Pressure: **psi** in formulas; mud weight `MW`: **ppg** in formulas.

### Reminder

> **DO NOT invent formulas — use these exact equations/units.**
> Any new calculation must be added to this document (with equation, variables,
> units, assumptions, a worked example, and a source) before it is implemented.

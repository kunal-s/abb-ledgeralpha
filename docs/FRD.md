# LedgerAlpha for ABB India: Functional Requirements Document

**Product:** LedgerAlpha (balance sheet review / GL scrutiny), configured for ABB India
**Repository:** `/app/app-abb-ledgeralpha`
**Version:** 0.1 (draft for review) · 06-Oct-2026
**Status:** Increment I0 (scaffold) built. Feature increments start only after this document is reviewed.
**Prepared by:** J2W delivery team

| Source | Tag used below |
|---|---|
| Discovery call transcript, 18-Sep-2026 | [Sep18] |
| Pre-workshop call transcript, 05-Oct-2026 (most recent; sets priorities) | [Oct05] |
| ABB India Finance Debrief (J2W), 01-Oct-2026 | [Deb] |
| Pre-Workshop Questionnaire and Data Request (client): questions S1–S4, A1–A13, B1–B11, C1–C9; views V-A1…V-C4 | [QN] |
| Pre-Workshop Question Pack, internal notes (J2W): data questions D1–D5 | [QP] |
| LedgerAlpha codebase and its self-assessment (`/app/app-ledger-alpha/LEDGERALPHA-REVIEW.md`) | [LA] |

**Conventions**
- **Priority (MoSCoW):**
  - **M**: must work in the workshop demo.
  - **S**: should; it strengthens the demo.
  - **C**: could, if time allows.
  - **W**: won't be built in this phase.
- **Origin:** **[ABB]** means ABB stated it. **[J2W]** means it is our proposal or assumption and awaits confirmation.
- **TBC:** "TBC A5" means questionnaire question A5 confirms or changes the default. Defaults live in `src/config/demo.ts`.
- **Amounts:**
  - All amounts are INR in company-code currency, Indian digit grouping (₹1,23,45,678); compact as lakh / crore (₹43.5 lakh, ₹1.97 cr).
  - Signs follow SAP: debit positive, credit negative.
  - Dates are written DD-MMM-YYYY.

---

## 1. Purpose and context

### 1.1 Purpose
This prototype shows ABB India's finance team how LedgerAlpha runs their **balance sheet review**:
- it works GL account by GL account on their SAP Central Finance (CFIN) line-item structure;
- configurable rules surface aged items, exceptions and outliers;
- for each flagged item it suggests an action (clear, write off, write back, provide, reclassify, follow up), with a visible rationale;
- decisions are captured with approvals and evidence;
- it produces the schedules auditors ask for.

This is ABB's priority #1. On 05-Oct, Siddarth called it the area "where maximum AI deployment can be done", because there is "whole lot of data and you can configure set of rules. For AI to throw out… exceptions, outliers" [Oct05].

### 1.2 Workshop context
- **When and how:** online, 3 hours, in the week of 12-Oct-2026 (date TBC). It may be split into two blocks on the same day. Around 10–15 attendees [Oct05].
- **Running order** [QP]:
  1. Balance sheet review (this prototype), about 60–70 minutes.
  2. Account reconciliation, depending on S2 (§10.8).
  3. Division reporting for the 6–7-person reporting team, about 25 minutes (§10.9–10.10).
  4. Close by naming BG and FX as Phase 2.
- **Framing:** both stakeholders asked to see what exists first, then what would be built [Oct05]. The prototype is presented honestly as the LedgerAlpha accelerator configured on ABB's data structure, running on synthetic data unless ABB approves masked samples. It is never presented as a deployed system or as production data.

### 1.3 What success looks like in the session
1. The team recognises their own process: GL by GL, ageing buckets, the >180-day trigger, the clear / write off / write back decision, auditor schedules.
2. A rule threshold is changed live and the exception counts move. This answers "configure set of rules".
3. Any record a viewer asks about opens to a real, consistent detail view. There are no dead ends and no "sample only" records.
4. A write-back goes from flag to recommendation, preparer proposal, approval, tax review and JV proposal sheet, and the audit trail shows every step.
5. A per-account auditor schedule is generated and exported to Excel.
6. Nothing claims to post into SAP. Outputs are proposals that ABB's team posts.

### 1.4 Relationship to LedgerAlpha
- This repo is a new, focused build, not a fork. It reuses LedgerAlpha's design system, UI primitives and selected components (§12). It keeps the LedgerAlpha name and its glass-box principles: deterministic versus judgement labelling, evidence behind every figure, and an immutable trail.
- The original repository (`/app/app-ledger-alpha`) is **never modified** by this work. It holds uncommitted in-flight work.
- Why a new build rather than a re-skin [LA]:
  - LedgerAlpha models a month-end close for a fictional 214-entity group.
  - Its data is built around USD.
  - It has no Indian tax content.
  - Most of its records are generated shells.
  - ABB's review is explicitly outside the month-end close, for one company and one division.

---

## 2. Scope

### 2.1 In scope

| Area | Priority | Notes |
|---|---|---|
| Balance sheet review / GL scrutiny (V-A1 to V-A5) | M | The core of the workshop |
| Configurable rule library with live re-run | M | ABB's explicit ask |
| Action recommender with derived confidence | M | Clear / write off / write back / provide / reclassify / follow up / retain |
| Decisions, approvals (placeholder delegation of authority, DoA), tax review, JV proposal export | M | Proposal only |
| Commentary, preparer/reviewer sign-off | M | |
| Auditor schedules with Excel export | M | |
| Data Sources: FBL3N-shaped dataset, control totals, import of masked extract | M (synthetic) / S (import) | |
| Ask LedgerAlpha (grounded Q&A), Explain affordance | S | Answers only from loaded data |
| Audit trail | M | |
| Account reconciliation segment | Gated by S2 | §10.8 |
| Division reporting: V-C1 working capital, V-C4 what moved | Gated by section 7 answers | §10.9–10.10 |

### 2.2 Design boundaries
- **One company code and one division** (TBC S3). There is no entity switcher and no consolidation.
- **Single currency for review: INR.** Foreign-currency items show their document currency as information only. There is no currency switcher.
- **Quarterly review period, outside the month-end close** [ABB]. The demo period is **Q3 CY2026, as at 30-Sep-2026**, compared with the last review as at 30-Jun-2026. ABB India's financial year is the calendar year. Income-tax items (TDS, 26AS) use the Indian FY (April–March).
- **Proposal-only outputs** [QP D4]. There is no ERP posting, no write-back API, and no "auto-posted" language anywhere.
- **Browser-only prototype.** No backend, no login, no network calls for data.

### 2.3 Out of scope for this phase (W)
- Real connectivity to SAP CFIN, legacy SAP, or Snowflake (described as future state in §13).
- Posting to SAP or any system of record.
- BG lifecycle register and FX / hedge tracking (named as Phase 2 at the workshop close). A BG lookup is used only as evidence for the vendor-advance rule.
- IDPMS / EDPMS (explicitly out [Oct05]).
- Inventory health (V-C2) and purchase price / cost inflation (V-C3), unless ABB marks them "Keep" and data structure is available. That data sits in legacy SAP MM/CO/PS.
- Authentication, SSO, multi-user concurrency, mobile layouts.
- OneGRC or GRCM integration (do not lead with it [QP]).

### 2.4 Dependencies on ABB answers (due Fri 09-Oct-2026)
- **S2** (what "account reconciliation" means) decides segment 2 (§10.8).
- **A1–A13 and A-S1 to A-S6** set fields, groups, ageing, rules, the DoA and the schedule layout. Defaults are used until they arrive.
- **C1–C9** decide whether and how to build the division reporting views.
- **D1** (data approval route) decides synthetic versus masked data (§6.8).

---

## 3. What ABB told us (traceability)

| # | What ABB said | Source | Requirement impact |
|---|---|---|---|
| T1 | Review is done GL by GL; aged items, e.g. "balances more than a hundred and eighty days" | [Sep18] | Ageing (§6.6), R01, SCR-03 |
| T2 | Items are "cleared… written off, written back" | [Sep18] | Action set (§8), SCR-05 |
| T3 | It "can't [be] address[ed] as part of the month close"; done when "preparing those schedules for the auditors" | [Sep18] | Quarterly period model, SCR-06 |
| T4 | Priority #1 is balance sheet review; priority #2 is account reconciliation; working capital next | [Oct05] | Scope ordering |
| T5 | "Configure set of rules. For AI to throw out… exceptions, outliers" | [Oct05] | Rule library (§7), SCR-07 |
| T6 | "Standard SAP environment… data structures… follow a certain layer" | [Oct05] | SAP-native data model (§6) |
| T7 | FI (balance sheet, AR, AP) is in CFIN; CO/MM/PM remain in legacy SAP; CFIN feeds Snowflake | [Oct05], [Sep18] | `sourceSystem`; PO data from legacy MM (§6.5) |
| T8 | Old projects in legacy SAP, new in CFIN; the team extracts both and reconciles in Excel | [Sep18] | Two source systems per item; A11 |
| T9 | Show existing reports first; division and transaction level, not country level; 6–7 users | [Oct05] | Framing; drill to document everywhere |
| T10 | Price-sensitive data with restricted access; Siddarth to check what redacted data can be shared | [Oct05] | §6.8, §11.5 |
| T11 | Concern about whether agentic AI is allowed on the ERP | [Sep18] | Proposal-only (D-03), audit trail |
| T12 | Invoice 100 + GST 18 = 118; TDS on basic value at varying rates; customer pays 108 without advice | [Sep18] | Segment 2; TDS receivable rule R07 |
| T13 | BGs are tracked in an offline Excel register | [Sep18] | BG reference data for R05 only |

---

## 4. Users and roles

The prototype uses a role switcher in the top bar instead of a login. People shown in the app are **fictional**. Names of real ABB staff are never used in the UI or the seed data.

| Role (in app) | ABB counterpart (by function) | Does in the prototype | Can |
|---|---|---|---|
| Division Finance Head | Head of the financial commercial function (decision-maker) | Reviews the overview; approves decisions in band; signs off accounts as reviewer | Approve / reject, reviewer sign-off, edit rules |
| GL Account Owner | Finance team members who own GLs | Works the account: reviews flags, proposes actions, writes commentary | Propose decisions, preparer sign-off, request follow-ups |
| AR & Cash Lead | AR, cash management and BG owner | Owns receivable, advance, suspense and TDS items | Same as GL Owner for assigned accounts |
| Tax Reviewer | Indirect / direct tax team | Clears or objects to write-backs and TDS write-offs | Tax clearance |
| Reporting Analyst | Division reporting team (6–7 users) | Uses the reporting views | Read, export |
| Statutory Auditor | External auditor | Sees schedules, decisions, evidence, trail | Read-only, export |

- **FR-PLT-01 (M):** The role switcher changes the acting role immediately. Actions the role may not take are disabled and say why, for example "Only the Tax Reviewer can clear a write-back".
- **FR-PLT-02 (M):** Proposer and approver must be different people (four-eyes). The prototype blocks self-approval even when one presenter switches roles. The demo roster gives each role a distinct fictional person.
- **FR-PLT-03 (S):** The roster of about 8 fictional people (Indian names) is defined in seed data in I1, with an owner per GL account.

---

## 5. Demo storyboard (balance sheet review segment)

This is the click path the build must support end to end, with no dead ends. Timings are indicative.

| # | Screen | What the presenter shows | Min |
|---|---|---|---|
| 1 | Data Sources | "Your CFIN line-item layout (FBL3N), synthetic values, as at 30-Sep-2026." Record counts; control totals tie to the trial balance; items from CFIN and from legacy SAP | 2 |
| 2 | Review Overview | Group × ageing heatmap: where the >180-day value sits (GR/IR, vendor advances, unbilled). Movement since the Q2 review. Accounts signed off so far | 5 |
| 3 | Rule Library | The rules in plain language. Change "vendor advance age" from 365 to 270 days, re-run; counts change on the overview and queue | 5 |
| 4 | Account Scrutiny: GR/IR | Balance broken down by bucket and suggested action. Open S-01: GR 412 days old, PO closed, never invoiced, so a **write-back candidate**. The confidence derivation shows its factors. Tax review required | 10 |
| 5 | Account Scrutiny: vendor advances | S-04: ₹1.24 cr advance, 438 days, no PO activity, vendor blocked, advance-payment BG valid to 31-Dec-2026, so **follow up / recover before the BG expires**. Contrast S-05: no BG, so **provide** | 5 |
| 6 | Account Scrutiny: TDS receivable | S-06: credit missing in 26AS for FY2024-25 Q3, so follow up with the customer. S-07: FY2022-23 Q4, so **write off** with tax review | 5 |
| 7 | Exception Queue | Outliers: a ₹25,00,000 round-number manual JV posted 30-Sep at 11:42 PM; a wrong-sign line in vendor advances; a posting to a dormant suspense GL | 5 |
| 8 | Decide and approve | GL Owner proposes the S-01 write-back. Switch to Division Finance Head and approve. Switch to Tax Reviewer and clear. Export the JV proposal sheet, labelled proposal only | 8 |
| 9 | Commentary and sign-off | Drafted account commentary, edited by the owner; preparer then reviewer sign-off; the account shows Signed off | 5 |
| 10 | Auditor Schedules | Generate the GR/IR schedule (opening, movements, closing, ageing, items above threshold with support and sign-off) and export to Excel | 5 |
| 11 | Ask LedgerAlpha | "Which write-back candidates above ₹10 lakh are waiting for tax review?" The answer cites the records | 3 |
| 12 | Audit Trail | Everything just done, with who, when, before → after and why | 2 |

---

## 6. Data model

### 6.1 Principles
- **SAP-native.**
  - Fields mirror the CFIN universal journal (ACDOCA) as seen in the G/L line-item report (FBL3N), so the screen looks like ABB's data [T6].
  - Field names in the UI use SAP's labels, such as "Posting date" and "Assignment".
- **One amount convention.** INR in company-code currency, signed with debit + and credit −. Document currency and amount are kept for foreign-currency items.
- **Two source systems.** Every item carries `sourceSystem` (CFIN or Legacy SAP) [T7, T8].
- **Every record is real.**
  - All items, not a curated few, are evaluated by every applicable rule and open to full detail.
  - No record is a decorative shell. This fixes LedgerAlpha's "fidelity cliff" [LA].
- **Synthetic by default, swappable.** The same schema accepts a masked ABB extract (§6.8).

The draft TypeScript contract is in `src/types/index.ts` and is finalised in I1.

### 6.2 GL account master (`GlAccount`)

| Field | SAP source | Notes |
|---|---|---|
| gl | SKA1/SKB1 `SAKNR` (ACDOCA `RACCT`) | Masked or category-coded if ABB requires (A-S2) |
| description | `TXT50` | |
| group | derived | One of the review groups below |
| scheduleIIILine | mapping | Ind AS Schedule III (Division II) balance sheet line |
| nature / normalBalance | derived | Asset/Dr or Liability/Cr; drives the wrong-sign rule |
| openItemManaged | SKB1 `XOPVW` | Open-item accounts are reviewed line by line; others from balance and schedule (A4) |
| reconAccount | SKB1 `MITKZ` | AR/AP control accounts are reviewed via the sub-ledger (FBL5N/FBL1N) |
| ownerId, reviewerId | assignment | [Deb B1] |
| riskTier, reviewFrequency | assignment | High for GR/IR, suspense, advances, provisions, intercompany |

**Review groups** (TBC A3: the high-effort groups named in [QN] A3):

| Group | Nature | Default risk | Typical review question |
|---|---|---|---|
| GR/IR clearing | Liability | High | Received but never invoiced? Invoiced but never received? |
| Vendor advances | Asset | High | Recoverable? Covered by an advance-payment BG? |
| Customer advances (contract liabilities) | Liability | High | Still owed to the customer, or should it be adjusted / written back? |
| Unbilled revenue (contract assets, Ind AS 115) | Asset | High | Billable? Stalled project? ECL needed (Ind AS 109)? |
| Retention receivable | Asset | High | Is the defect liability period (DLP) over? Release chased? |
| TDS receivable | Asset | High | Does the credit appear in Form 26AS / AIS? |
| GST input / output (incl. GST TDS receivable) | Asset | Medium | Ageing and reversal triggers |
| Suspense and clearing (incl. incoming-payment clearing) | Asset | High | Why is anything still here? |
| Accruals and provisions | Liability | Medium | Still required? Excess to write back? |
| Deposits (EMD / security) | Asset | Medium | Refund due after tender or contract close? |
| Statutory dues payable (TDS, GST, PF) | Liability | Medium | Paid on time? Reportable if over 6 months |
| Employee advances | Asset | Low | Settled? |
| Trade receivables / payables (control) | Asset / Liability | Medium | Reviewed via sub-ledger; overlaps segment 2 |
| Intercompany (ABB group) | Asset | Medium | Agreed with counterparty? |

### 6.3 Open item (`OpenItem`): one row of the G/L line-item report

| Field | SAP field (BSEG/BSIS · ACDOCA) | Req. | Notes |
|---|---|---|---|
| key | composite | M | `companyCode-fiscalYear-docNo-lineItem` |
| companyCode | `BUKRS` · `RBUKRS` | M | Placeholder "IN01" (TBC A-S1) |
| gl | `HKONT` · `RACCT` | M | |
| fiscalYear, docNo, lineItem | `GJAHR`, `BELNR`, `BUZEI` · `DOCLN` | M | |
| docType | `BLART` | M | SA, KR, KZ, KA, DR, DZ, WE, RE, AB… |
| postingKey | `BSCHL` | S | |
| postingDate / documentDate | `BUDAT` / `BLDAT` | M | Ageing basis is posting date by default (TBC A5) |
| entryDate / entryTime | `CPUDT` / `CPUTM` | M | Period-end and after-hours checks |
| enteredBy | `USNAM` | M | Masked user ID |
| amount | `DMBTR` · `HSL` | M | INR, signed |
| docCurrency / amountDoc | `WAERS` / `WRBTR` · `WSL` | S | |
| assignment, reference, text | `ZUONR`, `XBLNR`, `SGTXT` | S | Free text is masked for names in real data |
| profitCentre, wbs, costCentre | `PRCTR`, `PS_POSID`, `KOSTL` · `RCNTR` | M / S / C | Drill path: division → profit centre → WBS → document (TBC C3) |
| partner | `LIFNR` / `KUNNR` | S | Masked codes (VEND-0142, CUST-0217) |
| po | `EBELN` / `EBELP` | S | GR/IR and advances |
| sourceSystem | derived | M | CFIN or Legacy SAP |
| manual | derived | M | Manual G/L journal (doc type SA via FB50/FB01; TBC A8) |

### 6.4 Balances and movements (`GlBalance`)
For each GL: the balance at the prior review date, total debits and total credits in the period, and the closing balance. These feed "movement since last review" (SCR-01) and the auditor schedule (SCR-06).

- **FR-DAT-05 (M):** For every GL, closing balance must equal the sum of its open items for open-item-managed accounts. Any difference is shown, never hidden.

### 6.5 Supporting reference data (used by the rules)

| Dataset | Source in ABB's landscape | Used by |
|---|---|---|
| PO status: open/closed, last GR date, last invoice date | Legacy SAP MM (A12) | R02–R05 |
| Parties: vendor and customer master; masked name, PAN, GSTIN; status; MSME flag; government/PSU flag | CFIN / legacy master | R05, R06, R18 |
| Bank guarantees received, e.g. advance-payment BGs from vendors | Offline Excel register [T13] | R05 |
| Form 26AS / AIS TDS credits, by deductor TAN × FY quarter | TRACES download (tax team, B8) | R07 |
| Projects / WBS: stage, DLP end, customer, profit centre | Legacy SAP PS | R06, R08, R09 |
| Users and roles | Seed | Ownership, approvals |

### 6.6 Derived fields
- **Age** in days = as-at date − basis date. Basis is posting date by default; document date or due date are configurable (TBC A5).
- **Bucket:** 0–90, 91–180, 181–365, over 365 days (TBC A5). The review trigger is over 180 days [ABB T1].
- **Counter-item link:** for GR/IR, debit and credit lines on the same PO and item. For suspense and clearing, offsetting lines with the same assignment.
- **Dormant GL:** no postings in the 180 days before the item.

### 6.7 Synthetic dataset specification (I1)
- **Shape:**
  - About 60–70 balance sheet GLs across the review groups.
  - About 8,000 open items with posting dates from 2022 to 30-Sep-2026, weighted towards recent dates.
  - About 240 vendors and 110 customers.
  - About 190 projects / WBS (project controlling manages about 190 projects [Sep18]) across 4 profit centres.
  - About 15% of items come from legacy SAP.
- **Plausibility:** totals are plausible for one ABB India division and are recalibrated after S3/A3. Amounts are not round, except where roundness is the point (S-12).
- **Deterministic:** a seeded generator, so the same data appears in every rehearsal.

**Planted scenarios.** The demo anchors are listed below. All other items are evaluated by the same rules; the anchors only guarantee that each story exists.

| ID | Group | Situation (as at 30-Sep-2026) | Amount | Expected rule hits | Expected recommendation |
|---|---|---|---|---|---|
| S-01 | GR/IR | GR credit, PO closed, GR 412 days ago, no invoice ever received | ₹18,64,320 Cr | R01, R02 | Write back; tax review; band B2 |
| S-02 | GR/IR | GR credit and invoice debit on the same PO line, uncleared (CFIN / legacy split) | ₹7,42,180 each | R03 | Clear |
| S-03 | GR/IR | Invoice debit with no goods receipt, 128 days | ₹4,06,950 Dr | R04 | Follow up (GR pending) |
| S-04 | Vendor advances | Advance 438 days old; no GR/IR on PO for 300+ days; vendor blocked; advance-payment BG valid to 31-Dec-2026 | ₹1.24 cr Dr | R01, R05 | Follow up: recover or invoke BG before expiry (urgent) |
| S-05 | Vendor advances | Advance 512 days old; PO closed; vendor inactive; no BG | ₹36,80,000 Dr | R01, R05 | Provide 100%, then write-off approval |
| S-06 | TDS receivable | Customer deduction for FY2024-25 Q3 not in 26AS (TAN mismatch suspected) | ₹4,62,700 Dr | R01, R07 | Follow up with the customer (TDS return revision) |
| S-07 | TDS receivable | FY2022-23 Q4 deduction never reflected in 26AS | ₹2,18,940 Dr | R01, R07 | Write off; tax review |
| S-08 | Unbilled revenue | Metro project on hold; no billing for 274 days | ₹2.86 cr Dr | R01, R08 | Follow up with the project manager; provide (ECL) if not billable |
| S-09 | Retention | PSU customer; DLP ended 240 days ago; retention not released | ₹1.12 cr Dr | R01, R09 | Follow up for release; consider ECL |
| S-10 | Customer advances | Project closed; advance unadjusted for 540 days | ₹58,40,000 Cr | R01, R06 | Write back after refund check; tax review |
| S-11 | Suspense / clearing | Incoming RTGS in payment clearing for 211 days; no customer assigned | ₹23,60,000 Cr | R01, R10 | Reclassify to the customer; hand off to receipt matching (segment 2 bridge) |
| S-12 | Provisions | Manual JV, ₹25,00,000 exactly, posted 30-Sep-2026, entered at 11:42 PM | ₹25,00,000 Cr | R12, R13 | Review (outlier); support requested |
| S-13 | Vendor advances | Credit line in an advance GL (a payable posted to the wrong GL) | ₹3,46,000 Cr | R11 | Reclassify |
| S-14 | Suspense | Posting to a suspense GL with no activity for 14 months | ₹9,80,000 Dr | R14 | Review; clear or reclassify |
| S-15 | Provisions | Same assignment moved across three GLs within 120 days | ₹14,20,000 | R15 | Review (reclass churn) |
| S-16 | Statutory dues | TDS payable line open for 7 months | ₹1,84,300 Cr | R16 | Follow up; CARO 2020 reportable |

- **FR-DAT-01 (M):** The generator produces the dataset above, deterministically.
- **FR-DAT-02 (M):** A scenario test asserts that each planted scenario produces exactly its expected rule hits and recommendation.

### 6.8 Swapping in ABB's masked extract (I10)
- **FR-DAT-03 (S): import.** Import CSV or XLSX in ABB's FBL3N export layout, plus the GL list. A field-mapping step maps ABB's column headers to §6.3 and remembers the mapping. Rows that fail validation are listed with the reason; they are not dropped silently.
- **FR-DAT-04 (M): control totals.** Per GL: record count, debit total, credit total and net, compared with the trial-balance figures entered or imported. Differences are highlighted.
- **FR-DAT-06 (M): masking check before load.** Scan free-text fields for PAN / GSTIN / bank-account patterns and flag suspected unmasked values. [QN] masking guide: party names, PAN, GSTIN and bank numbers replaced with consistent codes; amounts scaled by one factor.
- **FR-DAT-07 (M): storage.** Masked ABB data stays in `data/private/` on the J2W machine, is git-ignored, is never committed or uploaded, and is deleted after the workshop unless ABB agrees otherwise [QP watch-outs].

---

## 7. Rule library

### 7.1 Rule model
- Each rule is **deterministic**: the same data and parameters give the same hits, every time.
- A rule has an ID, a plain-language name, the groups it applies to, editable parameters with units, a severity, a candidate action, its Indian legal or accounting basis where one applies, an origin ([ABB] or [J2W]), and an enabled flag.
- A **hit** carries a plain-language reason that names the item's own facts (for example "GR posted 412 days ago on PO 4500187321, PO closed 03-Feb-2026, no invoice received"), plus the facts it evaluated.

### 7.2 Rules

| ID | Rule | Applies to | Logic (defaults) | Candidate action | Basis / note | Origin |
|---|---|---|---|---|---|---|
| R01 | Aged beyond review threshold | All open-item groups | Age > **180 days** (TBC A5) | Follow up, unless a more specific rule hits | ABB's review trigger | [ABB] |
| R02 | GR/IR received, not invoiced | GR/IR | Credit item; age > **365 days**; no invoice receipt on the PO line since GR; PO closed or no PO activity for 180 days (TBC A7) | Write back (tax review) | Liability no longer expected to be settled; write-back is taxable income | [J2W] (A7 example) |
| R03 | GR/IR counter-item | GR/IR | Debit and credit on the same PO and item that net within ₹100 or 0.5% (TBC) | Clear | Mechanical clearing gap (e.g. CFIN / legacy split) | [J2W] |
| R04 | Invoiced, not received | GR/IR | Debit item (invoice before GR); age > **90 days** | Follow up (GR or price variance) | | [J2W] |
| R05 | Stale vendor advance | Vendor advances | Age > **365 days** and no GR/invoice on the linked PO in 180 days (TBC A7). Then check for a valid advance-payment BG from the vendor | With BG: follow up, recover or invoke. Without BG: provide | An advance-payment BG should exist for a material advance [Deb §2.3] | [J2W] (A7 example) |
| R06 | Stale customer advance | Customer advances | Credit item; age > **365 days**; project closed / DLP ended, or no billing against it in 365 days | Write back after refund check (tax review) | Ind AS 115 contract liability | [J2W] |
| R07 | TDS credit missing in 26AS | TDS receivable | No 26AS credit for the customer's TAN × FY quarter within ₹10, once the quarter's TDS return due date + 60 days has passed (TBC B8). If older than **3 FYs** (TBC) | Follow up; if older than 3 FYs, write off (tax review) | TDS credit is allowed as reflected in Form 26AS / AIS. Verify the current rule reference under the Income-tax Act, 2025 before showing it on screen | [J2W] (A7 example) |
| R08 | Stale unbilled revenue | Unbilled revenue | No billing against the WBS for > **180 days**, or project stage "On hold" | Follow up; provide (ECL) if not billable | Ind AS 115 contract asset; Ind AS 109 ECL | [J2W] |
| R09 | Retention overdue | Retention | DLP end + **90 days** passed, not released; over 365 days past DLP | Follow up (release); over 365 days past DLP, provide (ECL) | Retention released after DLP / final acceptance | [J2W] |
| R10 | Suspense / clearing aged | Suspense and clearing | Age > **30 days** (TBC) | Reclassify / clear. Incoming-payment clearing goes to receipt matching | Suspense should be transient | [J2W] |
| R11 | Wrong sign | All | Item or account balance opposite to the GL's normal balance, above ₹10,000 | Reclassify | | [J2W] (A8 example) |
| R12 | Round-number manual entry | All | Manual JV; amount ≥ ₹1,00,000 and an exact multiple of ₹1,00,000 | Review | Estimate or plug indicator | [J2W] (A8 example) |
| R13 | Period-end / after-hours manual entry | All | Manual JV posted in the last 2 days of the quarter, entered after quarter end with a posting date inside it, or entered 10 PM–6 AM | Review | Cut-off and override risk | [J2W] (A8 example) |
| R14 | Posting to a dormant GL | All | No other postings on the GL in the previous 180 days | Review | | [J2W] (A8 example) |
| R15 | GL-to-GL churn | All | Same assignment or reference reclassified across ≥ 3 GLs within 180 days | Review | Items moved rather than resolved | [J2W] (A8 example) |
| R16 | Statutory dues overdue | Statutory dues payable | Credit item open > **180 days** | Follow up | Undisputed statutory dues outstanding more than 6 months are reportable under CARO 2020 clause 3(vii)(a) | [J2W] |
| R17 | GST input credit at risk (candidate, off by default) | Trade payables / GST input | Vendor invoice unpaid > 180 days from invoice date | Follow up: input tax credit (ITC) reversal check | CGST Act s.16(2), second proviso. Needs AP payment data | [J2W] |
| R18 | MSME payable beyond 45 days (candidate, off by default) | Trade payables | Micro/small vendor; unpaid beyond 45 days (agreed terms) or 15 days (none) | Follow up | s.43B(h) of the 1961 Act. Verify the Income-tax Act, 2025 reference. Needs the MSME flag | [J2W] |

- **FR-RUL-01 (M):** R01–R16 are implemented and enabled. R17–R18 are implemented but disabled until ABB asks for them.
- **FR-RUL-02 (M):** Each rule has unit tests for at least one positive and one negative case.
- **FR-RUL-03 (M):** Changing a parameter or enabling/disabling a rule re-evaluates all items in under 500 ms for the demo dataset. Every count on every screen updates without a reload, and an audit event records old value → new value and who changed it.
- **FR-RUL-04 (M):** Rules marked [J2W] show a "proposed — confirm with ABB" tag until confirmed, so ABB's own rules (A7) are visibly theirs.
- **FR-RUL-05 (S):** A "Reset to defaults" control restores the shipped parameters.
- **FR-RUL-06 (C):** Add a rule from a template (age threshold, amount threshold, field-equals) without code.

### 7.3 Legal references to verify before they appear on screen
- **Income-tax Act, 2025** (effective 01-Apr-2026) renumbers the TDS provisions and s.43B(h) [QP]. On screen, show the **nature of payment** (e.g. "contract work", "professional fees") and show section numbers only after the mapping is verified.
- **CGST Act s.16(2) second proviso** (180-day payment condition for ITC), **s.51** (GST TDS at 2%), and **CARO 2020 clause 3(vii)(a)**: verify wording before quoting.

---

## 8. Recommendation logic

### 8.1 Decision tree
Generalised from [Deb §2.3]:
1. A matching counter-item exists → **Clear**.
2. The item is on the wrong GL → **Reclassify**.
3. Debit balance that cannot be recovered (vendor stopped supplying, TDS credit never in 26AS, stalled unbilled) → **Provide**, then **Write off** with approval.
4. Credit balance with no obligation behind it (old GR/IR credit never invoiced, stale customer advance, excess provision) → **Write back** with approval and tax review.
5. Facts are insufficient, or the owner must act (chase vendor, invoke BG, bill customer) → **Follow up**.
6. The reviewer accepts the item as valid with a justification (e.g. a disputed amount under arbitration) → **Retain**.

### 8.2 Evidence checked per group

| Group | Evidence the recommender looks at | Possible actions |
|---|---|---|
| GR/IR | PO status, last GR / invoice dates, counter-item, vendor status | Clear, Write back, Follow up |
| Vendor advances | PO activity, vendor status, BG (type, validity, amount) | Follow up (recover / invoke BG), Provide, Write off |
| Customer advances | Project stage, billing since, refund obligation | Write back, Follow up, Retain |
| Unbilled revenue | Project stage, last billing, milestone status | Follow up, Provide |
| Retention | DLP end, customer type (PSU), release request | Follow up, Provide |
| TDS receivable | 26AS by TAN × quarter, age in FYs | Follow up, Write off |
| Suspense / clearing | Counter-item, narration, assignment | Clear, Reclassify |
| Provisions | Basis, movement, utilisation | Retain, Write back |

### 8.3 Confidence is always derived
- **FR-REC-01 (M):** Every recommendation carries a confidence of 0–1 equal to the weighted sum of the evidence factors that are met. The factors and their weights are shown next to the score. No confidence number appears without its derivation [LA finding].
- Example: write-back of a GR/IR credit.
  - Age > 365 days: 0.25
  - PO closed: 0.25
  - No invoice since GR: 0.20
  - Vendor inactive or blocked: 0.10
  - No counter-item found: 0.10
  - No open follow-up or dispute: 0.10
- **Bands:**
  - ≥ 0.85: strong.
  - 0.60–0.85: moderate.
  - < 0.60: weak. The recommendation defaults to **Follow up**.
- **FR-REC-02 (M):** Rule hits are labelled **Deterministic**. Recommendations and drafted text are labelled **Judgement**, using the harvested `MethodBadge`.

### 8.4 Narrative drafting
- **FR-REC-03 (M):** In the prototype, rationale, account commentary and follow-up emails are generated from the item's structured facts by templates. They contain no figure that is not in the data.
- Whether to use a live LLM for drafting is decision **D-04** (§14). It is off for the workshop by default.

### 8.5 Guardrails
- **FR-REC-04 (M):**
  - The recommender never posts and never auto-approves.
  - Write-backs and TDS write-offs always route to the Tax Reviewer.
  - Items at or above materiality (₹1,00,000 in the >180-day buckets; TBC A6) need a written justification before they can be proposed.
- **FR-REC-05 (S):** If data or rule changes alter an item's facts after a decision was taken, the decision is kept but flagged "facts changed since decision" for re-review.

---

## 9. Workflow and states

### 9.1 Item lifecycle

```
within-policy
flagged ──► in-follow-up ──► decision-proposed ──► approved ──► exported ──► closed-in-sap
   │                              │      ▲             │
   └──────────────────────────────┘      └─ rejected ◄─┘
```

| Transition | Who | Condition |
|---|---|---|
| → flagged | Rule engine | At least one enabled rule hits |
| flagged → in-follow-up | GL Owner | Follow-up requested (owner, due date, drafted message) |
| → decision-proposed | GL Owner | Action chosen; justification entered if at or above materiality |
| decision-proposed → approved | Approval chain per band (§9.3) | Approver ≠ proposer; Tax Reviewer cleared, where required |
| decision-proposed → rejected | Any approver in the chain | Reason required; item returns to the owner |
| approved → exported | GL Owner / Division Finance Head | Included in a JV proposal sheet export |
| exported → closed-in-sap | Data refresh | Item no longer open in the next extract (simulated in the demo by a "mark posted in SAP" control) |

### 9.2 Account review lifecycle
`not-started → in-review → ready-for-signoff → preparer-signed → reviewer-signed`, with `reopened` from any signed state.

- **Ready for sign-off:** every flagged item at or above materiality has a decision (or a follow-up with a due date), and commentary exists.
- **Reviewer sign-off:** locks the account's decisions and commentary. Reopening needs a reason, which is logged.

### 9.3 Approval routing
Placeholder bands, replaced by ABB's delegation of authority (TBC A6 / A-S6):

| Band | Amount (absolute) | Approval chain |
|---|---|---|
| B1 | Up to ₹5,00,000 | Division Finance Head |
| B2 | Up to ₹50,00,000 | Division Finance Head → Escalation 1 (per ABB DoA) |
| B3 | Above ₹50,00,000 | Division Finance Head → Escalation 1 → Escalation 2 (per ABB DoA) |

- Write-backs and TDS write-offs add the **Tax Reviewer** at any band.
- Clear and Reclassify under ₹5,00,000 need the reviewer only.

### 9.4 Follow-ups
- **FR-FUP-01 (M):** A follow-up records the owner (internal role or counterparty type), due date, the drafted message (email text built from facts, e.g. "please confirm the rate applied" or "please revise your TDS return for FY2024-25 Q3"), status, and the response captured.
- Messages are **not sent** from the prototype. Copy and export only.

### 9.5 Outputs
- **JV proposal sheet (M):** see Appendix C. Labelled "Proposal — to be reviewed and posted by ABB in SAP". There is no system posting.
- **Auditor schedule (M):** see Appendix D.
- **Follow-up list (S):** owner, item, due date, message, status; Excel export.

---

## 10. Screens and functional requirements

Screens are registered in `src/lib/screens.ts`, which drives routes, the sidebar and the build-plan card.

Rules for every screen (from LedgerAlpha's A3.1, kept):
- Open on a signal visual, then summaries, then tables as drill-down.
- Every number is computed from the loaded data. Nothing is hard-coded.
- Every row opens something real.
- No button ends in a toast alone: every action changes state visibly.

### 10.0 Global elements
- **FR-PLT-04 (M):** A data banner on every screen states synthetic or masked data, the as-at date, and that amounts are in ₹.
- **FR-PLT-05 (M):** The period chip shows "Q3 CY2026 · as at 30-Sep-2026". The role switcher behaves as described in §4.
- **FR-PLT-06 (M):** An item drawer opens from any item reference anywhere. It shows the document fields (§6.3), related documents (PO status, counter-items, BG, 26AS, project), rule hits with reasons, the recommendation with its derivation, the decision and approvals, the follow-up, and the history timeline.
- **FR-PLT-07 (S):** An "Explain" control on balances, buckets, flags and recommendations opens Ask LedgerAlpha with a record-specific question.
- **FR-PLT-08 (S):** Global search across GL, document number, party code, PO and WBS.
- **FR-PLT-09 (S):** "Reset demo" (Settings) returns all decisions, sign-offs and rule parameters to the seeded state.

### 10.1 SCR-01 Review Overview (V-A1) · `/` · I3
- **Leads with:** a GL group × ageing bucket heatmap, switchable between amount and count.
- **FR-OVW-01 (M):** KPI row:
  - total open items reviewed (value and count);
  - value over 180 days;
  - items flagged;
  - decisions pending approval;
  - accounts signed off (x of y);
  - proposed write-backs / write-offs / provisions (value).
- **FR-OVW-02 (M):** Heatmap cells show amount and count. Clicking a cell opens the Exception Queue (or the account list) filtered to that group and bucket.
- **FR-OVW-03 (M):** Movement since the last review, per group: opening at 30-Jun-2026 → closing at 30-Sep-2026, with the change in the >180-day value.
- **FR-OVW-04 (M):** "Needs a decision": the ten highest-value flagged items without a decision, each opening the item drawer.
- **FR-OVW-05 (M):** Filters by GL group, owner, profit centre and source system. Filters persist in the URL.
- **FR-OVW-06 (S):** Sign-off progress by group (stepper or bar).
- **Acceptance:** after the rule change in storyboard step 3, the heatmap, KPIs and "Needs a decision" list reflect it without a reload.

### 10.2 SCR-02 GL Accounts · `/accounts` · I3
- **Leads with:** accounts by risk tier × review status.
- **FR-ACC-01 (M):** Register columns: GL, description, group, Schedule III line, owner, reviewer, risk, balance, value over 180 days, flags, review status. Each row opens SCR-03.
- **FR-ACC-02 (S):** Reassign owner or reviewer and change the risk tier; logged.
- **FR-ACC-03 (S):** Distinguish open-item accounts from balance-only accounts. Balance-only accounts are reviewed against a supporting-schedule figure entered by the owner (A4).

### 10.3 SCR-03 Account Scrutiny (V-A2) · `/accounts/:gl` · I4
- **Leads with:** the balance broken down by ageing bucket and by suggested action. Harvested `SubstantiationPanel`; each segment expands to its items.
- **FR-SCR-01 (M):** Header: GL, description, Schedule III line, owner, reviewer, balance (Dr/Cr), movement since the last review, review status.
- **FR-SCR-02 (M):** Items table: document no., type, posting date, age, bucket, party, PO/WBS, text, amount, source system, rule chips, suggested action, confidence (with derivation on hover/click), status.
  - Sortable and filterable.
  - "Flagged only" is on by default.
  - Pagination or virtualisation keeps it fast at a few thousand rows.
- **FR-SCR-03 (M):** Item drawer per FR-PLT-06, with decision controls for the acting role: propose action and justification; request follow-up; approve / reject; tax clear / object.
- **FR-SCR-04 (M):** Account commentary. A draft is generated from facts, for example: "₹2.31 cr over 180 days, of which ₹18.6 lakh is proposed for write-back (S-01) and ₹1.24 cr is under recovery against BG…". Commentary is editable, with an "edited by owner" marker.
- **FR-SCR-05 (M):** Preparer and reviewer sign-off per §9.2, with timestamps and the person shown.
- **FR-SCR-06 (S):** GR/IR counter-item view: PO line with GR and invoice legs (harvested `MatchGraph`).
- **FR-SCR-07 (S):** Item history timeline (harvested `LifecycleTimeline`).

### 10.4 SCR-04 Exception Queue (V-A3) · `/exceptions` · I5
- **Leads with:** a flagged → in follow-up → proposed → approved pipeline (click to filter), plus hits by rule (value and count).
- **FR-EXC-01 (M):** One row per flagged item: plain-language reason (the primary rule's reason, then "+n more"), GL, party, age, amount, suggested action, owner, status.
- **FR-EXC-02 (M):** Assign owner and add comments. Attach evidence: file name and type are recorded; the file is not uploaded anywhere. All of it is kept on the item rather than in email.
- **FR-EXC-03 (M):** Bulk actions (assign, request follow-up, propose "Clear" for counter-item hits) really change state. Rows leave or re-status immediately.
- **FR-EXC-04 (S):** Saved views: "Write-back candidates", "Outliers (R11–R15)", "TDS / 26AS", "Over ₹10 lakh".

### 10.5 SCR-05 Actions and Approvals (V-A4) · `/actions` · I5
- **Leads with:** proposed actions by type × approval band, and what is waiting on whom.
- **FR-ACT-01 (M):** Decisions list: item, action, amount, band, proposer, current approver, tax review status, age of request.
- **FR-ACT-02 (M):** Approve / reject in place for the acting role per §9.3. Self-approval is blocked (FR-PLT-02).
- **FR-ACT-03 (M):** Export the JV proposal sheet (Appendix C) for approved items, as Excel and CSV. Exported items move to `exported`.
- **FR-ACT-04 (S):** Follow-up tracker (harvested `OpenActionTracker`): owner, due date, overdue flag, response.
- **FR-ACT-05 (S):** "Mark posted in SAP" moves exported items to `closed-in-sap`. This simulates the next data refresh and is clearly labelled as a simulation.

### 10.6 SCR-06 Auditor Schedules (V-A5) · `/auditor-schedules` · I6
- **Leads with:** schedule readiness by account: ready, pending sign-off, or open items without a decision.
- **FR-AUD-01 (M):** Per-account schedule preview in the layout of Appendix D.
- **FR-AUD-02 (M):** Excel export: one workbook, with a summary sheet plus one sheet per selected account. Figures tie to SCR-03.
- **FR-AUD-03 (S):** Print-friendly view, for PDF via the browser.
- **FR-AUD-04 (S):** Auditor role sees schedules, decisions, evidence references and the trail, read-only.
- **Gated by:** A10 / A-S5. The layout is adapted to ABB's current schedule once it is shared.

### 10.7 SCR-07 Rule Library · `/rules` · I2
- **Leads with:** hits per rule, with value at stake.
- **FR-RUL-07 (M):** List rules (§7.2) with description, scope, parameters, origin tag, enabled toggle, hit count and value.
- **FR-RUL-08 (M):** Edit parameters in place, re-run per FR-RUL-03, and show the change in hits ("vendor advances: 14 → 23 items, ₹2.1 cr → ₹3.4 cr").

### 10.8 SCR-08 Account Reconciliation · `/reconciliation` · I9 (gated by S2)
- **If S2 = (a) receipt matching and/or (b) customer statements** [QP hypothesis]:
  - Segment 2 is demoed in **Recon-Alpha** (`/app/app-recon-alpha`), extended for the India deduction engine (GST-exclusive TDS, retention, LD, bank charges), remittance-less matching, the customer statement and V-B1–V-B5.
  - This screen then hands off: it explains the bridge from balance sheet review (S-11 incoming-payment clearing, S-06/S-07 TDS receivable) and links to the Recon-Alpha demo.
  - Recon-Alpha's India readiness is assessed separately before the workshop.
- **If S2 = (c) GL account reconciliations:**
  - Built here: GL balance vs supporting schedule / sub-ledger / bank, with reconciling items, substantiation and sign-off.
  - It reuses this repo's data model and the harvested reconciliation-detail pattern.
- **If S2 = (d) vendor reconciliations:** scoped after the answer.

### 10.9 SCR-09 Working Capital (V-C1) · `/reporting/working-capital` · I8 (gated)
- **Intent:** division DSO including unbilled revenue and retention, plus DPO and DIO, trended, with drill to customer, vendor, material and document [QN V-C1].
- **Data:**
  - AR/AP and unbilled come from this dataset.
  - Inventory needs legacy MM structure (C9).
  - Built only if ABB marks V-C1 "Keep" and C1–C3 / C7 are answered.

### 10.10 SCR-10 What Moved (V-C4) · `/reporting/what-moved` · I8 (gated)
- **Intent:** month-on-month variance bridge for the division result, and the ten transactions that drove most of it, each linked to the document [QN V-C4].
- **Gated by:** C6 (baseline and P&L lines). Needs P&L line items, not just the balance sheet.

### 10.11 SCR-11 Data Sources · `/data` · I1
- **Leads with:** source → validation → loaded, with counts.
- **FR-DAT-08 (M):** Dataset card: synthetic or masked, as-at date, generated or imported time, record counts by source system and group.
- **FR-DAT-09 (M):** Field map: each §6.3 field with its SAP field name and sample (masked) value.
- **FR-DAT-10 (M):** Control totals per FR-DAT-04.
- **FR-DAT-11 (S):** Import flow per FR-DAT-03, with the masking check per FR-DAT-06.

### 10.12 SCR-12 Audit Trail · `/audit-trail` · I7
- **Leads with:** activity over the review cycle by event type.
- **FR-TRL-01 (M):** Every rule change, follow-up, proposal, approval, rejection, tax decision, sign-off, reopen, export and import is logged. Each entry records actor (person or agent), role, time, object, before → after, and reason.
- **FR-TRL-02 (M):** Filter by object, actor or event type. Export to Excel.
- **FR-TRL-03 (S):** Event detail reconstructs the decision: facts at the time, rule version and parameters, the recommendation and confidence factors, and the approvals. This follows the harvested Control Plane action-detail pattern.

### 10.13 SCR-13 Settings · `/settings` · I2
- **FR-SET-01 (M):** Shows period, ageing basis and buckets, review threshold, materiality, approval bands and roles. Each value shows its source: "ABB-confirmed" or "Default — TBC A5".
- **FR-SET-02 (S):** Edit these values (same re-run behaviour as FR-RUL-03), plus Reset demo (FR-PLT-09).

### 10.14 Ask LedgerAlpha (drawer) · I7
- **FR-AIX-01 (S):** Answers come only from the loaded data, using deterministic retrieval and templated answers for a defined set of intents:
  - why is this item flagged;
  - what is driving the >180-day value in a group;
  - list write-back / write-off candidates above an amount;
  - which accounts are not signed off;
  - draft commentary for a GL;
  - what was decided on an item, and who approved it.
- **FR-AIX-02 (S):** Every answer cites records; clicking a citation opens the item or account. A retrieval trace shows what was looked up (harvested `RetrievalTrace`, `CitationChips`).
- **FR-AIX-03 (M, if the drawer is built):** Out-of-scope questions get an honest "I can answer questions about…" reply, never an invented figure.

---

## 11. Non-functional requirements

### 11.1 Platform
- React 18, TypeScript (strict), Vite 6, Tailwind 3, shadcn/ui (Radix), React Router 6, Zustand, Recharts, lucide-react. This is the same stack as LedgerAlpha, so harvested components drop in.
- Unit tests use Vitest.
- No backend. Runs from `npm run dev` (port 5180) or a static build.
- Chrome or Edge, current versions. The target screen-share resolution is **1366 × 768**; layouts hold down to 1024 px wide. Light mode by default.

### 11.2 Localisation and formats (M)
- **Money:**
  - Indian digit grouping (`₹2,40,00,000`). Compact as lakh / crore (`₹43.5 lakh`, `₹1.97 cr`); never K/M/B.
  - Dr/Cr suffixes where sign matters (`₹11,80,000 Cr`).
  - Helpers are in `src/lib/format.ts`.
- **Dates:** `30-Sep-2026`. Times are 12-hour (`11:42 PM`). ABB periods read `Q3 CY2026`; income-tax quarters read `FY2026-27 Q2`. Helpers are in `src/lib/dates.ts`.
- **Terminology:** SAP and Indian finance terms (GR/IR, FBL3N, Schedule III, Form 26AS, TAN, DLP, ECL), with a glossary tooltip where useful (Appendix A).

### 11.3 Performance (M)
- Demo dataset (~8,000 items): first render < 2 s; full rule re-run < 500 ms; screen changes < 200 ms.
- Stress target (50,000 items, for a masked extract): re-run < 3 s; tables virtualised.

### 11.4 State
- In-memory stores (Zustand): dataset, rule parameters and results, decisions, follow-ups, sign-offs, audit events. All are derived views of one source, so every screen agrees.
- **(S)** Optional `localStorage` persistence of session state for rehearsal continuity, with Reset demo.

### 11.5 Security and data handling (M)
- No data leaves the browser. The only network requests are for static assets (the web font).
- Masked ABB data handling follows FR-DAT-06 and FR-DAT-07. `data/private/` is git-ignored.
- No real ABB staff names. Party names are masked codes or fictional.

### 11.6 Demo integrity (M)
These rules are carried over from LedgerAlpha's review findings [LA]:
1. **No fidelity cliff.** Every listed record opens to a complete, consistent detail view.
2. **No toast-only actions.** Every button changes state that is visible somewhere.
3. **No hard-coded KPIs.** Every figure is computed from the dataset.
4. **Deterministic vs judgement is labelled.** Confidence always shows its derivation.
5. **Synthetic data is always labelled** (data banner).
6. **No automation over-claim.** No "autonomous", "auto-posted" or "posted to SAP" wording. Outputs are proposals.

### 11.7 Quality gates (each increment)
- `npm run typecheck`, `npm test` and `npm run build` pass.
- New rules, recommender logic and formatters have unit tests. Planted scenarios have the scenario test (FR-DAT-02).
- The storyboard steps covered so far are walked through in the browser at 1366 × 768 with no console errors.
- One commit per increment, with a message naming the increment.

### 11.8 Accessibility (S)
- Keyboard reachable controls, visible focus, and status not conveyed by colour alone (chips carry text).

---

## 12. Harvest map from LedgerAlpha

Copy, never import across repos, and never modify `/app/app-ledger-alpha`. Adapt money to INR (`amountUSD` → `amount`; `fmtMoney` → `fmtINRCompact`) and remove the currency store.

| Component / pattern | Source (`/app/app-ledger-alpha/src/…`) | Target | Increment | Adaptation |
|---|---|---|---|---|
| Design tokens, Tailwind config, shadcn/ui primitives, toast | `index.css`, `tailwind.config.js`, `components/ui/*`, `lib/toast.ts` | Global | I0 ✔ | None |
| KpiTile, PageHeader, StatusChip, SeverityBadge, ConfidenceChip, MethodBadge, RecordRef, Sparkline, ActivityRow | `components/vocab/*` | Global | I0 ✔ | Status map, severity type, confidence/method tooltips re-worded |
| App shell (sidebar, top bar, context strip) | `components/shell/*` | Global | I0 ✔ | Rebuilt: registry-driven nav, no entity/currency switchers, data banner |
| StatusHeatmap | `components/exec/StatusHeatmap.tsx` | SCR-01 group × bucket | I3 | Amount/count values instead of status |
| SignalCard, ExecStatCard, AttentionCard | `components/exec/*` | SCR-01 | I3 | INR |
| SubstantiationPanel | `components/exec/SubstantiationPanel.tsx` | SCR-03 balance breakdown | I4 | INR; clauses = buckets / actions |
| TraceToSource | `components/vocab/TraceToSource.tsx` | Item drawer | I4 | Route to item drawer, not lineage |
| LifecycleTimeline | `components/exec/LifecycleTimeline.tsx` | Item history | I4 | |
| MatchGraph | `components/exec/MatchGraph.tsx` | GR/IR counter-items | I4 (S) | INR |
| LifecyclePipeline | `components/exec/LifecyclePipeline.tsx` | SCR-04 pipeline | I5 | Item states |
| OpenActionTracker | `components/exec/OpenActionTracker.tsx` | Follow-ups | I5 | |
| CaseThread (drafted outreach) | `components/resolution/CaseThread.tsx` | Follow-up message | I5 (S) | Copy/export only, no send |
| Copilot drawer and parts | `components/shell/CopilotDrawer.tsx`, `components/copilot/*`, `lib/copilotStore.ts` | Ask LedgerAlpha | I7 | New retrieval over this dataset |
| ExplainButton | `components/exec/ExplainButton.tsx` | Global | I7 | |
| Control Plane action detail (pattern) | `pages/ControlActionDetail.tsx` | Audit trail detail | I7 | Pattern only |
| Live roll-up and decision stores (pattern) | `lib/stores.ts` (`useCloseStore`, `useDecisionStore`) | Review progress, decisions | I4–I5 | Pattern only |

Each harvested file gets a one-line provenance comment naming its source path.

---

## 13. Future state (not built): integration pattern

This section is for the pilot discussion, not for the prototype.
- **Read:**
  - Open items and master data from CFIN (ACDOCA, or FBL3N/FBL1N/FBL5N extracts).
  - PO / GR / project status from legacy SAP MM/PS.
  - History and trends from Snowflake (fed from CFIN by change data capture).
- **Write:**
  - Proposal-only first: a JV proposal file that ABB's team posts.
  - Later, after IS approval: posting through a governed interface in the system of record.
  - Which system is the record for clearing (CFIN or source) is the key architecture question [Deb §2.8].
- **Data route for a pilot:** extracts first; deployment inside ABB's environment later. IS clearance for finance data and any LLM use is tested at D3 [QP].

---

## 14. Decisions log

| ID | Decision | Date | Status |
|---|---|---|---|
| D-01 | New repo; harvest LedgerAlpha components; keep the LedgerAlpha name; never modify the original repo | 06-Oct-2026 | Agreed |
| D-02 | INR only, Indian formats; no currency switcher; no multi-entity | 06-Oct-2026 | Agreed |
| D-03 | Proposal-only outputs; no posting or automation over-claim | 06-Oct-2026 | Agreed |
| D-04 | Narratives are template-generated from facts; no live LLM in the workshop build | 06-Oct-2026 | Proposed: revisit if a backend and IS position allow |
| D-05 | Synthetic data on the FBL3N structure by default; masked ABB data via import when approved | 06-Oct-2026 | Agreed |
| D-06 | Calendar-year reporting periods (Q3 CY2026); Indian FY for TDS / 26AS | 06-Oct-2026 | Agreed |
| D-07 | Fictional people only | 06-Oct-2026 | Agreed |
| D-08 | Segment 2 deferred until S2 is answered; prepare both openings | 06-Oct-2026 | Agreed |
| D-09 | Build feature increments only after this FRD is reviewed; one increment per prompt | 06-Oct-2026 | Agreed |
| D-10 | The original LedgerAlpha (Continental Group) demo is not shown in the ABB workshop | 06-Oct-2026 | Proposed |

---

## 15. Open questions and the defaults used until answered

| Ref | Question (short) | Default in the build | Impact if different | Increment |
|---|---|---|---|---|
| S2 | Meaning of "account reconciliation" | Undecided; both openings prepared | Decides SCR-08 | I9 |
| S3 | Division scope; company codes, profit centres, projects | 1 company code, 4 profit centres, ~190 WBS | Data volumes and drill path | I1 |
| A1 | Review, reconciliation, or both | Review (ageing + action) | Adds substantiation against schedules | I4 |
| A2 | Cadence and effort | Quarterly + year-end | Period model and value story | I1 |
| A3 | Number of GLs and high-effort groups | ~60–70 GLs, groups per §6.2 | Rule scope and groups | I1 |
| A4 | Open-item vs balance-only accounts | High-risk groups open-item managed | Balance-only review UI (FR-ACC-03) | I3 |
| A5 | Ageing basis, buckets, threshold | Posting date; 0–90 / 91–180 / 181–365 / >365; 180 days | Config only | I2 |
| A6 / A-S6 | Actions, approvers, limits | Placeholder bands §9.3 | Config only | I5 |
| A7 | Reviewers' rules | R01–R10, R16 as [J2W] proposals | Replace or add rules | I2 |
| A8 | Outliers beyond ageing | R11–R15 | Replace or add rules | I2 |
| A9 | Roles; where commentary lives | GL owner + reviewer; Excel/email today | Sign-off flow | I6 |
| A10 / A-S5 | What auditors receive | Appendix D layout | Schedule layout | I6 |
| A11 | Legacy open items | ~15% from legacy SAP | Source-system handling | I1 |
| A12 | Non-FI data needed (PO, GR, project) | PO / project status as reference data | Rule evidence | I1 |
| A13 | Where time goes | Chasing owners and commentary | Emphasis on follow-ups and drafting | I5–I6 |
| B8 | 26AS reconciliation in scope? | TDS receivable reviewed via R07 only | Bridge to segment 2 | I2 / I9 |
| C1–C9 | Division reporting | Not built until answered | SCR-09 / SCR-10 | I8 |
| D1 | Data approval route | Synthetic | Masked import (I10) | I10 |

---

## 16. Build plan

One increment per prompt. Each ends with the quality gates in §11.7 and a commit. The calendar is indicative; the workshop date is TBC in the week of 12-Oct-2026.

| Inc. | Scope | Exit criteria | Gated by | Indicative |
|---|---|---|---|---|
| **I0** | Scaffold: shell, design system, INR/date formats with tests, draft types, config, screen registry with placeholders, CLAUDE.md, this FRD | Builds; all routes render; tests pass | — | Tue 06-Oct ✔ |
| **I1** | GL master, roster, synthetic open items + reference data (§6.7), stores; SCR-11 Data Sources | Control totals tie; scenario data present; FR-DAT-01/05/08–10 | A-S1/A-S2 (synthetic until then) | Wed 07-Oct |
| **I2** | Ageing; rules R01–R18; recommender with derived confidence; SCR-07 Rule Library; SCR-13 Settings (read) | Rule unit tests and scenario test pass; re-run < 500 ms | A5, A7, A8 (defaults until then) | Wed 07-Oct |
| **I3** | SCR-01 Review Overview, SCR-02 GL Accounts | FR-OVW-01–05, FR-ACC-01; storyboard steps 1–3 | — | Thu 08-Oct |
| **I4** | SCR-03 Account Scrutiny, item drawer, commentary draft | FR-SCR-01–05, FR-PLT-06; storyboard steps 4–6 | — | Thu 08-Oct |
| **I5** | SCR-04 Exception Queue, SCR-05 Actions and Approvals, follow-ups, JV proposal export | FR-EXC-01–03, FR-ACT-01–03, FR-FUP-01; storyboard steps 7–8 | A6 (placeholder DoA until then) | Fri 09-Oct |
| **I6** | Sign-off; SCR-06 Auditor Schedules with Excel export | FR-SCR-05, FR-AUD-01–02; storyboard steps 9–10 | A10 / A-S5 | Fri 09-Oct |
| **I7** | Ask LedgerAlpha, Explain, global search, SCR-12 Audit Trail | FR-AIX-01–03, FR-PLT-07/08, FR-TRL-01–02; storyboard steps 11–12 | — | Sat 10-Oct |
| **I8** | SCR-09 / SCR-10 division reporting | Per ABB's Keep / Change marks | C1–C9 | Sat 10 – Sun 11-Oct, if unblocked |
| **I9** | Segment 2 per S2 | Per §10.8 | S2 | Sat 10 – Sun 11-Oct, if unblocked |
| **I10** | Recalibrate to ABB's answers; import masked extract if approved; full dry run | Storyboard end to end at 1366 × 768, no console errors | D1 | Mon 12-Oct / day before workshop |

Excel export (I5/I6) adds one dependency (SheetJS `xlsx` or `exceljs`), chosen at I5.

---

## 17. Traceability matrix

| ABB ask / view | Screens | Requirements | Increment |
|---|---|---|---|
| GL-by-GL review of aged items (T1, T3) | SCR-01, SCR-02, SCR-03 | FR-OVW, FR-ACC, FR-SCR; R01 | I3–I4 |
| Clear / write off / write back (T2) | SCR-03, SCR-05 | FR-REC, FR-ACT; §8–§9 | I2, I4–I5 |
| Configurable rules for exceptions and outliers (T5) | SCR-07, SCR-13 | FR-RUL; R01–R18 | I2 |
| Auditor schedules (T3) | SCR-06 | FR-AUD | I6 |
| SAP data structures; CFIN + legacy (T6–T8) | SCR-11 | FR-DAT; §6 | I1 |
| Division / transaction level (T9) | All; SCR-09/10 | FR-OVW-05, item drawer FR-PLT-06; FR-RPT | I3–I4, I8 |
| Sensitive data (T10) | SCR-11 | FR-DAT-06/07, §11.5 | I1, I10 |
| AI-on-ERP concern (T11) | SCR-05, SCR-12 | D-03, FR-REC-04, FR-TRL | I5, I7 |
| V-A1 Review overview | SCR-01 | FR-OVW | I3 |
| V-A2 Account detail | SCR-03 | FR-SCR | I4 |
| V-A3 Exception queue | SCR-04 | FR-EXC | I5 |
| V-A4 Action and approval tracker | SCR-05 | FR-ACT | I5 |
| V-A5 Auditor schedule | SCR-06 | FR-AUD | I6 |
| V-B1–V-B5 | SCR-08 / Recon-Alpha | §10.8 | I9 |
| V-C1, V-C4 | SCR-09, SCR-10 | §10.9–10.10 | I8 |

---

## Appendix A: Glossary

| Term | Meaning |
|---|---|
| ACDOCA | SAP S/4HANA universal journal table; every posting line |
| AIS | Annual Information Statement (income-tax); with Form 26AS, shows TDS credits |
| BG | Bank guarantee. Advance-payment BG: given by a vendor against an advance |
| CARO 2020 | Companies (Auditor's Report) Order; auditor reporting matters, incl. overdue statutory dues |
| CFIN | SAP Central Finance: ABB's central S/4HANA finance instance |
| Contract asset / liability | Ind AS 115: unbilled revenue / customer advances and billing in excess |
| DLP | Defect liability period after commissioning; retention is usually released after it |
| DoA | Delegation of authority: who may approve what, up to which amount |
| ECL | Expected credit loss allowance (Ind AS 109), often a provision matrix by ageing bucket |
| FBL3N / FBL1N / FBL5N | SAP line-item reports for G/L, vendor and customer accounts |
| Form 26AS | Tax credit statement showing TDS deducted and deposited against the PAN |
| GR/IR | Goods receipt / invoice receipt clearing account |
| JV | Journal voucher (manual journal entry) |
| Schedule III (Division II) | Companies Act format of financial statements for Ind AS companies |
| TAN | Tax deduction account number of the deductor (the customer) |
| TDS | Tax deducted at source |

## Appendix B: Item drawer contents (FR-PLT-06)
1. Header: document no., GL, amount (Dr/Cr), age and bucket, status, source system.
2. Document fields (§6.3), with SAP field labels.
3. Related documents: PO line (status, GR / invoice dates), counter-items, BG, 26AS credit, project / WBS stage.
4. Rule hits: rule ID, name, plain-language reason, facts table, Deterministic badge.
5. Recommendation: action, confidence, factor table, rationale, Judgement badge.
6. Decision: proposer, justification, approval chain with status, tax review.
7. Follow-up: owner, due date, drafted message, response.
8. History timeline: every event on the item.

## Appendix C: JV proposal sheet layout (FR-ACT-03)

| Column | Example |
|---|---|
| Proposal ID | JVP-2026-Q3-0007 |
| Company code | IN01 |
| Proposed posting date | 30-Sep-2026 |
| Document type | SA |
| Header text | GR/IR write-back, PO 4500187321 |
| Line | 1 / 2 |
| GL account | 211300 (GR/IR) / 811500 (other income: liabilities written back), placeholders |
| Debit / Credit | Dr / Cr |
| Amount (INR) | 18,64,320.00 |
| Profit centre / WBS | PC-IN-1203 / P-2023-0418 |
| Assignment / Text | Item key and rationale summary |
| Source item key | IN01-2025-5000412873-2 |
| Action / Approval refs | Write back · Division Finance Head 09-Oct-2026 · Tax cleared 09-Oct-2026 |

Footer on every export: **"Proposal only — to be reviewed and posted by ABB in SAP. Generated by LedgerAlpha (prototype) on synthetic data."** The wording adapts for masked data.

## Appendix D: Auditor schedule layout (FR-AUD-01)
Adapted to ABB's schedule once shared (A-S5).
1. **Header:** company, GL and description, Schedule III line, period, as-at date, owner, reviewer.
2. **Balance roll-forward:** opening (30-Jun-2026), debits, credits, closing (30-Sep-2026), and the closing balance tied to the trial balance.
3. **Ageing:** amount and count per bucket; share over 180 days.
4. **Items above threshold:** document no., date, party, amount, age, rule hits, action / status, support reference, comment.
5. **Decisions in the period:** write-backs, write-offs, provisions and reclasses, with approvals.
6. **Commentary:** final, as signed.
7. **Sign-off:** preparer and reviewer, with dates.

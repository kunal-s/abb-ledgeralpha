# LedgerAlpha: Functional Requirements Document

**Product:** LedgerAlpha, an agentic record-to-report (R2R) platform with an India localisation pack
**Repository:** `/app/app-abb-ledgeralpha`
**Version:** 0.2 (draft for review) · 06-Oct-2026
**Prepared by:** J2W delivery team

**What changed from v0.1.** v0.1 described a single, customer-specific balance sheet review application. v0.2 describes the **product**:
- **The full R2R cycle** (close, reconcile and review, treasury commitments, tax, reporting, audit and controls), on one shared data foundation, with platform services underneath.
- **One configured workspace for the ABB India workshop.** Customer specifics live only in workspace configuration and the demo dataset (Part C). No screen, label or module is customer-specific.
- **Balance sheet review keeps its full v0.1 depth,** as one module among many (§6.6).

**Document map**
- **Part A, Product (§1–§5):** definition, users, information architecture, platform capabilities, data model.
- **Part B, Modules (§6):** one specification per module.
- **Part C, Localisation and workspace (§7–§9):** India pack, workspace configuration, and the demo workspace for ABB India.
- **Part D, Delivery (§10–§13):** non-functional requirements, harvest map, decisions, build plan.

**Conventions**
- **Priority:** M must work in the demo · S should · C could · W won't (this phase).
- **Depth tiers** (§3.4): **Deep** · **Working** · **Overview**.
- **Amounts:** company-code currency, signed the SAP way (debit +, credit −). In the India pack: ₹ with Indian grouping (₹2,40,00,000), compact as lakh / crore (₹43.5 lakh, ₹1.97 cr).
- **Dates:** DD-MMM-YYYY.

---

# Part A: Product

## 1. Product definition

### 1.1 What LedgerAlpha is
LedgerAlpha is one platform above the ERP for the whole record-to-report cycle. Agents prepare the work: they age, match, reconcile, flag, draft and propose. People decide: they review, approve and sign off. Every figure traces back to the document behind it.

It reads from the systems of record (SAP S/4HANA or Central Finance, legacy ERPs, the data lake, bank and tax-authority files). It does not replace them. Its outputs are decisions, evidence, schedules, reports and **proposed** journals.

### 1.2 Who it is for
- Controllership teams in mid-to-large Indian companies and in Indian subsidiaries of multinationals.
- Their landscapes: typically SAP (often a Central Finance instance alongside legacy ERPs), a group data lake, Excel-based schedules and reviews, and statutory audit plus listed-company reporting obligations.

### 1.3 Design principles

| # | Principle | What it means in the product |
|---|---|---|
| P1 | **One ledger, many lenses** | Every module reads the same line items, balances and reference data. A document (an invoice, a receipt, a GR/IR line, a BG) resolves identically everywhere and links across modules |
| P2 | **Agents prepare, people decide** | Agents propose. Nothing is approved or posted by an agent. Write-back mode is a policy: proposal file by default, governed posting only when the customer enables it (§4.4) |
| P3 | **Glass box** | Rule results are labelled Deterministic; recommendations and drafts are labelled Judgement. Confidence is always derived from shown factors. Every decision can be reconstructed (§4.5) |
| P4 | **Evidence first** | Every figure drills to its documents. Every decision carries its facts, rule version and approvals |
| P5 | **Configure, don't customise** | Customers differ in workspace configuration, localisation pack, policies and rules (§7–§8), never in screens or code |
| P6 | **Production-grade interface** | Page headers carry a title, breadcrumbs, status and actions, and nothing else. No explanatory narrative on pages. Visualization-first. Every action changes state. No hard-coded figures (§3.3) |

### 1.4 R2R coverage

| R2R process area | Module(s) | Depth in this phase |
|---|---|---|
| Period close orchestration | Close Cockpit, My Work, Home | Working |
| Journal entries, accruals and provisions | Journals | Working (proposals, JE review) / Overview (accruals) |
| Intercompany and related parties | Intercompany | Overview |
| Balance sheet review / GL scrutiny | Balance Sheet Review | **Deep** |
| Account reconciliations (bank, sub-ledger, schedule, customer and vendor statements) | Reconciliations | **Deep** |
| Cash application and unapplied credits | Cash Application | Working |
| Bank guarantees | Bank Guarantees | Working |
| FX exposure and revaluation | FX Exposure | Overview |
| Indirect tax reconciliation | GST (India pack label) | Overview |
| Withholding tax reconciliation | TDS (India pack label) | Working |
| Statutory financial statements | Financial Statements | Overview |
| Management reporting and project margin | Management Reporting | Overview |
| Variance analysis | Variance Analysis | Working |
| Working capital | Working Capital | Working |
| Audit preparation (PBC, schedules, evidence) | Audit Readiness | Working |
| Internal financial controls | Controls | Overview |
| Agent governance | Agents | Working |
| Rules, policies, data, activity, workspace | Rules & Policies, Data Sources, Activity Log, Settings | Working |

### 1.5 Outside the product in this phase (W)
- Procure-to-pay invoice processing and order-to-cash billing. These are consumed as inputs; cash application is in scope.
- Budgeting and forecasting. Budgets are consumed as inputs to variance analysis.
- Multi-group consolidation. The product handles one or more legal entities of one group.
- Tax return filing.
- Payroll.
- Export/import realisation monitoring (EDPMS / IDPMS). Roadmap.
- Live ERP connectivity and posting. Connectors are represented; data loads come from extracts (§4.1, §6.21).

---

## 2. Users and roles

The role switcher stands in for authentication in the prototype. People in demo data are fictional.

| Role | Typical title | Primary modules | Key permissions |
|---|---|---|---|
| Financial Controller | Head of finance / controllership | Home, Balance Sheet Review, Reconciliations, Close Cockpit, Reporting | Approve within band, reviewer sign-off, edit rules and policies |
| GL Accountant | Account owner | Balance Sheet Review, Reconciliations, Journals, My Work | Prepare reviews and recs, propose actions and journals, preparer sign-off |
| Receivables Specialist | AR / cash management | Cash Application, Reconciliations (customer), TDS, Working Capital | Confirm matches, propose clearing, customer statements |
| Treasury Analyst | Treasury / banking | Bank Guarantees, FX Exposure, Reconciliations (bank) | Maintain BG register, propose extensions and releases |
| Tax Specialist | Direct / indirect tax | GST, TDS, tax review of write-backs | Clear or object to write-backs and tax write-offs |
| Reporting Analyst | Business finance / reporting | Reporting modules | Read, export, draft commentary |
| Internal Controls Lead | IFC / internal audit | Controls, Activity Log, Audit Readiness | Read all, record test results |
| External Auditor | Statutory auditor | Audit Readiness | Read-only: schedules, evidence, decisions; raise PBC requests |

- **FR-PLT-01 (M):** Switching role takes effect immediately. Actions the role cannot take are disabled.
- **FR-PLT-02 (M):** Proposer and approver must be different people (four-eyes). Self-approval is blocked even when one presenter switches roles. Each role maps to a distinct fictional person.

---

## 3. Information architecture and UI standards

### 3.1 Navigation
The sidebar is grouped by job, in R2R order. Groups collapse.

| Group | Modules |
|---|---|
| (pinned top) | Home · My Work |
| Close | Close Cockpit · Journals · Intercompany |
| Reconcile & review | Balance Sheet Review · Reconciliations · Cash Application |
| Treasury | Bank Guarantees · FX Exposure |
| Tax | GST · TDS (labels from the localisation pack; generic names: Indirect Tax, Withholding Tax) |
| Reporting | Financial Statements · Management Reporting · Variance Analysis · Working Capital |
| Audit & controls | Audit Readiness · Controls |
| Automation & data | Agents · Rules & Policies · Data Sources · Activity Log |
| (pinned bottom) | Settings |

The registry is `src/lib/modules.ts`. Modules shown are those enabled in the workspace configuration (§8).

### 3.2 Global chrome
- **Top bar, in order:**
  - Scope: workspace / legal entity, then business-unit filter.
  - Search.
  - Ask LedgerAlpha.
  - Data-mode badge: "Demo data" or "Masked data"; hidden for live data.
  - Period selector: month, plus fiscal quarter label from the workspace calendar.
  - Role menu.
- **Item drawer:** opens from any document reference in any module (§4.5, Appendix B).
- **Ask LedgerAlpha drawer** (§4.6) and the **Explain** control on balances, flags and recommendations.

### 3.3 UI standards (apply to every page)
1. **Page header** = breadcrumbs (on detail pages) + title + status badge + actions. **No description or narrative text under the title**, and no explanatory paragraphs on pages. Help lives in tooltips and documentation.
2. **Page anatomy:** KPI row → lead visual (the signal) → supporting panel → detail table as drill-down. Never a table as the landing view.
3. **No customer-specific sections, labels or copy.** Customer context comes only from workspace configuration and data.
4. **Every number is computed** from the loaded data. No hard-coded KPIs.
5. **Every row opens something real.** Every action changes visible state. No toast as the only outcome.
6. **Status colour is used only for state:** ok / warn / danger / info / neutral. Chips always carry text.
7. **Deterministic vs Judgement** badges on agent output; confidence shows its derivation.
8. **Empty states:** a short label and, where relevant, the action that fills them. No marketing copy.
9. **Detail pages:** breadcrumb back to the module; URL deep links; filters persist in the URL.

### 3.4 Depth tiers
- **Deep:** the complete workflow with state changes, approvals, sign-off and exports. Every record drillable.
- **Working:** real computed views on the shared data, drill to documents, and the key actions that change state (assign, follow up, confirm, sign off). Approvals use the shared workflow (§4.4).
- **Overview:** one or two real computed views, read-only, drill to documents.

A module that is not built to at least Overview depth is **disabled in the workspace configuration**. It does not appear as a placeholder.

---

## 4. Platform capabilities

### 4.1 Data foundation
- One store of line items (universal-journal shape), period balances, sub-ledger open items and reference data, loaded per workspace (§5).
- Every record carries its source system.
- **FR-DAT-01 (M):** Loads report record counts and control totals (count, debits, credits, net per GL) and tie to the trial balance. Differences are shown, never hidden.
- **FR-DAT-02 (S):** Import CSV/XLSX extracts with field mapping (remembered per source). Rejected rows are listed with reasons.
- **FR-DAT-03 (M):** Before load, a masking check scans free text for tax-ID, PAN, GSTIN and bank-account patterns.

### 4.2 Rules engine
- **Rules are deterministic.** Each rule has an ID, module, scope, editable parameters with units, a severity, a candidate action, a basis (legal or accounting reference where one applies), an origin (Product or Workspace) and an enabled flag.
- **A hit** carries a plain-language reason built from the item's own facts, plus the facts evaluated.
- **FR-RUL-01 (M):** Changing a parameter or toggling a rule re-evaluates all items in under 500 ms for the demo dataset. Every count on every page updates without a reload, and the change is logged (§4.5).
- **FR-RUL-02 (M):** Every rule has unit tests for positive and negative cases.
- **FR-RUL-03 (S):** Reset rules to product defaults.
- **FR-RUL-04 (C):** Create a workspace rule from a template (age, amount, field condition).

### 4.3 Agents
Agents are named, governed workers. Each has a scope, inputs, outputs, method and permissions. In this prototype they are deterministic engines plus template drafting (decision D-04). They are labelled honestly on the Agents page.

| Agent | Works in | Does | Method |
|---|---|---|---|
| Scrutiny agent | Balance Sheet Review | Ages items, runs rules, recommends actions | Deterministic rules + judgement recommendation |
| Reconciler | Reconciliations | Prepares recs: GL vs source, classifies reconciling items | Deterministic + judgement classification |
| Matcher | Cash Application | Matches receipts to invoices with deduction inference | Deterministic levels + judgement on residuals |
| Tax matcher | TDS, GST | Matches deductions to Form 26AS; books to GSTR-2B | Deterministic |
| Close orchestrator | Close Cockpit | Tracks dependencies and critical path; flags slippage | Deterministic |
| Journal reviewer | Journals | Pre-posting checks and anomaly flags on journals | Deterministic |
| Narrator | Reporting, BSR, Recs | Drafts commentary and variance explanations from facts | Template (judgement-labelled) |
| Follow-up agent | All | Drafts chasers to owners, customers and vendors | Template (judgement-labelled) |

**FR-AGT-01 (M):** Agents can only propose. Every agent output that leads to an action passes through §4.4.

### 4.4 Workflow, approvals and policies
**Item lifecycle.** Shared by Balance Sheet Review, Reconciliations (reconciling items) and Cash Application (proposed matches):

```
within-policy
flagged ──► in-follow-up ──► decision-proposed ──► approved ──► exported ──► closed-in-erp
   │                              │      ▲             │
   └──────────────────────────────┘      └─ rejected ◄─┘
```

| Transition | Who | Condition |
|---|---|---|
| → flagged | Rules engine | At least one enabled rule hits |
| flagged → in-follow-up | Preparer | Follow-up requested: owner, due date, drafted message |
| → decision-proposed | Preparer | Action chosen; justification entered if at or above materiality |
| decision-proposed → approved | Approval chain per band | Approver ≠ proposer; tax review cleared where required |
| decision-proposed → rejected | Any approver | Reason required; returns to the preparer |
| approved → exported | Preparer / Controller | Included in a journal proposal export (Journals, §6.4) |
| exported → closed-in-erp | Next data load | No longer open in the source. Simulated in the demo by "mark posted", labelled as a simulation |

**Account sign-off lifecycle.** Shared by Balance Sheet Review and Reconciliations:
- `not-started → in-review → ready-for-signoff → preparer-signed → reviewer-signed`, plus `reopened`.
- Reviewer sign-off locks the account for the period. Reopening needs a logged reason.

**Policies.** Configurable in Rules & Policies; defaults in `src/config/policies.ts`:

| Policy | Default |
|---|---|
| Review ageing basis | Posting date |
| Review ageing buckets | 0–90, 91–180, 181–365, over 365 days |
| Review threshold | 180 days |
| Materiality for documented action | ₹1,00,000 |
| Approval bands (delegation of authority, DoA) | B1 ≤ ₹5 lakh: Controller · B2 ≤ ₹50 lakh: Controller → Escalation 1 · B3 above: Controller → Escalation 1 → Escalation 2 |
| Tax review | Required for write-backs and tax write-offs at any band |
| Write-back mode | Proposal file (governed posting disabled) |

- **FR-WF-01 (M):** Approvals route by band. Self-approval is blocked.
- **FR-WF-02 (M):** Follow-ups record owner, due date, drafted message, status and response. Messages are copied or exported, never sent from the prototype.
- **FR-WF-03 (S):** If data or rules change after a decision, the decision is kept and flagged "facts changed since decision".

### 4.5 Evidence and activity
- **FR-ACT-01 (M):** Every rule change, follow-up, proposal, approval, rejection, tax decision, sign-off, reopen, export, import and match confirmation is logged. Each event records actor (person or agent), role, time, module, object, before → after, and reason.
- **FR-ACT-02 (M):** Item drawer: document fields, related documents across modules, rule hits, recommendation with factors, decision and approvals, follow-up and history (Appendix B).
- **FR-ACT-03 (S):** Decision reconstruction shows the facts at the time, rule version and parameters, recommendation, approvals and resulting export.

### 4.6 Ask LedgerAlpha
- **FR-AIX-01 (S):** Grounded answers from loaded data only, using deterministic retrieval and templated answers for a defined set of intents. Examples: why is this flagged; what drives this balance; list items matching criteria; which accounts or recs are not signed off; what was decided and by whom; draft commentary.
- **FR-AIX-02 (S):** Answers cite records. Citations open the item drawer. A retrieval trace shows what was looked up.
- **FR-AIX-03 (M, if built):** Out-of-scope questions get an honest capability reply, never an invented figure.

### 4.7 Search, notifications, exports
- **FR-PLT-03 (S):** Global search across GL, document number, party, PO, WBS, BG number, reconciliation ID.
- **FR-PLT-04 (C):** Notifications for approvals waiting, follow-ups due and BG expiries.
- **FR-PLT-05 (M):** Excel export for tables, schedules and journal proposals. Every export carries a footer stating the data mode and that journals are proposals.

---

## 5. Data model

The draft contract is `src/types/index.ts`. Fields mirror SAP (ACDOCA / BSEG) so the screen reads like the customer's own data. Other ERPs map onto the same shape.

### 5.1 Organisation
- Legal entity (company code).
- Business unit, then profit centre (`PRCTR`), then project / WBS (`PS_POSID`).
- Project carries: customer, stage (Execution, Commissioned, In DLP, DLP ended, Closed, On hold), contract value, DLP end.

### 5.2 Chart of accounts (`GlAccount`)
- GL (`SAKNR`/`RACCT`), description, review **category**, statement line, nature, normal balance.
- Open-item managed (`XOPVW`), reconciliation account (`MITKZ`).
- Owner, reviewer, risk tier, review frequency.

**Account categories:**
- GR/IR clearing; vendor advances; customer advances (contract liabilities); unbilled revenue (contract assets).
- Retention receivable; withholding-tax receivable; indirect tax input/output; suspense and clearing.
- Accruals and provisions; deposits; statutory dues payable; employee advances.
- CWIP; fixed assets; inventory; bank.
- Trade receivables / payables (control); intercompany; equity; P&L.

### 5.3 Line item (`LineItem`): one universal-journal row

| Field | SAP | Notes |
|---|---|---|
| key | composite | `companyCode-fiscalYear-docNo-lineItem` |
| companyCode, gl, fiscalYear, docNo, lineItem | `RBUKRS`, `RACCT`, `GJAHR`, `BELNR`, `DOCLN` | |
| docType, postingKey | `BLART`, `BSCHL` | |
| postingDate, documentDate, dueDate | `BUDAT`, `BLDAT`, derived | Ageing basis is a policy |
| entryDate, entryTime, enteredBy | `CPUDT`, `CPUTM`, `USNAM` | Period-end and after-hours checks |
| amount; docCurrency, amountDoc | `HSL`; `RWCUR`, `WSL` | Signed |
| assignment, reference, text | `ZUONR`, `XBLNR`, `SGTXT` | |
| profitCentre, wbs, costCentre | `PRCTR`, `PS_POSID`, `RCNTR` | Drill path |
| partner | `LIFNR` / `KUNNR` / `RASSC` | Masked codes |
| po | `EBELN` / `EBELP` | |
| clearing | `AUGBL` / `AUGDT` | Absent while open |
| sourceSystem, manual | derived | |

### 5.4 Balances
- Per GL per month-end: opening, debits, credits, closing. Used for the trial balance, movements, statements and variance.

### 5.5 Reference and external data

| Dataset | Used by |
|---|---|
| Parties: vendors, customers, group companies; masked tax ID (PAN), indirect-tax ID (GSTIN), status, MSME class, government/PSU flag | All |
| PO status: open/closed, last GR, last invoice | BSR (GR/IR, advances), Working Capital |
| Bank statements | Reconciliations (bank), Cash Application |
| Bank guarantees (issued and received) | Bank Guarantees, BSR (advance cover) |
| Tax credit statement (Form 26AS / AIS) | TDS, BSR |
| Inward supply statement (GSTR-2B) and returns (GSTR-1 / 3B) | GST |
| Counterparty statements (customer / vendor) | Reconciliations |
| Intercompany confirmations | Intercompany |
| FX rates (closing, average) and forward contracts | FX Exposure |
| Budget by profit centre and month | Variance Analysis, Management Reporting |
| Close calendar and checklist | Close Cockpit |
| Controls register | Controls |
| PBC requests | Audit Readiness |

### 5.6 Derived fields
- Age and bucket (review ageing).
- Disclosure ageing band (statutory; §7.3).
- Counter-item links.
- Dormant-account flag.
- DSO / DPO / DIO components.
- Statement-line mapping.

---

# Part B: Modules

Each module states its purpose, what it shows, what users can do, the agents and rules involved, how it links to other modules, and its depth in this phase. **Purposes are for this document only. Pages show no narrative (§3.3).**

### Cross-module links (cohesion map)

| From | To | Link |
|---|---|---|
| Balance Sheet Review (suspense / clearing item) | Cash Application | An unapplied receipt sitting in clearing opens in the matching workbench |
| Cash Application (deduction inferred) | TDS | The withholding deduction becomes an expected credit to find in Form 26AS |
| TDS (credit missing) | Balance Sheet Review | Missing credits age in the withholding-tax receivable account (rule BSR-07) |
| Balance Sheet Review (vendor advance) | Bank Guarantees | Advance cover by a received advance-payment BG; expiry urgency |
| Balance Sheet Review / Reconciliations / Cash Application (approved actions) | Journals | Approved write-backs, provisions, reclasses and clearings become proposed journals |
| Balance Sheet Review / Reconciliations (sign-offs) | Audit Readiness, Controls | Generate auditor schedules; evidence for review controls |
| Close Cockpit (tasks) | Every module | Each task links to its record: account, rec, journal, return |
| Ledger / sub-ledgers | Working Capital, Variance Analysis, Financial Statements | Same balances, same documents |
| Projects | Management Reporting, BSR (unbilled, retention), Bank Guarantees | Project stage drives rules and BG alerts |

### 6.1 Home · `/` · Working
- **Purpose:** role-aware starting point for the period.
- **Shows:**
  - KPI row: close progress; accounts signed off; recs certified; exceptions open; approvals waiting.
  - Lead visual: status by business unit × close area (BSR, recs, journals, tax, reporting), as a heatmap.
  - "Needs attention": the highest value / risk items across modules, each opening its record.
  - Agent activity today.
- **Actions:** drill only. Operators see their queue preview instead of the controller view.
- **FR-HOM-01 (M):** every tile and cell drills to the filtered module view.

### 6.2 My Work · `/my-work` · Working
- **Purpose:** one queue per person across modules.
- **Shows:** tasks, items to decide, recs to prepare or review, matches to confirm, approvals, follow-ups due, PBC requests. Filters: module, due, type.
- **Actions:** open, complete, approve or reject (via §4.4), bulk assign / follow up.
- **FR-MYW-01 (M):** bulk actions change state immediately; rows leave the queue.

### 6.3 Close Cockpit · `/close` · Working
- **Purpose:** run the month-end and quarter-end close.
- **Shows:**
  - Close calendar by working day (WD−2 … WD+8), with phases and the critical path.
  - Checklist by phase, owner and status.
  - Progress by business unit.
  - Blockers, each linked to its record.
  - Quarter-end extras: limited-review preparation, BS review sign-off, auditor schedules.
- **Actions:** complete task (with evidence reference), reassign, flag blocker.
- **Agent:** Close orchestrator.
- **FR-CLS-01 (M):** task status derives from the linked record where one exists (e.g. a rec task completes when the rec is reviewer-signed).

### 6.4 Journals · `/journals` · Working (proposals, review) / Overview (register, accruals)
- **Purpose:** the journal register, journal review, and the single outbox for proposed journals.
- **Shows:**
  - **Proposed journals:** every approved action from BSR, Reconciliations and Cash Application, grouped into proposal batches.
  - **Journal review:** posted manual journals with anomaly flags. Flags: round amounts, period-end or after-hours entry, unusual account pairs, dormant accounts, preparer = approver.
  - **Accruals & provisions** (Overview): GR-not-invoiced accruals; warranty, LD and other provisions (Ind AS 37) with movement and reversal calendar.
- **Actions:** export the proposal batch (Excel / CSV, Appendix C); mark as posted (simulated, labelled).
- **Agent:** Journal reviewer.
- **FR-JNL-01 (M):** export includes source item keys and approval references; the footer states "Proposal — post in ERP after review".

### 6.5 Intercompany · `/intercompany` · Overview
- **Purpose:** group-company balances and related-party visibility.
- **Shows:**
  - Balances by counterparty vs counterparty confirmations, with differences classified (timing, FX, missing booking).
  - Related-party transaction summary (Ind AS 24) by nature: purchases, sales, royalty, services.
- **Links:** FX Exposure (foreign-currency intercompany payables), Financial Statements (related-party note).

### 6.6 Balance Sheet Review · `/balance-sheet-review` · **Deep**

**Purpose.** GL-by-GL scrutiny of balance sheet accounts outside the month-end close:
- age open items;
- surface aged items, exceptions and outliers by configurable rules;
- recommend an action for each flagged item (clear / write off / write back / provide / reclassify / follow up / retain);
- decide with approvals and tax review;
- sign off accounts;
- feed auditor schedules.

**Views** (tabs within the module):
1. **Overview.** KPI row:
   - value reviewed;
   - value over the review threshold;
   - items flagged;
   - decisions awaiting approval;
   - accounts signed off (x / y);
   - proposed write-backs / write-offs / provisions.

   Lead visual: account category × ageing bucket heatmap (amount / count). Also shows movement since the last review and the ten highest-value undecided items. Filters: category, owner, profit centre, source system.
2. **Accounts.** Register: GL, description, category, statement line, owner, reviewer, risk, balance, value over threshold, flags, review status. Lead visual: risk tier × review status.
3. **Account detail** (`/balance-sheet-review/:gl`).
   - Header: balance (Dr/Cr), statement line, owner, reviewer, movement, status.
   - Lead visual: balance broken down by ageing bucket and by suggested action, each segment expandable to its items.
   - Items table with rule chips, suggested action, confidence (with derivation) and status.
   - Commentary drafted from facts and editable by the owner.
   - Preparer / reviewer sign-off.
4. **Exceptions.** Lead visual: flagged → in follow-up → proposed → approved pipeline (click to filter), and hits by rule. Queue: plain-language reason, owner, comments, evidence references. Bulk actions.
5. **Decisions.** Proposed actions by type × approval band, approval and tax review in place, and the hand-off to Journals.

**Rules** (product defaults; workspace may edit, disable or add):

| ID | Rule | Categories | Logic (defaults) | Candidate action | Basis |
|---|---|---|---|---|---|
| BSR-01 | Aged beyond review threshold | Open-item accounts | Age > 180 days | Follow up (unless a specific rule hits) | Review policy |
| BSR-02 | Received, not invoiced | GR/IR | Credit; age > 365 days; no invoice on the PO line since GR; PO closed or inactive for 180 days | Write back (tax review) | Liability no longer expected; write-back is taxable income |
| BSR-03 | Counter-item available | GR/IR, suspense | Offsetting lines on the same PO line / assignment net within ₹100 or 0.5% | Clear | Mechanical clearing gap |
| BSR-04 | Invoiced, not received | GR/IR | Debit; age > 90 days | Follow up | GR or price variance pending |
| BSR-05 | Stale vendor advance | Vendor advances | Age > 365 days; no PO activity for 180 days. BG check: valid received advance-payment BG? | With BG: follow up / recover / invoke. Without BG: provide | Advance cover practice |
| BSR-06 | Stale customer advance | Customer advances | Credit; age > 365 days; project closed / DLP ended or no billing in 365 days | Write back after refund check (tax review) | Ind AS 115 contract liability |
| BSR-07 | Withholding credit missing | Withholding-tax receivable | No tax-credit-statement line for deductor × tax-year quarter within ₹10, after the return due date + 60 days. Older than 3 tax years | Follow up; older than 3 tax years: write off (tax review) | Credit follows the tax credit statement (§7.4) |
| BSR-08 | Stale unbilled revenue | Unbilled revenue | No billing on the WBS for > 180 days, or project on hold | Follow up; provide (ECL) if not billable | Ind AS 115 contract asset; Ind AS 109 ECL |
| BSR-09 | Retention overdue | Retention | DLP end + 90 days passed. Over 365 days past DLP | Follow up (release); over 365 days past DLP: provide (ECL) | Release after DLP / acceptance |
| BSR-10 | Suspense / clearing aged | Suspense and clearing | Age > 30 days | Clear / reclassify. Incoming-payment clearing goes to Cash Application | Suspense should be transient |
| BSR-11 | Wrong sign | All | Item or balance opposite to normal balance, > ₹10,000 | Reclassify | |
| BSR-12 | Round-number manual entry | All | Manual; ≥ ₹1,00,000 and an exact multiple of ₹1,00,000 | Review | Estimate / plug indicator |
| BSR-13 | Period-end / after-hours manual entry | All | Posted in the last 2 days of the quarter; entered after period end with a posting date inside it; or entered 10 PM–6 AM | Review | Cut-off / override risk |
| BSR-14 | Posting to a dormant account | All | No other postings in the prior 180 days | Review | |
| BSR-15 | Account-to-account churn | All | Same assignment moved across ≥ 3 GLs within 180 days | Review | Items moved, not resolved |
| BSR-16 | Statutory dues overdue | Statutory dues payable | Credit open > 180 days | Follow up | Reportable under CARO 2020 cl. 3(vii)(a) (§7.4) |
| BSR-17 | Indirect-tax credit at risk (off by default) | Trade payables / GST input | Vendor invoice unpaid > 180 days from invoice date | Follow up: input tax credit (ITC) reversal check | CGST Act s.16(2) second proviso (§7.4) |
| BSR-18 | MSME payable overdue (off by default) | Trade payables | Micro / small vendor unpaid beyond 45 days (agreed) or 15 days (none) | Follow up | MSMED Act s.15; income-tax disallowance (§7.4) |

**Recommendation logic** (Scrutiny agent):
1. Counter-item exists → **Clear**.
2. Wrong account → **Reclassify**.
3. Debit that cannot be recovered → **Provide**, then **Write off**.
4. Credit with no obligation behind it → **Write back** (tax review).
5. Owner must act or facts are insufficient → **Follow up**.
6. Valid with justification → **Retain**.

**Confidence:**
- Confidence is the weighted sum of the evidence factors that are met. The factors and weights are shown next to the score.
- Example, GR/IR write-back:
  - age > 365 days: 0.25
  - PO closed: 0.25
  - no invoice since GR: 0.20
  - vendor inactive or blocked: 0.10
  - no counter-item: 0.10
  - no open follow-up: 0.10
- Bands: ≥ 0.85 strong · 0.60–0.85 moderate · < 0.60 weak, which defaults to Follow up.

**Requirements:**
- **FR-BSR-01 (M):** All five views as above; every count reflects live rule results (FR-RUL-01).
- **FR-BSR-02 (M):** Item decisions follow §4.4. Items at or above materiality require a justification.
- **FR-BSR-03 (M):** Account sign-off follows §4.4. Ready-for-sign-off requires every flagged item at or above materiality to have a decision or a dated follow-up, and commentary to exist.
- **FR-BSR-04 (M):** Commentary is drafted from facts. Example: "₹2.31 cr over 180 days, of which ₹18.6 lakh is proposed for write-back and ₹1.24 cr is under recovery against BG". It is editable, with an "edited" marker.
- **FR-BSR-05 (S):** GR/IR counter-item view for a PO line, showing the GR and invoice legs.

### 6.7 Reconciliations · `/reconciliations` · **Deep**
- **Purpose:** prove balances.
  - Every in-scope balance sheet account is reconciled to its source at the frequency its risk requires.
  - Counterparty balances are reconciled to the counterparty's statement.
- **Reconciliation types:**

| Type | Compares | Typical reconciling items |
|---|---|---|
| Bank | GL bank account vs bank statement | Deposits in transit, unpresented payments, bank charges, unidentified receipts |
| Sub-ledger | AR / AP control GL vs sub-ledger total | Postings direct to control, timing |
| Schedule-supported | GL vs supporting schedule (prepaid, provisions, deposits, accruals) | Schedule updates pending |
| Tax account | Withholding / indirect tax GL vs return or credit statement | Timing, mismatches (links to TDS / GST) |
| Intercompany | GL vs counterparty confirmation | Timing, FX, missing booking (links to Intercompany) |
| Customer statement | Company's customer balance vs customer's statement / confirmation | Timing (invoice not yet booked by customer), classification (retention held separately), company-side error (TDS not recognised), customer-side error, dispute (e.g. LD) |
| Vendor statement | Company's vendor balance vs vendor's statement | Timing, missing invoices, payments in transit, disputes |

- **Shows:**
  - Overview: recs by type × status, with value of unexplained differences and ageing of reconciling items.
  - Register with risk, frequency, preparer, reviewer, due date and status.
  - Rec detail (`/reconciliations/:id`): balance per books vs balance per source; reconciling items by class; unexplained difference; the statement view for bank (balance per bank → reconciling items → balance per books); preparer / reviewer sign-off.
  - Customer statement generation and confirmation tracking.
- **Actions:**
  - Prepare (agent-prepared draft).
  - Classify or edit reconciling items.
  - Propose adjustments (§4.4 → Journals).
  - Route differences to an owner (customer-side differences to the commercial owner, company-side errors to the accountant, disputes to the project manager).
  - Sign off.
  - Generate a customer statement (opening, invoices, receipts, deductions, retention, notes, closing, open items) and record the customer's confirmation or counter-statement.
- **Agent:** Reconciler. Low-risk recs with zero unexplained difference may be auto-prepared, but still need reviewer sign-off (policy).
- **FR-REC-01 (M):** bank, sub-ledger, schedule-supported and customer-statement types are fully worked in the demo data. Other types are present with real data.
- **FR-REC-02 (M):** unexplained difference = books − source − Σ classified reconciling items, always shown. A rec with an unexplained difference above tolerance cannot be signed off.

### 6.8 Cash Application · `/cash-application` · Working
- **Purpose:** apply customer receipts to open invoices when remittance detail is missing and receipts are net of deductions, and keep unapplied credits under control.
- **Shows:**
  - Overview: receipts matched automatically / proposed / unmatched; unapplied credits ageing by customer and business unit.
  - Receipt detail (`/cash-application/:id`): suggested invoice combination with the residual explained, e.g. "TDS 2% on taxable value ₹2,000 + bank charges ₹150"; confidence with factors; alternatives.
- **Matching levels** (Matcher agent):
  - **L1:** reference match (invoice / PO / project in narration).
  - **L2:** customer + amount.
  - **L3:** deduction inference, testing residuals against:
    - withholding at the applicable rates on the **taxable value (excluding GST)**;
    - GST TDS 2% for government / PSU customers;
    - retention per contract;
    - LD;
    - bank charges;
    - FX difference.
  - **L4:** combinations (subset-sum) across invoices, POs and business units of one customer group (linked by tax ID).
- **Actions:** confirm or reject a match (confirmation → clearing proposal → Journals); park as unapplied with a reason; request remittance from the customer (follow-up).
- **Links:**
  - Inferred withholding goes to TDS as an expected credit.
  - Unapplied receipts reflect in BSR (suspense / clearing) and Reconciliations (customer statement).
- **FR-CAP-01 (M):** every proposed match shows the arithmetic of the residual, line by line.

### 6.9 Bank Guarantees · `/bank-guarantees` · Working
- **Purpose:** register and lifecycle of guarantees issued to customers and received from vendors, with limits and commission.
- **Shows:**
  - Overview: BGs by type × status. Expiry watchlist: amber at 60 days; red at 45 days when acceptance is still pending. In-claim-period and original-awaited lists. Bank limit utilisation and commission run-rate.
  - BG detail (`/bank-guarantees/:id`): lifecycle (requested → issued → amended / extended → expired → in claim period → released / invoked); linked project / PO; watchers.
- **Actions:** request extension or release (proposal + follow-up); add watchers; record original returned.
- **Links:** BSR vendor advances (cover check, BSR-05); projects (acceptance status).
- **FR-BGR-01 (M):** BG validity and claim-expiry dates are stored separately. A BG counts against the bank limit until it is released.

### 6.10 FX Exposure · `/fx-exposure` · Overview
- **Purpose:** foreign-currency exposure, revaluation and hedge coverage.
- **Shows:**
  - Open foreign-currency receivables and payables by currency × settlement bucket (30 / 60 / 90 days).
  - Forward cover vs exposure.
  - Unrealised revaluation at the closing rate (Ind AS 21) and realised gains/losses, by project, split AR vs AP.

### 6.11 Indirect Tax (India: GST) · `/tax/indirect` · Overview
- **Purpose:** reconcile indirect-tax books to returns and statements.
- **Shows:**
  - Input credit: books vs inward supply statement (GSTR-2B): matched / mismatched / missing in statement / missing in books.
  - Credit at risk on invoices unpaid beyond 180 days.
  - Output tax: books vs GSTR-1 / GSTR-3B.
  - GST TDS credits from government customers.

### 6.12 Withholding Tax (India: TDS) · `/tax/withholding` · Working
- **Purpose:** make sure tax deducted by customers is credited, and tax deducted on payments is deposited and filed.
- **Shows:**
  - **Receivable:** deductions (from Cash Application and the receivable account) vs the tax credit statement (Form 26AS / AIS), by deductor × tax-year quarter: matched / short / missing / wrong tax ID / wrong quarter. Credits at risk by age.
  - **Payable:** deducted vs deposited vs return filed, by month and nature of payment (Overview).
- **Actions:** follow-up to the customer (drafted message requesting a return revision); propose write-off of time-barred credits (tax review).
- **FR-TDS-01 (M):** tax-year quarters use the statutory tax year (§7.1), independent of the company's fiscal year.

### 6.13 Financial Statements · `/reporting/financial-statements` · Overview
- **Purpose:** statutory statements from the same ledger.
- **Shows:**
  - Trial balance → statement-line mapping.
  - Balance sheet and statement of profit and loss for the period with comparatives, in the statutory format (India pack: Schedule III, Division II).
  - Notes generated from the ledger, including the statutory **ageing schedules** for trade receivables, trade payables and CWIP (§7.3).
- **FR-FST-01 (M):** every statement line drills to its accounts and then to documents.

### 6.14 Management Reporting · `/reporting/management` · Overview
- **Purpose:** results by business unit, profit centre and project.
- **Shows:**
  - P&L by business unit / profit centre vs prior period and budget.
  - Project margin: contract value, cost to date, estimate at completion, percentage of completion revenue (Ind AS 115 input method), margin trend.

### 6.15 Variance Analysis · `/reporting/variance` · Working
- **Purpose:** explain what moved this month.
- **Shows:**
  - A variance bridge for result or margin (vs last month or budget), decomposed into volume, price, material cost (purchase price variance), FX and one-offs.
  - The ten transactions that drove most of the variance, each linked to its document.
  - Drafted commentary (Narrator, template).
- **FR-VAR-01 (M):** bridge components sum exactly to the total variance. Any residual is shown as "other", never hidden.

### 6.16 Working Capital · `/reporting/working-capital` · Working
- **Purpose:** cash tied up in the business, at business-unit and transaction level.
- **Shows:**
  - DSO including unbilled revenue and retention.
  - DPO and DIO.
  - Customer advances netted (funded position).
  - Trend by month.
  - Receivables and payables ageing.
  - MSME payables beyond the statutory payment window.
  - Drill: business unit → profit centre → project → customer / vendor → document.
- **FR-WCP-01 (M):** each metric shows its definition in a tooltip, not as page text, and drills to its components.

### 6.17 Audit Readiness · `/audit-readiness` · Working
- **Purpose:** prepare for statutory audit and quarterly limited review.
- **Shows:**
  - PBC request tracker: request, owner, due date, status, evidence.
  - **Schedules:** per-account auditor schedules generated from BSR and Reconciliations (Appendix D), with readiness by account.
  - Evidence room: decisions, sign-offs, recs, support references.
- **Actions:** generate and export schedules (Excel workbook: summary + one sheet per account); assign and close PBC requests; External Auditor role sees everything read-only.
- **FR-AUD-01 (M):** schedule figures tie exactly to BSR and Reconciliations for the same period.

### 6.18 Controls · `/controls` · Overview
- **Purpose:** internal financial controls over R2R.
- **Shows:**
  - Control register mapped to R2R processes.
  - Evidence collected automatically from activity, e.g. "BS review reviewer sign-off before quarter close + 15 days" or "bank recs reviewed by WD+5".
  - Test status and deficiencies.
  - Segregation-of-duties conflicts, including blocked self-approvals.

### 6.19 Agents · `/agents` · Working
- **Purpose:** govern the agents.
- **Shows:**
  - Roster (§4.3) with scope, method, permissions (propose only) and runs.
  - Items touched and recommendations made.
  - **Acceptance and override rates computed from actual decisions.**
  - Run log per agent.
- **FR-AGT-02 (M):** no agent statistic is hard-coded.

### 6.20 Rules & Policies · `/rules` · Working
- **Shows:** rule library across modules (parameters, enabled, hits, value at stake) and policies (§4.4).
- **Actions:** edit and re-run (FR-RUL-01), reset, change log.
- **FR-RUL-05 (M):** rules shipped as product defaults are distinguishable from workspace-configured rules.

### 6.21 Data Sources · `/data` · Working
- **Shows:**
  - Sources as connectors: ERP instances, data lake, bank statements, tax credit statement, inward supply statement, BG register, budget. Each shows status, last load, records and control totals.
  - Field mapping to §5.3.
  - Data-quality checks.
  - Import (FR-DAT-02 / 03).

### 6.22 Activity Log · `/activity` · Working
- **Shows:** activity over the period by event type and module; filterable log; event detail with decision reconstruction (FR-ACT-03).
- **Actions:** export to Excel.

### 6.23 Settings · `/settings` · Working
- **Shows:** workspace (entities, business units, fiscal calendar, current period); localisation pack; users and roles; module enablement; data mode.
- **Actions:** reset demo state.

---

# Part C: Localisation and workspace

## 7. India localisation pack (`src/config/localisation.ts`)

### 7.1 Formats and calendars
- **Money:** INR with Indian digit grouping (`₹2,40,00,000`); compact as lakh / crore; never K / M / B. Dr/Cr suffixes where sign matters.
- **Dates:** `30-Sep-2026`; times 12-hour.
- **Two calendars:**
  - The company's fiscal year is workspace configuration: April–March reads "FY2026-27"; January–December reads "CY2026".
  - The **statutory tax year is April–March** and is used for withholding-tax quarters ("Q2 FY2026-27"), whatever the company's fiscal year.

### 7.2 Taxes
- **Indirect tax (GST):**
  - CGST / SGST / IGST.
  - Input tax credit (ITC) matched to GSTR-2B.
  - Output tax to GSTR-1 and GSTR-3B.
  - GST TDS (2%) deducted by government / PSU customers.
  - ITC at risk on supplier invoices unpaid beyond 180 days.
- **Withholding tax (TDS):**
  - Deducted by customers on the **taxable value excluding GST**, at rates that vary by nature of payment.
  - Credit is claimed as reflected in Form 26AS / AIS.
  - Deducted on vendor payments, then deposited and filed quarterly.

### 7.3 Statutory reporting
- **Framework:** Ind AS; statements in Schedule III, Division II format.
- **Statutory ageing schedules** (distinct from review ageing):
  - Trade receivables: less than 6 months · 6 months–1 year · 1–2 years · 2–3 years · more than 3 years.
  - Trade payables and CWIP: less than 1 year · 1–2 years · 2–3 years · more than 3 years.
- **Listed companies:** quarterly results with a limited review by the statutory auditor (SEBI LODR Reg. 33).
- **Statutory audit:** includes internal financial controls (Companies Act s.143(3)(i)) and the CARO 2020 report.

### 7.4 References to verify before they appear on screen
- **Income-tax Act, 2025** (effective 01-Apr-2026) renumbers the TDS provisions, the MSME payment disallowance (formerly s.43B(h)) and the transfer-pricing report (formerly Form 3CEB). On screen, show the **nature of payment** and plain descriptions, and show section numbers only after the mapping is verified.
- CGST Act s.16(2) second proviso (180-day payment condition) and s.51 (GST TDS).
- CARO 2020 clause 3(vii)(a); MSMED Act s.15.
- Verify wording before quoting.

## 8. Workspace configuration (`src/config/tenant.ts`, `src/config/policies.ts`)
A workspace defines:
- name, legal entities (company code, currency), business units;
- fiscal calendar (start month, label prefix), current period end, last review date;
- source systems;
- data mode (demo / masked / live);
- enabled modules;
- policy overrides (ageing, materiality, DoA, tolerances, write-back mode).

**Customer specifics live here and in the dataset only.** Code, pages and labels never name a customer.

## 9. Demo workspace: ABB India

### 9.1 Configuration
- **Workspace:** ABB India Limited, company code IN01 (placeholder).
- **Business units:** Electrification, Motion, Process Automation, Robotics & Discrete Automation.
- **Fiscal year:** January–December (label "CY").
- **Period:** September 2026 (Q3 CY2026); last review 30-Jun-2026.
- **Source systems:** SAP Central Finance (FI), legacy SAP (CO / MM / PS and pre-migration items), Snowflake.
- **Data mode:** demo (synthetic data on the SAP line-item layout).

### 9.2 Synthetic dataset (one coherent world)
- **Ledger:**
  - Monthly balances January–September 2026 for about 250 GLs, with a trial balance that ties.
  - About 25,000 line items. About 8,000 open items in the balance sheet review categories, with posting dates from 2022.
  - About 15% of items from legacy SAP.
- **Organisation:** 4 business units, about 12 profit centres, about 190 projects / WBS.
- **Parties:** about 240 vendors (MSME-flagged subset), about 110 customers (government / PSU-flagged subset, linked by tax ID across business units), and group companies.
- **Sub-ledgers and external data:**
  - AR / AP open items.
  - About 1,200 bank receipts across 4 bank accounts.
  - About 60 BGs.
  - Form 26AS lines.
  - GSTR-2B lines.
  - Intercompany confirmations.
  - FX open items and forwards.
  - Budget by profit centre.
  - Close checklist (about 120 tasks).
  - Controls register (about 40 controls).
  - PBC list (about 30 requests).
  - Fictional people.
- **Determinism:** a seeded generator, so every rehearsal sees the same data. Amounts are not round, except where roundness is the point.

### 9.3 Story threads (what makes the product cohesive in the demo)

| Thread | Path through the product |
|---|---|
| T1 · The unapplied RTGS | BSR flags ₹23,60,000 in incoming-payment clearing for 211 days. Cash Application matches it to two invoices with TDS 2% on taxable value and bank charges explained. TDS shows the expected credit and finds it missing in 26AS. The customer statement rec moves from "difference" to "explained". Working Capital DSO improves |
| T2 · The stale vendor advance | BSR flags a ₹1.24 cr advance (438 days, no PO activity, vendor blocked). Bank Guarantees shows the received advance-payment BG expiring 31-Dec-2026. Follow-up to recover. A second advance with no BG becomes a provision proposal; it is approved, appears in Journals proposals, and is exported. The schedule in Audit Readiness reflects it |
| T3 · Quarter close | Close Cockpit at WD+3. BS review sign-offs and recs drive task completion. Financial Statements shows the balance sheet with the Schedule III receivable ageing note from the same items. PBC requests are answered from Audit Readiness |
| T4 · What moved | Variance Analysis: Motion margin down versus August. The bridge shows material cost; the top transactions are copper-linked POs at ₹890 vs ₹780 per kg-equivalent (about ₹44 lakh on one project). Management Reporting shows the project's estimate at completion rising |
| T5 · Governance | Every step above appears in the Activity Log. Agents shows proposals vs overrides. Controls shows review-control evidence collected and a blocked self-approval |

### 9.4 Planted scenarios
These anchor the threads. All other records are evaluated by the same rules (no "hero only" depth).

| ID | Module | Situation (as at 30-Sep-2026) | Amount | Expected |
|---|---|---|---|---|
| S-01 | BSR | GR credit, PO closed, GR 412 days ago, never invoiced | ₹18,64,320 Cr | BSR-01, BSR-02 → write back, tax review, band B2 |
| S-02 | BSR | GR credit + invoice debit same PO line, uncleared (CFIN / legacy split) | ₹7,42,180 each | BSR-03 → clear |
| S-03 | BSR | Invoice debit, no GR, 128 days | ₹4,06,950 Dr | BSR-04 → follow up |
| S-04 | BSR / BG | Advance 438 days; no PO activity; vendor blocked; advance-payment BG to 31-Dec-2026 | ₹1.24 cr Dr | BSR-05 → follow up / recover (T2) |
| S-05 | BSR / Journals | Advance 512 days; PO closed; vendor inactive; no BG | ₹36,80,000 Dr | BSR-05 → provide (T2) |
| S-06 | BSR / TDS | Customer deduction FY2024-25 Q3 not in 26AS | ₹4,62,700 Dr | BSR-07 → follow up |
| S-07 | BSR / TDS | FY2022-23 Q4 deduction never in 26AS | ₹2,18,940 Dr | BSR-07 → write off, tax review |
| S-08 | BSR / Mgmt | Metro project on hold; no billing 274 days | ₹2.86 cr Dr | BSR-08 → follow up / provide |
| S-09 | BSR | PSU customer; DLP ended 240 days ago | ₹1.12 cr Dr | BSR-09 → follow up |
| S-10 | BSR | Project closed; advance unadjusted 540 days | ₹58,40,000 Cr | BSR-06 → write back, tax review |
| S-11 | BSR / Cash App | Incoming RTGS in clearing 211 days | ₹23,60,000 Cr | BSR-10 → Cash Application (T1) |
| S-12 | BSR / Journals | Manual JV exactly ₹25,00,000, posted 30-Sep, entered 11:42 PM | ₹25,00,000 Cr | BSR-12, BSR-13; Journal reviewer flag |
| S-13 | BSR | Credit line in a vendor advance GL | ₹3,46,000 Cr | BSR-11 → reclassify |
| S-14 | BSR | Posting to a suspense GL dormant for 14 months | ₹9,80,000 Dr | BSR-14 |
| S-15 | BSR | Same assignment moved across 3 GLs in 120 days | ₹14,20,000 | BSR-15 |
| S-16 | BSR | TDS payable line open 7 months | ₹1,84,300 Cr | BSR-16 |
| S-17 | Cash App | Invoice ₹1,00,00,000 + GST ₹18,00,000 = ₹1,18,00,000. Receipt ₹1,16,85,850 = less TDS 1% on taxable value (₹1,00,000) and bank charges (₹14,150); no remittance advice | ₹1,16,85,850 receipt | L3 match, residual explained line by line |
| S-18 | Recs | Customer balance ₹2,40,00,000 vs confirmation ₹1,96,50,000; gap ₹43,50,000 = timing ₹23,60,000 + retention ₹11,80,000 + TDS ₹2,00,000 + disputed LD ₹6,10,000 | ₹43,50,000 | Customer statement rec, all classified |
| S-19 | Recs | Bank account: unidentified receipt, unpresented cheque, bank charges | various | Bank reconciliation statement |
| S-20 | BG | Performance BG ₹3.5 cr expiring in 45 days, acceptance pending | ₹3.50 cr | Red watchlist |
| S-21 | FX | EUR 5,00,000 import payable booked at ₹96.00, closing ₹97.50; forward at ₹96.40 | ₹7,50,000 unrealised loss | FX exposure / coverage |
| S-22 | Variance / Mgmt | Copper-linked material PO price ₹780 → ₹890 per kg-eq on a fixed-price project | ≈ ₹44 lakh | Top variance driver (T4) |
| S-23 | GST | Supplier invoices in books missing in GSTR-2B | ₹6,84,200 ITC | Mismatch list |
| S-24 | Working Capital | MSME vendor invoices unpaid beyond 45 days | ₹38,90,000 | MSME overdue view |

### 9.5 Workshop mapping

| ABB priority / ask | Where it is shown | Time |
|---|---|---|
| #1 Balance sheet review: GL scrutiny, ageing over 180 days, clear / write off / write back, auditor schedules, configurable rules | Balance Sheet Review (deep) → Rules & Policies → Journals proposals → Audit Readiness schedules; threads T2, T5 | 60–70 min |
| #2 Account reconciliation, whatever S2 means | **All four interpretations exist in the product:** (a) receipt matching / unapplied → Cash Application; (b) customer statements → Reconciliations (customer statement); (c) GL account recs → Reconciliations (bank, sub-ledger, schedule); (d) vendor recs → Reconciliations (vendor statement). S2 sets emphasis, not build | 40–45 min |
| Working capital and division-level, transaction-level reporting | Working Capital, Variance Analysis, Management Reporting; business-unit scope in the top bar | 25 min |
| BG lifecycle and FX (raised 18-Sep, Phase 2) | Bank Guarantees, FX Exposure, shown as existing modules | 5–10 min |
| "Existing first" | The whole product, configured on the ABB workspace | — |

### 9.6 Discussion topics likely to come up, and where they are answered

| Topic | Shown in |
|---|---|
| Month-end close acceleration, close calendar, checklist | Close Cockpit, My Work |
| Quarterly limited review / results timetable | Close Cockpit (quarter tasks), Financial Statements, Audit Readiness |
| Statutory audit queries, PBC, auditor schedules | Audit Readiness |
| CARO 2020 reporting (statutory dues, CWIP) | BSR-16, Financial Statements notes |
| IFC / ICFR testing, SoD | Controls, Activity Log |
| ECL on receivables and contract assets (Ind AS 109) | BSR ageing, Working Capital ageing |
| Unbilled revenue, retention, POC revenue (Ind AS 115) | BSR-08 / 09, Management Reporting (project margin) |
| Provisions: warranty, LD, onerous contracts (Ind AS 37) | Journals (accruals & provisions) |
| GST ITC reconciliation and reversal | GST |
| TDS credit reconciliation with 26AS | TDS, Cash Application |
| MSME payment compliance | Working Capital, BSR-18 |
| Related parties and transfer pricing with group companies | Intercompany |
| FX revaluation and hedging | FX Exposure |
| BG limits and commission | Bank Guarantees |
| Copper / commodity cost inflation and margin | Variance Analysis, Management Reporting |
| SAP Central Finance + legacy SAP + Snowflake data | Data Sources |
| Is agentic AI safe on our ERP? Who approves? | Agents (propose only), §4.4 approvals, Activity Log, write-back mode policy |
| Where does data go? Masking? | Data Sources (masking check), data mode badge |

### 9.7 Open questions (client questionnaire) and the defaults used

| Ref | Question | Default in the demo workspace |
|---|---|---|
| S2 | Meaning of "account reconciliation" | All interpretations available; emphasis set after the answer |
| S3 | Division scope; company codes, profit centres, projects | 1 company code, 4 business units, ~12 profit centres, ~190 WBS |
| A1–A4 | Review vs reconciliation; cadence; GL count; open-item accounts | Both modules; quarterly + year-end; ~250 GLs; high-risk categories open-item managed |
| A5 | Ageing basis, buckets, threshold | Posting date; 0–90 / 91–180 / 181–365 / >365; 180 days |
| A6 / A-S6 | Actions, approvers, limits | Placeholder bands (§4.4) |
| A7 / A8 | Reviewer rules; outliers | BSR-01 to BSR-16 product defaults; ABB rules added as workspace rules |
| A10 / A-S5 | Auditor schedule layout | Appendix D |
| A11 / A12 | Legacy open items; non-FI data | ~15% legacy items; PO / project status as reference data |
| B1–B11 | Receipts, deductions, statements | Cash Application and Reconciliations defaults (§6.7–§6.8) |
| C1–C9 | Reporting measures, drill path, baselines | Working Capital / Variance defaults (§6.15–§6.16) |
| D1 | Data approval | Synthetic; masked import when approved |

---

# Part D: Delivery

## 10. Non-functional requirements

### 10.1 Platform
- **Stack:** React 18, TypeScript (strict), Vite 6, Tailwind 3, shadcn/ui (Radix), React Router 6, Zustand, Recharts, lucide-react. The same stack as LedgerAlpha, so harvested components drop in.
- **Tests:** Vitest.
- **Runtime:** no backend; `npm run dev` on port 5180, or a static build.
- **Browsers:** Chrome or Edge, current versions. Screen-share target **1366 × 768**; layouts hold to 1024 px. Light mode by default.

### 10.2 Performance (M)
- Demo dataset: first render < 2 s; rule re-run < 500 ms; navigation < 200 ms.
- Masked extract up to 50,000 items: re-run < 3 s; tables virtualised.

### 10.3 State
- In-memory stores over one dataset. All modules derive from the same source, so they always agree.
- **(S)** `localStorage` persistence for rehearsal continuity, plus Reset demo.

### 10.4 Security and data handling (M)
- No data leaves the browser. Only static assets (the web font) are fetched.
- Masked customer data stays in `data/private/` (git-ignored), is never committed or uploaded, and is deleted after the engagement unless agreed otherwise.
- People in data are fictional. Party names are masked codes or fictional.

### 10.5 Demo integrity (M)
- UI standards §3.3.
- **No fidelity cliff:** every listed record opens to a complete, consistent detail.
- **No automation over-claim:** no "autonomous", "auto-posted", or "posted to SAP" wording.

### 10.6 Quality gates (each increment)
- `npm run typecheck`, `npm test` and `npm run build` pass.
- Rules, matchers and calculators have unit tests. Planted scenarios have a scenario test asserting their expected outcomes.
- Walk-through at 1366 × 768 with no console errors.
- One commit per increment.

### 10.7 Accessibility (S)
- Keyboard-reachable controls, visible focus, and state never conveyed by colour alone.

## 11. Harvest map

**Sources:**
- LedgerAlpha (`/app/app-ledger-alpha`) for the design system, components and page patterns.
- Recon-Alpha (`/app/app-recon-alpha`) as the candidate for matching-engine logic, assessed at I5.

**Rules:** copy, never import across repos, and never modify either repo. Add a provenance comment to each harvested file. Money: `amountUSD` → `amount`, `fmtMoney` → `fmtINRCompact`, drop `useCurrencyStore`.

| Asset (source path) | Target | Increment |
|---|---|---|
| Design tokens, Tailwind config, shadcn/ui primitives, toast | Global | I0 ✔ |
| Vocab: KpiTile, StatusChip, SeverityBadge, ConfidenceChip, MethodBadge, RecordRef, Sparkline, ActivityRow, PageHeader (reduced) | Global | I0 ✔ |
| `components/exec/StatusHeatmap`, `SignalCard`, `ExecStatCard`, `AttentionCard` | Home, BSR overview | I3, I7 |
| `components/exec/SubstantiationPanel` | BSR account detail, Rec detail | I3, I4 |
| `components/exec/MatchGraph` | Cash Application, GR/IR counter-items | I3, I5 |
| `components/exec/LifecyclePipeline`, `LifecycleTimeline`, `OpenActionTracker` | BSR exceptions, item history, follow-ups / My Work | I3, I7 |
| `pages/ReconciliationDetail` (pattern) | Rec detail | I4 |
| `components/resolution/CaseThread` | Follow-ups, customer statement confirmation | I4 |
| `pages/JournalDetail` pre-audit checklist (pattern), `ReversalCalendar` | Journals review, accruals | I6 |
| `pages/Cockpit` (Gantt / critical path pattern), `pages/CloseStatus*` | Close Cockpit, Home | I7 |
| `pages/AgentFleet`, `AgentDetail` (pattern) | Agents | I10 |
| `pages/Integrations`, `UnifiedDataLayer` (pattern) | Data Sources | I1 |
| `pages/Audit` (PBC pattern) | Audit Readiness | I6 |
| `pages/ControlActionDetail` (pattern) | Activity Log reconstruction | I2 |
| `components/copilot/*`, `CopilotDrawer`, `ExplainButton` | Ask LedgerAlpha | I10 |
| Recon-Alpha `src/engine/*` (intake, diagnose, confidence) | Cash Application matcher | I5 (assess) |

## 12. Decisions log

| ID | Decision | Status |
|---|---|---|
| D-01 | New repo; harvest LedgerAlpha components; keep the LedgerAlpha name; never modify source repos | Agreed |
| D-02 | Localisation via packs; India pack first (INR, Indian formats, GST / TDS, Schedule III); no currency switcher | Agreed |
| D-03 | Agents propose; proposal-file write-back by default; no automation over-claim | Agreed |
| D-04 | Drafting is template-based from facts; no live LLM in the workshop build | Proposed: revisit if a backend and IS position allow |
| D-05 | Synthetic data on the source layout by default; masked import when approved | Agreed |
| D-06 | Fiscal calendar per workspace; statutory tax year separate | Agreed |
| D-07 | Fictional people only | Agreed |
| D-08 | Account reconciliation ambiguity (S2) resolved by product breadth: Reconciliations + Cash Application cover all interpretations | Agreed (v0.2) |
| D-09 | Build one increment per prompt after review of this FRD | Agreed |
| D-10 | The original LedgerAlpha (Continental Group) demo is not shown in the workshop | Proposed |
| D-11 | **Product-first:** no customer-specific modules, sections, labels or copy; customers exist only as workspace configuration and data | Agreed (v0.2) |
| D-12 | **No narrative under page titles;** production page-header pattern (§3.3) | Agreed (v0.2) |
| D-13 | Depth tiers; modules not built to at least Overview are disabled in the workspace, never shown as placeholders in the demo | Agreed (v0.2) |
| D-14 | Module names are generic; country-specific labels come from the localisation pack (GST, TDS) | Agreed (v0.2) |

## 13. Build plan

One increment per prompt, each ending with §10.6.

| Inc. | Scope | Depth delivered |
|---|---|---|
| **I0** | Product scaffold: module registry and navigation, workspace / localisation / policy config, shell (scope, period, role, data mode), page anatomy, formats with tests, draft data contract, this FRD | ✔ |
| **I1** | Data foundation: seeded world generator (§9.2), stores, Data Sources, Settings (read) | Working |
| **I2** | Platform core: rules engine, recommendation framework, workflow and approvals, follow-ups, activity log; Rules & Policies, Activity Log | Working |
| **I3** | Balance Sheet Review: all views, rules BSR-01 to BSR-18, decisions, sign-off | **Deep** |
| **I4** | Reconciliations: all types; bank statement view; customer statement + confirmation | **Deep** |
| **I5** | Cash Application (matcher with deduction inference) and TDS | Working |
| **I6** | Journals (proposals outbox, review, accruals) and Audit Readiness (schedules, PBC, evidence) | Working |
| **I7** | Home, My Work, Close Cockpit | Working |
| **I8** | Working Capital, Variance Analysis; Management Reporting and Financial Statements | Working / Overview |
| **I9** | Bank Guarantees (working); FX Exposure, GST, Intercompany, Controls (overview) | Working / Overview |
| **I10** | Agents, Ask LedgerAlpha, Explain, global search | Working |
| **I11** | Workspace calibration to the client's answers; masked data import if approved; full dry run | — |

**Workshop-critical path:** I1–I5 and I7; then I6 and I8. Anything not finished before the workshop is disabled in the workspace configuration (D-13), never shown as a placeholder.

---

## Appendix A: Glossary

| Term | Meaning |
|---|---|
| ACDOCA | SAP S/4HANA universal journal table |
| BG | Bank guarantee: issued to customers (performance, advance payment, retention, bid / EMD, warranty) or received from vendors |
| CARO 2020 | Companies (Auditor's Report) Order, 2020 |
| Central Finance (CFIN) | SAP S/4HANA instance receiving postings replicated from source ERPs |
| Contract asset / liability | Ind AS 115: unbilled revenue / customer advances and billing in excess |
| CWIP | Capital work in progress |
| DLP | Defect liability period |
| DoA | Delegation of authority |
| ECL | Expected credit loss (Ind AS 109) |
| Form 26AS / AIS | Tax credit statement / Annual Information Statement |
| GR/IR | Goods receipt / invoice receipt clearing account |
| GSTR-1 / 2B / 3B | GST outward supplies return / auto-drafted inward supply statement / summary return |
| IFC | Internal financial controls (Companies Act) |
| LD | Liquidated damages |
| PBC | Prepared by client: auditor's request list |
| Schedule III | Companies Act format of financial statements (Division II for Ind AS) |
| TAN | Tax deduction account number of the deductor |
| TDS | Tax deducted at source |

## Appendix B: Item drawer
1. Header: document no., GL, amount (Dr/Cr), age and bucket, status, source system.
2. Document fields with SAP labels.
3. Related records across modules: PO line, counter-items, receipt / match, BG, tax credit line, project, rec.
4. Rule hits: ID, reason, facts, Deterministic badge.
5. Recommendation: action, confidence, factor table, rationale, Judgement badge.
6. Decision: proposer, justification, approval chain, tax review.
7. Follow-up: owner, due date, drafted message, response.
8. History: every event on the item.

## Appendix C: Journal proposal export

| Column | Example |
|---|---|
| Proposal ID | JVP-2026-09-0007 |
| Company code | IN01 |
| Proposed posting date | 30-Sep-2026 |
| Document type | SA |
| Header text | GR/IR write-back, PO 4500187321 |
| Line | 1 / 2 |
| GL account | 211300 / 811500 (illustrative) |
| Debit / Credit | Dr / Cr |
| Amount | 18,64,320.00 |
| Profit centre / WBS | PC-MO-12 / P-2023-0418 |
| Assignment / Text | Item key; rationale summary |
| Source module and item key | Balance Sheet Review · IN01-2025-5000412873-2 |
| Approval references | Controller 09-Oct-2026 · Tax cleared 09-Oct-2026 |

Footer: "Proposal — to be reviewed and posted in the ERP. Generated by LedgerAlpha on {data mode} data."

## Appendix D: Auditor schedule (per account)
1. **Header:** entity, GL and description, statement line, period, owner, reviewer.
2. **Roll-forward:** opening, debits, credits, closing; tie to the trial balance.
3. **Ageing:** review buckets, plus the statutory band where applicable.
4. **Items above threshold:** document, date, party, amount, age, rule hits, action / status, support reference, comment.
5. **Decisions in the period,** with approvals.
6. **Reconciliation summary,** where the account is reconciled.
7. **Commentary** and **sign-off** (preparer, reviewer, dates).

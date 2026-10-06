# LedgerAlpha · ABB India GL Scrutiny (prototype)

Demo prototype of LedgerAlpha's balance sheet review for ABB India: GL-by-GL scrutiny of aged items,
configurable rules for exceptions and outliers, clear / write off / write back recommendations with
approvals, and auditor schedules — on the SAP Central Finance line-item structure, in INR.

- Requirements: [`docs/FRD.md`](docs/FRD.md)
- Working rules for contributors and Claude sessions: [`CLAUDE.md`](CLAUDE.md)
- Build status: increment **I0 (scaffold)** — every screen is registered and shows its FRD contract;
  features arrive increment by increment (FRD §16).

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # formatter and date tests
npm run build
```

Synthetic data only. Masked client data, if provided, goes in `data/private/` (git-ignored) and is
deleted after the workshop.

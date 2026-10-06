# LedgerAlpha

Agentic record-to-report platform with an India localisation pack: close, reconcile & review, treasury,
tax, reporting, and audit & controls on one shared data foundation. Agents prepare and propose; people
review, approve and sign off; every figure traces to its document.

- Requirements: [`docs/FRD.md`](docs/FRD.md)
- Working rules: [`CLAUDE.md`](CLAUDE.md)
- Status: increment **I0** — product scaffold (navigation, workspace/localisation config, shell, page
  anatomy). Modules are built increment by increment (FRD §13).

```bash
npm install
npm run dev        # http://localhost:5180
npm test
npm run build
```

The demo workspace runs on synthetic data. Masked customer data, if provided, goes in `data/private/`
(git-ignored) and is deleted after the engagement.

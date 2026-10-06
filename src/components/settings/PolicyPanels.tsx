import { Panel } from "@/components/vocab";
import { Chips, Fields } from "@/components/vocab/Fields";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGEING_POLICY, APPROVAL_BANDS, MATERIALITY_POLICY, TAX_REVIEW_POLICY, WRITE_BACK_POLICY } from "@/config/policies";
import { ROLES } from "@/config/roles";
import { fmtINR, fmtINRCompact } from "@/lib/format";

/** Review policies and the delegation-of-authority bands. */
export function PolicyPanels() {
  const basis = { postingDate: "Posting date", documentDate: "Document date", dueDate: "Due date" }[AGEING_POLICY.basis];
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Review" bodyClassName="p-0">
        <Fields
          rows={[
            ["Ageing basis", basis],
            ["Ageing buckets", <Chips items={AGEING_POLICY.buckets.map((b) => b.label)} />],
            ["Review threshold", `${AGEING_POLICY.reviewThresholdDays} days`],
            ["Justification required from", fmtINR(MATERIALITY_POLICY.documentedActionAmount)],
            ["Tax review required for", <Chips items={TAX_REVIEW_POLICY} />],
            ["Approved journals", WRITE_BACK_POLICY.label],
          ]}
        />
      </Panel>
      <Panel title="Approval bands" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Band</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Approval chain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {APPROVAL_BANDS.map((b, i) => {
              const from = i === 0 ? null : APPROVAL_BANDS[i - 1].upTo;
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.id}</TableCell>
                  <TableCell className="tnum">
                    {b.upTo === null ? `Above ${fmtINRCompact(from ?? 0)}` : from === null ? `Up to ${fmtINRCompact(b.upTo)}` : `${fmtINRCompact(from)} – ${fmtINRCompact(b.upTo)}`}
                  </TableCell>
                  <TableCell>{b.chain.map((c) => ROLES[c].label).join(" → ")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

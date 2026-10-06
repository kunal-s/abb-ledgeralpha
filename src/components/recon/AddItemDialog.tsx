import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORLD } from "@/data";
import type { RecRow } from "@/state/recHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { RECON_CLASSES } from "@/engine/recClasses";
import { toast } from "@/lib/toast";

const NONE = "none";

/** Add a reconciling item by hand: something the reconciler did not find. */
export function AddItemDialog({ row }: { row: RecRow }) {
  const role = useRoleStore((s) => s.role);
  const { addRecItem } = useWorkflow.getState();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"books" | "source">("source");
  const [amount, setAmount] = useState("");
  const [dc, setDc] = useState<"Dr" | "Cr">("Dr");
  const [date, setDate] = useState(WORLD.asOf);
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [classId, setClassId] = useState(NONE);
  const locked = !!row.signOff?.preparer;
  const allowed = can(role, "propose") && !locked;

  const submit = () => {
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return toast("Enter the amount as a positive number", { tone: "danger" });
    const r = addRecItem(row.rec.id, { side, amount: dc === "Dr" ? n : -n, date, narration, reference, classId: classId === NONE ? undefined : classId });
    if (!r.ok) return toast(r.error, { tone: "danger" });
    toast("Reconciling item added", { tone: "ok" });
    setOpen(false);
    setAmount("");
    setReference("");
    setNarration("");
    setClassId(NONE);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        disabled={!allowed}
        title={locked ? "Signed off; reopen to add items" : can(role, "propose") ? undefined : `${ROLES[role].label} cannot add items`}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a reconciling item</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
            <span className="text-xs text-muted-foreground">Appears</span>
            <Select value={side} onValueChange={(v) => setSide(v as "books" | "source")}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="books">In the books, not in the source</SelectItem>
                <SelectItem value="source">In the source, not in the books</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Amount in the books</span>
            <div className="flex gap-2">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="h-8 flex-1" />
              <Select value={dc} onValueChange={(v) => setDc(v as "Dr" | "Cr")}>
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr">Dr</SelectItem>
                  <SelectItem value="Cr">Cr</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">Date</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-44" />
            <span className="text-xs text-muted-foreground">Reference</span>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className="h-8" />
            <span className="self-start pt-2 text-xs text-muted-foreground">Description</span>
            <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} className="min-h-[4rem]" />
            <span className="text-xs text-muted-foreground">Class</span>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Classify later</SelectItem>
                {RECON_CLASSES[row.rec.type].map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

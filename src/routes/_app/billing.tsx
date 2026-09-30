import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, AlertTriangle, Infinity as InfinityIcon, Zap } from "lucide-react";
import { toast } from "sonner";

import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyPayment } from "@/lib/payments.functions";
import { useAuth } from "@/hooks/useAuth";
import { PLANS, PLAN_BY_ID, USDT_ADDRESS, USDT_NETWORK, planLabel, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/billing")({
  head: () => ({
    meta: [
      { title: "Plans & Billing — SentinelSec AI" },
      {
        name: "description",
        content: "Choose a SentinelSec AI plan and pay in USDT on the TRC20 network with TXID verification.",
      },
      { property: "og:title", content: "Plans & Billing — SentinelSec AI" },
      { property: "og:description", content: "Starter, Professional and Enterprise plans paid in USDT (TRC20)." },
    ],
  }),
  component: Billing,
});

function Billing() {
  const { user, subscription, isAdmin, refresh } = useAuth();
  const verify = useServerFn(verifyPayment);
  const qc = useQueryClient();
  const [checkout, setCheckout] = useState<PlanId | null>(null);
  const [qr, setQr] = useState<string>("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!checkout) return;
    void QRCode.toDataURL(USDT_ADDRESS, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, [checkout]);

  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function submitTxid() {
    if (!user || !checkout) return;
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(txid.trim())) { toast.error("Enter the full 64-character transaction hash (TXID)."); return; }
    setBusy(true);
    try {
      const res = await verify({ data: { plan: checkout as "starter" | "professional" | "enterprise", txid: txid.trim() } });
      if (!res.ok) { toast.error(res.error); return; }
      setCheckout(null);
      setTxid("");
      toast.success(`Payment verified on-chain (${res.amount} USDT). ${res.plan} plan is now active!`);
      await refresh();
      void qc.invalidateQueries({ queryKey: ["payments"] });
    } catch {
      toast.error("Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const plan = checkout ? PLAN_BY_ID[checkout] : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Plans & Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Credits power the AI assistant. Pay in USDT on the TRC20 network and submit your TXID for verification.
      </p>

      <div className="panel mt-6 flex flex-wrap items-center gap-6 p-6">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Current plan</p>
          <p className="font-display text-xl font-semibold">{planLabel(subscription?.plan ?? "free")}</p>
        </div>
        <div>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Credits remaining</p>
          <p className="flex items-center gap-1.5 font-display text-xl font-semibold text-primary">
            {isAdmin || subscription?.unlimited ? (
              <>
                <InfinityIcon className="h-5 w-5" /> Unlimited
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" /> {subscription?.credits_remaining ?? 0}
              </>
            )}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Credits used</p>
          <p className="font-display text-xl font-semibold">{subscription?.credits_used ?? 0}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`panel relative flex flex-col p-6 ${p.highlight ? "glow border-primary/50" : ""}`}
          >
            {p.highlight ? (
              <Badge className="absolute -top-2.5 left-6 font-mono text-[10px]">Most popular</Badge>
            ) : null}
            <h2 className="font-display text-lg font-semibold">{p.name}</h2>
            <p className="mt-2">
              <span className="font-display text-3xl font-bold">${p.price}</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </p>
            <p className="mt-1 font-mono text-xs text-primary">
              {p.unlimited ? "Unlimited AI credits" : `${p.credits} AI credits / month`}
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="mt-6"
              variant={p.highlight ? "default" : "outline"}
              onClick={() => setCheckout(p.id)}
              disabled={subscription?.plan === p.id}
            >
              {subscription?.plan === p.id ? "Current plan" : `Pay $${p.price} in USDT`}
            </Button>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Payment history</h2>
      <div className="panel mt-3 overflow-x-auto">
        {payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No payments submitted yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <th className="p-4 text-left">Plan</th>
                <th className="p-4 text-left">Amount</th>
                <th className="p-4 text-left">TXID</th>
                <th className="p-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-4">{planLabel(p.plan)}</td>
                  <td className="p-4">${p.amount_usd}</td>
                  <td className="max-w-[16rem] truncate p-4 font-mono text-xs text-muted-foreground">{p.txid}</td>
                  <td className="p-4">
                    <Badge variant={p.status === "approved" ? "default" : "secondary"} className="font-mono text-[10px]">
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!checkout} onOpenChange={(o) => !o && setCheckout(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pay ${plan?.price} USDT — {plan?.name}</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-high/50 bg-high/10 p-3">
            <p className="flex items-start gap-2 text-xs text-high">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Send <strong>USDT on the {USDT_NETWORK} network only</strong>. Funds sent on any other network
                (ERC20, BEP20) are permanently lost and cannot be recovered or refunded.
              </span>
            </p>
          </div>

          {qr ? (
            <img src={qr} alt="USDT TRC20 wallet address QR code" className="mx-auto rounded-md bg-white p-2" />
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">Bitget Wallet address (USDT · TRC20)</Label>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs">
                {USDT_ADDRESS}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy wallet address"
                onClick={() => {
                  void navigator.clipboard.writeText(USDT_ADDRESS);
                  toast.success("Address copied.");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txid" className="text-xs">
              Transaction hash (TXID)
            </Label>
            <Input
              id="txid"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              placeholder="Paste the TXID from your wallet after sending"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              An admin verifies the transaction on-chain and activates your plan and credits.
            </p>
          </div>

          <Button disabled={busy} onClick={() => void submitTxid()}>
            Submit for verification
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

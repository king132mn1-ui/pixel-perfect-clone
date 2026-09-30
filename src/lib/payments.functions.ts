import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_BY_ID, USDT_ADDRESS } from "@/lib/plans";

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        plan: z.enum(["starter", "professional", "enterprise"]),
        txid: z.string().trim().regex(/^(0x)?[0-9a-fA-F]{64}$/, "Invalid TXID format"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const txid = data.txid.replace(/^0x/, "").toLowerCase();
    const plan = PLAN_BY_ID[data.plan]!;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyUsdtTransfer } = await import("@/lib/tron.server");

    const { data: existing } = await supabaseAdmin.from("payments").select("id").ilike("txid", txid).maybeSingle();
    if (existing) return { ok: false as const, error: "This TXID has already been used." };

    const check = await verifyUsdtTransfer(txid, USDT_ADDRESS, plan.price);
    if (!check.ok) return { ok: false as const, error: check.error };

    const { error: insErr } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      plan: plan.id,
      amount_usd: check.amountUsdt,
      txid,
      network: "TRC20",
      status: "approved",
      admin_note: "Auto-verified on-chain",
      reviewed_at: new Date().toISOString(),
    });
    if (insErr) return { ok: false as const, error: "This TXID has already been used." };

    const credits = plan.unlimited ? 0 : Number(plan.credits);
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: plan.id,
        unlimited: !!plan.unlimited,
        credits_remaining: credits,
        credits_used: 0,
        period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    await supabaseAdmin.from("credit_ledger").insert({
      user_id: context.userId,
      delta: credits,
      reason: `${plan.name} plan activated (TXID ${txid.slice(0, 10)}…)`,
    });

    return { ok: true as const, plan: plan.name, amount: check.amountUsdt };
  });

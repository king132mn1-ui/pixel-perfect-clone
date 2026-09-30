import { createFileRoute } from "@tanstack/react-router";

// Idempotent: ensures the fixed super-admin account exists and holds the admin role.
// Takes no input; the password comes from the ADMIN_BOOTSTRAP_PASSWORD secret.
const ADMIN_EMAIL = "admin@system.local";

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async () => {
        const password = process.env["ADMIN_BOOTSTRAP_PASSWORD"];
        if (!password) return Response.json({ ok: false }, { status: 500 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
        let id = prof?.id;
        if (!id) {
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password,
            email_confirm: true,
            user_metadata: { display_name: "Super Admin" },
          });
          if (error || !data.user) return Response.json({ ok: false }, { status: 500 });
          id = data.user.id;
        }
        await supabaseAdmin.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
        await supabaseAdmin.from("subscriptions").update({ unlimited: true, plan: "enterprise" }).eq("user_id", id);
        return Response.json({ ok: true });
      },
    },
  },
});

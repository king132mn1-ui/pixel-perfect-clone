import { useState } from "react";
import { MessageSquare, X, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function SupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function send() {
    if (!user) return;
    if (!subject.trim() || !body.trim()) { toast.error("Add a subject and a message."); return; }
    setBusy(true);
    const { data: thread, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, subject: subject.trim() })
      .select()
      .single();
    if (error || !thread) {
      setBusy(false);
      { toast.error(error?.message ?? "Could not send your message."); return; }
    }
    const { error: msgError } = await supabase
      .from("support_messages")
      .insert({ thread_id: thread.id, sender_id: user.id, body: body.trim(), from_admin: false });
    setBusy(false);
    if (msgError) { toast.error(msgError.message); return; }
    setSubject("");
    setBody("");
    setOpen(false);
    toast.success("Message sent. You'll get a reply in the Support tab.");
  }

  return (
    <>
      {open ? (
        <div className="panel glow fixed right-5 bottom-5 z-50 w-[min(22rem,calc(100vw-2.5rem))] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Contact support</h3>
            <button onClick={() => setOpen(false)} aria-label="Close support">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sw-subject" className="text-xs">
                Subject
              </Label>
              <Input
                id="sw-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Billing question"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-body" className="text-xs">
                Message
              </Label>
              <Textarea
                id="sw-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="How can we help?"
              />
            </div>
            <Button className="w-full" disabled={busy} onClick={() => void send()}>
              <Send className="h-4 w-4" /> Send message
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Contact support"
          className="glow fixed right-5 bottom-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

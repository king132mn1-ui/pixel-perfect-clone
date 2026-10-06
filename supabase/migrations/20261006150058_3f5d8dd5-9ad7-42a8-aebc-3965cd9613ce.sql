CREATE TABLE public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type text NOT NULL DEFAULT 'assistant',
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads own" ON public.chat_threads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX chat_threads_user_agent_idx ON public.chat_threads (user_id, agent_type, updated_at DESC);

ALTER TABLE public.chat_messages ADD COLUMN thread_id uuid REFERENCES public.chat_threads(id) ON DELETE CASCADE;
CREATE INDEX chat_messages_thread_idx ON public.chat_messages (thread_id, created_at);

-- Move existing history into one "Earlier conversation" thread per user/agent
INSERT INTO public.chat_threads (user_id, agent_type, title, created_at, updated_at)
SELECT user_id, agent_type, 'Earlier conversation', min(created_at), max(created_at)
FROM public.chat_messages GROUP BY user_id, agent_type;
UPDATE public.chat_messages m SET thread_id = t.id
FROM public.chat_threads t
WHERE m.thread_id IS NULL AND t.user_id = m.user_id AND t.agent_type = m.agent_type AND t.title = 'Earlier conversation';
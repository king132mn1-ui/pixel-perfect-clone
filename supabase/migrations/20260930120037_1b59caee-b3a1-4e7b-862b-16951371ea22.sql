
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- SUBSCRIPTIONS + CREDITS
CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  credits_remaining integer NOT NULL DEFAULT 10,
  unlimited boolean NOT NULL DEFAULT false,
  credits_used integer NOT NULL DEFAULT 0,
  period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub read" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sub admin write" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger read" ON public.credit_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount_usd numeric NOT NULL,
  txid text NOT NULL,
  network text NOT NULL DEFAULT 'TRC20',
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read" ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "payments insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "payments admin update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ENGAGEMENTS / FINDINGS
CREATE TABLE public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  client text,
  scope text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engagements own" ON public.engagements FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.engagements(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text,
  remediation text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.findings TO authenticated;
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "findings own" ON public.findings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  detail text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist own" ON public.checklist_items FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- KNOWLEDGE BASE
CREATE TABLE public.kb_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id text,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  severity text NOT NULL DEFAULT 'medium',
  summary text NOT NULL,
  remediation text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kb_entries TO authenticated;
GRANT SELECT ON public.kb_entries TO anon;
GRANT ALL ON public.kb_entries TO service_role;
ALTER TABLE public.kb_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb public read" ON public.kb_entries FOR SELECT USING (true);
CREATE POLICY "kb admin write" ON public.kb_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- CHAT
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat own" ON public.chat_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- SUPPORT
CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_threads TO authenticated;
GRANT ALL ON public.support_threads TO service_role;
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads access" ON public.support_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "threads insert" ON public.support_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "threads update" ON public.support_threads FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_admin boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages read" ON public.support_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "messages insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND (public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())));

-- APP SETTINGS
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'SentinelSec AI is undergoing scheduled maintenance. We will be back shortly.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings admin write" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.app_settings (id) VALUES (true);

-- NEW USER BOOTSTRAP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan, credits_remaining)
  VALUES (NEW.id, 'free', 10) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_ledger (user_id, delta, reason) VALUES (NEW.id, 10, 'Welcome trial credits');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED KNOWLEDGE BASE
INSERT INTO public.kb_entries (cve_id, title, category, severity, summary, remediation, tags) VALUES
(NULL,'Broken Access Control (A01:2021)','OWASP Top 10','critical','Users can act outside their intended permissions, reaching data or functions that should be restricted. Most commonly caused by missing server-side authorisation checks and insecure direct object references.','Deny by default. Enforce authorisation server-side on every request, not in the UI. Use record ownership checks, disable directory listing, log failures and rate-limit APIs.','{"access-control","authz","owasp"}'),
(NULL,'Cryptographic Failures (A02:2021)','OWASP Top 10','high','Sensitive data exposed through weak or missing encryption in transit or at rest, deprecated algorithms, or hardcoded keys.','Classify data, enforce TLS 1.2+ with HSTS, encrypt at rest with modern AEAD ciphers, rotate keys through a managed KMS and never commit secrets to source control.','{"crypto","tls","secrets"}'),
(NULL,'Injection (A03:2021)','OWASP Top 10','critical','Untrusted input is interpreted as code or query syntax — SQL, NoSQL, OS command, LDAP or ORM injection.','Use parameterised queries and prepared statements everywhere, validate input against allow-lists, escape output contextually and apply least-privilege database accounts.','{"sqli","injection","owasp"}'),
(NULL,'Insecure Design (A04:2021)','OWASP Top 10','high','Missing or ineffective security controls baked into the architecture, which cannot be fixed by implementation quality alone.','Run threat modelling per feature, define abuse cases and security requirements early, use secure design patterns and enforce limits on business-critical flows.','{"design","threat-model"}'),
(NULL,'Security Misconfiguration (A05:2021)','OWASP Top 10','high','Default credentials, verbose errors, unnecessary features enabled, permissive CORS, or missing security headers.','Harden baselines and automate them, remove unused components, disable stack traces in production and set CSP, X-Content-Type-Options, Referrer-Policy and HSTS headers.','{"hardening","headers","config"}'),
(NULL,'Vulnerable and Outdated Components (A06:2021)','OWASP Top 10','high','The application depends on libraries, frameworks or runtimes with known vulnerabilities.','Maintain an SBOM, run continuous dependency scanning, subscribe to advisories, and patch or replace unmaintained packages on a defined SLA.','{"sca","dependencies","patching"}'),
(NULL,'Identification and Authentication Failures (A07:2021)','OWASP Top 10','high','Weak credential handling, permissive session management, missing brute-force protection or credential stuffing exposure.','Enforce MFA, check passwords against breach corpora, use secure session identifiers with rotation on login, and apply progressive rate limiting and lockouts.','{"auth","mfa","sessions"}'),
(NULL,'Software and Data Integrity Failures (A08:2021)','OWASP Top 10','high','Code and infrastructure that does not protect against integrity violations — unsigned updates, untrusted CI/CD plugins, insecure deserialisation.','Verify signatures on dependencies and updates, pin and review CI/CD pipeline steps, and avoid deserialising untrusted data.','{"supply-chain","cicd","integrity"}'),
(NULL,'Security Logging and Monitoring Failures (A09:2021)','OWASP Top 10','medium','Breaches go undetected because auth events, failures and high-value actions are not logged, alerted on, or retained.','Log authentication, access-control and validation failures with sufficient context, ship to tamper-resistant storage, define alerts and rehearse an incident response plan.','{"logging","detection","ir"}'),
(NULL,'Server-Side Request Forgery (A10:2021)','OWASP Top 10','high','The server fetches a remote resource from a user-supplied URL, letting attackers reach internal services and cloud metadata endpoints.','Allow-list destination hosts and schemes, block private and link-local ranges, disable redirects, and segment outbound egress at the network layer.','{"ssrf","network"}'),
('CVE-2021-44228','Log4Shell — Apache Log4j 2 JNDI RCE','Critical CVE','critical','A JNDI lookup in Log4j 2 message formatting allows unauthenticated remote code execution when attacker-controlled strings are logged.','Upgrade Log4j to 2.17.1 or later. Where upgrade is blocked, remove the JndiLookup class and restrict outbound LDAP/RMI traffic. Hunt for exploitation in historical logs.','{"rce","java","log4j"}'),
('CVE-2014-0160','Heartbleed — OpenSSL memory disclosure','Critical CVE','critical','A missing bounds check in the OpenSSL TLS heartbeat extension leaks up to 64KB of process memory per request, including private keys and session data.','Upgrade OpenSSL to a patched build, reissue and revoke affected certificates, and force credential and session rotation.','{"openssl","tls","disclosure"}'),
('CVE-2017-0144','EternalBlue — SMBv1 remote code execution','Critical CVE','critical','A flaw in Microsoft SMBv1 packet handling permits unauthenticated remote code execution, used by WannaCry and NotPetya.','Apply MS17-010, disable SMBv1 entirely, and block ports 139/445 at network boundaries.','{"smb","windows","rce"}'),
('CVE-2023-4863','WebP heap buffer overflow (libwebp)','Critical CVE','critical','A heap overflow in libwebp lossless decoding allows code execution from a crafted image, affecting browsers and any app embedding the library.','Update browsers and rebuild applications against libwebp 1.3.2 or later, including bundled Electron and mobile runtimes.','{"libwebp","browser","overflow"}'),
('CVE-2022-22965','Spring4Shell — Spring Framework RCE','Critical CVE','critical','Data binding on JDK 9+ with Spring Framework allows attackers to modify class loader properties and achieve remote code execution.','Upgrade to Spring Framework 5.3.18/5.2.20 or later, or restrict disallowed binding fields on affected controllers.','{"spring","java","rce"}');

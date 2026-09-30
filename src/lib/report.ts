type Engagement = { name: string; client: string | null; scope: string | null; created_at: string };
type Finding = {
  title: string;
  severity: string;
  description: string | null;
  remediation: string | null;
  status: string;
};

const ORDER = ["critical", "high", "medium", "low", "info"];
const COLORS: Record<string, string> = {
  critical: "#c0392b",
  high: "#d35400",
  medium: "#b7950b",
  low: "#148f77",
  info: "#2471a3",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReportHtml(engagement: Engagement, findings: Finding[]) {
  const sorted = [...findings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const counts = ORDER.map((s) => ({ severity: s, count: findings.filter((f) => f.severity === s).length }));
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Security Assessment Report — ${escapeHtml(engagement.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #17202a; margin: 0; padding: 48px; line-height: 1.6; }
  .wrap { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 40px 0 12px; border-bottom: 2px solid #eaecee; padding-bottom: 6px; }
  h3 { font-size: 15px; margin: 0; }
  .meta { color: #566573; font-size: 13px; }
  .sev { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eaecee; }
  .finding { border: 1px solid #eaecee; border-radius: 6px; padding: 16px; margin-bottom: 14px; page-break-inside: avoid; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #566573; margin: 12px 0 2px; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
  .scope { background: #f8f9f9; border-radius: 6px; padding: 14px; font-size: 13px; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="wrap">
  <h1>Security Assessment Report</h1>
  <p class="meta">${escapeHtml(engagement.name)}${engagement.client ? ` &middot; ${escapeHtml(engagement.client)}` : ""} &middot; Generated ${date}</p>

  <h2>Executive summary</h2>
  <p>This report documents ${findings.length} finding${findings.length === 1 ? "" : "s"} identified during an authorised security assessment. Severity ratings reflect the exploitability and business impact of each issue. Remediation guidance is provided per finding.</p>

  <table>
    <tr><th>Severity</th><th>Findings</th></tr>
    ${counts
      .map(
        (c) =>
          `<tr><td><span class="sev" style="background:${COLORS[c.severity]}">${c.severity}</span></td><td>${c.count}</td></tr>`,
      )
      .join("")}
  </table>

  ${engagement.scope ? `<h2>Authorised scope</h2><div class="scope"><pre>${escapeHtml(engagement.scope)}</pre></div>` : ""}

  <h2>Findings</h2>
  ${
    sorted.length === 0
      ? "<p>No findings were recorded for this engagement.</p>"
      : sorted
          .map(
            (f) => `<div class="finding">
      <span class="sev" style="background:${COLORS[f.severity] ?? "#2471a3"}">${escapeHtml(f.severity)}</span>
      <h3 style="margin-top:8px">${escapeHtml(f.title)}</h3>
      <p class="meta">Status: ${escapeHtml(f.status.replace("_", " "))}</p>
      ${f.description ? `<p class="label">Description &amp; evidence</p><pre>${escapeHtml(f.description)}</pre>` : ""}
      ${f.remediation ? `<p class="label">Remediation</p><pre>${escapeHtml(f.remediation)}</pre>` : ""}
    </div>`,
          )
          .join("")
  }

  <h2>Disclaimer</h2>
  <p class="meta">This assessment was carried out under written authorisation and reflects the state of the in-scope systems at the time of testing. It does not guarantee the absence of other vulnerabilities.</p>
  <p class="meta">Produced with SentinelSec AI.</p>
</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}

# Security Policy

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public GitHub issue.

Use this repository's **Security** tab and select **Report a vulnerability**.
Include the affected component, reproduction steps, and the potential impact.
Sensitive reports will be acknowledged and investigated before any public
disclosure.

We aim to acknowledge a complete report within three business days and provide
an initial severity assessment within seven business days. Remediation timing
depends on impact, exploitability, and the safety of the rollout.

Do not include real customer data, passwords, access tokens, or private keys in
the report.

## Supported version

Security fixes are applied to the latest version of the `main` branch.

## Scope

Reports may cover the web application, Supabase database policies and RPCs,
Edge Functions, and the public integration contracts in this repository. The
privately operated n8n instance is not directly in scope, but vulnerabilities
in its public contract or authentication boundary are.

Known and accepted findings are tracked in
[`docs/security-risk-register.md`](docs/security-risk-register.md) and are
reviewed rather than silently ignored.

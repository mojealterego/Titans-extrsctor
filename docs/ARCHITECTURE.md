# TITANS EXTRACTOR — Architecture

## Processing pipeline

~~~text
CLI / local dashboard
      |
Explicit authorization acknowledgment
      |
Hostname allowlist and public-network checks
      |
robots.txt policy
      |
Playwright / Chromium browser context
  - GET and HEAD requests only
  - bounded network, scrolling, page count, memory
  - passive XHR/fetch API metadata inventory
  - style/image/font capture
      |
Cheerio static snapshot transformer
  - removes scripts, iframes, event handlers
  - rewrites recognized static assets and page links
      |
Output: pages/, assets/, screenshots/, manifest.json, report.md
~~~

The privileged operator migration utility is an isolated path:

~~~text
authorized source infrastructure
   |-- pg_dump --> PostgreSQL backup
   |-- mysqldump --> MySQL backup
   |-- rsync over SSH --> backend directory copy
~~~

## Source modules

| Module | Responsibility |
| --- | --- |
| src/lib/url-policy.mjs | Exact hostname scope and DNS/IP validation |
| src/lib/robots.mjs | Robots directives |
| src/engine/browser.mjs | Chromium lifecycle and network policy |
| src/lib/assets.mjs | Bounded media/style collection |
| src/lib/snapshot.mjs | Static HTML transformation |
| src/lib/audit.mjs | Best-effort redaction and audit signatures |
| src/app/extract.mjs | Orchestration, reports, manifests |
| src/server.mjs | Local authenticated job API |
| src/web/* | Local dashboard |
| src/migrate.mjs | Explicitly authorized database/backend exports |
| test/* | Unit tests and Chromium integration fixture |

## Engineering limitations

Rendering a remote UI cannot recover hidden source code, database schema or secrets not exposed by the server. The saved output is deliberately passive, so interactive parity is not promised. Third-party assets are blocked unless explicitly allowlisted. A regex-based secret scanner does not replace specialized SAST/secret-scanning platforms. Browser DNS resolution is separate from JavaScript preflight checks; DNS rebinding protections require hardened outbound network policy at infrastructure level.

Parallel processing, durable job queues, versioned visual regression baselines, OpenAPI generation, multitenancy and deployment hardening are identified as later milestones rather than falsely described as shipped features.

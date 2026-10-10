# TITANS EXTRACTOR

**Authorized Web Preservation • Frontend Capture • API Inventory • Defensive Auditing • Infrastructure Migration**

TITANS EXTRACTOR is a Node.js toolkit for preserving sites you own or are explicitly authorized to assess. Chromium renders SPA pages, bounded same-origin discovery builds a static offline archive, observed XHR/fetch metadata is recorded, and potential secret exposures are reported by fingerprints rather than raw values. A separate migration utility supports database and backend exports where the operator already has privileged access.

**Status: v0.1.0 — initial implementation. Real-world compatibility and CI results require verification.**

## Capability matrix

| Subsystem | Status |
| --- | --- |
| Chromium SPA rendering (Playwright) | Implemented |
| robots.txt and bounded same-origin crawling | Implemented |
| HTML, CSS, fonts and image archiving | Implemented with limits |
| Viewport screenshots | Implemented |
| API metadata (observed XHR/fetch only) | Implemented |
| Redacted secret-pattern diagnostics / header assessment | Implemented |
| Local bearer-authenticated dashboard and job API | Implemented |
| PostgreSQL/MySQL backups, SSH backend sync | Implemented as separate operator utilities |
| Original private backend/database recovery from browser HTML | **Not possible** |
| Pixel-perfect/interactively identical full clone | **Not claimed** |
| Burp, Postman, mitmproxy, HTTrack, Terraform integrations | Not implemented |

## Installation

Requires Node.js 22+ and an installed Chromium runtime:

~~~bash
npm install
npx playwright install chromium
npm test
~~~

On Ubuntu, additional browser system dependencies can be installed with:

~~~bash
npx playwright install --with-deps chromium
~~~

## Capture an authorized site

~~~bash
node src/cli.mjs extract https://your-site.example --authorized --max-pages 5 --out output/sample
~~~

Optional switches: **--allow-host static.example** (repeatable for explicit asset domains), **--no-screenshot**, **--allow-private** (trusted local/private laboratory only). Max pages: 30 on CLI and 10 on the local API. Browser requests are restricted to GET/HEAD and a fixed request budget.

Artifacts:

~~~text
output/sample/
  index.html
  pages/<route-hash>.html
  screenshots/<route-hash>.png
  assets/<sha256>.<ext>
  manifest.json
  report.md
~~~

Generated pages are intentionally static: JavaScript, embedded documents, remote actions and event handlers are neutralized. This is not a production-equivalent website. CSS not loaded during capture might be incomplete.

## Dashboard and local API

~~~bash
export TITANS_API_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
node src/server.mjs
~~~

Open http://127.0.0.1:8787 on the same host. Enter the token, URL and authorization acknowledgement.

Authenticated API: POST /api/jobs with a JSON body consisting of **url**, **authorized:true** and **maxPages**. Use Authorization: Bearer (token). GET /api/jobs and GET /api/jobs/:id return status. GET /health is available for local checks. Job state is in-memory, processing is serialized, and outputs are written under output/api-jobs/(job ID).

Example:

~~~bash
curl -X POST http://127.0.0.1:8787/api/jobs -H "Authorization: Bearer $TITANS_API_TOKEN" -H 'Content-Type: application/json' -d '{"url":"https://your-site.example","authorized":true,"maxPages":2}'
~~~

The HTTP service binds to loopback; do not expose it publicly without an independent security boundary.

## Authorized backend and database exports

These commands operate on existing authorized SSH or database access, **not** on a public webpage. Install pg_dump, mysqldump, and rsync/ssh on the operator machine as applicable.

~~~bash
# Set PGHOST, PGDATABASE, PGUSER and authentication via PGPASSWORD or .pgpass
node src/migrate.mjs postgres --authorized --out ./backup/db.dump

# Set MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE, MYSQL_PWD
node src/migrate.mjs mysql --authorized --out ./backup/db.sql

# Already authorized SSH access
node src/migrate.mjs rsync --authorized --source operator@host.example:/srv/www/ --out ./backup/backend
~~~

Database dumps and archives may contain highly confidential data. Keep them encrypted, private and outside version control. Restore must be validated in a controlled environment before backups can be considered reliable.

## Limitations and scope

The source basis is the supplied 16-page study *Klonowanie Stron Internetowych: Frontend, Backend, Baza Danych*. This project replaces ad hoc example scripts with a modular system, constrained browser and tests. It does **not** claim to have installed every tool mentioned in the study.

An external browser cannot read original non-public server code or database tables. API inventory is a behavioral observation, not backend source recovery. Automated regex scans can miss secrets, and DNS screening alone cannot eliminate browser-level SSRF; network isolation and egress controls are required when assessing untrusted websites.

Documentation: [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md)

## Validation

~~~bash
npm run check
npm test
~~~

GitHub Actions installs dependencies and Chromium, performs syntax checks, and runs the automated test suite on pushes to main. See workflow status for actual outcomes; this README does not claim that tests have passed.

The repository name is kept as provided: **mojealterego/Titans-extrsctor**.

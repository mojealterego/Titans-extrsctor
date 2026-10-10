# Security and responsible use

## Authorization

Use TITANS only on websites, services and servers you own or have explicit permission to inspect or preserve. Respect robots.txt, rate limits, intellectual property, privacy obligations and local law.

There are no credential-replay, account-takeover, WAF bypass, CAPTCHA bypass, brute-force or active exploitation features. Public observation of an API is not authorization to extract private data.

## Data protection

HTML exports, screenshots and backups can contain personally identifying and confidential content. Store them in encrypted, access-controlled locations. Do not upload archives to public repositories. Excluded local output paths are listed in .gitignore.

Potentially exposed token patterns are reported using types, line numbers and short hashes, not raw token values. This best-effort classifier and HTML redaction **cannot guarantee** that all secret types are detected or deleted. Security analysts should treat diagnostic artifacts as sensitive.

The passive API inventory stores only method, URL without query string, status and content type. Browser profiles are not shared with your logged-in sessions by default.

## Network isolation

Requests are scoped to exact allowed hostnames, screened for private IP ranges, bounded by request limits and restricted to GET/HEAD. Local private-network extraction requires a separate CLI flag; it is not supported through the web API. The API binds to 127.0.0.1 and uses an authorization token.

These software checks do not constitute a browser sandbox. When running against untrusted content, use a dedicated VM/container and restrictive egress firewall/proxy. DNS rebinding and browser vulnerabilities require additional independent mitigations.

## Database and backend access

Export modules operate only with your existing database or SSH credentials. Prefer protected credential files and environment variables over command-line passwords; encrypted local backups and controlled retention are recommended. Verify restore and service startup in a separate environment.

## Reporting vulnerabilities

Contact the repository owner privately. Do not open public GitHub issues containing credentials, private endpoints or customer data.

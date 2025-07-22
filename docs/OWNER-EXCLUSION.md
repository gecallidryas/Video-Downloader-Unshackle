# Owner Exclusion

Content owners can request domain exclusion from Video Downloader Unshackle.

## What Exclusion Means

When a domain is excluded, Unshackle treats it as blocked by built-in policy. The extension should avoid offering normal download actions for media detected on that domain.

Exclusion is domain-scoped. It does not remove unrelated domains, browser features, or user-owned local files.

## How To Request Exclusion

Open a GitHub issue using the owner exclusion request template.

Include:

- The domain or subdomains to exclude.
- A short explanation of your relationship to the content or service.
- Any public policy, terms, or rights-management page that supports the request.
- A contact address or organization profile that can be used to verify ownership.

Do not include private credentials, takedown secrets, user account data, or non-public access tokens in the issue.

## Review Timeline

Maintainers should acknowledge complete requests within 7 calendar days when the project is actively maintained.

Straightforward verified requests should be reviewed for inclusion in the next patch release. Requests that are ambiguous, overly broad, or unverifiable may require follow-up before any blocklist change is made.

Urgent legal or safety issues should be clearly marked in the issue title.

## Blocklist Update Process

Accepted domains are added to the built-in provider policy or blocklist and covered by tests when practical.

The change should document the requested domain, the reason for exclusion, and the release that includes it. Future requests can update or narrow an exclusion if domain ownership or product behavior changes.

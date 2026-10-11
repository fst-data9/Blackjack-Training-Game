# Google Search Console

After releasing this change to production:

1. Open the verified `blackjack-trainer.co` property in Google Search Console.
2. Under Sitemaps, submit `https://blackjack-trainer.co/sitemap.xml`.
3. Inspect `https://blackjack-trainer.co/`, use Test Live URL, then Request Indexing if eligible. Repeat for `/learn`, `/glossary` and `/charts`.
4. Monitor Page indexing and Performance reports. Submission does not guarantee indexing or ranking.

Public pages have separate URLs, titles, descriptions and production canonical URLs. Learning tools render with JavaScript; headings and introductions are in the initial HTML. Navigation preserves the active practice round. The sitemap excludes APIs, account data and the unfinished Share screen.

Staging's Caddy configuration specifies `X-Robots-Tag: noindex, nofollow`, but public checks on 2026-10-11 found the header missing. The staging deployment script now recreates Caddy to refresh its file mount, matching production; this briefly interrupts proxy connections. Verify the public header after deployment. Do not submit staging URLs. Keep the Google verification TXT record in DNS.

## Diagnosing “Couldn't fetch”

Check the selected property as well as the submitted URL. Use the domain property
`blackjack-trainer.co` or the URL-prefix property `https://blackjack-trainer.co/`.
A staging, HTTP-only or `www` URL-prefix property is a different scope. Copy the
sitemap detail's last-read time and specific error before resubmitting; elapsed
time alone does not establish a propagation problem.

Check the public response, including a crawler user agent:

```sh
curl --fail --show-error --include https://blackjack-trainer.co/sitemap.xml
curl --fail --show-error --include https://blackjack-trainer.co/robots.txt
curl --fail --show-error --include --user-agent Googlebot https://blackjack-trainer.co/sitemap.xml
curl --head https://www.blackjack-trainer.co/sitemap.xml
curl --head http://blackjack-trainer.co/sitemap.xml
```

The direct HTTPS sitemap must return 200 and XML, with the sitemap namespace and
only production canonical URLs. Robots must allow public pages and declare the
same sitemap. Check every listed page for 200, a matching canonical and absence
of `noindex`. A successful request with a Googlebot user agent does not prove
access from Google's actual network.

Use Search Console's live URL test to check Google's access. On the production
server, inspect Caddy's private access logs around the sitemap last-read time for
`/sitemap.xml` and `/robots.txt`, including status and user agent. Confirm claimed
Google crawlers with Google's reverse/forward DNS procedure before attributing
requests to Google. Do not publish raw logs or client addresses. If requests are
absent, investigate DNS, TLS, firewall and Google fetch diagnostics; if present,
use their actual responses to diagnose the failure. Check Cloudflare WAF/bot
events only when DNS traffic is actually proxied through Cloudflare.

## Cloudflare Web Analytics

The manual beacon in `index.html` has a public site token and is shared by all
HTML views, including staging. Confirm the token belongs to the intended site
in the Cloudflare dashboard; the repository cannot prove account ownership or
dashboard receipt. Filter by hostname when reviewing production traffic so
staging visits are not counted as production visits. Avoid adding a second
automatically injected beacon if proxying is enabled later.

CSP allows only the beacon script at
`https://static.cloudflareinsights.com/beacon.min.js` and its reporting endpoint
at `https://cloudflareinsights.com/cdn-cgi/rum`, alongside the existing sources.
After deployment, verify one script load and successful reporting POSTs in the
browser Network panel, then confirm dashboard receipt. Ad blockers can still
prevent analytics. The browser regression uses a mocked beacon and reporting
endpoint to verify CSP enforcement without sending test visits to Cloudflare.

Provider references: [Cloudflare CSP and manual beacon requirements](https://developers.cloudflare.com/web-analytics/faq/),
[Google crawler verification](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot).

# Google Search Console

After releasing this change to production:

1. Open the verified `blackjack-trainer.co` property in Google Search Console.
2. Under Sitemaps, submit `https://blackjack-trainer.co/sitemap.xml`.
3. Inspect `https://blackjack-trainer.co/`, use Test Live URL, then Request Indexing if eligible. Repeat for `/learn`, `/glossary` and `/charts`.
4. Monitor Page indexing and Performance reports. Submission does not guarantee indexing or ranking.

Public pages have separate URLs, titles, descriptions and production canonical URLs. Learning tools render with JavaScript; headings and introductions are in the initial HTML. Navigation preserves the active practice round. The sitemap excludes APIs, account data and the unfinished Share screen.

Staging sends `X-Robots-Tag: noindex, nofollow` through Caddy. Verify this header after deployment. Do not submit staging URLs. Keep the Google verification TXT record in DNS.

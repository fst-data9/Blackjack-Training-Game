# AdSense preparation (2026-10-11)

Live ads are disabled, including when public identifiers are configured. This
change prepares manual placements and a consent-gated loader, not an activation.
No approval, earnings or indexing is promised. Anonymous practice remains free.

Google's [publisher gambling restriction](https://support.google.com/publisherpolicies/answer/10437963?hl=en)
focuses on real money or items of value and distinguishes educational material.
This free strategy trainer has no cash wagers or prizes; educational placements
appear potentially suitable, subject to Google's site review and other policies.
Do not add gambling affiliate links or prizes without reassessing suitability.

Use one manual responsive display unit after content on the three learning indexes.
Individual short topic pages are excluded to avoid ads outweighing their content. Slots are labelled
“Advertisements”, reserve 320px vertically once enabled and leave 160px above
for separation from quiz/chart controls. There are no ads at the practice table,
account dialog, review, or stats. No automatic refresh, interstitial or sticky
placement is implemented. Keep Auto ads off in the account so Google does not
insert ads near gameplay controls. Review [placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
and [program policies](https://support.google.com/adsense/answer/48182?hl=en).

Before activation, obtain the site/account review status and public publisher
`ca-pub-` ID and display slot ID. Optional `ADSENSE_PUBLISHER_ID` and
`ADSENSE_LEARNING_SLOT_ID` belong in the runtime configuration; they are public
identifiers, not account credentials. The server validates their shape but always
returns `enabled: false`. Disabled slots are hidden and make no Google requests.
The client loader is prepared for a future reviewed activation; each mounted unit
is requested once. Script failure leaves reserved space and does not block content.

The owner must publish an accurate privacy policy (cookies, Google/third-party
advertising data use, account data and contact/retention choices), configure
applicable regional messages, and choose a certified CMP. Google's
[consent requirements](https://support.google.com/adsense/answer/13554116?hl=en)
and [CMP setup](https://support.google.com/adsense/answer/7670013?hl=en)
cover EEA/UK/Switzerland traffic; AdSense Privacy & messaging offers Google's
certified CMP. A generic local cookie banner is not a substitute.

Activation is a separate reviewed change: implement/test the selected CMP adapter
(including decline and revocation), allow the necessary exact Google ad/CMP
origins in CSP based on official integration guidance, enable the backend gate
only for approved production configuration, and configure `/ads.txt` using the
account-provided seller record. Do not invent publisher records. The current
CSP deliberately remains restrictive and no live Google script is injected.
A CMP adapter would emit `adsenseconsent` with boolean detail only when ad requests
are permitted. The event alone cannot activate ads in this version.

Verify approval configuration, CSP, mobile layout, empty inventory/ad blockers,
script/network failure, consent decisions and repeat navigation before launch.
Never click live ads during verification. Staging must remain disabled.

Owner supplied publisher ID `ca-pub-8578826503018521` on 2026-10-11 and
selected Google’s CMP. The HTML includes Google’s supported verification meta
tag; no external AdSense script is loaded for verification. Select the meta-tag
verification method in AdSense after production deployment. Site review status
and display slot ID remain unknown; live ads remain disabled.

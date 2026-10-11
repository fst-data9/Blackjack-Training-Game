# AdSense preparation (2026-10-11)

Live ads remain disabled, including when public identifiers are configured.
`readAdSenseConfig` always returns `enabled: false`. Anonymous practice remains
free. Google's CMP adapter and manual placements are prepared, but activation
still requires Aaron's dashboard setup, privacy review and AdSense approval.

This free strategy trainer has no cash wagers or prizes. Google's
[publisher gambling restriction](https://support.google.com/publisherpolicies/answer/10437963?hl=en)
distinguishes educational material, but placement preparation does not imply
Google's site approval. Review the [placement policies](https://support.google.com/adsense/answer/1346295)
and [program policies](https://support.google.com/adsense/answer/48182?hl=en) before activation.

## Manual placements

| Placement | Location | Public slot setting |
|---|---|---|
| `learning-end` | After all content on Learn, Glossary and Charts indexes | `ADSENSE_LEARNING_SLOT_ID` |
| `learning-incontent` | Learn: between lessons and quiz. Glossary: after the first eight displayed cards; hidden with fewer than nine results | `ADSENSE_LEARNING_INCONTENT_SLOT_ID` |
| `game-below-stats` | Below the entire chart/stats section on Practice | `ADSENSE_GAME_SLOT_ID` |
| `review-summary` | Between the review summary and hand list, while Decision Review is open | `ADSENSE_REVIEW_SLOT_ID` |

Individual short topic pages remain excluded. There are no sticky, side-column,
anchor, vignette, or timed interstitial placements. The game slot stays below
the chart/stats section at all widths, with 160px separation from that section
and at least 150px below the lowest game control. No ad is placed inside or beside
the game table, action buttons, result overlay, bet controls or navigation.

Slots use the plain “Advertisements” label and matching accessible label. Each
reserves 320px including its label and a 280px unit before script loading.
Missing/invalid slots, disabled ads and withheld consent create no visible space.
Failed scripts, request errors and unfilled units collapse. If consent is revoked
or a unit fails during a hand, the game slot becomes invisible immediately but
keeps its space until the hand finishes, preventing layout movement mid-hand.

`adsense.js` declares placement conditions and insertion points in one registry.
Public navigation, review visibility and glossary results recheck placement
visibility. Each mounted unit is requested once for the document's lifetime;
returning to a view never refreshes it automatically. Script loading is shared.
No game unit loads or requests during an active round. A delayed configuration
or script callback waits for a later navigation/consent action between rounds;
settlement never causes an ad to appear or be requested. The loader observes
existing DOM state asynchronously and does not add code to game handlers.

The four slot settings and `ADSENSE_PUBLISHER_ID` are optional public identifiers,
not credentials. Slot values must be exactly ten digits; the publisher must be
`ca-pub-` followed by sixteen digits. Examples remain empty in `backend/.env.example`.
The backend gate cannot be enabled by an environment setting or a consent event.

## CSP and activation

The disabled response policy is unchanged and permits no advertising domains.
The prepared enabled branch follows Google's
[AdSense CSP guidance](https://support.google.com/adsense/answer/16283098): a fresh
cryptographic nonce per response is applied to every trusted HTML script, and the
ad loader copies that nonce onto its script. Strict-dynamic propagates script
trust. The enabled policy includes Google's documented script fallbacks and eval
support; HTTPS ad frames, images and connections are allowed because Google does
not support a fixed rolling ad-domain list. These permissions are conditional
on the backend gate and are not active in this PR. Object, inline-handler and
frame-ancestor restrictions remain in both states.

Before activation, verify the published Google CMP (including decline and
revocation), obtain site/account approval and slot identifiers, and confirm
the `/ads.txt` seller record matches the AdSense account. Publish an accurate privacy
policy describing cookies, Google/third-party advertising data use, account data,
contact details and retention choices. Google's
[consent requirements](https://support.google.com/adsense/answer/13554116?hl=en)
and [CMP setup](https://support.google.com/adsense/answer/7670013?hl=en) cover
EEA/UK/Switzerland traffic. A generic local cookie banner is not a substitute.
The CMP adapter emits `adsenseconsent` with boolean detail when TC data is ready.
The event alone cannot activate ads in this version.

## ads.txt seller record

The root-level `ads.txt` file is included in the server image and served at
`/ads.txt` as plain text with no sign-in required. It uses Aaron's public
publisher ID, matching the existing AdSense account meta tag:

```text
google.com, pub-8578826503018521, DIRECT, f08c47fec0942fa0
```

This follows [Google's ads.txt guide](https://support.google.com/adsense/answer/12171612?hl=en).
The publisher uses `pub-` here rather than the meta tag's `ca-pub-` prefix.
Publishing this file does not enable the site's ad loader or CMP. After this
change reaches the live site, verify `https://blackjack-trainer.co/ads.txt`
against the account's snippet and use **AdSense → Sites → Check for updates**.
Google's status changes after it fetches the file; a PR alone does not update
the live site's “Not found” status.

## Google consent integration

`consent.js` starts only after `adsense.js` has read an explicitly enabled
`/adsense-config` response with a valid public publisher ID. It loads Google's
Funding Choices bootstrap (`https://fundingchoicesmessages.google.com/i/pub-…?ers=1`)
before any AdSense script, copies the response nonce and adds Google's hidden
`googlefcPresent` marker to avoid a second CMP bootstrap. No Google CMP namespace,
marker, request or consent banner is created with ads disabled. Missing or
unpublished messages, blocked scripts and API failures leave ads unavailable;
the game, sign-in and learning views never await consent.

The adapter subscribes through `googlefc.callbackQueue` using
`CONSENT_API_READY`, then calls `__tcfapi('addEventListener', 2, …)`.
`tcloaded` and `useractioncomplete` allow ads only after a successful callback
with `cmpStatus: 'loaded'`, a known jurisdiction and a nonempty TC string.
A successful `gdprApplies: false` also allows ads; the IAB permits this reduced
response to omit the status and TC-string fields. Explicit stub/loading/error
states never allow ads. `cmpuishown` pauses ads while the visitor chooses.
Google reads the TC string and decides between personalised, non-personalised
and limited ads. A completed refusal is readiness, not agreement to personalise.

Five seconds is our fail-closed **loading** deadline, not a Google requirement
or a deadline for the visitor. Once a working CMP displays its UI, the visitor
can take as long as needed. A load failure stays closed for the document, even
if a delayed callback arrives. “Privacy and cookie settings” queues Google's
`showRevocationMessage()` and pauses ads until an updated choice arrives. With
ads off or no working CMP, that visible footer link opens `/privacy#cookie-settings`.

Documentation reviewed on 2026-10-11:

- [Google's TCF troubleshooting](https://support.google.com/adsense/answer/9999955?hl=en)
  currently describes TCF v2.3. It requires usable TC data and reports empty
  strings and stub/loading/error statuses as errors, so the adapter is stricter
  than the brief's status-only mapping. Google no longer mandates a response
  timeout; the five-second deadline is this site's conservative choice.
- [Google's Privacy & messaging API](https://developers.google.com/funding-choices/fc-api-docs)
  documents the callback queue and revocation method. It normally deploys EU
  messages through an existing AdSense/GPT tag. This brief requires the CMP
  **before** `adsbygoogle.js`, so we use a separate Funding Choices bootstrap.
  That ordering is an integration assumption which Aaron must verify against
  the account-provided tag and published message before enabling ads; the
  public documentation does not promise a standalone GDPR bootstrap contract.
- [IAB CMP API specification](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md)
  specifies integer API version `2` and the reduced outside-GDPR TCData object.
  This API version does not pin Google's consent strings to TCF policy v2.0.

### Aaron's dashboard and privacy steps before activation

1. Review `/privacy`, confirm the owner contact `blackjack-trainer-admin@proton.me`
   supplied by Aaron, and confirm the actual handling and retention
   of account and practice data. This draft is for review, **not legal advice**
   or legal sign-off. Update its “advertising is currently disabled” wording if
   activation is approved later.
2. In AdSense **Privacy & messaging → European regulations**, create and publish
   the message for `blackjack-trainer.co`. Set its privacy-policy URL to
   `https://blackjack-trainer.co/privacy`. Confirm the vendor settings include
   Google Advertising Products and the current TCF version.
3. Compare the account's Google Funding Choices tag with the prepared bootstrap
   and presence marker. Validate the published message in a controlled future
   integration check, including EEA/UK/Switzerland and outside-region responses,
   refusal, saved choices, settings/revocation, blocked or unpublished messages,
   and CSP reporting. All automated tests here use local stubs, not Google.
4. Choose and preview the message layout in Google's dashboard at 375px and
   768px (and desktop), including opening settings during a hand. The banner is
   rendered by Google; its placement cannot be reliably changed with site CSS
   or this documented API. Select a format that keeps game controls clear. No
   real banner geometry has been verified in this disabled implementation.
   Google's published-message preview supports `?fc=alwaysshow&fctype=gdpr`.
5. Keep ads disabled until all account/site, seller-record, consent and privacy
   prerequisites have been approved. US state privacy messages are a separate
   follow-up; this adapter implements the European TCF flow only.

Check real integration with CSP reporting, device layouts, empty inventory,
ad blockers, network failures, consent and repeated navigation before launch.
Never click live ads during verification. Staging must remain disabled.

## Auto ads dashboard guidance

Keep Auto ads off. If Auto ads is ever enabled in the AdSense dashboard, exclude
Practice (`/`) entirely and turn off anchor and vignette (full-screen) formats
everywhere. Mobile anchor ads can cover action buttons. This implementation adds
manual units only and does not add the Auto ads snippet.

## Verification and previews

`npm run test:ads` checks identifier validation, the permanent disabled gate,
both CSP states and script nonces. `npm run test:consent` uses a fake TCF API and
clock for readiness, outside-region data, refused choices, errors, deadlines and
revocation. `npm run test:browser` runs both unit suites and the learning unit
suite before browser checks. Placement tests force enabled
configuration and consent only through local stubs: all external requests are
intercepted and no real Google ad calls are made. They cover placement order,
spacing at 375/768/1280px, active rounds, reserved height, filtering, failures,
unfilled units and consent revocation. Those placement tests isolate the CMP
adapter and inject consent explicitly. Separate CMP browser tests run the real
adapter with Google's bootstrap stubbed locally, checking script ordering,
revocation, failures, disabled behaviour, privacy metadata and navigation.
Existing gameplay and SEO tests still run.

[Desktop/mobile placeholder screenshots](ad-placements/README.md) show every
page and all four placements. To reproduce with the local Playwright setup:

```sh
AD_SCREENSHOT_DIR=docs/ad-placements/screenshots npm run test:browser -- tests/browser/ad-placements.spec.js --workers=2
```

Aaron supplied the public publisher ID `ca-pub-8578826503018521` on 2026-10-11
and selected Google's CMP. The existing verification meta tag is unchanged;
no external AdSense script is loaded for verification. Live ads remain disabled.

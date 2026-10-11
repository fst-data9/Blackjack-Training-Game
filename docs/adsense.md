# AdSense preparation (2026-10-11)

Live ads remain disabled, including when public identifiers are configured.
`readAdSenseConfig` always returns `enabled: false`. Anonymous practice remains
free. Activation requires the separate Google CMP work and Aaron's AdSense
approval; this change prepares manual placements and tests only.

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

Before activation, implement/test the selected certified CMP (including decline
and revocation), obtain site/account approval and slot identifiers, and configure
`/ads.txt` from the account-provided seller record. Publish an accurate privacy
policy describing cookies, Google/third-party advertising data use, account data,
contact details and retention choices. Google's
[consent requirements](https://support.google.com/adsense/answer/13554116?hl=en)
and [CMP setup](https://support.google.com/adsense/answer/7670013?hl=en) cover
EEA/UK/Switzerland traffic. A generic local cookie banner is not a substitute.
A reviewed CMP adapter will emit `adsenseconsent` with boolean detail only when
ad requests are permitted. The event alone cannot activate ads in this version.

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
both CSP states and script nonces. `npm run test:browser` also runs these tests
and the learning unit suite before browser checks. Placement tests force enabled
configuration and consent only through local stubs: all external requests are
intercepted and no real Google ad calls are made. They cover placement order,
spacing at 375/768/1280px, active rounds, reserved height, filtering, failures,
unfilled units and consent revocation. Existing gameplay and SEO tests still run.

[Desktop/mobile placeholder screenshots](ad-placements/README.md) show every
page and all four placements. To reproduce with the local Playwright setup:

```sh
AD_SCREENSHOT_DIR=docs/ad-placements/screenshots npm run test:browser -- tests/browser/ad-placements.spec.js --workers=2
```

Aaron supplied the public publisher ID `ca-pub-8578826503018521` on 2026-10-11
and selected Google's CMP. The existing verification meta tag is unchanged;
no external AdSense script is loaded for verification. Live ads remain disabled.

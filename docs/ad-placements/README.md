# Ad placement previews

These full-page screenshots use a local placeholder script, fake public slot IDs,
and forced test-only consent/configuration. All external requests are intercepted.
The real backend still returns `enabled: false`; no live ads were loaded.

| Page | Desktop (1280px) | Mobile (375px) |
|---|---|---|
| Practice — below chart/stats | [Screenshot](screenshots/desktop-practice.jpg) | [Screenshot](screenshots/mobile-practice.jpg) |
| Decision Review — after summary | [Screenshot](screenshots/desktop-review.jpg) | [Screenshot](screenshots/mobile-review.jpg) |
| Learn — after lessons and at end | [Screenshot](screenshots/desktop-learn.jpg) | [Screenshot](screenshots/mobile-learn.jpg) |
| Glossary — after eight cards and at end | [Screenshot](screenshots/desktop-glossary.jpg) | [Screenshot](screenshots/mobile-glossary.jpg) |
| Charts — at end only | [Screenshot](screenshots/desktop-charts.jpg) | [Screenshot](screenshots/mobile-charts.jpg) |

The same browser suite verifies at least 150px between the game ad and the lowest
control, chart/stats card and result overlay at 375px, 768px and 1280px. All units
reserve their height before filling. See [AdSense preparation](../adsense.md) for
configuration, lifecycle and Auto ads dashboard guidance.

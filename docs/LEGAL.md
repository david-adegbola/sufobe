# Legal, privacy and safety notes

This covers both apps in this repository: the classroom simulation *Mistä puu tulee?* (`index.html`) and the game *Kasva!* (`game/`). Both state their privacy facts inside the app. In Kasva! that is the **Tietoa / About** screen, whose text lives in `game/src/app/legal.ts`; in the classroom sim it is the footer. If storage, hosting or features change, update those texts in the same commit.

This is not legal advice. The reasoning below should be checked by someone qualified before any public launch, especially for use in schools.

## Information only you can provide (placeholders in the app)

| Needed | Where it goes | Why |
|---|---|---|
| **Operator name**: the person or organisation responsible for the game | `OPERATOR.name` in `game/src/app/legal.ts` | The privacy notice must say who is responsible (GDPR art. 13 asks for the controller's identity, even when little or no personal data is processed). |
| **Contact** for privacy questions: an email address or web form | `OPERATOR.contact` in the same file | People must be able to ask questions or make requests. |
| **Where the game will be hosted publicly** (domain and host) | the "Third parties" paragraph in `legal.ts` | It currently names claude.ai, where the test version is published. A different host processes web requests under its own policy, and that host should be named. |
| *(Optional)* **Governing law / jurisdiction** for the terms | the terms section in `legal.ts` | Left out on purpose rather than guessed. |

Until these are filled in, the app shows a clearly marked "[missing …]" line instead of invented details.

## What the apps store (data inventory)

Nothing is sent to any server by either app. All game data is in the browser's `localStorage` on the device being used. The offline web build also uses the browser's Cache Storage (see the end of this section).

| Key | App | Contents | Needed for | Removable |
|---|---|---|---|---|
| `kasva-save` | Kasva! | carbon total, seasons played, badges, growth choices, streak days, best score per daily seed, random 2-character nickname code, challenge history (nickname codes, seeds, scores, dates) | progress between visits | "Delete all data" on the About screen, or clearing browser data |
| `kasva-forest` | Kasva! (Metsäni mode) | the current forest (place, soil, trees, yearly results, products made and the trees they came from, a random forest seed) and short summaries of up to 12 earlier forests | continuing and comparing forests between visits | same |
| `kasva-lang`, `kasva-sound` | Kasva! | language, sound on/off | settings | same |
| `kasva-testlog`, `kasva-greybox-log` | Kasva! | playtest log switch, and per-season results with timestamps | teacher and research playtests only. **Off by default**, and switching it off clears the log. | switch off, or delete |
| `kasva-quiz-on`, `kasva-quiz` | Kasva! (Metsäni) | class question switch, and how many times each answer was chosen before and after (counts only: no names, no free text, no timestamps) | the teacher's before/after playtest. **Off by default.** | "Clear the class question results" in About, or delete all data |
| `kasva-install-later` | Kasva! (offline web build) | the season count after which the install offer may appear again, set only when the player taps "Not now" | not repeating the install offer | same |
| `kasva-dbg` | Kasva! | test hook flag, set only by automated tests | development | same |
| `mista-puu-tulee-tally` | classroom sim | anonymous before/after answer choices, no names | teacher's class summary | "Clear" button in the teacher panel |

The classroom sim's reflection text box is never stored or sent.

**Offline copy (web build only).** When Kasva! is served as a normal website (the `vite build` output), a service worker (`sw.js`) stores the game's own files in Cache Storage: the page, script, style, fonts, icons and web manifest. It holds no data about the player and makes no requests to anyone but the site that served the game. It is removed by clearing the site's data or uninstalling the app. The single-file claude.ai version has no service worker.

**Moving progress between devices.** Two player-initiated ways, neither through a server:
- *Transfer code* (text, link `#t-…` and QR code): the `kasva-save` contents (recent 60 daily scores, last 40 rings and 20 challenges each way), language and sound. Not the Metsäni forest. Importing asks first and replaces the progress on the receiving device. Anyone holding the code can import it, so the game tells the player to keep it to themselves. Because a code may come from someone else's link, imported values are checked and clamped like a save read from storage.
- *Backup file* (`kasva-backup-<date>.json`): every `kasva-*` key above except `kasva-dbg`. Restoring checks that it is a Kasva! backup with only `kasva-*` keys and valid JSON values, asks first, then replaces this device's game data.

**Reasoning (to confirm):** this storage serves only the function the player asked for, and it is never used for tracking or advertising. That is why neither app shows a cookie or consent banner. The ePrivacy rules exempt storage that is "strictly necessary" for a service the user explicitly requested, and progress and settings saving appears to fall under that exemption. The playtest log is the least clearly "necessary" item, which is why it is off by default and opt-in.

## Children

The target players are children aged about 7–12. Neither app asks for a name, age, email or any free text that is stored or shared. Nicknames are generated from a fixed list, so a child cannot type their real name. Challenge links and posters contain only the generated nickname, a score and a weather seed, and they go only where the child chooses to send them.

Adding accounts, free-text names, chat, analytics or a server would change this analysis. Do a data protection review (DPIA) before adding any of them, and see the eventual-MVP plan.

## Third parties

- **Fonts:** bundled in the game file (OFL 1.1, see `game/licenses/fonts-OFL.txt`). Google Fonts was removed so that loading the game sends nothing to Google.
- **Runtime dependencies:** one, bundled into the game file: `qrcode-generator` 2.0.4 (MIT, © 2009 Kazuhiko Arase, see `game/licenses/qrcode-generator-MIT.txt`), which draws the transfer QR code on the device. It makes no network requests. The other npm packages are build and test tools only (Vite, Vitest, TypeScript, esbuild, ESLint, axe-core).
- **Hosting:** whoever serves the page. For the published test version that is claude.ai (Anthropic). The offline web build can be put on any static host; name that host in `legal.ts` and here before publishing.
- **Share sheet and saving:** the device's own share sheet, or the claude.ai viewer's save prompt.

## Not applicable

The apps have no payments, purchases, subscriptions, ads, emails, reviews or testimonials. So a refund policy, fee disclosure, email unsubscribe and review moderation do not apply. If any of those are added later, write the matching policy first.

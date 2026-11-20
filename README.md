# AI Clip Studio (prototype)

Open-source (Apache-2.0), free, on-device Android app that turns a long English video into short vertical clips. No accounts, no cloud, no cost.

## Status
Prototype, step P2 started. Done and tested so far:
- `src/highlights/`: transcript-to-highlights engine (pure TypeScript, no dependencies). Takes timestamped transcript segments and returns up to five ranked clip suggestions with start/end, title, reason, and an experimental score. 9 unit tests pass.

- `app-overlay/` and `scripts/build-apk.sh`: a minimal Android app that shows the engine running on a built-in SAMPLE transcript, plus a GitHub Actions workflow (`build-apk`) that builds an installable APK in the cloud. DRAFT: never run yet.

Not built yet: video picking, on-device audio extraction, on-device transcription, clip preview, export. See `docs/10-prototype-plan.md`.

## Get an APK without a computer
See `docs/SETUP-FROM-PHONE.md`.

## Run the tests
```
npm install
npm test
```

## Important notes
- Scores are heuristics. They do not predict virality or engagement.
- Your videos stay on your phone in the prototype.
- Nothing here has been tested on a phone yet.

## Docs
Planning documents are in `docs/` (start with `00-README.md`).

## Licence
Apache-2.0. See `LICENSE` and `NOTICE`.

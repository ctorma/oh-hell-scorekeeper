# Oh Hell Scorekeeper

A phone-first scorecard for the card game Oh Hell. One phone sits in the middle of the table and handles bids, tricks, the hook rule and running standings. Each game is saved after every tap.

It's a static site with no build step and no server. Everything is in `index.html`.

## What's here

| Path | What it is |
|---|---|
| `index.html` | The whole app: markup, styles and script |
| `sw.js` | Service worker for offline play. Bump `VERSION` when the cached files change |
| `manifest.webmanifest`, `icons/` | Lets phones install it to the home screen |
| `fonts/` | Bricolage Grotesque and Atkinson Hyperlegible, self-hosted so the app works offline (SIL Open Font License) |
| `media/` | The how-to-play video and its poster |
| `api/feedback.js` | Files player feedback as Trello cards |
| `vercel.json` | Cache headers |
| `tools/` | Scripts that made the icons and the video (not part of the site) |

## Run it locally

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. The service worker only registers over HTTPS, so offline mode only works on the deployed site.

## Deploying

Live at **https://ohhellscore.app**. The site is deployed on Vercel from this repository. Every push to `main` goes live automatically. No framework and no build command are needed.

## Where games are stored

Games live in the browser's local storage on each device. Nothing is sent to a server, and phones don't sync with each other. To move games between devices, use **Settings → Your games**: copy a backup (or save it as a file) on one device and restore it on the other. Restoring merges games, so it never deletes anything.

## Feedback and the Trello board

Players can send feedback at the end of every game (and anytime from Settings). `api/feedback.js` turns each note into a card at the top of the **Feedback inbox** list on the [Oh Hell Scorecard board](https://trello.com/b/gWeqCjf0/oh-hell-scorecard), labeled orange (family feedback), plus red when the rating is "Something went wrong". Each card includes the note, who it's from, the game's final scores, the device and the app version.

The function needs two environment variables in the Vercel project: `TRELLO_KEY` and `TRELLO_TOKEN`. If they're missing, or Trello or the network is down, the app keeps the note on the phone and resends it automatically later.

The same board tracks development: Backlog → Up next → In progress → Shipped.

## Rules the app enforces

- 17 hands: 1 to 7 cards, a 7-card No Trump hand, 7 back down to 1, another 7-card No Trump hand, then a 1-card Blind hand. The schedule is editable in Settings.
- Bidding starts left of the dealer, and the deal moves clockwise each hand.
- Hook rule: the dealer bids last and can't make the bids total the number of cards dealt.
- Made bid: 4 + bid. Missed bid: −4. All three numbers are editable in Settings.

## Rebuilding the video

`tools/video` renders the explainer from real app screenshots, and `tools/voice` makes the voiceover and backing track. Needs Node with Playwright, ffmpeg, and Python with `kokoro-onnx`, `numpy` and `soundfile`.

1. `node tools/video/capture.js` captures app screens into `tools/video/shots/`.
2. Voice model: the Kokoro q8 weights (npm package `kokoro-q8-shards`, concatenate the six parts into `tools/voice/kokoro-q8.onnx`) and voices from the `kokoro-js` npm package, packed into `tools/voice/voices.bin` as an `.npz` of `(510, 1, 256)` float32 arrays. These are git-ignored.
3. `python tools/voice/say.py tools/voice/lines.json tools/voice/vo`, then `python tools/voice/mix.py` writes `durs.json` and `soundtrack.wav`.
4. `node tools/video/render.js full`, then mux the audio:

```bash
ffmpeg -i tools/video/oh-hell-how-to.mp4 -i tools/video/soundtrack.wav -map 0:v -map 1:a -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 128k -shortest -movflags +faststart media/how-to-play.mp4
```

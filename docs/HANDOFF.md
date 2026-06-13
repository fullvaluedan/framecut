# VibeCut — Session Handoff

> Read this first in a new session, together with `docs/BRIEF.md` (product brief) and
> `PATCHES.md` (every upstream file we've modified). This file is the working memory:
> goals, state, architecture, mistakes, and the rules that keep rounds shipping cleanly.
> Last updated: 2026-06-13, after round 18 (PR #37).

## 1. What this is

**VibeCut** (formerly FrameCut) is Dan's AI-native video editor: a fork of the archived
`OpenCut-app/opencut-classic` (Next.js + Bun + WebCodecs/WASM editor) with HyperFrames
AI generation built in. Repo: `https://github.com/fullvaluedan/vibecut`. Local clone:
`C:\Users\danom\Videos\framecut` (folder intentionally not renamed).

**North-star goals (Dan's words):**
- "A simplified version of Premiere Pro with similar toolsets and functionality" —
  when building an editor feature, RESEARCH how Premiere does it first, then match it.
- "Provide assets and get an edited video" — import a bin of footage, press AI Cut,
  get a YouTube-quality edit with motion graphics, export fast.
- Everything AI places must be **editable** like a normal clip (this was re-asserted
  hard in round 17 — see Mistakes).

**Dan's profile:** coding novice, tests every round on real footage, gives blunt
feedback with screenshots. Standing directives: *keep running to fix all issues; test
everything before saying a task is complete; be thorough — verify features actually
work end-to-end, not just that code compiles.*

## 2. Dev setup & workflow (per round)

- Dev server: `bun run dev:web` via launch.json name **framecut-dev**, port 3000.
  Docker containers `framecut-db-1`, `framecut-redis-1`, `framecut-serverless-redis-http-1`
  must be running (web container stays stopped).
- **Build gate:** `bun run build:web` (run from repo root!) must exit 0 before shipping.
  Needs `apps/web/.env.local`.
- Round ritual: `git checkout main && git pull` → `feat/roundN` branch → code →
  build → **live-verify in the preview browser** → add rows to `PATCHES.md` for any
  upstream-origin file touched → commit via `git commit -F tempfile` (PowerShell 5.1:
  write files with `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))`, never
  `Set-Content` for source — BOM breaks things; no `&&` in PS 5.1) → `gh pr create
  --body-file` → `gh pr merge --merge --delete-branch`. PRs #2–#37 so far.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The Claude session also keeps a memory file (vibecut.md) — keep both updated.

## 3. What's shipped (compressed)

- **Core AI loop (R1–3):** Settings→AI (Claude subscription via `claude -p`, or API
  key, device-local), `packages/hf-bridge` (5 parametrized HyperFrames templates,
  Claude planner, local transparent-WebM renderer), RUN HYPERFRAMES
  (transcribe→plan→render→place), AI CUT (Remove silences = RMS math; Remove repeats =
  Claude keeps last take; Autocut = assemble+silences) on `RemoveRangesCommand`
  (multi-track ripple cut, single undo), VP9-alpha fix (AI clips render via DOM overlay
  in preview, ffmpeg burn-in at export), convert-for-editing transcode, rebrand.
- **Premiere parity (R4–12):** Effect Controls panel (fx Motion/Opacity/Audio, blue
  scrub values, full keyframe model with stopwatch/◀◆▶), drag-on-number scrubbing,
  pen→freeform MASKS on clips (close on first vertex; feather/invert in Masks tab),
  markers (M), tool rail + V1/A1 track badges, persistent tracks (`keepWhenEmpty`
  defeats the empty-track pruning reactor in `core/index.ts`), track move up/down,
  panel maximize (` on the active panel, glow ring), `\` fit toggle, Up/Down edit-point
  nav, full hotkey set (Q/W ripple trims, Ctrl+K, Shift+Delete ripple delete
  cross-track, D, A=Track Select Forward TOOL, Ctrl+L, Ctrl+R), gap click-to-select +
  ripple delete with Premiere's blocked-by-other-tracks rule, caption styles.
- **AI & UX expansion (R13–15):** Settings→Hotkeys (full remapping UI) + Help tab,
  AI Cut "YouTube edit" mode (assemble + whole-transcript pacing/hook brief),
  export-diff self-learning (kept/restored/trimmed after AI Cut → planner notes),
  HeyGen Music & SFX search in Sounds panel (key in Settings→AI→Integrations),
  AI prompt box under the preview (strict command rails: ai_cut, hyperframes,
  find_broll via SerpAPI, find_audio, add_text, captions; off-topic → reject),
  background transcription cache (hash of timeline audio → localStorage; AI CUT and
  RUN HYPERFRAMES start instantly on warm cache), playback speed slider 0.5x–3x
  (clock + audio engine scaled), AI Cut no-double-assemble fix, stage-aware error
  toasts, export save-dialog (remembers folder), self-learning v1
  (template deletions + undone cut runs + export diff → prompt notes; Settings→AI).
- **Native motion templates (R16–18):** `features/motion-templates/` — 14 native
  templates (callout-pill, kinetic-title, lower-third, number-pop, section-break,
  title-subtitle, quote-card, social-handle, stat-bar, bullet-list, location-tag,
  banner, end-card + Swiss-grid layout apply) built as text elements with PRE-BAKED
  keyframes through the real pipeline (`resolveAnimationTarget`+`upsertPathKeyframe`).
  **Template Controls tab** (default tab for template elements): edit fields + duration,
  rebuilds params+animations via `template.build()` in one undo; detach button.
  Engine toggle on RUN HYPERFRAMES: **Instant (native, default)** places templates
  with zero Chrome renders; **Cinematic** keeps the HyperFrames CLI render path.
  MOGRT feel: all elements of a template share `linkId` → linked selection moves/
  trims/deletes the group as one (Alt-click = single piece). Canvas-proportional
  sizing (×height/1080). Uniform Scale defaults ON. Pin-to-end: resizing a template
  re-times exits to the new end (`animation/template-retime.ts` + update-pipeline rule,
  skipped when a patch already carries `animations`).
- **Linked A/V (R17):** `linkId` stamped on video + separated audio; linked selection
  (default ON, chain toggle in toolbar, Alt = solo); A/V sync frame badge (`⚠ Nf`) on
  drifted clips + Audio-tab readout with one-click **Realign**.
- **Export speed:** pure-edit and native-template projects never touch ffmpeg
  (WebCodecs only = CapCut-class). Cinematic burn-ins auto-use hardware H.264
  (nvenc→qsv→amf probe with libx264 fallback) in `/api/media/composite`.

## 4. Architecture map (where things live)

- `apps/web/src/core/` — EditorCore singleton + managers (playback [has playbackRate],
  audio-manager [sessionRate], renderer). **Reactor in core/index.ts prunes empty
  tracks** unless `keepWhenEmpty`.
- Commands: `apps/web/src/commands/**` — everything undoable goes through
  `editor.command.execute({command})`; `BatchCommand` = one undo step.
  Key: `RemoveRangesCommand`, `InsertElementCommand` (placement auto/explicit),
  `UpdateElementsCommand` (patch incl. params/animations/startTime), `AddTrackCommand`.
- Elements: `timeline/types.ts`. Custom fields we added: `framecutAi` (cinematic AI
  clips), `motionTemplate {templateId, groupId, variables}`, `linkId`. No zod gate on
  persistence — optional fields just work.
- Animation: `animation/*` — `ElementAnimations` channels per path;
  `upsertPathKeyframe` + `resolveAnimationTarget` (timeline/animation-targets.ts) are
  the canonical write path. **fontSize animation does NOT render** (text measurement
  reads base params) — animate transform.scale instead.
- Update pipeline: `timeline/update-pipeline.ts` — rules on element patches (retime
  derive, template re-time, keyframe clamp, startTime clamp).
- AI: `features/ai-generate/` (run-hyperframes orchestrator, store with keys/engine/
  direction/tokens, preference-store self-learning, hyperframes-panel with Showcase
  presets + engine toggle), `features/editing/` (silences/repeats/cleanup/youtube/
  autocut/assemble), `features/assistant/` (prompt box), `features/transcription/`
  (transcript cache + background transcriber), `features/motion-templates/`.
  Server: `app/api/hyperframes/{plan,cuts,render,registry}`, `app/api/assistant`,
  `app/api/media/{composite,transcode}`, `app/api/heygen/*`, `app/api/broll/*`.
- hf-bridge (`packages/hf-bridge/`): templates catalog, Claude calls
  (`planEffects`, `planRepeatCuts` modes repeats/cleanup/youtube, generic `planJson`),
  renderer (spawns hyperframes CLI with real node — dev server runs under Bun),
  Studio (`startStudio` port 3217).
- Selection: `editor.selection.setSelectedElements({elements: ElementRef[]})`;
  linked-selection expansion hooks the user-interaction commits only.

## 5. Mistakes & lessons (do not repeat)

1. **Shipping without proving the user-facing flow.** Round 16 shipped templates whose
   editing path didn't actually work (no Template Controls; baked keyframes silently
   overrode panel edits). Dan: *"This is not true at all, it doesn't work. You need to
   test your changes."* → Every feature now gets a per-item verification matrix:
   insert → edit each field → move/trim → undo → re-edit, observed via DOM/eval, not
   assumed. "It compiled and the toast fired" is not verification.
2. **Assemble doubled footage already on the timeline** (round 15): Dan's video sat on
   V2; AI Cut appended a second copy at 0:00 → broken 9-minute run. Lesson: think about
   the user's real timeline shapes (footage on overlay tracks, multiple scenes), not
   the happy path.
3. **Silent fallbacks hide bugs**: pen quietly created a shape when the mask path
   failed; claude-code mode returned nested JSON the client silently ignored. Both now
   error loudly/normalize. Always surface the failure stage (AI CUT toasts include
   "While '<stage>': ...").
4. **requestPointerLock leaves the cursor invisible** after exit in Chromium → use
   setPointerCapture + body cursor for scrubs.
5. **Premiere research first.** Several features needed rework because the first build
   guessed semantics (pen close behavior, A-key as tool vs action, gap delete blocking
   rule). WebSearch the Premiere behavior, cite it, then build.
6. **Keyframes override base params by design** — any "edit a templated thing" surface
   must regenerate params AND animations together (Template Controls does).
7. **PowerShell 5.1 traps:** BOM from Set-Content corrupts JSON/source; `&&` invalid;
   batch regex replaces on source files are BANNED (caused an a→p disaster pre-R4).
8. **Don't edit watched source files while Dan has a RUN in flight** — HMR full-reload
   kills his run.
9. **Self-learning data hygiene:** clear synthetic test signals (undo-spam runs) from
   the preference store after testing.

## 6. Preview-browser verification playbook

- Start via `preview_start` name `framecut-dev`; **resize to 1600×900 immediately**;
  the browser profile is EPHEMERAL — restarts wipe OPFS media, IndexedDB projects and
  the Whisper model cache. Recreate test media: SAPI TTS → wav (PromptBuilder with
  AppendBreak pauses + a repeated sentence), `ffmpeg testsrc2` mux to mp4, drop in
  `apps/web/public/`, import via fetch→File→`input.files`+change event. **Delete from
  public/ before committing.**
- Long sessions degrade: viewport shrinks to a tiny render, screenshots time out while
  the renderer is busy — eval-based DOM checks keep working; restart server when it
  gets bad. Keep evals <30s (cap); split long sequences.
- Synthetic input gotchas: Radix menus/tabs ignore `.click()` → `focus()` + keydown
  Enter (submenus: ArrowRight). React `onMouseEnter` needs `mouseover`. Hotkeys:
  dispatch keydown on document with `code` set (`KeyD` etc.). Set input values via the
  native value setter + `input` event.
- Useful observables: selection count = `[aria-label="Left resize handle"]` (only on
  selected clips); timeline duration regex `/\/[\s\S]{0,4}(00:\d\d:\d\d:\d\d)/`;
  clip names gain "(left)/(right)" after splits; the Shapes panel has a "Rectangle"
  button — filter timeline clips by `closest('div.relative.h-full.min-w-full')`.
  `window.__vibeEditor` exposes EditorCore in dev (added R17) — use it for state
  assertions instead of DOM scraping where possible.
- Toasts expire — capture them promptly or check network/console instead.
- The full RUN HYPERFRAMES/AI CUT pipelines work headless with claude-code auth;
  watch `/api/hyperframes/plan` vs `/render` in `preview_network` to confirm engine.

## 7. Queued / next steps (in rough priority)

1. **Bake library** for registry cinematic assets: render each (asset × style accent)
   once to a cached transparent WebM, then every AI run/gallery drop reuses it —
   Dan's "pre-bake EVERY HyperFrames element" answered for the assets that can't be
   native. (Promised as "the path to ALL of them".)
2. **Single-clip compound container** (true MOGRT): one timeline chip rendering a
   whole template group. Engine-level; linked-group behavior is the stopgap.
3. **Embedded Studio preview** for cinematic effects (iframe of `startStudio` 3217)
   instead of render-to-see.
4. **AI-filled Swiss-grid keypoints** from the transcript (Showcase preset).
5. "EDIT FOR ME" one-button pipeline (assemble → YouTube cut → HyperFrames → export
   with one progress bar) — natural showcase of the whole product.
6. Smaller queued: workspaces/saved layouts (#49), ValueField styling port (#42),
   mask expansion param, per-track lock/solo enforcement, text vertical alignment,
   stereo pan, stock-video b-roll provider (SerpAPI images are stills only),
   true JKL shuttle rates, fontSize-animation engine fix.

## 8. Current state of the test environment

Preview project (ephemeral) has scratch content from round-18 testing. Dan's real
projects live in his own Chrome profile — untouched by preview-browser resets.
Self-learning store was cleared after synthetic tests in R12; R18 testing added no
learning data (no undo-attributed runs).

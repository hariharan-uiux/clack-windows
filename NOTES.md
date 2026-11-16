# Reverse-engineering notes

What was observed about Klack, what was inferred, and what remains unchecked.
Evidence levels: **SOURCE** = read directly from the vendor's site or files, **PARTIAL** = strongly indicated but not proven, **GUESS** = design decision of this port.

## 1. Product surface — SOURCE

`https://tryklack.com` is a marketing site (Vite + React, hash-routed marketing pages). Its copy states the feature set this port targets:

- satisfying mechanical key sounds
- spatial audio
- instant type feedback
- distinct up/down keystroke sounds
- randomized pitching
- multiple customizable switch profiles
- menubar app, native performance

The reference app is macOS-only (Swift, menubar, distributed outside this repo). Nothing was decompiled; this is a behavioural reimplementation for Windows, not a code port.

## 2. Sample packs — SOURCE

`sounds/` holds the vendor's preview samples:

- 4 profiles: `japanese-black`, `oreo`, `crystal-purple`, `cardboard` (names match the switch list on the site).
- 100 files total, `RIFF/WAVE`, 16-bit stereo 48 kHz, 0.09–0.14 s each.
- Every file is `<keycode>-down.wav` or `<keycode>-up.wav`, i.e. a down/up pair per recorded key.

### Keycode interpretation — PARTIAL

The numeric prefixes match libuiohook/X11 keycodes used by `uiohook-napi`:

| file prefix | uiohook key |
| --- | --- |
| 17, 18, 19 | W, E, R |
| 23, 25 | I, P |
| 28 | Enter |
| 30, 37, 38 | A, K, L |
| 46, 47 | C, V |
| 57 | Space |
| 3675 | unknown |

The prefix set is a scattered sample of keys rather than a full board, and `3675` does not correspond to any keycode in the current libuiohook table. Two readings are possible: (a) samples are keyed per physical key and unrecorded keys borrow the nearest take, or (b) the set is a pool of takes for one switch. This port assumes **(b)** and rotates through the whole pool — see below.

## 3. Behaviour reimplemented — GUESS unless marked

| Behaviour | Source of decision |
| --- | --- |
| Random take per press, no immediate repeat | GUESS, from the sparse keycode set + advertised "randomized" feel |
| Pitch jitter ±N % via playback rate | GUESS; matches advertised "randomized pitching", exact range unknown |
| Up-stroke quieter than down-stroke | GUESS; measured files are similar loudness, the ~-3 dB trim is ours |
| Key position drives stereo pan | GUESS; matches advertised "spatial audio" |
| Short reverb send | GUESS; "immersive" is not measurable from samples |
| Auto-repeat suppressed | GUESS; a physical press should sound once |

## 4. Windows implementation choices

- **Hook**: `uiohook-napi`, a low-level `WH_KEYBOARD_LL` hook. It ships N-API prebuilds for `win32-x64` and `win32-arm64`, so no native rebuild and no Visual Studio toolchain is required. No elevation needed.
- **Audio**: Web Audio in the renderer. `latencyHint: 'interactive'`, all buffers decoded at startup, one `AudioBufferSourceNode` per keystroke, `DynamicsCompressor` acting as a limiter.
- **Tray residency**: `backgroundThrottling: false`, plus Chromium switches `disable-renderer-backgrounding`, `disable-background-timer-throttling`, `autoplay-policy=no-user-gesture-required`. Without these the hidden window throttles and audio stutters.
- **Settings** live in `%APPDATA%/Clack/settings.json`, written atomically.

## 5. What was verified, and how

Executed on this machine (Linux arm64, headless X server):

- `npm run build` — TypeScript strict + Vite production build pass.
- App launched under Xvfb; renderer rendered with no console errors or exceptions.
- 100 WAVs decoded by the engine (`100 samples` in the UI).
- Clicking a switch card played a sample: the output meter peaked at 0.73, proving the graph reaches the device.
- Settings round-trip through IPC and persist to disk.
- `electron-builder --win --x64 --dir` produced `release/win-unpacked/Clack.exe` with `app.asar` (main + preload + renderer), all 100 WAVs under `resources/sounds`, and `uiohook-napi` prebuilds unpacked for win32-x64/arm64. `build/icon.png` and `build/tray.png` are inside the asar.

**Built on Windows (CI):** `.github/workflows/build-windows.yml` ran on `windows-latest` for both commits and finished green, producing the NSIS installer artifact (`Clack-<version>-<arch>-setup.exe`, x64 + arm64). Download: repository → Actions → latest "Build Windows" run → artifact `clack-windows`.

**Not verified here:**

- The Windows global hook itself. This host is Linux arm64 and the package ships no arm64-Linux prebuild, so the hook reported `unavailable` and the UI fell back to its warning state. The win32 prebuilds are present in the bundle but were not executed on Windows.
- The NSIS installer step. It failed at exe resource patching with `wine is required` — a documented Linux-only limitation. CI (`windows-latest`) performs the real packaging.
- Actual audible latency and sound character on a Windows machine.

## 6. Legal

The WAV files are Klack's recordings, used here for a personal reimplementation. Do not redistribute the installer publicly with these samples without permission. Everything else (engine, UI, hook wiring, build config) is original code under MIT.

export interface ReleaseNote {
  version: string;
  /** Release day, or null while the build is still unreleased. */
  date: string | null;
  changes: string[];
}

/** Newest first. Add an entry here whenever `package.json` version changes. */
export const RELEASES: ReleaseNote[] = [
  {
    version: '1.2.0',
    date: '2026-11-19',
    changes: [
      'Mouse clicks now have their own sound, captured by the same low-level hook as the keyboard.',
      'Keyboard and mouse each get their own pack picker, switched with the Keyboard / Mouse tabs at the bottom centre of the window.',
      'Four synthesised mouse packs: Tactile, Soft, Heavy and Silent, with separate press and release takes.',
      'Mouse clicks are placed in the stereo field by where the cursor is on screen, like a key is by its place on the board.',
      'Volume, pitch variation, stereo width, sample rotation and launch at login stay shared between keyboard and mouse.',
      'Tray menu gained a Mouse clicks toggle plus separate Keyboard switch and Mouse switch submenus.',
      'Orange accent colour across the status light, active profile, dock tabs and live meter.',
    ],
  },
  {
    version: '1.1.0',
    date: null,
    changes: [
      'Tray menu now has Open Clack, Minimize to taskbar, Hide to tray and Quit Clack.',
      'Title bar has separate minimize, hide-to-tray and quit buttons, so minimize no longer disappears into the tray.',
      'New Versions panel: every release is listed, and picking one shows its changes.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-17',
    changes: [
      'First public build: global low-level key capture in every app, no admin rights.',
      '100 stereo WAV takes across Japanese Black, Oreo, Crystal Purple and Cardboard, with separate down- and up-stroke samples.',
      'Per-key stereo placement plus a short room reverb.',
      'Pitch variation up to ±20 % and sample rotation, so repeated presses never sound identical.',
      'Tray-first app with launch at login; audio keeps running while the window is hidden.',
      'GitHub Actions tag build publishing NSIS installers for x64 and arm64.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-16',
    changes: [
      'Initial development build: Web Audio engine, key map and settings window.',
      'Four switch profiles wired to the packaged sample folders.',
      'App, tray and installer icons added.',
    ],
  },
];

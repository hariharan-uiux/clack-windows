'use strict';

/**
 * UI preview harness — opens the real renderer with the real samples, but with
 * stubbed IPC and a synthetic key feed instead of the OS hook.
 *
 * Useful for UI work and screenshots on any platform. Not part of the app.
 *   npm run preview
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const profiles = [
  { id: 'japanese-black', name: 'Japanese Black', brand: 'Cherry MX', note: 'Deep, weighty clack' },
  { id: 'oreo', name: 'Oreo', brand: 'Everglide', note: 'Round, poppy thock' },
  { id: 'crystal-purple', name: 'Crystal Purple', brand: 'Everglide', note: 'Bright, glassy tick' },
  { id: 'cardboard', name: 'Cardboard', brand: 'Flurples', note: 'Dry, papery snap' },
];

const settings = {
  enabled: true,
  profile: 'japanese-black',
  volume: 0.72,
  pitchRange: 6,
  stereoWidth: 0.65,
  keyUp: true,
  randomize: true,
  launchAtLogin: false,
};

const state = { version: '1.1.0', settings, profiles, state: { hook: 'running', hookError: null } };
let win;

function sounds() {
  const out = {};
  for (const profile of profiles) {
    const dir = path.join(root, 'sounds', profile.id);
    if (!fs.existsSync(dir)) continue;
    out[profile.id] = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.wav'))
      .map((file) => {
        const buffer = fs.readFileSync(path.join(dir, file));
        return {
          name: file,
          kind: file.includes('-up') ? 'up' : 'down',
          bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        };
      });
  }
  return out;
}

ipcMain.handle('state:get', () => state);
ipcMain.handle('settings:set', (_event, patch) => {
  Object.assign(settings, patch);
  if (win) win.webContents.send('state:changed', state);
  return state;
});
ipcMain.handle('sounds:load', () => sounds());
ipcMain.handle('window:action', () => app.quit());

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 880,
    height: 800,
    frame: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(root, 'dist', 'index.html'));

  const demo = [30, 31, 32, 33, 38, 57, 46, 47, 16, 23, 28, 30];
  let index = 0;
  setInterval(() => {
    const keycode = demo[index % demo.length];
    index += 1;
    win.webContents.send('key:event', { kind: 'down', keycode, at: Date.now() });
    setTimeout(() => win.webContents.send('key:event', { kind: 'up', keycode, at: Date.now() }), 55);
  }, 900);
});

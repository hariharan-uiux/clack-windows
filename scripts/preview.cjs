'use strict';

/**
 * UI preview harness — opens the real renderer with the real samples, but with
 * stubbed IPC and a synthetic key/mouse feed instead of the OS hook.
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
const mouseProfiles = [
  { id: 'tactile', name: 'Tactile', brand: 'Plastic', note: 'Crisp, bright click' },
  { id: 'soft', name: 'Soft', brand: 'Office', note: 'Damped, quiet tick' },
  { id: 'heavy', name: 'Heavy', brand: 'Mechanical', note: 'Deep, weighty thock' },
  { id: 'silent', name: 'Silent', brand: 'Rubber', note: 'Barely there' },
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
  mouseEnabled: true,
  mouseProfile: 'tactile',
  mouseUp: true,
};

const state = {
  version: '1.3.1',
  settings,
  profiles,
  mouseProfiles,
  state: { hook: 'running', hookError: null },
};
let win;

function readPacks(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(dir, entry.name);
    const files = fs.readdirSync(packDir).filter((file) => file.endsWith('.wav'));
    if (!files.length) continue;
    out[entry.name] = files.map((file) => {
      const buffer = fs.readFileSync(path.join(packDir, file));
      return {
        name: file,
        kind: /(^|-)up[-.]/.test(file) ? 'up' : 'down',
        bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      };
    });
  }
  return out;
}

function sounds() {
  return {
    keyboard: readPacks(path.join(root, 'sounds')),
    mouse: readPacks(path.join(root, 'sounds', 'mouse')),
  };
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
    icon: path.join(root, 'build', 'icon.png'),
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(root, 'dist', 'index.html'));

  const demo = [30, 31, 32, 33, 38, 57, 46, 47, 16, 23, 28, 30];
  const buttons = ['LEFT', 'LEFT', 'RIGHT', 'LEFT', 'MIDDLE'];
  let index = 0;
  let clicks = 0;
  setInterval(() => {
    const keycode = demo[index % demo.length];
    index += 1;
    win.webContents.send('key:event', { kind: 'down', keycode, at: Date.now() });
    setTimeout(() => win.webContents.send('key:event', { kind: 'up', keycode, at: Date.now() }), 55);
  }, 900);

  setInterval(() => {
    const position = 0.15 + (clicks % 5) * 0.17;
    const label = buttons[clicks % buttons.length];
    clicks += 1;
    win.webContents.send('mouse:event', { kind: 'down', label, position, at: Date.now() });
    setTimeout(
      () => win.webContents.send('mouse:event', { kind: 'up', label, position, at: Date.now() }),
      70,
    );
  }, 1400);
});

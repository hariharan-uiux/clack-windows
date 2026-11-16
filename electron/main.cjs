'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = Boolean(process.env.CLACK_DEV_SERVER);
const startHidden = process.argv.includes('--hidden');

// Audio must start without a click and stay exact while the window is in the tray.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

/** Switch profiles mirror the sample packs shipped in `sounds/`. */
const PROFILES = [
  { id: 'japanese-black', name: 'Japanese Black', brand: 'Cherry MX', note: 'Deep, weighty clack' },
  { id: 'oreo', name: 'Oreo', brand: 'Everglide', note: 'Round, poppy thock' },
  { id: 'crystal-purple', name: 'Crystal Purple', brand: 'Everglide', note: 'Bright, glassy tick' },
  { id: 'cardboard', name: 'Cardboard', brand: 'Flurples', note: 'Dry, papery snap' },
];

const DEFAULT_SETTINGS = {
  enabled: true,
  profile: 'japanese-black',
  volume: 0.72,
  pitchRange: 6,
  stereoWidth: 0.65,
  keyUp: true,
  randomize: true,
  launchAtLogin: false,
};

const soundsRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'sounds')
  : path.join(__dirname, '..', 'sounds');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

let settings = { ...DEFAULT_SETTINGS };
let state = { hook: 'starting', hookError: null };
let win = null;
let tray = null;
let hook = null;
const pressed = new Set();

/* ---------------------------------------------------------------- settings */

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function sanitize(patch) {
  const next = { ...settings, ...patch };
  next.enabled = Boolean(next.enabled);
  next.profile = PROFILES.some((p) => p.id === next.profile) ? next.profile : DEFAULT_SETTINGS.profile;
  next.volume = clamp(next.volume, 0, 1);
  next.pitchRange = clamp(next.pitchRange, 0, 20);
  next.stereoWidth = clamp(next.stereoWidth, 0, 1);
  next.keyUp = Boolean(next.keyUp);
  next.randomize = Boolean(next.randomize);
  next.launchAtLogin = Boolean(next.launchAtLogin);
  return next;
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = sanitize(raw);
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, file);
}

function applyLoginItem() {
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch {
    /* not fatal, only affects autostart */
  }
}

function snapshot() {
  return { settings, profiles: PROFILES, state };
}

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('state:changed', snapshot());
  rebuildTray();
}

/* ------------------------------------------------------------------- audio */

function listPacks() {
  const out = {};
  for (const profile of PROFILES) {
    const dir = path.join(soundsRoot, profile.id);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav'));
    out[profile.id] = files
      .map((f) => {
        const buffer = fs.readFileSync(path.join(dir, f));
        return {
          name: f,
          kind: f.includes('-up') ? 'up' : 'down',
          bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

/* -------------------------------------------------------------------- hook */

function startHook() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { uIOhook } = require('uiohook-napi');

    uIOhook.on('keydown', (event) => {
      const key = event.keycode;
      if (pressed.has(key)) return; // OS auto-repeat is not a new physical press
      pressed.add(key);
      emitKey('down', key);
    });

    uIOhook.on('keyup', (event) => {
      pressed.delete(event.keycode);
      emitKey('up', event.keycode);
    });

    uIOhook.start();
    hook = uIOhook;
    state = { hook: 'running', hookError: null };
  } catch (error) {
    state = { hook: 'unavailable', hookError: String(error && error.message ? error.message : error) };
    console.error('[clack] global hook failed:', state.hookError);
  }
}

function emitKey(kind, keycode) {
  if (!settings.enabled) return;
  if (kind === 'up' && !settings.keyUp) return;
  if (!win || win.isDestroyed()) return;
  win.webContents.send('key:event', { kind, keycode, at: Date.now() });
}

/* ------------------------------------------------------------------ window */

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    width: Math.min(880, workAreaSize.width - 80),
    height: Math.min(800, workAreaSize.height - 80),
    minWidth: 640,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#09090b',
    title: 'Clack',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL(process.env.CLACK_DEV_SERVER);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => {
    if (startHidden || app.getLoginItemSettings().wasOpenedAtLogin) return;
    win.show();
  });

  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  // Keep audio scheduling exact while the window sits in the tray.
  win.webContents.setBackgroundThrottling(false);
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* -------------------------------------------------------------------- tray */

function rebuildTray() {
  if (!tray) return;

  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray.setImage(process.platform === 'win32' ? icon.resize({ width: 16, height: 16 }) : icon);

  const menu = Menu.buildFromTemplate([
    {
      label: settings.enabled ? 'Clack is on' : 'Clack is off',
      type: 'checkbox',
      checked: settings.enabled,
      click: (item) => update({ enabled: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Switch',
      submenu: PROFILES.map((profile) => ({
        label: `${profile.name} — ${profile.brand}`,
        type: 'radio',
        checked: settings.profile === profile.id,
        click: () => {
          update({ profile: profile.id, enabled: true });
          if (win && !win.isDestroyed()) win.webContents.send('sound:demo');
        },
      })),
    },
    { type: 'separator' },
    { label: 'Settings…', click: showWindow },
    {
      label: 'Volume',
      submenu: [0.25, 0.5, 0.75, 1].map((value) => ({
        label: `${Math.round(value * 100)}%`,
        type: 'radio',
        checked: Math.abs(settings.volume - value) < 0.03,
        click: () => update({ volume: value }),
      })),
    },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      click: (item) => update({ launchAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Quit Clack',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip(settings.enabled ? `Clack — ${PROFILES.find((p) => p.id === settings.profile)?.name ?? ''}` : 'Clack — paused');
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.on('click', () => showWindow());
  rebuildTray();
}

/* --------------------------------------------------------------------- ipc */

function update(patch) {
  settings = sanitize(patch);
  saveSettings();
  if ('launchAtLogin' in patch) applyLoginItem();
  broadcast();
  return snapshot();
}

ipcMain.handle('state:get', () => snapshot());
ipcMain.handle('settings:set', (_event, patch) => update(patch || {}));
ipcMain.handle('sounds:load', () => listPacks());
ipcMain.handle('window:action', (_event, action) => {
  if (!win) return;
  if (action === 'hide') win.hide();
  else if (action === 'minimize') win.minimize();
  else if (action === 'close') {
    app.isQuitting = true;
    app.quit();
  }
});

/* ------------------------------------------------------------------- boot */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    loadSettings();
    applyLoginItem();
    createWindow();
    createTray();
    startHook();
    broadcast();
  });

  // Tray app: an empty handler keeps Electron from quitting with no windows.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    app.isQuitting = true;
    try {
      if (hook) hook.stop();
    } catch {
      /* ignore */
    }
  });

  app.on('activate', () => showWindow());
}

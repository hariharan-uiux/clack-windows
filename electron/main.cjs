'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
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
  { id: 'holy-panda', name: 'Holy Panda', brand: 'Drop + Invyr', note: 'Tactile, deep poppy thock' },
  { id: 'cherry-blue', name: 'Cherry Blue', brand: 'Cherry MX', note: 'Crisp, sharp clicky snap' },
  { id: 'buckling-spring', name: 'Buckling Spring', brand: 'IBM Model M', note: 'Metallic ping & heavy clack' },
  { id: 'topre', name: 'Topre 45g', brand: 'Topre', note: 'Electro-capacitive quiet thud' },
  { id: 'oreo', name: 'Oreo', brand: 'Everglide', note: 'Round, poppy thock' },
  { id: 'crystal-purple', name: 'Crystal Purple', brand: 'Everglide', note: 'Bright, glassy tick' },
  { id: 'cardboard', name: 'Cardboard', brand: 'Flurples', note: 'Dry, papery snap' },
];

/** Mouse packs live in `sounds/mouse/<id>/`. */
const MOUSE_PROFILES = [
  { id: 'tactile', name: 'Tactile', brand: 'Plastic', note: 'Crisp, bright click' },
  { id: 'soft', name: 'Soft', brand: 'Office', note: 'Damped, quiet tick' },
  { id: 'heavy', name: 'Heavy', brand: 'Mechanical', note: 'Deep, weighty thock' },
  { id: 'silent', name: 'Silent', brand: 'Rubber', note: 'Barely there' },
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
  mouseEnabled: true,
  mouseProfile: 'tactile',
  mouseUp: true,
  mouseWheel: true,
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
  next.mouseProfile = MOUSE_PROFILES.some((p) => p.id === next.mouseProfile)
    ? next.mouseProfile
    : DEFAULT_SETTINGS.mouseProfile;
  next.volume = clamp(next.volume, 0, 1);
  next.pitchRange = clamp(next.pitchRange, 0, 20);
  next.stereoWidth = clamp(next.stereoWidth, 0, 1);
  next.keyUp = Boolean(next.keyUp);
  next.randomize = Boolean(next.randomize);
  next.launchAtLogin = Boolean(next.launchAtLogin);
  next.mouseEnabled = Boolean(next.mouseEnabled);
  next.mouseUp = Boolean(next.mouseUp);
  next.mouseWheel = Boolean(next.mouseWheel ?? DEFAULT_SETTINGS.mouseWheel);
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
  return { version: app.getVersion(), settings, profiles: PROFILES, mouseProfiles: MOUSE_PROFILES, state };
}

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('state:changed', snapshot());
  rebuildTray();
}

/* ------------------------------------------------------------------- audio */

function readPacks(root) {
  const out = {};
  if (!fs.existsSync(root)) return out;
  for (const id of fs.readdirSync(root, { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    const dir = path.join(root, id.name);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav'));
    if (!files.length) continue;
    out[id.name] = files
      .map((f) => {
        const buffer = fs.readFileSync(path.join(dir, f));
        return {
          name: f,
          kind: /(^|-)up[-.]/.test(f) ? 'up' : 'down',
          bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

function listPacks() {
  return {
    keyboard: readPacks(soundsRoot),
    mouse: readPacks(path.join(soundsRoot, 'mouse')),
  };
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

    uIOhook.on('mousedown', (event) => emitMouse('down', event));
    uIOhook.on('mouseup', (event) => emitMouse('up', event));
    uIOhook.on('wheel', (event) => emitWheel(event));

    uIOhook.start();
    hook = uIOhook;
    state = { hook: 'running', hookError: null };
  } catch (error) {
    state = { hook: 'unavailable', hookError: String(error && error.message ? error.message : error) };
    console.error('[clack] global hook failed:', state.hookError);
  }
}

/** libuiohook button numbers: 1 left, 2 right, 3 middle. Others are ignored. */
const MOUSE_BUTTONS = { 1: 'LEFT', 2: 'RIGHT', 3: 'MIDDLE' };

function emitKey(kind, keycode) {
  if (!settings.enabled) return;
  if (kind === 'up' && !settings.keyUp) return;
  if (!win || win.isDestroyed()) return;
  win.webContents.send('key:event', { kind, keycode, at: Date.now() });
}

function emitMouse(kind, event) {
  if (!settings.enabled || !settings.mouseEnabled) return;
  if (kind === 'up' && !settings.mouseUp) return;
  const label = MOUSE_BUTTONS[event.button];
  if (!label) return;
  if (!win || win.isDestroyed()) return;

  // Cursor x across the primary display drives stereo placement, the same way
  // a key's position on the board does for typing.
  const { bounds } = screen.getPrimaryDisplay();
  const position = bounds.width > 0 ? Math.min(1, Math.max(0, (event.x - bounds.x) / bounds.width)) : 0.5;

  win.webContents.send('mouse:event', { kind, label, position, at: Date.now() });
}

function emitWheel(event) {
  if (!settings.enabled || !settings.mouseEnabled || !settings.mouseWheel) return;
  if (!win || win.isDestroyed()) return;

  const { bounds } = screen.getPrimaryDisplay();
  const position = bounds.width > 0 ? Math.min(1, Math.max(0, (event.x - bounds.x) / bounds.width)) : 0.5;
  const direction = event.rotation < 0 ? 'up' : 'down';

  win.webContents.send('mouse:wheel', { direction, position, at: Date.now() });
}

/* ------------------------------------------------------------------ window */

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    width: Math.min(840, workAreaSize.width - 80),
    height: Math.min(670, workAreaSize.height - 80),
    minWidth: 640,
    minHeight: 520,
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

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

/** Minimize to the taskbar. A hidden window is shown first so a taskbar button exists. */
function minimizeWindow() {
  if (!win) return createWindow();
  if (!win.isVisible()) win.show();
  win.minimize();
}

function hideWindow() {
  if (win && !win.isDestroyed()) win.hide();
}

function quitApp() {
  app.isQuitting = true;
  app.quit();
}

/* -------------------------------------------------------------------- tray */

function rebuildTray() {
  if (!tray) return;

  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray.setImage(process.platform === 'win32' ? icon.resize({ width: 16, height: 16 }) : icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Open Clack', default: true, click: showWindow },
    { label: 'Minimize to taskbar', click: minimizeWindow },
    { label: 'Hide to tray', click: hideWindow },
    { type: 'separator' },
    {
      label: settings.enabled ? 'Clack is on' : 'Clack is off',
      type: 'checkbox',
      checked: settings.enabled,
      click: (item) => update({ enabled: item.checked }),
    },
    {
      label: 'Mouse clicks',
      type: 'checkbox',
      checked: settings.mouseEnabled,
      click: (item) => update({ mouseEnabled: item.checked }),
    },
    {
      label: 'Scroll wheel sounds',
      type: 'checkbox',
      checked: settings.mouseWheel,
      click: (item) => update({ mouseWheel: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Keyboard switch',
      submenu: PROFILES.map((profile) => ({
        label: `${profile.name} — ${profile.brand}`,
        type: 'radio',
        checked: settings.profile === profile.id,
        click: () => {
          update({ profile: profile.id, enabled: true });
          if (win && !win.isDestroyed()) win.webContents.send('sound:demo', { profile: profile.id });
        },
      })),
    },
    {
      label: 'Mouse switch',
      submenu: MOUSE_PROFILES.map((profile) => ({
        label: `${profile.name} — ${profile.brand}`,
        type: 'radio',
        checked: settings.mouseProfile === profile.id,
        click: () => {
          update({ mouseProfile: profile.id, mouseEnabled: true, enabled: true });
          if (win && !win.isDestroyed()) win.webContents.send('sound:demo', { profile: profile.id });
        },
      })),
    },
    { type: 'separator' },
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
      click: quitApp,
    },
  ]);

  tray.setToolTip(
    settings.enabled
      ? `Clack — ${PROFILES.find((p) => p.id === settings.profile)?.name ?? ''}`
      : 'Clack — paused',
  );
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
  if (action === 'hide') hideWindow();
  else if (action === 'minimize') minimizeWindow();
  else if (action === 'close') quitApp();
});
ipcMain.handle('open:external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
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

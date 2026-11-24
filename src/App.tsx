import { useEffect, useRef, useState } from 'react';
import { ClackEngine } from './audio';
import { RELEASES } from './changelog';
import { domCodeToKeycode, keyName, keyPosition } from './keymap';
import type { AppState, Profile, Settings } from './types';
import './styles.css';

type Tab = 'keyboard' | 'mouse';

interface FeedItem {
  id: number;
  label: string;
  pan: number;
  source: Tab;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`control${props.disabled ? ' is-disabled' : ''}`}>
      <span className="control-row">
        <span className="control-label">{props.label}</span>
        <span className="control-value">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle(props: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle${props.on ? ' is-on' : ''}`}
      onClick={() => props.onChange(!props.on)}
      aria-pressed={props.on}
    >
      <span className="toggle-text">
        <span className="toggle-label">{props.label}</span>
        <span className="toggle-hint">{props.hint}</span>
      </span>
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}

function ProfileCard(props: { profile: Profile; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`profile${props.active ? ' is-active' : ''}`}
      onClick={props.onSelect}
    >
      <span className="profile-top">
        <span className="profile-name">{props.profile.name}</span>
        {props.active && <span className="badge">ACTIVE</span>}
      </span>
      <span className="profile-brand">{props.profile.brand}</span>
      <span className="profile-note">{props.profile.note}</span>
      <span className="bars" aria-hidden="true">
        {[3, 6, 9, 12, 9, 6, 4].map((height, index) => (
          <span key={index} style={{ height: `${height}px` }} />
        ))}
      </span>
    </button>
  );
}

function KeyboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
      <rect x="1" y="4" width="14" height="8" />
      <path d="M3.5 6.5h.01M6 6.5h.01M8.5 6.5h.01M11 6.5h.01M5 9.5h6" strokeLinecap="round" />
    </svg>
  );
}

function MouseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
      <rect x="4.5" y="1.5" width="7" height="13" rx="3.5" />
      <path d="M8 1.5v4.5" />
    </svg>
  );
}

function VersionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
      <path d="M2.5 8.5L8.5 2.5H13.5V7.5L7.5 13.5L2.5 8.5Z" strokeLinejoin="round" />
      <circle cx="10.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/hariofficial';

function CoffeeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" strokeLinecap="round" />
      <line x1="10" y1="1" x2="10" y2="4" strokeLinecap="round" />
      <line x1="14" y1="1" x2="14" y2="4" strokeLinecap="round" />
    </svg>
  );
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [samples, setSamples] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [tab, setTab] = useState<Tab>('keyboard');
  const engineRef = useRef<ClackEngine | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const feedId = useRef(0);
  const engineSettingsRef = useRef<Settings | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribeKey: (() => void) | undefined;
    let unsubscribeMouse: (() => void) | undefined;
    let unsubscribeWheel: (() => void) | undefined;
    let unsubscribeState: (() => void) | undefined;
    let unsubscribeDemo: (() => void) | undefined;

    (async () => {
      const initial = await window.clack.getState();
      if (disposed) return;
      setState(initial);

      const engine = new ClackEngine(initial.settings);
      engineRef.current = engine;
      const library = await window.clack.loadSounds();
      await engine.load(library);
      if (disposed) return;
      setEngineError(engine.error);
      setSamples(engine.sampleCount);

      // Warm up the graph and the OS audio device so the first key is instant.
      await engine.resume();

      const pushFeed = (item: FeedItem) => {
        setFeed((current) => [item, ...current].slice(0, 14));
      };

      unsubscribeKey = window.clack.onKey((event) => {
        const current = engineSettingsRef.current;
        if (!current) return;
        engine.play(event.kind, current.profile, keyPosition(event.keycode));
        if (event.kind === 'up') return;
        feedId.current += 1;
        pushFeed({
          id: feedId.current,
          label: keyName(event.keycode),
          pan: keyPosition(event.keycode),
          source: 'keyboard',
        });
      });

      unsubscribeMouse = window.clack.onMouse((event) => {
        const current = engineSettingsRef.current;
        if (!current) return;
        engine.play(event.kind, current.mouseProfile, event.position);
        if (event.kind === 'up') return;
        feedId.current += 1;
        pushFeed({ id: feedId.current, label: event.label, pan: event.position, source: 'mouse' });
      });

      unsubscribeWheel = window.clack.onWheel((event) => {
        const current = engineSettingsRef.current;
        if (!current || !current.enabled || !current.mouseEnabled || !current.mouseWheel) return;
        engine.playWheel(event.direction, event.position);
        feedId.current += 1;
        pushFeed({
          id: feedId.current,
          label: event.direction === 'up' ? '▲ Wheel' : '▼ Wheel',
          pan: event.position,
          source: 'mouse',
        });
      });

      unsubscribeState = window.clack.onState((next) => {
        setState(next);
        engine.setSettings(next.settings);
        if (next.settings.enabled) void engine.resume();
      });

      unsubscribeDemo = window.clack.onDemo((payload) => {
        const profile = payload.profile ?? engineSettingsRef.current?.profile ?? initial.settings.profile;
        engine.preview(profile);
      });
    })();

    return () => {
      disposed = true;
      unsubscribeKey?.();
      unsubscribeMouse?.();
      unsubscribeWheel?.();
      unsubscribeState?.();
      unsubscribeDemo?.();
    };
  }, []);

  if (state) engineSettingsRef.current = state.settings;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const level = engineRef.current?.level() ?? 0;
      if (meterRef.current) {
        meterRef.current.style.transform = `scaleX(${Math.max(0.02, Math.min(1, level))})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // When the global OS input hook is unavailable, fall back to in-window DOM events
    // so keystrokes and mouse clicks inside the focused Clack window still produce sound.
    if (state?.state.hook === 'running') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const current = engineSettingsRef.current;
      if (!current || !current.enabled || e.repeat) return;
      const keycode = domCodeToKeycode(e.code);
      engineRef.current?.play('down', current.profile, keyPosition(keycode));
      feedId.current += 1;
      setFeed((prev) => [
        {
          id: feedId.current,
          label: keyName(keycode),
          pan: keyPosition(keycode),
          source: 'keyboard' as const,
        },
        ...prev,
      ].slice(0, 14));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const current = engineSettingsRef.current;
      if (!current || !current.enabled || !current.keyUp) return;
      const keycode = domCodeToKeycode(e.code);
      engineRef.current?.play('up', current.profile, keyPosition(keycode));
    };

    const handleMouseDown = (e: MouseEvent) => {
      const current = engineSettingsRef.current;
      if (!current || !current.enabled || !current.mouseEnabled) return;
      const buttons: Record<number, string> = { 0: 'LEFT', 1: 'MIDDLE', 2: 'RIGHT' };
      const label = buttons[e.button];
      if (!label) return;
      const position = window.innerWidth > 0 ? Math.max(0, Math.min(1, e.clientX / window.innerWidth)) : 0.5;
      engineRef.current?.play('down', current.mouseProfile, position);
      feedId.current += 1;
      setFeed((prev) => [
        {
          id: feedId.current,
          label,
          pan: position,
          source: 'mouse' as const,
        },
        ...prev,
      ].slice(0, 14));
    };

    const handleMouseUp = (e: MouseEvent) => {
      const current = engineSettingsRef.current;
      if (!current || !current.enabled || !current.mouseEnabled || !current.mouseUp) return;
      const buttons: Record<number, string> = { 0: 'LEFT', 1: 'MIDDLE', 2: 'RIGHT' };
      const label = buttons[e.button];
      if (!label) return;
      const position = window.innerWidth > 0 ? Math.max(0, Math.min(1, e.clientX / window.innerWidth)) : 0.5;
      engineRef.current?.play('up', current.mouseProfile, position);
    };

    const handleWheel = (e: WheelEvent) => {
      const current = engineSettingsRef.current;
      if (!current || !current.enabled || !current.mouseEnabled || !current.mouseWheel) return;
      const position = window.innerWidth > 0 ? Math.max(0, Math.min(1, e.clientX / window.innerWidth)) : 0.5;
      const direction = e.deltaY < 0 ? 'up' : 'down';
      engineRef.current?.playWheel(direction, position);
      feedId.current += 1;
      setFeed((prev) => [
        {
          id: feedId.current,
          label: direction === 'up' ? '▲ Wheel' : '▼ Wheel',
          pan: position,
          source: 'mouse' as const,
        },
        ...prev,
      ].slice(0, 14));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [state?.state.hook]);

  useEffect(() => {
    if (!showVersions) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) {
        setShowVersions(false);
        return;
      }
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        dockRef.current &&
        !dockRef.current.contains(target)
      ) {
        setShowVersions(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowVersions(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showVersions]);

  async function patch(next: Partial<Settings>) {
    if (!state) return;
    const optimistic = { ...state, settings: { ...state.settings, ...next } };
    setState(optimistic);
    engineRef.current?.setSettings(optimistic.settings);
    const confirmed = await window.clack.setSettings(next);
    setState(confirmed);
    engineRef.current?.setSettings(confirmed.settings);
  }

  if (!state) {
    return (
      <div className="boot">
        <span className="boot-mark" />
        <span>Loading switch samples…</span>
      </div>
    );
  }

  const { settings, profiles, mouseProfiles, state: hook } = state;
  const hookOk = hook.hook === 'running';
  const enabled = settings.enabled && hookOk;

  const installedListed = RELEASES.some((item) => item.version === state.version);
  const activeVersion = selectedVersion ?? (installedListed ? state.version : RELEASES[0].version);
  const release = RELEASES.find((item) => item.version === activeVersion) ?? RELEASES[0];

  const keyboardTab = tab === 'keyboard';
  const shownProfiles = keyboardTab ? profiles : mouseProfiles;
  const activeProfile = keyboardTab ? settings.profile : settings.mouseProfile;

  async function selectProfile(id: string) {
    if (!state) return;
    if (keyboardTab) await patch({ profile: id, enabled: true });
    else await patch({ mouseProfile: id, mouseEnabled: true, enabled: true });
    engineRef.current?.preview(id);
  }

  /** Bring the panel that just changed into view, without moving a page that already shows it. */
  function changeTab(next: Tab) {
    setTab(next);
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <img src="./icon.png" alt="Clack" className="brand-icon" />
          <span className={`dot${enabled ? ' is-live' : ''}`} />
          <span className="brand-name">CLACK</span>
          <span className="brand-sub">keyboard + mouse audio</span>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="coffee-btn"
            onClick={() => {
              if (window.clack?.openExternal) {
                window.clack.openExternal(BUY_ME_A_COFFEE_URL);
              } else {
                window.open(BUY_ME_A_COFFEE_URL, '_blank', 'noopener,noreferrer');
              }
            }}
            title="Buy Me a Coffee (https://buymeacoffee.com/hariofficial)"
            aria-label="Buy Me a Coffee"
          >
            <CoffeeIcon />
            <span>Buy Me a Coffee</span>
          </button>

          <div className="topbar-toggle" ref={dockRef} role="tablist" aria-label="Audio target and release">
            <button
              type="button"
              role="tab"
              id="tab-keyboard"
              aria-selected={keyboardTab && !showVersions}
              aria-controls="panel-keyboard"
              className={`topbar-tab${keyboardTab && !showVersions ? ' is-active' : ''}`}
              onClick={() => {
                setShowVersions(false);
                changeTab('keyboard');
              }}
              title="Keyboard Sound"
              aria-label="Keyboard Sound"
            >
              <KeyboardIcon />
            </button>
            <button
              type="button"
              role="tab"
              id="tab-mouse"
              aria-selected={!keyboardTab && !showVersions}
              aria-controls="panel-mouse"
              className={`topbar-tab${!keyboardTab && !showVersions ? ' is-active' : ''}`}
              onClick={() => {
                setShowVersions(false);
                changeTab('mouse');
              }}
              title="Mouse Sound"
              aria-label="Mouse Sound"
            >
              <MouseIcon />
            </button>
            <button
              type="button"
              role="tab"
              id="tab-versions"
              aria-selected={showVersions}
              aria-expanded={showVersions}
              className={`topbar-tab${showVersions ? ' is-active' : ''}`}
              onClick={() => setShowVersions((prev) => !prev)}
              title={`Release Notes (v${state.version})`}
              aria-label={`Release Notes (v${state.version})`}
            >
              <VersionIcon />
            </button>
          </div>

          <div className="window-actions">
            <button
              type="button"
              onClick={() => window.clack.windowAction('minimize')}
              aria-label="Minimize to taskbar"
              title="Minimize to taskbar"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => window.clack.windowAction('hide')}
              aria-label="Hide to tray"
              title="Hide to tray"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M5 1v5" />
                <path d="M2.5 4L5 6.5 7.5 4" />
                <path d="M1 8.5h8" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => window.clack.windowAction('close')}
              aria-label="Quit Clack"
              title="Quit Clack"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {showVersions && (
        <div
          className="dock-backdrop"
          onClick={() => setShowVersions(false)}
          aria-hidden="true"
        />
      )}

      {showVersions && (
        <div
          className="topbar-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="Release notes"
        >
          <div className="topbar-popover-head">
            <div className="topbar-popover-title">
              <VersionIcon />
              <span>RELEASE NOTES</span>
              <span className="badge">v{state.version}</span>
            </div>
            <button
              type="button"
              className="topbar-popover-close"
              onClick={() => setShowVersions(false)}
              aria-label="Close release notes"
              title="Close release notes"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
          <div className="versions">
            <div className="version-picker" role="tablist" aria-label="Releases">
              {RELEASES.map((item) => (
                <button
                  key={item.version}
                  type="button"
                  role="tab"
                  aria-selected={item.version === release.version}
                  className={`version-tab${item.version === release.version ? ' is-active' : ''}`}
                  onClick={() => setSelectedVersion(item.version)}
                >
                  <span className="version-number">v{item.version}</span>
                  <span className="version-date">{item.date ?? 'Unreleased'}</span>
                </button>
              ))}
            </div>
            <div className="version-body" role="tabpanel" aria-label={`Changes in Clack ${release.version}`}>
              <div className="version-title">
                <span>Clack {release.version}</span>
                {release.version === state.version && <span className="badge">RUNNING</span>}
              </div>
              <ul className="changes">
                {release.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <main>
        <section className={`status${enabled ? ' is-live' : ''}`}>
          <div>
            <div className="eyebrow">GLOBAL INPUT CAPTURE</div>
            <div className="status-title">
              {!settings.enabled ? 'Paused' : hookOk ? 'Listening' : 'Hook offline'}
            </div>
            <div className="status-meta">
              {hook.hook === 'running'
                ? `${profiles.length} switch profiles · ${mouseProfiles.length} mouse packs · ${
                    settings.mouseEnabled ? 'keys and clicks' : 'keys only'
                  } · low-level hooks active in every app`
                : 'Global input hook unavailable — sound plays only while this window has focus.'}
            </div>
          </div>
          <button
            type="button"
            className={`power${enabled ? ' is-on' : ''}`}
            onClick={() => {
              void engineRef.current?.resume();
              void patch({ enabled: !settings.enabled });
            }}
          >
            <span className="power-ring" />
            <span>{settings.enabled ? 'ON' : 'OFF'}</span>
          </button>
        </section>

        {(engineError || !hookOk) && (
          <div className="notice">
            {engineError ?? `Global input hook could not start. ${hook.hookError ?? ''}`}
          </div>
        )}

        <section
          className="panel"
          ref={panelRef}
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          <div className="panel-head">
            <span>{keyboardTab ? 'KEYBOARD SOUND' : 'MOUSE SOUND'}</span>
            <span className="panel-note">
              {keyboardTab ? 'click a switch to audition' : 'click a pack to audition'}
            </span>
          </div>
          <div className="profiles">
            {shownProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                active={activeProfile === profile.id}
                onSelect={() => void selectProfile(profile.id)}
              />
            ))}
          </div>
          <div className="toggles tab-toggles">
            {keyboardTab ? (
              <Toggle
                label="Key release"
                hint="Separate up-stroke sound"
                on={settings.keyUp}
                onChange={(keyUp) => void patch({ keyUp })}
              />
            ) : (
              <>
                <Toggle
                  label="Mouse clicks"
                  hint="Sound on every left, right and middle click"
                  on={settings.mouseEnabled}
                  onChange={(mouseEnabled) => void patch({ mouseEnabled })}
                />
                <Toggle
                  label="Button release"
                  hint="Separate up-stroke click"
                  on={settings.mouseUp}
                  onChange={(mouseUp) => void patch({ mouseUp })}
                />
                <Toggle
                  label="Scroll wheel"
                  hint="Ratchet audio on wheel rotation"
                  on={settings.mouseWheel}
                  onChange={(mouseWheel) => void patch({ mouseWheel })}
                />
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span>SHARED FEEL</span>
            <span className="panel-note">applies to keyboard and mouse</span>
          </div>
          <div className="controls">
            <Slider
              label="Volume"
              value={settings.volume}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(settings.volume * 100)}%`}
              onChange={(volume) => void patch({ volume })}
            />
            <Slider
              label="Pitch variation"
              value={settings.pitchRange}
              min={0}
              max={20}
              step={1}
              display={`±${settings.pitchRange}%`}
              onChange={(pitchRange) => void patch({ pitchRange })}
            />
            <Slider
              label="Stereo width"
              value={settings.stereoWidth}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(settings.stereoWidth * 100)}%`}
              onChange={(stereoWidth) => void patch({ stereoWidth })}
            />
            <div className="toggles">
              <Toggle
                label="Sample rotation"
                hint="Cycle presses through every recording"
                on={settings.randomize}
                onChange={(randomize) => void patch({ randomize })}
              />
              <Toggle
                label="Launch at login"
                hint="Starts hidden in the tray"
                on={settings.launchAtLogin}
                onChange={(launchAtLogin) => void patch({ launchAtLogin })}
              />
            </div>
          </div>
        </section>

        <section className="panel live">
          <div className="panel-head">
            <span>LIVE FEED</span>
            <span className="meter">
              <span className="meter-fill" ref={meterRef} />
            </span>
          </div>
          <div className="feed">
            {feed.length === 0 ? (
              <span className="feed-empty">
                Type or click anywhere — keys and clicks appear here with their stereo position.
              </span>
            ) : (
              feed.map((item) => (
                <span key={item.id} className={`key-chip${item.source === 'mouse' ? ' is-mouse' : ''}`}>
                  <span className="key-label">{item.label}</span>
                  <span className="key-pan">
                    <span className="pan-track">
                      <span className="pan-mark" style={{ left: `${item.pan * 100}%` }} />
                    </span>
                  </span>
                </span>
              ))
            )}
          </div>
        </section>
      </main>

      <footer>
        <span>{samples} samples</span>
        <span>
          {profiles.length} switches · {mouseProfiles.length} mouse packs
        </span>
        <span>low latency · spatial</span>
      </footer>
    </div>
  );
}

export default App;

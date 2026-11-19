import { useEffect, useRef, useState } from 'react';
import { ClackEngine } from './audio';
import { RELEASES } from './changelog';
import { keyName, keyPosition } from './keymap';
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

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [samples, setSamples] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('keyboard');
  const engineRef = useRef<ClackEngine | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const feedId = useRef(0);
  const engineSettingsRef = useRef<Settings | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribeKey: (() => void) | undefined;
    let unsubscribeMouse: (() => void) | undefined;
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
    else await patch({ mouseProfile: id, mouseEnabled: true });
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
          <span className={`dot${enabled ? ' is-live' : ''}`} />
          <span className="brand-name">CLACK</span>
          <span className="brand-sub">keyboard + mouse audio</span>
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
      </header>

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

        <section className="panel">
          <div className="panel-head">
            <span>VERSIONS</span>
            <span className="panel-note">pick a release to see what changed</span>
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
        </section>
      </main>

      <div className="dock" role="tablist" aria-label="Sound settings target">
        <button
          type="button"
          role="tab"
          id="tab-keyboard"
          aria-selected={keyboardTab}
          aria-controls="panel-keyboard"
          className={`dock-tab${keyboardTab ? ' is-active' : ''}`}
          onClick={() => changeTab('keyboard')}
        >
          <KeyboardIcon />
          <span>Keyboard</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-mouse"
          aria-selected={!keyboardTab}
          aria-controls="panel-mouse"
          className={`dock-tab${!keyboardTab ? ' is-active' : ''}`}
          onClick={() => changeTab('mouse')}
        >
          <MouseIcon />
          <span>Mouse</span>
        </button>
      </div>

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

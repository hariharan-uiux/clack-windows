import { useEffect, useRef, useState } from 'react';
import { ClackEngine } from './audio';
import { RELEASES } from './changelog';
import { keyName, keyPosition } from './keymap';
import type { AppState, Settings } from './types';
import './styles.css';

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

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [feed, setFeed] = useState<{ id: number; label: string; kind: 'down' | 'up'; pan: number }[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [samples, setSamples] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const engineRef = useRef<ClackEngine | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const feedId = useRef(0);

  useEffect(() => {
    let disposed = false;
    let unsubscribeKey: (() => void) | undefined;
    let unsubscribeState: (() => void) | undefined;
    let unsubscribeDemo: (() => void) | undefined;

    (async () => {
      const initial = await window.clack.getState();
      if (disposed) return;
      setState(initial);

      const engine = new ClackEngine(initial.settings);
      engineRef.current = engine;
      const packs = await window.clack.loadSounds();
      await engine.load(packs);
      if (disposed) return;
      setEngineError(engine.error);
      setSamples(engine.sampleCount);

      // Warm up the graph and the OS audio device so the first key is instant.
      await engine.resume();

      unsubscribeKey = window.clack.onKey((event) => {
        engine.play(event.kind, event.keycode);
        if (event.kind === 'up') return;
        feedId.current += 1;

        setFeed((current) =>
          [
            { id: feedId.current, label: keyName(event.keycode), kind: event.kind, pan: keyPosition(event.keycode) },
            ...current,
          ].slice(0, 14),
        );
      });

      unsubscribeState = window.clack.onState((next) => {
        setState(next);
        engine.setSettings(next.settings);
        if (next.settings.enabled) void engine.resume();
      });

      unsubscribeDemo = window.clack.onDemo(() => {
        const profile = engineSettingsRef.current?.profile ?? initial.settings.profile;
        engine.preview(profile);
      });
    })();

    return () => {
      disposed = true;
      unsubscribeKey?.();
      unsubscribeState?.();
      unsubscribeDemo?.();
    };
  }, []);

  const engineSettingsRef = useRef<Settings | null>(null);
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

  const { settings, profiles, state: hook } = state;
  const hookOk = hook.hook === 'running';
  const enabled = settings.enabled && hookOk;

  const installedListed = RELEASES.some((item) => item.version === state.version);
  const activeVersion = selectedVersion ?? (installedListed ? state.version : RELEASES[0].version);
  const release = RELEASES.find((item) => item.version === activeVersion) ?? RELEASES[0];

  async function selectProfile(id: string) {
    if (!state) return;
    await patch({ profile: id, enabled: true });
    engineRef.current?.preview(id);
  }

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className={`dot${enabled ? ' is-live' : ''}`} />
          <span className="brand-name">CLACK</span>
          <span className="brand-sub">mechanical keyboard audio</span>
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
            <div className="eyebrow">GLOBAL KEY CAPTURE</div>
            <div className="status-title">
              {!settings.enabled ? 'Paused' : hookOk ? 'Listening' : 'Hook offline'}
            </div>
            <div className="status-meta">
              {hook.hook === 'running'
                ? `${profiles.length} switch profiles loaded · low-level hook active in every app`
                : 'Global key hook unavailable — sound plays only while this window has focus.'}
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
            {engineError ?? `Global key hook could not start. ${hook.hookError ?? ''}`}
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <span>SWITCH PROFILE</span>
            <span className="panel-note">click to audition</span>
          </div>
          <div className="profiles">
            {profiles.map((profile) => {
              const active = settings.profile === profile.id;
              return (
                <button
                  type="button"
                  key={profile.id}
                  className={`profile${active ? ' is-active' : ''}`}
                  onClick={() => void selectProfile(profile.id)}
                >
                  <span className="profile-top">
                    <span className="profile-name">{profile.name}</span>
                    {active && <span className="badge">ACTIVE</span>}
                  </span>
                  <span className="profile-brand">{profile.brand}</span>
                  <span className="profile-note">{profile.note}</span>
                  <span className="bars" aria-hidden="true">
                    {[3, 6, 9, 12, 9, 6, 4].map((height, index) => (
                      <span key={index} style={{ height: `${height}px` }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span>FEEL</span>
            <span className="panel-note">changes apply instantly</span>
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
                label="Key release"
                hint="Separate up-stroke sound"
                on={settings.keyUp}
                onChange={(keyUp) => void patch({ keyUp })}
              />
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
              <span className="feed-empty">Type anywhere — keys appear here with their stereo position.</span>
            ) : (
              feed.map((item) => (
                <span key={item.id} className="key-chip">
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

      <footer>
        <span>{samples} samples</span>
        <span>{Object.keys(profiles).length} switches</span>
        <span>48 kHz · 16-bit · spatial</span>
      </footer>
    </div>
  );
}

export default App;

export interface Settings {
  enabled: boolean;
  profile: string;
  volume: number;
  pitchRange: number;
  stereoWidth: number;
  keyUp: boolean;
  randomize: boolean;
  launchAtLogin: boolean;
  /** Mouse clicks have their own on/off switch and pack, but share the feel settings. */
  mouseEnabled: boolean;
  mouseProfile: string;
  mouseUp: boolean;
  mouseWheel: boolean;
}

export interface Profile {
  id: string;
  name: string;
  brand: string;
  note: string;
}

export interface HookState {
  hook: 'starting' | 'running' | 'unavailable';
  hookError: string | null;
}

export interface AppState {
  version: string;
  settings: Settings;
  profiles: Profile[];
  mouseProfiles: Profile[];
  state: HookState;
}

export interface SoundFile {
  name: string;
  kind: 'down' | 'up';
  bytes: ArrayBuffer;
}

export type SoundPacks = Record<string, SoundFile[]>;

/** Keyboard and mouse packs are shipped separately. */
export interface SoundLibrary {
  keyboard: SoundPacks;
  mouse: SoundPacks;
}

export interface KeyEvent {
  kind: 'down' | 'up';
  keycode: number;
  at: number;
}

export interface MouseEvent {
  kind: 'down' | 'up';
  /** LEFT, RIGHT or MIDDLE. */
  label: string;
  /** Cursor position across the display, 0 = far left, 1 = far right. */
  position: number;
  at: number;
}

export interface WheelEvent {
  direction: 'up' | 'down';
  position: number;
  at: number;
}

export interface ClackApi {
  getState(): Promise<AppState>;
  setSettings(patch: Partial<Settings>): Promise<AppState>;
  loadSounds(): Promise<SoundLibrary>;
  windowAction(action: 'hide' | 'minimize' | 'close'): Promise<void>;
  openExternal(url: string): Promise<void>;
  onKey(callback: (event: KeyEvent) => void): () => void;
  onMouse(callback: (event: MouseEvent) => void): () => void;
  onWheel(callback: (event: WheelEvent) => void): () => void;
  onState(callback: (state: AppState) => void): () => void;
  onDemo(callback: (payload: { profile?: string }) => void): () => void;
}

declare global {
  interface Window {
    clack: ClackApi;
  }
}

export interface Settings {
  enabled: boolean;
  profile: string;
  volume: number;
  pitchRange: number;
  stereoWidth: number;
  keyUp: boolean;
  randomize: boolean;
  launchAtLogin: boolean;
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
  settings: Settings;
  profiles: Profile[];
  state: HookState;
}

export interface SoundFile {
  name: string;
  kind: 'down' | 'up';
  bytes: ArrayBuffer;
}

export type SoundPacks = Record<string, SoundFile[]>;

export interface KeyEvent {
  kind: 'down' | 'up';
  keycode: number;
  at: number;
}

export interface ClackApi {
  getState(): Promise<AppState>;
  setSettings(patch: Partial<Settings>): Promise<AppState>;
  loadSounds(): Promise<SoundPacks>;
  windowAction(action: 'hide' | 'minimize' | 'close'): Promise<void>;
  onKey(callback: (event: KeyEvent) => void): () => void;
  onState(callback: (state: AppState) => void): () => void;
  onDemo(callback: () => void): () => void;
}

declare global {
  interface Window {
    clack: ClackApi;
  }
}

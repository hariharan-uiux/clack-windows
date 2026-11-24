/**
 * uiohook keycode -> horizontal keyboard position (0 = far left, 1 = far right).
 * Positions drive spatial panning, so a left-hand key sits left in the stereo field.
 * Unknown keys fall back to the centre.
 */
const POSITIONS: Record<number, number> = {
  // number row
  41: 0.03, 2: 0.1, 3: 0.16, 4: 0.22, 5: 0.28, 6: 0.34, 7: 0.4, 8: 0.46, 9: 0.52, 10: 0.58, 11: 0.64, 12: 0.7, 13: 0.76,
  // qwerty row
  16: 0.05, 17: 0.11, 18: 0.18, 19: 0.24, 20: 0.3, 21: 0.37, 22: 0.43, 23: 0.5, 24: 0.56, 25: 0.62, 26: 0.68, 27: 0.74, 43: 0.8,
  // home row
  30: 0.06, 31: 0.12, 32: 0.19, 33: 0.25, 34: 0.31, 35: 0.38, 36: 0.44, 37: 0.5, 38: 0.57, 39: 0.63, 40: 0.69, 28: 0.79,
  // bottom row
  44: 0.08, 45: 0.14, 46: 0.21, 47: 0.27, 48: 0.34, 49: 0.4, 50: 0.47, 51: 0.53, 52: 0.59, 53: 0.65,
  // modifiers and wide keys
  1: 0.0, 15: 0.04, 58: 0.02, 14: 0.92, 42: 0.03, 54: 0.94, 29: 0.01, 3613: 0.97, 56: 0.09, 3640: 0.99,
  3675: 0.02, 3676: 0.92,
  57: 0.5,
};

const NAMES: Record<number, string> = {
  1: 'Esc', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0', 12: '-', 13: '=',
  14: 'Backspace', 15: 'Tab', 16: 'Q', 17: 'W', 18: 'E', 19: 'R', 20: 'T', 21: 'Y', 22: 'U', 23: 'I', 24: 'O',
  25: 'P', 26: '[', 27: ']', 28: 'Enter', 29: 'Ctrl', 30: 'A', 31: 'S', 32: 'D', 33: 'F', 34: 'G', 35: 'H',
  36: 'J', 37: 'K', 38: 'L', 39: ';', 40: "'", 41: '`', 42: 'Shift', 43: '\\', 44: 'Z', 45: 'X', 46: 'C',
  47: 'V', 48: 'B', 49: 'N', 50: 'M', 51: ',', 52: '.', 53: '/', 54: 'Shift', 56: 'Alt', 57: 'Space',
  58: 'Caps', 3613: 'Ctrl', 3640: 'Win', 3675: 'Win', 3676: 'Win', 57416: '↑', 57419: '←', 57421: '→', 57424: '↓',
};

const DOM_CODE_TO_KEY: Record<string, number> = {
  Escape: 1,
  Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
  Minus: 12, Equal: 13, Backspace: 14, Tab: 15,
  KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20, KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25,
  BracketLeft: 26, BracketRight: 27, Enter: 28, ControlLeft: 29,
  KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38,
  Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43,
  KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50,
  Comma: 51, Period: 52, Slash: 53, ShiftRight: 54, AltLeft: 56, Space: 57, CapsLock: 58,
  ControlRight: 3613, AltRight: 3640, MetaLeft: 3675, MetaRight: 3676,
  ArrowUp: 57416, ArrowLeft: 57419, ArrowRight: 57421, ArrowDown: 57424,
};

export function domCodeToKeycode(code: string): number {
  return DOM_CODE_TO_KEY[code] ?? 57;
}

export function keyPosition(keycode: number): number {
  return POSITIONS[keycode] ?? 0.5;
}

export function keyName(keycode: number): string {
  return NAMES[keycode] ?? `#${keycode}`;
}

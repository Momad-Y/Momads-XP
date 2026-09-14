/**
 * Browser `KeyboardEvent.code` → js-dos key code.
 *
 * THESE ARE GLFW KEY CODES, NOT DOS SCANCODES. That distinction is the whole
 * reason this file was rewritten: it previously shipped set-1 scancodes
 * (`Escape: 1`, `ArrowUp: 328`, `ControlLeft: 29`), and js-dos silently
 * discarded almost all of them. DOOM booted into its attract demo and stayed
 * there forever, which reads to a visitor as a video that cannot be played.
 *
 * `emulators.js` 8.4.1 hands the code it is given straight to `_addKey` in
 * `wdosbox.wasm`, which expects js-dos's own `KBD_KEYS` enum — and that enum
 * is GLFW's numbering, verified against js-dos's UI layer (`js-dos.js` 8.4.1,
 * read for reference only; that file is never shipped, since it hardcodes four
 * remote origins). Printable keys are their ASCII code, everything else is a
 * GLFW constant in the 256+ range.
 *
 * Keyed off `code` rather than `key` on purpose: `key` changes with the
 * keyboard layout and with modifiers, so a French or Dvorak visitor would get
 * different movement keys — `code` is the physical key.
 */
const KEY_CODES: Readonly<Record<string, number>> = {
    // Printable keys are ASCII, exactly as GLFW numbers them.
    Space: 32,
    Quote: 39,
    Comma: 44,
    Minus: 45,
    Period: 46,
    Slash: 47,
    Digit0: 48,
    Digit1: 49,
    Digit2: 50,
    Digit3: 51,
    Digit4: 52,
    Digit5: 53,
    Digit6: 54,
    Digit7: 55,
    Digit8: 56,
    Digit9: 57,
    Semicolon: 59,
    Equal: 61,
    KeyA: 65,
    KeyB: 66,
    KeyC: 67,
    KeyD: 68,
    KeyE: 69,
    KeyF: 70,
    KeyG: 71,
    KeyH: 72,
    KeyI: 73,
    KeyJ: 74,
    KeyK: 75,
    KeyL: 76,
    KeyM: 77,
    KeyN: 78,
    KeyO: 79,
    KeyP: 80,
    KeyQ: 81,
    KeyR: 82,
    KeyS: 83,
    KeyT: 84,
    KeyU: 85,
    KeyV: 86,
    KeyW: 87,
    KeyX: 88,
    KeyY: 89,
    KeyZ: 90,
    BracketLeft: 91,
    Backslash: 92,
    BracketRight: 93,
    Backquote: 96,

    // Named keys: GLFW's 256+ block.
    Escape: 256,
    Enter: 257,
    Tab: 258,
    Backspace: 259,
    Insert: 260,
    Delete: 261,
    ArrowRight: 262,
    ArrowLeft: 263,
    ArrowDown: 264,
    ArrowUp: 265,
    PageUp: 266,
    PageDown: 267,
    Home: 268,
    End: 269,
    CapsLock: 280,
    ScrollLock: 281,
    NumLock: 282,
    PrintScreen: 283,
    Pause: 284,
    F1: 290,
    F2: 291,
    F3: 292,
    F4: 293,
    F5: 294,
    F6: 295,
    F7: 296,
    F8: 297,
    F9: 298,
    F10: 299,
    F11: 300,
    F12: 301,
    Numpad0: 320,
    Numpad1: 321,
    Numpad2: 322,
    Numpad3: 323,
    Numpad4: 324,
    Numpad5: 325,
    Numpad6: 326,
    Numpad7: 327,
    Numpad8: 328,
    Numpad9: 329,
    NumpadDecimal: 330,
    NumpadDivide: 331,
    NumpadMultiply: 332,
    NumpadSubtract: 333,
    NumpadAdd: 334,
    NumpadEnter: 335,
    ShiftLeft: 340,
    ControlLeft: 341,
    AltLeft: 342,
    ShiftRight: 344,
    ControlRight: 345,
    AltRight: 346,
};

/**
 * 0 means "not a key DOOM uses" — the caller leaves the event alone.
 *
 * Safe as a sentinel because js-dos reserves 0 for `KBD_NONE`, so no real key
 * collides with it.
 */
export function key_code_for(code: string): number {
    return KEY_CODES[code] ?? 0;
}

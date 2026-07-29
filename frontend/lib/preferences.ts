// Notification and sound preference helpers - the Settings page controls
// that don't affect page layout (unlike lib/theme.ts's theme/font size),
// so they live separately. Sound is the one control here with a real,
// observable effect: app/chat/page.tsx calls playNotificationSound() when
// an assistant reply arrives, gated by isSoundEnabled(). Notifications are
// stored the same way, but Campus Expert has no notification-delivery
// system (no push, no email sending) to gate yet - see the Settings page's
// own comment on notificationItems for the honest scope of what this
// toggle currently does.

export const SOUND_STORAGE_KEY = "campusExpert:soundEnabled";
export const NOTIFICATIONS_STORAGE_KEY = "campusExpert:notifications";

export function getStoredSoundEnabled(): boolean {
  try {
    const value = localStorage.getItem(SOUND_STORAGE_KEY);
    // Defaults to on (matches the segment's previous always-on behavior)
    // when nothing has been saved yet.
    return value === null ? true : value === "true";
  } catch {
    return true;
  }
}

export function storeSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Non-fatal - see lib/theme.ts's storeTheme().
  }
}

export function getStoredNotifications(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function storeNotifications(notifications: Record<string, boolean>): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // Non-fatal - see lib/theme.ts's storeTheme().
  }
}

// A short two-tone chime built with the Web Audio API instead of an audio
// file - there's no asset to ship or fail to load, and it works the moment
// this function runs (no <audio> element, no network request). Silently
// does nothing if the browser has no AudioContext or playback is blocked
// (e.g. before the user has interacted with the page at all) - a missed
// notification sound is never worth surfacing an error over.
export function playNotificationSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const now = context.currentTime;

    const playTone = (frequency: number, startOffset: number, duration: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + startOffset);
      gain.gain.linearRampToValueAtTime(0.15, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + startOffset);
      oscillator.stop(now + startOffset + duration);
    };

    playTone(660, 0, 0.12);
    playTone(880, 0.1, 0.18);

    window.setTimeout(() => context.close(), 500);
  } catch {
    // Non-fatal - see above.
  }
}

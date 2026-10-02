const MUTE_KEY = (userId: number) => `co_notif_sound_muted_${userId}`;

let audioCtx: AudioContext | null = null;
let unlocked = false;
const playedIds = new Set<number>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

export function unlockNotificationAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => {
      unlocked = true;
    }).catch(() => {});
  } else {
    unlocked = true;
  }
}

export function readSoundMuted(userId: number | null | undefined, serverMuted?: boolean | null): boolean {
  if (serverMuted != null) return Boolean(serverMuted);
  if (!userId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_KEY(userId)) === '1';
  } catch {
    return false;
  }
}

export function writeSoundMutedLocal(userId: number, muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY(userId), muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  syncMuteToServiceWorker(muted);
}

export function syncMuteToServiceWorker(muted: boolean) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'NOTIF_SOUND_MUTE', muted: Boolean(muted) });
}

export function playNotificationSound(notificationId: number, muted: boolean) {
  if (muted) return;
  if (playedIds.has(notificationId)) return;
  playedIds.add(notificationId);
  if (playedIds.size > 500) {
    const oldest = playedIds.values().next().value;
    if (oldest != null) playedIds.delete(oldest);
  }
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const start = () => {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      gain.connect(ctx.destination);

      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(880, now);
      o1.connect(gain);
      o1.start(now);
      o1.stop(now + 0.18);

      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(1174.66, now + 0.12);
      o2.connect(gain);
      o2.start(now + 0.12);
      o2.stop(now + 0.36);
    };
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        unlocked = true;
        start();
      }).catch(() => {});
      return;
    }
    if (!unlocked) unlocked = true;
    start();
  } catch {
    /* browser blocked audio */
  }
}

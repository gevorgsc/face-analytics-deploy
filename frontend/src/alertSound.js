// alertSound.js - browser audio alerts for blacklist / VIP detections

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return _audioCtx;
}

// Play a simple beep pattern
// type: 'blacklist' = urgent alarm, 'vip' = positive chime
function playTone(frequency, duration, type = 'sine', gain = 0.4) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    ctx.resume();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore */ }
}

export function playBlacklistAlert() {
  // Urgent 3-pulse alarm
  playTone(880, 0.18, 'sawtooth', 0.5);
  setTimeout(() => playTone(880, 0.18, 'sawtooth', 0.5), 250);
  setTimeout(() => playTone(660, 0.35, 'sawtooth', 0.4), 500);
}

export function playVipAlert() {
  // Pleasant 2-note chime
  playTone(523, 0.2, 'sine', 0.3);
  setTimeout(() => playTone(659, 0.3, 'sine', 0.3), 220);
}

export function playNewEventPing() {
  // Subtle soft ping
  playTone(440, 0.12, 'sine', 0.15);
}

export function playSoftNotice() {
  playTone(392, 0.12, 'sine', 0.16);
  setTimeout(() => playTone(523, 0.16, 'sine', 0.14), 140);
}

export function playWarningAlarm() {
  playTone(740, 0.16, 'square', 0.36);
  setTimeout(() => playTone(587, 0.16, 'square', 0.32), 210);
}

export function playEventSound(soundKey) {
  if (soundKey === 'none') return;
  if (soundKey === 'blacklist_alarm') return playBlacklistAlert();
  if (soundKey === 'warning_alarm') return playWarningAlarm();
  if (soundKey === 'vip_chime') return playVipAlert();
  if (soundKey === 'soft_notice') return playSoftNotice();
  return playNewEventPing();
}

// Browser Push Notification
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendBrowserNotification(title, body, icon = '/gsc-logo.svg') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon, silent: true });
    setTimeout(() => n.close(), 8000);
  } catch { /* ignore */ }
}

// Ported from the old site: short synthesized sounds via Web Audio,
// no audio files needed, works fully offline. Respects a mute flag
// stored the same way (so the old "volume toggle" concept carries over).

let audioCtx = null;

function isMuted() {
  return localStorage.getItem('med101_soundMuted') === '1';
}

export function setMuted(muted) {
  localStorage.setItem('med101_soundMuted', muted ? '1' : '0');
}

function getCtx() {
  if (isMuted()) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playTapSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

export function playCorrectSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [660, 880].forEach((freq, i) => {
    const t = now + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}

export function playWrongSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

// Appreciation sound — plays once on the quiz results screen, picked by
// final score %. Real audio clips live in /public/sounds/ (drop a file
// in with the matching name and it just works, no code changes needed).
// Falls back silently (no sound) if a clip for a tier hasn't been
// uploaded yet, so this is safe to ship ahead of having all 4 files.
const APPRECIATION_CLIPS = [
  { min: 90, file: 'waah-clap.mp3' },   // >90%  — "Waah" + clap
  { min: 70, file: 'clap.mp3' },        // 70–90% — clap only
  { min: 50, file: 'do-better.mp3' },   // 50–70% — "Do better"
  { min: 0, file: 'faah.mp3' },         // <=50% — "Faah"
];

function clipForPct(pct) {
  return APPRECIATION_CLIPS.find((tier) => pct >= tier.min) || APPRECIATION_CLIPS[APPRECIATION_CLIPS.length - 1];
}

export function playAppreciationSound(pct) {
  if (isMuted()) return;
  const tier = clipForPct(pct);
  const audio = new Audio(`/sounds/${tier.file}`);
  audio.volume = 0.85;
  // If the clip for this tier hasn't been uploaded yet, fail quietly
  // instead of throwing a console error the student would never see
  // the point of.
  audio.play().catch(() => {});
}

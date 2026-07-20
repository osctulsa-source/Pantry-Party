/**
 * Generates the app's four feedback sounds as tiny mono WAVs — one marimba-ish
 * timbre family (sine fundamental + soft 4x partial, exponential decay) so they
 * read as one brand. Deterministic: rerunning reproduces identical files.
 *
 *   node apps/mobile/scripts/make-sounds.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const RATE = 22050;

/** One struck-bar note: sine fundamental + quiet 4th partial, exp decay. */
function note(freq, seconds, { gain = 0.5, decay = 12 } = {}) {
  const n = Math.round(RATE * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp(-decay * t);
    const attack = Math.min(1, t / 0.004); // 4ms attack — soft, not clicky
    out[i] =
      gain *
      env *
      attack *
      (Math.sin(2 * Math.PI * freq * t) +
        0.18 * Math.sin(2 * Math.PI * freq * 4 * t) * Math.exp(-30 * t));
  }
  return out;
}

/** Mix notes at offsets (seconds) into one buffer, normalized politely. */
function mix(parts, totalSeconds) {
  const n = Math.round(RATE * totalSeconds);
  const out = new Float64Array(n);
  for (const { buf, at } of parts) {
    const start = Math.round(at * RATE);
    for (let i = 0; i < buf.length && start + i < n; i++) out[start + i] += buf[i];
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.7 / peak : 1;
  return out.map((v) => v * k);
}

function wav(samples) {
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(OUT, { recursive: true });

// C-major family, quiet-to-celebratory.
const sounds = {
  // Soft tick: very short, high, quiet tap (check-offs — heard many times).
  'tick.wav': mix([{ at: 0, buf: note(1318.5, 0.09, { gain: 0.22, decay: 40 }) }], 0.1),
  // Light pop: single mid note, quick (item added / timer started).
  'pop.wav': mix([{ at: 0, buf: note(659.3, 0.16, { gain: 0.4, decay: 22 }) }], 0.18),
  // Timer done: rising two-note "ding-ding" (G5 → C6).
  'timer-done.wav': mix(
    [
      { at: 0, buf: note(784, 0.3, { gain: 0.45, decay: 10 }) },
      { at: 0.16, buf: note(1046.5, 0.4, { gain: 0.5, decay: 8 }) },
    ],
    0.6,
  ),
  // Success: three-note arpeggio C5–E5–G5 (the "I made this!" fanfare).
  'success.wav': mix(
    [
      { at: 0, buf: note(523.25, 0.35, { gain: 0.42, decay: 9 }) },
      { at: 0.12, buf: note(659.3, 0.35, { gain: 0.42, decay: 9 }) },
      { at: 0.24, buf: note(784, 0.5, { gain: 0.5, decay: 7 }) },
    ],
    0.85,
  ),
};

for (const [name, samples] of Object.entries(sounds)) {
  const buf = wav(samples);
  writeFileSync(join(OUT, name), buf);
  console.log(`wrote assets/sounds/${name} (${buf.length} bytes)`);
}

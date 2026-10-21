const AudioContextClass =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : null;

export function createAudioEngine() {
  const synths = {};
  let context = null;
  let isReady = false;
  let isBooting = false;

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass({ latencyHint: "interactive" });
    }
    return context;
  }

  async function init() {
    if (isReady || isBooting) return;
    isBooting = true;
    try {
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (!Object.keys(synths).length) {
        buildVoices(ctx);
      }
      isReady = true;
    } catch (err) {
      console.warn("Audio initialization failed", err);
    } finally {
      isBooting = false;
    }
  }

  function play(type, note, duration = "8n") {
    if (!isReady || !synths[type]) return;
    synths[type](note, duration);
  }

  function buildVoices(ctx) {
    synths.item = (note, duration) =>
      playOsc(ctx, {
        note,
        duration,
        waveform: "triangle",
        gainDb: -12,
      });

    synths.puzzle = (note, duration) =>
      playOsc(ctx, {
        note,
        duration,
        waveform: "sine",
        gainDb: -10,
        vibratoHz: 5,
        vibratoDepth: 8,
      });

    synths.solve = (note, duration) =>
      playOsc(ctx, {
        note,
        duration,
        waveform: "sine",
        gainDb: -8,
        sustainMultiplier: 2,
      });

    synths.hit = () => playDrum(ctx);

    synths.damage = () => playNoise(ctx, { duration: 0.18, gainDb: -9 });
  }

  return { init, play };
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function resolveDuration(duration) {
  switch (duration) {
    case "16n":
      return 0.12;
    case "8n":
      return 0.22;
    case "4n":
      return 0.4;
    case "2n":
      return 0.8;
    default:
      return typeof duration === "number" ? duration : 0.3;
  }
}

function noteToFrequency(note) {
  if (!note || typeof note !== "string") return 440;
  const match = note.trim().match(/^([a-gA-G])([#b]?)(-?\d)$/);
  if (!match) return 440;
  const [, raw, accidental, octaveStr] = match;
  const semitoneMap = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 };
  let semitone = semitoneMap[raw.toLowerCase()] ?? 0;
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  const octave = Number(octaveStr);
  const midi = 69 + semitone + (octave - 4) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playOsc(
  ctx,
  {
    note,
    duration,
    waveform = "sine",
    gainDb = -12,
    vibratoHz = 0,
    vibratoDepth = 0,
    sustainMultiplier = 1,
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = noteToFrequency(note);
  const seconds = resolveDuration(duration) * sustainMultiplier;
  const now = ctx.currentTime;

  osc.type = waveform;
  osc.frequency.setValueAtTime(freq, now);

  if (vibratoHz > 0 && vibratoDepth > 0) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = vibratoHz;
    lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(now);
    lfo.stop(now + seconds);
  }

  gain.gain.setValueAtTime(dbToGain(gainDb), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + seconds);
}

function playNoise(ctx, { duration = 0.2, gainDb = -10 } = {}) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(dbToGain(gainDb), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(gain).connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

function playDrum(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);

  gain.gain.setValueAtTime(dbToGain(-6), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

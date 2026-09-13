// Number, Currency & Time Formatters

export function formatPrice(val) {
  if (val === undefined || val === null || isNaN(val)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatPercent(val, showPlus = true) {
  if (val === undefined || val === null || isNaN(val)) return '0.00%';
  const sign = showPlus && val > 0 ? '+' : '';
  return `${sign}${Number(val).toFixed(2)}%`;
}

export function formatNumber(val, decimals = 0) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDateTime(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  } catch (e) {
    return String(ts);
  }
}

// 8-bit Retro Synthesizer using Web Audio API (zero audio files needed!)
let audioCtx = null;
let soundEnabled = true;

export function toggleAudio(state) {
  if (state !== undefined) soundEnabled = state;
  else soundEnabled = !soundEnabled;
  return soundEnabled;
}

export function isAudioEnabled() {
  return soundEnabled;
}

export function playRetroSound(type = 'blip') {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'blip') {
      // Short UI click blip
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'select') {
      // Crisp 8-bit select chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.04); // E5
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'signal') {
      // Exciting arcade high-score fanfare
      osc.type = 'square';
      osc.frequency.setValueAtTime(392.00, now); // G4
      osc.frequency.setValueAtTime(523.25, now + 0.08); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.16); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'desk_click') {
      // Office desk terminal keypress
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    }
  } catch (e) {
    // Audio context may be restricted by browser policy before user interaction
  }
}

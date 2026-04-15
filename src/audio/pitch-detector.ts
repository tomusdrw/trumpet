export interface PitchDetector {
  start(): Promise<void>;
  stop(): void;
  getFrequency(): number | null;
}

const BUFFER_SIZE = 4096;
const CORRELATION_THRESHOLD = 0.9;
// Trumpet range: E3 (~165 Hz) to C6 (~1047 Hz)
const MIN_PERIOD = 35; // ~1260 Hz ceiling
const MAX_PERIOD = 300; // ~147 Hz floor

// Exponential moving average for frequency smoothing (cents precision).
// 0 = no smoothing, 1 = frozen.
const EMA_ALPHA = 0.85;

export function autocorrelate(
  buffer: Float32Array,
  sampleRate: number,
): number | null {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  const correlations = new Float32Array(MAX_PERIOD + 1);
  for (
    let period = MIN_PERIOD;
    period <= MAX_PERIOD && period < buffer.length / 2;
    period++
  ) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < buffer.length - period; i++) {
      correlation += buffer[i] * buffer[i + period];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + period] * buffer[i + period];
    }

    const norm = Math.sqrt(norm1 * norm2);
    correlations[period] = norm === 0 ? 0 : correlation / norm;
  }

  // Find the FIRST correlation peak above threshold — avoids octave errors.
  let foundPeriod = 0;
  let rising = false;
  for (
    let period = MIN_PERIOD;
    period <= MAX_PERIOD && period < buffer.length / 2;
    period++
  ) {
    if (correlations[period] > correlations[period - 1]) {
      rising = true;
    } else if (rising && correlations[period] < correlations[period - 1]) {
      if (correlations[period - 1] >= CORRELATION_THRESHOLD) {
        foundPeriod = period - 1;
        break;
      }
      rising = false;
    }
  }

  if (foundPeriod === 0) return null;

  // Parabolic interpolation for sub-sample accuracy.
  const prev = correlations[foundPeriod - 1] ?? 0;
  const curr = correlations[foundPeriod];
  const next = correlations[foundPeriod + 1] ?? 0;
  const denom = 2 * (prev - 2 * curr + next);
  const shift = denom === 0 ? 0 : (prev - next) / denom;
  const refinedPeriod = foundPeriod + (isFinite(shift) ? shift : 0);

  return sampleRate / refinedPeriod;
}

export function createPitchDetector(): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;
  let smoothedFrequency: number | null = null;

  return {
    async start() {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = BUFFER_SIZE * 2;
      buffer = new Float32Array(BUFFER_SIZE) as Float32Array<ArrayBuffer>;

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);
    },

    stop() {
      mediaStream?.getTracks().forEach((t) => t.stop());
      audioContext?.close();
      audioContext = null;
      analyserNode = null;
      mediaStream = null;
      buffer = null;
      smoothedFrequency = null;
    },

    getFrequency(): number | null {
      if (!analyserNode || !buffer || !audioContext) return null;
      analyserNode.getFloatTimeDomainData(buffer);
      const raw = autocorrelate(buffer, audioContext.sampleRate);

      if (raw === null) {
        smoothedFrequency = null;
        return null;
      }

      if (smoothedFrequency === null) {
        smoothedFrequency = raw;
      } else {
        smoothedFrequency =
          smoothedFrequency * EMA_ALPHA + raw * (1 - EMA_ALPHA);
      }

      return smoothedFrequency;
    },
  };
}

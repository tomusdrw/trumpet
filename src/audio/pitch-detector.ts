export interface PitchDetector {
  start(): Promise<void>;
  stop(): void;
  getFrequency(): number | null;
}

const BUFFER_SIZE = 2048;
const MIN_CORRELATION = 0.9;
const MIN_PERIOD = 10;
const MAX_PERIOD = 500;

function autocorrelate(buffer: Float32Array, sampleRate: number): number | null {
  // Check if there's enough signal (RMS)
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  let bestCorrelation = 0;
  let bestPeriod = 0;

  for (let period = MIN_PERIOD; period < MAX_PERIOD && period < buffer.length / 2; period++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < buffer.length - period; i++) {
      correlation += buffer[i] * buffer[i + period];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + period] * buffer[i + period];
    }

    const norm = Math.sqrt(norm1 * norm2);
    if (norm === 0) continue;
    correlation /= norm;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }

  if (bestCorrelation < MIN_CORRELATION) return null;
  if (bestPeriod === 0) return null;

  // Parabolic interpolation for sub-sample accuracy
  const prev = bestPeriod > 0 ? correlationAt(buffer, bestPeriod - 1) : 0;
  const curr = correlationAt(buffer, bestPeriod);
  const next = correlationAt(buffer, bestPeriod + 1);
  const shift = (prev - next) / (2 * (prev - 2 * curr + next));
  const refinedPeriod = bestPeriod + (isFinite(shift) ? shift : 0);

  return sampleRate / refinedPeriod;
}

function correlationAt(buffer: Float32Array, period: number): number {
  let correlation = 0;
  for (let i = 0; i < buffer.length - period; i++) {
    correlation += buffer[i] * buffer[i + period];
  }
  return correlation;
}

export function createPitchDetector(): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;

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
    },

    getFrequency(): number | null {
      if (!analyserNode || !buffer || !audioContext) return null;
      analyserNode.getFloatTimeDomainData(buffer);
      return autocorrelate(buffer, audioContext.sampleRate);
    },
  };
}

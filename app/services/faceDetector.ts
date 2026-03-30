/**
 * Face detection using Ultra-Light-Fast-Generic-Face-Detector-1MB
 * https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB
 *
 * Model: version-slim-320 (ONNX)
 * Input:  float32 [1, 3, 240, 320]  NCHW, normalised (pixel - 127) / 128
 * Output: scores [1, 4420, 2]  — col 0 = background, col 1 = face confidence
 *         boxes  [1, 4420, 4]  — bounding boxes (unused for presence detection)
 */

// Lazily loaded — keeps initial bundle small; only pulled in when quiz tab opens
type OrtModule = typeof import('onnxruntime-web');
let _ort: OrtModule | null = null;

async function getOrt(): Promise<OrtModule> {
  if (_ort) return _ort;
  const ort = await import('onnxruntime-web');
  // Point WASM runtime at CDN — avoids Vite bundling / copying WASM files
  (ort.env.wasm as any).wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
  _ort = ort;
  return ort;
}

const MODEL_URL = '/models/face_detector.onnx';
const INPUT_W = 320;
const INPUT_H = 240;
const FACE_THRESHOLD = 0.65; // confidence threshold for "face present"

// Singleton session — loaded once, reused on every call
let _sessionPromise: Promise<import('onnxruntime-web').InferenceSession> | null = null;

async function getSession(): Promise<import('onnxruntime-web').InferenceSession> {
  if (!_sessionPromise) {
    _sessionPromise = (async () => {
      const ort = await getOrt();
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
    })().catch(err => {
      _sessionPromise = null;
      throw err;
    });
  }
  return _sessionPromise;
}

// Shared off-screen canvas (created once)
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = INPUT_W;
    _canvas.height = INPUT_H;
    _ctx = _canvas.getContext('2d', { willReadFrequently: true })!;
  }
  return [_canvas, _ctx!];
}

/**
 * Build NCHW Float32Array from a video frame.
 * Normalises each channel: (pixel - 127) / 128  → range ≈ [-1, 1]
 */
function preprocess(video: HTMLVideoElement): Float32Array {
  const [canvas, ctx] = getCanvas();
  ctx.drawImage(video, 0, 0, INPUT_W, INPUT_H);
  const { data } = ctx.getImageData(0, 0, INPUT_W, INPUT_H);
  const pixels = INPUT_W * INPUT_H;
  const input = new Float32Array(3 * pixels);

  for (let i = 0; i < pixels; i++) {
    input[i]              = (data[i * 4]     - 127) / 128; // R
    input[pixels + i]     = (data[i * 4 + 1] - 127) / 128; // G
    input[2 * pixels + i] = (data[i * 4 + 2] - 127) / 128; // B
  }
  return input;
}

export interface FaceDetectionResult {
  faceDetected: boolean;
  confidence: number;   // max face confidence score (0–1)
}

// Guard against concurrent inference calls (setInterval can overlap)
let _running = false;

/**
 * Detect whether a human face is visible in the video frame.
 * Loads the ONNX model on first call (~1 s), then runs in <30 ms/frame.
 * Falls back to faceDetected=true on any error so users aren't wrongly flagged.
 */
export async function detectFace(
  video: HTMLVideoElement
): Promise<FaceDetectionResult> {
  if (_running) return { faceDetected: true, confidence: 1 };
  if (!video || video.readyState < 2) return { faceDetected: true, confidence: 1 };

  _running = true;
  try {
    const ort = await getOrt();
    const session = await getSession();
    const inputData = preprocess(video);
    const inputTensor = new ort.Tensor('float32', inputData, [1, 3, INPUT_H, INPUT_W]);

    const outputs = await session.run({ input: inputTensor });

    // scores: flat Float32Array of length 1 * 4420 * 2
    // layout: [bg0, face0, bg1, face1, ...]  (pairs per anchor)
    const scores = outputs['scores'].data as Float32Array;
    let maxConf = 0;
    for (let i = 1; i < scores.length; i += 2) {
      if (scores[i] > maxConf) maxConf = scores[i];
    }

    return {
      faceDetected: maxConf >= FACE_THRESHOLD,
      confidence: maxConf,
    };
  } catch (err) {
    console.warn('[FaceDetector]', err);
    return { faceDetected: true, confidence: 0 }; // fail-open
  } finally {
    _running = false;
  }
}

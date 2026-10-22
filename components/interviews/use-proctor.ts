'use client';

import * as React from 'react';
import {
  createThrottle,
  createVisionTracker,
  isFlag,
  readDetections,
  type ProctorType,
} from '@/lib/interview-logic';

/**
 * The candidate-side proctoring layer. It runs only after the candidate has
 * agreed on the consent screen, and only while the round page is open.
 *
 * What leaves the browser is a list of event records — a type, a time, and a
 * few numbers. Camera frames are read into a small canvas for the object
 * detector and never sent anywhere.
 *
 * Vision is TensorFlow.js with COCO-SSD, loaded from a CDN at runtime so it
 * costs nothing for anyone who never sits a proctored round. It looks for two
 * classes: "person" (counted) and "cell phone". It sees only what the camera
 * sees, and can be wrong in both directions.
 */

const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

const SAMPLE_MS = 2000;
const FLUSH_MS = 5000;
const SAMPLE_W = 320;
const SAMPLE_H = 240;

type QueuedEvent = { type: ProctorType; at: string; duration_ms?: number; detail?: Record<string, string | number | boolean> };

export type VisionState = 'idle' | 'loading' | 'running' | 'unavailable';
export type CameraState = 'idle' | 'on' | 'off' | 'blocked';

export type ProctorState = {
  active: boolean;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  camera: CameraState;
  vision: VisionState;
  displays: 'single' | 'multiple' | 'unknown';
  /** What the camera check saw last: people in frame and whether a phone was seen. */
  lastSample: { people: number; phone: boolean } | null;
  flagsLogged: number;
};

type CocoModel = { detect: (input: HTMLCanvasElement, max?: number, minScore?: number) => Promise<{ class: string; score: number }[]> };

declare global {
  interface Window {
    cocoSsd?: { load: (opts?: { base?: string }) => Promise<CocoModel> };
    tf?: unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-proctor-src="${src}"]`);
    if (existing?.dataset.loaded === '1') return resolve();
    const el = existing ?? document.createElement('script');
    el.addEventListener('load', () => {
      el.dataset.loaded = '1';
      resolve();
    });
    el.addEventListener('error', () => reject(new Error(`Could not load ${src}`)));
    if (!existing) {
      el.src = src;
      el.async = true;
      el.crossOrigin = 'anonymous';
      el.dataset.proctorSrc = src;
      document.head.appendChild(el);
    }
  });
}

let modelPromise: Promise<CocoModel> | null = null;
function loadModel(): Promise<CocoModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      if (!window.tf) await loadScript(TFJS_URL);
      if (!window.cocoSsd) await loadScript(COCO_URL);
      if (!window.cocoSsd) throw new Error('COCO-SSD did not initialise');
      // The lite base is the fastest; accuracy is enough for "is there a phone".
      return window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

export function useProctor({
  interviewId,
  roundId,
  externalStream,
  externalCameraOn,
  ownCamera,
}: {
  interviewId: string;
  roundId: string;
  /** The call's camera stream, for video rounds — no second camera request. */
  externalStream?: MediaStream | null;
  externalCameraOn?: boolean;
  /** Open a low-resolution camera stream of our own (coding and MCQ rounds). */
  ownCamera: boolean;
}) {
  const [state, setState] = React.useState<ProctorState>({
    active: false,
    fullscreen: false,
    fullscreenSupported: true,
    camera: 'idle',
    vision: 'idle',
    displays: 'unknown',
    lastSample: null,
    flagsLogged: 0,
  });
  const [ownStream, setOwnStream] = React.useState<MediaStream | null>(null);

  const activeRef = React.useRef(false);
  const queueRef = React.useRef<QueuedEvent[]>([]);
  const throttleRef = React.useRef(createThrottle());
  const trackerRef = React.useRef(createVisionTracker(2));
  const awaySince = React.useRef<{ hidden?: number; blur?: number }>({});
  const cleanupRef = React.useRef<(() => void)[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cameraOnRef = React.useRef(true);
  /**
   * True until the camera is attached. The browser's own permission prompt
   * takes focus from the page, and that is not the candidate looking away.
   */
  const settlingRef = React.useRef(true);

  const patch = React.useCallback((p: Partial<ProctorState>) => setState((s) => ({ ...s, ...p })), []);

  const flush = React.useCallback(
    async (keepalive = false) => {
      const batch = queueRef.current.splice(0, 100);
      if (!batch.length) return;
      try {
        const res = await fetch(`/api/interviews/${interviewId}/proctor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round_id: roundId, events: batch }),
          keepalive,
        });
        // A 4xx means the round no longer takes events; retrying will not help.
        if (res.status >= 500) queueRef.current.unshift(...batch);
      } catch {
        queueRef.current.unshift(...batch);
      }
    },
    [interviewId, roundId]
  );

  const log = React.useCallback(
    (type: ProctorType, extra?: { duration_ms?: number; detail?: QueuedEvent['detail'] }) => {
      if (!activeRef.current && type !== 'consent_given' && type !== 'consent_declined' && type !== 'session_start') return;
      const now = Date.now();
      if (!throttleRef.current(type, now)) return;
      queueRef.current.push({ type, at: new Date(now).toISOString(), ...extra });
      if (isFlag(type)) setState((s) => ({ ...s, flagsLogged: s.flagsLogged + 1 }));
      if (queueRef.current.length >= 20) void flush();
    },
    [flush]
  );

  /** Logged even without starting, so a refusal is on the record. */
  const decline = React.useCallback(async () => {
    queueRef.current.push({ type: 'consent_declined', at: new Date().toISOString() });
    await flush();
  }, [flush]);

  const requestFullscreen = React.useCallback(() => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        /* refused or not allowed here — the banner keeps offering it */
      });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      patch({ fullscreenSupported: false });
    }
  }, [patch]);

  /* ---------------- vision ---------------- */

  const startVision = React.useCallback(
    (stream: MediaStream) => {
      patch({ vision: 'loading' });
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      void video.play().catch(() => {});
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_W;
      canvas.height = SAMPLE_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      loadModel()
        .then((model) => {
          if (stopped) return;
          patch({ vision: 'running' });
          const tick = async () => {
            if (stopped) return;
            const live = stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted);
            if (live && cameraOnRef.current && document.visibilityState === 'visible' && video.readyState >= 2 && ctx) {
              try {
                ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
                const detections = await model.detect(canvas, 10, 0.4);
                const sample = readDetections(detections);
                patch({ lastSample: sample });
                for (const finding of trackerRef.current(sample)) {
                  log(finding, {
                    detail: finding === 'multiple_people' ? { people: sample.people } : {},
                  });
                }
              } catch {
                /* a dropped frame is not worth surfacing */
              }
            }
            if (!stopped) timer = setTimeout(() => void tick(), SAMPLE_MS);
          };
          void tick();
        })
        .catch((err: Error) => {
          if (stopped) return;
          patch({ vision: 'unavailable' });
          log('vision_unavailable', { detail: { reason: String(err?.message ?? 'load failed').slice(0, 200) } });
        });

      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        video.srcObject = null;
      };
    },
    [log, patch]
  );

  const watchStream = React.useCallback(
    (stream: MediaStream) => {
      const track = stream.getVideoTracks()[0];
      settlingRef.current = false;
      if (!track) {
        patch({ camera: 'blocked' });
        log('camera_blocked', { detail: { reason: 'no video track' } });
        return () => {};
      }
      const onEnded = () => {
        patch({ camera: 'blocked' });
        log('camera_blocked', { detail: { reason: 'track ended' } });
      };
      const onMute = () => {
        patch({ camera: 'off' });
        log('camera_off', { detail: { reason: 'muted by the system' } });
      };
      const onUnmute = () => {
        patch({ camera: 'on' });
        log('camera_on');
      };
      track.addEventListener('ended', onEnded);
      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onUnmute);
      patch({ camera: track.readyState === 'live' ? 'on' : 'blocked' });
      const stopVision = startVision(stream);
      return () => {
        track.removeEventListener('ended', onEnded);
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
        stopVision();
      };
    },
    [log, patch, startVision]
  );

  /* ---------------- browser signals ---------------- */

  const attachListeners = React.useCallback(() => {
    const on = <K extends string>(target: EventTarget, type: K, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      cleanupRef.current.push(() => target.removeEventListener(type, fn));
    };

    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        awaySince.current.hidden = Date.now();
        log('tab_hidden');
        // A tab that never comes back may never flush again.
        void flush(true);
      } else {
        const since = awaySince.current.hidden;
        awaySince.current.hidden = undefined;
        log('tab_visible', since ? { duration_ms: Date.now() - since } : undefined);
      }
    });
    on(window, 'blur', () => {
      if (settlingRef.current) return;
      awaySince.current.blur = Date.now();
      log('window_blur');
    });
    on(window, 'focus', () => {
      const since = awaySince.current.blur;
      awaySince.current.blur = undefined;
      if (since) log('window_focus', { duration_ms: Date.now() - since });
    });
    // Should the camera never arrive, stop waiting for it after a while.
    const settle = setTimeout(() => {
      settlingRef.current = false;
    }, 20_000);
    cleanupRef.current.push(() => clearTimeout(settle));
    on(document, 'fullscreenchange', () => {
      const full = Boolean(document.fullscreenElement);
      patch({ fullscreen: full });
      log(full ? 'fullscreen_enter' : 'fullscreen_exit');
    });
    // Only the fact and the size are recorded, never the text.
    on(document, 'copy', () => log('copy'));
    on(document, 'cut', () => log('cut'));
    on(document, 'paste', (e) => {
      const text = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
      log('paste', { detail: { characters: text.length } });
    });
    on(document, 'contextmenu', () => log('context_menu'));
    on(window, 'pagehide', () => {
      log('session_end', { detail: { reason: 'page closed' } });
      void flush(true);
    });

    const interval = setInterval(() => void flush(), FLUSH_MS);
    cleanupRef.current.push(() => clearInterval(interval));
  }, [flush, log, patch]);

  /**
   * Multiple displays: `screen.isExtended` where the browser has it, and the
   * Window Management API only if permission was granted before — it is never
   * prompted for here.
   */
  const checkDisplays = React.useCallback(async () => {
    const scr = window.screen as Screen & Partial<EventTarget> & { isExtended?: boolean };
    const report = (multiple: boolean, detail: Record<string, string | number | boolean>) => {
      patch({ displays: multiple ? 'multiple' : 'single' });
      if (multiple) log('multiple_displays', { detail });
    };
    if (typeof scr.isExtended === 'boolean') {
      report(scr.isExtended, { source: 'screen.isExtended' });
      const onChange = () => {
        if (typeof scr.isExtended === 'boolean') report(scr.isExtended, { source: 'screen.isExtended' });
      };
      scr.addEventListener?.('change', onChange);
      cleanupRef.current.push(() => scr.removeEventListener?.('change', onChange));
    }
    try {
      const status = await navigator.permissions.query({ name: 'window-management' as PermissionName });
      const getDetails = (window as unknown as { getScreenDetails?: () => Promise<{ screens: unknown[]; addEventListener: (t: string, f: () => void) => void }> }).getScreenDetails;
      if (status.state === 'granted' && getDetails) {
        const details = await getDetails.call(window);
        report(details.screens.length > 1, { source: 'getScreenDetails', screens: details.screens.length });
        details.addEventListener('screenschange', () =>
          report(details.screens.length > 1, { source: 'getScreenDetails', screens: details.screens.length })
        );
      }
    } catch {
      /* unsupported permission name or API — isExtended is the answer we have */
    }
  }, [log, patch]);

  /* ---------------- lifecycle ---------------- */

  const start = React.useCallback(async () => {
    if (activeRef.current) return;
    log('consent_given');
    activeRef.current = true;
    log('session_start', {
      detail: {
        fullscreen: Boolean(document.fullscreenElement),
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
    patch({ active: true, fullscreen: Boolean(document.fullscreenElement) });
    attachListeners();
    void checkDisplays();
    void flush();

    if (ownCamera) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: SAMPLE_W }, height: { ideal: SAMPLE_H }, frameRate: { ideal: 10 } },
          audio: false,
        });
        if (!activeRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setOwnStream(stream);
        cleanupRef.current.push(watchStream(stream));
      } catch (err) {
        settlingRef.current = false;
        patch({ camera: 'blocked', vision: 'unavailable' });
        log('camera_blocked', { detail: { reason: String((err as { name?: string })?.name ?? 'error') } });
      }
    }
  }, [attachListeners, checkDisplays, flush, log, ownCamera, patch, watchStream]);

  const stop = React.useCallback(
    async (reason = 'left') => {
      if (!activeRef.current) return;
      log('session_end', { detail: { reason } });
      activeRef.current = false;
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setOwnStream(null);
      patch({ active: false });
      await flush(true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [flush, log, patch]
  );

  // The video round's camera arrives from the call once it has started.
  React.useEffect(() => {
    if (!state.active || ownCamera || !externalStream) return;
    let cancelled = false;
    let unwatch: (() => void) | null = null;
    // A tick later, so the subscription's own state updates land outside the effect body.
    queueMicrotask(() => {
      if (!cancelled) unwatch = watchStream(externalStream);
    });
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, [state.active, ownCamera, externalStream, watchStream]);

  // The call's own camera button: off is logged, and vision pauses.
  React.useEffect(() => {
    if (ownCamera || externalCameraOn === undefined) return;
    cameraOnRef.current = externalCameraOn;
    if (!activeRef.current || !externalStream) return;
    patch({ camera: externalCameraOn ? 'on' : 'off' });
    log(externalCameraOn ? 'camera_on' : 'camera_off', externalCameraOn ? undefined : { detail: { reason: 'turned off in the call' } });
  }, [externalCameraOn, externalStream, ownCamera, log, patch]);

  // Leaving the page by navigation still closes the session.
  React.useEffect(() => {
    const queue = queueRef.current;
    return () => {
      if (!activeRef.current) return;
      queue.push({ type: 'session_end', at: new Date().toISOString(), detail: { reason: 'navigated away' } });
      activeRef.current = false;
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void flush(true);
    };
  }, [flush]);

  return { state, ownStream, start, stop, decline, requestFullscreen, log };
}

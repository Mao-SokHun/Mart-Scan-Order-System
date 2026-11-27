import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera, X, RefreshCw, Zap, AlertCircle, CheckCircle2,
  SwitchCamera, HelpCircle, Image as ImageIcon, ZoomIn
} from 'lucide-react';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { Product } from '../types';
import { sound } from '../utils/audio';

export type ScanOutcome = 'added' | 'already_exists' | 'not_found' | 'ignored';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => Promise<ScanOutcome> | ScanOutcome | void;
  products?: Product[];
}

interface ScannedBadgeInfo {
  barcode: string;
  name?: string;
  khmerName?: string;
  outcome: ScanOutcome;
}

const SUPPORTED_HTML5_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.QR_CODE,
];

// Native hardware BarcodeDetector format strings (for Chrome Android / Edge)
const NATIVE_DETECTOR_FORMATS = [
  'code_128',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_39',
  'code_93',
  'qr_code',
];

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  products = [],
}) => {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ title: string; desc: string; isPermission?: boolean } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number; current: number } | null>(null);
  const [lastScannedBadge, setLastScannedBadge] = useState<ScannedBadgeInfo | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);

  // Refs to prevent stale closures inside long-lived camera callbacks
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const productsRef = useRef(products);
  productsRef.current = products;

  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const scanInFlightRef = useRef<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);
  const nativeRafRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const readerElementId = 'camera-barcode-reader';

  const cameraOptions = useMemo<SelectOption<string>[]>(() => {
    return cameras.map((cam, idx) => ({
      value: cam.id,
      label: cam.label || `កាមេរ៉ា ${idx + 1}`,
      icon: <Camera className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
    }));
  }, [cameras]);

  // Match product in local catalog with normalization + universal numeric EAN/UPC leading-zero fallback
  const findLocalProduct = (code: string): Product | undefined => {
    const clean = code.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '');
    if (!clean) return undefined;
    const exact = productsRef.current.find(
      (p) => (p.barcode || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '') === clean
    );
    if (exact) return exact;
    if (/^\d+$/.test(clean)) {
      const strippedClean = clean.replace(/^0+/, '');
      if (strippedClean.length >= 6) {
        return productsRef.current.find((p) => {
          const pCode = (p.barcode || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '');
          return /^\d+$/.test(pCode) && pCode.replace(/^0+/, '') === strippedClean;
        });
      }
    }
    return undefined;
  };

  // Handle decoded text reliably without stale closures or premature false-success badges
  const handleBarcodeDecoded = useCallback(async (decodedText: string) => {
    if (!isOpenRef.current) return;

    let cleanCode = String(decodedText || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/[\r\n\t]/g, '').trim();
    if (cleanCode.endsWith('.0')) cleanCode = cleanCode.slice(0, -2);
    if (!cleanCode || cleanCode.length < 3) return;

    const now = Date.now();
    const prevCode = lastScannedCodeRef.current;
    const prevTime = lastScannedTimeRef.current;

    // Debounce: ignore duplicate frame of same barcode within 1800ms; different barcode within 250ms
    if (cleanCode.toLowerCase() === (prevCode || '').toLowerCase() && now - prevTime < 1800) {
      return;
    }
    if (now - prevTime < 250) {
      return;
    }
    if (scanInFlightRef.current) return;

    scanInFlightRef.current = true;
    lastScannedCodeRef.current = cleanCode;
    lastScannedTimeRef.current = now;

    try {
      const result = await onScanRef.current(cleanCode);
      const outcome: ScanOutcome =
        result === 'added' || result === 'already_exists' || result === 'not_found' || result === 'ignored'
          ? result
          : findLocalProduct(cleanCode)
          ? 'added'
          : 'not_found';

      if (outcome === 'not_found') {
        // Parent opens AddProductModal for unknown barcodes: close camera cleanly so it sits unobstructed
        onCloseRef.current();
        return;
      }

      if (outcome === 'added' || outcome === 'already_exists') {
        const found = findLocalProduct(cleanCode);
        setLastScannedBadge({
          barcode: cleanCode,
          name: found?.name,
          khmerName: found?.khmerName,
          outcome,
        });
        if (outcome === 'added') {
          setScanCount((prev) => prev + 1);
        }
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
          setLastScannedBadge(null);
        }, 2800);
      }
    } finally {
      scanInFlightRef.current = false;
    }
  }, []);

  const handleBarcodeDecodedRef = useRef(handleBarcodeDecoded);
  handleBarcodeDecodedRef.current = handleBarcodeDecoded;

  // Stop native full-HD loop if running
  const stopNativeLoop = useCallback(() => {
    if (nativeRafRef.current !== null) {
      cancelAnimationFrame(nativeRafRef.current);
      nativeRafRef.current = null;
    }
  }, []);

  // Clean stop for camera hardware and scanner instance
  const stopScanner = useCallback(async () => {
    stopNativeLoop();
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    try {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      }
    } catch (err) {
      console.warn('Error stopping scanner:', err);
    }

    // Guarantee all hardware tracks are released immediately
    try {
      const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        videoElem.srcObject = null;
      }
    } catch {}

    setIsScanning(false);
    setIsStarting(false);
    setTorchOn(false);
    setHasTorch(false);
    setZoomRange(null);
    isStoppingRef.current = false;
  }, [stopNativeLoop]);

  // Start direct full-HD native BarcodeDetector pass on <video> (Android Chrome / Samsung / Edge)
  // This bypasses html5-qrcode's 375px canvas downsampling and reads 1D barcodes at full 720p/1080p clarity!
  const startNativeVideoDetectorLoop = useCallback(() => {
    stopNativeLoop();
    const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
    if (!BarcodeDetectorCtor) return;

    let detector: any = null;
    try {
      detector = new BarcodeDetectorCtor({ formats: NATIVE_DETECTOR_FORMATS });
    } catch {
      try {
        detector = new BarcodeDetectorCtor();
      } catch {
        return;
      }
    }

    let lastCheck = 0;
    let detecting = false;

    const tick = async (ts: number) => {
      if (!isOpenRef.current || !scannerRef.current) return;
      nativeRafRef.current = requestAnimationFrame(tick);

      if (detecting || ts - lastCheck < 90) return; // ~11 full-HD checks/sec
      lastCheck = ts;

      const videoEl = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null;
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return;

      detecting = true;
      try {
        const results = await detector.detect(videoEl);
        if (results && results.length > 0 && isOpenRef.current) {
          // Prefer barcode closest to screen center (inside viewfinder box) so neighboring screen barcodes don't hijack
          const cx = videoEl.videoWidth / 2;
          const cy = videoEl.videoHeight / 2;
          const centerZoneX = videoEl.videoWidth * 0.45;
          const centerZoneY = videoEl.videoHeight * 0.35;

          const centered = results.filter((b: any) => {
            if (!b.boundingBox) return true;
            const bx = b.boundingBox.x + b.boundingBox.width / 2;
            const by = b.boundingBox.y + b.boundingBox.height / 2;
            return Math.abs(bx - cx) <= centerZoneX && Math.abs(by - cy) <= centerZoneY;
          });

          const candidates = centered.length > 0 ? centered : results;
          // Pick closest to center
          candidates.sort((a: any, b: any) => {
            const ax = (a.boundingBox?.x || 0) + (a.boundingBox?.width || 0) / 2 - cx;
            const ay = (a.boundingBox?.y || 0) + (a.boundingBox?.height || 0) / 2 - cy;
            const bx = (b.boundingBox?.x || 0) + (b.boundingBox?.width || 0) / 2 - cx;
            const by = (b.boundingBox?.y || 0) + (b.boundingBox?.height || 0) / 2 - cy;
            return ax * ax + ay * ay - (bx * bx + by * by);
          });

          const rawValue = candidates[0]?.rawValue;
          if (rawValue) {
            handleBarcodeDecodedRef.current(rawValue);
          }
        }
      } catch {
        // Ignore single-frame detection errors
      } finally {
        detecting = false;
      }
    };

    nativeRafRef.current = requestAnimationFrame(tick);
  }, [stopNativeLoop]);

  // Main camera launcher with robust device selection + HD autofocus optimization
  const startScanner = useCallback(
    async (cameraIdToUse?: string) => {
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      setIsStarting(true);
      setErrorMsg(null);
      lastScannedCodeRef.current = null;
      sound.warmup();

      await stopScanner();

      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setErrorMsg({
          title: 'ត្រូវការ HTTPS ដើម្បីបើកកាមេរ៉ា',
          desc: 'កម្មវិធីរុករកតម្រូវឱ្យប្រើប្រាស់ HTTPS មានសុវត្ថិភាព។ សូមចូលតាមរយៈ https:// ឧទាហរណ៍ Vercel deployment។',
        });
        setIsStarting(false);
        isStartingRef.current = false;
        return;
      }

      const elem = document.getElementById(readerElementId);
      if (!elem) {
        setIsStarting(false);
        isStartingRef.current = false;
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode(readerElementId, {
          formatsToSupport: SUPPORTED_HTML5_FORMATS,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        scannerRef.current = html5QrCode;

        // Focus ZXing / html5-qrcode inside the viewfinder rectangle (safe dynamic sizing)
        const config = {
          fps: 18,
          disableFlip: false,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
            width: Math.max(60, Math.floor(viewfinderWidth * 0.88)),
            height: Math.max(60, Math.floor(viewfinderHeight * 0.46)),
          }),
        };

        const initialCameraConfig = cameraIdToUse || { facingMode: 'environment' };

        try {
          await html5QrCode.start(
            initialCameraConfig,
            config,
            (decodedText) => handleBarcodeDecodedRef.current(decodedText),
            () => {}
          );
        } catch (firstErr) {
          console.warn('Initial camera start failed, attempting fallback camera:', firstErr);
          if (!cameraIdToUse) {
            try {
              await html5QrCode.start(
                { facingMode: 'user' },
                config,
                (decodedText) => handleBarcodeDecodedRef.current(decodedText),
                () => {}
              );
            } catch {
              const devices = await Html5Qrcode.getCameras();
              if (devices && devices.length > 0) {
                await html5QrCode.start(
                  devices[0].id,
                  config,
                  (decodedText) => handleBarcodeDecodedRef.current(decodedText),
                  () => {}
                );
              } else {
                throw firstErr;
              }
            }
          } else {
            throw firstErr;
          }
        }

        if (!isOpenRef.current) {
          await stopScanner();
          return;
        }

        // Safely upgrade active camera stream to crisp 720p HD + continuous autofocus when supported
        try {
          const caps = html5QrCode.getRunningTrackCapabilities() as any;
          const constraints: any = {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };
          if (caps?.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            constraints.advanced = [{ focusMode: 'continuous' }];
          }
          await html5QrCode.applyVideoConstraints(constraints);
        } catch {
          // Non-fatal on browsers/iOS that restrict runtime constraints
        }

        setIsScanning(true);
        setIsStarting(false);

        // Start full-HD native BarcodeDetector loop alongside html5-qrcode (if browser supports it)
        startNativeVideoDetectorLoop();

        // Check flashlight + zoom capabilities
        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities() as any;
          const settings = html5QrCode.getRunningTrackSettings() as any;

          setHasTorch(Boolean(capabilities && 'torch' in capabilities));

          if (capabilities?.zoom && typeof capabilities.zoom.min === 'number' && capabilities.zoom.max > capabilities.zoom.min) {
            setZoomRange({
              min: capabilities.zoom.min,
              max: Math.min(capabilities.zoom.max, 4), // cap UI slider to usable 4x
              step: capabilities.zoom.step || 0.1,
              current: settings?.zoom || capabilities.zoom.min || 1,
            });
          } else {
            setZoomRange(null);
          }

          if (settings?.deviceId) {
            setSelectedCameraId(settings.deviceId);
          }
        } catch {
          setHasTorch(false);
          setZoomRange(null);
        }

        // Populate available cameras for lens/camera switcher
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices.map((d, i) => ({ id: d.id, label: d.label || `កាមេរ៉ា ${i + 1}` })));
            if (!cameraIdToUse) {
              try {
                const activeDeviceId = (html5QrCode.getRunningTrackSettings() as any)?.deviceId;
                if (activeDeviceId) setSelectedCameraId(activeDeviceId);
              } catch {}
            }
          }
        } catch (e) {
          console.warn('Camera enumeration error:', e);
        }
      } catch (err: unknown) {
        console.error('Camera start error:', err);
        setIsScanning(false);
        setIsStarting(false);

        const errString = String(err);
        const isPermissionDenied =
          errString.includes('NotAllowedError') ||
          errString.includes('Permission') ||
          errString.includes('denied');

        const isNotFound =
          errString.includes('NotFoundError') ||
          errString.includes('DevicesNotFoundError');

        if (isPermissionDenied) {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          setErrorMsg({
            title: isIOS ? 'សូមអនុញ្ញាត Camera លើ Safari (iOS)' : 'សូមអនុញ្ញាត Camera លើ Chrome/Android',
            desc: isIOS
              ? 'សូមចុចលើប៊ូតុង "aA" នៅខាងឆ្វេង Search bar > Website Settings > Camera > ជ្រើសរើស "Allow" រួច Refresh ទំព័រឡើងវិញ។'
              : 'សូមចុចលើសញ្ញាចុច ៣ (Menu) នៅលើ Chrome > Settings > Site settings > Camera > អនុញ្ញាត (Allow)។',
            isPermission: true,
          });
        } else if (isNotFound) {
          setErrorMsg({
            title: 'រកមិនឃើញកាមេរ៉ាទេ',
            desc: 'ឧបករណ៍របស់អ្នកមិនមានកាមេរ៉ា ឬកាមេរ៉ាកំពុងជាប់ប្រើប្រាស់ដោយកម្មវិធីផ្សេង។',
          });
        } else {
          setErrorMsg({
            title: 'មិនអាចបើកកាមេរ៉ាបានទេ',
            desc: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        setIsStarting(false);
        isStartingRef.current = false;
      }
    },
    [stopScanner, startNativeVideoDetectorLoop]
  );

  // Open/close lifecycle strictly keyed on isOpen
  useEffect(() => {
    if (isOpen) {
      setLastScannedBadge(null);
      startScanner();
    } else {
      stopScanner();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!hasTorch || !scannerRef.current) return;
    const nextState = !torchOn;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Adjust camera zoom (helpful on phone cameras for small/distant barcodes)
  const handleZoomChange = async (newZoom: number) => {
    if (!scannerRef.current || !zoomRange) return;
    setZoomRange((prev) => (prev ? { ...prev, current: newZoom } : null));
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ zoom: newZoom } as unknown as MediaTrackConstraintSet],
      });
    } catch (err) {
      console.warn('Zoom constraint warning:', err);
    }
  };

  // Switch camera cleanly
  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    await startScanner(cameraId);
  };

  const handleNextCamera = async () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    await startScanner(nextCam.id);
  };

  // High-resolution photo capture fallback (uses phone's native crisp camera photo if live stream blurs)
  const handlePhotoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const tempId = 'camera-photo-scan-tmp';
    let tempEl = document.getElementById(tempId);
    if (!tempEl) {
      tempEl = document.createElement('div');
      tempEl.id = tempId;
      tempEl.style.display = 'none';
      document.body.appendChild(tempEl);
    }

    try {
      const fileScanner = new Html5Qrcode(tempId, {
        formatsToSupport: SUPPORTED_HTML5_FORMATS,
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      const res = await fileScanner.scanFileV2(file, false);
      fileScanner.clear();
      if (res?.decodedText) {
        lastScannedTimeRef.current = 0; // allow immediate trigger
        await handleBarcodeDecodedRef.current(res.decodedText);
      }
    } catch {
      sound.playErrorBuzz();
      setLastScannedBadge({
        barcode: '',
        name: 'ស្កេនរូបភាពមិនឃើញ Barcode ទេ',
        khmerName: 'សូមថតឱ្យជិត និងច្បាស់ជាងនេះ',
        outcome: 'ignored',
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setLastScannedBadge(null), 2800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg bg-slate-900 rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border-0 sm:border border-slate-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 bg-slate-900/95 border-b border-slate-800 text-white z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm sm:text-base">ស្កេន Barcode តាមទូរស័ព្ទ</h3>
                {scanCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-bold">
                    {scanCount} មុខ
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">គាំទ្រ Code128, EAN-13, UPC និង QR Code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition"
            aria-label="បិទ"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Camera Video Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] sm:min-h-[380px] overflow-hidden">
          <div id={readerElementId} className="w-full h-full" />

          {/* Hidden file input for Photo Capture fallback */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoScan}
            className="hidden"
          />

          {/* Loading Indicator */}
          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 text-white gap-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">កំពុងបើកដំណើរការកាមេរ៉ា...</p>
            </div>
          )}

          {/* Viewfinder Box & Red Laser Beam */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
              <div className="relative w-full max-w-[300px] h-40 border-2 border-blue-500/80 rounded-2xl shadow-[0_0_25px_rgba(59,130,246,0.35)] flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-t-2 border-l-2 border-blue-400 rounded-tl"></div>
                  <div className="w-5 h-5 border-t-2 border-r-2 border-blue-400 rounded-tr"></div>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_#ef4444] animate-pulse my-auto"></div>
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-b-2 border-l-2 border-blue-400 rounded-bl"></div>
                  <div className="w-5 h-5 border-b-2 border-r-2 border-blue-400 rounded-br"></div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-white/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm shadow">
                ដាក់ Barcode ឱ្យចំកណ្តាលប្រអប់ខ្សែក្រហម (ចម្ងាយ ~15-25cm)
              </p>
            </div>
          )}

          {/* Optional Hardware Zoom Slider */}
          {isScanning && !errorMsg && zoomRange && (
            <div className="absolute bottom-3 inset-x-6 flex items-center gap-2.5 bg-black/65 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-20">
              <ZoomIn className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoomRange.current}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-white w-8 text-right shrink-0">
                {zoomRange.current.toFixed(1)}x
              </span>
            </div>
          )}

          {/* Accurate Status Toast Badge */}
          {lastScannedBadge && (
            <div
              className={`absolute top-4 inset-x-4 max-w-sm mx-auto text-white px-3.5 py-2 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 z-30 border ${
                lastScannedBadge.outcome === 'added'
                  ? 'bg-emerald-600/95 border-emerald-400/40'
                  : lastScannedBadge.outcome === 'already_exists'
                  ? 'bg-amber-600/95 border-amber-400/40'
                  : 'bg-rose-600/95 border-rose-400/40'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {lastScannedBadge.outcome === 'ignored' ? (
                  <AlertCircle className="w-5 h-5 text-rose-200 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-white/90 shrink-0" />
                )}
                <div className="min-w-0 truncate text-left">
                  <p className="font-bold truncate text-white text-xs">
                    {lastScannedBadge.name || `Barcode: ${lastScannedBadge.barcode}`}
                  </p>
                  {lastScannedBadge.khmerName ? (
                    <p className="text-[10px] text-white/90 truncate">
                      {lastScannedBadge.khmerName}
                      {lastScannedBadge.barcode ? (
                        <>
                          {' '}• <span className="font-mono">{lastScannedBadge.barcode}</span>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    lastScannedBadge.barcode && (
                      <p className="text-[10px] text-white/90 font-mono">{lastScannedBadge.barcode}</p>
                    )
                  )}
                </div>
              </div>
              {lastScannedBadge.outcome !== 'ignored' && (
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold shrink-0">
                  {lastScannedBadge.outcome === 'added' ? '+ ចូលតារាង' : 'មានរួចហើយ'}
                </span>
              )}
            </div>
          )}

          {/* Error / Permission Guidance View */}
          {errorMsg && (
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 bg-slate-900/98 border border-rose-500/50 p-5 rounded-3xl text-center text-white shadow-2xl z-30 max-w-md mx-auto">
              <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-sm sm:text-base text-rose-200 mb-1">{errorMsg.title}</h4>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">{errorMsg.desc}</p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => startScanner(selectedCameraId)}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5 px-4 rounded-xl text-xs font-semibold transition active:scale-95 shadow-lg shadow-blue-600/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>សាកល្បងបើកកាមេរ៉ាម្តងទៀត</span>
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-xl text-xs font-semibold transition active:scale-95"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>ថតរូប Barcode ដើម្បីស្កេន</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
                >
                  បិទ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 text-white shrink-0">
          {cameras.length > 1 ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={handleNextCamera}
                title="ប្តូរកាមេរ៉ា (Switch Camera)"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 active:scale-95 transition shrink-0"
              >
                <SwitchCamera className="w-4 h-4 text-blue-400" />
              </button>
              <CustomSelect<string>
                value={selectedCameraId}
                onChange={handleCameraChange}
                options={cameraOptions}
                variant="dark"
                size="md"
                direction="up"
                fullWidth
                className="flex-1 min-w-0"
                buttonClassName="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-1 truncate">
              <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>ស្កេនបន្តបន្ទាប់ដោយមិនបាច់បិទផ្ទាំង</span>
            </div>
          )}

          {/* Photo fallback button (always available for ultra-sharp camera capture) */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            title="ថតរូប Barcode ច្បាស់ដើម្បីស្កេន"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white active:scale-95 transition shrink-0"
          >
            <ImageIcon className="w-4 h-4 text-indigo-400" />
          </button>

          {/* Flashlight button */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`px-3 py-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold shrink-0 active:scale-95 ${
                torchOn
                  ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{torchOn ? 'បិទភ្លើង' : 'បើកភ្លើង'}</span>
            </button>
          )}

          {/* Close / Done button */}
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition shrink-0"
          >
            រួចរាល់
          </button>
        </div>
      </div>
    </div>
  );
};

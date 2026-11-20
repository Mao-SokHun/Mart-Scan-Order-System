import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, AlertCircle, CheckCircle2, SwitchCamera, HelpCircle, Sparkles } from 'lucide-react';
import { sound } from '../utils/audio';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan
}) => {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ title: string; desc: string; isPermission?: boolean } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [engineType, setEngineType] = useState<'native' | 'html5'>('html5');

  // References
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeStreamRef = useRef<MediaStream | null>(null);
  const nativeScanTimerRef = useRef<number | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const toastTimerRef = useRef<number | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const readerElementId = 'camera-barcode-reader';

  // Handle successful scan
  const handleBarcodeDecoded = useCallback((decodedText: string) => {
    let cleanCode = decodedText.trim();
    if (cleanCode.endsWith('.0')) cleanCode = cleanCode.slice(0, -2);
    if (!cleanCode) return;

    const now = Date.now();
    const prevCode = lastScannedCodeRef.current;
    const prevTime = lastScannedTimeRef.current;

    // Intelligent debounce:
    // If the same barcode is scanned: ignore if within 2000ms
    // If a different barcode is scanned: allow after only 400ms for fast shelf scanning
    if (cleanCode === prevCode && now - prevTime < 2000) {
      return;
    }
    if (cleanCode !== prevCode && now - prevTime < 400) {
      return;
    }

    lastScannedCodeRef.current = cleanCode;
    lastScannedTimeRef.current = now;
    setLastScannedCode(cleanCode);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setLastScannedCode(null), 2500);
    setScanCount(prev => prev + 1);

    // Call onScan (handleScan will play beep and show toast)
    onScan(cleanCode);
  }, [onScan]);

  // Clean stop for all camera engines and hardware tracks
  const stopScanner = useCallback(async () => {
    // 1. Stop Native BarcodeDetector loop & stream
    if (nativeScanTimerRef.current) {
      window.clearInterval(nativeScanTimerRef.current);
      nativeScanTimerRef.current = null;
    }
    if (nativeStreamRef.current) {
      nativeStreamRef.current.getTracks().forEach(track => track.stop());
      nativeStreamRef.current = null;
    }
    if (nativeVideoRef.current) {
      nativeVideoRef.current.srcObject = null;
    }

    // 2. Stop Html5Qrcode fallback
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping fallback scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }

    // 3. Guarantee all hardware tracks are stopped immediately
    try {
      const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElem.srcObject = null;
      }
    } catch {}

    setIsScanning(false);
    setIsStarting(false);
    setTorchOn(false);
  }, []);

  // Enumerate cameras for switcher
  const enumerateCameras = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map((d, idx) => ({
            id: d.deviceId,
            label: d.label || `កាមេរ៉ា ${idx + 1}`
          }));

        if (videoDevices.length > 0) {
          setCameras(videoDevices);
          if (!selectedCameraId) {
            const rear = videoDevices.find(d =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment') ||
              d.label.toLowerCase().includes('0')
            );
            setSelectedCameraId(rear ? rear.id : videoDevices[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Camera enumeration error:', e);
    }
  }, [selectedCameraId]);

  // Main launcher: Prioritizes Native 60 FPS Hardware BarcodeDetector
  const startScanner = useCallback(async (cameraIdToUse?: string) => {
    await stopScanner();
    setErrorMsg(null);
    setIsStarting(true);
    sound.warmup();

    // Check secure context (HTTPS / localhost requirement for mobile cameras)
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setErrorMsg({
        title: 'ត្រូវការ HTTPS ដើម្បីបើកកាមេរ៉ា',
        desc: 'កម្មវិធីរុករក (Safari/Chrome) តម្រូវឱ្យប្រើប្រាស់ HTTPS មានសុវត្ថិភាព។ សូមចូលតាមរយៈ https:// ឧទាហរណ៍ Vercel deployment។'
      });
      setIsStarting(false);
      return;
    }

    // =========================================================================
    // ⚡ ENGINE 1: NATIVE HARDWARE ACCELERATED BARCODE DETECTOR (Android & iOS 17+)
    // =========================================================================
    const hasNativeBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    if (hasNativeBarcodeDetector) {
      try {
        let formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
        try {
          const supported = await (window as any).BarcodeDetector.getSupportedFormats?.();
          if (Array.isArray(supported) && supported.length > 0) {
            formats = formats.filter(f => supported.includes(f));
          }
        } catch {}

        const detector = new (window as any).BarcodeDetector({ formats });

        // Smooth 720p stream prevents mobile CPU/GPU choking
        const constraints: MediaStreamConstraints = {
          video: cameraIdToUse
            ? {
                deviceId: { exact: cameraIdToUse },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
              },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isOpenRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        nativeStreamRef.current = stream;
        setEngineType('native');

        if (nativeVideoRef.current) {
          nativeVideoRef.current.srcObject = stream;
          nativeVideoRef.current.setAttribute('playsinline', 'true');
          nativeVideoRef.current.setAttribute('webkit-playsinline', 'true');
          await nativeVideoRef.current.play();
        }

        // Check torch capabilities
        const track = stream.getVideoTracks()[0];
        if (track && (track as any).getCapabilities) {
          try {
            const capabilities = (track as any).getCapabilities();
            setHasTorch(Boolean(capabilities && 'torch' in capabilities));
          } catch {
            setHasTorch(false);
          }
        }

        // Hardware-accelerated scan loop:
        // Runs in <5ms every 90ms, while video preview runs at 60 FPS silky smooth!
        let isDetecting = false;
        nativeScanTimerRef.current = window.setInterval(async () => {
          if (!isOpenRef.current || isDetecting || !nativeVideoRef.current) return;
          if (nativeVideoRef.current.readyState < 2) return;

          try {
            isDetecting = true;
            const barcodes = await detector.detect(nativeVideoRef.current);
            if (barcodes && barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              if (code) {
                handleBarcodeDecoded(code);
              }
            }
          } catch {
            // Ignore non-barcode frame detection errors
          } finally {
            isDetecting = false;
          }
        }, 90);

        setIsScanning(true);
        setIsStarting(false);
        enumerateCameras();
        return;
      } catch (nativeErr) {
        console.warn('Native BarcodeDetector stream failed, falling back to Html5Qrcode:', nativeErr);
        if (nativeStreamRef.current) {
          nativeStreamRef.current.getTracks().forEach(t => t.stop());
          nativeStreamRef.current = null;
        }
      }
    }

    // =========================================================================
    // 🛡️ ENGINE 2: OPTIMIZED HTML5-QRCODE FALLBACK (Older Browsers)
    // =========================================================================
    const elem = document.getElementById(readerElementId);
    if (!elem) {
      setIsStarting(false);
      return;
    }

    setEngineType('html5');

    try {
      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false // Avoid dual alternating overhead
        }
      });
      scannerRef.current = html5QrCode;

      // Restrict resolution to 720p so mobile phones don't freeze
      const cameraConfig = cameraIdToUse
        ? { deviceId: cameraIdToUse, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } };

      const config = {
        fps: 10, // 10 FPS prevents CPU thermal throttling and eliminates video stutter
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const w = Math.min(Math.floor(viewfinderWidth * 0.85), 320);
          const h = Math.min(Math.floor(viewfinderHeight * 0.40), 160);
          return { width: Math.max(160, w), height: Math.max(90, h) };
        },
        aspectRatio: 1.777778,
        disableFlip: false
      };

      await html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => handleBarcodeDecoded(decodedText),
        () => {} // Silent ignore
      );

      if (!isOpenRef.current) {
        try {
          if (html5QrCode.isScanning) await html5QrCode.stop();
          await html5QrCode.clear();
        } catch {}
        try {
          const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement;
          if (videoElem && videoElem.srcObject) {
            const stream = videoElem.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoElem.srcObject = null;
          }
        } catch {}
        return;
      }

      setIsScanning(true);
      setIsStarting(false);

      // Check torch capabilities
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        setHasTorch(Boolean(capabilities && 'torch' in capabilities));
      } catch {
        setHasTorch(false);
      }

      enumerateCameras();
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
        if (isIOS) {
          setErrorMsg({
            title: 'សូមអនុញ្ញាត Camera លើ Safari (iOS)',
            desc: 'សូមចុចលើប៊ូតុង "aA" នៅខាងឆ្វេង Search bar > Website Settings > Camera > ជ្រើសរើស "Allow" រួច Refresh ទំព័រឡើងវិញ។',
            isPermission: true
          });
        } else {
          setErrorMsg({
            title: 'សូមអនុញ្ញាត Camera លើ Chrome/Android',
            desc: 'សូមចុចលើសញ្ញាចុច ៣ (Menu) នៅលើ Chrome > Settings > Site settings > Camera > អនុញ្ញាត (Allow)។',
            isPermission: true
          });
        }
      } else if (isNotFound) {
        setErrorMsg({
          title: 'រកមិនឃើញកាមេរ៉ាទេ',
          desc: 'ឧបករណ៍របស់អ្នកមិនមានកាមេរ៉ា ឬកាមេរ៉ាកំពុងជាប់ប្រើប្រាស់ដោយកម្មវិធីផ្សេង។'
        });
      } else {
        setErrorMsg({
          title: 'មិនអាចបើកកាមេរ៉ាបានទេ',
          desc: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }, [handleBarcodeDecoded, stopScanner, enumerateCameras]);

  // Initial load when modal opens & Escape key listener
  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner, onClose]);

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!hasTorch) return;
    const nextState = !torchOn;

    if (engineType === 'native' && nativeStreamRef.current) {
      const track = nativeStreamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          await (track as any).applyConstraints({
            advanced: [{ torch: nextState }]
          });
          setTorchOn(nextState);
        } catch (err) {
          console.warn('Native torch error:', err);
        }
      }
    } else if (scannerRef.current) {
      try {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: nextState } as MediaTrackConstraintSet]
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Fallback torch error:', err);
      }
    }
  };

  // Switch between available cameras
  const handleSwitchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    startScanner(nextCam.id);
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
                {engineType === 'native' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-1 border border-emerald-500/30">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Smooth 60FPS</span>
                  </span>
                )}
                {scanCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-bold">
                    {scanCount} មុខ
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">ល្បឿនស្កេនលឿន និងរលូន Smooth</p>
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
          {/* Native Hardware Video (Primary Smooth Engine) */}
          <video
            ref={nativeVideoRef}
            playsInline
            autoPlay
            muted
            className={`w-full h-full object-cover ${engineType === 'native' ? 'block' : 'hidden'}`}
          />

          {/* html5-qrcode container (Fallback Engine) */}
          <div
            id={readerElementId}
            className={`w-full h-full ${engineType === 'html5' ? 'block' : 'hidden'}`}
          />

          {/* Loading Indicator */}
          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 text-white gap-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">កំពុងបើកដំណើរការកាមេរ៉ា (Hardware Accelerated)...</p>
            </div>
          )}

          {/* Scan Target Box & Red Laser Indicator */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
              <div className="relative w-full max-w-[280px] h-40 border-2 border-blue-500/80 rounded-2xl shadow-[0_0_25px_rgba(59,130,246,0.35)] flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-t-2 border-l-2 border-blue-400 rounded-tl"></div>
                  <div className="w-5 h-5 border-t-2 border-r-2 border-blue-400 rounded-tr"></div>
                </div>
                {/* Red Laser Scanning Beam */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_#ef4444] animate-pulse my-auto"></div>
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-b-2 border-l-2 border-blue-400 rounded-bl"></div>
                  <div className="w-5 h-5 border-b-2 border-r-2 border-blue-400 rounded-br"></div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-white/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm shadow">
                ដាក់ Barcode ឱ្យចំកណ្តាលខ្សែក្រហម
              </p>
            </div>
          )}

          {/* Realtime Toast Badge for recent scan */}
          {lastScannedCode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600/95 text-white px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xl backdrop-blur-md animate-bounce z-30">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>បានស្កេន: {lastScannedCode}</span>
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
          {/* Camera switcher */}
          {cameras.length > 1 ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={handleSwitchCamera}
                title="ប្តូរកាមេរ៉ា (Switch Camera)"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 active:scale-95 transition shrink-0"
              >
                <SwitchCamera className="w-4 h-4 text-blue-400" />
              </button>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startScanner(e.target.value);
                }}
                className="w-full bg-slate-800 border border-slate-700 text-xs rounded-xl px-2.5 py-2.5 text-slate-200 focus:outline-none truncate"
              >
                {cameras.map((cam, idx) => (
                  <option key={cam.id} value={cam.id}>
                    📷 {cam.label || `កាមេរ៉ា ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-1 truncate">
              <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>ស្កេនបន្តបន្ទាប់ដោយមិនបាច់បិទផ្ទាំង</span>
            </div>
          )}

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

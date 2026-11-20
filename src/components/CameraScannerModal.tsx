import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, AlertCircle, CheckCircle2, SwitchCamera, HelpCircle } from 'lucide-react';
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

  // References to prevent race conditions and concurrent calls
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
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
    // If a different barcode is scanned: allow after only 450ms for fast shelf scanning
    if (cleanCode === prevCode && now - prevTime < 2000) {
      return;
    }
    if (cleanCode !== prevCode && now - prevTime < 450) {
      return;
    }

    lastScannedCodeRef.current = cleanCode;
    lastScannedTimeRef.current = now;
    setLastScannedCode(cleanCode);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setLastScannedCode(null), 2500);
    setScanCount(prev => prev + 1);

    // Immediate sound feedback
    sound.playSuccessBeep();

    // Notify parent
    onScan(cleanCode);
  }, [onScan]);

  // Clean stop for camera hardware and scanner instance
  const stopScanner = useCallback(async () => {
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

    // Guarantee all hardware tracks are stopped immediately
    try {
      const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          try { track.stop(); } catch {}
        });
        videoElem.srcObject = null;
      }
    } catch {}

    setIsScanning(false);
    setIsStarting(false);
    setTorchOn(false);
    isStoppingRef.current = false;
  }, []);

  // Main launcher with robust device fallback
  const startScanner = useCallback(async (cameraIdToUse?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    setErrorMsg(null);
    sound.warmup();

    // Stop previous instance if running
    await stopScanner();

    // Check secure context (HTTPS / localhost requirement for mobile cameras)
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setErrorMsg({
        title: 'ត្រូវការ HTTPS ដើម្បីបើកកាមេរ៉ា',
        desc: 'កម្មវិធីរុករកតម្រូវឱ្យប្រើប្រាស់ HTTPS មានសុវត្ថិភាព។ សូមចូលតាមរយៈ https:// ឧទាហរណ៍ Vercel deployment។'
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
          useBarCodeDetectorIfSupported: true // Native hardware acceleration on iOS & Android
        }
      });
      scannerRef.current = html5QrCode;

      // Scan config: 20 FPS, full-frame decode (no qrbox to prevent coordinate offset & duplicate frames)
      const config = {
        fps: 20,
        disableFlip: false
      };

      // Camera selector: if cameraIdToUse is provided, use exact deviceId;
      // otherwise, try environment (back) camera first.
      const initialCameraConfig = cameraIdToUse
        ? { deviceId: cameraIdToUse }
        : { facingMode: 'environment' };

      try {
        await html5QrCode.start(
          initialCameraConfig,
          config,
          (decodedText) => handleBarcodeDecoded(decodedText),
          () => {} // Silent ignore frame without barcode
        );
      } catch (firstErr) {
        console.warn('Initial camera start failed, attempting fallback camera:', firstErr);
        // Fallback for PC / Laptops with only front webcam or USB webcam
        if (!cameraIdToUse) {
          try {
            await html5QrCode.start(
              { facingMode: 'user' },
              config,
              (decodedText) => handleBarcodeDecoded(decodedText),
              () => {}
            );
          } catch {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
              await html5QrCode.start(
                { deviceId: devices[0].id },
                config,
                (decodedText) => handleBarcodeDecoded(decodedText),
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

      setIsScanning(true);
      setIsStarting(false);

      // Check flashlight / torch capabilities
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        setHasTorch(Boolean(capabilities && 'torch' in capabilities));
      } catch {
        setHasTorch(false);
      }

      // Populate available cameras for switcher
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices.map((d, i) => ({ id: d.id, label: d.label || `កាមេរ៉ា ${i + 1}` })));
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
    } finally {
      isStartingRef.current = false;
    }
  }, [handleBarcodeDecoded, stopScanner]);

  // Modal open/close lifecycle - only depends on isOpen to avoid infinite re-render loops
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
  }, [isOpen]); // Strict dependency to prevent re-render jumps!

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!hasTorch || !scannerRef.current) return;
    const nextState = !torchOn;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Switch camera cleanly
  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    await startScanner(cameraId);
  };

  const handleNextCamera = async () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    await startScanner(nextCam.id);
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
          {/* Main Camera Video Container */}
          <div
            id={readerElementId}
            className="w-full h-full"
          />

          {/* Loading Indicator */}
          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 text-white gap-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">កំពុងបើកដំណើរការកាមេរ៉ា...</p>
            </div>
          )}

          {/* Clean Unified Viewfinder Box & Red Laser Scanning Line */}
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
                onClick={handleNextCamera}
                title="ប្តូរកាមេរ៉ា (Switch Camera)"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 active:scale-95 transition shrink-0"
              >
                <SwitchCamera className="w-4 h-4 text-blue-400" />
              </button>
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
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
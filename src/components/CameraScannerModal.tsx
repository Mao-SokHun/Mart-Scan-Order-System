import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const readerElementId = 'camera-barcode-reader';

  // Handle successful scan
  const handleBarcodeDecoded = useCallback((decodedText: string) => {
    const now = Date.now();
    // Prevent multiple rapid scans of the same code within 1.5 seconds
    if (decodedText === lastScannedCode && now - lastScannedTimeRef.current < 1500) {
      return;
    }
    lastScannedTimeRef.current = now;
    setLastScannedCode(decodedText);
    sound.playSuccessBeep();
    onScan(decodedText);
  }, [lastScannedCode, onScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setIsScanning(false);
        setTorchOn(false);
      }
    }
  }, []);

  const startScanner = useCallback(async (cameraIdToUse?: string) => {
    await stopScanner();
    setErrorMsg(null);

    const elem = document.getElementById(readerElementId);
    if (!elem) return;

    try {
      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });
      scannerRef.current = html5QrCode;

      const cameraConfig = cameraIdToUse
        ? { deviceId: { exact: cameraIdToUse } }
        : { facingMode: 'environment' };

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Responsive scan area rectangular for 1D barcodes
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const width = Math.floor(minEdge * 0.85);
          const height = Math.floor(minEdge * 0.55);
          return { width: Math.max(250, width), height: Math.max(150, height) };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => handleBarcodeDecoded(decodedText),
        () => {
          // ignore scan frame errors
        }
      );

      setIsScanning(true);

      // Check torch capabilities
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: unknown) {
      console.error('Camera start error:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NotAllowedError') || message.includes('Permission')) {
        setErrorMsg('សូមអនុញ្ញាត (Allow) ឱ្យ Browser ប្រើប្រាស់ Camera របស់អ្នក ដើម្បីស្កេន Barcode។');
      } else {
        setErrorMsg(`មិនអាចបើក Camera បានទេ: ${message}`);
      }
      setIsScanning(false);
    }
  }, [handleBarcodeDecoded, stopScanner]);

  // Load available cameras when modal opens
  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (!isMounted) return;
          if (devices && devices.length > 0) {
            setCameras(devices);
            // Prefer back camera (environment)
            const backCam = devices.find(
              (d) =>
                d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
            );
            const defaultCamId = backCam ? backCam.id : devices[0].id;
            setSelectedCameraId(defaultCamId);
            startScanner(defaultCamId);
          } else {
            // Try starting directly with facingMode: 'environment'
            startScanner();
          }
        })
        .catch((err) => {
          console.warn('Could not list cameras:', err);
          // Still try generic start
          startScanner();
        });

      return () => {
        isMounted = false;
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.error('Torch toggle failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900/90 border-b border-slate-800 text-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">ស្កេន Barcode តាមកាមេរ៉ា</h3>
              <p className="text-xs text-slate-400">តម្រង់កាមេរ៉ាទៅលើ Barcode លើធ្នើរ ឬទំនិញ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Camera Video Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[340px] overflow-hidden">
          {/* Scanner Viewfinder Box */}
          <div id={readerElementId} className="w-full h-full"></div>

          {/* Laser animation indicator overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-72 h-44 border-2 border-blue-500/80 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] flex flex-col justify-between p-1.5">
                {/* Corner markers */}
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-blue-400"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-blue-400"></div>
                </div>
                {/* Animated scanning laser line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse my-auto"></div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-blue-400"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-blue-400"></div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback badge for recent scan */}
          {lastScannedCode && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600/90 text-white px-4 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md animate-bounce">
              <CheckCircle2 className="w-4 h-4" />
              <span>បានស្កេន: {lastScannedCode}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 bg-rose-950/90 border border-rose-700/80 p-4 rounded-2xl text-center text-rose-200 text-sm shadow-xl">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <p className="font-medium mb-1">មានបញ្ហាក្នុងការបើកកាមេរ៉ា</p>
              <p className="text-xs text-rose-300 mb-3">{errorMsg}</p>
              <button
                onClick={() => startScanner(selectedCameraId)}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                សាកល្បងម្តងទៀត
              </button>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 text-white">
          {/* Camera switcher */}
          {cameras.length > 1 ? (
            <div className="flex-1">
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startScanner(e.target.value);
                }}
                className="w-full bg-slate-800 border border-slate-700 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    📷 {cam.label || `Camera ${cam.id.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              💡 គន្លឹះ៖ ដាក់ Barcode ឱ្យចំកណ្តាលប្រអប់ស្កេន
            </div>
          )}

          {/* Torch button */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium ${
                torchOn
                  ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{torchOn ? 'បិទភ្លើង' : 'បើកភ្លើង'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-medium transition"
          >
            រួចរាល់
          </button>
        </div>
      </div>
    </div>
  );
};

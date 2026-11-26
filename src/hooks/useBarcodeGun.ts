import { useEffect, useRef, useState } from 'react';

interface UseBarcodeGunOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxDelayMs?: number;
  enabled?: boolean;
}

/**
 * Universal Hardware Barcode Scanner Gun Hook
 * Works with:
 * - USB Wired Barcode Guns (Plug & Play)
 * - 2.4GHz Wireless USB Dongle Scanners
 * - Bluetooth POS Barcode Scanners
 * - Desktop Hands-Free Omni-directional Scanners (POS Mart Scanners)
 * 
 * Works anywhere on the webpage without needing to focus on an input box!
 */
export const useBarcodeGun = ({
  onScan,
  minChars = 3,
  maxDelayMs = 75, // Supports both fast USB (<20ms) and wireless Bluetooth (<75ms)
  enabled = true,
}: UseBarcodeGunOptions) => {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isReceivingGunInput, setIsReceivingGunInput] = useState<boolean>(false);
  
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const lastKeystrokeCharRef = useRef<string>('');
  const lastKeystrokeTimeRef = useRef<number>(0);
  const lastKeystrokeTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const processBuffer = () => {
      const code = bufferRef.current.trim();
      if (code.length >= minChars) {
        setLastScanned(code);
        setIsReceivingGunInput(false);
        bufferRef.current = '';
        lastKeystrokeCharRef.current = '';
        onScanRef.current(code);
      } else {
        bufferRef.current = '';
        lastKeystrokeCharRef.current = '';
        setIsReceivingGunInput(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keyboard shortcuts (Ctrl+C, Alt+Tab, etc.)
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const currentTime = performance.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const isBarcodeSpecificInput = target && target.getAttribute('data-barcode-input') === 'true';

      // Handle standard Scanner Terminator keys: Enter, Tab, or NumpadEnter
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.length >= minChars) {
          e.preventDefault();
          e.stopPropagation();

          // If focused on an input, blur it so barcode doesn't dirty the field
          if (isInput && !isBarcodeSpecificInput && target instanceof HTMLInputElement) {
            target.blur();
          }

          processBuffer();
        } else {
          bufferRef.current = '';
        }
        lastKeystrokeCharRef.current = '';
        return;
      }

      // Scanner sends single printable characters (numbers, letters, hyphens)
      if (e.key.length === 1) {
        // If we were already receiving rapid scanner gun input
        if (bufferRef.current.length > 0) {
          if (timeDiff <= maxDelayMs) {
            bufferRef.current += e.key;
            // Prevent scanner digits from leaking into focused inputs
            if (isInput && !isBarcodeSpecificInput) {
              e.preventDefault();
              e.stopPropagation();
            }
            if (bufferRef.current.length >= 3) {
              setIsReceivingGunInput(true);
            }
          } else {
            // Gap was too long; reset buffer
            bufferRef.current = '';
            setIsReceivingGunInput(false);
          }
        } else {
          // bufferRef is currently empty. Check if this keystroke is the second character of a scanner burst!
          // Inside a normal text/number input, require stricter machine speed (<45ms) so fast human typing is never stolen
          const burstThreshold = (isInput && !isBarcodeSpecificInput) ? Math.min(maxDelayMs, 45) : maxDelayMs;
          const timeSincePrev = currentTime - lastKeystrokeTimeRef.current;
          if (timeSincePrev <= burstThreshold && lastKeystrokeCharRef.current) {
            // Machine speed burst detected!
            bufferRef.current = lastKeystrokeCharRef.current + e.key;
            setIsReceivingGunInput(true);

            // If the first character leaked into a non-barcode input, clean it up and blur
            if (lastKeystrokeTargetRef.current && lastKeystrokeTargetRef.current === target && !isBarcodeSpecificInput) {
              e.preventDefault();
              e.stopPropagation();
              const inputEl = lastKeystrokeTargetRef.current;
              if (inputEl.value.endsWith(lastKeystrokeCharRef.current)) {
                inputEl.value = inputEl.value.slice(0, -lastKeystrokeCharRef.current.length);
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
              }
              inputEl.blur();
            }
          } else {
            // If normal background (not typing in another field), start buffer
            if (!isInput || isBarcodeSpecificInput) {
              bufferRef.current = e.key;
            }
          }
        }

        lastKeystrokeCharRef.current = e.key;
        lastKeystrokeTimeRef.current = currentTime;
        lastKeystrokeTargetRef.current = (isInput && !isBarcodeSpecificInput && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement))
          ? target
          : null;

        // Auto-complete fallback for scanners that have NO suffix (no Enter configured)
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          // If 8+ digits arrived rapidly (standard barcode) and scanner paused, process it
          if (bufferRef.current.length >= 8) {
            processBuffer();
          } else {
            bufferRef.current = '';
            setIsReceivingGunInput(false);
          }
        }, 120);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, minChars, maxDelayMs]);

  return {
    lastScanned,
    isReceivingGunInput,
  };
};

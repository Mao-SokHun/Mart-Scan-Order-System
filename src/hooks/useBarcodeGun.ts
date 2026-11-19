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
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const processBuffer = () => {
      const code = bufferRef.current.trim();
      if (code.length >= minChars) {
        setLastScanned(code);
        setIsReceivingGunInput(false);
        bufferRef.current = '';
        onScan(code);
      } else {
        bufferRef.current = '';
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

      // If user is human typing slowly in another input (like search box), let normal input handle it
      if (isInput && !isBarcodeSpecificInput && timeDiff > maxDelayMs && bufferRef.current.length === 0) {
        return;
      }

      // Handle standard Scanner Terminator keys: Enter, Tab, or NumpadEnter
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.length >= minChars) {
          e.preventDefault();
          e.stopPropagation();

          // If focused on an input, blur it or clear it so barcode doesn't dirty the field
          if (isInput && !isBarcodeSpecificInput && target instanceof HTMLInputElement) {
            target.blur();
          }

          processBuffer();
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // Scanner sends single printable characters (numbers, letters, hyphens)
      if (e.key.length === 1) {
        // If the gap between keys is longer than scanner speed, reset buffer (it was human typing)
        if (timeDiff > maxDelayMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }

        bufferRef.current += e.key;

        // Scanner guns type rapidly: if 3+ characters arrived under scanner latency, show indicator
        if (bufferRef.current.length >= 3) {
          setIsReceivingGunInput(true);
        }

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
  }, [enabled, minChars, maxDelayMs, onScan]);

  return {
    lastScanned,
    isReceivingGunInput,
  };
};

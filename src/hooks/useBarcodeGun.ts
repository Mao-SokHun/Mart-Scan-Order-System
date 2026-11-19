import { useEffect, useRef, useState } from 'react';

interface UseBarcodeGunOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxDelayMs?: number;
  enabled?: boolean;
}

export const useBarcodeGun = ({
  onScan,
  minChars = 3,
  maxDelayMs = 50, // scanner guns send keys very fast (<30-50ms)
  enabled = true,
}: UseBarcodeGunOptions) => {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isReceivingGunInput, setIsReceivingGunInput] = useState<boolean>(false);
  
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture function keys, alt, ctrl, meta
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const currentTime = performance.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const isBarcodeSpecificInput = target && target.getAttribute('data-barcode-input') === 'true';

      // If user is typing in a regular form input and it's slow (human typing), let normal input handle it
      if (isInput && !isBarcodeSpecificInput && timeDiff > maxDelayMs && bufferRef.current.length === 0) {
        return;
      }

      // Handle Enter (which scanner guns emit at the end of the scan)
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minChars) {
          e.preventDefault();
          e.stopPropagation();
          const barcode = bufferRef.current.trim();
          setLastScanned(barcode);
          setIsReceivingGunInput(false);
          bufferRef.current = '';
          onScan(barcode);
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // Scanner sends printable characters (length === 1)
      if (e.key.length === 1) {
        // If the gap between keys is too long, reset the buffer (it was human typing, not a scanner gun)
        if (timeDiff > maxDelayMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }

        bufferRef.current += e.key;

        // If at least 3 characters came in rapidly, set indicator
        if (bufferRef.current.length >= 3) {
          setIsReceivingGunInput(true);
        }

        // Auto-clear buffer if user paused
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          bufferRef.current = '';
          setIsReceivingGunInput(false);
        }, 150);
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

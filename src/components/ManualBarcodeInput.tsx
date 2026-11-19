import React, { useState, useRef } from 'react';
import { ScanBarcode, Camera, ArrowRight, Zap, Check } from 'lucide-react';

interface ManualBarcodeInputProps {
  onScan: (barcode: string) => void;
  onOpenCamera: () => void;
  isScannerActive?: boolean;
}

export const ManualBarcodeInput: React.FC<ManualBarcodeInputProps> = ({
  onScan,
  onOpenCamera,
  isScannerActive = true
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = barcodeInput.replace(/[\r\n\t]/g, '').trim();
    if (!clean) return;

    onScan(clean);
    setBarcodeInput('');
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 800);
    inputRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-sm border border-slate-200/80 mb-4 sm:mb-6 transition-all hover:shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-800">ស្កេន Barcode ទំនិញអស់ស្តុក</h2>
            <p className="text-[11px] text-slate-500 hidden xs:block">
              ប្រើកាំភ្លើង Scan (USB/Bluetooth), កាមេរ៉ាទូរស័ព្ទ, ឬវាយលេខ Barcode
            </p>
          </div>
        </div>

        {/* Scanner Gun Active Indicator Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] sm:text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>កាំភ្លើងស្កេន Ready</span>
            <Zap className="w-3 h-3 text-emerald-600" />
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <ScanBarcode className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            ref={inputRef}
            data-barcode-input="true"
            type="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="បាញ់កាំភ្លើង ឬវាយ Barcode (ឧ. P0904040002, 8851959...)..."
            className="w-full pl-10 pr-12 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition font-mono tracking-wider text-slate-800 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400"
          />
          {barcodeInput && (
            <button
              type="button"
              onClick={() => setBarcodeInput('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-400 hover:text-slate-600"
            >
              លុប
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Submit button */}
          <button
            type="submit"
            disabled={!barcodeInput.trim()}
            className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition shadow-sm active:scale-95 ${
              justSubmitted
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none'
            }`}
          >
            {justSubmitted ? (
              <>
                <Check className="w-4 h-4" />
                <span>បានបញ្ចូល</span>
              </>
            ) : (
              <>
                <span>បញ្ចូលទំនិញ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          {/* Camera Scanner Button */}
          <button
            type="button"
            onClick={onOpenCamera}
            className="flex-1 sm:flex-none px-4 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 shadow-sm transition active:scale-95"
            title="បើកកាមេរ៉ាទូរស័ព្ទដើម្បីស្កេន"
          >
            <Camera className="w-4 h-4" />
            <span>Camera Scan</span>
          </button>
        </div>
      </form>
    </div>
  );
};

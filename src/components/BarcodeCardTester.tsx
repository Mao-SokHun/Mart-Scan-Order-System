import React from 'react';
import { Product } from '../types';
import { ScanBarcode, Sparkles, Smartphone, Zap } from 'lucide-react';

interface BarcodeCardTesterProps {
  products: Product[];
  onSimulateScan: (barcode: string) => void;
}

// Generate realistic looking SVG barcode lines from a string
const BarcodeSvg: React.FC<{ code: string }> = ({ code }) => {
  // Deterministic bar widths based on char codes
  const bars: { width: number; isSpace: boolean }[] = [];
  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i);
    bars.push({ width: (charCode % 3) + 1.5, isSpace: false });
    bars.push({ width: ((charCode * 3) % 4) + 1.2, isSpace: true });
    bars.push({ width: ((charCode * 7) % 3) + 1.5, isSpace: false });
    bars.push({ width: 1.5, isSpace: true });
  }

  return (
    <div className="flex flex-col items-center bg-white p-2 rounded-lg border border-slate-200">
      <svg className="w-full h-11" viewBox="0 0 160 40" preserveAspectRatio="none">
        {/* Guard bars at start */}
        <rect x="2" y="0" width="2" height="40" fill="#000" />
        <rect x="6" y="0" width="2" height="40" fill="#000" />

        {bars.map((bar, idx) => {
          if (bar.isSpace) return null;
          const x = 12 + idx * 2.8;
          if (x > 146) return null;
          return (
            <rect
              key={idx}
              x={x}
              y="0"
              width={bar.width}
              height="34"
              fill="#000"
            />
          );
        })}

        {/* Guard bars at end */}
        <rect x="150" y="0" width="2" height="40" fill="#000" />
        <rect x="154" y="0" width="2" height="40" fill="#000" />
      </svg>
      <span className="font-mono text-[10px] tracking-widest text-slate-800 font-bold mt-1">
        {code}
      </span>
    </div>
  );
};

export const BarcodeCardTester: React.FC<BarcodeCardTesterProps> = ({
  products,
  onSimulateScan,
}) => {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-800 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
              <span>សន្លឹកតេស្ត Barcode លើអេក្រង់ (On-Screen Barcode Test Sheet)</span>
              <span className="text-[10px] bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                Live Test
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              យកកាំភ្លើង Scan ឬបើកកាមេរ៉ាទូរស័ព្ទមកបាញ់លើអេក្រង់នេះផ្ទាល់ ឬចុចប៊ូតុង "តេស្ត Scan" ក៏បាន
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>អាច Scan ឆ្លងកាត់ Screen បាន!</span>
        </div>
      </div>

      {/* Barcode cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {products.slice(0, 5).map((prod) => (
          <div
            key={prod.id}
            className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-3 flex flex-col justify-between transition group"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] text-slate-400 truncate font-medium">
                  {prod.unit}
                </span>
                {prod.currentStock <= 0 ? (
                  <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">
                    អស់ស្តុក
                  </span>
                ) : (
                  <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded">
                    សល់ {prod.currentStock}
                  </span>
                )}
              </div>
              <p className="font-semibold text-xs text-white truncate group-hover:text-blue-300 transition">
                {prod.name}
              </p>
              {prod.khmerName && (
                <p className="text-[10px] text-slate-400 truncate mb-2">
                  {prod.khmerName}
                </p>
              )}

              {/* Barcode SVG */}
              <div className="my-1.5">
                <BarcodeSvg code={prod.barcode} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSimulateScan(prod.barcode)}
              className="mt-2.5 w-full py-1.5 bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white rounded-xl text-[11px] font-semibold border border-blue-500/40 hover:border-blue-500 flex items-center justify-center gap-1 transition active:scale-95"
            >
              <Zap className="w-3 h-3" />
              <span>តេស្ត Scan</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

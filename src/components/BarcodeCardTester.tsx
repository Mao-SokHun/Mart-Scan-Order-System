import React, { useState, useMemo } from 'react';
import { Product } from '../types';
import { ScanBarcode, Sparkles, Smartphone, Zap, Search, X } from 'lucide-react';

interface BarcodeCardTesterProps {
  products: Product[];
  onSimulateScan: (barcode: string) => void;
  onClose?: () => void;
}

// Generate realistic looking SVG barcode lines from a string
const BarcodeSvg: React.FC<{ code: string }> = ({ code }) => {
  const safeCode = code || '';
  // Deterministic bar widths based on char codes
  const bars: { width: number; isSpace: boolean }[] = [];
  for (let i = 0; i < safeCode.length; i++) {
    const charCode = safeCode.charCodeAt(i);
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
        {safeCode}
      </span>
    </div>
  );
};

export const BarcodeCardTester: React.FC<BarcodeCardTesterProps> = ({
  products,
  onSimulateScan,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const displayProducts = useMemo(() => {
    if (!searchTerm.trim()) return products.slice(0, 10);
    const q = searchTerm.toLowerCase().trim();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.khmerName && p.khmerName.toLowerCase().includes(q)) ||
          p.barcode.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [products, searchTerm]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 mb-6 relative animate-in fade-in duration-150">
      {/* Header and Close */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
              <span>សន្លឹកតេស្ត Barcode លើអេក្រង់ (Barcode Test Sheet)</span>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 font-semibold">
                ទំនិញពិត {products.length} មុខ
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              យកកាំភ្លើង Scan ឬបើកកាមេរ៉ាទូរស័ព្ទមកបាញ់លើអេក្រង់នេះផ្ទាល់ ឬចុចប៊ូតុង "តេស្ត Scan"
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ស្វែងរកទំនិញតេស្ត..."
              className="pl-8 pr-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-36 sm:w-48"
            />
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="បិទសន្លឹកតេស្ត"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Barcode cards grid - smooth horizontal swipe on mobile, grid on desktop */}
      <div className="flex sm:grid sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
        {displayProducts.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs text-slate-400">
            រកមិនឃើញទំនិញ «{searchTerm}» ទេ
          </div>
        ) : (
          displayProducts.map((prod) => (
            <div
              key={prod.id}
              className="w-[155px] sm:w-auto bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between transition group shrink-0 sm:shrink"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] text-slate-400 truncate font-medium">
                    {prod.unit}
                  </span>
                  {(prod.currentStock ?? 0) <= 0 ? (
                    <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">
                      អស់ស្តុក
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded">
                      សល់ {prod.currentStock ?? 0}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-xs text-white truncate group-hover:text-blue-300 transition">
                  {prod.name}
                </p>
                {prod.khmerName && (
                  <p className="text-[10px] text-slate-400 truncate mb-1">
                    {prod.khmerName}
                  </p>
                )}
                <span className="text-[9px] text-slate-500 block truncate">
                  {prod.category}
                </span>

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
          ))
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Product } from '../types';
import { ScanBarcode, Zap, Search, X, Maximize2, Copy, Check, ChevronDown } from 'lucide-react';

interface BarcodeCardTesterProps {
  products: Product[];
  onSimulateScan: (barcode: string) => void;
  onClose?: () => void;
}

/**
 * Real ISO-15417 Code 128 SVG Barcode Renderer using JsBarcode.
 * Generates genuine, scanner-readable barcodes (phone cameras + USB/Bluetooth laser guns)
 * with exact start/stop symbols, modulo-103 checksum, and quiet zones.
 */
const BarcodeSvg: React.FC<{
  code: string;
  height?: number;
  barWidth?: number;
  fontSize?: number;
  margin?: number;
}> = ({ code, height = 52, barWidth = 1.8, fontSize = 12, margin = 10 }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [encodeError, setEncodeError] = useState(false);

  const safeCode = (code || '').trim();

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !safeCode) {
      setEncodeError(true);
      return;
    }

    try {
      // CODE128 supports both numeric (EAN-like digits) and alphanumeric SKUs (e.g. F030102000252)
      // Automatically compresses digit pairs (Code128C) and validates modulo-103 checksum
      JsBarcode(svgEl, safeCode, {
        format: 'CODE128',
        width: barWidth,
        height,
        displayValue: true,
        font: 'monospace',
        fontOptions: 'bold',
        fontSize,
        textMargin: 4,
        background: '#ffffff',
        lineColor: '#000000',
        margin,
      });

      // Make SVG scale crisply inside responsive containers without distorting bar aspect
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.width = '100%';
      svgEl.style.height = 'auto';
      svgEl.style.maxHeight = `${height + fontSize + margin * 2 + 10}px`;
      svgEl.style.display = 'block';
      setEncodeError(false);
    } catch (err) {
      console.warn('JsBarcode encode error for:', safeCode, err);
      setEncodeError(true);
    }
  }, [safeCode, height, barWidth, fontSize, margin]);

  return (
    <div className="flex flex-col items-center justify-center bg-white px-2 py-2 rounded-xl border border-slate-200 shadow-inner overflow-hidden">
      {encodeError ? (
        <div className="py-3 text-center">
          <span className="font-mono text-xs font-bold text-slate-800">{safeCode || 'N/A'}</span>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-auto select-none" />
      )}
    </div>
  );
};

export const BarcodeCardTester: React.FC<BarcodeCardTesterProps> = ({
  products,
  onSimulateScan,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomedProduct, setZoomedProduct] = useState<Product | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(16);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const q = searchTerm.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.khmerName && p.khmerName.toLowerCase().includes(q)) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const displayProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleLimit);
  }, [filteredProducts, visibleLimit]);

  const handleCopyBarcode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
      }
    } catch {}
    setCopiedBarcode(code);
    setTimeout(() => setCopiedBarcode(null), 1200);
  };

  useEffect(() => {
    setVisibleLimit(16);
  }, [searchTerm]);

  useEffect(() => {
    if (!zoomedProduct) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedProduct(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomedProduct]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 mb-6 relative animate-in fade-in duration-150">
      {/* Header and Close */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base flex flex-wrap items-center gap-2">
              <span>សន្លឹកតេស្ត Barcode លើអេក្រង់ (Real Code128 Barcode)</span>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 font-semibold">
                ទំនិញពិត {products.length} មុខ
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              យកកាំភ្លើង Scan ឬកាមេរ៉ាទូរស័ព្ទមកបាញ់លើ Barcode ខាងក្រោម (ចុចលើ Barcode ដើម្បីពង្រីកធំ)
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
              className="pl-8 pr-7 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-40 sm:w-52"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
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

      {/* Barcode cards grid: wider cards so Barcode bars stay crisp & easily focusable from phone camera */}
      <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
        {displayProducts.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs text-slate-400 w-full">
            រកមិនឃើញទំនិញ «{searchTerm}» ទេ
          </div>
        ) : (
          displayProducts.map((prod) => (
            <div
              key={prod.id}
              className="w-[225px] sm:w-auto bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-3 flex flex-col justify-between transition group shrink-0 sm:shrink"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] text-slate-400 truncate font-medium">
                    {prod.unit}
                  </span>
                  {(prod.currentStock ?? 0) <= 0 ? (
                    <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">
                      អស់ស្តុក
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                      សល់ {prod.currentStock ?? 0}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-xs text-white truncate group-hover:text-blue-300 transition">
                  {prod.name}
                </p>
                {prod.khmerName && (
                  <p className="text-[10px] text-slate-400 truncate mb-0.5">
                    {prod.khmerName}
                  </p>
                )}
                <span className="text-[9px] text-slate-500 block truncate">
                  {prod.category}
                </span>

                {/* Clickable Real Code 128 Barcode */}
                <button
                  type="button"
                  onClick={() => setZoomedProduct(prod)}
                  className="w-full my-2 relative group/bc block cursor-zoom-in text-left focus:outline-none"
                  title="ចុចដើម្បីពង្រីក Barcode ឱ្យធំច្បាស់សម្រាប់ទូរស័ព្ទស្កេន"
                >
                  <BarcodeSvg code={prod.barcode} height={52} barWidth={1.8} fontSize={12} margin={10} />
                  <span className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-900/10 text-slate-500 opacity-70 group-hover/bc:opacity-100 group-hover/bc:bg-blue-600 group-hover/bc:text-white transition">
                    <Maximize2 className="w-3 h-3" />
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => onSimulateScan(prod.barcode)}
                  className="flex-1 py-1.5 bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white rounded-xl text-[11px] font-semibold border border-blue-500/40 hover:border-blue-500 flex items-center justify-center gap-1 transition active:scale-95"
                  title="តេស្តស្កេនចូលតារាងផ្ទាល់"
                >
                  <Zap className="w-3 h-3" />
                  <span>តេស្ត Scan</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCopyBarcode(e, prod.barcode)}
                  className={`p-1.5 rounded-xl border text-[11px] transition active:scale-95 ${
                    copiedBarcode === prod.barcode
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-600'
                  }`}
                  title="ចម្លង Barcode (Copy)"
                >
                  {copiedBarcode === prod.barcode ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load More Button if filtered list exceeds visible limit */}
      {filteredProducts.length > visibleLimit && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleLimit((prev) => prev + 16)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition active:scale-95 inline-flex items-center gap-1.5 shadow"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>បង្ហាញបន្ថែម 16 មុខទៀត (នៅសល់ {filteredProducts.length - visibleLimit} មុខ)</span>
          </button>
        </div>
      )}

      {/* Full-Screen High-Contrast Zoomed Barcode Lightbox for Phone Scanning */}
      {zoomedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setZoomedProduct(null)}
        >
          <div
            className="w-full max-w-md bg-white text-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-base text-slate-900 truncate">{zoomedProduct.name}</h4>
                {zoomedProduct.khmerName && (
                  <p className="text-xs text-slate-500 truncate">{zoomedProduct.khmerName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomedProduct(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <BarcodeSvg code={zoomedProduct.barcode} height={90} barWidth={2.4} fontSize={16} margin={16} />
            </div>

            <p className="text-center text-xs text-slate-500">
              បើកកាមេរ៉ាទូរស័ព្ទមកបាញ់លើ Barcode ធំនេះដើម្បីស្កេនភ្លាមៗ
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomedProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                បិទ
              </button>
              <button
                type="button"
                onClick={() => {
                  onSimulateScan(zoomedProduct.barcode);
                  setZoomedProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>តេស្ត Scan ចូលតារាង</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

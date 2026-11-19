import React, { useState } from 'react';
import { RestockItem } from '../types';
import { 
  Trash2, Plus, Minus, FileSpreadsheet, Printer, 
  Send, Search, Filter, ShoppingBag, AlertTriangle, 
  Check, Phone, AlertCircle 
} from 'lucide-react';

interface RestockOrderTableProps {
  items: RestockItem[];
  highlightedItemId?: string | null;
  onUpdateQuantity: (itemId: string, newQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearAll: () => void;
  onExportExcel: (supplierFilter?: string) => void;
  onCopyToTelegram: (supplierFilter?: string) => void;
  onOpenPrintPO: () => void;
}

export const RestockOrderTable: React.FC<RestockOrderTableProps> = ({
  items,
  highlightedItemId,
  onUpdateQuantity,
  onRemoveItem,
  onClearAll,
  onExportExcel,
  onCopyToTelegram,
  onOpenPrintPO
}) => {
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedTelegram, setCopiedTelegram] = useState(false);

  // Extract unique suppliers
  const suppliers = Array.from(new Set(items.map(i => i.product.supplierName)));

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSupplier = supplierFilter === 'all' || item.product.supplierName === supplierFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      item.product.name.toLowerCase().includes(q) ||
      (item.product.khmerName && item.product.khmerName.toLowerCase().includes(q)) ||
      item.product.barcode.includes(q) ||
      item.product.category.toLowerCase().includes(q);
    return matchesSupplier && matchesSearch;
  });

  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const zeroQtyCount = filteredItems.filter(i => i.orderQuantity <= 0).length;

  const handleExportWithValidation = () => {
    if (zeroQtyCount > 0) {
      const confirm = window.confirm(
        `⚠️ មានទំនិញចំនួន ${zeroQtyCount} មុខ មិនទាន់បានបញ្ចូលចំនួនទិញ (ចំនួន = 0)!\n\nតើ Admin ចង់បន្ត Export ឯកសារ Excel ដែរឬទេ?`
      );
      if (!confirm) return;
    }
    onExportExcel(supplierFilter);
  };

  const handleCopyTelegram = () => {
    if (zeroQtyCount > 0) {
      const confirm = window.confirm(
        `⚠️ មានទំនិញចំនួន ${zeroQtyCount} មុខ មិនទាន់បានបញ្ចូលចំនួនទិញ (ចំនួន = 0)!\n\nតើ Admin ចង់បន្តចម្លងទៅ Telegram ដែរឬទេ?`
      );
      if (!confirm) return;
    }
    onCopyToTelegram(supplierFilter);
    setCopiedTelegram(true);
    setTimeout(() => setCopiedTelegram(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                តារាងទំនិញអស់ស្តុក ត្រូវបញ្ជាទិញ (Restock Order List)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              💡 ពេលស្កេនរួច Admin ជាអ្នកវាយចំនួនលេខចូលមុននឹង Export ចេញ (ស្កេនដដែលមិនបូកស្ទួនឡើយ)
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-400 block font-medium">មុខទំនិញ</span>
              <span className="text-sm font-bold text-slate-800">{filteredItems.length} មុខ</span>
            </div>

            {zeroQtyCount > 0 && (
              <div className="bg-amber-50 px-3.5 py-2 rounded-xl border border-amber-300 shadow-xs animate-pulse">
                <span className="text-[11px] text-amber-700 block font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>មិនទាន់វាយចំនួន</span>
                </span>
                <span className="text-sm font-bold text-amber-900">{zeroQtyCount} មុខ</span>
              </div>
            )}

            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-400 block font-medium">សរុបចំនួនទិញ</span>
              <span className="text-sm font-bold text-blue-600">{totalQty} ឯកតា</span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50/30 shadow-xs">
              <span className="text-[11px] text-blue-600 block font-medium">សរុបទឹកប្រាក់ប៉ាន់ស្មាន</span>
              <span className="text-sm font-bold text-emerald-600">${totalCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/70">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Search within order */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ស្វែងរកក្នុងតារាង..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              />
            </div>

            {/* Supplier Filter */}
            {suppliers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">អ្នកផ្គត់ផ្គង់ទាំងអស់ ({items.length})</option>
                  {suppliers.map(sup => (
                    <option key={sup} value={sup}>
                      {sup} ({items.filter(i => i.product.supplierName === sup).length})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {items.length > 0 && (
              <>
                <button
                  onClick={handleExportWithValidation}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  title="ទាញយកជាឯកសារ Excel សម្រាប់ផ្ញើបញ្ជាទិញ"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>

                <button
                  onClick={handleCopyTelegram}
                  className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  title="ចម្លងអត្ថបទសម្រាប់ផ្ញើតាម Telegram"
                >
                  {copiedTelegram ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{copiedTelegram ? 'បានចម្លង!' : 'Telegram'}</span>
                </button>

                <button
                  onClick={onOpenPrintPO}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  title="បោះពុម្ពសន្លឹកបញ្ជាទិញ (Print Purchase Order)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PO</span>
                </button>

                <button
                  onClick={onClearAll}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition"
                  title="សម្អាតតារាងទាំងមូល"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        {filteredItems.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <ShoppingBag className="w-8 h-8 opacity-80" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              {items.length === 0
                ? 'មិនទាន់មានទំនិញក្នុងតារាងបញ្ជាទិញនៅឡើយទេ'
                : 'រកមិនឃើញទំនិញដែលត្រូវនឹងការស្វែងរកទេ'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              {items.length === 0
                ? 'សូមយកកាំភ្លើង Scan ឬបើកកាមេរ៉ាទូរស័ព្ទដើម្បី Scan Barcode ទំនិញដែលអស់ស្តុកលើធ្នើរ។ ព័ត៌មានទំនិញនឹងលោតចូលទីនេះភ្លាមៗ!'
                : 'សូមសាកល្បងផ្លាស់ប្តូរពាក្យស្វែងរក ឬជ្រើសរើសអ្នកផ្គត់ផ្គង់ទាំងអស់។'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-3.5 text-center w-12">#</th>
                <th className="py-3 px-3">ទំនិញ / Barcode</th>
                <th className="py-3 px-3 hidden md:table-cell">ប្រភេទ</th>
                <th className="py-3 px-3 text-center">ស្តុកសល់</th>
                <th className="py-3 px-3 hidden lg:table-cell">អ្នកផ្គត់ផ្គង់</th>
                <th className="py-3 px-3 text-right">តម្លៃដើម</th>
                <th className="py-3 px-3 text-center w-48">
                  ចំនួនត្រូវទិញ <span className="text-rose-500">* (Admin វាយ)</span>
                </th>
                <th className="py-3 px-3 text-right">សរុប</th>
                <th className="py-3 px-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item, index) => {
                const isOutOfStock = item.product.currentStock <= 0;
                const isZeroQty = item.orderQuantity <= 0;
                const isHighlighted = highlightedItemId === item.id;

                return (
                  <tr 
                    key={item.id} 
                    className={`transition-all duration-300 ${
                      isHighlighted 
                        ? 'bg-amber-100/90 ring-2 ring-amber-400' 
                        : isZeroQty
                        ? 'bg-amber-50/30 hover:bg-amber-50/60'
                        : 'hover:bg-blue-50/30'
                    }`}
                  >
                    <td className="py-3.5 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Product & Barcode */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        {item.product.image ? (
                          <img
                            src={item.product.image}
                            alt={item.product.name}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold shrink-0">
                            {item.product.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate text-xs sm:text-sm">
                            {item.product.name}
                          </p>
                          {item.product.khmerName && (
                            <p className="text-[11px] text-slate-500 truncate">
                              {item.product.khmerName}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/80">
                              {item.product.barcode}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({item.product.unit})
                            </span>
                            {isHighlighted && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded animate-pulse">
                                មានក្នុងតារាងរួចហើយ!
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3 hidden md:table-cell text-slate-500">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-[11px]">
                        {item.product.category}
                      </span>
                    </td>

                    {/* Current Stock */}
                    <td className="py-3.5 px-3 text-center">
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                          អស់ស្តុក ({item.product.currentStock})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                          សល់ {item.product.currentStock}
                        </span>
                      )}
                    </td>

                    {/* Supplier */}
                    <td className="py-3.5 px-3 hidden lg:table-cell">
                      <div className="text-slate-800 font-medium truncate max-w-[180px]">
                        {item.product.supplierName}
                      </div>
                      {item.product.supplierPhone && (
                        <a
                          href={`tel:${item.product.supplierPhone}`}
                          className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{item.product.supplierPhone}</span>
                        </a>
                      )}
                    </td>

                    {/* Unit Cost */}
                    <td className="py-3.5 px-3 text-right font-medium text-slate-600">
                      ${item.unitCost.toFixed(2)}
                    </td>

                    {/* Order Quantity Controller (Admin Focus) */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`flex items-center justify-center gap-1 rounded-xl p-1 transition-all ${
                          isZeroQty 
                            ? 'bg-amber-50 border-2 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
                            : 'bg-slate-50 border border-slate-200 shadow-xs'
                        }`}>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, Math.max(0, item.orderQuantity - 1))}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 transition active:scale-95 shadow-2xs"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* Direct Admin Input */}
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.orderQuantity === 0 ? '' : item.orderQuantity}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdateQuantity(item.id, val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                            }}
                            className="w-16 text-center bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400"
                          />

                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, item.orderQuantity + 1)}
                            className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition active:scale-95 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Status helper text under quantity */}
                        {isZeroQty ? (
                          <span className="text-[10px] font-bold text-amber-700 animate-pulse">
                            ⚠️ ចាំ Admin បញ្ចូលចំនួន
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {item.orderQuantity} {item.product.unit}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Total Cost */}
                    <td className="py-3.5 px-3 text-right font-bold text-slate-800">
                      ${item.totalCost.toFixed(2)}
                    </td>

                    {/* Delete action */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="លុបមុខទំនិញនេះចេញ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                <td colSpan={3} className="py-3.5 px-4 text-xs">
                  សរុបរួម ({filteredItems.length} មុខទំនិញ)
                </td>
                <td className="hidden md:table-cell"></td>
                <td className="hidden lg:table-cell"></td>
                <td className="hidden lg:table-cell"></td>
                <td className="py-3.5 px-3 text-center text-blue-600 text-xs">
                  {totalQty} ឯកតា
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-600 text-sm">
                  ${totalCost.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { RestockItem } from '../types';
import { OrderDay, getCurrentDayOfWeek } from '../utils/export';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { ConfirmModal } from './ui/ConfirmModal';
import { 
  Trash2, Plus, Minus, FileSpreadsheet, Printer, 
  Send, Search, Filter, ShoppingBag, AlertTriangle, 
  Check, Phone, AlertCircle, Calendar, X 
} from 'lucide-react';

interface RestockOrderTableProps {
  items: RestockItem[];
  highlightedItemId?: string | null;
  onUpdateQuantity: (itemId: string, newQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearAll: () => void;
  onExportExcel: (itemsToExport: RestockItem[], orderDay: OrderDay, supplierFilter?: string) => void;
  onExportSimplePO?: (itemsToExport: RestockItem[], supplierFilter?: string) => void;
  onCopyToTelegram: (itemsToExport: RestockItem[], orderDay: OrderDay, supplierFilter?: string) => void | boolean | Promise<boolean>;
  onOpenTelegramModal?: (itemsToExport: RestockItem[], orderDay: OrderDay, supplierFilter?: string) => void;
  onOpenPrintPO: () => void;
}

export const RestockOrderTable: React.FC<RestockOrderTableProps> = ({
  items,
  highlightedItemId,
  onUpdateQuantity,
  onRemoveItem,
  onClearAll,
  onExportExcel,
  onExportSimplePO,
  onCopyToTelegram,
  onOpenTelegramModal,
  onOpenPrintPO
}) => {
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterZeroOnly, setFilterZeroOnly] = useState<boolean>(false);
  const [orderDay, setOrderDay] = useState<OrderDay>(getCurrentDayOfWeek());
  const [copiedTelegram, setCopiedTelegram] = useState(false);

  // Auto-scroll to newly scanned or duplicate scanned item (Works across both mobile and desktop views)
  React.useEffect(() => {
    if (highlightedItemId) {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      const targetId = isDesktop 
        ? `restock-item-desktop-${highlightedItemId}` 
        : `restock-item-mobile-${highlightedItemId}`;
      const elem = document.getElementById(targetId) || 
                   document.getElementById(`restock-item-${highlightedItemId}`);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedItemId]);

  // Extract unique clean suppliers
  const suppliers = Array.from(new Set(items.map(i => (i.product.supplierName || 'ទូទៅ (General Supplier)').trim()))).filter(Boolean);

  const supplierOptions = useMemo<SelectOption<string>[]>(() => {
    return [
      { value: 'all', label: 'អ្នកផ្គត់ផ្គង់ទាំងអស់', badge: items.length },
      ...suppliers.map(sup => ({
        value: sup,
        label: sup,
        badge: items.filter(i => (i.product.supplierName || 'ទូទៅ (General Supplier)').trim() === sup).length
      }))
    ];
  }, [suppliers, items]);

  const dayOptions: SelectOption<OrderDay>[] = useMemo(() => [
    { value: 'Mon', label: 'Mon (ច័ន្ទ)' },
    { value: 'Tue', label: 'Tue (អង្គារ)' },
    { value: 'Wed', label: 'Wed (ពុធ)' },
    { value: 'Thu', label: 'Thu (ព្រហស្បតិ៍)' },
    { value: 'Fri', label: 'Fri (សុក្រ)' },
    { value: 'Sat', label: 'Sat (សៅរ៍)' },
    { value: 'Sun', label: 'Sun (អាទិត្យ)' },
  ], []);

  // Multi-term smart filter for item search & supplier filter
  const filteredItems = items.filter(item => {
    const itemSupplier = (item.product.supplierName || 'ទូទៅ (General Supplier)').trim();
    const matchesSupplier = supplierFilter === 'all' || itemSupplier === supplierFilter;
    const matchesZeroOnly = !filterZeroOnly || item.orderQuantity <= 0;
    const cleanQ = searchQuery.toLowerCase().trim().replace(/\.0$/, '');
    if (!cleanQ) return matchesSupplier && matchesZeroOnly;

    const terms = cleanQ.split(/\s+/).filter(Boolean);
    const prodBarcode = (item.product.barcode || '').toLowerCase().replace(/\.0$/, '');
    const prodName = (item.product.name || '').toLowerCase();
    const prodKhmer = (item.product.khmerName || '').toLowerCase();
    const prodCategory = (item.product.category || '').toLowerCase();
    const prodSupplier = itemSupplier.toLowerCase();

    const matchesSearch = terms.every(term => 
      prodName.includes(term) ||
      prodKhmer.includes(term) ||
      prodBarcode.includes(term) ||
      prodCategory.includes(term) ||
      prodSupplier.includes(term)
    );

    return matchesSupplier && matchesZeroOnly && matchesSearch;
  });

  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  const zeroQtyCount = filteredItems.filter(i => i.orderQuantity <= 0).length;

  // State for beautiful confirm modal (replacing native window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    submessage?: React.ReactNode;
    type?: 'warning' | 'danger' | 'info' | 'success';
    confirmText?: string;
    cancelText?: string;
    confirmButtonColor?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const handleExportWithValidation = () => {
    if (filteredItems.length === 0) return;
    if (zeroQtyCount > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'មានទំនិញមិនទាន់បញ្ចូលចំនួនទិញ',
        type: 'warning',
        message: (
          <span>
            មានទំនិញចំនួន <strong className="text-amber-600 font-bold">{zeroQtyCount} មុខ</strong> មិនទាន់បានបញ្ចូលចំនួនទិញ (ចំនួន = 0)!
          </span>
        ),
        submessage: 'តើ Admin ចង់បន្ត Export ឯកសារ Excel (Daily Plan) ដែរឬទេ?',
        confirmText: 'បន្ត Export Excel',
        cancelText: 'ត្រឡប់ក្រោយ',
        confirmButtonColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          onExportExcel(filteredItems, orderDay, supplierFilter);
        }
      });
      return;
    }
    onExportExcel(filteredItems, orderDay, supplierFilter);
  };

  const handleExportSimplePOWithValidation = () => {
    if (filteredItems.length === 0) return;
    if (zeroQtyCount > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'មានទំនិញមិនទាន់បញ្ចូលចំនួនទិញ',
        type: 'warning',
        message: (
          <span>
            មានទំនិញចំនួន <strong className="text-amber-600 font-bold">{zeroQtyCount} មុខ</strong> មិនទាន់បានបញ្ចូលចំនួនទិញ (ចំនួន = 0)!
          </span>
        ),
        submessage: 'តើ Admin ចង់បន្ត Export បញ្ជីកុម្ម៉ង់ PO ដែរឬទេ?',
        confirmText: 'បន្ត Export PO',
        cancelText: 'ត្រឡប់ក្រោយ',
        confirmButtonColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          if (onExportSimplePO) {
            onExportSimplePO(filteredItems, supplierFilter);
          }
        }
      });
      return;
    }
    if (onExportSimplePO) {
      onExportSimplePO(filteredItems, supplierFilter);
    }
  };

  const handleCopyTelegramDirect = async () => {
    const res = await onCopyToTelegram(filteredItems, orderDay, supplierFilter);
    if (res !== false) {
      setCopiedTelegram(true);
      setTimeout(() => setCopiedTelegram(false), 2000);
    }
  };

  const handleTelegramClick = async () => {
    if (filteredItems.length === 0) return;
    if (zeroQtyCount > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'មានទំនិញមិនទាន់បញ្ចូលចំនួនទិញ',
        type: 'warning',
        message: (
          <span>
            មានទំនិញចំនួន <strong className="text-amber-600 font-bold">{zeroQtyCount} មុខ</strong> មិនទាន់បានបញ្ចូលចំនួនទិញ (ចំនួន = 0)!
          </span>
        ),
        submessage: 'តើ Admin ចង់បន្តផ្ញើទៅ Telegram ដែរឬទេ?',
        confirmText: 'បន្តផ្ញើ Telegram',
        cancelText: 'ត្រឡប់ក្រោយ',
        confirmButtonColor: 'bg-sky-600 hover:bg-sky-700 text-white',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          if (onOpenTelegramModal) {
            onOpenTelegramModal(filteredItems, orderDay, supplierFilter);
          } else {
            handleCopyTelegramDirect();
          }
        }
      });
      return;
    }
    if (onOpenTelegramModal) {
      onOpenTelegramModal(filteredItems, orderDay, supplierFilter);
    } else {
      await handleCopyTelegramDirect();
    }
  };

  // Safe removal with custom confirmation modal if quantity has already been counted
  const handleSafeRemove = (item: RestockItem) => {
    if (item.orderQuantity > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'បញ្ជាក់ការលុបទំនិញ',
        type: 'danger',
        message: (
          <span>
            តើអ្នកពិតជាចង់លុបទំនិញ «<strong className="text-slate-900 font-bold">{item.product.name}</strong>» ចេញពីតារាងបញ្ជាទិញមែនទេ?
          </span>
        ),
        submessage: `ទំនិញនេះមានចំនួនកុម្ម៉ង់ ${item.orderQuantity} ${item.product.unit || 'ឯកតា'} រួចហើយ។`,
        confirmText: 'លុបទំនិញ',
        cancelText: 'ទុកវិញ',
        confirmButtonColor: 'bg-rose-600 hover:bg-rose-700 text-white',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          onRemoveItem(item.id);
        }
      });
      return;
    }
    onRemoveItem(item.id);
  };

  return (
    <div id="restock-order-table-container" className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-visible flex flex-col mb-12 sm:mb-6 scroll-mt-20">
      {/* Table Header Controls */}
      <div className="p-3.5 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 rounded-t-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl">
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-800">
                តារាងទំនិញអស់ស្តុក ត្រូវបញ្ជាទិញ (Restock Order)
              </h2>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              💡 ពេលស្កេនរួច Admin ជាអ្នកវាយចំនួនលេខចូលមុននឹង Export ចេញ (ស្កេនដដែលមិនបូកស្ទួនឡើយ)
            </p>
          </div>

          {/* Quick Metrics Bar - Responsive Grid on Mobile */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <div className="bg-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">មុខទំនិញ</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800">{filteredItems.length} មុខ</span>
            </div>

            <div className="bg-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">សរុបចំនួនទិញ</span>
              <span className="text-xs sm:text-sm font-bold text-blue-600">{totalQty} ឯកតា</span>
            </div>

            {zeroQtyCount > 0 ? (
              <button
                type="button"
                onClick={() => setFilterZeroOnly(!filterZeroOnly)}
                title={filterZeroOnly ? 'ចុចដើម្បីបង្ហាញទំនិញទាំងអស់' : 'ចុចដើម្បីបង្ហាញតែទំនិញចាំវាយចំនួន'}
                className={`col-span-2 sm:col-span-1 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border transition shadow-2xs text-left cursor-pointer active:scale-95 ${
                  filterZeroOnly
                    ? 'bg-amber-400 border-amber-500 text-slate-900 ring-2 ring-amber-300'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 animate-pulse'
                }`}
              >
                <span className="text-[10px] sm:text-[11px] block font-bold flex items-center gap-1 text-amber-800">
                  <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-600" />
                  <span>{filterZeroOnly ? 'កំពុងមើល: ចាំវាយចំនួន' : 'ចាំវាយចំនួន'}</span>
                </span>
                <span className="text-xs sm:text-sm font-bold text-amber-950">{zeroQtyCount} មុខ</span>
              </button>
            ) : (
              <div className="col-span-2 sm:col-span-1 bg-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-2xs flex justify-between sm:block items-center">
                <span className="text-[10px] sm:text-[11px] text-emerald-700 block font-medium">ស្ថានភាពបញ្ជី</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-600">គ្រប់ចំនួនរួចរាល់</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-200/70">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            {/* Search within order */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ស្វែងរកក្នុងតារាង..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-xl sm:rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Supplier Filter */}
            {suppliers.length > 0 && (
              <CustomSelect<string>
                value={supplierFilter}
                onChange={setSupplierFilter}
                options={supplierOptions}
                icon={<Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                size="sm"
                searchable={suppliers.length > 6}
                searchPlaceholder="ស្វែងរកអ្នកផ្គត់ផ្គង់..."
                className="w-full sm:w-auto"
                buttonClassName="bg-white border-slate-200"
              />
            )}
          </div>

          {/* Action Buttons (Desktop & Mobile Responsive Layout) */}
          <div className="w-full sm:w-auto">
            {items.length > 0 && (
              <>
                {/* 💻 Desktop View: Clean Inline Toolbar (sm and up) */}
                <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 justify-end flex-wrap">
                  {/* Order Day Selector */}
                  <CustomSelect<OrderDay>
                    value={orderDay}
                    onChange={setOrderDay}
                    options={dayOptions}
                    label="ថ្ងៃកុម្ម៉ង់:"
                    icon={<Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    size="sm"
                    align="right"
                    buttonClassName="bg-white border-slate-200 font-bold text-blue-700"
                  />

                  <button
                    onClick={handleExportWithValidation}
                    disabled={filteredItems.length === 0}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs active:scale-95"
                    title="ទាញយកជាឯកសារ Excel តាមទម្រង់ Daily Plan"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Excel Plan ({orderDay})</span>
                  </button>

                  {onExportSimplePO && (
                    <button
                      onClick={handleExportSimplePOWithValidation}
                      disabled={filteredItems.length === 0}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-700 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                      title="ទាញយកបញ្ជីកុម្ម៉ង់ PO សាមញ្ញ (1 Sheet)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>PO សាមញ្ញ</span>
                    </button>
                  )}

                  <button
                    onClick={handleTelegramClick}
                    disabled={filteredItems.length === 0}
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs active:scale-95"
                    title="បាញ់ឯកសារ Excel និងបញ្ជីទំនិញទៅកាន់ Telegram"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Telegram</span>
                  </button>

                  <button
                    onClick={onOpenPrintPO}
                    disabled={filteredItems.length === 0}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition active:scale-95"
                    title="បោះពុម្ពសន្លឹកបញ្ជាទិញ (Print Purchase Order)"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>

                  <button
                    onClick={onClearAll}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl text-xs font-semibold transition"
                    title="សម្អាតតារាងទាំងមូល"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* 📱 Mobile View: Touch-Friendly 2-Row Layout (< sm) */}
                <div className="flex sm:hidden flex-col gap-2 w-full pt-1">
                  {/* Row 1: Day selector + Print + Clear */}
                  <div className="flex items-center gap-1.5 justify-between">
                    <div className="flex-1 min-w-0">
                      <CustomSelect<OrderDay>
                        value={orderDay}
                        onChange={setOrderDay}
                        options={dayOptions}
                        label="ថ្ងៃកុម្ម៉ង់:"
                        icon={<Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        size="sm"
                        fullWidth
                        buttonClassName="bg-white border-slate-200 font-bold text-blue-700"
                      />
                    </div>
                    <button
                      onClick={onOpenPrintPO}
                      disabled={filteredItems.length === 0}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95"
                      title="បោះពុម្ពសន្លឹកបញ្ជាទិញ"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={onClearAll}
                      className="p-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold shrink-0 active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Row 2: Two Prominent Full-Width Export Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleExportWithValidation}
                      disabled={filteredItems.length === 0}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Excel ({orderDay})</span>
                    </button>

                    <button
                      onClick={handleTelegramClick}
                      disabled={filteredItems.length === 0}
                      className="py-2.5 px-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                    >
                      <Send className="w-4 h-4" />
                      <span>Telegram</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Empty State */}
      {filteredItems.length === 0 ? (
        <div className="py-14 px-4 text-center">
          <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShoppingBag className="w-7 h-7 opacity-80" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
            {items.length === 0
              ? 'មិនទាន់មានទំនិញក្នុងតារាងបញ្ជាទិញនៅឡើយទេ'
              : 'រកមិនឃើញទំនិញដែលត្រូវនឹងការស្វែងរកទេ'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
            {items.length === 0
              ? 'សូមយកកាំភ្លើង Scan ឬចុច "Camera Scan" ដើម្បីស្កេន Barcode ទំនិញដែលអស់ស្តុកលើធ្នើរ។'
              : 'សូមសាកល្បងផ្លាស់ប្តូរពាក្យស្វែងរក ឬជ្រើសរើសអ្នកផ្គត់ផ្គង់ទាំងអស់។'}
          </p>
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/* 📱 MOBILE VIEW: Optimized Touch Cards (Hidden on md:) */}
          {/* ======================================================== */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredItems.map((item, index) => {
              const isOutOfStock = item.product.currentStock <= 0;
              const isZeroQty = item.orderQuantity <= 0;
              const isHighlighted = highlightedItemId === item.id;

              return (
                <div
                  key={item.id}
                  id={`restock-item-mobile-${item.id}`}
                  className={`p-3.5 transition-all duration-300 ${
                    isHighlighted
                      ? 'bg-amber-100/90 ring-2 ring-amber-400'
                      : isZeroQty
                      ? 'bg-amber-50/40'
                      : 'bg-white'
                  }`}
                >
                  {/* Top row: Image + Info + Delete button */}
                  <div className="flex items-start gap-3">
                    {item.product.image ? (
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-white shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold shrink-0">
                        {item.product.name.charAt(0)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <p className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1">
                            {item.product.name}
                          </p>
                          {item.product.khmerName && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">
                              {item.product.khmerName}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleSafeRemove(item)}
                          className="p-1 text-slate-300 hover:text-rose-600 rounded-lg transition shrink-0 -mt-0.5"
                          title="លុបចេញ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Barcode and Stock badges */}
                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.product.barcode}
                        </span>
                        {isOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full">
                            អស់ស្តុក
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">
                            សល់ {item.product.currentStock}
                          </span>
                        )}
                        {isHighlighted && (
                          <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded animate-pulse">
                            មានក្នុងតារាងរួចហើយ!
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Supplier & Category Row */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-100">
                    <div className="truncate max-w-[200px]">
                      <span className="text-slate-400">អ្នកផ្គត់ផ្គង់: </span>
                      <span className="font-medium text-slate-700">{item.product.supplierName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">ផ្នែក: </span>
                      <span className="font-medium text-slate-700">{item.product.category}</span>
                    </div>
                  </div>

                  {/* Bottom Quantity Control Center (Touch-friendly & Ergonomic) */}
                  <div className="mt-2.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, Math.max(0, (item.orderQuantity || 0) - 1))}
                          className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition shadow-2xs font-bold text-base"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            placeholder="0"
                            value={item.orderQuantity === 0 ? '' : item.orderQuantity}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              const num = raw === '' ? 0 : Math.min(99999, parseInt(raw, 10) || 0);
                              onUpdateQuantity(item.id, num);
                            }}
                            className={`w-16 h-10 text-center text-sm font-extrabold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                              isZeroQty 
                                ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-[0_0_8px_rgba(245,158,11,0.4)]' 
                                : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, (item.orderQuantity || 0) + 1)}
                          className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center active:scale-90 transition shadow-2xs font-bold text-base"
                        >
                          <Plus className="w-4 h-4" />
                        </button>

                        <span className="text-xs text-slate-500 font-medium ml-0.5">
                          {item.product.unit}
                        </span>
                      </div>

                      {/* Quantity Display */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block font-medium">ចំនួនបញ្ជាទិញ</span>
                        <span className={`text-sm font-extrabold ${isZeroQty ? 'text-amber-600' : 'text-blue-600'}`}>
                          {item.orderQuantity} {item.product.unit}
                        </span>
                      </div>
                    </div>

                    {/* Quick Add Presets: +1, +6, +12, +24 */}
                    <div className="flex items-center gap-1.5 pt-2 mt-2 border-t border-slate-200/70 overflow-x-auto">
                      <span className="text-[10px] text-slate-400 font-semibold shrink-0">ថែមរហ័ស:</span>
                      {[1, 6, 12, 24].map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, (item.orderQuantity || 0) + step)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 active:bg-blue-100 text-slate-700 hover:text-blue-700 border border-slate-200 text-[11px] font-bold active:scale-95 transition shadow-2xs shrink-0"
                        >
                          +{step}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Warning prompt under card if Qty is 0 */}
                  {isZeroQty && (
                    <div className="mt-1 text-center">
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 inline-block animate-pulse">
                        ⚠️ សូម Admin វាយចំនួនទិញក្នុងប្រអប់ខាងលើ
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile Footer Summary Card */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">សរុបរួម ({filteredItems.length} មុខ)</span>
                <span className="text-xs font-bold text-blue-700">{totalQty} ឯកតា</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">ស្ថានភាព</span>
                <span className={`text-xs font-bold ${zeroQtyCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {zeroQtyCount > 0 ? `ខ្វះ ${zeroQtyCount} មុខមិនទាន់វាយ` : 'គ្រប់ចំនួនរួចរាល់'}
                </span>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 💻 DESKTOP VIEW: Full SpreadSheet Table (Hidden on mobile) */}
          {/* ======================================================== */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-3.5 text-center w-12">#</th>
                  <th className="py-3 px-3">ទំនិញ / Barcode</th>
                  <th className="py-3 px-3">ផ្នែក (Category)</th>
                  <th className="py-3 px-3 text-center">ស្តុកសល់</th>
                  <th className="py-3 px-3">អ្នកផ្គត់ផ្គង់</th>
                  <th className="py-3 px-3 text-center w-52">
                    ចំនួនត្រូវទិញ <span className="text-rose-500">* (Admin វាយ)</span>
                  </th>
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
                      id={`restock-item-desktop-${item.id}`}
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
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
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
                      <td className="py-3.5 px-3 text-slate-500">
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
                      <td className="py-3.5 px-3">
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
                              onClick={() => onUpdateQuantity(item.id, Math.max(0, (item.orderQuantity || 0) - 1))}
                              className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 transition active:scale-95 shadow-2xs"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            
                            <input
                              type="number"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min="0"
                              placeholder="0"
                              value={item.orderQuantity === 0 ? '' : item.orderQuantity}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const num = raw === '' ? 0 : Math.min(99999, parseInt(raw, 10) || 0);
                                onUpdateQuantity(item.id, num);
                              }}
                              className="w-16 text-center bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400"
                            />

                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.id, (item.orderQuantity || 0) + 1)}
                              className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition active:scale-95 shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isZeroQty ? (
                            <span className="text-[10px] font-bold text-amber-700 animate-pulse">
                              ⚠️ ចាំ Admin បញ្ចូលចំនួន
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {item.orderQuantity} {item.product.unit}
                            </span>
                          )}

                          {/* Quick Presets on Desktop: +1, +6, +12, +24 */}
                          <div className="flex items-center gap-1 mt-0.5">
                            {[1, 6, 12, 24].map((step) => (
                              <button
                                key={step}
                                type="button"
                                onClick={() => onUpdateQuantity(item.id, (item.orderQuantity || 0) + step)}
                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-[10px] font-bold border border-slate-200/80 active:scale-95 transition"
                                title={`ថែម +${step} ${item.product.unit}`}
                              >
                                +{step}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Delete action */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => handleSafeRemove(item)}
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
                  <td></td>
                  <td></td>
                  <td className="py-3.5 px-3 text-center text-blue-600 text-xs">
                    {totalQty} ឯកតា
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Modern Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        submessage={confirmDialog.submessage}
        type={confirmDialog.type}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonColor={confirmDialog.confirmButtonColor}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

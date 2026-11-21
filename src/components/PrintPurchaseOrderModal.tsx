import React, { useState, useMemo } from 'react';
import { RestockItem } from '../types';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { X, Printer, Filter, CheckCircle2 } from 'lucide-react';

interface PrintPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: RestockItem[];
}

export const PrintPurchaseOrderModal: React.FC<PrintPurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  items
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [martName, setMartName] = useState('MART KHMER EXPRESS');
  const [martPhone, setMartPhone] = useState('012 888 999 / 098 777 666');
  const [martAddress, setMartAddress] = useState('រាជធានីភ្នំពេញ, កម្ពុជា');
  const [poNumber] = useState(() => `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`);

  const orderableItems = useMemo(() => items.filter(i => i.orderQuantity > 0), [items]);
  const displayItems = orderableItems.length > 0 ? orderableItems : items;

  const suppliers = useMemo(() => 
    Array.from(new Set(displayItems.map(i => (i.product.supplierName || 'ទូទៅ (General Supplier)').trim()))).filter(Boolean),
    [displayItems]
  );

  const supplierOptions = useMemo<SelectOption<string>[]>(() => {
    return [
      { value: 'all', label: 'អ្នកផ្គត់ផ្គង់ទាំងអស់', badge: displayItems.length },
      ...suppliers.map(s => ({
        value: s,
        label: s,
        badge: displayItems.filter(i => (i.product.supplierName || 'ទូទៅ (General Supplier)').trim() === s).length
      }))
    ];
  }, [suppliers, displayItems]);

  const filteredItems = useMemo(() => 
    selectedSupplier === 'all'
      ? displayItems
      : displayItems.filter(i => (i.product.supplierName || 'ទូទៅ (General Supplier)').trim() === selectedSupplier),
    [selectedSupplier, displayItems]
  );

  const totalQty = useMemo(() => 
    filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0),
    [filteredItems]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto print:static print:block print:p-0 print:bg-white print:overflow-visible animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto print:border-none print:shadow-none print:rounded-none print:static print:max-w-none print:w-full print:overflow-visible"
        onClick={e => e.stopPropagation()}
      >
        {/* Header toolbar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">ទម្រង់សន្លឹកបញ្ជាទិញ (Purchase Order Preview)</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by supplier */}
            <CustomSelect<string>
              value={selectedSupplier}
              onChange={setSelectedSupplier}
              options={supplierOptions}
              variant="dark"
              size="sm"
              searchable={suppliers.length > 5}
              searchPlaceholder="ស្វែងរកអ្នកផ្គត់ផ្គង់..."
              buttonClassName="bg-slate-800 border-slate-700 text-slate-200"
            />

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Printer className="w-4 h-4" />
              <span>បោះពុម្ព / Save PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div className="p-8 sm:p-10 font-khmer text-slate-800 bg-white min-h-[500px]">
          {/* Invoice Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
            <div className="flex-1 mr-4">
              <input
                type="text"
                value={martName}
                onChange={(e) => setMartName(e.target.value)}
                className="text-2xl font-bold tracking-tight text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent w-full"
                title="ចុចដើម្បីកែឈ្មោះហាង"
              />
              <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                <span className="shrink-0">អាសយដ្ឋាន:</span>
                <input
                  type="text"
                  value={martAddress}
                  onChange={(e) => setMartAddress(e.target.value)}
                  className="border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent text-slate-600 flex-1"
                  title="ចុចដើម្បីកែអាសយដ្ឋាន"
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="shrink-0">ទូរស័ព្ទ:</span>
                <input
                  type="text"
                  value={martPhone}
                  onChange={(e) => setMartPhone(e.target.value)}
                  className="border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent text-slate-600 flex-1"
                  title="ចុចដើម្បីកែលេខទូរស័ព្ទ"
                />
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-1.5">
                Purchase Order
              </span>
              <p className="font-mono text-xs font-bold text-slate-700">{poNumber}</p>
              <p className="text-xs text-slate-500">
                កាលបរិច្ឆេទ: {new Date().toLocaleDateString('km-KH')}
              </p>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-xs grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 font-semibold block uppercase text-[10px]">ផ្ញើជូនអ្នកផ្គត់ផ្គង់ (Supplier)</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5">
                {selectedSupplier === 'all' ? 'អ្នកផ្គត់ផ្គង់ចម្រុះ (Multiple Suppliers)' : selectedSupplier}
              </p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-semibold block uppercase text-[10px]">គោលបំណង</span>
              <p className="font-semibold text-slate-700 mt-0.5">
                ទិញបំពេញស្តុកទំនិញដែលអស់ (Restock Re-order)
              </p>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-xs text-left border-collapse mb-6">
            <thead>
              <tr className="border-y-2 border-slate-800 text-[11px] font-bold text-slate-900 uppercase">
                <th className="py-2.5 px-2 text-center w-10">ល.រ</th>
                <th className="py-2.5 px-3">លេខ Barcode</th>
                <th className="py-2.5 px-3">ឈ្មោះទំនិញ (Description)</th>
                <th className="py-2.5 px-3">ផ្នែក (Category)</th>
                <th className="py-2.5 px-3 text-center">ឯកតា</th>
                <th className="py-2.5 px-3 text-center">ចំនួនទិញ</th>
                <th className="py-2.5 px-3">អ្នកផ្គត់ផ្គង់</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item, idx) => (
                <tr key={item.id} className="print:break-inside-avoid">
                  <td className="py-2 px-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{item.product.barcode}</td>
                  <td className="py-2 px-3">
                    <p className="font-semibold text-slate-800">{item.product.name}</p>
                    {item.product.khmerName && (
                      <p className="text-[11px] text-slate-500">{item.product.khmerName}</p>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-600">{item.product.category}</td>
                  <td className="py-2 px-3 text-center text-slate-600">{item.product.unit}</td>
                  <td className="py-2 px-3 text-center font-bold text-blue-700 text-sm">{item.orderQuantity}</td>
                  <td className="py-2 px-3 text-slate-700">{item.product.supplierName}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-bold text-slate-900">
                <td colSpan={5} className="py-3 px-3 text-right text-xs">សរុបរួម ({filteredItems.length} មុខទំនិញ):</td>
                <td className="py-3 px-3 text-center text-blue-700 text-sm">{totalQty} ឯកតា</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Signature Sections */}
          <div className="grid grid-cols-3 gap-6 pt-12 mt-12 border-t border-slate-200 text-center text-xs print:break-inside-avoid">
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2"></div>
              <p className="font-semibold text-slate-800">អ្នករៀបចំបញ្ជី (Staff)</p>
              <p className="text-[10px] text-slate-400">ហត្ថលេខា និងកាលបរិច្ឆេទ</p>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2"></div>
              <p className="font-semibold text-slate-800">អ្នកគ្រប់គ្រងស្តុក (Manager)</p>
              <p className="text-[10px] text-slate-400">ហត្ថលេខា និងកាលបរិច្ឆេទ</p>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2"></div>
              <p className="font-semibold text-slate-800">អ្នកផ្គត់ផ្គង់ទទួល (Supplier)</p>
              <p className="text-[10px] text-slate-400">ហត្ថលេខា និងកាលបរិច្ឆេទ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

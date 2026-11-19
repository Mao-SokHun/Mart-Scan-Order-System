import React, { useState } from 'react';
import { RestockItem } from '../types';
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

  if (!isOpen) return null;

  const suppliers = Array.from(new Set(items.map(i => i.product.supplierName)));

  const filteredItems = selectedSupplier === 'all'
    ? items
    : items.filter(i => i.product.supplierName === selectedSupplier);

  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const poNumber = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto print:border-none print:shadow-none print:rounded-none">
        {/* Header toolbar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">ទម្រង់សន្លឹកបញ្ជាទិញ (Purchase Order Preview)</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by supplier */}
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none"
            >
              <option value="all">អ្នកផ្គត់ផ្គង់ទាំងអស់</option>
              {suppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

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
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{martName}</h1>
              <p className="text-xs text-slate-500 mt-1">អាសយដ្ឋាន: {martAddress}</p>
              <p className="text-xs text-slate-500">ទូរស័ព្ទ: {martPhone}</p>
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
                <th className="py-2.5 px-3 text-center">ឯកតា</th>
                <th className="py-2.5 px-3 text-center">ចំនួនទិញ</th>
                <th className="py-2.5 px-3 text-right">តម្លៃដើម</th>
                <th className="py-2.5 px-3 text-right">សរុប</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2 px-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{item.product.barcode}</td>
                  <td className="py-2 px-3">
                    <p className="font-semibold text-slate-800">{item.product.name}</p>
                    {item.product.khmerName && (
                      <p className="text-[11px] text-slate-500">{item.product.khmerName}</p>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center text-slate-600">{item.product.unit}</td>
                  <td className="py-2 px-3 text-center font-bold text-blue-700">{item.orderQuantity}</td>
                  <td className="py-2 px-3 text-right">${item.unitCost.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right font-bold text-slate-800">${item.totalCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-bold text-slate-900">
                <td colSpan={4} className="py-3 px-3 text-right text-xs">សរុបរួម:</td>
                <td className="py-3 px-3 text-center text-blue-700 text-xs">{totalQty}</td>
                <td></td>
                <td className="py-3 px-3 text-right text-emerald-700 text-sm">${totalCost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Signature Sections */}
          <div className="grid grid-cols-3 gap-6 pt-12 mt-12 border-t border-slate-200 text-center text-xs">
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

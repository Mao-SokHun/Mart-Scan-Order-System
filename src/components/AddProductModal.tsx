import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { X, PlusCircle, PackagePlus, AlertCircle } from 'lucide-react';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, addToOrderNow: boolean) => Promise<boolean> | boolean | void;
  initialBarcode?: string;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialBarcode = ''
}) => {
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState('');
  const [khmerName, setKhmerName] = useState('');
  const [category, setCategory] = useState('ទំនិញប្រចាំថ្ងៃ (Daily)');
  const [storageTemp, setStorageTemp] = useState<'Dry' | 'Chilled' | 'Frozen'>('Dry');
  const [unit, setUnit] = useState('កំប៉ុង');
  const [costPrice] = useState('0');
  const [sellingPrice] = useState('0');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('24');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [remark, setRemark] = useState('');
  const [addToOrderNow, setAddToOrderNow] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName('');
    setKhmerName('');
    setCategory('ទំនិញប្រចាំថ្ងៃ (Daily)');
    setStorageTemp('Dry');
    setUnit('កំប៉ុង');
    setCurrentStock('0');
    setMinStock('24');
    setSupplierName('');
    setSupplierPhone('');
    setRemark('');
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (isOpen) {
      setBarcode(initialBarcode || '');
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      resetForm();
    }
  }, [isOpen, initialBarcode, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || !name.trim() || isSubmitting) return;

    let cleanBarcode = barcode.trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);

    const parsedCost = Math.round(Math.max(0, parseFloat(costPrice) || 0) * 100) / 100;
    const parsedSelling = Math.round(Math.max(0, parseFloat(sellingPrice) || 0) * 100) / 100;
    const finalCategory = `${category} (${storageTemp})`;

    const newProd: Product = {
      id: `p-${Date.now()}`,
      barcode: cleanBarcode,
      name: name.trim(),
      khmerName: khmerName.trim() || undefined,
      category: finalCategory,
      unit,
      costPrice: parsedCost,
      sellingPrice: parsedSelling,
      currentStock: Math.max(0, parseInt(currentStock, 10) || 0),
      minStock: Math.max(0, parseInt(minStock, 10) || 10),
      supplierName: supplierName.trim() || 'ទូទៅ (General Supplier)',
      supplierPhone: supplierPhone.trim() || undefined,
      remark: remark.trim() || undefined,
      storageTemp,
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80'
    };

    setIsSubmitting(true);
    try {
      const res = await onSave(newProd, addToOrderNow);
      if (res !== false) {
        resetForm();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">ចុះឈ្មោះទំនិញថ្មី</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">បង្កើតទិន្នន័យទំនិញថ្មីសម្រាប់ Barcode នេះ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-4">
          {initialBarcode && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Barcode នេះមិនទាន់មានក្នុងប្រព័ន្ធទេ។ សូមបំពេញព័ត៌មានខាងក្រោមដើម្បីរក្សាទុក៖</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              លេខកូដ Barcode <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              placeholder="ឧ. 8851234567890"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ឈ្មោះទំនិញ (អង់គ្លេស/ទូទៅ) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                placeholder="ឧ. Red Bull Can 250ml"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ឈ្មោះជាភាសាខ្មែរ (Khmer Name)
              </label>
              <input
                type="text"
                value={khmerName}
                onChange={(e) => setKhmerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                placeholder="ឧ. គោជល់ កំប៉ុង"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ផ្នែក (Department)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <optgroup label="ផ្នែកទាំង ៤ ក្នុង Store Daily Plan">
                  <option value="ទំនិញប្រចាំថ្ងៃ (Daily)">ទំនិញប្រចាំថ្ងៃ (Daily)</option>
                  <option value="នំបុ័ង និងនំខេក (Bakery and Cake)">នំបុ័ង និងនំខេក (Bakery and Cake)</option>
                  <option value="បន្លែ ផ្លែឈើ ស្រស់ (Fresh)">បន្លែ ផ្លែឈើ ស្រស់ (Fresh)</option>
                  <option value="ទឹកដោះគោ និងយ៉ាអួរ (Milk and Yogurt)">ទឹកដោះគោ និងយ៉ាអួរ (Milk and Yogurt)</option>
                </optgroup>
                <optgroup label="ប្រភេទផ្សេងៗ">
                  <option value="ភេសជ្ជៈ (Beverages)">ភេសជ្ជៈ (Beverages)</option>
                  <option value="ស្រាបៀរ (Beer)">ស្រាបៀរ (Beer)</option>
                  <option value="ទឹកបរិសុទ្ធ (Water)">ទឹកបរិសុទ្ធ (Water)</option>
                  <option value="មី និងអាហារក្រៀម (Instant Food)">មី និងអាហារក្រៀម (Instant Food)</option>
                  <option value="នំចំណី (Snacks)">នំចំណី (Snacks)</option>
                  <option value="របស់របរប្រើប្រាស់ (Personal Care)">របស់របរប្រើប្រាស់ (Personal Care)</option>
                  <option value="សម្ភារៈបន្ទប់ទឹក/ផ្ទះបាយ (Household)">សម្ភារៈបន្ទប់ទឹក/ផ្ទះបាយ (Household)</option>
                  <option value="ផ្សេងៗ (Other)">ផ្សេងៗ (Other)</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">សីតុណ្ហភាព (Temp)</label>
              <select
                value={storageTemp}
                onChange={(e) => setStorageTemp(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium"
              >
                <option value="Dry">Dry (ស្ងួត/ធម្មតា)</option>
                <option value="Chilled">Chilled (ត្រជាក់/ក្លាស្សេ)</option>
                <option value="Frozen">Frozen (កក)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ឯកតារាប់ (Unit)</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                placeholder="Units, កំប៉ុង, ដប, កញ្ចប់..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ស្តុកបច្ចុប្បន្ន (Current Stock)</label>
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">កម្រិតស្តុកត្រូវទិញបន្ថែម (Min Stock)</label>
              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ឈ្មោះអ្នកផ្គត់ផ្គង់ (Supplier)</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="ឧ. DKSH Cambodia, Coca-Cola..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">លេខទូរស័ព្ទ Supplier</label>
              <input
                type="text"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="ឧ. 012 345 678"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              កំណត់សម្គាល់ដឹកជញ្ជូន (Remark / Delivery)
            </label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="ឧ. Delivery on Thu, Lead Time 2 Week..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addToOrderNow}
                onChange={(e) => setAddToOrderNow(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-slate-700">
                បញ្ចូលទំនិញនេះទៅក្នុងតារាងទំនិញអស់ស្តុកត្រូវទិញភ្លាមៗ
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              បោះបង់
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកទំនិញ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

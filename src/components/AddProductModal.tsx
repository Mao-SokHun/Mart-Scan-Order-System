import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { X, PlusCircle, PackagePlus, AlertCircle, Edit, Link2, Search, Check } from 'lucide-react';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, addToOrderNow: boolean, isEdit?: boolean) => Promise<boolean> | boolean | void;
  initialBarcode?: string;
  editingProduct?: Product | null;
  products?: Product[];
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialBarcode = '',
  editingProduct = null,
  products = []
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'link'>('create');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [selectedProductToLink, setSelectedProductToLink] = useState<Product | null>(null);

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
    setActiveTab('create');
    setLinkSearchQuery('');
    setSelectedProductToLink(null);
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

  const categoryOptions: SelectOption<string>[] = useMemo(() => [
    { value: 'ទំនិញប្រចាំថ្ងៃ (Daily)', label: 'ទំនិញប្រចាំថ្ងៃ (Daily)', group: 'ផ្នែកទាំង ៤ ក្នុង Store Daily Plan' },
    { value: 'នំបុ័ង និងនំខេក (Bakery and Cake)', label: 'នំបុ័ង និងនំខេក (Bakery and Cake)', group: 'ផ្នែកទាំង ៤ ក្នុង Store Daily Plan' },
    { value: 'បន្លែ ផ្លែឈើ ស្រស់ (Fresh)', label: 'បន្លែ ផ្លែឈើ ស្រស់ (Fresh)', group: 'ផ្នែកទាំង ៤ ក្នុង Store Daily Plan' },
    { value: 'ទឹកដោះគោ និងយ៉ាអួរ (Milk and Yogurt)', label: 'ទឹកដោះគោ និងយ៉ាអួរ (Milk and Yogurt)', group: 'ផ្នែកទាំង ៤ ក្នុង Store Daily Plan' },
    { value: 'ភេសជ្ជៈ (Beverages)', label: 'ភេសជ្ជៈ (Beverages)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'ស្រាបៀរ (Beer)', label: 'ស្រាបៀរ (Beer)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'ទឹកបរិសុទ្ធ (Water)', label: 'ទឹកបរិសុទ្ធ (Water)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'មី និងអាហារក្រៀម (Instant Food)', label: 'មី និងអាហារក្រៀម (Instant Food)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'នំចំណី (Snacks)', label: 'នំចំណី (Snacks)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'របស់របរប្រើប្រាស់ (Personal Care)', label: 'របស់របរប្រើប្រាស់ (Personal Care)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'សម្ភារៈបន្ទប់ទឹក/ផ្ទះបាយ (Household)', label: 'សម្ភារៈបន្ទប់ទឹក/ផ្ទះបាយ (Household)', group: 'ប្រភេទផ្សេងៗ' },
    { value: 'ផ្សេងៗ (Other)', label: 'ផ្សេងៗ (Other)', group: 'ប្រភេទផ្សេងៗ' },
  ], []);

  const tempOptions: SelectOption<'Dry' | 'Chilled' | 'Frozen'>[] = useMemo(() => [
    { value: 'Dry', label: 'Dry (ស្ងួត/ធម្មតា)' },
    { value: 'Chilled', label: 'Chilled (ត្រជាក់/ក្លាស្សេ)' },
    { value: 'Frozen', label: 'Frozen (កក)' },
  ], []);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setBarcode(editingProduct.barcode || '');
        setName(editingProduct.name || '');
        setKhmerName(editingProduct.khmerName || '');
        setUnit(editingProduct.unit || 'កំប៉ុង');
        setCurrentStock(String(editingProduct.currentStock ?? 0));
        setMinStock(String(editingProduct.minStock ?? 24));
        setSupplierName(editingProduct.supplierName || '');
        setSupplierPhone(editingProduct.supplierPhone || '');
        setRemark(editingProduct.remark || '');
        const temp: 'Dry' | 'Chilled' | 'Frozen' =
          editingProduct.storageTemp === 'Chilled' ? 'Chilled' :
          editingProduct.storageTemp === 'Frozen' ? 'Frozen' : 'Dry';
        setStorageTemp(temp);
        setAddToOrderNow(false);
        setActiveTab('create');
        // Extract category base
        const cleanCat = (editingProduct.category || 'ផ្សេងៗ (Other)').replace(/\s*\((Dry|Chilled|Frozen)\)\s*/i, '').trim();
        setCategory(cleanCat || 'ផ្សេងៗ (Other)');
      } else {
        setBarcode(initialBarcode || '');
        setActiveTab('create');
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCloseRef.current();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      resetForm();
    }
  }, [isOpen, initialBarcode, editingProduct]);

  // Filter existing catalog items for Link Barcode tab
  const filteredProductsToLink = useMemo(() => {
    if (!linkSearchQuery.trim()) return products.slice(0, 30);
    const q = linkSearchQuery.toLowerCase().trim();
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.khmerName || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.supplierName || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [products, linkSearchQuery]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || !name.trim() || isSubmitting) return;

    let cleanBarcode = barcode.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);

    const parsedCost = Math.round(Math.max(0, parseFloat(costPrice) || 0) * 100) / 100;
    const parsedSelling = Math.round(Math.max(0, parseFloat(sellingPrice) || 0) * 100) / 100;
    const finalCategory = `${category} (${storageTemp})`;

    const targetProd: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
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
      image: editingProduct?.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80'
    };

    setIsSubmitting(true);
    try {
      const res = await onSave(targetProd, addToOrderNow, !!editingProduct);
      if (res !== false) {
        resetForm();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkExistingProduct = async () => {
    if (!selectedProductToLink || !initialBarcode || isSubmitting) return;
    let cleanBarcode = initialBarcode.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);

    const updatedProduct: Product = {
      ...selectedProductToLink,
      barcode: cleanBarcode
    };

    setIsSubmitting(true);
    try {
      const res = await onSave(updatedProduct, addToOrderNow, true);
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
            <div className={`p-2 rounded-xl ${editingProduct ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              {editingProduct ? <Edit className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                {editingProduct ? 'កែប្រែព័ត៌មានទំនិញ' : 'ចុះឈ្មោះទំនិញថ្មី'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {editingProduct
                  ? `កែប្រែ Barcode ឬព័ត៌មានទំនិញ «${editingProduct.name}»`
                  : 'បង្កើតទិន្នន័យទំនិញថ្មីសម្រាប់ Barcode នេះ'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch for unknown scanned barcode: Create vs Link to Existing */}
        {!editingProduct && initialBarcode && products.length > 0 && (
          <div className="px-4 sm:px-6 pt-3 pb-1 border-b border-slate-100 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>បង្កើតទំនិញថ្មី</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('link')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'link'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>🔗 ភ្ជាប់ជាមួយទំនិញចាស់</span>
            </button>
          </div>
        )}

        {/* Tab Content: Link Scanned Barcode to Existing Product */}
        {!editingProduct && activeTab === 'link' && initialBarcode ? (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">ភ្ជាប់ Barcode <code>{initialBarcode}</code> ទៅទំនិញដែលមានស្រាប់</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  ប្រសិនបើទំនិញក្នុងប្រព័ន្ធត្រូវបានដាក់កូដចាស់ (ឧ. កូដ Takeo) ហើយអ្នកចង់ឱ្យការស្កេន Barcode នេះស្គាល់ទំនិញនោះ សូមជ្រើសរើសទំនិញខាងក្រោម៖
                </p>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                placeholder="វាយឈ្មោះទំនិញ ឬកូដដើម្បីស្វែងរក..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white">
              {filteredProductsToLink.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  រកមិនឃើញទំនិញត្រូវនឹងពាក្យស្វែងរកទេ
                </div>
              ) : (
                filteredProductsToLink.map((prod) => {
                  const isSelected = selectedProductToLink?.id === prod.id;
                  return (
                    <div
                      key={prod.id}
                      onClick={() => setSelectedProductToLink(prod)}
                      className={`p-2.5 flex items-center justify-between gap-2 cursor-pointer transition ${
                        isSelected ? 'bg-amber-50/80 border-l-4 border-amber-500' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{prod.name}</p>
                        {prod.khmerName && <p className="text-[11px] text-slate-500 truncate">{prod.khmerName}</p>}
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                          <span>កូដបច្ចុប្បន្ន: {prod.barcode}</span>
                          <span>•</span>
                          <span>{prod.category}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-slate-300"></div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
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
                  ដាក់ចូលក្នុងតារាងទំនិញត្រូវទិញភ្លាមៗបន្ទាប់ពីភ្ជាប់រួច
                </span>
              </label>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={!selectedProductToLink || isSubmitting}
                onClick={handleLinkExistingProduct}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <Link2 className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'កំពុងភ្ជាប់...'
                    : selectedProductToLink
                    ? `ភ្ជាប់ទៅ «${selectedProductToLink.name.slice(0, 20)}...»`
                    : 'ជ្រើសរើសទំនិញដើម្បីភ្ជាប់'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-4">
            {!editingProduct && initialBarcode && (
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
                <CustomSelect<string>
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  fullWidth
                  size="md"
                  searchable
                  searchPlaceholder="ស្វែងរកផ្នែកទំនិញ..."
                  buttonClassName="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">សីតុណ្ហភាព (Temp)</label>
                <CustomSelect<'Dry' | 'Chilled' | 'Frozen'>
                  value={storageTemp}
                  onChange={setStorageTemp}
                  options={tempOptions}
                  fullWidth
                  size="md"
                  buttonClassName="bg-slate-50 border-slate-200 font-medium"
                />
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

            {!editingProduct && (
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
            )}

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
                className={`px-5 py-2.5 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 ${
                  editingProduct
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50`}
              >
                {editingProduct ? <Check className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                <span>
                  {isSubmitting
                    ? 'កំពុងរក្សាទុក...'
                    : editingProduct
                    ? 'រក្សាទុកការកែប្រែ'
                    : 'រក្សាទុកទំនិញ'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

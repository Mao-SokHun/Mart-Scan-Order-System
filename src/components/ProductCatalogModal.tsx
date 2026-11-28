import React, { useState, useMemo } from 'react';
import { Product } from '../types';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { ConfirmModal } from './ui/ConfirmModal';
import { X, Search, Plus, PlusCircle, Package, RefreshCw, ShoppingCart, Check, FileSpreadsheet, Trash2, Pencil } from 'lucide-react';

interface ProductCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onOpenAddNew: () => void;
  onOpenImportExcel?: () => void;
  onAddToOrder: (product: Product) => void;
  onDeleteProduct?: (productId: string) => void;
  onEditProduct?: (product: Product) => void;
  onResetDemoData: () => void;
}

export const ProductCatalogModal: React.FC<ProductCatalogModalProps> = ({
  isOpen,
  onClose,
  products,
  onOpenAddNew,
  onOpenImportExcel,
  onAddToOrder,
  onDeleteProduct,
  onEditProduct,
  onResetDemoData
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  const categories = useMemo(() => 
    Array.from(new Set(products.map(p => (p.category || 'ផ្សេងៗ (Other)').trim()))).filter(Boolean),
    [products]
  );

  const categoryOptions = useMemo<SelectOption<string>[]>(() => {
    return [
      { value: 'all', label: 'ប្រភេទទាំងអស់', badge: products.length },
      ...categories.map(c => ({
        value: c,
        label: c,
        badge: products.filter(p => (p.category || 'ផ្សេងៗ (Other)').trim() === c).length
      }))
    ];
  }, [categories, products]);

  React.useEffect(() => {
    setVisibleLimit(100);
  }, [searchQuery, selectedCategory, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !productToDelete) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, productToDelete]);

  if (!isOpen) return null;

  const filtered = products.filter(p => {
    const cat = (p.category || 'ផ្សេងៗ (Other)').trim();
    const matchesCat = selectedCategory === 'all' || cat === selectedCategory;
    const cleanQ = searchQuery.toLowerCase().trim().replace(/\.0$/, '');
    if (!cleanQ) return matchesCat;

    const terms = cleanQ.split(/\s+/).filter(Boolean);
    const prodBarcode = (p.barcode || '').toLowerCase().replace(/\.0$/, '');
    const prodName = (p.name || '').toLowerCase();
    const prodKhmer = (p.khmerName || '').toLowerCase();
    const prodSupplier = (p.supplierName || '').toLowerCase();
    const prodCategory = cat.toLowerCase();

    const matchesSearch = terms.every(term => 
      prodName.includes(term) ||
      prodKhmer.includes(term) ||
      prodBarcode.includes(term) ||
      prodSupplier.includes(term) ||
      prodCategory.includes(term)
    );

    return matchesCat && matchesSearch;
  });

  const handleAdd = (product: Product) => {
    onAddToOrder(product);
    setRecentlyAddedId(product.id);
    setTimeout(() => setRecentlyAddedId(null), 1000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">បញ្ជីទំនិញ (Catalog)</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">មានសរុប {products.length} មុខទំនិញ</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {onOpenImportExcel && (
              <button
                onClick={onOpenImportExcel}
                className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition shadow-2xs active:scale-95"
                title="នាំចូលទំនិញរាប់រយមុខពី Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Import Excel</span>
              </button>
            )}
            <button
              onClick={onOpenAddNew}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition shadow-2xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">បន្ថែមទំនិញ</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 active:scale-95 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ស្វែងរកតាមឈ្មោះ ឬ Barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/30 text-slate-800"
            />
          </div>

          <div className="flex items-center gap-2">
            <CustomSelect<string>
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={categoryOptions}
              size="sm"
              searchable={categories.length > 5}
              searchPlaceholder="ស្វែងរកប្រភេទ..."
              className="flex-1 sm:flex-none"
              buttonClassName="bg-slate-50 border-slate-200"
            />

            <button
              onClick={onResetDemoData}
              title="ទាញយកទិន្នន័យចុងក្រោយពី Database"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition shrink-0 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Product Grid / List */}
        <div className="p-3.5 sm:p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 text-xs">
              រកមិនឃើញទំនិញទេ
            </div>
          ) : (
            filtered.slice(0, visibleLimit).map((prod) => {
              const isAdded = recentlyAddedId === prod.id;
              const isOutOfStock = prod.currentStock <= 0;
              return (
                <div
                  key={prod.id}
                  className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 hover:bg-white hover:border-blue-200 hover:shadow-xs transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {prod.image ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-slate-400 shrink-0">
                        {prod.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-slate-800 truncate">
                        {prod.name}
                      </p>
                      {prod.khmerName && (
                        <p className="text-[11px] text-slate-500 truncate">
                          {prod.khmerName}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="font-mono text-[10px] bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded">
                          {prod.barcode}
                        </span>
                        {isOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            អស់ស្តុក
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            សល់ {prod.currentStock} {prod.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {prod.category}
                    </span>
                    <div className="flex items-center gap-1">
                      {onEditProduct && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProduct(prod);
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition"
                          title="កែប្រែ Barcode / ព័ត៌មានទំនិញ"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteProduct && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductToDelete(prod);
                          }}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                          title="លុបទំនិញចេញពី Catalog"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAdd(prod)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                          isAdded
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>បានដាក់</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>+ ទិញ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {filtered.length > visibleLimit && (
            <div className="col-span-full pt-2 pb-1 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit(prev => prev + 100)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-xl text-xs font-bold transition active:scale-95"
              >
                បង្ហាញបន្ថែម ({filtered.length - visibleLimit} មុខទៀត)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Product Modal */}
      <ConfirmModal
        isOpen={!!productToDelete}
        title="បញ្ជាក់ការលុបទំនិញពី Catalog"
        type="danger"
        message={
          productToDelete ? (
            <span>
              តើអ្នកពិតជាចង់លុបទំនិញ «<strong className="text-slate-900 font-bold">{productToDelete.name}</strong>» ចេញពី Catalog មែនទេ?
            </span>
          ) : null
        }
        submessage={productToDelete ? `Barcode: ${productToDelete.barcode} | ផ្នែក: ${productToDelete.category}` : undefined}
        confirmText="លុបទំនិញ"
        cancelText="បោះបង់"
        confirmButtonColor="bg-rose-600 hover:bg-rose-700 text-white"
        onConfirm={() => {
          if (productToDelete && onDeleteProduct) {
            onDeleteProduct(productToDelete.id);
          }
          setProductToDelete(null);
        }}
        onCancel={() => setProductToDelete(null)}
      />
    </div>
  );
};

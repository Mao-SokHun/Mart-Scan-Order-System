import React, { useState, useEffect, useCallback } from 'react';
import { Product, RestockItem } from './types';
import { api, HealthStatus } from './services/api';
import { 
  getStoredProducts, saveProducts, 
  getStoredRestockItems, saveRestockItems 
} from './utils/storage';
import { 
  exportDailyPlanExcel, 
  exportToSimplePOExcel, 
  copyToTelegramClipboard 
} from './utils/export';
import { sound } from './utils/audio';
import { useBarcodeGun } from './hooks/useBarcodeGun';

import { ManualBarcodeInput } from './components/ManualBarcodeInput';
import { CameraScannerModal } from './components/CameraScannerModal';
import { RestockOrderTable } from './components/RestockOrderTable';
import { AddProductModal } from './components/AddProductModal';
import { ProductCatalogModal } from './components/ProductCatalogModal';
import { PrintPurchaseOrderModal } from './components/PrintPurchaseOrderModal';
import { BarcodeCardTester } from './components/BarcodeCardTester';
import { INITIAL_PRODUCTS } from './data/mockProducts';

import { 
  Store, Camera, Package, Plus, Sparkles, 
  CheckCircle, AlertCircle, ShoppingBag, 
  ChevronDown, ChevronUp, Bell, Database, RefreshCw 
} from 'lucide-react';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(getStoredProducts);
  const [restockItems, setRestockItems] = useState<RestockItem[]>(getStoredRestockItems);
  const [dbStatus, setDbStatus] = useState<HealthStatus>({ connected: false });
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isPrintPOOpen, setIsPrintPOOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string>('');
  const [showTestSheet, setShowTestSheet] = useState(true);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  const handleOpenCamera = () => {
    sound.warmup();
    setIsCameraOpen(true);
  };

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // 1. Fetch initial data from Neon PostgreSQL
  const loadDataFromDatabase = useCallback(async () => {
    try {
      setIsLoading(true);
      const health = await api.checkHealth();
      setDbStatus(health);

      if (health.connected) {
        const [dbProducts, dbRestock] = await Promise.all([
          api.getProducts(),
          api.getRestockItems()
        ]);
        if (dbProducts && dbProducts.length > 0) {
          setProducts(dbProducts);
          saveProducts(dbProducts);
        }
        setRestockItems(prevLocal => {
          if (!prevLocal || prevLocal.length === 0) {
            saveRestockItems(dbRestock);
            return dbRestock;
          }
          const merged = [...dbRestock];
          const unSynced: RestockItem[] = [];
          for (const localItem of prevLocal) {
            const exists = merged.some(m => m.product.id === localItem.product.id || m.id === localItem.id);
            if (!exists) {
              merged.push(localItem);
              unSynced.push(localItem);
            }
          }
          if (unSynced.length > 0) {
            api.syncBatchRestockItems(unSynced).catch(e => console.warn('Sync offline restock items error:', e));
          }
          saveRestockItems(merged);
          return merged;
        });
      }
    } catch (err) {
      console.warn('Backend not reached yet, using local storage cache:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDataFromDatabase();
    // Poll db health every 30s
    const interval = setInterval(async () => {
      const health = await api.checkHealth();
      setDbStatus(health);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDataFromDatabase]);

  // Synchronize state with LocalStorage for offline resilience
  useEffect(() => {
    saveRestockItems(restockItems);
  }, [restockItems]);

  useEffect(() => {
    if (products.length > 0) {
      saveProducts(products);
    }
  }, [products]);

  // Handle Scanning Barcode (Used by both Barcode Gun & Camera Scanner & Manual Input)
  const handleScan = useCallback(async (scannedBarcode: string) => {
    const cleanBarcode = scannedBarcode.replace(/[\r\n\t]/g, '').trim();
    if (!cleanBarcode) return;

    // If connected to Neon DB, perform scan through API
    if (dbStatus.connected) {
      try {
        const res = await api.scanBarcode(cleanBarcode);
        if (res.found && res.item) {
          const item = res.item;

          if (res.action === 'already_exists') {
            // DO NOT increment quantity!
            sound.playSuccessBeep();
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 2500);
            showToast(`⚠️ «${item.product.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
            return;
          }

          // Newly added item: guard against duplicate keys in state
          sound.playSuccessBeep();
          setRestockItems(prev => {
            const exists = prev.some(i => i.id === item.id || i.product.id === item.product.id);
            if (exists) {
              return prev.map(i => (i.id === item.id || i.product.id === item.product.id) ? item : i);
            }
            return [item, ...prev];
          });
          setHighlightedItemId(item.id);
          setTimeout(() => setHighlightedItemId(null), 2500);
          showToast(`✅ បានស្កេន «${item.product.name}» ចូលតារាង! សូម Admin វាយចំនួន`, 'success');
          return;
        }
      } catch (e) {
        console.warn('API scan failed, falling back to local search:', e);
      }
    }

    // Local Fallback logic (case-insensitive)
    const foundProduct = products.find(p => p.barcode.toLowerCase() === cleanBarcode.toLowerCase());
    if (foundProduct) {
      sound.playSuccessBeep();
      setRestockItems(prevItems => {
        const existingIndex = prevItems.findIndex(i => i.product.id === foundProduct.id);
        if (existingIndex > -1) {
          // ALREADY EXISTS: Do NOT increment quantity!
          const existing = prevItems[existingIndex];
          setHighlightedItemId(existing.id);
          setTimeout(() => setHighlightedItemId(null), 2500);
          showToast(`⚠️ «${foundProduct.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
          return prevItems;
        } else {
          // Newly added with quantity = 0 so Admin types it
          const defaultQty = 0;
          const newItem: RestockItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            product: foundProduct,
            orderQuantity: defaultQty,
            scannedAt: new Date().toISOString(),
            unitCost: foundProduct.costPrice || 0,
            totalCost: 0
          };
          setHighlightedItemId(newItem.id);
          setTimeout(() => setHighlightedItemId(null), 2500);
          showToast(`✅ បានស្កេន «${foundProduct.name}» ចូលតារាង! សូម Admin វាយចំនួន`, 'success');
          return [newItem, ...prevItems];
        }
      });
    } else {
      sound.playErrorBuzz();
      setNotFoundBarcode(cleanBarcode);
      setIsAddProductOpen(true);
      showToast(`រកមិនឃើញ Barcode "${cleanBarcode}" ក្នុងប្រព័ន្ធទេ!`, 'error');
    }
  }, [dbStatus.connected, products]);

  // Global listener for USB/Bluetooth Barcode Scanner Guns
  useBarcodeGun({
    onScan: handleScan,
    enabled: !isAddProductOpen && !isPrintPOOpen && !isCatalogOpen && !isCameraOpen
  });

  // Quantity updater
  const handleUpdateQuantity = async (itemId: string, newQty: number) => {
    if (newQty < 0) return;

    // Optimistic local update with safe 2-decimal rounding
    setRestockItems(prev => prev.map(item => {
      if (item.id === itemId || item.product.id === itemId) {
        return {
          ...item,
          orderQuantity: newQty,
          totalCost: Math.round(newQty * (item.unitCost || 0) * 100) / 100
        };
      }
      return item;
    }));

    if (dbStatus.connected) {
      try {
        await api.updateQuantity(itemId, newQty);
      } catch (err) {
        console.error('Failed to sync quantity to DB:', err);
      }
    }
  };

  // Remove single item
  const handleRemoveItem = async (itemId: string) => {
    setRestockItems(prev => prev.filter(i => i.id !== itemId && i.product.id !== itemId));
    showToast('បានលុបទំនិញចេញពីតារាង', 'info');

    if (dbStatus.connected) {
      try {
        await api.deleteRestockItem(itemId);
      } catch (err) {
        console.error('Failed to delete item from DB:', err);
      }
    }
  };

  // Clear all items
  const handleClearAll = async () => {
    if (window.confirm('តើអ្នកពិតជាចង់សម្អាតតារាងបញ្ជាទិញនេះទាំងអស់មែនទេ?')) {
      setRestockItems([]);
      showToast('បានសម្អាតតារាងបញ្ជាទិញរួចរាល់', 'info');

      if (dbStatus.connected) {
        try {
          await api.clearRestockItems();
        } catch (err) {
          console.error('Failed to clear items in DB:', err);
        }
      }
    }
  };

  // Save newly registered product
  const handleSaveNewProduct = async (newProduct: Product, addToOrderNow: boolean) => {
    let savedProd = newProduct;

    if (dbStatus.connected) {
      try {
        savedProd = await api.createProduct(newProduct);
      } catch (err: any) {
        showToast(`បរាជ័យក្នុងការរក្សាទុកក្នុង DB: ${err.message}`, 'error');
        return; // Halt if DB rejected (e.g. duplicate barcode)
      }
    } else {
      const existsLocally = products.some(p => p.barcode.toLowerCase() === newProduct.barcode.toLowerCase());
      if (existsLocally) {
        showToast(`Barcode "${newProduct.barcode}" មានរួចហើយក្នុងប្រព័ន្ធ!`, 'error');
        return;
      }
    }

    setProducts(prev => [savedProd, ...prev]);
    showToast(`បានចុះឈ្មោះទំនិញ "${savedProd.name}" ចូលក្នុងប្រព័ន្ធជោគជ័យ`, 'success');

    if (addToOrderNow) {
      sound.playSuccessBeep();
      const newItem: RestockItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        product: savedProd,
        orderQuantity: 0,
        scannedAt: new Date().toISOString(),
        unitCost: savedProd.costPrice || 0,
        totalCost: 0
      };

      setRestockItems(prev => {
        const exists = prev.some(i => i.product.id === savedProd.id || i.product.barcode.toLowerCase() === savedProd.barcode.toLowerCase());
        if (exists) return prev;
        return [newItem, ...prev];
      });

      setHighlightedItemId(newItem.id);
      setTimeout(() => setHighlightedItemId(null), 2500);

      // Async sync to DB if connected
      if (dbStatus.connected) {
        api.scanBarcode(savedProd.barcode).catch(err => console.warn('Sync scan failed:', err));
      }
    }
  };

  // Reset to initial demo catalog
  const handleResetDemoData = () => {
    if (window.confirm('តើអ្នកចង់ទាញយកទិន្នន័យពី Neon PostgreSQL ឡើងវិញមែនទេ?')) {
      loadDataFromDatabase();
      showToast('បាន Refresh ទិន្នន័យឡើងវិញ', 'info');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/60 pb-24 sm:pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Mart Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="font-extrabold text-xs sm:text-base text-slate-900 tracking-tight truncate">
                  Mart Scan & Order
                </h1>
                {/* Neon PostgreSQL Badge */}
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border shrink-0 ${
                  dbStatus.connected 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  <Database className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{dbStatus.connected ? 'Neon DB' : 'Connecting...'}</span>
                  {dbStatus.connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                </div>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium hidden sm:block truncate">
                ប្រព័ន្ធស្កេនទំនិញអស់ស្តុក និងចេញតារាងបញ្ជាទិញ (Cloud Database)
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setIsCatalogOpen(true)}
              className="p-2 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
              title="មើលបញ្ជីទំនិញទាំងអស់"
            >
              <Package className="w-4 h-4 text-slate-600" />
              <span className="hidden md:inline">ទំនិញ ({products.length})</span>
            </button>

            <button
              onClick={() => {
                setNotFoundBarcode('');
                setIsAddProductOpen(true);
              }}
              className="p-2 sm:px-3 sm:py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
              title="ចុះឈ្មោះទំនិញថ្មី"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">ចុះឈ្មោះទំនិញ</span>
            </button>

            <button
              onClick={handleOpenCamera}
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Camera Scan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Toggleable Barcode Test Sheet */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setShowTestSheet(!showTestSheet)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{showTestSheet ? 'លាក់សន្លឹកតេស្ត Barcode លើអេក្រង់' : 'បង្ហាញសន្លឹកតេស្ត Barcode លើអេក្រង់ (Demo)'}</span>
            {showTestSheet ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              ស្កេនបានទាំងកាំភ្លើង USB/Bluetooth និងកាមេរ៉ាទូរស័ព្ទ
            </span>
            <button
              onClick={loadDataFromDatabase}
              title="ទាញយកទិន្នន័យពី Neon DB ឡើងវិញ"
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {showTestSheet && (
          <BarcodeCardTester
            products={products}
            onSimulateScan={handleScan}
          />
        )}

        {/* Barcode Input Section */}
        <ManualBarcodeInput
          onScan={handleScan}
          onOpenCamera={handleOpenCamera}
        />

        {/* Restock Order Table */}
        <RestockOrderTable
          items={restockItems}
          highlightedItemId={highlightedItemId}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onClearAll={handleClearAll}
          onExportExcel={(itemsToExport, day, filter) => {
            const ok = exportDailyPlanExcel(itemsToExport, day, filter);
            if (ok) showToast(`បានទាញយក Daily Plan (${day}) ជា Excel រួចរាល់`, 'success');
            return ok;
          }}
          onExportSimplePO={(itemsToExport, filter) => {
            const ok = exportToSimplePOExcel(itemsToExport, filter);
            if (ok) showToast('បានទាញយកបញ្ជីកុម្ម៉ង់ PO ជា Excel រួចរាល់', 'success');
            return ok;
          }}
          onCopyToTelegram={async (itemsToExport, day, filter) => {
            const ok = await copyToTelegramClipboard(itemsToExport, day, filter);
            if (ok) showToast('បានចម្លងអត្ថបទសម្រាប់ Telegram រួចរាល់!', 'success');
            return ok;
          }}
          onOpenPrintPO={() => setIsPrintPOOpen(true)}
        />
      </main>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce print:hidden">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-semibold ${
            toast.type === 'success' 
              ? 'bg-slate-900 text-white border-slate-800' 
              : toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-800'
              : 'bg-blue-900 text-white border-blue-800'
          }`}>
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
            {toast.type === 'info' && <Bell className="w-4 h-4 text-blue-400" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={handleScan}
      />

      {/* Add New Product Modal */}
      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSave={handleSaveNewProduct}
        initialBarcode={notFoundBarcode}
      />

      {/* Product Catalog Modal */}
      <ProductCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        products={products}
        onOpenAddNew={() => {
          setIsCatalogOpen(false);
          setNotFoundBarcode('');
          setIsAddProductOpen(true);
        }}
        onAddToOrder={(product) => handleScan(product.barcode)}
        onResetDemoData={handleResetDemoData}
      />

      {/* Print Purchase Order Modal */}
      <PrintPurchaseOrderModal
        isOpen={isPrintPOOpen}
        onClose={() => setIsPrintPOOpen(false)}
        items={restockItems}
      />

      {/* Mobile Sticky Bottom Bar (Thumb-friendly scanner and order total) */}
      <div className="md:hidden print:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2.5 flex items-center justify-between z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="min-w-0 pr-2">
          <span className="text-[10px] text-slate-500 block font-medium truncate">
            សរុប {restockItems.length} មុខ • {restockItems.reduce((a, c) => a + (c.orderQuantity || 0), 0)} ឯកតា
          </span>
          <span className="text-sm font-extrabold text-emerald-600">
            ${(restockItems.reduce((a, c) => a + (c.totalCost || 0), 0) || 0).toFixed(2)}
          </span>
        </div>

        <button
          onClick={handleOpenCamera}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 active:scale-95 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/25 shrink-0"
        >
          <Camera className="w-4 h-4" />
          <span>ស្កេន Barcode</span>
        </button>
      </div>
    </div>
  );
};

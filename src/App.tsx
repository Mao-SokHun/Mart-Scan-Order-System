import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { ImportProductsModal } from './components/ImportProductsModal';
import { BarcodeCardTester } from './components/BarcodeCardTester';
import { INITIAL_PRODUCTS } from './data/mockProducts';

import { 
  Store, Camera, Package, Plus, Sparkles, 
  CheckCircle, AlertCircle, ShoppingBag, 
  ChevronDown, ChevronUp, Bell, Database, RefreshCw, FileSpreadsheet 
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
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string>('');
  const [showTestSheet, setShowTestSheet] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // References for debouncing keystrokes on quantities to prevent race conditions
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map());

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
          const unSynced: RestockItem[] = [];
          const localMap = new Map<string, RestockItem>();
          for (const loc of prevLocal) {
            if (loc.product?.id) localMap.set(loc.product.id, loc);
            if (loc.id) localMap.set(loc.id, loc);
          }

          // Merge db items with offline local overrides and active user keystrokes
          const merged: RestockItem[] = dbRestock.map(dbItem => {
            // If user is actively typing a quantity for this item, preserve active input
            if (pendingUpdatesRef.current.has(dbItem.id)) {
              const pendingQty = pendingUpdatesRef.current.get(dbItem.id)!;
              return { ...dbItem, orderQuantity: pendingQty };
            }
            if (pendingUpdatesRef.current.has(dbItem.product.id)) {
              const pendingQty = pendingUpdatesRef.current.get(dbItem.product.id)!;
              return { ...dbItem, orderQuantity: pendingQty };
            }

            const locItem = localMap.get(dbItem.product.id) || localMap.get(dbItem.id);
            if (locItem) {
              // If user modified quantity or details locally while offline, preserve local edits
              if (locItem.orderQuantity > 0 && dbItem.orderQuantity === 0) {
                unSynced.push({ ...dbItem, orderQuantity: locItem.orderQuantity, totalCost: locItem.totalCost });
                return { ...dbItem, orderQuantity: locItem.orderQuantity, totalCost: locItem.totalCost };
              }
              if (locItem.orderQuantity !== dbItem.orderQuantity && locItem.orderQuantity > 0) {
                unSynced.push({ ...dbItem, orderQuantity: locItem.orderQuantity, totalCost: locItem.totalCost });
                return { ...dbItem, orderQuantity: locItem.orderQuantity, totalCost: locItem.totalCost };
              }
            }
            return dbItem;
          });

          // Check for items added completely offline that aren't in dbRestock
          for (const localItem of prevLocal) {
            const existsInDb = dbRestock.some(m => m.product.id === localItem.product.id || m.id === localItem.id);
            if (!existsInDb) {
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

    const handleOnline = () => {
      console.log('🌐 Browser online detected, re-syncing with Neon DB...');
      loadDataFromDatabase();
    };
    window.addEventListener('online', handleOnline);

    // Poll db health every 30s
    const interval = setInterval(async () => {
      const health = await api.checkHealth();
      setDbStatus(prev => {
        // If connection just restored from offline, automatically sync with DB!
        if (!prev.connected && health.connected) {
          loadDataFromDatabase();
        }
        return health;
      });
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
      debounceTimersRef.current.forEach(timer => clearTimeout(timer));
      debounceTimersRef.current.clear();
      pendingUpdatesRef.current.clear();
    };
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
    let cleanBarcode = scannedBarcode.replace(/[\r\n\t]/g, '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
    if (!cleanBarcode) return;

    // ⚡ 1. ULTRA-FAST INSTANT IN-MEMORY SCAN (0ms latency):
    // Check locally cached catalog first so data pops into the table instantaneously!
    const foundProduct = products.find(p => p.barcode.toLowerCase() === cleanBarcode.toLowerCase());

    if (foundProduct) {
      sound.playSuccessBeep();

      // Check if item already exists in restock table
      let alreadyExists = false;
      let existingId = '';

      setRestockItems(prevItems => {
        const existingIndex = prevItems.findIndex(
          i => i.product.id === foundProduct.id || i.product.barcode.toLowerCase() === cleanBarcode.toLowerCase()
        );

        if (existingIndex > -1) {
          alreadyExists = true;
          existingId = prevItems[existingIndex].id;
          return prevItems; // Do not increment or duplicate
        }

        // New item: 0ms Instant addition with orderQuantity = 0
        const newItem: RestockItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          product: foundProduct,
          orderQuantity: 0,
          scannedAt: new Date().toISOString(),
          unitCost: foundProduct.costPrice || 0,
          totalCost: 0
        };
        existingId = newItem.id;
        return [newItem, ...prevItems];
      });

      if (alreadyExists) {
        setHighlightedItemId(existingId);
        setTimeout(() => setHighlightedItemId(null), 2500);
        showToast(`⚠️ «${foundProduct.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
      } else {
        setHighlightedItemId(existingId);
        setTimeout(() => setHighlightedItemId(null), 2500);
        showToast(`✅ បានស្កេន «${foundProduct.name}» ចូលតារាង! សូម Admin វាយចំនួន`, 'success');

        // Asynchronous non-blocking background sync to Neon DB
        if (dbStatus.connected) {
          api.scanBarcode(cleanBarcode).then(res => {
            if (res.found && res.item) {
              setRestockItems(prev => prev.map(i => i.id === existingId ? { ...res.item!, id: res.item!.id } : i));
            }
          }).catch(err => {
            console.warn('Background sync scan failed:', err);
          });
        }
      }
      return;
    }

    // 🌐 2. SERVER FALLBACK LOOKUP:
    // Only if product was NOT in local memory (e.g. registered on another machine)
    if (dbStatus.connected) {
      try {
        const res = await api.scanBarcode(cleanBarcode);
        if (res.found && res.item) {
          const item = res.item;

          // Add to local products catalog for future instant scans
          setProducts(prev => {
            const exists = prev.some(p => p.id === item.product.id);
            return exists ? prev : [item.product, ...prev];
          });

          if (res.action === 'already_exists') {
            sound.playSuccessBeep();
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 2500);
            showToast(`⚠️ «${item.product.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
            return;
          }

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
        console.warn('API scan failed:', e);
      }
    }

    // ❌ 3. TRULY UNKNOWN BARCODE:
    sound.playErrorBuzz();
    setNotFoundBarcode(cleanBarcode);
    setIsAddProductOpen(true);
    showToast(`រកមិនឃើញ Barcode "${cleanBarcode}" ក្នុងប្រព័ន្ធទេ!`, 'error');
  }, [dbStatus.connected, products]);

  // Global listener for USB/Bluetooth Barcode Scanner Guns
  useBarcodeGun({
    onScan: handleScan,
    enabled: !isAddProductOpen && !isPrintPOOpen && !isCatalogOpen && !isCameraOpen && !isImportExcelOpen
  });

  // Quantity updater with 350ms debouncing per item to eliminate network race conditions
  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty < 0) return;

    // Track active user keystroke
    pendingUpdatesRef.current.set(itemId, newQty);

    const targetItem = restockItems.find(i => i.id === itemId || i.product.id === itemId);

    // Optimistic local update: 60 FPS instantaneous UI response
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
      const existingTimer = debounceTimersRef.current.get(itemId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(async () => {
        try {
          await api.updateQuantity(
            itemId, 
            newQty, 
            targetItem?.product?.id, 
            targetItem?.product?.barcode,
            targetItem?.note
          );
        } catch (err) {
          console.error('Failed to sync quantity to DB:', err);
        } finally {
          debounceTimersRef.current.delete(itemId);
          pendingUpdatesRef.current.delete(itemId);
        }
      }, 350);

      debounceTimersRef.current.set(itemId, timer);
    }
  };

  // Remove single item
  const handleRemoveItem = async (itemId: string) => {
    // Clear pending debounce timer if user removes item
    if (debounceTimersRef.current.has(itemId)) {
      clearTimeout(debounceTimersRef.current.get(itemId)!);
      debounceTimersRef.current.delete(itemId);
    }
    pendingUpdatesRef.current.delete(itemId);

    const targetItem = restockItems.find(i => i.id === itemId || i.product.id === itemId);
    setRestockItems(prev => prev.filter(i => i.id !== itemId && i.product.id !== itemId));
    showToast('បានលុបទំនិញចេញពីតារាង', 'info');

    if (dbStatus.connected) {
      try {
        await api.deleteRestockItem(itemId, targetItem?.product?.id, targetItem?.product?.barcode);
      } catch (err) {
        console.error('Failed to delete item from DB:', err);
      }
    }
  };

  // Clear all items
  const handleClearAll = async () => {
    if (window.confirm('តើអ្នកពិតជាចង់សម្អាតតារាងបញ្ជាទិញនេះទាំងអស់មែនទេ?')) {
      // Clear all active timers to prevent pending debounced updates from resurrecting cleared items
      debounceTimersRef.current.forEach(timer => clearTimeout(timer));
      debounceTimersRef.current.clear();
      pendingUpdatesRef.current.clear();

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
  const handleSaveNewProduct = async (newProduct: Product, addToOrderNow: boolean): Promise<boolean> => {
    let savedProd = newProduct;

    if (dbStatus.connected) {
      try {
        savedProd = await api.createProduct(newProduct);
      } catch (err: any) {
        showToast(`បរាជ័យក្នុងការរក្សាទុកក្នុង DB: ${err.message}`, 'error');
        return false; // Halt if DB rejected (e.g. duplicate barcode)
      }
    } else {
      const existsLocally = products.some(p => p.barcode.toLowerCase() === newProduct.barcode.toLowerCase());
      if (existsLocally) {
        showToast(`Barcode "${newProduct.barcode}" មានរួចហើយក្នុងប្រព័ន្ធ!`, 'error');
        return false;
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
    return true;
  };

  // Delete product from catalog
  const handleDeleteProduct = async (productId: string) => {
    // Clear any pending debounce timers for restock items matching this product
    restockItems.forEach(i => {
      if (i.product.id === productId || i.id === productId) {
        if (debounceTimersRef.current.has(i.id)) {
          clearTimeout(debounceTimersRef.current.get(i.id)!);
          debounceTimersRef.current.delete(i.id);
        }
        pendingUpdatesRef.current.delete(i.id);
        pendingUpdatesRef.current.delete(productId);
      }
    });

    const target = products.find(p => p.id === productId);
    const prodName = target ? target.name : '';

    setProducts(prev => {
      const updated = prev.filter(p => p.id !== productId);
      saveProducts(updated);
      return updated;
    });

    // Also remove from active restock items if present
    setRestockItems(prev => {
      const updated = prev.filter(i => i.product.id !== productId);
      saveRestockItems(updated);
      return updated;
    });

    if (dbStatus.connected) {
      try {
        await api.deleteProduct(productId);
      } catch (err: any) {
        console.error('Failed to delete product from DB:', err);
      }
    }

    showToast(`បានលុបទំនិញ ${prodName ? `«${prodName}»` : ''} ចេញពី Catalog រួចរាល់`, 'info');
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
              onClick={() => setIsImportExcelOpen(true)}
              className="p-2 sm:px-3 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-2xs"
              title="នាំចូលទំនិញរាប់រយមុខពី Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Import Excel</span>
            </button>

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

        {/* Quick Dashboard Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-4 sm:mb-6">
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">កំពុងកុម្ម៉ង់</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800">{restockItems.length} <span className="text-[11px] text-slate-400 font-normal">មុខ</span></span>
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">ចំនួនសរុប</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800">{restockItems.reduce((a, c) => a + (c.orderQuantity || 0), 0)} <span className="text-[11px] text-slate-400 font-normal">ឯកតា</span></span>
            </div>
          </div>

          {/* Card 3: Pending Input or Readiness Status */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
              restockItems.filter(i => i.orderQuantity <= 0).length > 0 
                ? 'bg-amber-50 text-amber-600' 
                : 'bg-emerald-50 text-emerald-600'
            }`}>
              {restockItems.filter(i => i.orderQuantity <= 0).length > 0 ? (
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">
                {restockItems.filter(i => i.orderQuantity <= 0).length > 0 ? 'ចាំវាយចំនួន' : 'ស្ថានភាព'}
              </span>
              <span className={`text-sm sm:text-base font-extrabold ${
                restockItems.filter(i => i.orderQuantity <= 0).length > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}>
                {restockItems.filter(i => i.orderQuantity <= 0).length > 0 
                  ? `${restockItems.filter(i => i.orderQuantity <= 0).length} មុខ` 
                  : 'គ្រប់ចំនួន'}
              </span>
            </div>
          </div>

          <div 
            onClick={() => setIsCatalogOpen(true)}
            className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3 cursor-pointer hover:border-blue-300 hover:shadow-xs transition group"
            title="ចុចដើម្បីមើល ឬគ្រប់គ្រងទំនិញក្នុង Catalog"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-600 flex items-center justify-center shrink-0 transition">
              <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">ទំនិញក្នុង Catalog</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800 group-hover:text-blue-600 transition">{products.length} <span className="text-[11px] text-slate-400 font-normal">មុខ</span></span>
            </div>
          </div>
        </div>

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

      {/* Toast Notification (Mobile friendly position & boundary) */}
      {toast && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 left-4 sm:left-auto max-w-sm z-50 animate-bounce print:hidden">
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
        onOpenImportExcel={() => {
          setIsCatalogOpen(false);
          setIsImportExcelOpen(true);
        }}
        onAddToOrder={(product) => handleScan(product.barcode)}
        onDeleteProduct={handleDeleteProduct}
        onResetDemoData={handleResetDemoData}
      />

      {/* Import Products from Excel Modal */}
      <ImportProductsModal
        isOpen={isImportExcelOpen}
        onClose={() => setIsImportExcelOpen(false)}
        existingProducts={products}
        onImportSuccess={(updatedList) => {
          setProducts(updatedList);
          saveProducts(updatedList);
          showToast(`បាន Import ទំនិញចូលប្រព័ន្ធជោគជ័យ! សរុប ${updatedList.length} មុខ`, 'success');
        }}
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
            ទំនិញក្នុងតារាងបញ្ជាទិញ
          </span>
          <span className="text-sm font-extrabold text-blue-600">
            {restockItems.length} មុខ • {restockItems.reduce((a, c) => a + (c.orderQuantity || 0), 0)} ឯកតា
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

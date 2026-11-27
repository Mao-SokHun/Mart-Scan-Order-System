import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Product, RestockItem } from './types';
import { api, HealthStatus } from './services/api';
import { 
  getStoredProducts, saveProducts, 
  getStoredRestockItems, saveRestockItems,
  getOfflineDirtyOps, upsertOfflineDirtyOp, removeOfflineDirtyOp, clearOfflineDirtyOps
} from './utils/storage';
import { 
  exportDailyPlanExcel, 
  exportToSimplePOExcel, 
  copyToTelegramClipboard,
  OrderDay,
  getCurrentDayOfWeek
} from './utils/export';
import { sound } from './utils/audio';
import { useBarcodeGun } from './hooks/useBarcodeGun';

import { ManualBarcodeInput } from './components/ManualBarcodeInput';
import { CameraScannerModal, ScanOutcome } from './components/CameraScannerModal';
import { RestockOrderTable } from './components/RestockOrderTable';
import { AddProductModal } from './components/AddProductModal';
import { ProductCatalogModal } from './components/ProductCatalogModal';
import { PrintPurchaseOrderModal } from './components/PrintPurchaseOrderModal';
import { ImportProductsModal } from './components/ImportProductsModal';
import { TelegramSendModal } from './components/TelegramSendModal';
import { BarcodeCardTester } from './components/BarcodeCardTester';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { INITIAL_PRODUCTS } from './data/mockProducts';

import { 
  Store, Camera, Package, Plus, Sparkles, 
  CheckCircle, AlertCircle, ShoppingBag, 
  ChevronDown, ChevronUp, Bell, Database, RefreshCw, FileSpreadsheet, Send 
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
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramModalDay, setTelegramModalDay] = useState<OrderDay>(getCurrentDayOfWeek());
  const [telegramModalSupplierFilter, setTelegramModalSupplierFilter] = useState<string>('all');
  const [notFoundBarcode, setNotFoundBarcode] = useState<string>('');
  const [showTestSheet, setShowTestSheet] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  const [appConfirm, setAppConfirm] = useState<{
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

  // Always-fresh refs so callbacks/async flows never suffer from React 18 batching or stale closures
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;
  const restockItemsRef = useRef<RestockItem[]>(restockItems);
  restockItemsRef.current = restockItems;
  const dbConnectedRef = useRef<boolean>(dbStatus.connected);
  dbConnectedRef.current = dbStatus.connected;

  // References for debouncing & preventing race conditions (always keyed by immutable product.id)
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map());
  const recentQuantityEditsRef = useRef<Map<string, { qty: number; timestamp: number }>>(new Map());
  const inFlightDeletesRef = useRef<Map<string, number>>(new Map()); // productId -> timestamp
  const inFlightScansRef = useRef<Map<string, RestockItem>>(new Map()); // productId -> optimistic item
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenCamera = () => {
    sound.warmup();
    setIsCameraOpen(true);
  };

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  // Smart barcode lookup (case-insensitive trimmed + universal numeric EAN/UPC leading-zero fallback)
  const findProductInCatalog = useCallback((list: Product[], barcode: string): Product | undefined => {
    const clean = barcode.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '');
    if (!clean) return undefined;
    const exact = list.find(p => (p.barcode || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '') === clean);
    if (exact) return exact;
    // Numeric barcodes (EAN-8, UPC-A, EAN-13, GTIN-14): strip leading zeroes for comparison
    if (/^\d+$/.test(clean)) {
      const strippedClean = clean.replace(/^0+/, '');
      if (strippedClean.length >= 6) {
        return list.find(p => {
          const pCode = (p.barcode || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().toLowerCase().replace(/\.0$/, '');
          return /^\d+$/.test(pCode) && pCode.replace(/^0+/, '') === strippedClean;
        });
      }
    }
    return undefined;
  }, []);

  // Merge authoritative DB restock rows with active local in-flight edits/scans/deletes
  const reconcileWithDbRestock = useCallback((dbRestock: RestockItem[]) => {
    const now = Date.now();
    // Expire delete guards older than 6s (after server DELETE has safely settled)
    for (const [key, ts] of inFlightDeletesRef.current.entries()) {
      if (now - ts > 6000) inFlightDeletesRef.current.delete(key);
    }

    const offlineOps = getOfflineDirtyOps();
    const offlineDeletedIds = new Set(
      offlineOps.filter(o => o.type === 'delete').map(o => o.productId)
    );

    // Filter out items currently being deleted or queued offline for deletion
    const filteredDb = dbRestock.filter(dbItem => {
      const pid = dbItem.product?.id;
      if (pid && (inFlightDeletesRef.current.has(pid) || offlineDeletedIds.has(pid))) return false;
      if (inFlightDeletesRef.current.has(dbItem.id)) return false;
      return true;
    });

    // Overlay active debounced user quantity edits & offline dirty edits
    const offlineUpsertsMap = new Map(
      offlineOps.filter(o => o.type === 'upsert' && o.item).map(o => [o.productId, o.item!])
    );

    const dbProductIds = new Set<string>();
    const merged: RestockItem[] = filteredDb.map(dbItem => {
      const pid = dbItem.product?.id;
      if (pid) dbProductIds.add(pid);

      const pendingQty =
        (pid ? pendingUpdatesRef.current.get(pid) : undefined) ??
        pendingUpdatesRef.current.get(dbItem.id);

      const recentEdit = (pid ? recentQuantityEditsRef.current.get(pid) : undefined) ?? recentQuantityEditsRef.current.get(dbItem.id);
      const isFreshEdit = recentEdit !== undefined && now - recentEdit.timestamp < 3500;

      const effectiveQty = pendingQty !== undefined 
        ? pendingQty 
        : isFreshEdit 
        ? recentEdit.qty 
        : undefined;

      if (effectiveQty !== undefined) {
        const uc = dbItem.unitCost || 0;
        return {
          ...dbItem,
          orderQuantity: effectiveQty,
          totalCost: Math.round(effectiveQty * uc * 100) / 100
        };
      }

      if (pid && offlineUpsertsMap.has(pid)) {
        const offlineItem = offlineUpsertsMap.get(pid)!;
        return {
          ...dbItem,
          orderQuantity: offlineItem.orderQuantity,
          totalCost: offlineItem.totalCost
        };
      }

      return dbItem;
    });

    // Preserve brand-new scans still in-flight to Neon DB or offline-queued upserts
    for (const [pid, scanItem] of inFlightScansRef.current.entries()) {
      if (!dbProductIds.has(pid) && !inFlightDeletesRef.current.has(pid)) {
        const pendingQty = pendingUpdatesRef.current.get(pid) ?? scanItem.orderQuantity;
        merged.unshift({ ...scanItem, orderQuantity: pendingQty });
        dbProductIds.add(pid);
      }
    }
    for (const [pid, offItem] of offlineUpsertsMap.entries()) {
      if (!dbProductIds.has(pid) && !inFlightDeletesRef.current.has(pid)) {
        merged.unshift(offItem);
        dbProductIds.add(pid);
      }
    }

    setRestockItems(merged);
    saveRestockItems(merged);
  }, []);

  // Flush genuine offline-only mutations (never blind localStorage snapshots!)
  const flushOfflineDirtyOps = useCallback(async () => {
    const ops = getOfflineDirtyOps();
    if (ops.length === 0) return;

    const remaining: typeof ops = [];
    for (const op of ops) {
      try {
        if (op.type === 'delete') {
          await api.deleteRestockItem(op.productId, op.productId, op.barcode);
        } else if (op.type === 'upsert' && op.item) {
          await api.syncBatchRestockItems([op.item]);
        }
      } catch (e) {
        remaining.push(op);
      }
    }
    if (remaining.length === 0) {
      clearOfflineDirtyOps();
    } else {
      clearOfflineDirtyOps();
      remaining.forEach(upsertOfflineDirtyOp);
    }
  }, []);

  // Lightweight restock-only sync for real-time cross-device updates
  const isSyncingRestockRef = useRef(false);
  const syncRestockFromDb = useCallback(async () => {
    if (isSyncingRestockRef.current) return;
    isSyncingRestockRef.current = true;
    try {
      await flushOfflineDirtyOps();
      const dbRestock = await api.getRestockItems();
      reconcileWithDbRestock(dbRestock);
      if (!dbConnectedRef.current) {
        setDbStatus(prev => ({ ...prev, connected: true }));
      }
    } catch {
      // Silently ignore transient poll failures
    } finally {
      isSyncingRestockRef.current = false;
    }
  }, [flushOfflineDirtyOps, reconcileWithDbRestock]);

  // 1. Full data fetch from Neon PostgreSQL (Products + Restock Items)
  const loadDataFromDatabase = useCallback(async (showFeedbackToast = false) => {
    try {
      setIsLoading(true);
      const health = await api.checkHealth();
      setDbStatus(health);

      if (health.connected) {
        await flushOfflineDirtyOps();
        const [dbProducts, dbRestock] = await Promise.all([
          api.getProducts(),
          api.getRestockItems()
        ]);
        if (dbProducts && dbProducts.length > 0) {
          setProducts(dbProducts);
          saveProducts(dbProducts);
        }
        reconcileWithDbRestock(dbRestock);
        if (showFeedbackToast) {
          showToast('បានទាញយកទិន្នន័យចុងក្រោយពី Database រួចរាល់', 'success');
        }
      } else if (showFeedbackToast) {
        showToast('មិនអាចភ្ជាប់ Database បានទេ (ប្រើទិន្នន័យ Offline)', 'error');
      }
    } catch (err) {
      console.warn('Backend not reached yet, using local storage cache:', err);
      if (showFeedbackToast) {
        showToast('មានបញ្ហាក្នុងការទាញយកទិន្នន័យ', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [flushOfflineDirtyOps, reconcileWithDbRestock, showToast]);

  useEffect(() => {
    loadDataFromDatabase();

    const handleOnline = () => {
      console.log('🌐 Browser online detected, re-syncing with Neon DB...');
      loadDataFromDatabase();
    };
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        syncRestockFromDb();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    // Health + full product sync every 45s when tab is active
    const healthInterval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const health = await api.checkHealth();
      setDbStatus(prev => {
        if (!prev.connected && health.connected) {
          loadDataFromDatabase();
        }
        return health;
      });
      if (health.connected) {
        api.getProducts().then(dbProds => {
          if (dbProds && dbProds.length > 0) {
            setProducts(dbProds);
            saveProducts(dbProds);
          }
        }).catch(() => {});
      }
    }, 45000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(healthInterval);
      debounceTimersRef.current.forEach(timer => clearTimeout(timer));
      debounceTimersRef.current.clear();
      pendingUpdatesRef.current.clear();
    };
  }, [loadDataFromDatabase, syncRestockFromDb]);

  // 🔄 Real-time cross-device polling: sync restock table every 4 seconds when active
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      syncRestockFromDb();
    }, 4000);
    return () => clearInterval(pollInterval);
  }, [syncRestockFromDb]);

  // Synchronize state with LocalStorage for offline resilience
  useEffect(() => {
    saveRestockItems(restockItems);
  }, [restockItems]);

  useEffect(() => {
    if (products.length > 0) {
      saveProducts(products);
    }
  }, [products]);

  const highlightItemTemporarily = useCallback((id: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedItemId(id);
    highlightTimerRef.current = setTimeout(() => setHighlightedItemId(null), 2500);
  }, []);

  // Handle Scanning Barcode (Used by Barcode Gun, Camera Scanner & Manual Input)
  const handleScan = useCallback(async (scannedBarcode: string): Promise<ScanOutcome> => {
    let cleanBarcode = scannedBarcode.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/[\r\n\t]/g, '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
    if (!cleanBarcode) return 'ignored';

    // ⚡ 1. ULTRA-FAST INSTANT IN-MEMORY SCAN (uses refs to avoid React 18 batching bugs):
    const foundProduct = findProductInCatalog(productsRef.current, cleanBarcode);

    if (foundProduct) {
      sound.playSuccessBeep();

      // Clear any previous delete guard if re-scanning the same product
      inFlightDeletesRef.current.delete(foundProduct.id);
      removeOfflineDirtyOp(foundProduct.id);

      const currentItems = restockItemsRef.current;
      const existingItem = currentItems.find(
        i =>
          i.product.id === foundProduct.id ||
          (i.product.barcode || '').trim().toLowerCase() === foundProduct.barcode.trim().toLowerCase()
      );

      if (existingItem) {
        highlightItemTemporarily(existingItem.id);
        showToast(`⚠️ «${foundProduct.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
        return 'already_exists';
      }

      const tempId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newItem: RestockItem = {
        id: tempId,
        product: foundProduct,
        orderQuantity: 0,
        scannedAt: new Date().toISOString(),
        unitCost: foundProduct.costPrice || 0,
        totalCost: 0
      };

      inFlightScansRef.current.set(foundProduct.id, newItem);
      setRestockItems(prev => {
        if (prev.some(i => i.product.id === foundProduct.id)) return prev;
        const updated = [newItem, ...prev];
        saveRestockItems(updated);
        return updated;
      });

      highlightItemTemporarily(tempId);
      showToast(`✅ បានស្កេន «${foundProduct.name}» ចូលតារាង! សូម Admin វាយចំនួន`, 'success');

      // Background sync to Neon DB whenever browser is online (don't wait for dbStatus flag)
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        api.scanBarcode(foundProduct.barcode || cleanBarcode)
          .then(res => {
            inFlightScansRef.current.delete(foundProduct.id);
            setDbStatus(prev => (prev.connected ? prev : { ...prev, connected: true }));
            if (res.found && res.item) {
              setRestockItems(prev => prev.map(i => {
                if (i.id === tempId || i.product.id === foundProduct.id) {
                  const activeQty = pendingUpdatesRef.current.get(foundProduct.id) ?? i.orderQuantity;
                  return {
                    ...res.item!,
                    id: res.item!.id,
                    orderQuantity: activeQty > 0 ? activeQty : res.item!.orderQuantity,
                    totalCost: activeQty > 0
                      ? Math.round(activeQty * (res.item!.unitCost || 0) * 100) / 100
                      : res.item!.totalCost
                  };
                }
                return i;
              }));
            }
          })
          .catch(err => {
            console.warn('Background sync scan failed, queuing offline:', err);
            inFlightScansRef.current.delete(foundProduct.id);
            upsertOfflineDirtyOp({
              type: 'upsert',
              productId: foundProduct.id,
              barcode: foundProduct.barcode,
              item: newItem,
              timestamp: Date.now()
            });
          });
      } else {
        inFlightScansRef.current.delete(foundProduct.id);
        upsertOfflineDirtyOp({
          type: 'upsert',
          productId: foundProduct.id,
          barcode: foundProduct.barcode,
          item: newItem,
          timestamp: Date.now()
        });
      }
      return 'added';
    }

    // 🌐 2. SERVER FALLBACK LOOKUP (always try if browser is online):
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        const res = await api.scanBarcode(cleanBarcode);
        setDbStatus(prev => (prev.connected ? prev : { ...prev, connected: true }));
        if (res.found && res.item) {
          const item = res.item;
          inFlightDeletesRef.current.delete(item.product.id);
          removeOfflineDirtyOp(item.product.id);

          // Add to local products catalog for future instant scans
          setProducts(prev => {
            const exists = prev.some(p => p.id === item.product.id);
            return exists ? prev : [item.product, ...prev];
          });

          sound.playSuccessBeep();
          setRestockItems(prev => {
            const exists = prev.some(i => i.id === item.id || i.product.id === item.product.id);
            const updated = exists
              ? prev.map(i => (i.id === item.id || i.product.id === item.product.id) ? item : i)
              : [item, ...prev];
            saveRestockItems(updated);
            return updated;
          });

          highlightItemTemporarily(item.id);
          if (res.action === 'already_exists') {
            showToast(`⚠️ «${item.product.name}» មានក្នុងតារាងរួចហើយ! (មិនបូកស្ទួនចំនួនទេ)`, 'info');
            return 'already_exists';
          }
          showToast(`✅ បានស្កេន «${item.product.name}» ចូលតារាង! សូម Admin វាយចំនួន`, 'success');
          return 'added';
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
    return 'not_found';
  }, [findProductInCatalog, highlightItemTemporarily, showToast]);

  // Global listener for USB/Bluetooth Barcode Scanner Guns
  useBarcodeGun({
    onScan: handleScan,
    enabled: !isAddProductOpen && !isPrintPOOpen && !isCatalogOpen && !isCameraOpen && !isImportExcelOpen && !isTelegramModalOpen
  });

  // Quantity updater with 250ms debouncing keyed consistently by immutable product.id
  const handleUpdateQuantity = useCallback((itemId: string, newQty: number) => {
    if (newQty < 0) return;

    const targetItem = restockItemsRef.current.find(i => i.id === itemId || i.product.id === itemId);
    const trackingKey = targetItem?.product?.id || itemId;

    // Track active user keystroke by product.id so ID swap from temp->DB never races
    pendingUpdatesRef.current.set(trackingKey, newQty);
    recentQuantityEditsRef.current.set(trackingKey, { qty: newQty, timestamp: Date.now() });
    if (itemId !== trackingKey) {
      recentQuantityEditsRef.current.set(itemId, { qty: newQty, timestamp: Date.now() });
    }

    const updatedItemForOffline: RestockItem | undefined = targetItem
      ? {
          ...targetItem,
          orderQuantity: newQty,
          totalCost: Math.round(newQty * (targetItem.unitCost || 0) * 100) / 100
        }
      : undefined;

    // Optimistic local update: 60 FPS instantaneous UI response
    setRestockItems(prev => {
      const updated = prev.map(item => {
        if (item.id === itemId || item.product.id === trackingKey) {
          return {
            ...item,
            orderQuantity: newQty,
            totalCost: Math.round(newQty * (item.unitCost || 0) * 100) / 100
          };
        }
        return item;
      });
      saveRestockItems(updated);
      return updated;
    });

    const existingTimer = debounceTimersRef.current.get(trackingKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          const ok = await api.updateQuantity(
            targetItem?.id || itemId,
            newQty,
            targetItem?.product?.id,
            targetItem?.product?.barcode,
            targetItem?.note
          );
          if (!ok) throw new Error('PUT restock returned error');
          removeOfflineDirtyOp(trackingKey);
        } else if (updatedItemForOffline) {
          upsertOfflineDirtyOp({
            type: 'upsert',
            productId: trackingKey,
            barcode: targetItem?.product?.barcode,
            item: updatedItemForOffline,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.error('Failed to sync quantity to DB:', err);
        if (updatedItemForOffline) {
          upsertOfflineDirtyOp({
            type: 'upsert',
            productId: trackingKey,
            barcode: targetItem?.product?.barcode,
            item: updatedItemForOffline,
            timestamp: Date.now()
          });
        }
      } finally {
        debounceTimersRef.current.delete(trackingKey);
        // Only delete pending marker if it still holds the value this request synced
        if (pendingUpdatesRef.current.get(trackingKey) === newQty) {
          pendingUpdatesRef.current.delete(trackingKey);
        }
      }
    }, 250);

    debounceTimersRef.current.set(trackingKey, timer);
  }, []);

  // Remove single item (persisted reliably without resurrection across refresh or cross-device sync)
  const handleRemoveItem = useCallback(async (itemId: string) => {
    const targetItem = restockItemsRef.current.find(i => i.id === itemId || i.product.id === itemId);
    const trackingKey = targetItem?.product?.id || itemId;

    if (debounceTimersRef.current.has(trackingKey)) {
      clearTimeout(debounceTimersRef.current.get(trackingKey)!);
      debounceTimersRef.current.delete(trackingKey);
    }
    if (debounceTimersRef.current.has(itemId)) {
      clearTimeout(debounceTimersRef.current.get(itemId)!);
      debounceTimersRef.current.delete(itemId);
    }
    pendingUpdatesRef.current.delete(trackingKey);
    pendingUpdatesRef.current.delete(itemId);
    recentQuantityEditsRef.current.delete(trackingKey);
    recentQuantityEditsRef.current.delete(itemId);
    inFlightScansRef.current.delete(trackingKey);

    const deleteTs = Date.now();
    inFlightDeletesRef.current.set(trackingKey, deleteTs);
    inFlightDeletesRef.current.set(itemId, deleteTs);

    setRestockItems(prev => {
      const updated = prev.filter(i => i.id !== itemId && i.product.id !== trackingKey);
      saveRestockItems(updated);
      return updated;
    });
    showToast('បានលុបទំនិញចេញពីតារាង', 'info');

    try {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const ok = await api.deleteRestockItem(
          targetItem?.id || itemId,
          targetItem?.product?.id,
          targetItem?.product?.barcode
        );
        if (!ok) throw new Error('Delete returned non-OK');
        removeOfflineDirtyOp(trackingKey);
      } else {
        upsertOfflineDirtyOp({
          type: 'delete',
          productId: trackingKey,
          barcode: targetItem?.product?.barcode,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to delete item from DB:', err);
      upsertOfflineDirtyOp({
        type: 'delete',
        productId: trackingKey,
        barcode: targetItem?.product?.barcode,
        timestamp: Date.now()
      });
      showToast('លុបក្នុង DB មានបញ្ហា — នឹងព្យាយាមម្តងទៀតស្វ័យប្រវត្តិ', 'error');
    }
  }, [showToast]);

  // Clear all items with beautiful custom modal
  const handleClearAll = () => {
    setAppConfirm({
      isOpen: true,
      title: 'បញ្ជាក់ការសម្អាតតារាងបញ្ជាទិញ',
      type: 'danger',
      message: 'តើអ្នកពិតជាចង់សម្អាតតារាងបញ្ជាទិញនេះទាំងអស់មែនទេ?',
      submessage: 'ទំនិញទាំងអស់ដែលបានស្កេនក្នុងតារាងបច្ចុប្បន្ននឹងត្រូវសម្អាតចេញពីប្រព័ន្ធ។',
      confirmText: 'សម្អាតទាំងអស់',
      cancelText: 'បោះបង់',
      confirmButtonColor: 'bg-rose-600 hover:bg-rose-700 text-white',
      onConfirm: async () => {
        setAppConfirm(prev => ({ ...prev, isOpen: false }));
        debounceTimersRef.current.forEach(timer => clearTimeout(timer));
        debounceTimersRef.current.clear();
        pendingUpdatesRef.current.clear();
        recentQuantityEditsRef.current.clear();
        inFlightScansRef.current.clear();
        clearOfflineDirtyOps();

        const ts = Date.now();
        restockItemsRef.current.forEach(item => {
          inFlightDeletesRef.current.set(item.id, ts);
          if (item.product?.id) inFlightDeletesRef.current.set(item.product.id, ts);
        });

        setRestockItems([]);
        saveRestockItems([]);
        showToast('បានសម្អាតតារាងបញ្ជាទិញរួចរាល់', 'info');

        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            await api.clearRestockItems();
          } catch (err) {
            console.error('Failed to clear items in DB:', err);
          }
        }
      }
    });
  };

  // Save newly registered product
  const handleSaveNewProduct = async (newProduct: Product, addToOrderNow: boolean): Promise<boolean> => {
    let savedProd = newProduct;

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        savedProd = await api.createProduct(newProduct);
        setDbStatus(prev => (prev.connected ? prev : { ...prev, connected: true }));
      } catch (err: any) {
        showToast(`បរាជ័យក្នុងការរក្សាទុកក្នុង DB: ${err.message}`, 'error');
        return false; // Halt if DB rejected (e.g. duplicate barcode)
      }
    } else {
      const existsLocally = findProductInCatalog(productsRef.current, newProduct.barcode);
      if (existsLocally) {
        showToast(`Barcode "${newProduct.barcode}" មានរួចហើយក្នុងប្រព័ន្ធ!`, 'error');
        return false;
      }
    }

    setProducts(prev => [savedProd, ...prev]);
    showToast(`បានចុះឈ្មោះទំនិញ "${savedProd.name}" ចូលក្នុងប្រព័ន្ធជោគជ័យ`, 'success');

    if (addToOrderNow) {
      sound.playSuccessBeep();
      inFlightDeletesRef.current.delete(savedProd.id);
      removeOfflineDirtyOp(savedProd.id);

      const tempId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newItem: RestockItem = {
        id: tempId,
        product: savedProd,
        orderQuantity: 0,
        scannedAt: new Date().toISOString(),
        unitCost: savedProd.costPrice || 0,
        totalCost: 0
      };

      inFlightScansRef.current.set(savedProd.id, newItem);
      setRestockItems(prev => {
        const exists = prev.some(i => i.product.id === savedProd.id || i.product.barcode.toLowerCase() === savedProd.barcode.toLowerCase());
        if (exists) return prev;
        const updated = [newItem, ...prev];
        saveRestockItems(updated);
        return updated;
      });

      highlightItemTemporarily(tempId);

      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        api.scanBarcode(savedProd.barcode)
          .then(res => {
            inFlightScansRef.current.delete(savedProd.id);
            if (res.found && res.item) {
              setRestockItems(prev => prev.map(i => (
                i.id === tempId || i.product.id === savedProd.id ? { ...res.item!, orderQuantity: i.orderQuantity || res.item!.orderQuantity } : i
              )));
            }
          })
          .catch(err => {
            inFlightScansRef.current.delete(savedProd.id);
            console.warn('Sync scan failed:', err);
          });
      }
    }
    return true;
  };

  // Delete product from catalog
  const handleDeleteProduct = async (productId: string) => {
    if (debounceTimersRef.current.has(productId)) {
      clearTimeout(debounceTimersRef.current.get(productId)!);
      debounceTimersRef.current.delete(productId);
    }
    pendingUpdatesRef.current.delete(productId);
    inFlightScansRef.current.delete(productId);
    inFlightDeletesRef.current.set(productId, Date.now());
    removeOfflineDirtyOp(productId);

    restockItemsRef.current.forEach(i => {
      if (i.product.id === productId || i.id === productId) {
        if (debounceTimersRef.current.has(i.id)) {
          clearTimeout(debounceTimersRef.current.get(i.id)!);
          debounceTimersRef.current.delete(i.id);
        }
        pendingUpdatesRef.current.delete(i.id);
        inFlightDeletesRef.current.set(i.id, Date.now());
      }
    });

    const target = productsRef.current.find(p => p.id === productId);
    const prodName = target ? target.name : '';

    setProducts(prev => {
      const updated = prev.filter(p => p.id !== productId);
      saveProducts(updated);
      return updated;
    });

    setRestockItems(prev => {
      const updated = prev.filter(i => i.product.id !== productId);
      saveRestockItems(updated);
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        await api.deleteProduct(productId);
      } catch (err: any) {
        console.error('Failed to delete product from DB:', err);
      }
    }

    showToast(`បានលុបទំនិញ ${prodName ? `«${prodName}»` : ''} ចេញពី Catalog រួចរាល់`, 'info');
  };

  // Refresh data from Neon PostgreSQL with custom modal
  const handleResetDemoData = () => {
    setAppConfirm({
      isOpen: true,
      title: 'ទាញយកទិន្នន័យឡើងវិញ',
      type: 'info',
      message: 'តើអ្នកចង់ទាញយកទិន្នន័យពី Neon PostgreSQL ឡើងវិញមែនទេ?',
      submessage: 'ប្រព័ន្ធនឹង Refresh ទាញយកទិន្នន័យទំនិញ និងបញ្ជីកុម្ម៉ង់ចុងក្រោយពី Database។',
      confirmText: 'ទាញយកឡើងវិញ',
      cancelText: 'បោះបង់',
      confirmButtonColor: 'bg-blue-600 hover:bg-blue-700 text-white',
      onConfirm: () => {
        setAppConfirm(prev => ({ ...prev, isOpen: false }));
        loadDataFromDatabase(true);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-100/60 pb-24 sm:pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Mart Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-xs sm:text-base text-slate-900 tracking-tight truncate">
                Mart Scan & Order
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium hidden sm:block truncate">
                ប្រព័ន្ធស្កេនទំនិញអស់ស្តុក និងចេញតារាងបញ្ជាទិញទំនិញ
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
              className="p-2 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 relative"
              title={`មើលបញ្ជីទំនិញទាំងអស់ (${products.length} មុខ)`}
            >
              <Package className="w-4 h-4 text-slate-600" />
              <span className="hidden md:inline">ទំនិញ ({products.length})</span>
              <span className="md:hidden text-[9px] bg-blue-100 text-blue-700 font-bold px-1 rounded-full">
                {products.length}
              </span>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 print:hidden">
        {/* Toggleable Barcode Test Sheet */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setShowTestSheet(!showTestSheet)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{showTestSheet ? 'លាក់សន្លឹកតេស្ត Barcode' : 'តេស្ត Barcode លើអេក្រង់'}</span>
            {showTestSheet ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                dbStatus.connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={dbStatus.connected ? 'ភ្ជាប់ Neon DB & Sync Real-Time រួចរាល់' : 'កំពុងប្រើទិន្នន័យ Offline'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <Database className="w-3 h-3" />
              <span className="hidden xs:inline">{dbStatus.connected ? 'Live Sync' : 'Offline'}</span>
            </span>
            <button
              onClick={() => loadDataFromDatabase(true)}
              title="ទាញយកទិន្នន័យឡើងវិញ (Refresh Data)"
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {showTestSheet && (
          <BarcodeCardTester
            products={products}
            onSimulateScan={handleScan}
            onClose={() => setShowTestSheet(false)}
          />
        )}

        {/* Quick Dashboard Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-4 sm:mb-6">
          <div 
            onClick={() => {
              const tableElem = document.getElementById('restock-order-table-container');
              tableElem?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3 cursor-pointer hover:border-blue-300 hover:shadow-xs transition group"
            title="ចុចដើម្បីមើលតារាងបញ្ជាទិញ"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">កំពុងកុម្ម៉ង់</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800">{restockItems.length} <span className="text-[11px] text-slate-400 font-normal">មុខ</span></span>
            </div>
          </div>

          <div 
            onClick={() => {
              const tableElem = document.getElementById('restock-order-table-container');
              tableElem?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-xs transition group"
            title="ចុចដើម្បីមើលតារាងបញ្ជាទិញ"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block truncate">ចំនួនសរុប</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800">{restockItems.reduce((a, c) => a + (c.orderQuantity || 0), 0)} <span className="text-[11px] text-slate-400 font-normal">ឯកតា</span></span>
            </div>
          </div>

          {/* Card 3: Pending Input or Readiness Status */}
          <div 
            onClick={() => {
              const tableElem = document.getElementById('restock-order-table-container');
              tableElem?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`p-3 sm:p-4 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition group ${
              restockItems.filter(i => i.orderQuantity <= 0).length > 0
                ? 'bg-amber-50/60 border-amber-300 hover:border-amber-400 hover:shadow-xs'
                : 'bg-white border-slate-200/80 hover:border-emerald-300 hover:shadow-xs'
            }`}
            title="ចុចដើម្បីពិនិត្យទំនិញចាំវាយចំនួន"
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition ${
              restockItems.filter(i => i.orderQuantity <= 0).length > 0 
                ? 'bg-amber-100 text-amber-700' 
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
          onOpenTelegramModal={(itemsToExport, day, filter) => {
            setTelegramModalDay(day);
            setTelegramModalSupplierFilter(filter || 'all');
            setIsTelegramModalOpen(true);
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
        products={products}
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

      {/* Telegram Direct Send Modal */}
      <TelegramSendModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        items={restockItems}
        orderDay={telegramModalDay}
        supplierFilter={telegramModalSupplierFilter}
        onShowToast={showToast}
      />

      {/* Global App Confirm Modal */}
      <ConfirmModal
        isOpen={appConfirm.isOpen}
        title={appConfirm.title}
        message={appConfirm.message}
        submessage={appConfirm.submessage}
        type={appConfirm.type}
        confirmText={appConfirm.confirmText}
        cancelText={appConfirm.cancelText}
        confirmButtonColor={appConfirm.confirmButtonColor}
        onConfirm={appConfirm.onConfirm}
        onCancel={() => setAppConfirm(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Mobile Sticky Bottom Bar (Thumb-friendly scanner and order total) */}
      <div className="md:hidden print:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-3.5 py-2.5 flex items-center justify-between z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => {
            const tableElem = document.getElementById('restock-order-table-container');
            tableElem?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="min-w-0 pr-2 text-left cursor-pointer active:opacity-75"
        >
          <span className="text-[10px] text-slate-400 block font-medium truncate">
            ទំនិញក្នុងតារាងកុម្ម៉ង់
          </span>
          <span className="text-xs font-extrabold text-blue-600 truncate block">
            {restockItems.length} មុខ • {restockItems.reduce((a, c) => a + (c.orderQuantity || 0), 0)} ឯកតា
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {restockItems.length > 0 && (
            <button
              onClick={() => {
                setTelegramModalDay(getCurrentDayOfWeek());
                setTelegramModalSupplierFilter('all');
                setIsTelegramModalOpen(true);
              }}
              className="px-3 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm shrink-0"
              title="ផ្ញើទៅ Telegram"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
            </button>
          )}

          <button
            onClick={handleOpenCamera}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/25 shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>ស្កេន</span>
          </button>
        </div>
      </div>
    </div>
  );
};

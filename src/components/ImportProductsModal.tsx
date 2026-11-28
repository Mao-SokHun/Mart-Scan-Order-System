import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import { saveProducts } from '../utils/storage';
import { CustomSelect, SelectOption } from './ui/CustomSelect';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, 
  AlertCircle, ArrowRight, Download, RefreshCw, Package, Check, Layers 
} from 'lucide-react';

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  onImportSuccess: (importedProducts: Product[]) => void;
}

interface ParsedProductRow {
  barcode: string;
  name: string;
  khmerName?: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  minStock: number;
  supplierName: string;
  supplierPhone?: string;
  remark?: string;
  storageTemp?: string;
  sheetName: string;
  isExisting: boolean;
}

export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  onImportSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [sheetsFound, setSheetsFound] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [previewFilterSheet, setPreviewFilterSheet] = useState<string>('all');
  const [searchPreview, setSearchPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParsedRows([]);
      setSheetsFound([]);
      setSelectedSheets([]);
      setPreviewFilterSheet('all');
      setSearchPreview('');
      setIsSubmitting(false);
      setErrorMsg(null);
      setSuccessCount(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Toggle individual sheet selection for import
  const toggleSheet = (sheetName: string) => {
    setSelectedSheets(prev => {
      if (prev.includes(sheetName)) {
        return prev.filter(s => s !== sheetName);
      } else {
        return [...prev, sheetName];
      }
    });
  };

  const selectAllSheets = () => {
    setSelectedSheets(sheetsFound.map(s => s.trim()));
  };

  const deselectAllSheets = () => {
    setSelectedSheets([]);
  };

  // Helper to extract numeric values safely (handles both dot and localized comma decimals)
  const parseNum = (val: any, fallback = 0): number => {
    if (val === null || val === undefined) return fallback;
    let s = String(val).trim();
    if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    }
    const str = s.replace(/[^0-9.-]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? fallback : Math.max(0, num);
  };

  // Helper to parse columns from generic Excel files
  const parseExcelFile = async (selectedFile: File) => {
    setIsParsing(true);
    setErrorMsg(null);
    setSuccessCount(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const cleanSheetNames = workbook.SheetNames.map(s => s.trim());
      setSheetsFound(cleanSheetNames);
      setSelectedSheets(cleanSheetNames);

      const existingBarcodeMap = new Set(
        existingProducts.map(p => (p.barcode || '').toLowerCase().trim())
      );

      const extracted: ParsedProductRow[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        // Track duplicate barcodes within the current sheet
        const seenBarcodesInSheet = new Set<string>();

        // Parse rows as raw objects
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

        for (const row of rawRows) {
          // 1. Detect Barcode / Item Code
          const rawBarcode = 
            row['Item Code'] || row['item code'] || row['item_code'] || 
            row['Barcode'] || row['barcode'] || row['BARCODE'] || 
            row['កូដទំនិញ'] || row['បារកូដ'] || row['Code'] || row['code'] || 
            row['UPC'] || row['EAN'] || row['កូដ'] || '';

          let barcode = String(rawBarcode).trim();
          if (barcode.endsWith('.0')) barcode = barcode.slice(0, -2);
          if (!barcode) continue;

          // 2. Detect Product Name
          const rawName = 
            row['Name'] || row['name'] || row['NAME'] || 
            row['Product Name'] || row['product name'] || row['product_name'] || 
            row['Item Name'] || row['item name'] || row['Description'] || 
            row['ឈ្មោះទំនិញ'] || row['ឈ្មោះ'] || '';

          const name = String(rawName).trim();
          if (!name) continue;

          // Ignore subtotal/summary rows like "សរុបផ្នែក Daily" or "GRAND TOTAL"
          const lowerName = name.toLowerCase();
          if (lowerName.includes('សរុប') || lowerName.includes('total') || lowerName.includes('subtotal')) {
            continue;
          }

          // Avoid duplicate barcodes within the same sheet
          const cleanBarcodeKey = barcode.toLowerCase();
          if (seenBarcodesInSheet.has(cleanBarcodeKey)) {
            continue;
          }
          seenBarcodesInSheet.add(cleanBarcodeKey);

          // 3. Detect Khmer Name
          const rawKhmer = 
            row['Name in Khmer'] || row['name in khmer'] || 
            row['Khmer Name'] || row['khmer name'] || row['khmer_name'] || 
            row['ឈ្មោះខ្មែរ'] || row['ឈ្មោះជាភាសាខ្មែរ'] || '';
          const khmerName = String(rawKhmer).trim() || undefined;

          // 4. Detect Category / Department & Storage Temperature
          let category = sheetName.trim();
          if (category === ' Milk and Yogurt') category = 'Milk and Yogurt';

          const rawCat = 
            row['Category'] || row['category'] || row['Department'] || 
            row['department'] || row['ប្រភេទ'] || row['ផ្នែក'] || '';
          if (rawCat && String(rawCat).trim()) {
            category = String(rawCat).trim();
          }

          const rawTemp = String(row['Storage Temperature'] || row['storage_temperature'] || '').trim();
          if (rawTemp && !category.includes(rawTemp)) {
            category = `${category} (${rawTemp})`;
          }

          // 5. Detect Unit / Purchase UoM
          const rawUnit = 
            row['Purchase UoM'] || row['purchase uom'] || row['UoM'] || 
            row['uom'] || row['Unit'] || row['unit'] || row['ឯកតា'] || row['Packing'] || 'Units';
          const unit = String(rawUnit).trim() || 'Units';

          // 6. Detect Cost & Selling Price
          const rawCost = 
            row['Cost'] || row['Cost Price'] || row['Unit Cost'] || 
            row['cost_price'] || row['តម្លៃដើម'] || row['តម្លៃទិញចូល'] || 
            row['Price'] || row['price'] || 0;
          const costPrice = parseNum(rawCost, 0);

          const rawPrice = 
            row['Selling Price'] || row['selling_price'] || row['Sale Price'] || 
            row['តម្លៃលក់'] || row['តម្លៃលក់ចេញ'] || 0;
          const sellingPrice = parseNum(rawPrice, costPrice > 0 ? costPrice * 1.3 : 0);

          // 7. Detect Current & Min Stock
          const rawCurrentStock = 
            row['Current Stock'] || row['current_stock'] || row['Stock'] || 
            row['stock'] || row['ស្តុក'] || row['ស្តុកបច្ចុប្បន្ន'] || row['Qty'] || 0;
          const currentStock = Math.round(parseNum(rawCurrentStock, 0));

          const rawMinStock = 
            row['Min Stock'] || row['min_stock'] || row['Reorder Point'] || 
            row['ស្តុកអប្បបរមា'] || 10;
          const minStock = Math.max(1, Math.round(parseNum(rawMinStock, 10)));

          // 8. Detect Supplier / Vendor & Delivery Remark
          const rawSupplier = 
            row['Vendors/Vendor'] || row['Vendor'] || row['vendor'] || 
            row['Supplier'] || row['supplier'] || row['អ្នកផ្គត់ផ្គង់'] || 
            row['Supplier Name'] || 'ទូទៅ (General Supplier)';
          let supplierName = String(rawSupplier).trim() || 'ទូទៅ (General Supplier)';

          const rawRemark = row['Remark'] || row['remark'] || row['កំណត់សម្គាល់'] || '';
          const cleanRemark = String(rawRemark).trim();
          if (cleanRemark && !supplierName.includes('[')) {
            supplierName = `${supplierName} [${cleanRemark}]`;
          }

          const rawPhone = 
            row['Phone'] || row['phone'] || row['Supplier Phone'] || 
            row['supplier_phone'] || row['លេខទូរស័ព្ទ'] || '';
          const supplierPhone = String(rawPhone).trim() || undefined;

          extracted.push({
            barcode,
            name,
            khmerName,
            category,
            unit,
            costPrice,
            sellingPrice,
            currentStock,
            minStock,
            supplierName,
            supplierPhone,
            remark: cleanRemark || undefined,
            storageTemp: rawTemp || undefined,
            sheetName: sheetName.trim(),
            isExisting: existingBarcodeMap.has(cleanBarcodeKey)
          });
        }
      }

      if (extracted.length === 0) {
        setErrorMsg('រកមិនឃើញទិន្នន័យទំនិញដែលមាន Barcode និងឈ្មោះត្រឹមត្រូវក្នុងឯកសារនេះទេ។ សូមពិនិត្យមើល Header ជួរទី១ នៃ Excel របស់អ្នក។');
      }

      setParsedRows(extracted);
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      setErrorMsg(`មិនអាចអានឯកសារ Excel បានទេ: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      parseExcelFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      parseExcelFile(droppedFile);
    }
  };

  // Download a sample Excel template for users matching Daily Plan multi-sheet format
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const colWidths = [
      { wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 22 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 24 }
    ];

    const sheetsConfig = [
      {
        name: 'Daily',
        data: [
          {
            'Storage Temperature': 'Dry',
            'Item Code': '8851959132014',
            'Name': 'Coca Cola Original Taste 330ml',
            'Name in Khmer': 'កូកាកូឡា ៣៣០មល',
            'Vendors/Vendor': 'Cambodia Beverage Company',
            'Purchase UoM': 'កំប៉ុង',
            'Current Stock': 24,
            'Remark': 'Delivery on Thu'
          },
          {
            'Storage Temperature': 'Dry',
            'Item Code': '8841002010012',
            'Name': 'Angkor Beer Can 330ml',
            'Name in Khmer': 'ស្រាបៀរអង្គរ',
            'Vendors/Vendor': 'Cambrew Ltd',
            'Purchase UoM': 'កំប៉ុង',
            'Current Stock': 12,
            'Remark': 'Delivery on Thu'
          }
        ]
      },
      {
        name: 'Bakery and Cake',
        data: [
          {
            'Storage Temperature': 'Frozen',
            'Item Code': 'C0101010508',
            'Name': 'Raw Croissant Frozen Large Pack*5*90g',
            'Name in Khmer': 'នំកក',
            'Vendors/Vendor': 'FF2',
            'Purchase UoM': 'Units',
            'Current Stock': 0,
            'Remark': 'Delivery Thu'
          }
        ]
      },
      {
        name: 'Fresh',
        data: [
          {
            'Storage Temperature': 'Dry',
            'Item Code': 'P0904040002',
            'Name': 'Soma Egg (1Tray/30pcs)',
            'Name in Khmer': 'ពងមាន់',
            'Vendors/Vendor': 'SM',
            'Purchase UoM': 'Pack*30',
            'Current Stock': 0,
            'Remark': 'Delivery on Thu'
          }
        ]
      },
      {
        name: ' Milk and Yogurt',
        data: [
          {
            'Storage Temperature': 'Chilled',
            'Item Code': 'P0401020063',
            'Name': 'Dalat Aloe Vera Yogurt 100Gx40C',
            'Name in Khmer': 'យ៉ាអួរ ដាលាត',
            'Vendors/Vendor': 'Dalat',
            'Purchase UoM': 'Ctn*40',
            'Current Stock': 0,
            'Remark': 'Lead Time 2 Week'
          }
        ]
      }
    ];

    sheetsConfig.forEach(sc => {
      const ws = XLSX.utils.json_to_sheet(sc.data);
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, sc.name);
    });

    XLSX.writeFile(wb, 'Mart_Products_Import_Template.xlsx');
  };

  // Only rows from selected sheets will be imported, deduplicated across the selected sheets
  const selectedRawRows = parsedRows.filter(r => selectedSheets.includes(r.sheetName));
  const seenBarcodesForImport = new Set<string>();
  const rowsToImport = selectedRawRows.filter(r => {
    const k = r.barcode.toLowerCase();
    if (seenBarcodesForImport.has(k)) return false;
    seenBarcodesForImport.add(k);
    return true;
  });

  // Filter parsed rows for preview
  const displayRows = rowsToImport.filter(r => {
    const matchesSheet = previewFilterSheet === 'all' || r.sheetName === previewFilterSheet;
    const q = searchPreview.toLowerCase().trim();
    if (!q) return matchesSheet;
    const matchesSearch = 
      r.name.toLowerCase().includes(q) ||
      (r.khmerName && r.khmerName.toLowerCase().includes(q)) ||
      r.barcode.toLowerCase().includes(q) ||
      r.supplierName.toLowerCase().includes(q);
    return matchesSheet && matchesSearch;
  });

  const newCount = rowsToImport.filter(r => !r.isExisting).length;
  const updateCount = rowsToImport.filter(r => r.isExisting).length;

  // Construct Product objects for offline resilience or fallback
  const buildMergedList = (): { merged: Product[]; count: number } => {
    const localMerged: Product[] = [...existingProducts];
    const barcodeMap = new Map<string, number>();
    localMerged.forEach((p, idx) => {
      barcodeMap.set((p.barcode || '').toLowerCase().trim(), idx);
    });

    let count = 0;
    for (const row of rowsToImport) {
      const key = row.barcode.toLowerCase().trim();
      const existingIdx = barcodeMap.get(key);
      if (existingIdx !== undefined) {
        localMerged[existingIdx] = {
          ...localMerged[existingIdx],
          name: row.name,
          khmerName: row.khmerName || localMerged[existingIdx].khmerName,
          category: row.category,
          unit: row.unit,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          currentStock: row.currentStock,
          minStock: row.minStock,
          supplierName: row.supplierName,
          supplierPhone: row.supplierPhone || localMerged[existingIdx].supplierPhone,
          remark: row.remark || localMerged[existingIdx].remark,
          storageTemp: row.storageTemp || localMerged[existingIdx].storageTemp
        };
        count++;
      } else {
        const newProd: Product = {
          id: `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          barcode: row.barcode,
          name: row.name,
          khmerName: row.khmerName,
          category: row.category,
          unit: row.unit,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          currentStock: row.currentStock,
          minStock: row.minStock,
          supplierName: row.supplierName,
          supplierPhone: row.supplierPhone,
          remark: row.remark,
          storageTemp: row.storageTemp
        };
        localMerged.push(newProd);
        barcodeMap.set(key, localMerged.length - 1);
        count++;
      }
    }
    return { merged: localMerged, count };
  };

  // Submit selected parsed products to backend API in safe chunks
  const handleImportSubmit = async () => {
    if (rowsToImport.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: Partial<Product>[] = rowsToImport.map(r => ({
        barcode: r.barcode,
        name: r.name,
        khmerName: r.khmerName,
        category: r.category,
        unit: r.unit,
        costPrice: r.costPrice,
        sellingPrice: r.sellingPrice,
        currentStock: r.currentStock,
        minStock: r.minStock,
        supplierName: r.supplierName,
        supplierPhone: r.supplierPhone,
        remark: r.remark,
        storageTemp: r.storageTemp
      }));

      // Send in chunks of 250 items to stay comfortably below Vercel serverless body & timeout limits
      const CHUNK_SIZE = 250;
      let totalSynced = 0;
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/products/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: chunk })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to import products to database');
        }
        const data = await res.json();
        totalSynced += Number(data.count || chunk.length);
      }

      setSuccessCount(totalSynced || rowsToImport.length);

      // Re-fetch all products to update local state from authoritative DB
      const prodsRes = await fetch('/api/products');
      if (prodsRes.ok) {
        const updatedList: Product[] = await prodsRes.json();
        saveProducts(updatedList);
        onImportSuccess(updatedList);
      } else {
        const { merged } = buildMergedList();
        saveProducts(merged);
        onImportSuccess(merged);
      }
    } catch (err: any) {
      console.warn('Backend batch import failed:', err);
      // Only silently cache to LocalStorage when genuinely offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          const { merged, count } = buildMergedList();
          saveProducts(merged);
          onImportSuccess(merged);
          setSuccessCount(count);
        } catch (fallbackErr: any) {
          setErrorMsg(`បរាជ័យក្នុងការ Import: ${err.message || fallbackErr.message}`);
        }
      } else {
        setErrorMsg(`មិនអាចរក្សាទុកចូល Database បានទេ: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
      onClick={() => { if (!isSubmitting) onClose(); }}
    >
      <div 
        className="relative w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>នាំចូលទំនិញពី Excel (Import Products from Excel)</span>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 font-semibold">
                  Batch Sync
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                បញ្ចូលទំនិញរាប់រយមុខក្នុងពេលតែមួយពីឯកសារ Excel Catalog ឬ Daily Plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Success Banner */}
          {successCount !== null && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center justify-between gap-3 animate-fade-in shadow-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">បាននាំចូលទំនិញជោគជ័យ!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    ទំនិញចំនួន <strong>{successCount} មុខ</strong> ត្រូវបានបញ្ចូល និង Update ក្នុង Database រួចរាល់។ លោកអ្នកអាចស្កេន Barcode បានភ្លាមៗ!
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition active:scale-95 shrink-0"
              >
                រួចរាល់
              </button>
            </div>
          )}

          {/* Upload Dropzone */}
          {successCount === null && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/80 hover:bg-blue-50/40 rounded-3xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition shadow-inner">
                {isParsing ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : (
                  <UploadCloud className="w-6 h-6" />
                )}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">
                  {file ? file.name : 'ចុចទីនេះ ឬទម្លាក់ឯកសារ Excel (.xlsx, .xls, .csv)'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  ប្រព័ន្ធស្គាល់ដោយស្វ័យប្រវត្តិនូវ Item Code, Name, Khmer Name, Unit, Price, Supplier...
                </p>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] bg-white border border-slate-200 px-2.5 py-1 rounded-full text-slate-600 font-medium shadow-2xs">
                  គាំទ្រ Daily Plan, Supermarket Catalog
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadTemplate();
                  }}
                  className="text-[11px] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-full text-blue-700 font-bold flex items-center gap-1 transition"
                  title="ទាញយកឯកសារគំរូ"
                >
                  <Download className="w-3 h-3" />
                  <span>ទាញយកគំរូ Excel</span>
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsed Preview Section */}
          {parsedRows.length > 0 && successCount === null && (
            <div className="space-y-3">
              {/* Multi-Sheet Selection Section (when file has multiple sheets like Daily, Bakery, Fresh, Milk) */}
              {sheetsFound.length > 1 && (
                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>ជ្រើសរើស Sheet សម្រាប់នាំចូល (Select Sheets to Import):</span>
                      </span>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100/90 px-2.5 py-0.5 rounded-full border border-blue-200">
                        បានជ្រើសរើស {selectedSheets.length} / {sheetsFound.length} Sheet
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={selectAllSheets}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition active:scale-95 shadow-2xs"
                      >
                        ជ្រើសរើសទាំងអស់
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllSheets}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-[11px] transition active:scale-95"
                      >
                        ដោះទាំងអស់
                      </button>
                    </div>
                  </div>

                  {/* Interactive Sheet Checkbox Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {sheetsFound.map(sheet => {
                      const trimmed = sheet.trim();
                      const isSelected = selectedSheets.includes(trimmed);
                      const count = parsedRows.filter(r => r.sheetName === trimmed).length;
                      return (
                        <button
                          key={sheet}
                          type="button"
                          onClick={() => toggleSheet(trimmed)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition active:scale-95 text-left ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 opacity-80'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-white text-blue-600' : 'border border-slate-300 bg-white'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate font-semibold">{trimmed}</span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ml-1.5 ${
                            isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {count} មុខ
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary Metrics */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100/70 rounded-2xl border border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">
                    នឹងនាំចូលសរុប: <strong className="text-blue-700 text-sm">{rowsToImport.length}</strong> មុខទំនិញ
                  </span>
                  {selectedSheets.length < sheetsFound.length && sheetsFound.length > 1 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                      ពី {selectedSheets.length} Sheet
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    + {newCount} ទំនិញថ្មី
                  </span>
                  {updateCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                      🔄 {updateCount} នឹង Update ទិន្នន័យ
                    </span>
                  )}
                </div>

                {/* Filter preview table by specific sheet if multiple are selected */}
                {selectedSheets.length > 1 && (
                  <CustomSelect<string>
                    value={previewFilterSheet}
                    onChange={setPreviewFilterSheet}
                    options={[
                      { value: 'all', label: 'ទាំងអស់', badge: rowsToImport.length },
                      ...selectedSheets.map(s => ({
                        value: s,
                        label: s,
                        badge: rowsToImport.filter(r => r.sheetName === s).length
                      }))
                    ]}
                    label="មើលក្នុង Preview:"
                    size="sm"
                    align="right"
                    buttonClassName="bg-white border-slate-200"
                  />
                )}
              </div>

              {/* Search in preview */}
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="ស្វែងរកក្នុងតារាង Preview..."
                  value={searchPreview}
                  onChange={(e) => setSearchPreview(e.target.value)}
                  className="w-full sm:w-72 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400 shrink-0">
                  បង្ហាញ {displayRows.length} នៃ {rowsToImport.length} មុខ
                </span>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-[11px] text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-10">#</th>
                      <th className="py-2.5 px-3">លេខ Barcode</th>
                      <th className="py-2.5 px-3">ឈ្មោះទំនិញ</th>
                      <th className="py-2.5 px-3">ឈ្មោះខ្មែរ</th>
                      <th className="py-2.5 px-3">ផ្នែក (Category)</th>
                      <th className="py-2.5 px-3 text-center">ឯកតា</th>
                      <th className="py-2.5 px-3 text-center">ស្តុក</th>
                      <th className="py-2.5 px-3">អ្នកផ្គត់ផ្គង់</th>
                      <th className="py-2.5 px-2 text-center">ស្ថានភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                          {rowsToImport.length === 0 
                            ? 'សូមជ្រើសរើស Sheet ខាងលើដើម្បីមើល និងនាំចូលទំនិញ' 
                            : 'រកមិនឃើញទំនិញដែលត្រូវនឹងពាក្យស្វែងរកទេ'}
                        </td>
                      </tr>
                    ) : (
                      displayRows.slice(0, 100).map((row, idx) => (
                        <tr key={row.barcode + idx} className="hover:bg-blue-50/40">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-800 text-[11px]">{row.barcode}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 max-w-[200px] truncate">{row.name}</td>
                          <td className="py-2 px-3 text-slate-500 max-w-[150px] truncate">{row.khmerName || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{row.category}</td>
                          <td className="py-2 px-3 text-center text-slate-600">{row.unit}</td>
                          <td className="py-2 px-3 text-center font-medium text-slate-700">
                            {row.currentStock}
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[140px]">{row.supplierName}</td>
                          <td className="py-2 px-2 text-center">
                            {row.isExisting ? (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                                Update
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                ថ្មី
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {displayRows.length > 100 && (
                <p className="text-[11px] text-slate-400 text-center italic">
                  (បង្ហាញគំរូ ១០០ មុខដំបូង — ពេល Import នឹងបញ្ចូលមុខទំនិញទាំងអស់ទាំង {rowsToImport.length} មុខ)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition active:scale-95"
          >
            បិទ
          </button>

          {parsedRows.length > 0 && successCount === null && (
            <button
              type="button"
              onClick={handleImportSubmit}
              disabled={isSubmitting || rowsToImport.length === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>កំពុងបញ្ចូលទំនិញ...</span>
                </>
              ) : rowsToImport.length === 0 ? (
                <span>សូមជ្រើសរើសយ៉ាងហោចណាស់ ១ Sheet</span>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>
                    បញ្ជាក់ការ Import ({rowsToImport.length} មុខទំនិញ{selectedSheets.length < sheetsFound.length ? ` ពី ${selectedSheets.length} Sheet` : ''})
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

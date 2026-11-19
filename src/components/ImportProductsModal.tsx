import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import { saveProducts } from '../utils/storage';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, 
  AlertCircle, ArrowRight, Download, RefreshCw, Package 
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
  const [selectedSheet, setSelectedSheet] = useState<string>('all');
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
      setSelectedSheet('all');
      setSearchPreview('');
      setIsSubmitting(false);
      setErrorMsg(null);
      setSuccessCount(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper to extract numeric values safely
  const parseNum = (val: any, fallback = 0): number => {
    if (val === null || val === undefined) return fallback;
    const str = String(val).replace(/[^0-9.-]/g, '');
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
      setSheetsFound(workbook.SheetNames);

      const existingBarcodeMap = new Set(
        existingProducts.map(p => (p.barcode || '').toLowerCase().trim())
      );

      const extracted: ParsedProductRow[] = [];
      const seenBarcodesInFile = new Set<string>();

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

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

          // Avoid duplicate barcodes within the same uploaded file
          const cleanBarcodeKey = barcode.toLowerCase();
          if (seenBarcodesInFile.has(cleanBarcodeKey)) {
            continue;
          }
          seenBarcodesInFile.add(cleanBarcodeKey);

          // 3. Detect Khmer Name
          const rawKhmer = 
            row['Name in Khmer'] || row['name in khmer'] || 
            row['Khmer Name'] || row['khmer name'] || row['khmer_name'] || 
            row['ឈ្មោះខ្មែរ'] || row['ឈ្មោះជាភាសាខ្មែរ'] || '';
          const khmerName = String(rawKhmer).trim() || undefined;

          // 4. Detect Category / Department
          let category = sheetName.trim();
          const rawCat = 
            row['Category'] || row['category'] || row['Department'] || 
            row['department'] || row['Storage Temperature'] || 
            row['ប្រភេទ'] || row['ផ្នែក'] || '';
          if (rawCat && String(rawCat).trim()) {
            category = String(rawCat).trim();
          }
          if (category === ' Milk and Yogurt') category = 'Milk and Yogurt';

          // 5. Detect Unit / Purchase UoM
          const rawUnit = 
            row['Purchase UoM'] || row['purchase uom'] || row['UoM'] || 
            row['uom'] || row['Unit'] || row['unit'] || row['ឯកតា'] || row['Packing'] || 'កំប៉ុង';
          const unit = String(rawUnit).trim() || 'កំប៉ុង';

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

          // 8. Detect Supplier / Vendor
          const rawSupplier = 
            row['Vendors/Vendor'] || row['Vendor'] || row['vendor'] || 
            row['Supplier'] || row['supplier'] || row['អ្នកផ្គត់ផ្គង់'] || 
            row['Supplier Name'] || 'ទូទៅ (General Supplier)';
          const supplierName = String(rawSupplier).trim() || 'ទូទៅ (General Supplier)';

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

  // Download a sample Excel template for users
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'Item Code': '8851959132014',
        'Name': 'Coca Cola Original Taste 330ml',
        'Name in Khmer': 'កូកាកូឡា ៣៣០មល',
        'Category': 'Daily',
        'Purchase UoM': 'កំប៉ុង',
        'Cost Price': 0.40,
        'Selling Price': 0.60,
        'Current Stock': 24,
        'Min Stock': 48,
        'Vendors/Vendor': 'Cambodia Beverage Company'
      },
      {
        'Item Code': 'P0904040002',
        'Name': 'Soma Egg (1Tray/30pcs)',
        'Name in Khmer': 'ពងមាន់',
        'Category': 'Fresh',
        'Purchase UoM': 'Pack*30',
        'Cost Price': 3.20,
        'Selling Price': 4.00,
        'Current Stock': 0,
        'Min Stock': 10,
        'Vendors/Vendor': 'SM'
      },
      {
        'Item Code': '8841002010012',
        'Name': 'Angkor Beer Can 330ml',
        'Name in Khmer': 'ស្រាបៀរអង្គរ',
        'Category': 'Daily',
        'Purchase UoM': 'កំប៉ុង',
        'Cost Price': 0.55,
        'Selling Price': 0.85,
        'Current Stock': 12,
        'Min Stock': 24,
        'Vendors/Vendor': 'Cambrew Ltd'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 18 }, { wch: 32 }, { wch: 22 }, { wch: 16 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 12 }, { wch: 26 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'Mart_Products_Import_Template.xlsx');
  };

  // Filter parsed rows for preview
  const displayRows = parsedRows.filter(r => {
    const matchesSheet = selectedSheet === 'all' || r.sheetName === selectedSheet;
    const q = searchPreview.toLowerCase().trim();
    if (!q) return matchesSheet;
    const matchesSearch = 
      r.name.toLowerCase().includes(q) ||
      (r.khmerName && r.khmerName.toLowerCase().includes(q)) ||
      r.barcode.toLowerCase().includes(q) ||
      r.supplierName.toLowerCase().includes(q);
    return matchesSheet && matchesSearch;
  });

  const newCount = parsedRows.filter(r => !r.isExisting).length;
  const updateCount = parsedRows.filter(r => r.isExisting).length;

  // Submit all parsed products to backend API
  const handleImportSubmit = async () => {
    if (parsedRows.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: Partial<Product>[] = parsedRows.map(r => ({
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
        supplierPhone: r.supplierPhone
      }));

      const res = await fetch('/api/products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: payload })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to import products to database');
      }

      const data = await res.json();
      setSuccessCount(data.count || parsedRows.length);

      // Re-fetch all products to update local state
      const prodsRes = await fetch('/api/products');
      if (prodsRes.ok) {
        const updatedList: Product[] = await prodsRes.json();
        saveProducts(updatedList);
        onImportSuccess(updatedList);
      }
    } catch (err: any) {
      console.warn('Backend batch import failed or offline, falling back to LocalStorage:', err);
      try {
        // Construct Product objects for offline resilience
        const localMerged: Product[] = [...existingProducts];
        const barcodeMap = new Map<string, number>();
        localMerged.forEach((p, idx) => {
          barcodeMap.set((p.barcode || '').toLowerCase().trim(), idx);
        });

        let addedCount = 0;
        let updatedCount = 0;

        for (const row of parsedRows) {
          const key = row.barcode.toLowerCase().trim();
          const existingIdx = barcodeMap.get(key);
          if (existingIdx !== undefined) {
            // Update existing
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
              supplierPhone: row.supplierPhone || localMerged[existingIdx].supplierPhone
            };
            updatedCount++;
          } else {
            // Add new
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
              supplierPhone: row.supplierPhone
            };
            localMerged.push(newProd);
            barcodeMap.set(key, localMerged.length - 1);
            addedCount++;
          }
        }

        saveProducts(localMerged);
        onImportSuccess(localMerged);
        setSuccessCount(addedCount + updatedCount);
      } catch (fallbackErr: any) {
        console.error('Offline import fallback error:', fallbackErr);
        setErrorMsg(`បរាជ័យក្នុងការ Import: ${err.message || fallbackErr.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
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
                  គាំទ្រ Daily Plan, Takeo Plan, Supermarket Catalog
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
              {/* Summary Metrics */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100/70 rounded-2xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">
                    រកឃើញសរុប: <strong className="text-blue-700 text-sm">{parsedRows.length}</strong> មុខទំនិញ
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    + {newCount} ទំនិញថ្មី
                  </span>
                  {updateCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                      🔄 {updateCount} នឹង Update ទិន្នន័យ
                    </span>
                  )}
                </div>

                {/* Sheets Filter (if multi-sheet like Daily, Bakery, Fresh, Milk) */}
                {sheetsFound.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium">សន្លឹក (Sheet):</span>
                    <select
                      value={selectedSheet}
                      onChange={(e) => setSelectedSheet(e.target.value)}
                      className="bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-1 text-slate-700 focus:outline-none"
                    >
                      <option value="all">ទាំងអស់ ({parsedRows.length})</option>
                      {sheetsFound.map(s => (
                        <option key={s} value={s.trim()}>
                          {s.trim()} ({parsedRows.filter(r => r.sheetName === s.trim()).length})
                        </option>
                      ))}
                    </select>
                  </div>
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
                  បង្ហាញ {displayRows.length} នៃ {parsedRows.length} មុខ
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
                      <th className="py-2.5 px-3 text-right">តម្លៃដើម</th>
                      <th className="py-2.5 px-3">អ្នកផ្គត់ផ្គង់</th>
                      <th className="py-2.5 px-2 text-center">ស្ថានភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.slice(0, 100).map((row, idx) => (
                      <tr key={row.barcode + idx} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 text-[11px]">{row.barcode}</td>
                        <td className="py-2 px-3 font-medium text-slate-800 max-w-[200px] truncate">{row.name}</td>
                        <td className="py-2 px-3 text-slate-500 max-w-[150px] truncate">{row.khmerName || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.category}</td>
                        <td className="py-2 px-3 text-center text-slate-600">{row.unit}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-700">
                          ${(row.costPrice || 0).toFixed(2)}
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
                    ))}
                  </tbody>
                </table>
              </div>
              {displayRows.length > 100 && (
                <p className="text-[11px] text-slate-400 text-center italic">
                  (បង្ហាញគំរូ ១០០ មុខដំបូង — ពេល Import នឹងបញ្ចូលទាំងអស់ទាំង {parsedRows.length} មុខ)
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
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>កំពុងបញ្ចូលទំនិញ...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>បញ្ជាក់ការ Import ({parsedRows.length} មុខទំនិញ)</span>
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

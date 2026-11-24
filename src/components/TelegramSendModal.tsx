import React, { useState, useEffect } from 'react';
import { 
  X, Send, FileSpreadsheet, MessageSquare, Bot, 
  ExternalLink, RefreshCw, CheckCircle2, AlertCircle, 
  Copy, Check, User, ChevronDown, ChevronUp
} from 'lucide-react';
import { RestockItem } from '../types';
import { OrderDay, exportDailyPlanExcelBase64, generateTelegramOrderContent } from '../utils/export';
import { api } from '../services/api';
import { sound } from '../utils/audio';

interface TelegramSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: RestockItem[];
  orderDay: OrderDay;
  supplierFilter?: string;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const TelegramSendModal: React.FC<TelegramSendModalProps> = ({
  isOpen,
  onClose,
  items,
  orderDay,
  supplierFilter,
  onShowToast
}) => {
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [sendExcel, setSendExcel] = useState<boolean>(true);
  const [sendText, setSendText] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectedChats, setDetectedChats] = useState<Array<{
    id: string;
    type: string;
    name: string;
    username: string;
    lastActive: string;
    lastText?: string;
  }>>([]);
  const [showDetectedList, setShowDetectedList] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [sendSuccess, setSendSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const BOT_USERNAME = 'Digital_Invitation_Link_bot';
  const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

  // Filter items by supplier
  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);

  // Load saved Username on modal open
  useEffect(() => {
    if (isOpen) {
      setSendSuccess(false);
      setErrorMessage(null);

      const savedUser = localStorage.getItem('mart_telegram_username');
      const savedId = localStorage.getItem('mart_scan_telegram_chat_id');

      if (savedUser) {
        setUsernameInput(savedUser);
      } else if (savedId) {
        setUsernameInput(savedId);
      }
      if (savedId) {
        setChatId(savedId);
      } else {
        api.getTelegramSettings()
          .then(settings => {
            if (settings.chatId) {
              setChatId(settings.chatId);
              localStorage.setItem('mart_scan_telegram_chat_id', settings.chatId);
            }
          })
          .catch(() => {});
      }

      // Handle Escape key
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isSending) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose, isSending]);

  if (!isOpen) return null;

  // Auto-detect Telegram Users who started the bot
  const handleAutoDetect = async () => {
    setIsDetecting(true);
    setErrorMessage(null);
    try {
      const res = await api.getTelegramUpdates();
      if (res.chats && res.chats.length > 0) {
        setDetectedChats(res.chats);
        setShowDetectedList(true);

        // If no username currently selected, pick the first user
        if (!usernameInput) {
          const first = res.chats[0];
          const display = first.username ? `@${first.username}` : first.name;
          setUsernameInput(display);
          setChatId(first.id);
          localStorage.setItem('mart_telegram_username', display);
          localStorage.setItem('mart_scan_telegram_chat_id', first.id);
          api.saveTelegramSettings(first.id).catch(() => {});
        }
        onShowToast(`រកឃើញ User ចំនួន ${res.chats.length} ដែលបានទាក់ទងមក Bot!`, 'success');
      } else {
        setDetectedChats([]);
        setShowDetectedList(false);
        setErrorMessage(
          `⚠️ មិនទាន់ឃើញមាន User ផ្ញើសារ ឬចុច Start លើ Bot នៅឡើយទេ!\n👉 សូមចុចបើក Bot (@${BOT_USERNAME}) រួចចុច "START" បន្ទាប់មកចុចប៊ូតុង "រក Username ស្វ័យប្រវត្តិ" ម្តងទៀត។`
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'មិនអាចទាញយកទិន្នន័យពី Telegram Bot បានទេ');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSelectUser = (c: { id: string; name: string; username: string }) => {
    const displayVal = c.username ? `@${c.username}` : c.name;
    setUsernameInput(displayVal);
    setChatId(c.id);
    localStorage.setItem('mart_telegram_username', displayVal);
    localStorage.setItem('mart_scan_telegram_chat_id', c.id);
    api.saveTelegramSettings(c.id).catch(() => {});
    setShowDetectedList(false);
  };

  // Copy order text to clipboard
  const handleCopyTextOnly = async () => {
    const content = generateTelegramOrderContent(items, orderDay, supplierFilter);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content.plainText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content.plainText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedText(true);
      sound.playSuccess();
      onShowToast('បានចម្លងអត្ថបទបញ្ជាទិញរួចរាល់!', 'success');
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      onShowToast('មិនអាចចម្លងអត្ថបទបានទេ', 'error');
    }
  };

  // Main action: Send to Telegram
  const handleSendToTelegram = async () => {
    let target = usernameInput.trim();

    // If usernameInput corresponds to a detected chat with a known numeric ID, use numeric ID for 100% direct delivery
    if (chatId && /^-?\d+$/.test(chatId)) {
      const cleanInput = usernameInput.replace(/^@/, '').toLowerCase().trim();
      const match = detectedChats.find(c => c.id === chatId);
      if (match) {
        const u = (match.username || '').toLowerCase().trim();
        const n = (match.name || '').toLowerCase().trim();
        if (cleanInput === u || cleanInput === n || cleanInput === chatId) {
          target = chatId;
        }
      } else if (!target || target === chatId) {
        target = chatId;
      }
    }
    if (!target && chatId) {
      target = chatId.trim();
    }

    if (!target) {
      setErrorMessage('សូមបញ្ចូល ឬជ្រើសរើស Telegram Username របស់ User ជាមុនសិន!');
      return;
    }

    if (!sendExcel && !sendText) {
      setErrorMessage('សូមជ្រើសរើសយ៉ាងហោចណាស់មួយ៖ ផ្ញើឯកសារ Excel ឬផ្ញើសារអត្ថបទ!');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setSendSuccess(false);

    try {
      let excelBase64: string | undefined = undefined;
      let fileName: string | undefined = undefined;
      let caption: string | undefined = undefined;
      let messageText: string | undefined = undefined;

      // 1. Prepare Excel Plan if selected
      if (sendExcel) {
        const excelData = exportDailyPlanExcelBase64(items, orderDay, supplierFilter);
        if (excelData) {
          excelBase64 = excelData.base64;
          fileName = excelData.filename;
          caption = `📊 <b>Daily Order Plan (${orderDay})</b>\n🗓 កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('km-KH')}\n📦 សរុប: <b>${excelData.totalItems}</b> មុខ (<b>${excelData.totalQty}</b> ឯកតា)\n✨ <i>ចេញពីប្រព័ន្ធ Mart Scan & Order</i>`;
        }
      }

      // 2. Prepare HTML Text if selected
      if (sendText) {
        const content = generateTelegramOrderContent(items, orderDay, supplierFilter);
        messageText = content.html;
      }

      // 3. Send via backend API
      const result = await api.sendToTelegram({
        chatId: target,
        excelBase64,
        fileName,
        caption,
        messageText
      });

      if (result.success) {
        setSendSuccess(true);
        sound.playSuccess();
        if (result.chatId) {
          setChatId(result.chatId);
          localStorage.setItem('mart_scan_telegram_chat_id', result.chatId);
          api.saveTelegramSettings(result.chatId).catch(() => {});
        }
        localStorage.setItem('mart_telegram_username', usernameInput.trim());
        onShowToast('🚀 បានបាញ់ឯកសារ Excel និងបញ្ជីទំនិញចូល Telegram រួចរាល់ដោយជោគជ័យ!', 'success');
      } else {
        throw new Error(result.error || 'បរាជ័យក្នុងការផ្ញើទៅ Telegram');
      }
    } catch (err: any) {
      sound.playError();
      setErrorMessage(err.message || 'មានបញ្ហាក្នុងការផ្ញើទៅកាន់ Telegram');
      onShowToast(err.message || 'ផ្ញើទៅ Telegram បរាជ័យ', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const contentPreview = generateTelegramOrderContent(items, orderDay, supplierFilter);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={() => { if (!isSending) onClose(); }}
    >
      <div 
        className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-sky-100 flex flex-col max-h-[92vh] overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 px-5 sm:px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner text-white">
              <Send className="w-5 h-5 translate-x-0.5 -translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold tracking-tight">បាញ់ទិន្នន័យទៅ Telegram</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white tracking-wide uppercase">
                  Bot Direct
                </span>
              </div>
              <p className="text-xs text-sky-100 font-medium">
                ផ្ញើឯកសារ Excel និងបញ្ជីទំនិញកុម្ម៉ង់ដោយស្វ័យប្រវត្តិ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition disabled:opacity-50"
            title="បិទ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Bot Connection Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50/50 border border-sky-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-sky-950">Telegram Bot ផ្លូវការ</div>
                  <div className="text-[11px] font-semibold text-sky-600">@{BOT_USERNAME}</div>
                </div>
              </div>
              <a
                href={BOT_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition active:scale-95"
              >
                <span>បើក Bot ក្នុង Telegram</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-sky-100/60">
              💡 <b>របៀបប្រើ៖</b> សូមចុច <b>"បើក Bot ក្នុង Telegram"</b> រួចចុច <b>START</b> លើ Bot។ បន្ទាប់មកចុចប៊ូតុង <b>"រក Username ស្វ័យប្រវត្តិ"</b> ខាងក្រោម ដើម្បីជ្រើសរើស Username របស់អ្នកភ្លាមៗ!
            </div>
          </div>

          {/* Username Input with Auto Detect */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-600" />
                <span>Telegram Username របស់ User</span>
                <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={isDetecting || isSending}
                className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-sky-50 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                <span>{isDetecting ? 'កំពុងស្វែងរក...' : '🔍 រក Username ស្វ័យប្រវត្តិ'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={usernameInput}
                onChange={e => {
                  const val = e.target.value;
                  setUsernameInput(val);
                  localStorage.setItem('mart_telegram_username', val.trim());
                  
                  // If matches a detected user
                  const clean = val.replace(/^@/, '').toLowerCase().trim();
                  const match = detectedChats.find(c => (c.username || '').toLowerCase() === clean);
                  if (match) {
                    setChatId(match.id);
                    localStorage.setItem('mart_scan_telegram_chat_id', match.id);
                  } else if (/^-?\d+$/.test(val.trim())) {
                    setChatId(val.trim());
                    localStorage.setItem('mart_scan_telegram_chat_id', val.trim());
                  } else {
                    setChatId(val.trim());
                  }
                }}
                placeholder="ឧ. @username របស់ User (ឧ. @Mao_SokHun)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition font-sans"
              />
              {usernameInput && (
                <button
                  type="button"
                  onClick={() => {
                    setUsernameInput('');
                    setChatId('');
                    localStorage.removeItem('mart_telegram_username');
                    localStorage.removeItem('mart_scan_telegram_chat_id');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Detected Users Dropdown List */}
            {showDetectedList && detectedChats.length > 0 && (
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 animate-fade-in shadow-sm">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-500 flex items-center justify-between">
                  <span>ជ្រើសរើស Username របស់អ្នកដែលបានរកឃើញ៖</span>
                  <button 
                    onClick={() => setShowDetectedList(false)}
                    className="text-slate-400 hover:text-slate-600 text-[10px]"
                  >
                    បិទ
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                  {detectedChats.map(c => {
                    const displayUser = c.username ? `@${c.username}` : c.name;
                    const isSelected = usernameInput === displayUser || chatId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectUser(c)}
                        className={`w-full text-left p-2.5 rounded-2xl transition flex items-center justify-between text-xs ${
                          isSelected 
                            ? 'bg-sky-100/80 border border-sky-300 text-sky-950 font-bold shadow-xs' 
                            : 'bg-white hover:bg-sky-50/70 border border-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span>{c.name}</span>
                              {c.username && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 font-mono font-semibold border border-sky-200/60">
                                  @{c.username}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {c.lastText ? `សារចុងក្រោយ: ${c.lastText}` : 'បានចុច Start លើ Bot'}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sending Options Checkboxes */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">ជម្រើសក្នុងការបាញ់ទៅ Telegram</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Excel Sheet */}
              <label className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-3 select-none ${
                sendExcel ? 'bg-emerald-50/60 border-emerald-300' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={sendExcel}
                  onChange={e => setSendExcel(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>ឯកសារ Excel (.xlsx)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    ប្លង់ Daily Order Plan (Header លឿង) បែងចែកតាម Sheet ផ្នែកនីមួយៗ
                  </p>
                </div>
              </label>

              {/* Option 2: Order Text */}
              <label className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-3 select-none ${
                sendText ? 'bg-sky-50/60 border-sky-300' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={sendText}
                  onChange={e => setSendText(e.target.checked)}
                  className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                    <span>សារអត្ថបទសង្ខេប (Text)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    បញ្ជីឈ្មោះទំនិញ បារកូដ ចំនួនត្រូវទិញ និង Remark សម្រាប់អានផ្ទាល់
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Order Summary Info Pill */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/70 border border-slate-200 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-600">ថ្ងៃកុម្ម៉ង់: <b className="text-sky-700">{orderDay}</b></span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-600">មុខទំនិញ: <b className="text-slate-900">{filteredItems.length} មុខ</b></span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-600">ចំនួនទិញសរុប: <b className="text-emerald-700">{totalQty}</b></span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(!previewOpen)}
              className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-0.5"
            >
              <span>{previewOpen ? 'លាក់ Preview' : 'មើលគំរូ'}</span>
              {previewOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Collapsible Order Preview */}
          {previewOpen && (
            <div className="p-3 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed border border-slate-800 shadow-inner">
              {contentPreview.plainText}
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1 whitespace-pre-line leading-relaxed font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Success Banner */}
          {sendSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1 font-semibold leading-relaxed">
                បានបាញ់ឯកសារ Excel និងបញ្ជីទំនិញចូល Telegram រួចរាល់ដោយជោគជ័យ! សូមពិនិត្យមើលក្នុង Telegram របស់អ្នក។
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyTextOnly}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
            title="ចម្លងអត្ថបទសម្រាប់ Copy Paste"
          >
            {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copiedText ? 'បានចម្លងរួច!' : 'ចម្លងជាអត្ថបទ (Copy)'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
            >
              បិទ
            </button>

            <button
              type="button"
              onClick={handleSendToTelegram}
              disabled={isSending || filteredItems.length === 0}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 transition active:scale-95"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>កំពុងបាញ់ទៅ Telegram...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>បាញ់ទៅ Telegram ឥឡូវនេះ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

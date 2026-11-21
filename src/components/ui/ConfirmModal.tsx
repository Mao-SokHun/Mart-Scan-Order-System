import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, HelpCircle, CheckCircle2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  submessage?: React.ReactNode;
  type?: 'warning' | 'danger' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmButtonColor?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  submessage,
  type = 'warning',
  confirmText = 'យល់ព្រម',
  cancelText = 'បោះបង់',
  onConfirm,
  onCancel,
  confirmButtonColor
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const iconConfig = {
    warning: {
      bg: 'bg-amber-100 text-amber-600 border-amber-200',
      icon: <AlertTriangle className="w-6 h-6" />,
      btn: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    danger: {
      bg: 'bg-rose-100 text-rose-600 border-rose-200',
      icon: <Trash2 className="w-6 h-6" />,
      btn: 'bg-rose-600 hover:bg-rose-700 text-white'
    },
    info: {
      bg: 'bg-blue-100 text-blue-600 border-blue-200',
      icon: <HelpCircle className="w-6 h-6" />,
      btn: 'bg-blue-600 hover:bg-blue-700 text-white'
    },
    success: {
      bg: 'bg-emerald-100 text-emerald-600 border-emerald-200',
      icon: <CheckCircle2 className="w-6 h-6" />,
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white'
    }
  }[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Icon Badge */}
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner mb-4 ${iconConfig.bg}`}>
            {iconConfig.icon}
          </div>

          {/* Title */}
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
            {title}
          </h3>

          {/* Message */}
          <div className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-1 font-medium">
            {message}
          </div>

          {/* Submessage if any */}
          {submessage && (
            <div className="text-xs text-slate-500 mt-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl w-full text-left">
              {submessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 w-full mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition active:scale-95"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
              }}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition shadow-sm active:scale-95 ${
                confirmButtonColor || iconConfig.btn
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

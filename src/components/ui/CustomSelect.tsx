import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeColor?: string;
  group?: string;
  disabled?: boolean;
}

export interface CustomSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  label?: string; // e.g. "ថ្ងៃកុម្ម៉ង់:"
  icon?: React.ReactNode;
  variant?: 'light' | 'dark' | 'bordered';
  size?: 'sm' | 'md';
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  fullWidth?: boolean;
}

export function CustomSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'ជ្រើសរើស...',
  label,
  icon,
  variant = 'light',
  size = 'md',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  align = 'left',
  direction = 'down',
  disabled = false,
  searchable = false,
  searchPlaceholder = 'ស្វែងរក...',
  fullWidth = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else if (!isOpen) {
      setSearch('');
    }
  }, [isOpen, searchable]);

  // Current selected option
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Filtered options if searchable
  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.group && opt.group.toLowerCase().includes(q))
    );
  }, [options, searchable, search]);

  // Group options if any option has a group
  const hasGroups = useMemo(() => {
    return options.some((opt) => !!opt.group);
  }, [options]);

  const groupedOptions = useMemo(() => {
    if (!hasGroups) return null;
    const groups: { [key: string]: SelectOption<T>[] } = {};
    filteredOptions.forEach((opt) => {
      const g = opt.group || 'ផ្សេងៗ';
      if (!groups[g]) groups[g] = [];
      groups[g].push(opt);
    });
    return groups;
  }, [filteredOptions, hasGroups]);

  const isDark = variant === 'dark';

  // Base styling for the trigger button
  const buttonVariantStyles = isDark
    ? 'bg-slate-800 hover:bg-slate-700/80 text-slate-100 border-slate-700 hover:border-slate-600 focus:ring-blue-500/40'
    : variant === 'bordered'
    ? 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20'
    : 'bg-white hover:bg-slate-50/80 text-slate-800 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20';

  const sizeStyles =
    size === 'sm'
      ? 'text-xs px-2.5 py-1.5 rounded-xl gap-1.5'
      : 'text-xs px-3 py-2 rounded-xl gap-2';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between border transition-all duration-150 shadow-2xs select-none active:scale-[0.99] focus:outline-none focus:ring-2 ${
          fullWidth ? 'w-full' : ''
        } ${buttonVariantStyles} ${sizeStyles} ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${isOpen ? 'ring-2 ring-blue-500/30 border-blue-400' : ''} ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {label && (
            <span
              className={`font-medium shrink-0 text-[11px] ${
                isDark ? 'text-slate-400' : 'text-slate-400'
              }`}
            >
              {label}
            </span>
          )}
          <span className="truncate font-semibold">
            {selectedOption ? (
              <span className="flex items-center gap-1.5 truncate">
                {selectedOption.icon}
                <span className="truncate">{selectedOption.label}</span>
                {selectedOption.sublabel && (
                  <span
                    className={`text-[10px] font-normal ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {selectedOption.sublabel}
                  </span>
                )}
              </span>
            ) : (
              <span className={isDark ? 'text-slate-400' : 'text-slate-400'}>
                {placeholder}
              </span>
            )}
          </span>
          {selectedOption?.badge !== undefined && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                selectedOption.badgeColor ||
                (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')
              }`}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ml-1.5 ${
            isDark ? 'text-slate-400' : 'text-slate-400'
          } ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
        />
      </button>

      {/* Floating Menu */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'mt-1.5'
          } z-50 min-w-[180px] max-w-[340px] w-max max-h-72 overflow-y-auto rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95 p-1.5 ${
            isDark
              ? 'bg-slate-900/95 border-slate-700/80 text-slate-200 divide-slate-800'
              : 'bg-white/95 border-slate-200/90 text-slate-800 divide-slate-100'
          } ${menuClassName}`}
          style={{ minWidth: fullWidth ? '100%' : '180px' }}
        >
          {/* Search Box if enabled */}
          {searchable && (
            <div className="p-1 mb-1">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="bg-transparent w-full focus:outline-none text-xs"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          {hasGroups && groupedOptions ? (
            Object.entries(groupedOptions).map(([groupName, groupOpts], gIdx) => (
              <div key={groupName} className={gIdx > 0 ? 'mt-2 pt-1 border-t border-slate-100 dark:border-slate-800' : ''}>
                <div
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-400'
                  }`}
                >
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {groupOpts.map((opt) => renderOptionItem(opt))}
                </div>
              </div>
            ))
          ) : filteredOptions.length === 0 ? (
            <div
              className={`p-3 text-center text-xs ${
                isDark ? 'text-slate-400' : 'text-slate-400'
              }`}
            >
              រកមិនឃើញ
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredOptions.map((opt) => renderOptionItem(opt))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderOptionItem(opt: SelectOption<T>) {
    const isSelected = opt.value === value;
    return (
      <button
        key={String(opt.value)}
        type="button"
        disabled={opt.disabled}
        onClick={() => {
          if (!opt.disabled) {
            onChange(opt.value);
            setIsOpen(false);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors duration-100 text-left select-none ${
          opt.disabled
            ? 'opacity-40 cursor-not-allowed'
            : isSelected
            ? isDark
              ? 'bg-blue-600/25 text-blue-300 font-bold'
              : 'bg-blue-50 text-blue-700 font-bold'
            : isDark
            ? 'hover:bg-slate-800 text-slate-200'
            : 'hover:bg-slate-100/80 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {opt.icon && <span className="shrink-0">{opt.icon}</span>}
          <div className="truncate">
            <div className="truncate">{opt.label}</div>
            {opt.sublabel && (
              <div
                className={`text-[10px] font-normal truncate ${
                  isSelected
                    ? isDark
                      ? 'text-blue-300/80'
                      : 'text-blue-600/80'
                    : isDark
                    ? 'text-slate-400'
                    : 'text-slate-500'
                }`}
              >
                {opt.sublabel}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {opt.badge !== undefined && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                opt.badgeColor ||
                (isSelected
                  ? isDark
                    ? 'bg-blue-500/30 text-blue-200'
                    : 'bg-blue-200/80 text-blue-800'
                  : isDark
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-100 text-slate-600')
              }`}
            >
              {opt.badge}
            </span>
          )}
          {isSelected && (
            <Check
              className={`w-3.5 h-3.5 shrink-0 ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              }`}
            />
          )}
        </div>
      </button>
    );
  }
}

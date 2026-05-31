import { useEffect, useMemo, useRef, useState } from 'react';

export interface ModernSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface ModernSelectProps {
  label?: string;
  value: string;
  options: ModernSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  icon?: string;
  emptyText?: string;
  className?: string;
  labelClassName?: string;
}

export default function ModernSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select option',
  disabled = false,
  searchable = false,
  icon = 'ri-list-check',
  emptyText = 'No options found',
  className = '',
  labelClassName = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500',
}: ModernSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;

    return options.filter((option) => {
      const text = `${option.label} ${option.description || ''}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    if (!open) return undefined;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? <label className={labelClassName}>{label}</label> : null}
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        className={`flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm shadow-sm outline-none transition ${
          open
            ? 'border-violet-400 bg-white ring-4 ring-violet-100'
            : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30'
        } ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-70' : 'text-slate-900'}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
          <i className={`${icon} text-base`}></i>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${selectedOption ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption?.description ? (
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{selectedOption.description}</span>
          ) : null}
        </span>
        <i className={`ri-arrow-down-s-line text-lg text-slate-400 transition ${open ? 'rotate-180 text-violet-600' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5">
          {searchable ? (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </div>
            </div>
          ) : null}

          <div className="max-h-[30rem] overflow-y-auto p-1.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">{emptyText}</div>
            ) : (
              filteredOptions.map((option) => {
                const selected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      selected
                        ? 'bg-violet-50 text-violet-700'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                    } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selected ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <i className={selected ? 'ri-check-line text-base' : `${icon} text-base`}></i>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{option.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

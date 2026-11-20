import React from 'react';
import { SunMedium, MoonStar, Trash2, Activity, Sparkles } from 'lucide-react';

interface HeaderProps {
  onOpenCreate: () => void;
  onClearAll: () => void;
  activeCount: number;
  totalCount: number;
  serverBaseUrl: string;
  onLockAdmin?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreate,
  onClearAll,
  activeCount,
  totalCount,
  darkMode = true,
  onToggleDarkMode
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0d121f]/95 backdrop-blur-md px-4 sm:px-8 py-3.5 shadow-md transition-colors dir-rtl">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        
        {/* Pure Icon-Only Theme Switcher Button (SunMedium ☀️ / MoonStar 🌙) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className={`p-2.5 rounded-2xl transition active:scale-95 shadow-md flex items-center justify-center ${
              darkMode
                ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-400'
                : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 shadow-slate-900/10'
            }`}
            title="تغيير لون الموقع"
            aria-label="تغيير لون الموقع"
          >
            {darkMode ? (
              <SunMedium className="w-5 h-5 text-amber-400" />
            ) : (
              <MoonStar className="w-5 h-5 text-indigo-600" />
            )}
          </button>
        </div>

        {/* Quick Stats Badge & Create Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/90 rounded-2xl shadow-sm">
            <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>النشطة: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{activeCount}</strong>/{totalCount}</span>
          </div>

          {totalCount > 0 && (
            <button
              onClick={onClearAll}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition"
              title="حذف جميع الروابط"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 rounded-2xl shadow-md transition whitespace-nowrap active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>إنشاء بث</span>
          </button>
        </div>

      </div>
    </header>
  );
};

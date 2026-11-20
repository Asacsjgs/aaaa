import React from 'react';
import { Tv2, Wand2, ShieldCheck, Radar, Layers, Server } from 'lucide-react';

export type NavTabType = 'home' | 'generator' | 'live_server' | 'bulk_generator' | 'virtual_xtream' | 'intelligence';

interface NavbarProps {
  activeTab: NavTabType;
  onChangeTab: (tab: NavTabType) => void;
  streamCount: number;
  virtualCount: number;
  radarCount?: number;
  liveServerCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onChangeTab,
  streamCount,
  virtualCount,
  radarCount = 0,
  liveServerCount = 0
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#0d121f]/95 backdrop-blur-md px-2 py-2 shadow-2xl dir-rtl">
      <div className="max-w-2xl mx-auto flex items-center justify-around gap-1">
        
        {/* Home / Streams Grid Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('home')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'home'
              ? 'text-rose-600 dark:text-rose-500 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Tv2 className="w-5 h-5" />
            {streamCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                {streamCount}
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px]">الرئيسية</span>
        </button>

        {/* Generator Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('generator')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'generator'
              ? 'text-rose-600 dark:text-rose-500 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Wand2 className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px]">المولد</span>
        </button>

        {/* Live Broadcast Server Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('live_server')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'live_server'
              ? 'text-rose-600 dark:text-rose-500 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Server className="w-5 h-5" />
            {liveServerCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                {liveServerCount}
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px]">سيرفر بث</span>
        </button>

        {/* Bulk Generator Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('bulk_generator')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'bulk_generator'
              ? 'text-indigo-600 dark:text-indigo-400 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px]">توليد جماعي</span>
        </button>

        {/* Virtual Xtream Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('virtual_xtream')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'virtual_xtream'
              ? 'text-amber-500 dark:text-amber-400 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <ShieldCheck className="w-5 h-5" />
            {virtualCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                {virtualCount}
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px]">اكستريم</span>
        </button>

        {/* Intelligence Radar Tab */}
        <button
          type="button"
          onClick={() => onChangeTab('intelligence')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 rounded-2xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'intelligence'
              ? 'text-emerald-500 dark:text-emerald-400 font-black scale-105'
              : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Radar className="w-5 h-5 text-emerald-500" />
            {radarCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-emerald-500 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                {radarCount}
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px]">استخبارات</span>
        </button>

      </div>
    </nav>
  );
};

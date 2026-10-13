'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { 
  Compass, 
  ArrowRightLeft, 
  Calendar, 
  Wallet, 
  BookOpen, 
  Menu,
  Sun,
  Moon,
  LogOut,
  ShieldAlert
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Profile, Wallet as WalletType } from '@/types';
import { isUserAdmin } from '@/lib/roles';

interface NavbarProps {
  currentUser: Profile;
  wallet: WalletType;
  activeTab: 'matches' | 'sessions' | 'chat' | 'admin';
  setActiveTab: (tab: 'matches' | 'sessions' | 'chat' | 'admin') => void;
  onOpenWallet: () => void;
  onOpenOnboarding?: () => void;
  onOpenProfile?: () => void;
  onOpenEditSkills: () => void;
  onSignOut?: () => void;
  pendingOffersCount: number;
  children?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  wallet,
  activeTab,
  setActiveTab,
  onOpenWallet,
  onOpenProfile,
  onSignOut,
  pendingOffersCount,
  children,
}) => {
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'matches': return 'Discover';
      case 'sessions': return 'Sessions';
      case 'chat': return 'My swaps';
      case 'admin': return 'Admin Panel';
      default: return 'Discover';
    }
  };

  const navItems = [
    { id: 'matches', label: 'Discover', icon: Compass },
    { id: 'chat', label: 'My swaps', icon: ArrowRightLeft },
    { id: 'sessions', label: 'Sessions', icon: Calendar },
  ];

  return (
    <div className="flex h-screen bg-[var(--color-bg)] overflow-hidden font-sans">
      
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-64 md:w-[220px] lg:w-[240px] xl:w-[260px] 
        bg-[var(--color-surface)] border-r border-[var(--color-border)]
        flex flex-col transform transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo Tile */}
        <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)] shrink-0">
          <button onClick={() => { setActiveTab('matches'); setMobileMenuOpen(false); }} className="flex items-center gap-3 cursor-pointer">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white shadow-sm">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="font-display font-semibold text-lg text-[var(--color-text)] tracking-tight">
              SkillSwap<span className="text-[var(--color-accent)]">.</span>
            </div>
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-6">
          <div>
            <div className="px-2 text-[10px] font-bold tracking-widest text-[var(--color-text-muted)] uppercase mb-3">
              Your Learning Space
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as 'matches' | 'sessions' | 'chat' | 'admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer
                      ${isActive 
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' 
                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'}
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.id === 'chat' && pendingOffersCount > 0 && (
                      <span className="ml-auto bg-[var(--color-accent)] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {pendingOffersCount}
                      </span>
                    )}
                  </button>
                );
              })}
              
              {/* Wallet Trigger */}
              <button
                onClick={() => {
                  onOpenWallet();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
              >
                <Wallet className="h-4 w-4" />
                <span>Wallet</span>
              </button>
            </nav>
          </div>

          {isUserAdmin(currentUser) && (
            <div>
              <div className="px-2 text-[10px] font-bold tracking-widest text-[var(--color-text-muted)] uppercase mb-3">
                System
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setMobileMenuOpen(false);
                  }}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer
                    ${activeTab === 'admin' 
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' 
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'}
                  `}
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span>Arbitration Panel</span>
                </button>
                <a
                  href="/admin/users"
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
                >
                  <span>↗ Full Admin Suite (Users & Audit)</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Bottom */}
        <div className="p-4 border-t border-[var(--color-border)] shrink-0">
          <div className="px-2 pb-4">
            <BookOpen className="h-5 w-5 text-[var(--color-accent)] mb-2" />
            <div className="text-sm font-bold leading-tight mb-1">
              A little learning.<br/>A lot of possibility.
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Your next chapter starts with a swap.
            </div>
          </div>
          
          <div className="h-px bg-[var(--color-border)] my-2" />

          <div className="flex items-center justify-between px-2 pt-2">
            <button 
              onClick={onOpenProfile}
              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity cursor-pointer overflow-hidden"
            >
              <Image
                src={currentUser.avatarUrl || '/avatars/avatar_6.jpg'}
                alt={currentUser.fullName}
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-full object-cover shrink-0 border border-[var(--color-border)]"
              />
              <div className="truncate">
                <div className="text-sm font-bold truncate">{currentUser.fullName}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Lifelong learner</div>
              </div>
            </button>
            
            {onSignOut && (
              <button 
                onClick={onSignOut}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Topbar */}
        <header className="h-16 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 -ml-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm">
              <span className="text-[var(--color-text-muted)]">My workspace <span className="mx-1 text-[var(--color-border)]">/</span></span>
              <span className="font-semibold text-[var(--color-text)]">{getBreadcrumb()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={onOpenWallet}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold text-xs hover:bg-[var(--color-accent)] hover:text-white transition-colors cursor-pointer border border-[var(--color-accent)]/20 shadow-xs"
              title="Open wallet"
              aria-label={`Open wallet with ${Math.floor(wallet.availablePaise / 100)} skill points available`}
            >
              <span className="rounded-sm border border-current/35 px-1 py-px font-mono text-[9px] font-extrabold leading-none tracking-tight">SP</span>
              <span>{Math.floor(wallet.availablePaise / 100)} SP</span>
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <Sun className="h-4 w-4 hidden dark:block" />
              <Moon className="h-4 w-4 block dark:hidden" />
            </button>

            <button 
              onClick={onOpenProfile}
              className="h-8 w-8 rounded-full overflow-hidden border border-[var(--color-border)] cursor-pointer hover:ring-2 ring-[var(--color-accent)] transition-all"
            >
              <Image
                src={currentUser.avatarUrl || '/avatars/avatar_7.jpg'}
                alt={currentUser.fullName}
                width={32}
                height={32}
                unoptimized
                className="h-full w-full object-cover"
              />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
          {children}
        </main>
      </div>
    </div>
  );
};

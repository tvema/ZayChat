'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  MoreVertical, 
  Info, 
  Move, 
  UserPlus, 
  Eraser, 
  UserMinus,
  X,
  Bell,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../LanguageProvider';

interface ContactMenuProps {
  onInfo?: () => void;
  onMove?: () => void;
  onAddGroup?: () => void;
  onClearChat?: () => void;
  onDelete?: () => void;
  onSetReminder?: () => void;
  onShareContacts?: () => void;
  onLeaveGroup?: () => void;
  isGroup?: boolean;
  align?: 'start' | 'end';
  className?: string;
  trigger?: React.ReactNode;
}

export function ContactMenu({
  onInfo,
  onMove,
  onAddGroup,
  onClearChat,
  onDelete,
  onSetReminder,
  onShareContacts,
  onLeaveGroup,
  isGroup = false,
  align = 'end',
  className = '',
  trigger
}: ContactMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      
      // Calculate position
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const menuHeight = 220; // Approximate max height of the menu
        
        let newPosition: 'bottom' | 'top' = 'bottom';
        let top = rect.bottom;
        
        if (rect.bottom + menuHeight > window.innerHeight) {
          newPosition = 'top';
          top = rect.top; // We will translate-y -100% in the style
        }
        
        const menuWidth = 200;
        let leftEdge = align === 'end' ? rect.right - menuWidth : rect.left;
        
        // Prevent going off screen right
        if (leftEdge + menuWidth > window.innerWidth) {
          leftEdge = window.innerWidth - menuWidth - 8;
        }
        // Prevent going off screen left
        if (leftEdge < 8) {
          leftEdge = 8;
        }
        
        setPosition(newPosition);
        setCoords({
          top: top,
          left: leftEdge
        });
      }
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, align]);

  const menuItems = [
    { icon: Info, label: isGroup ? (t.chat.groupInfo || 'Информация о группе') : t.chat.contactInfo, onClick: onInfo, color: 'text-neutral-600 dark:text-neutral-400' },
    { icon: Bell, label: t('modals.setReminder') || 'Установить напоминание', onClick: onSetReminder, color: 'text-indigo-600 dark:text-indigo-400' },
    { icon: Share2, label: 'Поделиться контактами', onClick: onShareContacts, color: 'text-blue-600 dark:text-blue-400' },
    { icon: Move, label: t.chat.moveToCircle, onClick: onMove, color: 'text-neutral-600 dark:text-neutral-400' },
    { icon: UserPlus, label: t.chat.addToGroup, onClick: onAddGroup, color: 'text-neutral-600 dark:text-neutral-400' },
    { icon: Eraser, label: t.chat.clearChat, onClick: onClearChat, color: 'text-amber-600 dark:text-amber-400' },
    { icon: UserMinus, label: t.chat.deleteContact, onClick: onDelete, color: 'text-red-600 dark:text-red-400' },
    { icon: UserMinus, label: t.chat.leaveGroup || 'Покинуть группу', onClick: onLeaveGroup, color: 'text-red-600 dark:text-red-400' },
  ].filter(item => item.onClick !== undefined);

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? "calc(-100% + 10px)" : -10 }}
          animate={{ opacity: 1, scale: 1, y: position === 'top' ? "-100%" : 0 }}
          exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? "calc(-100% + 10px)" : -10 }}
          transition={{ duration: 0.1 }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 9999
          }}
          className="min-w-[200px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            {menuItems.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-left"
              >
                <item.icon className={`w-4 h-4 ${item.color}`} />
                <span className="text-neutral-700 dark:text-neutral-200 font-medium">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
        {trigger || (
          <button className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        )}
      </div>
      {typeof document !== 'undefined' && createPortal(menuContent, document.body)}
    </div>
  );
}

import { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { AddSharedContactsModal } from '@/components/AddSharedContactsModal';
import { User } from '@/types/chat';

interface ContactsShareViewerProps {
  contacts: Partial<User>[];
  isSender?: boolean;
  userContacts?: User[];
}

export function ContactsShareViewer({ contacts, isSender = false, userContacts = [] }: ContactsShareViewerProps) {
  const [showModal, setShowModal] = useState(false);

  if (!contacts || contacts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center shrink-0">
          <Users size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold">Поделились контактами</p>
          <p className="text-xs opacity-80">
            {contacts.length} {
              contacts.length % 10 === 1 && contacts.length % 100 !== 11 ? 'контакт' : 
              (contacts.length % 10 >= 2 && contacts.length % 10 <= 4 && (contacts.length % 100 < 10 || contacts.length % 100 >= 20) ? 'контакта' : 'контактов')
            }
          </p>
        </div>
      </div>
      
      <div className="flex -space-x-2 overflow-hidden py-1">
        {contacts.slice(0, 5).map((contact, i) => (
          <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-neutral-900 overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex shrink-0 items-center justify-center text-[10px] font-bold text-neutral-600 dark:text-neutral-300"
               style={contact.avatar_url ? { backgroundImage: `url(${contact.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
            {!contact.avatar_url && (contact.first_name?.[0] || contact.username?.[0] || '?').toUpperCase()}
          </div>
        ))}
        {contacts.length > 5 && (
          <div className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-neutral-900 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-400 z-10 shrink-0">
            +{contacts.length - 5}
          </div>
        )}
      </div>

      {!isSender && (
        <button
          onClick={() => setShowModal(true)}
          className="mt-2 w-full py-1.5 px-3 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus size={16} />
          <span>Посмотреть и Добавить</span>
        </button>
      )}

      {showModal && (
        <AddSharedContactsModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          contacts={contacts as User[]}
          userContacts={userContacts}
        />
      )}
    </div>
  );
}

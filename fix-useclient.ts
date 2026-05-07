import fs from 'fs';

function fixFile(file: string) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.startsWith("import { safeLocalStorage } from '@/lib/safeStorage';\n'use client';")) {
    content = content.replace(
      "import { safeLocalStorage } from '@/lib/safeStorage';\n'use client';",
      "'use client';\nimport { safeLocalStorage } from '@/lib/safeStorage';"
    );
    fs.writeFileSync(file, content);
  }
}

fixFile('./components/AddMemberModal.tsx');
fixFile('./components/FileAttachment.tsx');
fixFile('./components/LanguageProvider.tsx');
fixFile('./components/ProfileModal.tsx');
fixFile('./components/chat/MessageInput.tsx');
fixFile('./app/login/page.tsx');
fixFile('./app/register/page.tsx');
fixFile('./app/verify-email/page.tsx');
fixFile('./hooks/useChat.ts');
fixFile('./components/chat/ReminderModal.tsx');

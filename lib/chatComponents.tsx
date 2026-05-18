'use client';

import React from 'react';
import Image from 'next/image';

export const CUSTOM_EMOJIS = [
  "абсолютно нет",
  "в аэропорт",
  "вкуснотеево",
  "для папы",
  "злюся",
  "касата",
  "лакомлюсь",
  "обидев",
  "обнимашки",
  "от всего сердечка",
  "очередные ограничения",
  "пасиба",
  "пис",
  "после получки",
  "празднуем",
  "смущаюс",
  "спю",
  "хай",
  "шокирован",
  "эврика"
];

export const renderMessageText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 text-blue-500 [word-break:break-all]">{part}</a>;
    }
    
    const emojiRegex = /:([^:\n]+):/g;
    const textParts = part.split(emojiRegex);
    
    if (textParts.length === 1) return part;
    
    return (
      <React.Fragment key={i}>
        {textParts.map((t, j) => {
          if (j % 2 === 1) {
            if (CUSTOM_EMOJIS.includes(t)) {
              return (
                 <Image 
                   key={j} 
                   src={`/эмодзи зайчат/${t}.png`} 
                   alt={t} 
                   title={t}
                   width={48} 
                   height={48} 
                   className="inline-block align-middle mx-1 my-0.5 object-contain max-w-full"
                   unoptimized
                 />
              );
            }
            return `:${t}:`;
          }
          return t;
        })}
      </React.Fragment>
    );
  });
};

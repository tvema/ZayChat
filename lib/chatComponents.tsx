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

export const CustomEmojiPreloader = () => {
  return (
    <>
      {CUSTOM_EMOJIS.map(name => (
        <link key={name} rel="preload" as="image" href={`/эмодзи зайчат/${name}.png`} fetchPriority="high" />
      ))}
    </>
  );
};

export const renderMessageText = (text: string, largeEmoji?: boolean) => {
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
              const size = largeEmoji ? 120 : 28;
              return (
                 <Image 
                   key={j} 
                   src={`/эмодзи зайчат/${t}.png`} 
                   alt={t} 
                   title={t}
                   width={size} 
                   height={size} 
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

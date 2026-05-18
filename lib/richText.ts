export const extractTextFromHTML = (html: string): string => {
   if (typeof window === 'undefined') return html;
   const parser = new DOMParser();
   const doc = parser.parseFromString(html, 'text/html');
   
   const extract = (node: Node): string => {
      let text = '';
      for (let i = 0; i < node.childNodes.length; i++) {
         const child = node.childNodes[i];
         if (child.nodeType === Node.TEXT_NODE) {
             text += child.nodeValue || '';
         } else if (child.nodeName === 'IMG') {
             text += `:${(child as HTMLImageElement).alt}:`;
         } else if (child.nodeName === 'DIV' || child.nodeName === 'P') {
             const t = extract(child);
             text += (text.length > 0 || (child as Element).previousSibling ? '\n' : '') + t;
         } else if (child.nodeName === 'BR') {
             text += '\n';
         } else {
             text += extract(child);
         }
      }
      return text;
   };
   
   let res = extract(doc.body);
   res = res.replace(/\u00A0/g, ' ');
   return res.replace(/\n$/, '');
};

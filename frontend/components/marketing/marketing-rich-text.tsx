'use client';

import { cn } from '@/lib/utils';

export const richTags = {
  hl: (chunks: React.ReactNode) => (
    <span className="font-bold bg-gradient-to-r from-[#FD6203] via-[#FD8018] to-[#DF3C01] bg-clip-text text-transparent">
      {chunks}
    </span>
  ),
  b: (chunks: React.ReactNode) => (
    <strong className="font-bold text-foreground">{chunks}</strong>
  ),
};

const hlClass = 'font-semibold text-[#FD6203] bg-[#FD6203]/10 px-1.5 py-0.5 rounded-md';

export function RichInline({
  text,
  className,
  variant = 'body',
}: {
  text: string;
  className?: string;
  variant?: 'body' | 'hero';
}) {
  const parts: React.ReactNode[] = [];
  const re = /<(hl|b)>(.*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      m[1] === 'hl' ? (
        variant === 'hero' ? (
          <span key={key++} className="font-bold bg-gradient-to-r from-[#FD6203] via-[#FD8018] to-[#DF3C01] bg-clip-text text-transparent">
            {m[2]}
          </span>
        ) : (
          <span key={key++} className={hlClass}>{m[2]}</span>
        )
      ) : (
        <strong key={key++} className="font-bold text-foreground">{m[2]}</strong>
      )
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

export function RichParagraph({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p className={cn('text-muted-foreground leading-relaxed', className)}>
      <RichInline text={text} />
    </p>
  );
}

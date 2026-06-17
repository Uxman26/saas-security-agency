'use client';

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
  title: string;
  desc: string;
  icon: LucideIcon;
  onGenerate: () => void;
};

export function ReportCard({ title, desc, icon: Icon, onGenerate }: Props) {
  return (
    <Card className="border border-border/80 shadow-sm hover:border-primary/30 hover:shadow-md transition-all">
      <CardContent className="p-5 flex gap-4 h-full">
        <div className="rounded-xl bg-primary/10 p-3 h-fit shrink-0">
          <Icon className="size-6 text-primary" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight">{title}</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed flex-1">{desc}</p>
          <button
            type="button"
            onClick={onGenerate}
            className="text-sm font-medium text-primary mt-4 text-left hover:underline w-fit"
          >
            Generate new report
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

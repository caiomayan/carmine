'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/animate-ui/components/radix/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/animate-ui/components/radix/sheet';
import { Switch } from '@/components/animate-ui/components/radix/switch';
import { CheckIcon } from '@/components/icons/animated/check';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LiveCount } from '@/components/live-count';
import { SectionTitle } from '@/components/section-title';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';

export type GalleryLabels = {
  close: string;
  buttons: { title: string; primary: string; ghost: string; quiet: string; disabled: string };
  switch: { title: string; label: string };
  menu: { title: string; open: string; heading: string; items: string[] };
  dialog: { title: string; open: string; heading: string; body: string; confirm: string };
  sheet: { title: string; open: string; heading: string; body: string };
  counter: { title: string; add: string; label: string };
  status: { title: string; online: string; warn: string; danger: string; offline: string };
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-xl bg-surface p-5">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

/** Vitrine interna dos componentes animados nos tokens Liberty (verificação visual e E2E). */
export function ComponentGallery({ labels }: { labels: GalleryLabels }) {
  const [on, setOn] = useState(true);
  const [count, setCount] = useState(2431);

  return (
    <div className="grid gap-4 pb-16 md:grid-cols-2">
      <Block title={labels.buttons.title}>
        <Button>
          <AnimatedIcon icon={CheckIcon} size={16} />
          {labels.buttons.primary}
        </Button>
        <Button variant="ghost">{labels.buttons.ghost}</Button>
        <Button variant="quiet">{labels.buttons.quiet}</Button>
        <Button disabled>{labels.buttons.disabled}</Button>
      </Block>

      <Block title={labels.switch.title}>
        <span className="inline-flex min-h-(--tap) items-center gap-3 text-sm">
          <Switch id="galeria-vagas" checked={on} onCheckedChange={setOn} />
          <label htmlFor="galeria-vagas">{labels.switch.label}</label>
        </span>
      </Block>

      <Block title={labels.menu.title}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">{labels.menu.open}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuLabel>{labels.menu.heading}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {labels.menu.items.map((item) => (
              <DropdownMenuItem key={item}>{item}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Block>

      <Block title={labels.dialog.title}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost">{labels.dialog.open}</Button>
          </DialogTrigger>
          <DialogContent closeLabel={labels.close}>
            <DialogHeader>
              <DialogTitle>{labels.dialog.heading}</DialogTitle>
              <DialogDescription>{labels.dialog.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{labels.close}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>{labels.dialog.confirm}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost">{labels.sheet.open}</Button>
          </SheetTrigger>
          <SheetContent closeLabel={labels.close}>
            <SheetHeader className="p-6">
              <SheetTitle>{labels.sheet.heading}</SheetTitle>
              <SheetDescription>{labels.sheet.body}</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Block>

      <Block title={labels.counter.title}>
        <span className="text-lg">
          <LiveCount value={count} className="font-semibold" /> {labels.counter.label}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCount((c) => c + 17)}>
          {labels.counter.add}
        </Button>
      </Block>

      <Block title={labels.status.title}>
        {(['online', 'warn', 'danger', 'offline'] as const).map((tone) => (
          <span key={tone} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <StatusDot tone={tone} pulse={tone === 'online'} />
            {labels.status[tone]}
          </span>
        ))}
      </Block>
    </div>
  );
}

import * as RadixDialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <RadixDialog.Content
          className={clsx('fixed left-1/2 top-1/2 z-50 max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl flex flex-col', wide ? 'w-[880px]' : 'w-[480px]')}
        >
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
              {description ? <RadixDialog.Description className="mt-0.5 text-xs text-muted">{description}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" aria-label="Close">
              <X size={16} />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

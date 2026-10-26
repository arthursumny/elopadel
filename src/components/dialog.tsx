'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getFocusableElements, nextFocusIndex } from '@/lib/dialog-focus';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl';
type DialogRole = 'dialog' | 'alertdialog';

let openDialogCount = 0;
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';
const dialogStack: string[] = [];

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (openDialogCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  openDialogCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.paddingRight = savedBodyPaddingRight;
  }
}

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'lg',
  role = 'dialog',
  closeLabel = 'Fechar',
  closeOnBackdrop = true,
  initialFocusRef,
  bodyClassName = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  role?: DialogRole;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  bodyClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTimer = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const instanceId = useId();
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (restoreFocusTimer.current !== null) {
      window.clearTimeout(restoreFocusTimer.current);
      restoreFocusTimer.current = null;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(instanceId);
    lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const explicit = initialFocusRef?.current;
      const field = panel.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea');
      const initial = explicit
        ?? panel.querySelector<HTMLElement>('[data-autofocus]')
        ?? field
        ?? getFocusableElements(panel)[0]
        ?? panel;
      initial.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== instanceId) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
      const nextIndex = nextFocusIndex(currentIndex, focusables.length, event.shiftKey);
      if (nextIndex >= 0) {
        event.preventDefault();
        focusables[nextIndex]?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = dialogStack.lastIndexOf(instanceId);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      unlockBodyScroll();
      const openerWasInDialog = Boolean(opener?.closest('[role="dialog"],[role="alertdialog"]'));
      restoreFocusTimer.current = window.setTimeout(() => {
        if (opener && document.contains(opener) && (dialogStack.length === 0 || openerWasInDialog)) opener.focus();
        restoreFocusTimer.current = null;
      }, 0);
    };
  }, [open, instanceId, initialFocusRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`glass my-auto flex max-h-[calc(100dvh-3rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-3xl shadow-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-8">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="mt-2 text-2xl font-black tracking-[-.04em]">{title}</h2>
            {description && <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-soft">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label={closeLabel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.06] text-white/60 transition hover:text-white"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {children ? <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-6 sm:px-8 sm:pb-8 ${bodyClassName}`}>
          {children}
        </div> : null}

        {footer && <div className="shrink-0 border-t border-white/[.07] px-5 py-4 sm:px-8">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  loading = false,
  tone = 'coral',
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  tone?: 'coral' | 'lime' | 'cyan';
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const toneClasses = {
    coral: 'bg-coral/10 text-coral hover:bg-coral/20 border-coral/25',
    lime: 'bg-lime/10 text-lime hover:bg-lime/20 border-lime/25',
    cyan: 'bg-cyan/10 text-cyan hover:bg-cyan/20 border-cyan/25',
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onCancel();
      }}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      closeLabel="Fechar confirmação"
      closeOnBackdrop={false}
      initialFocusRef={cancelRef}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            data-autofocus
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-white/[.12] px-4 py-3 text-xs font-bold text-white/75 transition hover:text-white disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className={`rounded-xl border px-4 py-3 text-xs font-black transition disabled:opacity-50 ${toneClasses[tone]}`}
          >
            {loading ? 'Confirmando...' : confirmLabel}
          </button>
        </div>
      }
    >
      {children}
    </Dialog>
  );
}

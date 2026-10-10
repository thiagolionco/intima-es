"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;

  // Só depende de `open`: se dependesse de onClose (recriada a cada render do pai), o foco
  // voltaria para o painel a cada digitação dentro do modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", onKey);
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      anterior?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div ref={painel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-lg animate-slide-in rounded-2xl bg-white shadow-xl outline-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Excluir",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="text-sm text-slate-600">{description}</div>
      </div>
    </Modal>
  );
}

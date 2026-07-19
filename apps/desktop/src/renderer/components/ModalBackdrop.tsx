import type { ReactNode } from "react";

/**
 * Dialog backdrop. Click-away/keyboard dismissal comes from a real full-size
 * <button> layered under the dialog — native focus and activation semantics
 * instead of a role="button" div. The dialog renders above it, so clicks
 * inside the dialog never reach the hit target.
 */
export function ModalBackdrop({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <button type="button" className="modal-backdrop-hit" aria-label={label} onClick={onClose} />
      {children}
    </div>
  );
}

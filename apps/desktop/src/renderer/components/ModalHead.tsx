import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Sticky dialog header row: title, optional extra actions, close button. */
export function ModalHead({ title, onClose, children }: { title: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="modal-head">
      <span className="modal-title">{title}</span>
      <div className="modal-head-actions">
        {children}
        <button className="btn btn-ghost btn-icon" type="button" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

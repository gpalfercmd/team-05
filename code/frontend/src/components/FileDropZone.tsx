// =============================================================================
// Proof of Aid — Team 05 — File picker + drag-and-drop zone, usable with keyboard only
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type ChangeEvent, type DragEvent } from 'react';
import { FilePlusIcon } from './icons';

type FileDropZoneProps = {
  id: string;
  /** Text of the button, also the accessible name of the file input. */
  label: string;
  hint: string;
  multiple?: boolean | undefined;
  accept?: string | undefined;
  disabled?: boolean | undefined;
  onFiles: (files: File[]) => void;
};

// The real <input type="file"> stays in the tab order (visually hidden) and its <label> looks like
// a button, so Tab + Enter/Space opens the picker natively; dropping files is only a shortcut.
export function FileDropZone({ id, label, hint, multiple = false, accept, disabled = false, onFiles }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const allowDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(!disabled);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (!disabled && files.length > 0) {
      onFiles(multiple ? files : files.slice(0, 1));
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared so choosing the same (edited) file again still triggers a new check.
    event.target.value = '';
    onFiles(files);
  };

  return (
    <div
      className="drop-zone"
      data-dragging={dragging}
      onDragEnter={allowDrop}
      onDragOver={allowDrop}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <FilePlusIcon size={24} className="drop-zone__icon" />
      <p className="drop-zone__hint">{hint}</p>
      <input
        id={id}
        type="file"
        className="visually-hidden drop-zone__input"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
      />
      <label htmlFor={id} className="btn btn-secondary drop-zone__button">
        {label}
      </label>
    </div>
  );
}

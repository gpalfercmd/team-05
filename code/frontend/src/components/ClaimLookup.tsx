// =============================================================================
// Proof of Aid — Team 05 — Claim lookup: open any claim's public page by its ID
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { isBytes32 } from '../utils/merkle';
import './ClaimLookup.css';

const FORMAT_HINT = 'A claim ID is 0x followed by 64 hexadecimal characters.';

/** On a real chain there is no list to browse without the indexer, so visitors need a way in by ID. */
export function ClaimLookup() {
  const navigate = useNavigate();
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const claimId = value.trim();
    const valid = isBytes32(claimId);
    setInvalid(!valid);
    if (valid) {
      void navigate(`/claims/${claimId.toLowerCase()}`);
    }
  };

  const form = (
    <form className="claim-lookup" onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="claim-lookup__label">
        Look up a claim by its ID
      </label>
      <div className="claim-lookup__row">
        <input
          id={inputId}
          className="claim-lookup__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={hintId}
        />
        <button type="submit" className="btn btn-secondary">
          Open claim
        </button>
      </div>
      <p id={hintId} className={invalid ? 'claim-lookup__hint claim-lookup__hint--error' : 'claim-lookup__hint'}>
        {invalid ? `That is not a claim ID. ${FORMAT_HINT}` : FORMAT_HINT}
      </p>
    </form>
  );
  return form;
}

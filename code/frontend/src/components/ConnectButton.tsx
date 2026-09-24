// =============================================================================
// Proof of Aid — Team 05 — Connect / disconnect the browser wallet (injected, e.g. MetaMask)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi';
import { isUserRejection } from '../utils/contractErrors';
import { truncateMiddle } from '../utils/format';

function connectErrorMessage(error: Error): string {
  let message = 'The wallet could not connect. Please try again.';
  if (error.name === 'ProviderNotFoundError') {
    message = 'No browser wallet found. Install MetaMask to connect.';
  } else if (isUserRejection(error)) {
    message = 'You cancelled the connection in your wallet.';
  }
  return message;
}

export function ConnectButton() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  // The config registers exactly one connector: the injected wallet.
  const injectedConnector = connectors[0];

  const handleConnect = () => {
    if (injectedConnector !== undefined) {
      connect.mutate({ connector: injectedConnector });
    }
  };

  const view =
    connection.status === 'connected' ? (
      <div className="connect">
        <code className="connect__address" title={connection.address}>
          {truncateMiddle(connection.address)}
        </code>
        <button type="button" className="btn btn-secondary" onClick={() => disconnect.mutate()}>
          Disconnect
        </button>
      </div>
    ) : (
      <div className="connect">
        <button
          type="button"
          className="btn btn-primary"
          disabled={injectedConnector === undefined || connect.isPending}
          onClick={handleConnect}
        >
          {connect.isPending ? 'Confirm in wallet…' : 'Connect wallet'}
        </button>
        {connect.error !== null && (
          <p className="connect__error caption" role="alert">
            {connectErrorMessage(connect.error)}
          </p>
        )}
      </div>
    );
  return view;
}

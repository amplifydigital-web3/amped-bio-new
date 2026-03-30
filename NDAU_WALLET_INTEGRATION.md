# NDAU Wallet Client Integration Guide

This guide provides complete instructions for integrating ndau wallet connection and transaction signing exclusively on the client (frontend) side of your website.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Wallet Connect](#wallet-connect)
- [Signing Transactions](#signing-transactions)
- [Advanced Signing Features](#advanced-signing-features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Implementation](#implementation)
- [Usage Examples](#usage-examples)
- [Common Issues](#common-issues)

## Architecture Overview

The ndau wallet integration uses a 3-party Socket.IO architecture:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Your Site  │         │   Backend   │         │  ndau App   │
│  (Client)   │◄───────►│  Socket.IO  │◄───────►│  Wallet     │
│             │ Socket  │   Router    │ Socket  │  Mobile     │
└─────────────┘         └─────────────┘         └─────────────┘
```

**How it works:**
1. Your site connects to Socket.IO server (already existing)
2. Site displays QR code with socket_id
3. User scans with ndau wallet app
4. App connects to same Socket.IO server
5. Backend routes events between site and app
6. Your site receives wallet address
7. Site can request data/transaction signatures
8. App signs and returns signature

## Prerequisites

- React site (v16.8+ with hooks)
- Access to a Socket.IO server with ndau wallet support
- ndau wallet app installed on mobile device

## Quick Start

### 1. Install dependencies

```bash
npm install socket.io-client qrcode.react zustand axios
```

### 2. Create file structure

```
your-site/
├── src/
│   └── ndau-wallet/
│       ├── api/
│       │   └── api.ts
│       ├── components/
│       │   ├── NdauConnect.tsx
│       │   └── NdauSigner.tsx
│       ├── store/
│       │   └── ndauConnect_store.ts
│       ├── hooks/
│       │   └── useNdauSigner.ts
│       └── types/
│           └── socketTypes.ts
```

### 3. Configure Socket.IO URL

Create `src/ndau-wallet/api/api.ts`:

```typescript
import axios from 'axios';

type methodType = 'get' | 'post' | 'patch' | 'delete';

// Socket.IO server URL (without /api at the end)
const SOCKET_URL = process.env.REACT_APP_NDAU_SOCKET_URL || 'http://localhost:3001';
const baseURL = process.env.REACT_APP_API_ENDPOINT || 'api';

export const axiosRequest = async (method: methodType, url: string, body?: any, params?: any) => {
  const response = await axios({
    method,
    url: `${baseURL}/${url}`,
    data: body,
    params,
  });

  return response;
};

export { baseURL, SOCKET_URL };
```

### 4. Create Zustand Store

Create `src/ndau-wallet/store/ndauConnect_store.ts`:

```typescript
import { socketBase } from "../types/socketTypes";
import create from "zustand";

interface ndauConnectStateI {
  walletAddress: string;
  updateWalletAddress: (_walletAddress: string) => void;

  socket: socketBase | null;
  setSocket: (_socket: any) => void;

  logout: () => void;
}

const useNdauConnectStore = create<ndauConnectStateI>((set) => ({
  walletAddress: "",
  updateWalletAddress: (_walletAddress: string) =>
    set(() => ({ walletAddress: _walletAddress })),

  socket: null,
  setSocket: <T extends socketBase>(_socket: T) =>
    set(() => ({ socket: _socket })),

  logout: () => {
    set(() => ({
      walletAddress: "",
      socket: null,
    }));
  },
}));

export default useNdauConnectStore;
```

### 5. Create Types

Create `src/ndau-wallet/types/socketTypes.ts`:

```typescript
export interface socketBase {
  emit: Function;
  id: string | number;
}

export interface SignRequest {
  data: any;
  message?: string;
  website_socket_id: string;
}

export interface SignResponse {
  signature: string;
  walletAddress: string;
  signedData: any;
}
```

### 6. Create Connection Component

Create `src/ndau-wallet/components/NdauConnect.tsx`:

```typescript
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { io } from "socket.io-client";
import useNdauConnectStore from "../store/ndauConnect_store";
import { SOCKET_URL } from "../api/api";

let socket: any;

export const socketEmit = (event: string, data: any) => {
  if (socket) {
    socket.emit(event, data);
  }
};

interface NdauConnectProps {
  action?: string;
  buttonText?: string;
  connectedText?: (address: string) => string;
}

function NdauConnect(props: NdauConnectProps = {}) {
  const [socketObjectState, setSocketObjectState] = useState<any>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const action = props.action || "login";
  const buttonText = props.buttonText || "Connect Wallet";
  const connectedText = props.connectedText || ((address: string) => `${address.slice(0, 10)}...`);

  const updateWalletAddress = useNdauConnectStore(
    (state) => state.updateWalletAddress
  );
  const walletAddress = useNdauConnectStore((state) => state.walletAddress);
  const setSocket = useNdauConnectStore((state) => state.setSocket);

  const handleClose = () => setIsModalOpen(false);
  const handleShow = () => {
    setIsModalOpen(true);
  };

  useEffect(() => {
    socket = io(SOCKET_URL);

    if (socket) {
      socket.on(
        "server-ndau_connection-established-website",
        async ({ walletAddress: _walletAddress }: { walletAddress: string }) => {
          console.log("Wallet connected:", _walletAddress);
          updateWalletAddress(_walletAddress);
          handleClose();
        }
      );

      socket.emit("website-ndau_connection-established-server", {
        is_login_successful: true,
        website_socket_id: socket.id,
      });

      setSocket(socket);
    }
    setSocketObjectState(socket);
  }, []);

  let qrCodeValue = JSON.stringify({
    website_socket_id: socketObjectState.id,
    website_url: window.location.href,
    website_title: document.title || "Your Site",
    request: "login",
    action,
  });

  return (
    <>
      <button
        onClick={handleShow}
        type="button"
      >
        {walletAddress ? connectedText(walletAddress) : buttonText}
      </button>

      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h2 style={{ margin: 0 }}>Connect with Ndau Wallet</h2>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0 8px'
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '24px 0'
            }}>
              <div style={{
                display: 'inline-block',
                marginBottom: '16px'
              }}>
                <QRCodeSVG value={qrCodeValue} size={218} includeMargin />
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                Scan QR code with ndau wallet app
              </p>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={handleClose}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default NdauConnect;
```

## Wallet Connect

Basic wallet connection allows your site to identify the user's wallet address.

### Basic Implementation

```typescript
import NdauConnect from './ndau-wallet/components/NdauConnect';
import useNdauConnectStore from './ndau-wallet/store/ndauConnect_store';

function Header() {
  const walletAddress = useNdauConnectStore((state) => state.walletAddress);
  const logoutFunction = useNdauConnectStore((state) => state.logout);
  const socket = useNdauConnectStore((state) => state.socket);

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    logoutFunction();
  };

  return (
    <nav>
      <div>
        {walletAddress ? (
          <div>
            <span>{`${walletAddress.slice(0, 10)}...`}</span>
            <button onClick={handleLogout}>Disconnect</button>
          </div>
        ) : (
          <NdauConnect />
        )}
      </div>
    </nav>
  );
}

export default Header;
```

## Signing Transactions

Data/transaction signing allows your site to request users to sign data or transactions using their ndau wallet.

### Signing Hook

Create `src/ndau-wallet/hooks/useNdauSigner.ts`:

```typescript
import { useState, useCallback } from 'react';
import useNdauConnectStore from '../store/ndauConnect_store';
import { socketEmit } from '../components/NdauConnect';
import { SignRequest, SignResponse } from '../types/socketTypes';

export interface UseNdauSignerReturn {
  signData: (data: any, message?: string) => Promise<SignResponse | null>;
  isSigning: boolean;
  error: string | null;
}

export function useNdauSigner(): UseNdauSignerReturn {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socket = useNdauConnectStore((state) => state.socket);
  const walletAddress = useNdauConnectStore((state) => state.walletAddress);

  const signData = useCallback(async (
    data: any,
    message?: string
  ): Promise<SignResponse | null> => {
    if (!socket || !walletAddress) {
      setError("Wallet not connected");
      return null;
    }

    setIsSigning(true);
    setError(null);

    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();

      const handleSignSuccess = (response: SignResponse) => {
        socket.off(`sign-success-${requestId}`, handleSignSuccess);
        socket.off(`sign-error-${requestId}`, handleSignError);
        setIsSigning(false);
        resolve(response);
      };

      const handleSignError = (errorData: { message: string }) => {
        socket.off(`sign-success-${requestId}`, handleSignSuccess);
        socket.off(`sign-error-${requestId}`, handleSignError);
        setIsSigning(false);
        setError(errorData.message || "Signing error");
        reject(new Error(errorData.message || "Signing error"));
      };

      socket.on(`sign-success-${requestId}`, handleSignSuccess);
      socket.on(`sign-error-${requestId}`, handleSignError);

      socketEmit('website-sign-request-server', {
        requestId,
        data,
        message,
        walletAddress,
        website_socket_id: socket.id,
      });

      setTimeout(() => {
        socket.off(`sign-success-${requestId}`, handleSignSuccess);
        socket.off(`sign-error-${requestId}`, handleSignError);
        setIsSigning(false);
        setError("Timeout: signature not completed");
        resolve(null);
      }, 60000);
    });
  }, [socket, walletAddress]);

  return { signData, isSigning, error };
}

export default useNdauSigner;
```

### Signing Component

Create `src/ndau-wallet/components/NdauSigner.tsx`:

```typescript
import React from 'react';
import { useNdauSigner } from '../hooks/useNdauSigner';

interface NdauSignerProps {
  data: any;
  message?: string;
  onSigned: (signature: string) => void;
  onError?: (error: string) => void;
  children?: React.ReactNode;
}

function NdauSigner({ data, message, onSigned, onError, children }: NdauSignerProps) {
  const { signData, isSigning, error } = useNdauSigner();

  const handleSign = async () => {
    try {
      const result = await signData(data, message);
      if (result) {
        onSigned(result.signature);
      }
    } catch (err) {
      onError?.(error || "Error signing");
    }
  };

  return (
    <div>
      <button
        onClick={handleSign}
        disabled={isSigning}
        style={{
          opacity: isSigning ? 0.6 : 1,
          cursor: isSigning ? 'not-allowed' : 'pointer'
        }}
      >
        {isSigning ? 'Signing...' : children || 'Sign'}
      </button>
      {error && (
        <div style={{ color: 'red', marginTop: '8px' }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default NdauSigner;
```

## Advanced Signing Features

### Vote Transaction Signing

```typescript
import { useNdauSigner } from './ndau-wallet/hooks/useNdauSigner';

function VoteButton({ proposalId, votingOptionId }) {
  const { signData, isSigning, error } = useNdauSigner();

  const handleVote = async () => {
    const voteData = {
      proposal_id: proposalId,
      voting_option_id: votingOptionId,
      timestamp: Date.now(),
    };

    const result = await signData(voteData, "Confirm vote");

    if (result) {
      await fetch('/api/votes', {
        method: 'POST',
        body: JSON.stringify({
          ballot: result.signedData,
          signature: result.signature,
          walletAddress: result.walletAddress,
        }),
      });

      console.log("Vote registered successfully!");
    }
  };

  return (
    <div>
      <button onClick={handleVote} disabled={isSigning}>
        {isSigning ? 'Confirm in app...' : 'Vote'}
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
```

### Generic Message Signing

```typescript
import NdauSigner from './ndau-wallet/components/NdauSigner';

function MessageSignature() {
  const handleMessageSigned = (signature: string) => {
    console.log("Signature:", signature);
  };

  const messageToSign = "This is an important message to sign";

  return (
    <div>
      <h3>Sign Message</h3>
      <p>{messageToSign}</p>
      <NdauSigner
        data={{ message: messageToSign }}
        message="Do you want to sign this message?"
        onSigned={handleMessageSigned}
      >
        Sign Message
      </NdauSigner>
    </div>
  );
}
```

### Transfer Transaction Signing

```typescript
import { useNdauSigner } from './ndau-wallet/hooks/useNdauSigner';

function TransferForm() {
  const { signData, isSigning } = useNdauSigner();

  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  const handleTransfer = async () => {
    const transferData = {
      amount: parseInt(amount),
      recipient,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(7),
    };

    const result = await signData(
      transferData,
      `Transfer ${amount} ndau to ${recipient}`
    );

    if (result) {
      console.log("Transaction signed:", result);

      await fetch('/api/transactions/broadcast', {
        method: 'POST',
        body: JSON.stringify(result),
      });
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleTransfer(); }}>
      <div>
        <label>Amount (ndau): </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <label>Recipient: </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
      </div>
      <button type="submit" disabled={isSigning}>
        {isSigning ? 'Confirm in app...' : 'Transfer'}
      </button>
    </form>
  );
}
```

### Proposal Signing

```typescript
import { useNdauSigner } from './ndau-wallet/hooks/useNdauSigner';

function ProposalApproval({ proposalId, title }) {
  const { signData, isSigning } = useNdauSigner();

  const handleApprove = async () => {
    const proposalData = {
      proposal_id: proposalId,
      action: 'approve',
      timestamp: Date.now(),
    };

    const result = await signData(
      proposalData,
      `Approve proposal: ${title}`
    );

    if (result) {
      console.log("Proposal approved:", result);

      await fetch('/api/proposals/approve', {
        method: 'POST',
        body: JSON.stringify({
          proposalId,
          signature: result.signature,
          walletAddress: result.walletAddress,
        }),
      });
    }
  };

  return (
    <button onClick={handleApprove} disabled={isSigning}>
      {isSigning ? 'Confirm in app...' : 'Approve Proposal'}
    </button>
  );
}
```

## Installation

### Required dependencies

```bash
npm install socket.io-client qrcode.react zustand axios
```

### Optional dependencies

If you want to use toast notifications:

```bash
npm install react-toastify
```

## Configuration

### Environment variables

```bash
REACT_APP_NDAU_SOCKET_URL=http://localhost:3001
REACT_APP_API_ENDPOINT=api
```

## Implementation

### Complete client structure

```
src/
└── ndau-wallet/
    ├── api/
    │   └── api.ts
    ├── components/
    │   ├── NdauConnect.tsx
    │   └── NdauSigner.tsx
    ├── hooks/
    │   └── useNdauSigner.ts
    ├── store/
    │   └── ndauConnect_store.ts
    └── types/
        └── socketTypes.ts
```

## Usage Examples

### Complete Example: Voting with Signing

```typescript
import React, { useState } from 'react';
import NdauConnect from './ndau-wallet/components/NdauConnect';
import { useNdauSigner } from './ndau-wallet/hooks/useNdauSigner';
import useNdauConnectStore from './ndau-wallet/store/ndauConnect_store';

function ProposalVoting({ proposal }) {
  const walletAddress = useNdauConnectStore((state) => state.walletAddress);
  const { signData, isSigning } = useNdauSigner();
  const [hasVoted, setHasVoted] = useState(false);

  const handleVote = async (votingOptionId: string) => {
    const voteData = {
      proposal_id: proposal.id,
      voting_option_id: votingOptionId,
      timestamp: Date.now(),
    };

    const result = await signData(
      voteData,
      `Vote on "${proposal.title}" with option "${votingOptionId}"`
    );

    if (result) {
      console.log("Vote signed:", result);

      await fetch('/api/votes', {
        method: 'POST',
        body: JSON.stringify({
          ballot: result.signedData,
          signature: result.signature,
          walletAddress: result.walletAddress,
        }),
      });

      setHasVoted(true);
    }
  };

  if (!walletAddress) {
    return (
      <div>
        <p>Connect your wallet to vote</p>
        <NdauConnect />
      </div>
    );
  }

  if (hasVoted) {
    return <div>Vote registered successfully!</div>;
  }

  return (
    <div>
      <h2>{proposal.title}</h2>
      <p>{proposal.description}</p>
      <div>
        <h3>Voting Options:</h3>
        {proposal.votingOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => handleVote(option.id)}
            disabled={isSigning}
            style={{
              display: 'block',
              marginBottom: '8px',
              padding: '8px 16px',
              opacity: isSigning ? 0.6 : 1,
              cursor: isSigning ? 'not-allowed' : 'pointer'
            }}
          >
            {option.title} {isSigning ? '(Confirm in app...)' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProposalVoting;
```

### Example: Dashboard with Wallet Connect

```typescript
import React from 'react';
import NdauConnect from './ndau-wallet/components/NdauConnect';
import useNdauConnectStore from './ndau-wallet/store/ndauConnect_store';

function Dashboard() {
  const walletAddress = useNdauConnectStore((state) => state.walletAddress);

  return (
    <div>
      <header>
        <h1>My Site</h1>
        <NdauConnect />
      </header>

      <main>
        {walletAddress ? (
          <div>
            <h2>Welcome!</h2>
            <p>Wallet connected: {walletAddress}</p>
          </div>
        ) : (
          <div>
            <p>Connect your wallet to access features</p>
            <NdauConnect />
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
```

## Common Issues

### Socket connection failed

**Problem**: Cannot connect to Socket.IO server

**Solutions**:
1. Check if `SOCKET_URL` is correct (without `/api` at the end)
2. Check if backend is running
3. Check if backend allows CORS from your domain
4. Use browser console to see connection errors

### QR Code not working

**Problem**: Wallet app doesn't connect after scanning

**Solutions**:
1. Check if `socketObjectState.id` is being set
2. Check if QR code contains valid JSON
3. Check if wallet app can reach Socket.IO server
4. Check backend logs to see if it received app connection

### walletAddress not updating

**Problem**: Store doesn't receive wallet address

**Solutions**:
1. Check if `server-ndau_connection-established-website` event is received
2. Check console logs to see if backend is sending event
3. Check if socket is connected correctly

### TypeScript errors

**Problem**: Type errors when implementing

**Solutions**:
1. Check if you installed types for your dependencies
2. If using @types/qrcode.react, install with `npm install @types/qrcode.react`

### Signing timeout

**Problem**: Signature expires after 60 seconds

**Solutions**:
1. Check if wallet app is connected
2. Ask user to confirm faster
3. Increase timeout in `useNdauSigner` hook

### Signing rejected

**Problem**: User rejects signature in app

**Solutions**:
1. Check returned error
2. Show friendly message to user
3. Allow retry

### Socket disconnected during signing

**Problem**: Connection lost

**Solutions**:
1. Implement automatic reconnection with socket.io-client
2. Show message to user to reconnect
3. Ask user to reconnect wallet

## Support

For specific questions:
- **ndau wallet app**: Check official ndau documentation
- **Backend Socket.IO**: Contact your backend administrator
- **Client integration**: Refer to this guide

## License

This client integration code is provided for commercial and educational use.

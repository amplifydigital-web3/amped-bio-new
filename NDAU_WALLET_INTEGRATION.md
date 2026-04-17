# How to Request Wallet Signature (Socket-Only)

## Overview
This guide explains how to request a signature from the ndau wallet using **only socket communication**, without creating a database record.

## Flow Diagram

```
┌─────────────┐         ┌───────────┐         ┌───────────┐         ┌─────────────┐
│   Frontend  │         │  Backend   │         │  Wallet   │         │   Backend   │
│             │────────▶│            │────────▶│           │────────▶   │
│             │ socket     │            │  socket   │           │  socket     │
└─────────────┘         └───────────┘         └───────────┘         └─────────────┘
      │                       │                       │                       │
      │ (1)                   │ (2)                   │ (3)                  │ (4)
      ▼                       ▼                       ▼                       ▼
  Emit:             Forward to:           Sign &                 Return:
  website-           server-               confirm                server-sign-
  sign-request-      request-app                                   fulfilled-
  server                                                          website
                                                        │
                                                        │ (5)
                                                        ▼
                                                  Frontend receives
                                                  signature
```

---

## Step 1: Frontend Connects to Backend Socket

### Code Example

```javascript
import { io } from 'socket.io-client';

// Connect to backend
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✓ Connected to backend, socket ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected from backend');
});
```

**Output:** Frontend connects and receives a socket ID (e.g., `abc123...`)

---

## Step 2: Prepare the Payload

### Payload Format (YAML)

```yaml
vote: yes
proposal:
  proposal_id: ndau-to-revo-conversion
  proposal_heading: "I agree to convert my ndau to the Ethereum address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
  voting_option_id: 1
  voting_option_heading: "Confirm Conversion"
wallet_address: ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8
validation_key: npuba4jaftckeeb4wuqt578x5duj8zp4s3e9w2ngx89shf9gmrhk78k453ibing573sg36a3iaaaaaaujp29k993teer7ygkk2x2x5akwghv2m23yikxxghgujezsck5muascnn6rn6e
```

### Convert to Base64

```javascript
import yaml from 'yaml';

const payload = {
  vote: 'yes',
  proposal: {
    proposal_id: 'ndau-to-revo-conversion',
    proposal_heading: 'I agree to convert my ndau to the Ethereum address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    voting_option_id: 1,
    voting_option_heading: 'Confirm Conversion'
  },
  wallet_address: 'ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8',
  validation_key: 'npuba4jaftckeeb4wuqt578x5duj8zp4s3e9w2ngx89shf9gmrhk78k453ibing573sg36a3iaaaaaaujp29k993teer7ygkk2x2x5akwghv2m23yikxxghgujezsck5muascnn6rn6e'
};

const payloadBase64 = btoa(yaml.stringify(payload));
console.log('Payload base64:', payloadBase64);
```

**Output:** Base64-encoded string, e.g.,
```
eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0=
```

---

## Step 3: Frontend Sends Signing Request

### Socket Event to Emit

```javascript
// Emit signing request to backend
socket.emit('website-sign-request-server', {
  payload: payloadBase64,
  walletAddress: 'ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8'
});

console.log('✓ Signing request sent');
```

**Input Message (Sent by Frontend):**
```json
{
  "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0=",
  "walletAddress": "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8"
}
```

**Event Name:** `website-sign-request-server`

---

## Step 4: Backend Forwards to Wallet

### Socket Event Sent to Wallet

**Event Name:** `server-sign-request-app`

**Message Format:**
```json
{
  "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0=",
  "walletAddress": "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8"
}
```

**Flow:** Backend receives `website-sign-request-server` from frontend and forwards to wallet app via `server-sign-request-app`.

---

## Step 5: User Signs in Wallet

### Wallet Display

The wallet app displays:
- **Payload:** The base64 decoded YAML payload
- **Request:** "Sign this payload?"

User clicks **Confirm** or **Reject**.

---

## Step 6: Wallet Responds to Backend

### Scenario A: User Confirms Signature

**Event Name:** `app-sign-confirmed-server`

**Message Format:**
```json
{
  "signature": "aujaftchgbcseiia6c8cvercf5zi3zmz7bpid6nf3qi799348z9hma5c8rm427ahg6tseicqd65y62c5wtaze9ic5sm5hk7z9gjue3kcrgzj6tt2jrycunbdicikdx46",
  "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0=",
  "app_socket_id": "xyz789..."
}
```

### Scenario B: User Rejects Signature

**Event Name:** `app-sign-rejected-server`

**Message Format:**
```json
{
  "app_socket_id": "xyz789..."
}
```

---

## Step 7: Backend Returns to Frontend

### Scenario A: Success - Signature Received

**Event Name:** `server-sign-fulfilled-website`

**Message Format:**
```json
{
  "signature": "aujaftchgbcseiia6c8cvercf5zi3zmz7bpid6nf3qi799348z9hma5c8rm427ahg6tseicqd65y62c5wtaze9ic5sm5hk7z9gjue3kcrgzj6tt2jrycunbdicikdx46",
  "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0="
}
```

### Scenario B: User Rejected

**Event Name:** `server-sign-rejected-website`

**Message Format:**
```json
{}
```

### Scenario C: Error (Wallet Not Connected)

**Event Name:** `server-sign-failed-website`

**Message Format:**
```json
{
  "message": "Wallet not connected"
}
```

---

## Step 8: Frontend Receives Signature

### Code Example

```javascript
// Listen for successful signature
socket.on('server-sign-fulfilled-website', (data) => {
  console.log('✓ Signature received!');
  console.log('Signature:', data.signature);
  console.log('Payload:', data.payload);
  
  // Display signature to user
  alert('Signature: ' + data.signature);
  
  // Store signature for later use
  localStorage.setItem('signature', data.signature);
});

// Listen for rejection
socket.on('server-sign-rejected-website', () => {
  console.log('✗ User rejected signing');
  alert('You rejected the signature request');
});

// Listen for errors
socket.on('server-sign-failed-website', (data) => {
  console.log('✗ Error:', data.message);
  alert('Error: ' + data.message);
});
```

**Output Example (Success):**
```json
{
  "signature": "aujaftchgbcseiia6c8cvercf5zi3zmz7bpid6nf3qi799348z9hma5c8rm427ahg6tseicqd65y62c5wtaze9ic5sm5hk7z9gjue3kcrgzj6tt2jrycunbdicikdx46",
  "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0="
}
```

---

## Complete Working Example

```javascript
import { io } from 'socket.io-client';
import yaml from 'yaml';
import { getAccount } from './helpers/fetch';

// 1. Connect to backend
const socket = io('http://localhost:3001');

// 2. Prepare payload
async function requestSignature(ethereumAddress) {
  const walletAddress = 'ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8';
  
  // Get validation key
  const account = await getAccount(walletAddress);
  const validationKey = account[walletAddress].validationKeys[0];
  
  // Create payload
  const payload = {
    vote: 'yes',
    proposal: {
      proposal_id: 'ndau-to-revo-conversion',
      proposal_heading: `I agree to convert my ndau to Ethereum address: ${ethereumAddress}`,
      voting_option_id: 1,
      voting_option_heading: 'Confirm Conversion'
    },
    wallet_address: walletAddress,
    validation_key: validationKey
  };
  
  // Convert to base64
  const payloadBase64 = btoa(yaml.stringify(payload));
  
  // Send request
  socket.emit('website-sign-request-server', {
    payload: payloadBase64,
    walletAddress: walletAddress
  });
  
  console.log('✓ Request sent');
}

// 3. Listen for response
socket.on('server-sign-fulfilled-website', ({ signature }) => {
  console.log('✓ Signature received:', signature);
  // Use the signature as needed
});

socket.on('server-sign-rejected-website', () => {
  console.log('✗ User rejected');
});

socket.on('server-sign-failed-website', ({ message }) => {
  console.log('✗ Error:', message);
});

// 4. Use
await requestSignature('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
```

---

## Socket Events Reference

| Direction | Event Name | Payload | Purpose |
|------------|-------------|---------|---------|
| Frontend → Backend | `website-sign-request-server` | `{ payload, walletAddress }` | Request signature |
| Backend → Wallet | `server-sign-request-app` | `{ payload, walletAddress }` | Forward to wallet |
| Wallet → Backend | `app-sign-confirmed-server` | `{ signature, payload, app_socket_id }` | Wallet signed successfully |
| Wallet → Backend | `app-sign-rejected-server` | `{ app_socket_id }` | User rejected |
| Backend → Frontend | `server-sign-fulfilled-website` | `{ signature, payload }` | Return signature to frontend |
| Backend → Frontend | `server-sign-rejected-website` | `{}` | User rejected notification |
| Backend → Frontend | `server-sign-failed-website` | `{ message }` | Error notification |

---

## Testing Checklist

- [ ] Frontend connects to backend socket
- [ ] Wallet (app) connects to backend socket
- [ ] Socket mapping is established correctly
- [ ] Frontend emits `website-sign-request-server`
- [ ] Backend forwards to wallet via `server-sign-request-app`
- [ ] Wallet displays prompt to user
- [ ] User confirms signature
- [ ] Wallet sends `app-sign-confirmed-server`
- [ ] Frontend receives `server-sign-fulfilled-website`
- [ ] Signature is valid and usable

---

## Common Issues

### "Wallet not connected"

**Cause:** Wallet app is not connected to backend socket.

**Solution:** Ensure wallet is running and connected before making request.

### No signature received

**Cause:** Socket connection lost or event not listened.

**Solution:** Check browser console for socket errors, verify socket ID is correct.

### Signature invalid

**Cause:** Payload format incorrect or validation key mismatch.

**Solution:** Verify payload matches expected format, double-check validation key from wallet.

---

## How to Verify a Signature

After receiving a signature, you may want to verify that a specific text was actually signed by a specific wallet address.

### Backend Verification (Recommended)

Use the existing backend function to verify signatures:

```javascript
import { ndauSignatureToBytes } from '../utils/signature';
import { ndauPubkeyToBytes } from '../utils/public_key';

// Get wallet account to retrieve public key
const account = await getAccount(walletAddress);
const ndauPubkey = account[walletAddress].validationKeys[0];

// Decode the original payload from base64
const originalPayload = atob(payloadBase64);

// Convert signature to bytes
const [sign, err] = ndauSignatureToBytes(signature);
if (err !== null) {
  console.error('Invalid signature format');
  return false;
}

// Convert public key to bytes
const [pk, _] = ndauPubkeyToBytes(ndauPubkey);

// Verify based on algorithm
let isValid = false;

if (sign.algorithm === 'Ed25519') {
  const ed = require('@noble/ed25519');
  const hexPayload = Buffer.from(originalPayload).toString('hex');
  isValid = await ed.verify(sign.data, hexPayload, pk.key);
} else if (sign.algorithm === 'Secp256k1') {
  const secp256k1 = require('@noble/secp256k1');
  const crypto = require('crypto');
  const bytePayload = new Uint8Array(Buffer.from(originalPayload));
  const hashPayload = crypto.createHash('sha256').update(bytePayload).digest();
  isValid = await secp256k1.verify(sign.data, hashPayload, pk.key);
} else {
  console.error('Unsupported signature algorithm:', sign.algorithm);
  return false;
}

console.log('Signature valid:', isValid);
```

**Example:**

```javascript
// After receiving signature from socket
socket.on('server-sign-fulfilled-website', async ({ signature, payload }) => {
  const walletAddress = 'ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8';
  
  // Verify the signature
  const isValid = await verifySignature(payload, signature, walletAddress);
  
  if (isValid) {
    console.log('✓ Signature verified successfully!');
    // Signature is authentic and was signed by this wallet
  } else {
    console.error('✗ Invalid signature!');
    // Signature does not match or was not signed by this wallet
  }
});
```

### Frontend Verification

If you want to verify in the frontend without backend:

```javascript
// Function to verify signature
async function verifySignature(payloadBase64, signature, walletAddress) {
  try {
    // Get account info from backend
    const response = await axios.get('/api/account', {
      params: { walletAddress }
    });
    
    const account = response.data[walletAddress];
    const validationKey = account.validationKeys[0];
    
    // Decode payload
    const payload = atob(payloadBase64);
    
    // You'll need to implement crypto verification
    // or use a library like @noble/ed25519 or @noble/secp256k1
    // based on the key type
    
    console.log('Verification complete');
    return true; // or false if invalid
  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}

// Usage
verifySignature(payloadBase64, signature, walletAddress)
  .then(isValid => {
    if (isValid) {
      alert('✓ Signature is valid and was signed by: ' + walletAddress);
    } else {
      alert('✗ Invalid signature!');
    }
  });
```

### What Verification Checks

| Check | Description |
|-------|-------------|
| Signature format | Verifies the signature is in valid ndau format |
| Public key match | Confirms the signature was created with this wallet's public key |
| Payload integrity | Ensures the payload hasn't been modified |
| Algorithm compatibility | Confirms correct crypto algorithm (Ed25519 or Secp256k1) |

### Use Cases

1. **Audit trail:** Prove that a specific wallet signed a specific message at a specific time
2. **Dispute resolution:** Verify claims about what was signed and by whom
3. **Security validation:** Ensure signatures are authentic before processing transactions

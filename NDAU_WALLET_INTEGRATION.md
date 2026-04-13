# Sign Payload API Documentation

## Overview
This API allows you to request a signature from the ndau wallet without saving the vote to the database. The wallet signs a custom payload and returns the signature.

## Flow

```
Frontend → Backend HTTP (/api/sign) → Backend Socket → Wallet (App) → Backend Socket → Frontend (via WebSocket)
```

## Endpoint

### POST /api/sign

Request a signature from the wallet for a custom payload.

#### Request Body

```json
{
  "payload": "base64_encoded_yaml_payload",
  "walletAddress": "ndau...",
  "websiteSocketId": "socket_id_of_frontend"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| payload | string | Yes | Base64-encoded YAML payload to be signed |
| walletAddress | string | Yes | ndau wallet address |
| websiteSocketId | string | Yes | Socket ID of the frontend connection |

#### Response

**Success (200)**
```json
{
  "status": true,
  "message": "Request sent to wallet"
}
```

**Error (400)**
```json
{
  "status": false,
  "message": "payload, walletAddress and websiteSocketId are required"
}
```

---

## WebSocket Events

### Events Emitted by Frontend

**website-sign-request-server**
Sent to initiate a signing request.

```javascript
{
  payload: "base64_encoded_yaml",
  walletAddress: "ndau...",
  websiteSocketId: "socket_id"
}
```

### Events Received by Frontend

**server-sign-fulfilled-website**
Received when the wallet successfully signs the payload.

```javascript
{
  signature: "signature_in_base58",
  payload: "original_payload"
}
```

**server-sign-rejected-website**
Received when the user rejects the signing request.

```javascript
{}
```

**server-sign-failed-website**
Received when an error occurs (e.g., wallet not connected).

```javascript
{
  message: "Wallet not connected"
}
```

### Events Emitted by Wallet (App)

**app-sign-confirmed-server**
Sent by wallet when user confirms the signature.

```javascript
{
  signature: "signature_in_base58",
  payload: "original_payload",
  app_socket_id: "app_socket_id"
}
```

**app-sign-rejected-server**
Sent by wallet when user rejects the signature.

```javascript
{
  app_socket_id: "app_socket_id"
}
```

### Events Received by Wallet (App)

**server-sign-request-app**
Sent by backend to wallet to request a signature.

```javascript
{
  payload: "base64_encoded_yaml",
  walletAddress: "ndau..."
}
```

---

## Usage Example (JavaScript)

### 1. Prepare the Payload

```javascript
import yaml from 'yaml';
import { getAccount } from './helpers/fetch';

const ethereumAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const walletAddress = "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8";

// Get validation key from wallet
const account = await getAccount(walletAddress);
const validationKey = account[walletAddress].validationKeys[0];

// Create the payload
const payload = {
  vote: 'yes',
  proposal: {
    proposal_id: 'ndau-to-revo-conversion',
    proposal_heading: `I agree to convert my ndau to the Ethereum address: ${ethereumAddress}`,
    voting_option_id: 1,
    voting_option_heading: 'Confirm Conversion'
  },
  wallet_address: walletAddress,
  validation_key: validationKey
};

// Convert to base64
const payloadBase64 = btoa(yaml.stringify(payload));
```

### 2. Send HTTP Request

```javascript
const socket = io('http://localhost:3001');

const response = await axios.post('http://localhost:3001/api/sign', {
  payload: payloadBase64,
  walletAddress: walletAddress,
  websiteSocketId: socket.id
});

console.log(response.data);
// { status: true, message: "Request sent to wallet" }
```

### 3. Listen for Response via WebSocket

```javascript
socket.on('server-sign-fulfilled-website', ({ signature, payload }) => {
  console.log('Signature received:', signature);
  // Use the signature as needed
  displaySignature(signature);
});

socket.on('server-sign-rejected-website', () => {
  console.log('User rejected the signature request');
  alert('Signature request rejected');
});

socket.on('server-sign-failed-website', ({ message }) => {
  console.log('Error:', message);
  alert('Failed: ' + message);
});
```

---

## Payload YAML Format

The payload must be in YAML format and then base64 encoded.

```yaml
vote: yes
proposal:
  proposal_id: ndau-to-revo-conversion
  proposal_heading: "I agree to convert my ndau to the Ethereum address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
  voting_option_id: 1
  voting_option_heading: "Confirm Conversion"
wallet_address: ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8
validation_key: npuba4jaftckeeb...
```

To convert to base64:
```javascript
const payloadBase64 = btoa(yaml.stringify(payload));
```

---

## cURL Example

```bash
# Step 1: Get validation key (optional - you may already have this)
curl -X GET "http://localhost:3001/api/account?walletAddress=ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8"

# Step 2: Prepare payload (convert YAML to base64)
# echo 'vote: yes
# proposal:
#   proposal_id: ndau-to-revo-conversion
#   proposal_heading: "I agree to convert my ndau to the Ethereum address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
#   voting_option_id: 1
#   voting_option_heading: "Confirm Conversion"
# wallet_address: ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8
# validation_key: npuba4jaftckeeb...' | base64

# Step 3: Send signing request
curl -X POST "http://localhost:3001/api/sign" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "eyJ2b3RlIjoieWVzIiwicHJvcG9zYWwiOnsicHJvcG9zYWxfaWQiOiJuZGF1LXRvLXJldm8tY29udmVyc2lvbiIsInByb3Bvc2FsX2hlYWRpbmciOiJJIGFncmVlIHRvIGNvbnZlcnQgbXkgbmRhdSB0byB0aGUgRXRoZXJldW0gYWRkcmVzczogMHg3NDJkMzVDY0NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsInZvdGluZ19vcHRpb25faWQiOjEsInZvdGluZ19vcHRpb25faGVhZGluZyI6IkNvbmZpcm0gQ29udmVyc2lvbiJ9LCJ3YWxsZXRfYWRkcmVzcyI6Im5kYXUxMUREOTJBYjhhY2QzQ2U1NzQxNTIzQzQ0N0IxODgyMWU3YmJhOCIsInZhbGlkYXRpb25fa2V5IjoibnB1YmE0amFmdGNrZWViLi4uIn0=",
    "walletAddress": "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8",
    "websiteSocketId": "your_socket_id"
  }'

# Step 4: Wait for response via WebSocket
# Use a WebSocket client tool like wscat:
# wscat -c ws://localhost:3001
# You will receive: server-sign-fulfilled-website with signature
```

---

## Testing

### 1. Test Endpoint with Postman

1. Create a payload in YAML format
2. Convert to base64
3. Send POST request to `http://localhost:3001/api/sign`
4. Verify response: `{ status: true, message: "Request sent to wallet" }`

### 2. Test Full Flow

1. Connect frontend to backend via WebSocket
2. Ensure wallet (app) is connected
3. Send signing request via HTTP
4. Verify wallet receives `server-sign-request-app` event
5. Confirm signature in wallet
6. Verify frontend receives `server-sign-fulfilled-website` event

### 3. Test Error Scenarios

- **Wallet not connected**: Should receive `server-sign-failed-website`
- **Missing parameters**: Should receive HTTP 400 error
- **User rejects**: Should receive `server-sign-rejected-website`

---

## Notes

- The signature is NOT saved to the database
- The wallet must be connected via socket.io before making the request
- The websiteSocketId must be a valid connected socket ID
- The payload must be base64-encoded YAML
- The signature is returned in the ndau base58 format

---

## Troubleshooting

### "Wallet not connected" error

Ensure that:
1. The wallet (app) is connected to the backend
2. The website socket is connected
3. The socket mapping is correctly established

### No signature received

Check:
1. Browser console for WebSocket errors
2. Backend server logs for socket events
3. Wallet connection status

### Invalid signature

Verify:
1. The payload format matches what the wallet expects
2. The validation key is correct
3. The payload is properly base64 encoded

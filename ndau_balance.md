# Wallet Balance Query Documentation

This document explains how to query wallet balances in the BPC DAO application, which is built on the ndau blockchain.

## Overview

The BPC DAO application interacts with ndau blockchain wallets to:
1. Verify wallet ownership and balance for voting eligibility
2. Display wallet information in the UI
3. Validate transactions and signatures

## API Endpoints

### 1. Get Account Information

**Endpoint:** `GET /account/account/{wallet_address}`

**Description:** Retrieves detailed account information including balance, validation keys, and account status from the ndau blockchain.

**Example Request:**
```javascript
const address = "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8";
const account = await getAccount(address);
```

**Example Response:**
```json
{
  "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8": {
    "Balance": 1000000000,
    "ValidationKeys": ["public_key_1", "public_key_2"],
    "LastEAIUpdate": 1234567890,
    "LastWAAUpdate": 1234567890,
    "Sequence": 42
  }
}
```

## Implementation Details

### Using Fetch API

Here's how to query wallet balance using the native `fetch` API:

#### Basic Fetch Implementation:

```javascript
export const getAccountWithFetch = async (address) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  
  try {
    const response = await fetch(accountDetailsEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      mode: 'cors', // or 'no-cors' depending on CORS configuration
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Account data:', data);
      return data;
    } else {
      console.error('Failed to fetch account:', response.status, response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
};
```

#### With Error Handling and Timeout:

```javascript
export const getAccountWithFetchAdvanced = async (address, timeout = 5000) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(accountDetailsEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error('Request timeout:', timeout, 'ms');
    } else {
      console.error('Fetch error:', error);
    }
    
    return null;
  }
};
```

### Frontend Implementation (Current - using axios)

The current frontend uses the `getAccount` function from `src/helpers/fetch.js` with axios:

```javascript
// src/helpers/fetch.js:27
export const getAccount = async (address) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  try {
    let resp = await axios.get(accountDetailsEndpoint, HTTP_REQUEST_HEADER);
    if (resp && resp.status == 200) {
      console.log(resp.data);
      return resp.data;
    }
  } catch (e) {
    return null;
  }
};
```

### Backend Implementation (Current - using axios)

The backend has an identical `getAccount` function in `backend/src/helpers/fetch.js`:

```javascript
// backend/src/helpers/fetch.js:27
export const getAccount = async (address) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  console.log('accountDetailsEndpoint:', accountDetailsEndpoint);
  try {
    let resp = await axios.get(accountDetailsEndpoint, HTTP_REQUEST_HEADER);
    if (resp && resp.status == 200) {
      console.log(resp.data);
      return resp.data;
    }
  } catch (e) {
    console.error(e);
    return null;
  }
};
```

## Node Selection

The application automatically selects healthy ndau nodes:

1. **Node Discovery:** Fetches available nodes from `https://s3.us-east-2.amazonaws.com/ndau-json/services.json`
2. **Health Check:** Tests node health before use
3. **Fallback:** Uses mainnet as default network
4. **Random Selection:** Randomly selects from available healthy nodes for load distribution

### Node Endpoint Selection Flow:
```javascript
export const getNodeEndpoint = async (node) => {
  var nodeEndpoint, health;
  while (true) {
    nodeEndpoint = await tryNodeEndpoint(node);
    health = await getNodeHealth(nodeEndpoint);
    if (health === 'OK') {
      return nodeEndpoint;
    }
  }
};
```

## Usage Examples

### 1. Checking Wallet Balance for Voting (using fetch)

```javascript
// Using fetch API for balance validation
const { validation_key, proposal, wallet_address } = ballot;

const account = await getAccountWithFetch(wallet_address);

if (!account || !account[wallet_address]) {
  return res.status(400).json({
    success: false,
    message: 'Invalid wallet address'
  });
}

const balance = account[wallet_address].Balance;
const minBalanceRequired = 1000000; // 1 ndau in nanondau

if (balance < minBalanceRequired) {
  return res.status(400).json({
    success: false,
    message: 'Insufficient balance for voting'
  });
}
```

### 2. Displaying Wallet Info in UI (using fetch)

```javascript
// Example from frontend components using fetch
const walletAddress = useNdauConnectStore((state) => state.walletAddress);

// Get account info when wallet is connected
useEffect(() => {
  if (walletAddress) {
    const fetchAccountInfo = async () => {
      const account = await getAccountWithFetch(walletAddress);
      if (account && account[walletAddress]) {
        const balance = account[walletAddress].Balance;
        // Convert nanondau to ndau (1 ndau = 1,000,000,000 nanondau)
        const ndauBalance = balance / 1000000000;
        setWalletBalance(ndauBalance);
      }
    };
    fetchAccountInfo();
  }
}, [walletAddress]);
```

### 3. Batch Wallet Balance Queries (using fetch)

```javascript
// Query multiple wallet balances efficiently
export const getMultipleAccountBalances = async (addresses) => {
  const endpoint = await getNodeEndpoint();
  const results = {};
  
  // Use Promise.all for parallel requests
  const promises = addresses.map(async (address) => {
    try {
      const response = await fetch(`${endpoint}/account/account/${address}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        results[address] = data[address]?.Balance || 0;
      } else {
        results[address] = null;
      }
    } catch (error) {
      results[address] = null;
    }
  });
  
  await Promise.all(promises);
  return results;
};

// Usage
const walletAddresses = ["address1", "address2", "address3"];
const balances = await getMultipleAccountBalances(walletAddresses);
console.log('Wallet balances:', balances);
```

## Balance Units

- **Nanondau:** The smallest unit (1 ndau = 1,000,000,000 nanondau)
- **Ndau:** The main unit displayed to users

**Conversion:**
```javascript
const nanondauBalance = account[wallet_address].Balance;
const ndauBalance = nanondauBalance / 1000000000;
```

## Error Handling with Fetch

### Common Errors and Solutions:

1. **Invalid Wallet Address:**
   ```javascript
   const account = await getAccountWithFetch(address);
   if (!account || !account[address]) {
     throw new Error(`Invalid wallet address: ${address}`);
   }
   ```

2. **Network Issues with Retry Logic:**
   ```javascript
   export const getAccountWithRetry = async (address, maxRetries = 3) => {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         const endpoint = await getNodeEndpoint();
         const response = await fetch(`${endpoint}/account/account/${address}`, {
           method: 'GET',
           headers: { 'Content-Type': 'application/json' },
         });
         
         if (response.ok) {
           return await response.json();
         }
         
         if (attempt === maxRetries) {
           throw new Error(`Failed after ${maxRetries} attempts: ${response.status}`);
         }
         
         // Wait before retry (exponential backoff)
         await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
         
       } catch (error) {
         if (attempt === maxRetries) {
           console.error(`Final attempt failed for ${address}:`, error);
           return null;
         }
       }
     }
   };
   ```

3. **Timeout Handling:**
   ```javascript
   export const getAccountWithTimeout = async (address, timeoutMs = 10000) => {
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
     
     try {
       const endpoint = await getNodeEndpoint();
       const response = await fetch(`${endpoint}/account/account/${address}`, {
         method: 'GET',
         headers: { 'Content-Type': 'application/json' },
         signal: controller.signal,
       });
       
       clearTimeout(timeoutId);
       
       if (!response.ok) {
         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
       }
       
       return await response.json();
       
     } catch (error) {
       clearTimeout(timeoutId);
       
       if (error.name === 'AbortError') {
         throw new Error(`Request timeout after ${timeoutMs}ms`);
       }
       
       throw error;
     }
   };
   ```

4. **CORS Issues:**
   ```javascript
   // Handle CORS errors
   export const getAccountWithCorsHandling = async (address) => {
     try {
       const endpoint = await getNodeEndpoint();
       const response = await fetch(`${endpoint}/account/account/${address}`, {
         method: 'GET',
         mode: 'cors', // Try 'cors' first
         headers: { 'Content-Type': 'application/json' },
       });
       
       return await response.json();
       
     } catch (corsError) {
       // Fallback to no-cors mode if CORS fails
       console.warn('CORS error, trying no-cors mode:', corsError);
       
       const endpoint = await getNodeEndpoint();
       const response = await fetch(`${endpoint}/account/account/${address}`, {
         method: 'GET',
         mode: 'no-cors',
       });
       
       // Note: With 'no-cors', response will be opaque
       // You might need to use a proxy or different approach
       return null;
     }
   };
   ```

5. **Insufficient Balance:**
   ```javascript
   const account = await getAccountWithFetch(address);
   const balance = account[address]?.Balance || 0;
   
   if (balance < requiredBalance) {
     throw new Error(`Insufficient balance: ${balance} < ${requiredBalance}`);
   }
   ```

## Best Practices with Fetch

1. **Cache Responses with Fetch API:**
   ```javascript
   const walletBalanceCache = new Map();
   
   export const getAccountWithCache = async (address) => {
     // Check cache first
     if (walletBalanceCache.has(address)) {
       const cached = walletBalanceCache.get(address);
       if (Date.now() - cached.timestamp < 30000) { // 30 second cache
         return cached.data;
       }
     }
     
     // Fetch fresh data
     const endpoint = await getNodeEndpoint();
     const response = await fetch(`${endpoint}/account/account/${address}`);
     
     if (response.ok) {
       const data = await response.json();
       
       // Update cache
       walletBalanceCache.set(address, {
         data,
         timestamp: Date.now()
       });
       
       return data;
     }
     
     return null;
   };
   ```

2. **Error Retry with Exponential Backoff:**
   ```javascript
   export const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         const response = await fetch(url, options);
         
         if (response.ok) {
           return response;
         }
         
         // Exponential backoff: 1s, 2s, 4s, etc.
         const delay = Math.pow(2, i) * 1000;
         await new Promise(resolve => setTimeout(resolve, delay));
         
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         
         const delay = Math.pow(2, i) * 1000;
         await new Promise(resolve => setTimeout(resolve, delay));
       }
     }
     
     throw new Error(`Failed after ${maxRetries} retries`);
   };
   ```

3. **Balance Validation:**
   ```javascript
   export const validateWalletBalance = async (address, minBalance) => {
     try {
       const account = await getAccountWithFetch(address);
       
       if (!account || !account[address]) {
         return { valid: false, error: 'Invalid wallet address' };
       }
       
       const balance = account[address].Balance;
       const isValid = balance >= minBalance;
       
       return {
         valid: isValid,
         balance,
         required: minBalance,
         error: isValid ? null : 'Insufficient balance'
       };
       
     } catch (error) {
       return { valid: false, error: `Network error: ${error.message}` };
     }
   };
   ```

4. **Batch Processing with Rate Limiting:**
   ```javascript
   export const batchGetAccounts = async (addresses, batchSize = 5, delayMs = 100) => {
     const results = {};
     
     for (let i = 0; i < addresses.length; i += batchSize) {
       const batch = addresses.slice(i, i + batchSize);
       
       const batchPromises = batch.map(async (address) => {
         try {
           const endpoint = await getNodeEndpoint();
           const response = await fetch(`${endpoint}/account/account/${address}`);
           
           if (response.ok) {
             const data = await response.json();
             results[address] = data[address] || null;
           } else {
             results[address] = null;
           }
         } catch (error) {
           results[address] = null;
         }
       });
       
       await Promise.all(batchPromises);
       
       // Rate limiting delay between batches
       if (i + batchSize < addresses.length) {
         await new Promise(resolve => setTimeout(resolve, delayMs));
       }
     }
     
     return results;
   };
   ```

5. **Security Best Practices:**
   - Never expose private keys in fetch requests
   - Use HTTPS for all API calls
   - Validate and sanitize wallet addresses before making requests
   - Implement request signing for sensitive operations
   - Use environment variables for API endpoints

## Testing with Fetch

Test wallet balance queries using fetch:

```javascript
// Test with known wallet addresses using fetch
const testAddress = "ndau11DD92Ab8acd3Ce5741523C447B18821e7bba8";

// Basic test
const account = await getAccountWithFetch(testAddress);
console.assert(account[testAddress].Balance !== undefined, 'Balance should be defined');
console.assert(account[testAddress].ValidationKeys !== undefined, 'ValidationKeys should be defined');

// Test with mock fetch for unit testing
export const mockGetAccount = async (address, mockData = null) => {
  if (mockData) {
    // Return mock data for testing
    return mockData;
  }
  
  // Real implementation for integration tests
  const endpoint = await getNodeEndpoint();
  const response = await fetch(`${endpoint}/account/account/${address}`);
  
  if (!response.ok) {
    throw new Error(`Test failed: ${response.status}`);
  }
  
  return await response.json();
};

// Example test using Jest
describe('Wallet Balance Query', () => {
  test('should fetch account balance', async () => {
    const mockAddress = 'ndau1testaddress';
    const mockResponse = {
      [mockAddress]: {
        Balance: 1000000000,
        ValidationKeys: ['key1', 'key2']
      }
    };
    
    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );
    
    const result = await getAccountWithFetch(mockAddress);
    expect(result[mockAddress].Balance).toBe(1000000000);
    expect(result[mockAddress].ValidationKeys).toHaveLength(2);
  });
  
  test('should handle network errors', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
    );
    
    const result = await getAccountWithFetch('invalid-address');
    expect(result).toBeNull();
  });
});
```

## Related Files

- `frontend/src/helpers/fetch.js` - Frontend API helpers (axios implementation)
- `backend/src/helpers/fetch.js` - Backend API helpers (axios implementation)
- `backend/src/controllers/votes_controller.js` - Balance validation for voting
- `frontend/src/store/ndauConnect_store.ts` - Wallet state management

## Fetch vs Axios Comparison

### Using Fetch:
```javascript
// Pros: Native, no dependencies, modern API
// Cons: More verbose error handling, no automatic JSON parsing

const response = await fetch(url, options);
if (response.ok) {
  const data = await response.json();
  return data;
}
```

### Using Axios (current implementation):
```javascript
// Pros: Automatic JSON parsing, better error handling, interceptors
// Cons: Additional dependency

const response = await axios.get(url, options);
return response.data;
```

### Migration Example (axios to fetch):
```javascript
// Current (axios)
export const getAccount = async (address) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  try {
    let resp = await axios.get(accountDetailsEndpoint, HTTP_REQUEST_HEADER);
    if (resp && resp.status == 200) {
      return resp.data;
    }
  } catch (e) {
    return null;
  }
};

// Migrated to fetch
export const getAccountWithFetch = async (address) => {
  const endpoint = await getNodeEndpoint();
  const accountDetailsEndpoint = `${endpoint}/account/account/${address}`;
  
  try {
    const response = await fetch(accountDetailsEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
};
```

## Notes

- The ndau blockchain uses nanondau as the base unit (similar to wei in Ethereum)
- Account information includes validation keys for signature verification
- Always check node health before making API calls
- Balance validation is critical for voting and transaction processing
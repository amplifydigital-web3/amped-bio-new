# CDP relayer account and policy (USDC gasless send)

Build Board #29, spec `docs/features/usdc-wallet-onramp.md` 3.4 and 3.12. One
CDP Server Wallet account per environment submits fans' signed USDC transfer
authorizations on Base and pays the gas. Coinbase holds the key. The policy
below is the control that limits what the account can do; the server code
cannot widen it.

## Setup, per environment

1. CDP Portal: create a project for the environment, an API key (Ed25519 is
   the default) and a Wallet Secret. Store them as `CDP_API_KEY_ID`,
   `CDP_API_KEY_SECRET` and `CDP_WALLET_SECRET` in the server secret store.
2. Create one EVM account named `amped-relayer-staging` or
   `amped-relayer-production` and set `CDP_RELAYER_ACCOUNT` to that name.
3. Attach the policy below to the account.
4. Fund the account with ETH on the payment chain (testnet ETH on Base Sepolia
   from the CDP faucet on staging; treasury ETH on Base in production). The
   server raises the alarm below `RELAYER_GAS_ALARM_ETH` (0.05) and pauses
   sends below `RELAYER_GAS_STOP_ETH` (0.01) with the paused line.
5. Set `PAYMENT_CHAIN`, then `USDC_ENABLED=true`.
6. Acceptance 4: from the CDP Portal or a script, try a call from the account
   to any other contract or function and confirm CDP refuses it.

## Policy (account scope)

Accept `sendEvmTransaction` only when every criterion
holds; every other operation and call is rejected.

```json
{
  "scope": "account",
  "description": "Amped.Bio USDC relayer: USDC transferWithAuthorization only",
  "rules": [
    {
      "action": "accept",
      "operation": "sendEvmTransaction",
      "criteria": [
        { "type": "evmNetwork", "networks": ["base-sepolia"], "operator": "in" },
        {
          "type": "evmAddress",
          "addresses": ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"],
          "operator": "in"
        },
        { "type": "ethValue", "ethValue": "0", "operator": "<=" },
        {
          "type": "evmData",
          "abi": [
            {
              "type": "function",
              "name": "transferWithAuthorization",
              "stateMutability": "nonpayable",
              "inputs": [
                { "name": "from", "type": "address" },
                { "name": "to", "type": "address" },
                { "name": "value", "type": "uint256" },
                { "name": "validAfter", "type": "uint256" },
                { "name": "validBefore", "type": "uint256" },
                { "name": "nonce", "type": "bytes32" },
                { "name": "v", "type": "uint8" },
                { "name": "r", "type": "bytes32" },
                { "name": "s", "type": "bytes32" }
              ],
              "outputs": []
            }
          ],
          "conditions": [{ "function": "transferWithAuthorization" }]
        }
      ]
    }
  ]
}
```

Production uses `"networks": ["base"]` and the Base USDC address
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. The `evmData` criterion takes
the FiatToken v2.2 ABI fragment because `transferWithAuthorization` is not in
the built in `erc20` ABI (the fragment matches `USDC_EIP3009_ABI` in
`packages/web3/src/usdc.ts`). The relayer only calls `transferWithAuthorization`
today; `receiveWithAuthorization` is added to the fragment and the conditions
when AmpedPay and AmpedMemberships ship, together with their addresses.
Criteria shapes follow the CDP SDK policy types (`evmNetwork`, `evmAddress`,
`ethValue`, `evmData`); confirm in the Portal editor when attaching.

## Daily caps

Product limits run in the server (10 sends and 2,000 USDC per account per UTC
day, `USDC_SEND_LIMITS` in `@repo/constants`). Set a matching account level
cap in CDP where the Portal offers one, so a server fault cannot exceed it.

## Pause

Set the site setting `usdc_sends_paused` to `true` to stop every send within
one request. The admin switch arrives with Admin, Money (USDC-3).

## Buy USDC through Coinbase (Onramp)

Build Board #5, spec `docs/features/usdc-wallet-onramp.md` 3.5 and 3.12. The
Onramp calls are signed with the same CDP API key as the relayer; no Wallet
Secret is involved.

1. Apply for Onramp access in the CDP Portal (Payments, Onramp and Offramp).
   Production access follows Coinbase's approval.
2. Add `app.staging.amped.bio` and `app.amped.bio` to the Onramp domain
   allowlist. The hosted redirect returns to
   `https://{app}/wallet?fund=usdc&session={id}`.
3. Create the webhook subscription for `onramp.transaction.created`,
   `onramp.transaction.updated`, `onramp.transaction.success` and
   `onramp.transaction.failed` with target
   `https://api.staging.amped.bio/webhooks/coinbase-onramp` (and the production
   API host). Store `metadata.secret` from the response in
   `CDP_ONRAMP_WEBHOOK_SECRET`. The route verifies `X-Hook0-Signature` (v0,
   HMAC-SHA256 over `{t}.{raw body}`, five minute window) and answers 401 to
   anything else.
4. Set `ONRAMP_ENABLED=true` on the server, then `VITE_USDC_ONRAMP=true` on the
   client. Staging runs Coinbase's sandbox (`ONRAMP_SANDBOX` defaults to true
   outside production): `partnerUserRef` gets the `sandbox-` prefix, nothing is
   charged and nothing is delivered on chain, so the Arrived state on staging
   follows the webhook alone.
5. Production: the Privacy Policy names Coinbase, Circle and Chainalysis as
   recipients before `VITE_USDC_ONRAMP` turns on (USDC-6).

### Apple Pay and Google Pay (Headless Onramp, USDC-5)

US fans without a Coinbase account pay with Apple Pay or Google Pay inside
Coinbase's payment frame in the Buy USDC panel. Orders run in embedded mode:
Coinbase collects and verifies phone and email in its frame, and returns a
`userAuthToken` that the server stores encrypted for 60 days so a returning
fan skips that step. Amped.Bio sends no phone or email.

1. Ask the Coinbase account representative to enable the Headless Onramp and
   embedded order mode on the CDP project.
2. The domain allowlist from step 2 above covers the frame. The server sends
   `domain` on every order: `ONRAMP_DOMAIN`, or the `APP_URL` host when empty.
   It must match the host the panel runs on.
3. Apple Pay domain verification: download Coinbase's
   `apple-developer-merchantid-domain-association` file from the CDP Portal and
   commit it at `apps/client/public/.well-known/` so lighttpd serves
   `https://{app}/.well-known/apple-developer-merchantid-domain-association`.
   The domain must not be tied to another Apple Merchant ID.
4. Optional: set `ONRAMP_DATA_KEY` to a long random value. Empty falls back to
   `BETTER_AUTH_SECRET`. Rotating it makes stored tokens unreadable; fans then
   verify with Coinbase once more.
5. Staging sandbox: the payment link gets `useApplePaySandbox=true` or
   `useGooglePaySandbox=true`. Verify with a phone number starting `+1000`, an
   email ending `@sandbox.test` and the code `000000`. Sandbox orders succeed,
   charge nothing and deliver nothing on chain.
6. The orders webhook events arrive on the subscription from step 3. Orders are
   matched by `orderId`, or by `partnerOrderRef`, which is the Amped.Bio session
   id.

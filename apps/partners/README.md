# Merchant Console (partners.amped.bio)

Build Board #66, PR AB-5, decision M7. Business sellers on AmpedPay (Authbase first) manage:

| Page | Board | Who |
| --- | --- | --- |
| Overview | p1 | Every member |
| Products | p2 | Owner and Finance edit |
| Payout wallet | p3, p7 | Owners propose; a different Owner approves; 24 hours |
| Orders and refunds | p4 | Owner and Finance refund |
| Developers | p5, p7 | Owner and Developer |
| Team | p6 | Every member reads; Amped.Bio support adds members |

Sign in is the Amped.Bio account (the same session as app.amped.bio). The account must be a
`MerchantMember`. Every money or secret change asks for a two factor code.

Deploy (staging): build with `--build-arg VITE_MODE=staging` from `apps/partners/Dockerfile`, point
`partners.staging.amped.bio` at it, and add `https://partners.staging.amped.bio` to the API's
`CORS_ORIGINS` so the session cookie and tRPC calls work.

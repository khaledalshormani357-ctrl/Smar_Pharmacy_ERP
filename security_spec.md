# Security Specification & Threat Modeling
## Smart Pharmacy ERP — Firestore Security Architecture

### 1. Core Data Invariants
1. **Master Gate & Identity Hierarchy**:
   - Only authenticated and verified users (`isSignedIn()`) can access operational collections.
   - Administrative roles are validated strictly via trusted documents in `/admins/$(request.auth.uid)`, never by client-supplied JWT claims or client payload flags.
2. **Subcollection Relational Integrity**:
   - `batches` belong to `/products/{productId}`. Writing a batch requires that the parent product exists.
   - `sale_items` belong to `/sales/{saleId}`. An item cannot be written without an active parent sale.
3. **Immutability & Terminal States**:
   - `completed` or `refunded` sales cannot have their financial amounts (`netTotal`, `paidAmount`) modified or tempered.
   - `cash_transactions` are an append-only audit trail: no client updates or deletes are permitted once recorded.
4. **Anti-Update-Gap Strict Key Validation**:
   - Every write must pass `isValid[Entity]()` type checking and string `.size()` boundary limits.
   - No unknown ghost fields (`.hasOnly()`) are allowed on document creation or updates.

---

### 2. The "Dirty Dozen" Threat Payloads (Must be Denied)

1. **Payload 1: Unauthenticated Read/Write**
   - Attempting to read `/products/p1` without `request.auth`.
   - *Expected*: `PERMISSION_DENIED`.

2. **Payload 2: Self-Promotion Privilege Escalation**
   - User attempting to write `/admins/$(request.auth.uid)` with `{ "role": "super_admin" }`.
   - *Expected*: `PERMISSION_DENIED`.

3. **Payload 3: Ghost Field Injection (Shadow Update)**
   - Creating a user document with an unwhitelisted field `{ id: "u1", role: "admin", backdoor: true }`.
   - *Expected*: `PERMISSION_DENIED`.

4. **Payload 4: Negative/Corrupted Prices**
   - Creating a product with `sellingPrice: -500`.
   - *Expected*: `PERMISSION_DENIED`.

5. **Payload 5: Oversized ID Resource Poisoning**
   - Injecting a 2KB garbage string as `{productId}` or `{saleId}`.
   - *Expected*: `PERMISSION_DENIED`.

6. **Payload 6: Tampering with Terminal State Sale**
   - Updating `netTotal` or `paidAmount` on a sale that is already marked `status: "completed"`.
   - *Expected*: `PERMISSION_DENIED`.

7. **Payload 7: Cash Transaction Ledger Tampering**
   - Attempting to `update` or `delete` an existing record in `/cash_transactions/{id}`.
   - *Expected*: `PERMISSION_DENIED`.

8. **Payload 8: Orphaned Batch Insertion**
   - Writing a product batch to a non-existent parent product ID.
   - *Expected*: `PERMISSION_DENIED`.

9. **Payload 9: Identity Spoofing on Shift Creation**
   - User `uid_abc` creating a shift with `cashierId: "uid_xyz"`.
   - *Expected*: `PERMISSION_DENIED`.

10. **Payload 10: Blanket List Query Bypass**
    - Querying all users or sensitive staff accounts without authentication or valid authorization.
    - *Expected*: `PERMISSION_DENIED`.

11. **Payload 11: String Buffer Overflow Attack**
    - Writing a `nameAr` with a 10,000-character payload to cause wallet/bandwidth exhaustion.
    - *Expected*: `PERMISSION_DENIED`.

12. **Payload 12: Missing Email Verification**
    - Attempting destructive administrative actions when `request.auth.token.email_verified == false`.
    - *Expected*: `PERMISSION_DENIED`.

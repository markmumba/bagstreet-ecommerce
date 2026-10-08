# BagStreet Compliance Readiness

Reviewed against `output/pdf/bagstreet_kenya_legal_compliance_brief.pdf` on 8 October 2026. This is an implementation register, not a legal opinion or a declaration that the business is compliant. Owner, Kenyan advocate and accountant approvals remain necessary. The PDF's RabbitMQ reference is outdated: email now uses the durable Postgres outbox.

Owner confirmed on 8 October 2026: business name **Bagstreet**; privacy/compliance contact **bagstreetke@gmail.com**. The notices use those details. Registration particulars and policy approval still need a documentary review before launch.

## Implemented Controls

| PDF requirement | Implementation | Important limit |
| --- | --- | --- |
| Terms, returns, delivery, support | Public customer-care pages and footer links; business name and privacy email confirmed by owner | Review registration particulars, return costs and refund service times with counsel/owner |
| Privacy and cookie notice | `/privacy` and `/cookies`, versioned alongside sale policies | Hosting region, provider contracts and transfer safeguards still need owner confirmation |
| Explicit purchase agreement | Unchecked checkout acceptance; API rejects missing/old versions; full policy snapshot stored atomically with order | Deploy server and storefront together; older clients must reload |
| Buyer agreement copy | Submitted item names/variants/prices, totals, address, notes and accepted policies archived together; acknowledgement email queued in the order transaction | This is not a payment receipt or tax invoice; monitor email failures and arrange verified redelivery; counsel confirms prescribed content/manner |
| Separate email consent | Checkout/account preference and unsubscribe; no automatic discounts | This is saved-bag consent, not permission for unrelated marketing campaigns |
| Data access and correction | My Account data export and requests; profile correction; admin request register | Guest information requires an independently verified manual search; no lookup by unverified email |
| Erasure and objection | Admin-reviewed requests and explicit account erasure | Account-only data removed; orders, payments, delivery evidence and suppression are retained pending legal assessment; active orders block erasure |
| Staff access | Managers remain order-only; compliance area and exports admin-only | MFA is not yet implemented; deploy controls before production access |
| Access revocation | Protected requests check active account and current DB role; notification streams recheck before delivery and on heartbeat | One DB lookup per authenticated request; inactive/expired streams stop delivering events |
| Sensitive read auditing | Staff order list, detail and receipt access; privacy exports/actions; accounting exports | Receipt access is recorded, not proof that a browser printed or saved a file |
| Audit secrets | Nested passwords, tokens, credentials and card-field keys redacted in new audit writes | Historical audit rows need a separately approved review; no automatic purge |
| Monthly records | Nairobi-month CSVs for orders, items, ledger, refunds, discounts, inventory and policy acceptances; SHA-256 manifest and export register | Archive downloaded files in encrypted, access-controlled, immutable offsite storage; hashes alone are not immutability |
| Fees/refunds | Existing ledger and statement reconciliation; exports preserve entry type/direction/currency | BagStreet payment receipts are not automatically KRA/eTIMS tax invoices |
| Incident response | Admin breach register, awareness time, 72-hour review marker, notification assessment and evidence | No automatic regulator notification; counsel determines reportability and actual deadlines |
| Supplier/IP evidence | Private product supplier, invoice, authenticity and image-permission records; products with retained evidence are deactivated rather than deleted | Text references to private evidence, not proof of authenticity; never upload invoices/IDs to the public product-image bucket |
| Product claims | Blanket “Every piece verified” claim removed | Owner must review names, materials, photos and remaining product-specific claims |
| Limited recovery retention | 7-day snapshots, 30/90-day outbox cleanup | Financial/security/support retention is reviewed, not automatically deleted |

## Launch Gates: Not Completed By Code

- **Owner/counsel:** check registration particulars and approve policy wording. The business name and contact are confirmed, not the sufficiency of registration documents. The 24-hours-from-dispatch window is only the shop's voluntary change-of-mind policy; do not use it to deny statutory remedies. Confirm a workable written refund timeline and responsibility for return delivery.
- **Privacy lead/counsel:** assess ODPC registration; document controller/processor roles, lawful purposes, privacy request service times and identity-verification methods. Do not assume a small retailer is exempt without reviewing the current rules.
- **Accountant:** confirm KRA PIN, tax regime and eTIMS implementation. KRA generally requires tax records for five years from the relevant reporting period, with extensions in specified circumstances; agree the actual schedule and legal holds. Do not delete sales records on a blanket five-year timer.
- **Owner:** establish supplier invoices, authenticity assessments, photo licences and any applicable import/KEBS/anti-counterfeit evidence.
- **Engineering/operator:** implement staff MFA, encrypted/offsite database and object-store backups, restore tests and documented RPO/RTO. Test Pesapal production reconciliation, disputes and refunds with the provider.
- **Owner/operator:** list actual VPS, region, object storage, email provider, CDN (if enabled) and delivery partners; confirm processor contracts and lawful cross-border safeguards. No provider certification or lawful transfer is inferred merely from integrating its API.

## Privacy Request Procedure

1. Record the request immediately. Signed-in requests are linked to an authenticated, active customer account. Record guest requests from the privacy support channel in Admin > Compliance > Requests; those start unverified.
2. Verify identity proportionately. Use an existing verified channel and order evidence; do not disclose whether an email has an account to anonymous callers or demand unnecessary identity documents. Record the method, not passwords, complete IDs or payment details.
3. Export account-linked data through the protected control, or manually locate verified guest/support records. Deliver through a verified secure channel, not a publicly readable object URL. Record completion and the delivery method.
4. Correct inaccurate information or record the objection/restriction and the reason for any continued processing. Optional reminders can be stopped independently of order emails.
5. For erasure, resolve active orders first. Explain exactly which account/cart information will be removed and which financial, delivery, dispute and suppression records must remain. Use the explicit account-erasure action only after verification and record the retention reason. It invalidates login and refresh sessions.
6. Review remaining records, historical outbox jobs, audit/support copies and backups under the approved retention schedule. A completed account erasure is not a claim that every copy of all personal information was deleted. Communicate the scope and any refusal/retention grounds to the requester.

## Incident Response Procedure

1. The owner is incident commander until a privacy/security lead is appointed. Record awareness time and severity immediately. A review marker at awareness +72 hours is a triage aid, not an exemption or an automatic legal conclusion.
2. Contain the incident: revoke implicated accounts/sessions, rotate exposed credentials, isolate affected services and stop the leak. Preserve evidence and timeline before destructive changes; keep logs restricted and do not place raw personal data in public issue trackers.
3. Establish affected people, data categories, systems, access, duration, safeguards and harm risk. Contact counsel and relevant processors promptly. Record notification decision and justification in the incident register.
4. Section 43's controller trigger concerns unauthorised access/acquisition and a real risk of harm. Where it applies, notify ODPC without delay and within 72 hours of awareness, giving reasons for delay, and communicate to affected people in writing within a reasonably practical period as required. Processors notify the controller without delay and, where reasonably practicable, within 48 hours. Use the [ODPC breach form](https://www.odpc.go.ke/report-a-data-breach/); record actual notification times and evidence. Counsel assesses the statutory conditions and any permitted restriction of communication.
5. Repair, verify containment, restore safely and monitor. Close only after documenting the notification assessment, root cause, corrective actions and evidence. Keep the incident register access restricted.

## Staff, Reconciliation And Retention Procedures

- Staff use customer information only for authorised fulfilment/support. No personal-device exports or unrelated contact. Obtain confidentiality acknowledgement; remove access immediately on departure, and periodically review roles and duty-manager assignment.
- Reconcile Pesapal references, BagStreet ledger and bank settlements daily. Investigate held, reversed, late and duplicate payments; never ask a paid customer to pay again merely because a callback is missing.
- Return money through the agreed authorised channel before recording a refund. Record amount, reason and external reference exactly once; communicate the resolution to the customer and retain proof. A ledger entry alone does not move money at Pesapal.
- Export each accounting dataset monthly. Record fee/reversal/refund entries separately from sales. Store CSV and manifest in access-controlled offsite archives, verify hashes, and let the accountant reconcile rather than treating an export as a tax filing.
- Approve a retention schedule by data category, purpose, owner and legal basis, plus a legal-hold register. Product photos may be public; supplier/customer evidence must not be. Restrict backups, encrypt them and test restores. Expired optional data can be purged; required accounting evidence needs review.

## Technical Verification

Run `bun run db:migrate` before deployment. Migration `012_compliance_controls` adds acceptance, request, incident, product-evidence and export-register tables. Build server, storefront and admin together. `bun test` covers agreement validation, CSV formula protection, month boundaries and audit redaction. `bun run test:compliance` uses disposable fixtures and never sends email or contacts a payment provider.

Local verification on 8 October 2026: migration applied; all 41 compliance integration checks and 221 server unit tests pass; server, storefront and admin production builds succeed; `git diff --check` passes. Tests cover inactive-account access, current-role authority, identity checks, erasure safeguards, preserved financial evidence, all monthly datasets, archived agreement content and transactional email deduplication. Browser checks cover public notices, customer request submission and data download, admin tabs, monthly CSV and manifest downloads, and mobile layouts without horizontal overflow. Disposable accounts and their records were removed afterwards. No test emails or payment requests were sent. An end-to-end delivery test with the configured email provider remains a prelaunch task.

## Primary Sources Rechecked

- [Kenya Data Protection Act](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31): rights, transparency, lawful processing, retention and breach notification (including section 43).
- [Parliament's Act copy](https://libraryir.parliament.go.ke/server/api/core/bitstreams/edb5bbb9-20e9-4528-bd30-c8091cf595f5/content): section 43 controller/processor notification conditions and timing, checked when the Kenya Law endpoint refused access.
- [Kenya Consumer Protection Act](https://new.kenyalaw.org/akn/ke/act/2012/46/eng@2022-12-31): internet agreement disclosure, correction, acceptance, copy and cancellation requirements. Policies still need counsel review of applicability and prescribed information.
- [ODPC](https://www.odpc.go.ke/): registration, rights, complaints and breach reporting.
- [KRA tax record-keeping FAQ](https://www.kra.go.ke/component/kra_faq/faq/307) and [KRA eTIMS](https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/what-is-etims): accountant review and electronic tax invoicing.

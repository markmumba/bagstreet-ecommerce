# Admin UI review

17 Oct 2026. Covers the admin app (`client/`) only. Every screen was checked in the browser at desktop (1280px), tablet (768px) and phone (390px) widths, and all routes and components were checked against the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines). Title Case is not flagged, because the project uses sentence case on purpose. Paths are relative to `client/src/` unless they start with `client/`, and line numbers are as of commit `a356dad`.

**Verdict:** the admin works, and every screen fits on desktop and tablet. What holds it back is a handful of repeated problems:
- template leftovers;
- three different money formats;
- a till that is cramped on a tablet;
- failures staff never see;
- forms that don't work well with keyboards, screen readers or password managers.

This needs polish, not a redesign.

**Suggested order:**
1. Fix first.
2. Till on a tablet.
3. Accessibility.
4. State and layout.
5. Polish.

---

## 1. Fix first: daily work and trust

### 1.1 Failures staff never see
- [x] `components/products/ProductDialog.tsx:193-195`: save errors only go to `console.error`.
- [x] `components/categories/CategoryDialog.tsx:79`: save errors only go to the console.
- [x] `routes/categories.tsx:74`: delete errors only go to the console. The dialog shows `deleteMutation.error`, which goes stale when the dialog is reopened.
- [x] `routes/settings.tsx:50-58` and `components/settings/StorefrontHeroCard.tsx:46-54`: `mutateAsync` has no try/catch, so failures become unhandled rejections.
- [x] `routes/orders.tsx:266-306`: CSV export has no catch, so it fails silently. `limit: 5000` also cuts the export off without saying so. *(Worse than it looked: the API caps pages at 100, so exports stopped at 100 orders. It now fetches every page.)*
- [x] `components/orders/OrderReceiptDialog.tsx:397-398` and `components/gift-vouchers/IssuedVoucherDialog.tsx:15`: if a popup blocker stops the print window, nothing tells the user.
- [x] `routes/shipping.tsx:75, :83`: errors use the browser's `alert()`.
- [x] `routes/users.tsx:97, :100, :104`: errors and delete use the browser's `alert()` and `confirm()`.

### 1.2 One money and date format everywhere
This is roadmap item #7. Create one shared formatter module using `Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' })` and `Intl.DateTimeFormat('en-KE')`, in the Africa/Nairobi time zone.

- **Money shows three different ways:**
  - "KES 8900.00" at `routes/orders.tsx:163, :165, :413, :415`, `components/orders/OrderSheet.tsx:330-363`, `components/products/ProductsDataTable.tsx:182` (mobile), and `components/products/VariantsSheet.tsx:292`;
  - "KES 8,900.00" in `components/orders/OrderPaymentsPanel.tsx` and `components/dashboard/RevenueChart.tsx:26`;
  - "Ksh 8,900" at `routes/dashboard.tsx:153` and on receipts.
- [x] Gift vouchers use their own hand-built "KES " prefix (`components/gift-vouchers/voucher-format.ts:4`).
- **Dates use different locales:**
  - [x] `en-US` ("Oct 17, 2026") at `routes/orders.tsx:73`, `OrderSheet.tsx:92`, `routes/products.tsx:246-252`, `routes/categories.tsx:79`, `components/categories/CategoriesDataTable.tsx:122`, `routes/promotions.tsx:28` and `routes/users.tsx:44`;
  - [x] the browser default at `components/products/VariantsSheet.tsx:177`;
  - [x] `en-KE` everywhere else.
- **Dates shift by a day for the first three hours after midnight in Nairobi:**
  - [x] `routes/orders.tsx:291`: the CSV date uses `toISOString()` (UTC), so orders placed between 00:00 and 03:00 Nairobi time get the previous day.
  - [x] `routes/reconciliation.tsx:17, :49`: the date range has the same UTC problem. `:132, :213` show raw ISO dates to staff.
- [x] `components/dashboard/RevenueChart.tsx:59` uses a hand-built `toFixed(0)}k`. Use Intl compact notation.
- [x] `components/layout/NotificationBell.tsx:10` builds relative times by hand. Use `Intl.RelativeTimeFormat`.

### 1.3 Confirm money and status actions
- [x] `components/orders/OrderSheet.tsx:197-209`: "Mark as paid", "Out for delivery" and "Mark received" run on one tap, with no confirmation, no undo, and no "working…" label.
- [x] `routes/promotions.tsx:245-251`: "Deactivate" has no confirmation, and "Pause" and "Deactivate" sit side by side with no clear difference. *(They did the same thing: Deactivate was removed; Pause is one-tap reversible.)*
- [x] `routes/promotions.tsx:279`: "Remove sale" has no confirmation or undo.
- [x] `components/products/VariantsSheet.tsx:100`: deleting a variant uses `window.confirm`, while products and categories use a Dialog. Pick one.

### 1.4 Template leftovers
- [x] `client/index.html:7`: the tab title is `BHVR`.
- [x] `client/index.html:5`: the favicon is `/vite.svg`.
- [x] `client/index.html` has no `theme-color` or `color-scheme` meta.
- [x] `components/layout/DashboardLayout.tsx:155`: the sidebar brand "BagStreet" is an `<h1>`, so every page has two h1s. The login pages spell it "Bagstreet"; pick one spelling.

---

## 2. The till on a tablet

- [ ] `components/orders/WalkInSaleDialog.tsx:161, :172`: at 768px the voucher, payment and customer fields sit below the item list in an inner scroll area about 400px tall. I confirmed this in the browser. On narrow screens, stack the cart and payment above the catalogue, or give them a fixed footer.
- [ ] `WalkInSaleDialog.tsx:96-99`: Esc, tapping outside or Cancel throws away the whole cart without asking.
- [ ] `WalkInSaleDialog.tsx:306`: `Number(v) || 1` turns an emptied quantity box into 1, so typing "3" gives "13".
- [ ] `WalkInSaleDialog.tsx:449-451`: while saving, only a spinner shows. Change the label to "Recording sale…".
- [ ] `WalkInSaleDialog.tsx:436-440`: the error sits far from the submit button and has no `role="alert"`.
- [ ] `WalkInSaleDialog.tsx:405-421`: the phone field has no `type="tel"`. No field has `autoComplete`, and the email field doesn't turn off spellcheck.
- [ ] `WalkInSaleDialog.tsx:351`: the voucher code field doesn't turn off spellcheck.
- **Buttons that only appear on hover** are invisible on touch screens and have no `aria-label`:
  - [ ] `routes/orders.tsx:319-329`: Copy order reference, which also gives no "copied" feedback;
  - [ ] `routes/orders.tsx:432-440`: View order;
  - [ ] `routes/products.tsx:429-456`: Edit, Sale and Remove;
  - [ ] `components/products/ProductDialog.tsx:412-419`: "Make main", which doesn't say which image it applies to.
- [ ] `components/orders/PaymentStatusChip.tsx:33`: the "Needs review" and "Reversed" explanations exist only in `title`, so touch and screen-reader users never see them.

---

## 3. Accessibility

### 3.1 Sign-in forms
- [ ] `routes/login.tsx:90-108`: the inputs have no `name` and no `autoComplete` (`email`, `current-password`), so password managers don't work.
- [ ] `routes/forgot-password.tsx:66`, `routes/reset-password.tsx:81, :93` and `routes/accept-invite.tsx:82, :94` have the same problem; the new-password fields need `autoComplete="new-password"`.
- [ ] `routes/login.tsx:93, :105`: the placeholders aren't example values ending in "…", and the `••••` placeholder adds nothing.
- [ ] Errors aren't announced: `login.tsx:119`, `forgot-password.tsx:79`, `reset-password.tsx:103`, `accept-invite.tsx:104`.
- [ ] `reset-password.tsx:48-58` and the equivalent in `accept-invite.tsx`: the "Invalid link" card is a dead end with no link back to sign in.
- [ ] `routes/login.tsx:53`: the spinner has no label.

### 3.2 Form fields with no label (placeholder only)
- [ ] `routes/promotions.tsx:119-166`: all six fields. The expiry date field (`:161`) has neither a label nor a placeholder. The code field (`:119`) also needs `spellCheck={false}` and `autoComplete="off"`.
- [ ] `routes/products.tsx:557-574`: in the sale dialog, the `<label>` elements have no `htmlFor`/`id`, and the raw `<input>` elements don't use the shared `Input`, so they have no focus ring. The placeholder at `:564` is the raw price.
- [ ] `routes/shipping.tsx:121, :132`: the `<label>` elements have no `htmlFor`, and the raw inputs use `focus:` where they should use `focus-visible:`.
- [ ] `components/products/VariantsSheet.tsx:209-238`: the Delta, Reason and Note labels have no `htmlFor`, and the raw `<select>` isn't styled like the rest. The hint "−500" uses U+2212, which can't be typed into a number field.
- [ ] `components/products/ProductDialog.tsx:257`: the category `SelectTrigger` has no `id`, so the label at `:249` points at nothing.
- [ ] `components/categories/CategoryDialog.tsx:114, :120`: same problem for the parent select. The placeholder at `:106` ("Electronics, Clothing, Books...") doesn't fit this shop.
- [ ] `components/import/CsvImportDialog.tsx:87`: the "CSV file" label has no `htmlFor`.
- [ ] `components/orders/OrderSheet.tsx:237-242`: the write-off textarea has a placeholder and no label.
- [ ] `components/orders/OrderPaymentsPanel.tsx:257-262`: the transaction-code field needs `spellCheck={false}` and `autoComplete="off"`.
- [ ] Search boxes have no label: `components/products/ProductsDataTable.tsx:98`, `components/categories/CategoriesDataTable.tsx:70`, `routes/users.tsx:206`, `routes/gift-vouchers.tsx:64`, `components/gift-vouchers/CheckBalanceCard.tsx:24`. The Users filter selects (`users.tsx:213, :224`) have no label either.
- [ ] `components/gift-vouchers/VoucherSheet.tsx:153, :184, :187`: the cancel reason, adjustment amount and adjustment reason fields have only placeholders.
- [ ] `components/gift-vouchers/IssueVoucherForm.tsx:94`: the phone field has no `type="tel"` or `autoComplete`.

### 3.3 Errors and status messages aren't announced (add `role="alert"` or `aria-live`)
- [ ] Orders and payments:
  - `components/orders/OrderSheet.tsx:258-262`
  - `OrderPaymentsPanel.tsx:65, :278`
  - `OrderReceiptDialog.tsx:534`, where the spinner at `:529-531` also needs `role="status"`
  - `routes/orders.tsx:473-477`, where the load error also has no retry or next step
  - `routes/reconciliation.tsx:78, :200`
- [ ] Catalogue, settings and import:
  - `routes/products.tsx:577`
  - `components/products/VariantsSheet.tsx:146, :403`, where the same error appears twice
  - `routes/shipping.tsx:155`
  - `routes/promotions.tsx:107`, a single banner shared by every form
  - `routes/settings.tsx:147` and `StorefrontHeroCard.tsx:135` (success messages)
  - `components/import/CsvImportDialog.tsx:101, :107`
- [ ] Dashboard: `routes/dashboard.tsx:548-553`.
- [ ] Gift vouchers:
  - `components/gift-vouchers/CheckBalanceCard.tsx:32`
  - `IssueVoucherForm.tsx:105`
  - `VoucherSheet.tsx:95, :154, :188`
  - `IssuedVoucherDialog.tsx:55` ("Copied")
- [ ] Spinners with no label: `components/layout/DashboardLayout.tsx:112, :122`.

### 3.4 Icon-only buttons and toggles
- [ ] `routes/products.tsx:397-409`: the featured star needs an `aria-label`, `aria-pressed` and `type="button"`. The mobile version is at `ProductsDataTable.tsx:154-164`.
- [ ] `components/products/ProductsDataTable.tsx:196-210`: the mobile Edit, Sale and Remove buttons need `aria-label`.
- [ ] `components/products/VariantsSheet.tsx:155, :204`: the "✕" close buttons need `aria-label`.
- [ ] `components/products/VariantsSheet.tsx:296-302`: the clickable `Badge` is a `<span onClick>`. It can't be reached by keyboard and isn't announced as a toggle.
- [ ] `routes/shipping.tsx:207-215`: the status toggle has no `type` and no accessible state. The Edit and Delete icon buttons at `:219-234` have no `aria-label`.
- [ ] `routes/users.tsx:150-160`: every row's Edit and Delete sound the same to a screen reader. Add the user's name to the label.
- [ ] `components/layout/NotificationBell.tsx:103`: the label doesn't include the unread count, the badge at `:108` isn't announced, and there's no `aria-haspopup`. The unread dot at `:146` is shown by colour alone.
- [ ] `routes/gift-vouchers.tsx:127` (status filters) and `components/gift-vouchers/IssueVoucherForm.tsx:56` (quick amounts) need `aria-pressed`.
- [ ] `routes/products.tsx:96-104`: the stock status dot is shown by colour and `title` only.
- [ ] `routes/products.tsx:41-48`: the sort headers have no `aria-sort`, and the icon looks the same for ascending, descending and unsorted.
- [ ] `routes/categories.tsx:87, :132`: the inline SVG sort icons need `aria-hidden`.
- [ ] `components/orders/OrderReceiptDialog.tsx:524-527`: the dialog has no DialogTitle or Description, so it has no accessible name. `showCloseButton={false}` also leaves no visible way to close it.

### 3.5 Focus and keyboard
- [ ] `components/ui/input.tsx:12` and `components/ui/select.tsx:36`: the focus ring is `ring-ring/15`, which is nearly invisible. `button.tsx` and `textarea.tsx` use `/50`. Make them all the same and visible.
- [ ] `components/layout/DashboardLayout.tsx:199`: the account button's focus ring is too faint for the same reason. The menu items at `:223, :233` have no focus-visible style, and they use `role="menu"` without arrow-key handling.
- [ ] `components/layout/DashboardLayout.tsx:186`: there is no skip-to-content link.
- [ ] `routes/orders.tsx:570-578`: clickable rows have no keyboard handler. The View button covers this but is hidden until hover (see section 2).

### 3.6 Headings
- [ ] `routes/dashboard.tsx:236, :282, :336, :399, :462, :627`: section titles are `CardTitle` divs, so the page has an h1 and no h2s.
- [ ] `components/orders/OrderReceiptDialog.tsx:434`: an h3 appears with no h2 above it.

---

## 4. State and layout

### 4.1 Lists forget where you were
These should keep their filters, page and other state in the URL, so refresh, Back and shared links work.
- [ ] `routes/orders.tsx:202-207`: status filter, payment filter, page and sort. Only `order_id` is in the URL today.
- [ ] `routes/products.tsx:125-132`: search and page.
- [ ] `routes/users.tsx:55-59`: search, role, status and page.
- [ ] `routes/gift-vouchers.tsx:26-29`: status, search and page.
- [ ] `routes/compliance.tsx:30`: the active tab.
- [ ] `routes/reconciliation.tsx:48-50`: the date range.

### 4.2 The orders list
- [ ] `routes/orders.tsx:202, :450`: sorting only reorders the 20 rows on the current page, so "Total" and "Date" sorts are misleading. Sort on the server.
- [ ] `routes/orders.tsx:489-493`: the status filter has no "Processing" or "Out for delivery" option.
- [ ] `routes/orders.tsx:555`: `min-w-[1500px]` pushes the Total, Date and Actions columns off-screen on laptops between 1024px and 1500px.
- [ ] `components/products/ProductsDataTable.tsx:227`: `min-w-[1080px]` inside `overflow-hidden` clips columns between the `lg` breakpoint and about 1080px plus the sidebar width.
- [ ] `routes/reconciliation.tsx:120, :239-240, :257`: order numbers in issues are plain text. Link them to `/orders?order_id=…`.

### 4.3 Phone width (390px), confirmed in the browser
- [ ] `components/layout/NotificationBell.tsx:117`: the panel (`w-80 right-0`) runs 22px off the left edge.
- [ ] `routes/dashboard.tsx`: the "Payment Follow-up" and "Stock Risks" cards push the page to 478px wide, so it scrolls sideways.
- [ ] `components/layout/DashboardLayout.tsx:189` and `routes/gift-vouchers.tsx:40`: these use `px-6`/`p-6` at every width, while other pages use `p-4` on phones.
- [ ] `components/gift-vouchers/VoucherSheet.tsx:86`: the admin action row (`flex gap-2`) doesn't wrap in a narrow sheet.

---

## 5. Polish

### 5.1 Empty states and counts that mislead
- [ ] `components/products/ProductsDataTable.tsx:216-221, :258-266`: shows "Your catalogue is empty" when a search just has no matches.
- [ ] `routes/orders.tsx:545, :593`: shows the raw status ("No PENDING orders"), ignores the payment filter, and with a payment-only filter says "Share your store link on Instagram".
- [ ] `routes/users.tsx:272-276`: with filters on, says "No users found" and offers "Invite user" where it should offer "Clear filters".
- [ ] `routes/gift-vouchers.tsx:75`: says "No vouchers yet" when a filter is the reason the list is empty.
- [ ] `routes/categories.tsx:198`: `total={categories.length}` gives the count for the current page, so the "N total" in the pager is wrong.

### 5.2 Copy and labels
- [ ] Three dots instead of "…":
  - `routes/products.tsx:483, :590, :623`
  - `components/products/VariantsSheet.tsx:157, :241, :349, :359, :405`
  - `routes/orders.tsx:531`
  - `components/orders/WalkInSaleDialog.tsx:181, :190`
  - `routes/compliance.tsx:72, :85, :111, :115, :161`
  - `components/import/CsvImportDialog.tsx:132`
  - the search placeholders
- [ ] `routes/compliance.tsx:80, :113-114, :160`: dropdowns show raw values ("IN_PROGRESS", "NOT_REQUIRED").
- [ ] `routes/compliance.tsx:111`: "Loading incidents..." isn't muted, unlike `:72`.
- [ ] `components/orders/OrderSheet.tsx:269`: "Delivery Details" breaks the sentence-case convention.
- [ ] `components/orders/OrderPaymentsPanel.tsx:283`: renders "Record  refund" with a double space when the amount is invalid.
- [ ] `components/orders/OrderReceiptDialog.tsx:548-551`: "Save PDF" does exactly what "Print" does.
- [ ] `routes/settings.tsx:118`: "Name - email" uses a hyphen where it should use a dash.
- **Submit buttons that stay disabled without saying why:**
  - [ ] `components/orders/OrderPaymentsPanel.tsx:191, :282`: needs a reason of three or more characters, and nothing says so;
  - [ ] `components/products/ProductDialog.tsx:461`;
  - [ ] `components/gift-vouchers/IssueVoucherForm.tsx:106`;
  - [ ] `components/gift-vouchers/CheckBalanceCard.tsx:26`.

  Keep them enabled and show an inline error, or say what's missing.

### 5.3 Content and images
- [ ] `routes/products.tsx:289-293` and `components/products/ProductsDataTable.tsx:137`: thumbnails need `width`/`height` and `loading="lazy"`.
- [ ] `components/products/ProductDialog.tsx:334`: every gallery image has the same alt text.
- [ ] `components/products/VariantsSheet.tsx:278`: the SKU is cut to 8 characters, and there's no way to see the full SKU.
- [ ] `components/products/VariantsSheet.tsx:283-287`: stock numbers need `tabular-nums`, and `text-amber-600` should be a theme token.
- [ ] `components/orders/OrderSheet.tsx:330-363` and `OrderReceiptDialog.tsx:457, :460, :473-480`: amounts need `tabular-nums`.
- [ ] `routes/reconciliation.tsx:194` and `components/settings/StorefrontHeroCard.tsx:103`: long filenames don't truncate. The flex child needs `min-w-0`.
- [ ] `components/import/CsvImportDialog.tsx:44-47`: the object URL is never revoked.

### 5.4 Styling consistency
- [ ] `routes/promotions.tsx`, `routes/shipping.tsx`, the sale dialog in `routes/products.tsx`, and `components/settings/StorefrontHeroCard.tsx:111-121` use raw `<input>`/`<label>` elements in place of the shared `Input`, `Label` and `Select`.
- [ ] `components/products/ProductDialog.tsx:443`: the raw checkbox uses `border-gray-300` instead of the theme tokens.
- [ ] The `ui-press` and `ui-toggle-thumb` classes are used but never defined in `client/src/index.css`, so the settings switch thumb snaps without a transition.

### 5.5 Motion and performance
- [ ] `client/src/index.css:210-220`: the `.skeleton` shimmer runs forever and has no `prefers-reduced-motion` guard. `animate-spin` and `animate-pulse` aren't covered either.
- [ ] `client/src/index.css:1`: Inter is loaded with a render-blocking Google Fonts `@import`. Self-host it, as the storefront does, or preconnect and preload.

---

## Already good
- `routes/compliance.tsx` has proper tabs with roles and keyboard handling, labelled inputs, and `role="alert"`/`role="status"`.
- No page scrolls sideways at desktop or tablet width.
- The Gift vouchers screens and the order payments panel are clear and consistent with each other.
- Lucide icons are hidden from screen readers by default, and the shared Button has a visible focus ring.

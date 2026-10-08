# Motion Checks

With the client development server running, open
`http://localhost:5173/tests/motion.html`. This fixture uses the actual shared UI
components without authentication or API calls. It is not a production build entry.

1. Open and dismiss the dialog and sheet with the close button and Escape. Check
   centering, correct slide direction and focus returning to the trigger.
2. Open the select, change an option and reopen it. It should expand from the
   trigger, retain the selection and dismiss without a lingering overlay.
3. Hover the first tooltip, then move to the second. The first has a 350ms delay;
   the next appears instantly. Tab between them: keyboard tooltips never animate.
4. Rapidly toggle the menu. Its transition should reverse smoothly, and closed
   menu actions must not be reachable using Tab.
5. Enable Reduce motion and repeat. The fixture activates the exact shared
   reduced-motion rules, without changing OS settings. Buttons do not scale;
   dialogs and sheets use a 1ms fade instead of scaling or sliding.
6. Repeat at 390px and 320px widths. Dialogs remain centered, controls stay inside
   the viewport, and hover and press states must not change layout dimensions.

On the storefront, also check search focus/Escape, mobile menu dismissal, product
image hover, fixed-size gallery indicators, and gallery/rail scrolling with the
OS Reduce motion preference enabled. Browser fixture checks do not replace this
native preference check or testing authenticated admin pages.

# Global operations-room background

## Changes
- Reuse the existing local cybersecurity operations-room image as the shared background on the document body.
- Keep the image fixed, centered, and cover-sized so every route shows one continuous backdrop while scrolling.
- Add a strong dark mask plus the existing subtle grid treatment for readable text and controls.
- Remove the landing page’s duplicate image layer so the same global background appears consistently on landing, login, dashboard, and admin pages.

## Validation
- Check landing, authentication, and workspace layouts at the current compact viewport.
- Confirm the local asset bundles successfully and the preview has no build errors.

## Technical details
- The image remains a bundled local asset referenced from the global stylesheet, with no external URL dependency.
- Existing panels and navigation surfaces remain intact above the masked background.

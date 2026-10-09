# Add real app screenshots here

Suggested filenames (PNG, JPEG, or WebP):

- `01-pantry.png` — inventory with useful sample items and expiry information
- `02-capture.png` — receipt/order review with editable results
- `03-recipes.png` — recipe discovery or detail
- `04-shopping.png` — a shared shopping list

Use a demo household, consistent device dimensions, and no personal information or invite
codes. Do not use mockups as evidence of working app behavior. Add descriptions in
`captions.json` (filename → meaningful alt text) if using different screenshots.

From the repository root, install `web/legal/requirements.txt`, then run
`python web/legal/generate.py`. It updates both the website gallery and the README gallery.
Commit the images, captions, and generated output together.

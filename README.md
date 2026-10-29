# Rimaz Chat v17

Fixes in this version:
- Carries the exact selected gift artwork index from the picker through the server event, so gifts that share the same emoji do not turn into an older gift.
- Stores the selected artwork index with the granted gift and shows the same artwork in the incoming gift animation and member badge.
- Tightens gift image containment in grid tiles to reduce visual clipping.

Deployment: upload the project files and `public/gifts/` folder together. Keep your live `data.json` unchanged.

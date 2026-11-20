# Rimaz v46.93.73 — Admin navigation usability correction

- Root cause addressed: admin navigation accordion allowed multiple groups to remain expanded, creating a crowded and hard-to-hit navigation area on mobile; admin modal width and navigation/body sizing were constrained by earlier global overrides.
- Admin navigation now opens only the group containing the selected tab; selecting a tab brings it into view.
- Admin overlay uses a responsive wide panel; navigation and content scroll independently.
- Tab controls and admin actions receive larger mobile hit targets; admin action grids are responsive.
- Permissions and server-side endpoints are unchanged.
- Package version: 46.93.73.
- Verification: run `npm test`; check syntax and archive integrity. No live Deplexo/browser-device verification is claimed.

# BizPulse KZ — "Весь бизнес на одном экране за 30 секунд"

## Design Guidelines

### Design References
- **Stripe Dashboard**: Clean, data-dense, professional
- **Linear.app**: Modern dark/light, minimal, fast
- **Notion**: Clean sidebar navigation

### Color Palette
- Primary: #1E3A5F (Deep Navy — trust, business)
- Accent: #10B981 (Emerald Green — growth, positive)
- Warning: #F59E0B (Amber — attention)
- Danger: #EF4444 (Red — risk, negative)
- Background: #F8FAFC (Light Gray)
- Card: #FFFFFF
- Text Primary: #0F172A (Slate 900)
- Text Secondary: #64748B (Slate 500)

### Typography
- Font: Inter (clean, modern, business)
- H1: 28px bold
- H2: 22px semibold
- H3: 18px semibold
- Body: 14px regular
- Small: 12px regular

### Key Component Styles
- Cards: White bg, subtle shadow, 12px rounded
- KPI Cards: Large number + trend indicator (green/red arrow)
- Signals: Left border colored by severity (red/amber/green)
- Tables: Zebra striping, compact rows
- Charts: Recharts with brand colors

### Layout
- Sidebar navigation (collapsible)
- Main content area with responsive grid
- Dashboard: KPI cards top → Charts middle → Table + Signals bottom

### Images to Generate
1. **logo-bizpulse.png** — Modern business analytics logo, letter "B" with pulse/heartbeat line, navy and emerald colors, minimal (Style: minimalist, transparent)
2. **hero-dashboard-preview.jpg** — Abstract business dashboard visualization, data flowing, dark navy background with emerald accents (Style: 3d, modern)
3. **empty-state-upload.jpg** — Illustration of documents being uploaded to cloud, clean minimal style, light colors (Style: minimalist, illustration)
4. **empty-state-chart.jpg** — Illustration of charts and graphs being built, clean minimal style (Style: minimalist, illustration)

---

## Architecture (Frontend MVP with Local State)

Since this is a frontend-only deployment on Atoms, the MVP uses:
- **localStorage** for data persistence (simulating PostgreSQL)
- **Browser-side file parsing** (xlsx, csv via SheetJS; pdf via pdf-parse; docx via mammoth)
- **In-memory calculations** for metrics, signals
- **React Context** for auth/company state (simulating multi-tenant)

The architecture is designed so that replacing localStorage with real API calls is straightforward.

---

## File Plan

### Core Files (Pages + Components)
1. **src/pages/Login.tsx** — Login/Register page with company creation
2. **src/pages/Dashboard.tsx** — Main executive finance dashboard (KPI + charts + signals)
3. **src/pages/Uploads.tsx** — Upload center for Excel/CSV files
4. **src/pages/Documents.tsx** — Document management (PDF/DOCX)
5. **src/pages/Settings.tsx** — Basic settings page

### Shared Infrastructure
6. **src/lib/store.ts** — Local storage data layer (CRUD for all entities)
7. **src/lib/metrics.ts** — Financial + investor metrics calculations + signals engine
8. **src/components/AppLayout.tsx** — Sidebar layout wrapper

### Supporting Files (smaller, combined where possible)
- **src/lib/parsers.ts** — File parsing utilities (xlsx, csv, pdf, docx)
- **src/lib/types.ts** — All TypeScript interfaces
- **src/components/KPICard.tsx** — Reusable KPI card
- **src/components/SignalsPanel.tsx** — Signals list component
- **src/components/FileUploader.tsx** — File upload + preview component

### Updated Files
- **src/App.tsx** — Routes
- **index.html** — Title update

---

## Development Tasks

1. Create types.ts + store.ts (data layer)
2. Create metrics.ts + parsers.ts (business logic)
3. Create AppLayout + KPICard + SignalsPanel + FileUploader components
4. Create Login page
5. Create Dashboard page (KPI + Recharts + transactions table + signals)
6. Create Uploads page
7. Create Documents page
8. Create Settings page
9. Update App.tsx routes + index.html
10. Generate images
11. Install dependencies (xlsx, mammoth, pdfjs)
12. Lint + build + check
# BizPulse Revenue Control Tower — Design System Implementation Plan

Implementation-oriented plan to convert the UX/UI redesign system into concrete coding tasks for the existing frontend.

---

## 1. Global Design System Changes

### 1.1 Color Tokens

**File to modify:** `app/frontend/src/index.css` (or `globals.css`)

Add CSS custom properties under `:root` for the Revenue Control Tower palette:

```css
/* Revenue Control Tower — Semantic palette */
--rct-page-bg: 210 40% 98%;           /* #F8FAFC equivalent */
--rct-card-bg: 0 0% 100%;
--rct-border: 214 32% 91%;             /* slate-200 */
--rct-border-subtle: 214 32% 96%;     /* slate-100 */

--rct-primary: 215 60% 24%;           /* #1E3A5F navy */
--rct-primary-hover: 215 55% 22%;

--rct-success: 160 84% 39%;           /* emerald-600 */
--rct-success-tint: 152 69% 95%;      /* emerald-50 */

--rct-warning: 38 92% 50%;            /* amber-500 */
--rct-warning-tint: 48 96% 89%;      /* amber-50 */

--rct-danger: 0 84% 60%;             /* rose-500 */
--rct-danger-tint: 0 93% 94%;        /* rose-50 */
```

**File to modify:** `tailwind.config.js`

Add to `theme.extend.colors` (or keep using Tailwind slate/emerald/amber/rose directly; current code uses hardcoded `#1E3A5F` — keep for compatibility, but standardize all new usage to `rct-primary` if tokens are added).

**Practical rule:** All new/refactored components must use:
- `bg-[#F8FAFC]` or `bg-slate-50` for page background
- `border-slate-200` for card borders
- `#1E3A5F` or `bg-[#1E3A5F]` for primary buttons and active nav
- `emerald-*` for success (positive revenue, paid, good)
- `amber-*` for warning (overdue, caution, fallback attribution)
- `rose-*` for danger (critical risk, error)

### 1.2 Typography Classes

**Standard class mapping (use consistently):**

| Element | Class |
|--------|-------|
| Page title | `text-2xl font-bold text-slate-900` |
| Section title (card header) | `text-base font-semibold text-slate-900` |
| Sub-section title | `text-sm font-semibold text-slate-900` |
| KPI value | `text-2xl font-bold text-slate-900 tracking-tight` |
| KPI subtitle | `text-xs text-slate-500` |
| Body microcopy | `text-sm text-slate-600` |
| Label | `text-sm font-medium text-slate-700` |
| Tooltip title | `text-sm font-medium text-slate-900` |
| Tooltip body | `text-xs text-slate-600` |
| Muted / secondary | `text-xs text-slate-500` |

Create a small `lib/designTokens.ts` (optional) exporting string constants for these if you want to enforce consistency via imports; otherwise document and enforce via code review.

### 1.3 Spacing / Radius / Shadow Rules

**Spacing:**
- Card padding: `p-5` (20px) for standard cards; `p-4` for compact blocks inside cards
- Section vertical gap: `space-y-6` between major sections; `space-y-4` within a section
- KPI grid gap: `gap-4` (16px)
- Inline element gap: `gap-2` or `gap-3`

**Radius:**
- Cards: `rounded-xl` (12px) — change `Card` default from `rounded-lg` to `rounded-xl` where used for premium blocks
- Buttons: `rounded-md` (keep shadcn default)
- Badges / pills: `rounded-full` or `rounded-md`
- Small blocks inside cards: `rounded-lg`

**Shadow:**
- Cards: `shadow-sm` only; no `shadow-md` or `shadow-lg` except for modals/dropdowns
- Avoid multiple shadow layers

### 1.4 Reusable Component List

| Component | Location | Status |
|-----------|----------|--------|
| ControlTowerKpiCard | `components/controltower/ControlTowerKpiCard.tsx` | EXISTS — keep, minor polish |
| RecommendationsCard | `components/RecommendationsCard.tsx` | EXISTS — keep, ensure compact mode is default for dashboards |
| MetricHelpIcon | Inline in Dashboard, Marketing, Sales — **EXTRACT** to shared |
| SectionHeader | — | CREATE |
| RankedItemCard | — | CREATE (name + metric + progress bar) |
| InsightCard / ActionCard | — | CREATE (compact 3-line format for priority actions) |
| EmptyStateCard | — | CREATE |
| SkeletonBlock | — | Use shadcn Skeleton; create layout-specific wrappers |

### 1.5 Chart Styling Rules

**Recharts wrapper (all charts):**
- Container: `ResponsiveContainer width="100%" height={height}` — height 240–280px for hero charts, 180–220px for widget charts
- `CartesianGrid`: `strokeDasharray="3 3" stroke="#e2e8f0"`
- `XAxis` / `YAxis`: `tick={{ fontSize: 12 }}`
- `YAxis` tickFormatter: use `formatKZT` for money; for large numbers use `>= 1_000_000 ? \`${Math.round(v/1e6)}M\` : format(...)`
- Tooltip: use `RechartsTooltip` (alias to avoid conflict with shadcn Tooltip); formatter returns `formatKZT(value)` or `percentFromRatio(value)` as appropriate
- Line series: `strokeWidth={2} dot={false}`; use `strokeDasharray="6 4"` for secondary/risk series
- Bar fills: `#059669` (emerald) for positive/revenue; `#1E3A5F` (navy) for expected/neutral; `#d97706` (amber) for warning; `#dc2626` (rose) for danger
- Max 2–3 series per chart

### 1.6 Badge / Tooltip / Alert Rules

**Badge:**
- Use `variant="outline"` for semantic badges
- Priority: `high` → `text-red-700 border-red-300`; `medium` → `text-amber-700 border-amber-300`; `low` → `text-blue-700 border-blue-300`
- Kind (risk/action/insight): neutral `text-slate-600 border-slate-300`
- Count badges: `variant="outline"` with `text-xs`

**Tooltip (MetricHelpIcon):**
- Structure: `what` (title) + `why` (body) — optionally `how` if not too long
- `TooltipContent`: `className="max-w-[320px]"`; padding consistent with shadcn
- Trigger: circle icon `w-5 h-5 rounded-full border border-slate-200`; `aria-label="Что это?"`

**Alert:**
- Use sparingly; only for blocking/important messages (e.g. "Нет данных — загрузите файлы или включите демо")
- Prefer inline empty-state copy in cards over global alerts

---

## 2. Shared UI Components to Create or Refactor

### 2.1 MetricHelpIcon (EXTRACT)

- **Purpose:** Single reusable help icon with tooltip for KPI/section explainability
- **Where used:** Dashboard, MarketingToRevenueDashboard, SalesCashPriorities, any new KPI/section block
- **Location:** `components/controltower/MetricHelpIcon.tsx`
- **API:**
  ```ts
  interface MetricHelpIconProps {
    helpKey: MetricHelpKey;
    className?: string;
  }
  ```
- **Behavior:** Renders trigger (HelpCircle in circle) + Tooltip with METRIC_HELP[helpKey].what and .why

**Implementation:** Copy current implementation from `RecommendationsCard.tsx` and `Dashboard.tsx`; remove duplicates from pages; import from `MetricHelpIcon`.

---

### 2.2 SectionHeader

- **Purpose:** Consistent section title with optional help icon and badge
- **Where used:** Card headers across all dashboards when the section has a helpKey
- **API:**
  ```ts
  interface SectionHeaderProps {
    title: string;
    helpKey?: MetricHelpKey;
    badge?: string;
    description?: string;
  }
  ```
- **Behavior:** Renders `title` + optional MetricHelpIcon + optional badge; optional description below

---

### 2.3 RankedItemCard

- **Purpose:** One row in a ranked list: label + value + progress bar
- **Where used:** Paid revenue by source, overdue invoices ranked, delayed customers, best/worst channels
- **API:**
  ```ts
  interface RankedItemCardProps {
    label: string;
    sublabel?: string;
    value: string;
    progressPct: number; // 0–100
    barColor?: 'emerald' | 'amber' | 'rose' | 'slate';
  }
  ```
- **Behavior:** Flex layout; label (truncate) + value (right); progress bar below; barColor maps to Tailwind fill

---

### 2.4 InsightCard (compact action/risk card)

- **Purpose:** Single recommendation or priority action in compact 3-line format
- **Where used:** RecommendationsCard items; priority action queue in Dashboard rail and SalesCashPriorities
- **API:**
  ```ts
  interface InsightCardProps {
    title: string;
    kind: 'risk' | 'action' | 'insight';
    priority: 'high' | 'medium' | 'low';
    what: string;
    why: string;
    next: string;
    tags?: string[];
    compact?: boolean;
  }
  ```
- **Behavior:** Badges (kind, priority) + title + three labeled lines (Проблема, Влияние, Следующий шаг)

---

### 2.5 EmptyStateCard

- **Purpose:** Consistent empty state for cards/sections
- **Where used:** Dashboard “Нет данных”, Marketing empty, Sales empty, Upload preview empty
- **API:**
  ```ts
  interface EmptyStateCardProps {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  }
  ```
- **Behavior:** Centered content; title + description + optional CTA button

---

### 2.6 ControlTowerKpiCard (REFACTOR — minor)

- **Current:** Already has title, value, subtitle, icon, status, sparkline
- **Changes:**
  - Ensure `rounded-xl` is used
  - Ensure status border/tint mapping is consistent (default, success, warning, danger)
  - Add optional `metaBadge` prop for “fallback” / “exact” calculation mode chip

---

### 2.7 RecommendationsCard (REFACTOR — minor)

- **Current:** Renders list of recommendation items with badges and 3-line format
- **Changes:**
  - Use new `InsightCard` internally for each item (or keep inline structure but align styling)
  - Ensure `compact` defaults to `true` when used in dashboards
  - Card container: `rounded-xl border border-slate-200 shadow-sm`

---

## 3. Screen-by-Screen Implementation Plan

### 3.1 Login (`app/frontend/src/pages/Login.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | Split layout (hero left, form right); Tabs for login/register; form fields and validation logic |
| **Remove** | Nothing structural |
| **Redesign** | Hero: keep navy background, refine text hierarchy (h1 `text-4xl font-bold`); ensure bullet list uses `emerald-400` dot consistently. Form card: use `rounded-xl border border-slate-200 shadow-sm`; CardTitle `text-xl font-bold`; Input focus ring to use primary (navy) |
| **New blocks** | None |
| **Merge/simplify** | Ensure primary Button uses `bg-[#1E3A5F] hover:bg-[#1E3A5F]/90` consistently |
| **More visual** | Hero typography; subtle gradient or pattern on hero if desired (optional) |
| **More compact** | Slightly reduce vertical padding in form card if needed |

---

### 3.2 Register

Same file as Login (TabsContent value="register").

| Action | Details |
|--------|---------|
| **Keep** | All fields, validation, submit logic |
| **Redesign** | Same card styling as Login tab; ensure input heights and spacing match |
| **More compact** | Consider 2-column grid for reg fields on lg+ to reduce scroll |

---

### 3.3 Dashboard (`app/frontend/src/pages/Dashboard.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | All analytics logic, `calculateRevenueControlTowerAnalytics`, date range selector, `buildRecommendations`, navigation buttons to Marketing/Sales |
| **Remove** | Redundant “Короткая сводка” long text block if fully replaced by evidence widgets + rail |
| **Redesign** | KPI row: use ControlTowerKpiCard for all 6 KPIs with status/sparkline where applicable. Hero chart: keep current structure (paid revenue, expected inflow, overdue exposure). Evidence row: keep funnel + paid-by-source + cash-risk snapshot. Rail: keep top overdue + bottleneck + 2–3 actions. Recommendations: use RecommendationsCard compact, maxItems 3. Best/worst: keep side-by-side cards with progress bars |
| **New blocks** | None (already added in Phase 10) |
| **Merge/simplify** | Replace any remaining long “Риски и что делать” paragraph with structured rail content |
| **More visual** | Ensure funnel uses stacked bar or step visualization; ensure cash risk has clear visual weight |
| **More compact** | Recommendations: only top 3; tighten rail card padding |

---

### 3.4 MarketingToRevenueDashboard (`app/frontend/src/pages/marketing/MarketingToRevenueDashboard.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | All analytics, rows, channelNameById, CPL/CAC/costPerWonDeal logic, funnel drop-off, best/worst summary |
| **Remove** | Plain tables for “Источники: лиды, сделки, конверсия” and “Источники: деньги” — replaced by charts/ranked cards |
| **Redesign** | KPI row: ControlTowerKpiCard. Charts: source comparison (BarChart), spend vs paid (BarChart), conversion by source (horizontal bars or small chart), funnel drop-off (compact visual), paid revenue ranked (RankedItemCard list). Best/worst: side-by-side cards with progress bars. Recommendations: compact, top 3 |
| **New blocks** | Chart cards as per Phase 10 redesign |
| **Merge/simplify** | Single “Evidence” area with 3–4 chart/ranked widgets instead of two tables |
| **More visual** | All major blocks should be chart or ranked visual, not table |
| **More compact** | Best/worst cards; recommendation items |

---

### 3.5 SalesCashPriorities (`app/frontend/src/pages/SalesCashPriorities.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | All analytics, stalled deals, overdue invoices, delayed customers, priority actions |
| **Remove** | Raw tables for stalled deals, unpaid invoices, overdue invoices, delayed customers — replaced by age buckets + ranked cards |
| **Redesign** | KPI row: ControlTowerKpiCard. Stalled deals: age-bucket breakdown (0–7, 8–14, 15–30, 30+ days) + ranked list with progress. Invoices: money-stuck breakdown + receivables aging chart + overdue ranked list. Delayed customers: ranked cards with progress. Priority actions: compact action cards |
| **New blocks** | Already added in Phase 10 (aging, ranked lists) |
| **Merge/simplify** | Unpaid + overdue merged into one “Деньги и дебиторка” section with subsections |
| **More visual** | Receivables aging, overdue ranked, stalled-by-age |
| **More compact** | Action cards; delayed customer cards |

---

### 3.6 Upload Center (`app/frontend/src/pages/Uploads.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | File select, type selector, preview, validation, import logic, history |
| **Remove** | Nothing critical |
| **Redesign** | Card styling: `rounded-xl border border-slate-200 shadow-sm`. Header: same typography as other pages. Preview table: compact headers, consistent row hover. Success/error feedback: use consistent badge colors (emerald/rose). Empty state: use EmptyStateCard pattern |
| **New blocks** | Optional: “Template download” link styling as secondary button |
| **Merge/simplify** | Reduce FILE_TYPE_CONFIG description verbosity in UI if too long |
| **More visual** | Status badges (success/warning/error) for validation result |
| **More compact** | Preview table row density; template list |

---

### 3.7 Plan (`app/frontend/src/pages/Plan.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | All plan generation logic, forecastRevenue/Expenses/Profit, strengths/weaknesses/risks/actions |
| **Remove** | Nothing |
| **Redesign** | Forecast cards: use ControlTowerKpiCard or similar (status from positive/negative). Strengths/weaknesses/risks: convert bullet lists to compact cards with subtle left border (emerald/amber/rose by type). Action plan: use InsightCard-like layout (area badge, priority badge, title, rationale, target) |
| **New blocks** | Optional: simple trend bar or sparkline for forecast if data allows |
| **Merge/simplify** | Strengths/weaknesses/risks could share one card with internal tabs or accordion (optional) |
| **More visual** | Forecast numbers with status tint; action cards with clear hierarchy |
| **More compact** | Action card padding; list items in strengths/weaknesses/risks |

---

### 3.8 Layout / Sidebar / Topbar (`app/frontend/src/components/AppLayout.tsx`)

| Action | Details |
|--------|---------|
| **Keep** | Sidebar structure, nav items, collapse, mobile overlay, logout |
| **Remove** | Nothing |
| **Redesign** | Sidebar: active state `bg-[#1E3A5F] text-white` (already present). Ensure collapsed width 72px, expanded 260px. Border `border-slate-200`. Company block: `text-sm text-slate-500`. Mobile header: same styling, ensure logo + title visible |
| **New blocks** | Optional: nav group labels (e.g. “Контроль” vs “Данные”) with subtle separator |
| **Merge/simplify** | — |
| **More visual** | Slight hover transition on nav items |
| **More compact** | User block in sidebar; logout button |

---

## 4. Priority Order

### Phase 1 — Highest Impact

1. **Global tokens and Card/Button alignment**
   - Update `globals.css` with semantic tokens (optional but recommended)
   - Ensure all cards use `rounded-xl border border-slate-200 shadow-sm` consistently
   - Primary buttons: `bg-[#1E3A5F] hover:bg-[#1E3A5F]/90` everywhere

2. **Extract MetricHelpIcon**
   - Create `components/controltower/MetricHelpIcon.tsx`
   - Replace inline implementations in Dashboard, MarketingToRevenueDashboard, SalesCashPriorities, RecommendationsCard

3. **Dashboard polish**
   - Replace any remaining KPICard with ControlTowerKpiCard where not done
   - Ensure rail, evidence widgets, and recommendations follow SectionHeader + RankedItemCard patterns
   - Verify chart tooltip uses RechartsTooltip and formatKZT

4. **MarketingToRevenueDashboard polish**
   - Ensure all tables are replaced by charts/ranked cards (if any remain)
   - Standardize chart heights and colors
   - Best/worst cards use RankedItemCard pattern

5. **SalesCashPriorities polish**
   - Ensure delayed customers and any remaining tables use ranked cards
   - Receivables aging and stuck-money breakdown clearly structured

### Phase 2 — Secondary Polish

6. **Create SectionHeader**
   - Implement and use in all card headers that have helpKey

7. **Create RankedItemCard**
   - Implement and replace duplicated ranked-item markup in Dashboard, Marketing, Sales

8. **Create EmptyStateCard**
   - Implement and use in Dashboard, Marketing, Sales, Upload empty states

9. **Login/Register refinement**
   - Typography and spacing alignment; optional 2-col register layout

10. **Plan page**
    - Forecast cards with status; action cards with InsightCard-like layout

11. **Upload Center**
    - Card styling; validation badge consistency

### Phase 3 — Optional Refinement

12. **InsightCard extraction**
    - Extract from RecommendationsCard for reuse in priority action queues

13. **Sidebar nav groups**
    - Add subtle group labels if desired

14. **Loading skeletons**
    - Add skeleton layout for Dashboard/Marketing/Sales during data load (if applicable)

---

## 5. Implementation Constraints

**Must keep unchanged:**
- Business logic: `lib/analytics/*`, `lib/recommendations.ts`, `lib/metrics.ts`, `lib/demoData.ts`
- Routing: `App.tsx` routes, paths
- Data model: `lib/types.ts`, entity structures, store functions
- Demo mode: `seedDemoData`, “Демо-данные” flow

**May change:**
- Component structure and JSX layout
- CSS classes, Tailwind usage
- Visual hierarchy, spacing, typography
- Chart configuration (recharts props, not data)
- Presentation of recommendations (component structure, not `buildRecommendations` output)

---

## 6. Task Checklist (Direct Coding Tasks)

### 6.1 Global

- [ ] Add `--rct-*` tokens to `globals.css` (optional)
- [ ] Audit all `Card` usages: add `rounded-xl` where missing
- [ ] Audit all primary `Button`: ensure `bg-[#1E3A5F] hover:bg-[#1E3A5F]/90`

### 6.2 Shared Components

- [ ] Create `MetricHelpIcon.tsx`; remove duplicates from Dashboard, Marketing, Sales, RecommendationsCard
- [ ] Create `SectionHeader.tsx`
- [ ] Create `RankedItemCard.tsx`
- [ ] Create `EmptyStateCard.tsx`
- [ ] (Phase 2) Create `InsightCard.tsx`; refactor RecommendationsCard to use it

### 6.3 Dashboard

- [ ] Replace any KPICard with ControlTowerKpiCard
- [ ] Use MetricHelpIcon from shared
- [ ] Ensure hero chart tooltip uses RechartsTooltip + formatKZT
- [ ] Ensure rail content is compact
- [ ] Limit recommendations to top 3

### 6.4 MarketingToRevenueDashboard

- [ ] Replace remaining tables with charts/ranked cards
- [ ] Use MetricHelpIcon from shared
- [ ] Standardize chart colors per palette
- [ ] Use RankedItemCard for best/worst and paid-by-source

### 6.5 SalesCashPriorities

- [ ] Ensure all lists use ranked card pattern
- [ ] Use MetricHelpIcon from shared
- [ ] Compact action cards

### 6.6 Login

- [ ] Card `rounded-xl`; input focus ring
- [ ] Button primary style

### 6.7 Plan

- [ ] Forecast cards with status
- [ ] Action cards with consistent badge + layout

### 6.8 Upload Center

- [ ] Card styling; EmptyStateCard for empty preview

### 6.9 AppLayout

- [ ] Verify nav active state; optional group labels

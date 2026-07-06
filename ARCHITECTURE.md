# Architecture Overview

GeoSolarTool is intentionally designed as a static, browser-first application that can be deployed without a backend. The architecture prioritizes portability, simplicity, and fast iteration while preserving a professional geospatial analysis workflow.

## High-level goals

- Keep the app deployable as a static site.
- Preserve the existing UX/UI structure.
- Make the codebase easy to fork and extend.
- Separate map, analysis, layout, and export concerns.
- Keep the technical model understandable for contributors.

## Current runtime model

The current release is centered around a single `index.html` entry point. That file contains:

- Third-party dependencies loaded in the browser.
- The application shell.
- Map initialization.
- Drawing and analysis logic.
- PDF export behavior.

This model is good for rapid deployment and easy replication. It is also suitable as a starting point for a future modular architecture.

## Logical modules

### 1. App shell
Responsible for top-level layout, theme handling, tab navigation, and global actions such as search and PDF export.

### 2. Map workspace
Handles the geospatial canvas, base layers, user drawings, selection overlays, and interactive area editing.

### 3. Property analysis
Captures the building type, roof type, surface assumptions, and energy use profile.

### 4. Engineering engine
Calculates preliminary photovoltaic sizing, panel count, capacity, spacing assumptions, and scenario outputs.

### 5. Layout engine
Simulates rooftop panel arrangement, orientation, grouping, and approximate usable density.

### 6. Technical analysis panel
Displays metrics, scenario summaries, and engineering guidance.

### 7. PDF export
Builds the printable output and converts the current analysis state into a report-like deliverable.

## Data flow

1. The user searches or navigates to a location.
2. The user draws or edits one or more areas.
3. The app calculates area geometry and usable surface.
4. The engineering engine generates technical estimates.
5. The UI updates all summary panels and scenario cards.
6. The export flow prints or exports the current state as a PDF-friendly report.

## Suggested future modular structure

If the project is split into a more standard frontend architecture, this is the recommended structure:

```text
src/
├── components/
│   ├── layout/
│   ├── map/
│   ├── analysis/
│   └── export/
├── services/
│   ├── geometry/
│   ├── solar/
│   └── report/
├── hooks/
├── config/
├── styles/
└── utils/
```

## Key architectural decisions

### Static-first
The app should remain usable as a static site because that reduces infrastructure cost and makes deployment predictable.

### Browser-side computation
Geometry and sizing calculations are performed in the frontend so the app can work without a backend.

### Incremental extensibility
New capabilities should be added as modules that attach to the current model instead of replacing the whole UI.

### Deterministic output
Engineering estimates should be driven by explicit parameters and documented assumptions.

## Open-source readiness

The architecture is documented so other teams can:

- Fork the project.
- Replace the data defaults.
- Adjust analysis rules.
- Add local market logic.
- Swap in a different map or reporting layer.

## Contribution principles

When changing the architecture, preserve:

- The static deployment model.
- The current UI hierarchy.
- The map-centered workflow.
- The engineering summary flow.
- The report/export behavior.

## Future evolution

A later version may introduce:

- A component-based frontend build.
- Shared calculation libraries.
- Server-side project storage.
- Role-based access.
- Multi-project dashboards.
- Regional solar rule presets.

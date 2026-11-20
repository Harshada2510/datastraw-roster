# DataStraw Roster — Frontend

React + Vite admin dashboard for the DataStraw Smart Roster Management System.

## Current step

Step 14 provides the application shell: a responsive sidebar, top navigation,
React Router navigation, and placeholder pages for every module. No API data is
loaded yet and roster generation is not implemented.

## Run locally

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).
`/` redirects to the Dashboard page.

Other commands:

```powershell
npm run build   # production build
npm run lint    # ESLint checks
```

## Project structure

```
src/
  config/navigation.js       Sidebar groups, routes, icons and page titles
  components/                Reusable layout components
    DashboardLayout.jsx      Shell with sidebar + topbar + routed content
    Sidebar.jsx              Responsive navigation with active highlighting
    Topbar.jsx               App name, current page title, profile section
    PlaceholderPage.jsx      Shared placeholder screen for modules
  pages/                     One file per route (Dashboard + 10 modules)
  App.jsx                    Route definitions
  main.jsx                   BrowserRouter entry point
  index.css                  Global reset and theme variables
  App.css                    Dashboard layout and component styles
```

The backend FastAPI service runs separately from `backend/` on
`http://127.0.0.1:8000`. API integration will be added in later steps.

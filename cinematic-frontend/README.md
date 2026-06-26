# CINEMATIC AI — Frontend

React 18 + Vite + TypeScript + Tailwind CSS + Zustand SPA connected to the Express backend.

## Quick Start

```bash
# 1. Install dependencies
cd cinematic-frontend
npm install

# 2. Configure environment (already set by default)
cp .env.example .env
# Edit VITE_API_URL if backend runs on a different port

# 3. Start development server
npm run dev
```

App opens at **http://localhost:5173**

## Build for Production

```bash
npm run build
npm run preview
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | Backend API base URL |

## Running with the Backend

Make sure the backend is running first:
```bash
# Terminal 1 — backend
cd cinematic-backend && npm install && npm run dev

# Terminal 2 — frontend
cd cinematic-frontend && npm install && npm run dev
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — create a new film from a prompt |
| `/dashboard/:projectId` | Pipeline dashboard — real-time step progress |
| `/gallery/:projectId` | Asset gallery — all generated images, video, audio |
| `/provenance/:projectId` | Provenance viewer — manifest, checksums, lineage |
| `/export/:projectId` | Export & share — download and sharing options |
| `/library` | Project library — all films |

## Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand (with backend sync + polling)
- **Animations**: Framer Motion
- **HTTP**: fetch (native)

import LandingPage from './pages/LandingPage';
import PipelineDashboard from './pages/PipelineDashboard';
import AssetGallery from './pages/AssetGallery';
import ProvenanceViewer from './pages/ProvenanceViewer';
import ExportShare from './pages/ExportShare';
import ProjectLibrary from './pages/ProjectLibrary';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'Create Film',       path: '/',                          element: <LandingPage />,       public: true },
  { name: 'Pipeline Dashboard',path: '/dashboard/:projectId',      element: <PipelineDashboard />, public: true },
  { name: 'Asset Gallery',     path: '/gallery/:projectId',        element: <AssetGallery />,      public: true },
  { name: 'Provenance Viewer', path: '/provenance/:projectId',     element: <ProvenanceViewer />,  public: true },
  { name: 'Export & Share',    path: '/export/:projectId',         element: <ExportShare />,       public: true },
  { name: 'Project Library',   path: '/library',                   element: <ProjectLibrary />,    public: true },
];

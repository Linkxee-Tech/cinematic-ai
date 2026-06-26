import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/components/layouts/AppLayout';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <div className="dark">
      <Router>
        <AppLayout>
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/library" replace />} />
          </Routes>
        </AppLayout>
        <Toaster theme="dark" position="top-right" richColors />
      </Router>
    </div>
  );
};

export default App;

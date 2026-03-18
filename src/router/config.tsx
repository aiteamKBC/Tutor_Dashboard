
import { lazy } from 'react';
import { RouteObject } from 'react-router-dom';

const TutorDashboard = lazy(() => import('../pages/tutor/page'));
const TutorSummaryPage = lazy(() => import('../pages/tutor-summary/page'));
const NotFound = lazy(() => import('../pages/NotFound'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <TutorDashboard />,
  },
  {
    path: '/tutor',
    element: <TutorDashboard />,
  },
  {
    path: '/tutor-summary',
    element: <TutorSummaryPage />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'log',
    pathMatch: 'full',
  },
  {
    path: 'log',
    loadComponent: () =>
      import('./pages/log/log.page').then((m) => m.LogPage),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./pages/search/search.page').then((m) => m.SearchPage),
  },
];

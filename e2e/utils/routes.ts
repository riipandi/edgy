export const routes = {
  home: '/',
  users: '/users',
  user: (id: string) => `/users/${id}`,
  missing: '/this-page-does-not-exist'
} as const

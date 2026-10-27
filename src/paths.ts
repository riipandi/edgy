// URL builders for the app's pages; routes stay in sync through these.
export const paths = {
  home: () => '/',
  users: (id?: string) => (id === undefined ? '/users' : `/users/${id}`)
}

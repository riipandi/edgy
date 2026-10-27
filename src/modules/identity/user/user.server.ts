import { getRequest } from '@tanstack/react-start/server'
// Server-only readers behind the page loaders. Import only from
// createServerFn handlers or other server modules.
import { Effect } from 'effect'
import { getPageMeta } from '#/kernel/pagemeta.ts'
import { runWithUserService } from './user_context.ts'
import { parseUserId, toUserResult, type UserIdType, type UserResult } from './user_schema.ts'

// The users page reads one screen: no cursor UI exists there, so this reads
// a single page large enough to cover the seeded set.
export const fetchUsersPage = (): Promise<readonly UserResult[]> =>
  runWithUserService((service) =>
    Effect.map(service.list({ limit: 100, sortBy: 'id', sortOrder: 'asc' }), (result) =>
      result.users.map(toUserResult)
    )
  )

// The route boundary receives the raw route param; an unparseable id
// resolves to no user instead of failing the render. `?nocache=1` on the
// page request skips the cache for that read.
export const fetchUserPage = async (
  id: string
): Promise<{ user: UserResult; cache: string } | undefined> => {
  let userId: UserIdType
  try {
    userId = parseUserId(id)
  } catch {
    return undefined
  }
  const bypass = new URL(getRequest().url).searchParams.get('nocache') === '1'
  return runWithUserService((service) =>
    Effect.map(service.find(userId, bypass), (result) => {
      // The request middleware reads this back and publishes it as x-cache
      // on the HTML response; the header the server-function envelope sees
      // is not the page response.
      const meta = getPageMeta()
      if (meta !== undefined) meta.cache = result.cache
      return result.user === undefined
        ? undefined
        : { user: toUserResult(result.user), cache: result.cache }
    })
  )
}

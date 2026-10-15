import { getValidatedRouterParams, readValidatedBody, type H3Event } from 'h3'
import { runEffect } from '../httputils/responder.ts'
import { createUserInputStandard, userIdParamsStandard } from '../httputils/validator.ts'
import { createUser, getUser, listUsers } from '../service/user_service.ts'

/** `GET /users` — list every user. */
export async function listUsersHandler(event: H3Event) {
  return runEffect(event, listUsers)
}

/** `GET /users/:id` — fetch a single user. */
export async function getUserHandler(event: H3Event) {
  const { id } = await getValidatedRouterParams(event, userIdParamsStandard)
  return await runEffect(event, getUser(id))
}

/** `POST /users` — create a user from a validated JSON body. */
export async function createUserHandler(event: H3Event) {
  const input = await readValidatedBody(event, createUserInputStandard)
  return await runEffect(event, createUser(input))
}

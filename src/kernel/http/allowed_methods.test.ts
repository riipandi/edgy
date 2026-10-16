import { describe, expect, it } from '@effect/vitest'
import { H3 } from 'h3'
import { allowedMethods } from './allowed_methods.ts'

const app = new H3()
app.get('/items', () => 'list')
app.post('/items', () => 'create')
app.delete('/items/:id', () => 'remove')
app.put('/only-put', () => 'put')
app.all('/any', () => 'any')
app.get('/**', () => 'catch-all')

describe('allowedMethods', () => {
  it('lists the methods that have a route, in a fixed order, HEAD with GET', () => {
    expect(allowedMethods(app, '/items')).toEqual(['GET', 'HEAD', 'POST'])
    expect(allowedMethods(app, '/items/7')).toEqual(['DELETE'])
    expect(allowedMethods(app, '/only-put')).toEqual(['PUT'])
  })

  it('does not count the /** catch-all', () => {
    expect(allowedMethods(app, '/nowhere')).toEqual([])
  })

  it('counts a route for every method as all of them', () => {
    expect(allowedMethods(app, '/any')).toEqual([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ])
  })
})

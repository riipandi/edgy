import { describe, expect, it } from '@effect/vitest'
import { isProbe, quietReason } from './quiet_paths.ts'

describe('quietReason', () => {
  it('quiets what a browser asks for by itself, answered or not', () => {
    for (const path of [
      '/favicon.ico',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
      '/.well-known/appspecific/com.chrome.devtools.json'
    ]) {
      expect(quietReason(path, 404)).toBe('browser')
      expect(quietReason(path, 204)).toBe('browser')
    }
  })

  it('quiets crawler files', () => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/ads.txt', '/security.txt']) {
      expect(quietReason(path, 404)).toBe('crawler')
      expect(quietReason(path, 200)).toBe('crawler')
    }
  })

  it('quiets a successful probe but never a failing one', () => {
    for (const path of ['/health', '/metrics']) {
      expect(quietReason(path, 200)).toBe('probe')
      expect(quietReason(path, 503)).toBeUndefined() // draining
      expect(quietReason(path, 500)).toBeUndefined()
    }
  })

  it('quiets a scanner only while it gets a 404', () => {
    for (const path of [
      '/wp-login.php',
      '/wp-admin/setup-config.php',
      '/xmlrpc.php',
      '/index.php',
      '/phpmyadmin/',
      '/cgi-bin/luci',
      '/.env',
      '/.env.production',
      '/.git/config',
      '/.aws/credentials',
      '/actuator/health',
      '/server-status'
    ]) {
      expect({ path, reason: quietReason(path, 404) }).toEqual({ path, reason: 'scanner' })
      expect({ path, reason: quietReason(path, 200) }).toEqual({ path, reason: undefined })
      expect({ path, reason: quietReason(path, 500) }).toEqual({ path, reason: undefined })
    }
  })

  it('leaves ordinary requests alone, whatever the status', () => {
    for (const path of [
      '/',
      '/api/users',
      '/api/users/1',
      '/.well-known/security.txt',
      '/healthz'
    ]) {
      for (const status of [200, 201, 400, 404, 500]) {
        expect({ path, status, reason: quietReason(path, status) }).toEqual({
          path,
          status,
          reason: undefined
        })
      }
    }
  })

  it('does not treat a lookalike as noise', () => {
    expect(quietReason('/api/health', 200)).toBeUndefined()
    expect(quietReason('/wordpress', 404)).toBeUndefined()
    expect(quietReason('/envelope', 404)).toBeUndefined()
    expect(quietReason('/php', 404)).toBeUndefined()
  })
})

describe('isProbe', () => {
  it('is true only for polled infrastructure paths', () => {
    expect(isProbe('/health')).toBe(true)
    expect(isProbe('/metrics')).toBe(true)
    for (const path of ['/', '/favicon.ico', '/robots.txt', '/wp-login.php', '/api/users']) {
      expect(isProbe(path)).toBe(false)
    }
  })
})

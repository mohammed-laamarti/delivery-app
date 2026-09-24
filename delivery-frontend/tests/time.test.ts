import { describe, expect, it } from 'vitest'
import { formatMoroccoDateTime, moroccoDateAgeInDays, moroccoTodayIso } from '../src/time'

describe('Morocco time helpers', () => {
  it('preserves an API timestamp written as Morocco local time', () => {
    expect(formatMoroccoDateTime('2026-09-20T13:10:00', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })).toBe('13:10')
  })

  it('uses Morocco legal GMT for UTC timestamps after the 2026 change', () => {
    expect(formatMoroccoDateTime('2026-09-24T12:10:00Z', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })).toBe('12:10')
  })

  it('uses Morocco calendar dates for date-only calculations', () => {
    expect(moroccoTodayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(moroccoDateAgeInDays(`${moroccoTodayIso()}T08:00:00`)).toBe(0)
  })
})

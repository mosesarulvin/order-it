import { describe, expect, it } from 'vitest'
import {
  customerSignInSchema,
  customerSignUpSchema,
  passwordResetSchema,
  shopRegistrationSchema,
  strongPassword,
  indianPhone,
} from '@/lib/validation'

describe('validation schemas', () => {
  describe('indianPhone', () => {
    it.each(['9876543210', '6123456789', '7000000000'])('accepts %s', (v) => {
      expect(indianPhone.safeParse(v).success).toBe(true)
    })
    it.each(['1234567890', '9876', '98765432100', 'abcdefghij'])('rejects %s', (v) => {
      expect(indianPhone.safeParse(v).success).toBe(false)
    })
  })

  describe('strongPassword', () => {
    it('rejects passwords shorter than 8 characters', () => {
      expect(strongPassword.safeParse('a1b2c3').success).toBe(false)
    })
    it('rejects passwords without a digit', () => {
      expect(strongPassword.safeParse('abcdefgh').success).toBe(false)
    })
    it('rejects passwords without a letter', () => {
      expect(strongPassword.safeParse('12345678').success).toBe(false)
    })
    it('accepts a strong password', () => {
      expect(strongPassword.safeParse('Correct123').success).toBe(true)
    })
  })

  describe('customerSignInSchema', () => {
    it('normalises phone and requires password', () => {
      expect(customerSignInSchema.safeParse({ phone: '9876543210', password: 'x' }).success).toBe(true)
      expect(customerSignInSchema.safeParse({ phone: '9876543210', password: '' }).success).toBe(false)
    })
  })

  describe('customerSignUpSchema', () => {
    const base = {
      name:     'Arjun Kumar',
      phone:    '9876543210',
      email:    'user@example.com',
      birthday: '1990-01-15',
      password: 'Secret123',
    }

    it('accepts a valid signup', () => {
      expect(customerSignUpSchema.safeParse(base).success).toBe(true)
    })
    it('rejects an empty name', () => {
      expect(customerSignUpSchema.safeParse({ ...base, name: '' }).success).toBe(false)
    })
    it('rejects an invalid email', () => {
      expect(customerSignUpSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false)
    })
  })

  describe('passwordResetSchema', () => {
    it('requires confirmation to match', () => {
      expect(passwordResetSchema.safeParse({ password: 'Secret123', confirmPassword: 'Secret123' }).success).toBe(true)
      expect(passwordResetSchema.safeParse({ password: 'Secret123', confirmPassword: 'Different1' }).success).toBe(false)
    })
  })

  describe('shopRegistrationSchema', () => {
    it('rejects mismatched confirmation', () => {
      const result = shopRegistrationSchema.safeParse({
        shopName: 'My Cafe',
        email:    'owner@cafe.com',
        password: 'Secret123',
        confirmPassword: 'Different1',
      })
      expect(result.success).toBe(false)
    })
  })
})

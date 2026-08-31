/**
 * Central input-validation schemas. Shared across auth-adjacent surfaces
 * (customer signup, staff signup, login, password reset) so validation rules
 * cannot drift between forms.
 */

import { z } from 'zod'

// ── Primitives ──────────────────────────────────────────────────────────────

export const indianPhone = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')

/**
 * Passwords must be at least 8 characters and contain at least one letter
 * and one digit. This mirrors the check enforced server-side in the
 * create_customer_profile RPC (migration 018).
 */
export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/,      'Password must contain a number')

export const displayName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')

// ── Composite schemas ──────────────────────────────────────────────────────

export const customerSignInSchema = z.object({
  phone:    indianPhone,
  password: z.string().min(1, 'Password is required'),
})

export const customerSignUpSchema = z.object({
  name:     displayName,
  phone:    indianPhone,
  email:    email,
  birthday: z.string().refine((v) => !!v && !Number.isNaN(new Date(v).getTime()), 'Birthday is required'),
  password: strongPassword,
})

export const shopRegistrationSchema = z.object({
  shopName:        z.string().min(2, 'Shop name must be at least 2 characters'),
  email:           email,
  password:        strongPassword,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const passwordResetSchema = z.object({
  password:        strongPassword,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type CustomerSignInInput  = z.infer<typeof customerSignInSchema>
export type CustomerSignUpInput  = z.infer<typeof customerSignUpSchema>
export type ShopRegistrationInput = z.infer<typeof shopRegistrationSchema>
export type PasswordResetInput   = z.infer<typeof passwordResetSchema>

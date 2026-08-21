import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js'
import type { AuthUser, UserRole } from '../types'

// ─── User Pool setup ─────────────────────────────────────────────────────────
// These values come from .env.local — never hardcoded
const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
}

export const userPool = new CognitoUserPool(poolData)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LoginResult {
  success: true
  user: AuthUser
  token: string
  requiresPasswordChange: false
}

export interface PasswordChangeRequired {
  success: false
  requiresPasswordChange: true
  cognitoUser: CognitoUser
  // We pass userAttributes back so the caller can complete the challenge
  userAttributes: Record<string, string>
}

export interface LoginError {
  success: false
  requiresPasswordChange: false
  message: string
}

export type LoginResponse = LoginResult | PasswordChangeRequired | LoginError

// ─── Login ───────────────────────────────────────────────────────────────────

/**
 * Authenticate with Cognito using email + password.
 * Handles the NEW_PASSWORD_REQUIRED challenge that Cognito sends
 * when admin-created users log in for the first time.
 */
export function login(email: string, password: string): Promise<LoginResponse> {
  return new Promise((resolve) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    })

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    })

    cognitoUser.authenticateUser(authDetails, {
      // Successful login
      onSuccess: (session: CognitoUserSession) => {
        try {
          const idToken = session.getIdToken()
          const payload = idToken.decodePayload()

          const user: AuthUser = {
            userId: payload['sub'] as string,
            name: (payload['name'] || payload['email']) as string,
            email: payload['email'] as string,
            mobile: (payload['custom:mobile'] || '') as string,
            role: payload['custom:role'] as UserRole,
          }

          resolve({
            success: true,
            user,
            token: idToken.getJwtToken(),
            requiresPasswordChange: false,
          })
        } catch {
          resolve({
            success: false,
            requiresPasswordChange: false,
            message: 'Login succeeded but could not read user profile.',
          })
        }
      },

      // Cognito forces a password change on first login for admin-created users
      newPasswordRequired: (userAttributes: Record<string, string>) => {
        // Remove non-writable attributes before passing to completeNewPassword
        delete userAttributes['email_verified']
        delete userAttributes['email']

        resolve({
          success: false,
          requiresPasswordChange: true,
          cognitoUser,
          userAttributes,
        })
      },

      onFailure: (err) => {
        // Map Cognito error codes to friendly messages
        let message = 'Login failed. Please try again.'
        if (err.code === 'NotAuthorizedException') {
          message = 'Incorrect email or password.'
        } else if (err.code === 'UserNotFoundException') {
          message = 'No account found with this email.'
        } else if (err.code === 'UserNotConfirmedException') {
          message = 'Account is not confirmed. Contact your admin.'
        } else if (err.code === 'PasswordResetRequiredException') {
          message = 'Password reset required. Contact your admin.'
        }
        resolve({ success: false, requiresPasswordChange: false, message })
      },
    })
  })
}

// ─── Complete new password challenge ─────────────────────────────────────────

/**
 * Called when Cognito requires a first-time password change.
 * The user must set a permanent password before they can proceed.
 */
export function completeNewPassword(
  cognitoUser: CognitoUser,
  newPassword: string,
  userAttributes: Record<string, string>
): Promise<LoginResult | LoginError> {
  return new Promise((resolve) => {
    cognitoUser.completeNewPasswordChallenge(newPassword, userAttributes, {
      onSuccess: (session: CognitoUserSession) => {
        try {
          const idToken = session.getIdToken()
          const payload = idToken.decodePayload()

          const user: AuthUser = {
            userId: payload['sub'] as string,
            name: (payload['name'] || payload['email']) as string,
            email: payload['email'] as string,
            mobile: (payload['custom:mobile'] || '') as string,
            role: payload['custom:role'] as UserRole,
          }

          resolve({
            success: true,
            user,
            token: idToken.getJwtToken(),
            requiresPasswordChange: false,
          })
        } catch {
          resolve({
            success: false,
            requiresPasswordChange: false,
            message: 'Password changed but could not read user profile.',
          })
        }
      },
      onFailure: (err) => {
        let message = 'Could not set new password.'
        if (err.code === 'InvalidPasswordException') {
          message = 'Password does not meet requirements. Use at least 8 characters with uppercase, lowercase, and a number.'
        }
        resolve({ success: false, requiresPasswordChange: false, message })
      },
    })
  })
}

// ─── Logout ──────────────────────────────────────────────────────────────────

/**
 * Sign the user out of Cognito and clear local tokens.
 */
export function logout(): void {
  const currentUser = userPool.getCurrentUser()
  if (currentUser) {
    currentUser.signOut()
  }
}

// ─── Get current session (for token refresh) ─────────────────────────────────

/**
 * Returns the current valid session if the user is still logged in.
 * Cognito automatically refreshes the access token using the refresh token.
 */
export function getCurrentSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const currentUser = userPool.getCurrentUser()
    if (!currentUser) {
      resolve(null)
      return
    }
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        resolve(null)
      } else {
        resolve(session)
      }
    })
  })
}

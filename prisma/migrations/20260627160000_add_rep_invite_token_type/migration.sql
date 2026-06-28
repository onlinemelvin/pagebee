-- Add REP_INVITE to AuthTokenType so first-time rep set-password links can be distinguished
-- from genuine password resets (the "your password was changed" email is suppressed for invites).
ALTER TYPE "AuthTokenType" ADD VALUE IF NOT EXISTS 'REP_INVITE';

/**
 * Shared shape both auth guards (API key and JWT) attach to the request, so downstream
 * controllers/decorators don't need to know which auth method was used — see
 * CurrentTenant/CurrentActor decorators.
 */
export type ActorType = 'USER' | 'SYSTEM' | 'API_KEY';

export interface AuthContext {
  tenantId: string;
  actorType: ActorType;
  actorId: string;
  role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
  /** Present for JWT-authenticated requests only — the current token's id (Phase 6 session revocation). */
  jti?: string;
}

declare module 'express' {
  interface Request {
    authContext?: AuthContext;
  }
}

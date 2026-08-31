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
}

declare module 'express' {
  interface Request {
    authContext?: AuthContext;
  }
}

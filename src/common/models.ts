export enum OAuthLevel {
  BASIC, // Phase 1: Token format/lifetime/issuer validation only
  ACL    // Phase 3: Token validation + ACL enforcement on DFS paths
}

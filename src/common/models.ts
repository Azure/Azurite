export enum OAuthLevel {
  BASIC = "basic", // Phase 1: Token format/lifetime/issuer validation only
  ACL = "acl" // Phase 3: Token validation + ACL enforcement on DFS paths
}

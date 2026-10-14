export interface JwtPayload {
  /** User id dạng chuỗi (BigInt không serialize được vào JWT). */
  sub: string;
  email: string;
  roles: string[];
  /** Khớp với `User.tokenVersion`; lệch nghĩa là token đã bị thu hồi. */
  tv: number;
  iat?: number;
  exp?: number;
}

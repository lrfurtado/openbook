import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { newId } from '../common.js';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';

const REFRESH_TTL_MS = 30 * 24 * 3600_000;
const EMAIL_TOKEN_TTL_MS = 24 * 3600_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

export interface AccessClaims {
  sub: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: Role; emailVerified: boolean };
}

/** Transactional email stand-in: logs links until a provider is configured. */
@Injectable()
export class Mailer {
  private readonly log = new Logger('Mailer');
  readonly outbox: { to: string; kind: string; token: string }[] = [];

  send(to: string, kind: 'verify' | 'reset', token: string) {
    this.outbox.push({ to, kind, token });
    this.log.log(`[${kind}] to ${to}: token=${token}`);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: Mailer,
  ) {}

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async signup(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email: normalized } })) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: { id: newId(), email: normalized, passwordHash: await this.hash(password) },
    });
    await this.sendEmailToken(user.id, user.email, 'verify');
    return { ok: true };
  }

  private async sendEmailToken(userId: string, email: string, kind: 'verify' | 'reset') {
    const token = secret();
    await this.prisma.emailToken.create({
      data: { id: newId(), userId, kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS) },
    });
    this.mailer.send(email, kind, token);
  }

  private async consumeEmailToken(token: string, kind: 'verify' | 'reset') {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) throw new UnauthorizedException('Invalid or expired token');
    await this.prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row.userId;
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeEmailToken(token, 'verify');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { ok: true };
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.bannedAt || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user, newId());
  }

  private async issue(user: { id: string; email: string; role: Role; emailVerifiedAt: Date | null }, familyId: string): Promise<TokenPair> {
    const refreshToken = secret();
    await this.prisma.refreshToken.create({
      data: { id: newId(), userId: user.id, familyId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    const claims: AccessClaims = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(claims),
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt },
    };
  }

  /** Rotates a refresh token. Presenting an already-rotated token revokes its whole family. */
  async refresh(token: string): Promise<TokenPair> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.rotatedAt || row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (row.expiresAt < new Date() || row.user.bannedAt) throw new UnauthorizedException('Refresh token expired');
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { rotatedAt: new Date() } });
    return this.issue(row.user, row.familyId);
  }

  async logout(token: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row) await this.revokeFamily(row.familyId);
    return { ok: true };
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user) await this.sendEmailToken(user.id, user.email, 'reset');
    return { ok: true }; // same response either way: no account enumeration
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.consumeEmailToken(token, 'reset');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hash(password) } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  /** FR-46: removes the account and everything hanging off it from active tables. */
  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }
}

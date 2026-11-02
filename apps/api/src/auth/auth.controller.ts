import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { credentialsSchema } from '@openbook/shared';
import { z } from 'zod';
import { ZodPipe } from '../common.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, CurrentUser } from './guards.js';
import type { AccessClaims } from './auth.service.js';

const tokenSchema = z.object({ token: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const emailSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1), password: credentialsSchema.shape.password });

type Credentials = z.infer<typeof credentialsSchema>;

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body(new ZodPipe(credentialsSchema)) body: Credentials) {
    return this.auth.signup(body.email, body.password);
  }

  @Post('verify-email')
  @HttpCode(200)
  verify(@Body(new ZodPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    return this.auth.verifyEmail(body.token);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(credentialsSchema)) body: Credentials) {
    return this.auth.login(body.email, body.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.logout(body.refreshToken);
  }

  @Post('password/forgot')
  @HttpCode(200)
  forgot(@Body(new ZodPipe(emailSchema)) body: z.infer<typeof emailSchema>) {
    return this.auth.forgotPassword(body.email);
  }

  @Post('password/reset')
  @HttpCode(200)
  reset(@Body(new ZodPipe(resetSchema)) body: z.infer<typeof resetSchema>) {
    return this.auth.resetPassword(body.token, body.password);
  }
}

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Delete()
  remove(@CurrentUser() user: AccessClaims) {
    return this.auth.deleteAccount(user.sub);
  }
}

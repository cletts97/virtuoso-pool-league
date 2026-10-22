import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import type { ApiConfig } from './config';
import { ApiError, requireCondition } from './errors';
import { avatarSchema, inviteSchema, requestSchema, resetSchema } from './validation';
import type { LeagueService } from './service';
import { allowedEmail } from './access';
export function createHandler(service: LeagueService, auth: SupabaseClient, config: ApiConfig) {
  return async function handle(request: Request): Promise<Response> {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    try {
      const path = new URL(request.url).pathname.replace(/^\/api/, '');
      const body = async (limit = 65536) => {
        const raw = await request.text();
        requireCondition(raw.length <= limit, 413, 'Request is too large.');
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          throw new ApiError(400, 'Invalid JSON request.');
        }
      };
      if (request.method === 'GET' && path === '/display') {
        requireCondition(config.publicDisplay, 404, 'Public display is disabled.');
        return json(await service.display());
      }
      if (request.method === 'GET' && path === '/public-state')
        return json(await service.publicState());
      if (request.method === 'POST' && path === '/auth/reset') {
        const { email } = resetSchema.parse(await body());
        requireCondition(
          config.allowAuthEmail,
          503,
          'Password email delivery is not enabled. Contact your administrator.',
        );
        // Generic result avoids disclosing whether an invited account exists.
        if (allowedEmail(email, config.emailDomains)) {
          const { error } = await auth.auth.resetPasswordForEmail(email, {
            redirectTo: `${config.appUrl.replace(/\/$/, '')}/auth/callback`,
          });
          if (error)
            throw new ApiError(503, 'Password reset is temporarily unavailable. Try again later.');
        }
        return json({
          message:
            'If this address has an invited account, a password reset email will arrive shortly.',
        });
      }
      // SWA uses Authorization for its own Functions-host token. Prefer our explicit
      // application header; either source still requires full Supabase verification.
      const authorization =
        request.headers.get('X-VPL-Authorization') ?? request.headers.get('Authorization');
      requireCondition(
        authorization && authorization.startsWith('Bearer ') && authorization.length < 8192,
        401,
        'Sign in to continue.',
      );
      const user = await service.identity(authorization.slice(7));
      if (request.method === 'POST' && path === '/profile/photo') {
        const { image } = avatarSchema.parse(await body(360000));
        return json(await service.saveAvatar(user, image));
      }
      if (request.method === 'GET' && path === '/me') return json(await service.me(user));
      if (request.method === 'GET' && path === '/state') return json(await service.load(user));
      if (request.method === 'POST' && path === '/commands') {
        const { command, expectedRevision } = requestSchema.parse(await body());
        return json(await service.execute(user, command, expectedRevision));
      }
      if (request.method === 'POST' && path === '/admin/reminders')
        return json(await service.reminders(user));
      if (
        (request.method === 'GET' || request.method === 'POST') &&
        path === '/admin/result-emails'
      )
        return json(await service.resultEmailStatus(user, request.method === 'POST'));
      if (request.method === 'POST' && path === '/admin/invitations') {
        const actor = await service.me(user);
        requireCondition(actor.role === 'admin', 403, 'Administrator access required.');
        const { email, name } = inviteSchema.parse(await body());
        requireCondition(
          allowedEmail(email, config.emailDomains),
          400,
          'Use an email address permitted by this league.',
        );
        requireCondition(
          config.allowAuthEmail,
          503,
          'Invitation email delivery is disabled. Configure and test Auth email before enabling invitations.',
        );
        const { error } = await auth.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
          data: { name },
          redirectTo: `${config.appUrl.replace(/\/$/, '')}/auth/accept-invite`,
        });
        if (error)
          throw new ApiError(
            400,
            'The invitation could not be sent. Check whether this account already exists and review Auth delivery configuration.',
          );
        return json(
          { message: 'Invitation sent. The colleague can set a password using their email link.' },
          201,
        );
      }
      throw new ApiError(404, 'API route not found.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError)
        return json({ error: 'Invalid request. Check the supplied fields and try again.' }, 400);
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (['23P01', '23505', '40001', '40P01', '55P03'].includes(code))
        return json(
          {
            error:
              'Another change conflicts with this request. Refresh and choose an available slot or review the latest result.',
          },
          409,
        );
      if (['23503', '23514'].includes(code))
        return json(
          {
            error:
              'This change violates the league data rules. Refresh and review the current records.',
          },
          400,
        );
      // Do not log tokens, connection strings, SQL, email addresses or request bodies.
      console.error('API request failed', code || 'internal');
      return json(
        {
          error:
            'The service is temporarily unavailable. Your change was not confirmed. Refresh before retrying.',
        },
        503,
      );
    }
  };
}

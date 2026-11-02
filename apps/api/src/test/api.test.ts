// API integration tests against the dev Postgres (docker-compose). Run: npm test -w apps/api
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

process.env.AUTH_RATE_LIMIT = '1000';
const { createApp } = await import('../main.js');
const { Mailer } = await import('../auth/auth.service.js');
const { PrismaService } = await import('../prisma.service.js');
const { seed } = await import('../seed.js');

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
const password = process.env.SEED_ADMIN_PASSWORD ?? 'openbook-dev-password';

async function login(email: string, pw = password) {
  const res = await request(http).post('/v1/auth/login').send({ email, password: pw }).expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}

before(async () => {
  app = await createApp();
  await app.init();
  http = app.getHttpServer();
  await seed(app.get(PrismaService), () => {});
});

after(async () => {
  await app.close();
});

describe('health & catalog', () => {
  it('reports health', async () => {
    await request(http).get('/v1/health').expect(200, { ok: true });
  });

  it('lists categories and published packs anonymously', async () => {
    const cats = await request(http).get('/v1/catalog/categories').expect(200);
    assert.deepEqual(cats.body.map((c: { slug: string }) => c.slug).slice(0, 2), ['nature-science', 'everyday-objects']);
    const packs = await request(http).get('/v1/catalog/packs?category=nature-science').expect(200);
    assert.ok(packs.body.items.length >= 2);
    for (const p of packs.body.items) {
      assert.equal(p.categorySlug, 'nature-science');
      assert.ok(p.cardCount >= 20);
      assert.ok(p.coverUrl.startsWith('https://'));
    }
  });

  it('serves a manifest with full attribution for every card (FR-12)', async () => {
    const packs = await request(http).get('/v1/catalog/packs').expect(200);
    const res = await request(http).get(`/v1/catalog/packs/${packs.body.items[0].id}/manifest`).expect(200);
    assert.equal(res.body.cards.length, res.body.cardIds.length);
    for (const c of res.body.cards) {
      assert.ok(c.attribution.author && c.attribution.license && c.attribution.licenseUrl && c.attribution.sourceUrl);
      assert.equal(c.image.renditions.length, 3);
    }
  });

  it('lists ≥5 official books per category (FR-60)', async () => {
    for (const category of ['nature-science', 'everyday-objects']) {
      const res = await request(http).get(`/v1/catalog/books?category=${category}`).expect(200);
      assert.ok(res.body.items.length >= 5, `${category}: ${res.body.items.length}`);
    }
    const books = await request(http).get('/v1/catalog/books').expect(200);
    const manifest = await request(http).get(`/v1/catalog/books/${books.body.items[0].id}/manifest`).expect(200);
    assert.ok(manifest.body.data.pages.length > 0);
    assert.ok(manifest.body.data.vocabulary.length > 0);
  });

  it('returns 404 for unknown packs', async () => {
    await request(http).get(`/v1/catalog/packs/${randomUUID()}`).expect(404);
  });

  it('publishes an OpenAPI document', async () => {
    const res = await request(http).get('/v1/openapi.json').expect(200);
    assert.ok(res.body.paths['/v1/catalog/packs']);
  });
});

describe('auth', () => {
  const email = `parent-${randomUUID()}@example.com`;

  it('signs up, verifies, logs in, rotates and detects refresh reuse', async () => {
    await request(http).post('/v1/auth/signup').send({ email, password: 'short' }).expect(400);
    await request(http).post('/v1/auth/signup').send({ email, password: 'correct horse battery' }).expect(201);
    await request(http).post('/v1/auth/signup').send({ email, password: 'correct horse battery' }).expect(409);
    const token = app.get(Mailer).outbox.find((m) => m.to === email && m.kind === 'verify')!.token;
    await request(http).post('/v1/auth/verify-email').send({ token }).expect(200);
    await request(http).post('/v1/auth/verify-email').send({ token }).expect(401);

    await request(http).post('/v1/auth/login').send({ email, password: 'wrong password!' }).expect(401);
    const first = await login(email, 'correct horse battery');
    const second = (await request(http).post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)).body;
    assert.notEqual(second.refreshToken, first.refreshToken);
    assert.equal(second.user.emailVerified, true);
    // Reusing the rotated token revokes the whole family, including the newest token.
    await request(http).post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await request(http).post('/v1/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
  });

  it('resets a password', async () => {
    await request(http).post('/v1/auth/password/forgot').send({ email }).expect(200);
    const token = app.get(Mailer).outbox.findLast((m) => m.to === email && m.kind === 'reset')!.token;
    await request(http).post('/v1/auth/password/reset').send({ token, password: 'a brand new password' }).expect(200);
    await login(email, 'a brand new password');
  });

  it('deletes the account', async () => {
    const { accessToken } = await login(email, 'a brand new password');
    await request(http).delete('/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    await request(http).post('/v1/auth/login').send({ email, password: 'a brand new password' }).expect(401);
  });
});

describe('admin', () => {
  it('rejects anonymous users and parents', async () => {
    await request(http).get('/v1/admin/packs').expect(401);
    const email = `p-${randomUUID()}@example.com`;
    await request(http).post('/v1/auth/signup').send({ email, password: 'correct horse battery' }).expect(201);
    const { accessToken } = await login(email, 'correct horse battery');
    await request(http).get('/v1/admin/packs').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });

  it('runs the draft → review → published workflow with validation (FR-56/57)', async () => {
    const editor = (await login('editor@openbook.local')).accessToken;
    const publisher = (await login('publisher@openbook.local')).accessToken;
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const cats = await request(http).get('/v1/admin/categories').set(auth(editor)).expect(200);
    const cards = await request(http).get('/v1/admin/cards?q=birds-1').set(auth(editor)).expect(200);
    const cardIds = cards.body.map((c: { id: string }) => c.id);

    const small = await request(http)
      .post('/v1/admin/packs').set(auth(editor))
      .send({ categoryId: cats.body[0].id, subcategory: 'birds', title: { en: 'Too small' }, cardIds: cardIds.slice(0, 3) })
      .expect(201);
    const rejected = await request(http).post(`/v1/admin/packs/${small.body.id}/transition`).set(auth(editor)).send({ to: 'review' }).expect(422);
    assert.match(rejected.body.problems[0], /at least 20/);

    const pack = await request(http)
      .post('/v1/admin/packs').set(auth(editor))
      .send({ categoryId: cats.body[0].id, subcategory: 'birds', title: { en: `Test pack ${randomUUID()}` }, cardIds: cardIds.slice(0, 20) })
      .expect(201);
    await request(http).post(`/v1/admin/packs/${pack.body.id}/transition`).set(auth(editor)).send({ to: 'published' }).expect(400);
    await request(http).post(`/v1/admin/packs/${pack.body.id}/transition`).set(auth(editor)).send({ to: 'review' }).expect(200);
    await request(http).post(`/v1/admin/packs/${pack.body.id}/transition`).set(auth(editor)).send({ to: 'published' }).expect(403);
    const published = await request(http).post(`/v1/admin/packs/${pack.body.id}/transition`).set(auth(publisher)).send({ to: 'published' }).expect(200);
    assert.equal(published.body.version, 1);
    await request(http).get(`/v1/catalog/packs/${pack.body.id}`).expect(200);

    await request(http).post(`/v1/admin/packs/${pack.body.id}/transition`).set(auth(publisher)).send({ to: 'archived' }).expect(200);
    await request(http).get(`/v1/catalog/packs/${pack.body.id}`).expect(404);
  });

  it('blocks official books that break stage rules (FR-59/63)', async () => {
    const editor = (await login('editor@openbook.local')).accessToken;
    const book = await request(http)
      .post('/v1/admin/books').set('Authorization', `Bearer ${editor}`)
      .send({ title: { en: 'Wordy' }, stage: 1, pages: [{ text: { en: 'this page has far too many words' } }] })
      .expect(201);
    assert.deepEqual(book.body.vocabulary, ['far', 'has', 'many', 'page', 'this', 'too', 'words', 'wordy']);
    const res = await request(http).post(`/v1/admin/books/${book.body.id}/transition`).set('Authorization', `Bearer ${editor}`).send({ to: 'review' }).expect(422);
    assert.match(res.body.problems[0], /stage 1 allows 5/);
  });
});

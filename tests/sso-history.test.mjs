import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const middlewareSource = readFileSync(resolve('middleware.ts'), 'utf8');
const sessionSource = readFileSync(resolve('lib/buyer-show/app-session.ts'), 'utf8');
const authSource = readFileSync(resolve('lib/buyer-show/auth.ts'), 'utf8');
const prismaSchema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const historyStoreSource = readFileSync(resolve('lib/buyer-show/history-store.ts'), 'utf8');
const historyRouteSource = readFileSync(resolve('app/api/buyer-show/history/route.ts'), 'utf8');
const historyDetailRouteSource = readFileSync(resolve('app/api/buyer-show/history/[id]/route.ts'), 'utf8');
const sessionRouteSource = readFileSync(resolve('app/api/session/route.ts'), 'utf8');
const generateRouteSource = readFileSync(resolve('app/api/buyer-show/generate/route.ts'), 'utf8');
const generationJobStoreSource = readFileSync(resolve('lib/buyer-show/generation-job-store.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.ok(packageJson.dependencies['@prisma/client'], 'buyer-show should depend on Prisma client');
assert.ok(packageJson.devDependencies.prisma, 'buyer-show should include Prisma CLI for Zeabur builds');
assert.equal(packageJson.scripts.build, 'prisma generate && next build', 'build should generate Prisma client');
assert.equal(packageJson.scripts.postinstall, 'prisma generate', 'postinstall should generate Prisma client');

assert.match(prismaSchema, /model BuyerShowHistory/);
assert.match(prismaSchema, /userId\s+String\s+@map\("user_id"\)/);
assert.match(prismaSchema, /@@index\(\[userId, createdAt\(sort: Desc\)\]\)/);
assert.match(prismaSchema, /@@map\("buyer_show_histories"\)/);

assert.match(middlewareSource, /ticket/);
assert.match(middlewareSource, /exchangeMainAppSsoTicket/);
assert.match(middlewareSource, /buildSessionCookie/);
assert.match(sessionSource, /MAIN_APP_BUYER_SHOW_SSO_EXCHANGE_PATH/);
assert.match(sessionSource, /MAIN_APP_BUYER_SHOW_SESSION_PATH/);
assert.match(sessionSource, /BUYER_SHOW_SESSION_SECRET/);
assert.match(sessionSource, /buyer_show_session/);
assert.match(sessionSource, /validateMainAppSession/);
assert.match(sessionSource, /\/api\/sso\/session/);
assert.match(sessionSource, /Authorization:\s*`Bearer \$\{session\.token\}`/);
assert.match(authSource, /readFreshAppSession/);
assert.match(authSource, /SESSION_REVOKED/);
assert.match(authSource, /buildClearedSessionCookie/);
assert.match(middlewareSource, /readFreshAppSession/);
assert.match(middlewareSource, /buildClearedSessionCookie/);
assert.match(sessionRouteSource, /readCurrentBuyerShowUser/);

assert.match(authSource, /readCurrentBuyerShowUser/);
assert.match(authSource, /userId:\s*'buyer-show-local-dev-user'/);

assert.match(historyStoreSource, /sanitizeResultsForHistory/);
assert.match(historyStoreSource, /upsertBuyerShowHistory/);
assert.match(historyStoreSource, /listBuyerShowHistory/);
assert.match(historyStoreSource, /deleteBuyerShowHistory/);
assert.match(historyStoreSource, /localImageKey:\s*undefined/);

assert.match(historyRouteSource, /GET/);
assert.match(historyRouteSource, /POST/);
assert.match(historyRouteSource, /readCurrentBuyerShowUser/);
assert.match(historyDetailRouteSource, /GET/);
assert.match(historyDetailRouteSource, /PATCH/);
assert.match(historyDetailRouteSource, /DELETE/);

assert.match(generateRouteSource, /readCurrentBuyerShowUser/);
assert.match(generateRouteSource, /createBuyerShowGenerationJob/);
assert.doesNotMatch(generateRouteSource, /historyId/);
assert.doesNotMatch(generationJobStoreSource, /upsertBuyerShowHistory/);

assert.match(clientSource, /historyId/);
assert.match(clientSource, /loadHistoryItems/);
assert.match(clientSource, /\/api\/buyer-show\/history/);
assert.match(clientSource, /data-action="load-history"/);
assert.match(clientSource, /data-action="save-cloud-history"/);

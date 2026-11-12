import { createApp } from './app.js';
import { db } from './database.js';
const app = await createApp();
await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
console.log(`Flagpole API listening on port ${process.env.PORT ?? 4000}`);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });

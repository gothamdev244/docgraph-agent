import { configureProvider, flue } from '@flue/sdk/app';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

configureProvider('google', {
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const app = new Hono();

app.use('*', cors({
  origin: process.env.ALLOWED_ORIGIN ?? '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/', flue());

export default app;

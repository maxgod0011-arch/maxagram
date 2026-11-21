import { connectLambda, getStore } from '@netlify/blobs';
import type { Handler, HandlerContext, HandlerEvent, HandlerResponse } from '@netlify/functions';
import serverless from 'serverless-http';
import { apiApp } from '../../server/app.ts';
import { db } from '../../server/database.ts';

const NETLIFY_BLOBS_STORE = 'maxagram-state';
const NETLIFY_BLOBS_KEY = 'maxagram-db-v1';

const wrapServerless =
  typeof serverless === 'function'
    ? serverless
    : (serverless as unknown as { default: typeof serverless }).default;

const expressHandler = wrapServerless(apiApp, {
  binary: ['application/zip', 'application/octet-stream'],
});

function normalizeApiPath(rawPath: string | undefined): string {
  if (!rawPath) return '/api';
  const fnPrefix = '/.netlify/functions/api';
  if (rawPath.startsWith(fnPrefix)) {
    const suffix = rawPath.slice(fnPrefix.length);
    if (!suffix) return '/api';
    return `/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  }
  return rawPath;
}

function configureNetlifyBlobs(event: HandlerEvent): void {
  const lambdaEvent = event as unknown as {
    blobs?: string;
    headers?: Record<string, string | undefined>;
  };

  let blobsAvailable = false;

  if (typeof lambdaEvent.blobs === 'string' && lambdaEvent.blobs.length > 0) {
    try {
      const normalizedHeaders: Record<string, string> = {};
      if (lambdaEvent.headers) {
        for (const [key, value] of Object.entries(lambdaEvent.headers)) {
          if (typeof value === 'string') {
            normalizedHeaders[key.toLowerCase()] = value;
          }
        }
      }
      connectLambda({
        blobs: lambdaEvent.blobs,
        headers: normalizedHeaders,
      });
      blobsAvailable = true;
    } catch (err) {
      console.error('Netlify Blobs lambda context initialization skipped:', err);
    }
  } else if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    blobsAvailable = true;
  }

  if (!blobsAvailable) {
    db.setRemoteAdapter(null);
    return;
  }

  db.setRemoteAdapter({
    read: async () => {
      const store =
        process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN
          ? getStore({
              name: NETLIFY_BLOBS_STORE,
              consistency: 'strong',
              siteID: process.env.NETLIFY_SITE_ID,
              token: process.env.NETLIFY_AUTH_TOKEN,
            })
          : getStore({
              name: NETLIFY_BLOBS_STORE,
              consistency: 'strong',
            });
      return store.get(NETLIFY_BLOBS_KEY, { type: 'text', consistency: 'strong' });
    },
    write: async (serialized: string) => {
      const store =
        process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN
          ? getStore({
              name: NETLIFY_BLOBS_STORE,
              consistency: 'strong',
              siteID: process.env.NETLIFY_SITE_ID,
              token: process.env.NETLIFY_AUTH_TOKEN,
            })
          : getStore({
              name: NETLIFY_BLOBS_STORE,
              consistency: 'strong',
            });
      await store.set(NETLIFY_BLOBS_KEY, serialized);
    },
  });
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<HandlerResponse> => {
  configureNetlifyBlobs(event);

  const normalizedEvent: HandlerEvent & { requestPath?: string } = {
    ...event,
    path: normalizeApiPath(event.path),
  };

  const maybeRequestPath = (event as HandlerEvent & { requestPath?: string }).requestPath;
  if (typeof maybeRequestPath === 'string') {
    normalizedEvent.requestPath = normalizeApiPath(maybeRequestPath);
  }

  const result = await expressHandler(normalizedEvent, context);
  return result as HandlerResponse;
};

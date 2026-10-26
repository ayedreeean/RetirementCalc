import { handleUnsubscribe } from '../_lib/signup.js';

export async function onRequest(context) {
    return handleUnsubscribe(context.request, context.env);
}

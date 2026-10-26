import { handleSignup } from '../_lib/signup.js';

export async function onRequest(context) {
    return handleSignup(context.request, context.env);
}

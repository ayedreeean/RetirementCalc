// functions/openai-proxy.js
export async function onRequest(context) {
  // Only allow POST requests
  if (context.request.method !== 'POST') {
    return new Response('Expected POST', { status: 405 });
  }

  try {
    const requestBody = await context.request.json();
    const prompt = requestBody.prompt;

    if (!prompt) {
      return new Response('Missing prompt in request body', { status: 400 });
    }

    // Get the API key from Cloudflare's environment variables (secrets)
    // 'OPENAI_API_KEY' is the name we used for the secret.
    const apiKey = context.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API Key not configured in environment variables.');
      return new Response('API Key not configured.', { status: 500 });
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview', // Or your preferred model
        messages: [
          {
            role: 'system',
            content: 'You are a helpful financial advisor analyzing retirement simulations. Provide clear, concise, and actionable advice. Format your response using markdown for better readability.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`OpenAI API Error (${openaiResponse.status}): ${errorText}`);
      // Consider what error details are safe to return to the client.
      // For now, a generic message for the client, and detailed log on the server.
      return new Response('Error communicating with AI service.', { status: openaiResponse.status });
    }

    const data = await openaiResponse.json();

    const headers = new Headers({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' // Adjust for production if needed (e.g., your specific pages.dev URL)
    });

    return new Response(JSON.stringify(data), { headers: headers });

  } catch (error) {
    console.error('Worker error:', error);
    return new Response('Internal server error in worker.', { status: 500 });
  }
} 
// ============================================================================
// CHAT API ROUTE
// ============================================================================
//
// POST /api/chat
// 
// Handles chat requests with streaming responses.
// Uses Server-Sent Events to stream tokens as they're generated.
//
// Request body:
// {
//   conversationId: string | null,
//   message: string
// }
//
// Response: Server-Sent Events stream
// - data: {"type": "token", "content": "..."} 
// - data: {"type": "done", "conversationId": "...", "sources": [...]}
//
// ============================================================================

import { NextRequest } from 'next/server';
import { retrieveChunks } from '@/src/chat-client/retrieval';
import { getConversationHistory, createConversation, conversationExists } from '@/src/chat-client/get-history';
import { buildPrompt } from '@/src/chat-client/prompt';
import { streamResponse } from '@/src/chat-client/stream';
import { saveMessagePair } from '@/src/chat-client/save-message';
import { getEffectiveSettings } from '@/src/lib/settings';
import { DEFAULT_USER_ID } from '@/src/lib/constants';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface ChatRequest {
  conversationId: string | null;
  message: string;
}

interface SourceData {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

// ----------------------------------------------------------------------------
// ROUTE HANDLER
// ----------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: ChatRequest = await request.json();
    const { message } = body;
    let { conversationId } = body;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CHAT API] Received message: %s', message.substring(0, 50));

    // Get user settings
    const settings = await getEffectiveSettings(DEFAULT_USER_ID);

    // Ensure conversation exists
    if (!conversationId) {
      conversationId = await createConversation();
      console.log('[CHAT API] Created conversation: %s', conversationId);
    } else {
      const exists = await conversationExists(conversationId);
      if (!exists) {
        conversationId = await createConversation();
        console.log('[CHAT API] Conversation not found, created: %s', conversationId);
      }
    }

    // Retrieve relevant chunks
    console.log('[CHAT API] Retrieving chunks...');
    const retrieval = await retrieveChunks(message, {
      chunkCount: settings.chunks_per_query,
      similarityThreshold: settings.similarity_threshold,
    });

    // Build sources for response
    const sources: SourceData[] = retrieval.chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      similarity: chunk.similarity,
    }));

    // Get conversation history
    const history = await getConversationHistory(conversationId);

    // Build prompt
    const prompt = buildPrompt(
      retrieval.chunks,
      history.messages,
      message,
      settings.system_prompt
    );

    // Create streaming response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamResponse(prompt.systemPrompt, prompt.messages, {
            model: settings.chat_model,
            onToken: (token) => {
              fullResponse += token;
              const data = JSON.stringify({ type: 'token', content: token });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            },
          });

          // Save messages to database
          await saveMessagePair(conversationId!, message, fullResponse);

          // Send final message with sources
          const doneData = JSON.stringify({
            type: 'done',
            conversationId,
            sources,
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.close();

        } catch (error) {
          console.error('[CHAT API] Stream error:', error);
          const errorData = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[CHAT API] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
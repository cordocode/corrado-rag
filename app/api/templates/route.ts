// ============================================================================
// TEMPLATES API ROUTE
// ============================================================================
//
// GET /api/templates - Fetch all file type templates
// POST /api/templates - Create a new template
// PUT /api/templates - Update an existing template
// DELETE /api/templates - Delete a template
//
// ============================================================================

import { NextRequest } from 'next/server';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '@/src/lib/templates';

// ----------------------------------------------------------------------------
// GET - Fetch all templates
// ----------------------------------------------------------------------------

export async function GET(): Promise<Response> {
  try {
    const templates = await getTemplates();
    
    return new Response(JSON.stringify(templates), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[TEMPLATES API] GET error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// POST - Create a new template
// ----------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.type_name || typeof body.type_name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'type_name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (!Array.isArray(body.chip_fields)) {
      return new Response(
        JSON.stringify({ error: 'chip_fields must be an array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const template = await createTemplate({
      type_name: body.type_name,
      chip_fields: body.chip_fields,
      extraction_prompt: body.extraction_prompt || null,
    });
    
    return new Response(JSON.stringify(template), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[TEMPLATES API] POST error:', error);
    
    // Handle duplicate type name
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('already exists') ? 409 : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT - Update an existing template
// ----------------------------------------------------------------------------

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate ID
    if (!body.id || typeof body.id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Build updates object (only include provided fields)
    const updates: {
      type_name?: string;
      chip_fields?: string[];
      extraction_prompt?: string | null;
    } = {};
    
    if (body.type_name !== undefined) {
      updates.type_name = body.type_name;
    }
    
    if (body.chip_fields !== undefined) {
      if (!Array.isArray(body.chip_fields)) {
        return new Response(
          JSON.stringify({ error: 'chip_fields must be an array' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      updates.chip_fields = body.chip_fields;
    }
    
    if (body.extraction_prompt !== undefined) {
      updates.extraction_prompt = body.extraction_prompt;
    }
    
    const template = await updateTemplate(body.id, updates);
    
    return new Response(JSON.stringify(template), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[TEMPLATES API] PUT error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('already exists') ? 409 : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE - Delete a template
// ----------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate ID
    if (!body.id || typeof body.id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await deleteTemplate(body.id);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[TEMPLATES API] DELETE error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('not found') ? 404 : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
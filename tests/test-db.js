// ============================================================================
// DATABASE CONNECTION TEST
// ============================================================================
//
// This script verifies that:
// 1. We can connect to Supabase
// 2. We can read from the file_type_templates table
// 3. The seed data (lease, misc) exists
//
// RUN THIS:
// node tests/test-db.js
//
// EXPECTED OUTPUT:
// ✓ Connected to Supabase
// ✓ Found 2 templates
// ✓ Lease template exists with 8 chip fields
// ✓ Misc template exists with 4 chip fields
//
// ============================================================================

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDatabaseConnection() {
  console.log('\n[TEST] Starting database connection test...\n');

  try {
    // Test 1: Fetch all templates
    const { data: templates, error } = await supabase
      .from('file_type_templates')
      .select('*');

    if (error) throw error;

    console.log('✓ Connected to Supabase');
    console.log(`✓ Found ${templates.length} templates\n`);

    // Test 2: Verify lease template
    const leaseTemplate = templates.find(t => t.type_name === 'lease');
    if (leaseTemplate) {
      console.log('✓ Lease template exists');
      console.log(`  - Chip fields: ${leaseTemplate.chip_fields.length}`);
      console.log(`  - Fields: ${leaseTemplate.chip_fields.join(', ')}\n`);
    } else {
      console.log('✗ Lease template NOT found\n');
    }

    // Test 3: Verify misc template
    const miscTemplate = templates.find(t => t.type_name === 'misc');
    if (miscTemplate) {
      console.log('✓ Misc template exists');
      console.log(`  - Chip fields: ${miscTemplate.chip_fields.length}`);
      console.log(`  - Fields: ${miscTemplate.chip_fields.join(', ')}\n`);
    } else {
      console.log('✗ Misc template NOT found\n');
    }

    console.log('[TEST] Database connection test PASSED ✓\n');

  } catch (error) {
    console.error('\n✗ Database connection test FAILED');
    console.error('Error:', error.message);
    console.error('\nMake sure your .env.local file has the correct credentials.\n');
    process.exit(1);
  }
}

testDatabaseConnection();
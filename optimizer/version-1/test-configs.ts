// ============================================================================
// TEST CONFIGURATIONS
// ============================================================================
//
// 16 parameter combinations with small model
// 1 comparison run with large model
//
// ============================================================================

export interface TestConfig {
  id: string;
  name: string;
  chunkSizeWords: number;
  chunkOverlapWords: number;
  chipCount: number;
  chipPosition: 'prepend' | 'prepend_append';
  embeddingModel: 'text-embedding-3-small' | 'text-embedding-3-large';
  embeddingDimensions: 1536 | 3072;
}

// Chip fields to use
export const MINIMAL_CHIPS = ['property_address', 'tenant_name'];
export const STANDARD_CHIPS = ['property_address', 'tenant_name', 'landlord', 'lease_start', 'lease_end'];

export function getChipFields(count: number): string[] {
  return count === 2 ? MINIMAL_CHIPS : STANDARD_CHIPS;
}

// Generate all 16 combinations
function generateConfigs(): TestConfig[] {
  const configs: TestConfig[] = [];
  let num = 1;

  for (const chunkSize of [200, 500]) {
    for (const overlap of [0, 50]) {
      for (const chipCount of [2, 5]) {
        for (const chipPos of ['prepend', 'prepend_append'] as const) {
          configs.push({
            id: `config-${String(num).padStart(2, '0')}`,
            name: `${chunkSize}w/${overlap}o/${chipCount}c/${chipPos === 'prepend' ? 'pre' : 'pre+app'}`,
            chunkSizeWords: chunkSize,
            chunkOverlapWords: overlap,
            chipCount,
            chipPosition: chipPos,
            embeddingModel: 'text-embedding-3-small',
            embeddingDimensions: 1536,
          });
          num++;
        }
      }
    }
  }
  return configs;
}

export const TEST_CONFIGS = generateConfigs();

// Large model uses same params as config-16 (500/50/5/pre+app)
export const LARGE_MODEL_CONFIG: TestConfig = {
  id: 'config-large',
  name: '500w/50o/5c/pre+app/LARGE',
  chunkSizeWords: 500,
  chunkOverlapWords: 50,
  chipCount: 5,
  chipPosition: 'prepend_append',
  embeddingModel: 'text-embedding-3-large',
  embeddingDimensions: 3072,
};
// ============================================================================
// RAG TEST CASES
// ============================================================================
//
// Real questions and answers from actual leases.
// Fuzzy matching handles OCR variations.
//
// ============================================================================

export interface TestCase {
  id: string;
  question: string;
  expectedAnswerText: string;
  tenantName: string;
  description: string;
}

export const TEST_CASES: TestCase[] = [
  {
    id: 'Q1',
    question: 'When did the Family Dollar lease begin?',
    expectedAnswerText: '24th day of August 2020',
    tenantName: 'Family Dollar',
    description: 'Lease effective date',
  },
  {
    id: 'Q2',
    question: 'Is there a renewal option in the Scenthound lease? What are the terms?',
    expectedAnswerText: 'option to renew the Initial Term of this Lease for two 2 further period of five 5 years',
    tenantName: 'Scenthound',
    description: 'Renewal option terms',
  },
  {
    id: 'Q3',
    question: 'When does the Scenthound renewal option need to be exercised?',
    expectedAnswerText: 'written notice is given to the Landlord at least 365 days prior to the expiry of the Initial Term',
    tenantName: 'Scenthound',
    description: 'Renewal notice period',
  },
  {
    id: 'Q4',
    question: 'What is the renewal rent rate for Scenthound?',
    expectedAnswerText: 'Minimum Rent will be increased at the commencement of each renewal term and each successive year thereafter to equal Minimum Rent for the immediately preceding year increased by the greater of i three percent 3 or ii the percentage increase in the Consumer Price Index',
    tenantName: 'Scenthound',
    description: 'Renewal rent escalation',
  },
  {
    id: 'Q5',
    question: 'What is the late fee for Blue Tree in Reno?',
    expectedAnswerText: 'past due Rent shall accrue interest at 12 per annum until brought current',
    tenantName: 'Blue Tree',
    description: 'Late fee / interest terms',
  },
  {
    id: 'Q6',
    question: 'What is the security deposit for Outdoor Power?',
    expectedAnswerText: 'Landlord currently holds a deposit of 3850',
    tenantName: 'Outdoor Power',
    description: 'Security deposit amount',
  },
  {
    id: 'Q7',
    question: 'When is annual property tax reimbursement due for Mega Joes?',
    expectedAnswerText: 'Within 180 days after the end of each calendar year the Landlord will determine and advise the Tenant by statement of the exact amount of the Tenants Proportionate Share of Taxes and Operating Costs',
    tenantName: 'Mega Joes',
    description: 'Tax reimbursement timing',
  },
  {
    id: 'Q8',
    question: 'What is the square footage of the Blue Tree space?',
    expectedAnswerText: 'Rentable Square Footage of the Premises is deemed to be 8521 square feet',
    tenantName: 'Blue Tree',
    description: 'Premises square footage',
  },
  {
    id: 'Q9',
    question: 'In the Blue Tree lease, who is responsible for roof repairs?',
    expectedAnswerText: 'Landlord shall perform all maintenance and repairs upon the a structural elements of the Building including damage to interior elements necessary to reach said areas b mechanical electrical plumbing and fire life safety systems serving the Building in general but not specific sub-systems maintained by Tenant that tie into these systems c Common Areas including the Common Area restrooms d roof of the Building including its water-tight nature and replacing any ceiling tiles caused by a roof leak',
    tenantName: 'Blue Tree',
    description: 'Roof repair responsibility',
  },
];

// ----------------------------------------------------------------------------
// AI VALIDATION (Haiku)
// ----------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL = 'claude-3-5-haiku-20241022';

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

/**
 * Uses Haiku to check if chunk contains the answer
 * Returns boolean - cheap and handles OCR variations
 */
export async function validateChunkWithAI(
  question: string,
  expectedAnswer: string,
  chunkContent: string
): Promise<boolean> {
  const prompt = `You are validating if a document chunk contains the answer to a question.

QUESTION: ${question}

EXPECTED ANSWER (may have OCR errors): ${expectedAnswer}

CHUNK CONTENT:
${chunkContent}

Does this chunk contain information that answers the question? The text may have minor OCR errors, typos, or formatting differences - focus on whether the MEANING matches.

Respond with exactly one word: YES or NO`;

  try {
    const response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0];
    if (text.type !== 'text') return false;
    
    return text.text.trim().toUpperCase().startsWith('YES');
  } catch (error) {
    console.error('[VALIDATE] AI error:', error);
    return false;
  }
}

/**
 * Finds rank (1-5) where answer appears using AI validation
 */
export async function findAnswerRank(
  question: string,
  expectedAnswer: string,
  chunks: Array<{ content: string; rank: number }>
): Promise<number | null> {
  for (const chunk of chunks) {
    const isMatch = await validateChunkWithAI(question, expectedAnswer, chunk.content);
    if (isMatch) {
      return chunk.rank;
    }
  }
  return null;
}
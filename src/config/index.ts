import { config } from 'dotenv';
import { z } from 'zod';

// Silence dotenv output to stdout (MCP requires clean stdout)
const originalWrite = process.stdout.write;
process.stdout.write = () => true;

// Load environment variables
config();

// Restore stdout.write
process.stdout.write = originalWrite;

const configSchema = z.object({
  PRODUCTIVE_API_TOKEN: z.string().min(1, 'API token is required'),
  PRODUCTIVE_ORG_ID: z.string().min(1, 'Organization ID is required'),
  PRODUCTIVE_USER_ID: z.string().optional(),
  PRODUCTIVE_API_BASE_URL: z.string().url().default('https://api.productive.io/api/v2/'),
});

export type Config = z.infer<typeof configSchema>;

export function getConfig(): Config {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
  
  return result.data;
}
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import csv from 'csv-parser';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function parseCSV(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Convert empty strings to null
        for (const key in data) {
          if (data[key] === '') {
            data[key] = null;
          }
        }
        results.push(data);
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function seed() {
  console.log("Starting seed process...");

  try {
    // 1. Seed companies
    console.log("Loading companies.csv...");
    const companies = await parseCSV(path.resolve(process.cwd(), 'seed/companies.csv'));
    console.log(`Found ${companies.length} companies to insert.`);

    // Insert companies in batches of 500
    const chunkSize = 500;
    for (let i = 0; i < companies.length; i += chunkSize) {
      const chunk = companies.slice(i, i + chunkSize);
      const { error } = await supabase.from('companies').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
      console.log(`Inserted companies ${i} to ${i + chunk.length}`);
    }

    // 2. Seed alumni records
    console.log("Loading alumni_records.csv...");
    const records = await parseCSV(path.resolve(process.cwd(), 'seed/alumni_records.csv'));
    console.log(`Found ${records.length} records to insert.`);
    
    // Type conversions for records before insertion
    const typedRecords = records.map(r => ({
      ...r,
      batch_year: parseInt(r.batch_year),
      first_ctc_lpa: r.first_ctc_lpa ? parseFloat(r.first_ctc_lpa) : null
    }));

    // Insert records in batches of 500
    for (let i = 0; i < typedRecords.length; i += chunkSize) {
      const chunk = typedRecords.slice(i, i + chunkSize);
      const { error } = await supabase.from('alumni_records').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
      console.log(`Inserted alumni records ${i} to ${i + chunk.length}`);
    }

    console.log("Seeding completed successfully.");
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  }
}

seed();

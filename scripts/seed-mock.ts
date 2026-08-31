import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const MOCK_COMPANIES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Google', name_canonical: 'google' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Microsoft', name_canonical: 'microsoft' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Amazon', name_canonical: 'amazon' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Tata Consultancy Services', name_canonical: 'tcs' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Infosys', name_canonical: 'infosys' },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Accenture', name_canonical: 'accenture' }
];

const BRANCHES = ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical Engineering', 'Civil Engineering'];

async function createAuthUser(email: string, role: string, fullName: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
  });

  if (error && error.message !== 'User already registered') {
    throw error;
  }
  
  if (data?.user) {
    // Ensure role exists in users table (since we rely on this table in MVP)
    const { error: userError } = await supabase.from('users').upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      role: role
    }, { onConflict: 'id' });
    if (userError) throw userError;
  }
  
  return data?.user;
}

async function seedMock() {
  console.log("Starting mock data seed process...");

  try {
    console.log("Upserting mock companies...");
    const { error: compError } = await supabase.from('companies').upsert(MOCK_COMPANIES, { onConflict: 'id' });
    if (compError) throw compError;

    console.log("Fetching existing users...");
    const { data: users, error: fetchError } = await supabase.from('users').select('*');
    if (fetchError) throw fetchError;
    
    // Create maps for fast lookup
    const userMap = new Map(users.map(u => [u.email, u]));
    console.log("Generating Alumni Directory Records...");
    const alumniRecordsToInsert = [];
    const profilesToInsert = [];
    
    for (let i = 1; i <= 150; i++) {
      if (i % 25 === 0) console.log(`Processed ${i} alumni...`);
      const user = userMap.get(`alumni${i}@v3.demo.com`);
      
      if (!user) {
        console.warn(`Could not find user alumni${i}@v3.demo.com`);
        continue;
      }

      const company = MOCK_COMPANIES[i % MOCK_COMPANIES.length];
      const branch = BRANCHES[i % BRANCHES.length];
      const batchYear = 2010 + (i % 14); // 2010 to 2023
      const isClaimed = i <= 75; // Make half of them claimed
      
      alumniRecordsToInsert.push({
        id: user.id, // Using the auth ID as the alumni_record ID for simplicity in mock
        student_id: `MOCK_ALUMNI_${i}`,
        full_name: `Synthetic Alumni ${i}`,
        branch: branch,
        batch_year: batchYear,
        first_company_id: company.id,
        claim_status: isClaimed ? 'claimed' : 'unclaimed',
        claimed_by: isClaimed ? user.id : null,
        claimed_at: isClaimed ? new Date().toISOString() : null,
        verified_by: isClaimed ? user.id : null, // Auto verify for testing
        verified_at: isClaimed ? new Date().toISOString() : null
      });

      if (isClaimed) {
        profilesToInsert.push({
          user_id: user.id,
          record_id: user.id,
          current_company_id: company.id,
          designation: `Software Engineer L${(i % 5) + 1}`,
          experience_years: 2024 - batchYear,
          location: 'Bangalore, India',
          bio: `Experienced software professional specializing in scalable systems. Passionate about mentoring the next generation of engineers from our university.`,
          mentorship_available: i % 2 === 0,
          referral_available: i % 3 === 0,
          mock_interview_available: i % 4 === 0,
          skills: ['JavaScript', 'React', 'Node.js', 'System Design'].slice(0, (i % 4) + 1)
        });
      }
    }

    // Batch insert records
    console.log("Inserting alumni records to directory...");
    const { error: recError } = await supabase.from('alumni_records').upsert(alumniRecordsToInsert, { onConflict: 'id' });
    if (recError) throw recError;

    if (profilesToInsert.length > 0) {
      console.log("Inserting claimed profiles...");
      const { error: profError } = await supabase.from('alumni_profiles').upsert(profilesToInsert, { onConflict: 'user_id' });
      if (profError) throw profError;
    }

    console.log("Mock data seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seedMock();

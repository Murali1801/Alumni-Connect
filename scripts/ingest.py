import pandas as pd
import numpy as np
import re
import json
import uuid
import secrets
import string
import os

def normalize_placeholders(val):
    if pd.isna(val):
        return np.nan
    val_str = str(val).strip()
    lower_val = val_str.lower()
    placeholders = {'0', '--', '-----', 'na', 'n/a', 'nil'}
    if lower_val in placeholders:
        return np.nan
    return val

def parse_city(address):
    if pd.isna(address):
        return np.nan
    address_str = str(address).strip()
    if not address_str:
        return np.nan
    parts = [p.strip() for p in address_str.split(',')]
    if len(parts) >= 2:
        return parts[-2].title()
    elif len(parts) == 1:
        return parts[0].title()
    return np.nan

def clean_email(email, counters):
    if pd.isna(email):
        return np.nan
    e = str(email).strip().lower()
    if 'gamil.com' in e:
        e = e.replace('gamil.com', 'gmail.com')
        counters['gamil_corrections'] += 1
    
    # basic email regex
    if re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', e):
        return e
    return np.nan

def clean_mobile(mobile):
    if pd.isna(mobile):
        return np.nan
    m = re.sub(r'\D', '', str(mobile))
    if len(m) > 10 and m.startswith('91'):
        m = m[2:]
    if re.match(r'^[6-9]\d{9}$', m):
        return m
    return np.nan

def parse_placement(details, counters):
    if pd.isna(details):
        return pd.Series([np.nan, np.nan, np.nan])
    d = str(details).strip()
    if not d:
        return pd.Series([np.nan, np.nan, np.nan])
    
    parts = [p.strip() for p in d.split('-')]
    company, role, ctc = np.nan, np.nan, np.nan
    
    if len(parts) > 0:
        c = parts[0]
        reject_list = {'available for placement', 'available for placements', 'not placed', 'na', 'nil'}
        if c.lower() not in reject_list and len(c) > 1:
            company = c
            counters['rows_yielding_company'] += 1
            
    if len(parts) > 1 and company is not pd.isna(company):
        r = parts[1]
        if len(r) > 1 and r.lower() not in {'na', 'nil', '--', '-'}:
            role = r
            counters['rows_yielding_role'] += 1
            
    if len(parts) > 2 and company is not pd.isna(company):
        c_val = parts[2]
        c_val_cleaned = re.sub(r'[^\d\.]', '', str(c_val))
        try:
            if c_val_cleaned:
                val = float(c_val_cleaned)
                if val > 1000:
                    val = val / 100000.0
                ctc = round(val, 2)
                counters['rows_yielding_ctc'] += 1
        except ValueError:
            pass
            
    return pd.Series([company, role, ctc])

def canonicalise_company(name):
    if pd.isna(name):
        return np.nan
    
    n = str(name).lower()
    # strip punctuation
    n = re.sub(r'[^\w\s]', '', n)
    # strip extra spaces
    n = re.sub(r'\s+', ' ', n).strip()
    
    # strip legal suffixes
    suffixes = [r'\bpvt\b', r'\bltd\b', r'\blimited\b', r'\bprivate\b', r'\binc\b', r'\bllp\b', r'\btechnologies\b', r'\bsolutions\b']
    for suffix in suffixes:
        n = re.sub(suffix + r'$', '', n).strip()
        
    n = re.sub(r'\s+', ' ', n).strip()
    
    alias_map = {
        'tcs': 'Tata Consultancy Services',
        'tata consultancy': 'Tata Consultancy Services',
        'tata consultancy services': 'Tata Consultancy Services',
        'lti': 'L&T Infotech',
        'lt infotech': 'L&T Infotech',
        'larsen and toubro infotech': 'L&T Infotech',
        'l t infotech': 'L&T Infotech',
        'capg': 'Capgemini',
        'capgemini': 'Capgemini',
        'cts': 'Cognizant',
        'cognizant': 'Cognizant'
    }
    
    if n in alias_map:
        return alias_map[n]
    
    return n.title() if n else np.nan

def generate_token():
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for i in range(32))

def main():
    counters = {
        'gamil_corrections': 0,
        'placement_rows_attempted': 0,
        'rows_yielding_company': 0,
        'rows_yielding_role': 0,
        'rows_yielding_ctc': 0
    }
    
    print("Reading data...")
    df = pd.read_excel('data/Alumni_Details_Till_March_2024.xlsx')
    raw_rows = len(df)
    
    print(f"Loaded {raw_rows} raw rows")
    
    # Drop exact duplicates
    df = df.drop_duplicates()
    after_exact_dedup = len(df)
    print(f"After exact duplicate drop: {after_exact_dedup}")
    
    # Deduplicate on student_id
    # We want the row with the most non-null, non-placeholder values.
    # First, apply placeholder normalization to count valid values
    df_norm = df.map(normalize_placeholders)
    df_norm['valid_count'] = df_norm.notna().sum(axis=1)
    df_norm['original_index'] = df.index
    
    df_norm = df_norm.sort_values(['student_id', 'valid_count'], ascending=[True, False])
    df_norm = df_norm.drop_duplicates(subset=['student_id'], keep='first')
    
    # Restore original rows for the kept indices
    df = df.loc[df_norm['original_index']]
    after_id_dedup = len(df)
    print(f"After student_id dedup: {after_id_dedup}")
    
    # Apply normalization to the remaining rows
    df = df.map(normalize_placeholders)
    
    # Drop PII and unused columns
    cols_to_drop = ['father_mobile', 'mother_mobile', 'landline', 'mobile2', 'ldap', 'status']
    existing_cols_to_drop = [c for c in cols_to_drop if c in df.columns]
    df = df.drop(columns=existing_cols_to_drop)
    
    # Process batch_year
    df['leaving_date'] = pd.to_datetime(df['leaving_date'], errors='coerce')
    df['batch_year'] = df['leaving_date'].dt.year
    # For NaNs or weird values, extract from string if possible, otherwise keep NaN
    # The requirement says "batch_year = year part of leaving_date"
    # Actually the requirement is we just need the year. Let's fill missing with mode or drop?
    # Spec says 2013-2024.
    
    # Process city and drop residence_address
    if 'residence_address' in df.columns:
        df['city'] = df['residence_address'].apply(parse_city)
        df = df.drop(columns=['residence_address'])
    else:
        df['city'] = np.nan
        
    # Clean email
    if 'personal_email' in df.columns:
        df['contact_email'] = df['personal_email'].apply(lambda x: clean_email(x, counters))
        df = df.drop(columns=['personal_email'])
    else:
        df['contact_email'] = np.nan
        
    # Clean mobile
    if 'mobile1' in df.columns:
        df['contact_mobile'] = df['mobile1'].apply(clean_mobile)
        df = df.drop(columns=['mobile1'])
    else:
        df['contact_mobile'] = np.nan
        
    # Process placement_details
    if 'placement_details' in df.columns:
        counters['placement_rows_attempted'] = df['placement_details'].notna().sum()
        df[['company_raw', 'first_role', 'first_ctc_lpa']] = df['placement_details'].apply(lambda x: parse_placement(x, counters))
    else:
        df['company_raw'] = np.nan
        df['first_role'] = np.nan
        df['first_ctc_lpa'] = np.nan
        
    # Canonicalize companies
    df['name_canonical'] = df['company_raw'].apply(canonicalise_company)
    
    raw_companies = df['company_raw'].dropna().unique()
    canonical_companies = df['name_canonical'].dropna().unique()
    
    distinct_raw_companies = len(raw_companies)
    distinct_canonical_companies = len(canonical_companies)
    
    # Create companies dataframe
    companies_df = pd.DataFrame({'name_canonical': canonical_companies})
    companies_df['id'] = [str(uuid.uuid4()) for _ in range(len(companies_df))]
    companies_df['name'] = companies_df['name_canonical'] # For now, name is same as canonical (title cased)
    companies_df['industry'] = np.nan
    
    # Map company ID back to alumni records
    comp_map = companies_df.set_index('name_canonical')['id'].to_dict()
    df['first_company_id'] = df['name_canonical'].map(comp_map)
    
    # Generate claim tokens
    df['claim_token'] = [generate_token() for _ in range(len(df))]
    df['claim_status'] = 'unclaimed'
    
    # Select final columns for alumni_records
    final_cols = ['id', 'student_id', 'full_name', 'branch', 'batch_year', 'city', 
                  'first_company_id', 'first_role', 'first_ctc_lpa', 'higher_ed_raw', 
                  'contact_email', 'contact_mobile', 'claim_token', 'claim_status']
    
    df['id'] = [str(uuid.uuid4()) for _ in range(len(df))]
    
    # Rename columns if necessary
    if 'student_name' in df.columns:
        df = df.rename(columns={'student_name': 'full_name'})
    if 'higher_education_details' in df.columns:
        df = df.rename(columns={'higher_education_details': 'higher_ed_raw'})
        
    # Ensure all final columns exist
    for col in final_cols:
        if col not in df.columns:
            df[col] = np.nan
            
    alumni_records = df[final_cols]
    
    # Generate report
    branch_dist = df['branch'].value_counts().to_dict()
    year_dist = df['batch_year'].value_counts().to_dict()
    
    # Convert year_dist keys to string to be JSON serializable
    year_dist = {str(int(k)): v for k, v in year_dist.items() if not pd.isna(k)}
    
    report = {
        'raw_rows': raw_rows,
        'after_exact_duplicate_drop': after_exact_dedup,
        'after_student_id_dedup': after_id_dedup,
        'gamil_corrections': counters['gamil_corrections'],
        'placement_rows_attempted': int(counters['placement_rows_attempted']),
        'rows_yielding_company': counters['rows_yielding_company'],
        'rows_yielding_role': counters['rows_yielding_role'],
        'rows_yielding_ctc': counters['rows_yielding_ctc'],
        'distinct_raw_companies': distinct_raw_companies,
        'distinct_canonical_companies': distinct_canonical_companies,
        'branch_distribution': branch_dist,
        'year_distribution': year_dist
    }
    
    os.makedirs('seed', exist_ok=True)
    
    with open('seed/ingest_report.json', 'w') as f:
        json.dump(report, f, indent=2)
        
    companies_df.to_csv('seed/companies.csv', index=False)
    alumni_records.to_csv('seed/alumni_records.csv', index=False)
    
    print("Ingestion complete. Seed files generated in seed/ directory.")

if __name__ == '__main__':
    main()

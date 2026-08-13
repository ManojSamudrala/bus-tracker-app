import { createClient } from '@supabase/supabase-js';

// Replace these strings with your actual values from Supabase Project Settings > API
const supabaseUrl = 'https://auynlrtwnmxknphldntp.supabase.co';
const supabaseAnonKey = 'sb_publishable_O9Xn511MHkMfkPxBEWt4_A_I1izFAJt';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
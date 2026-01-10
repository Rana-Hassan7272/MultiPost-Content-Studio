import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createTestAccount() {
  const testEmail = 'test@contentflow.app';
  const testPassword = 'TestUser2024!';

  console.log('Creating test account...');

  try {
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', testEmail)
      .maybeSingle();

    if (existingUser) {
      console.log('Test account already exists!');
      console.log('Email:', testEmail);
      console.log('Password:', testPassword);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (authError) throw authError;

    console.log('✓ Auth user created:', authData.user.id);

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email: testEmail,
      full_name: 'Utilisateur Test',
      company_name: 'ContentFlow Demo',
    });

    if (profileError) throw profileError;
    console.log('✓ Profile created');

    const { error: subscriptionError } = await supabase.from('subscriptions').insert({
      user_id: authData.user.id,
      plan_type: 'pro',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (subscriptionError) throw subscriptionError;
    console.log('✓ Pro subscription created');

    const { data: demoPost } = await supabase
      .from('posts')
      .insert({
        user_id: authData.user.id,
        title: 'Ma première publication de test',
        description: 'Ceci est une publication de démonstration pour découvrir ContentFlow! Vous pouvez la modifier ou la supprimer.',
        platforms: ['youtube', 'instagram'],
        status: 'draft',
      })
      .select()
      .single();

    if (demoPost) {
      await supabase.from('platform_posts').insert([
        {
          post_id: demoPost.id,
          platform: 'youtube',
          status: 'pending',
        },
        {
          post_id: demoPost.id,
          platform: 'instagram',
          status: 'pending',
        },
      ]);
      console.log('✓ Demo post created');
    }

    console.log('\n✅ Test account created successfully!\n');
    console.log('Login credentials:');
    console.log('Email:', testEmail);
    console.log('Password:', testPassword);
    console.log('\nPlan: Pro (30 days trial)');
  } catch (error) {
    console.error('❌ Error creating test account:', error.message);
    process.exit(1);
  }
}

createTestAccount();

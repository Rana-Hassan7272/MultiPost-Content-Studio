import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTestAccount() {
  const testEmail = 'test@contentflow.app';
  const testPassword = 'TestUser2024!';

  console.log('Creating test account via signup...\n');

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: 'Utilisateur Test',
          company_name: 'ContentFlow Demo',
        },
      },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('✓ Test account already exists!\n');
        console.log('Login credentials:');
        console.log('Email:', testEmail);
        console.log('Password:', testPassword);
        return;
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('No user data returned');
    }

    console.log('✓ Account created:', authData.user.id);

    await supabase.from('profiles').insert({
      id: authData.user.id,
      email: testEmail,
      full_name: 'Utilisateur Test',
      company_name: 'ContentFlow Demo',
    });
    console.log('✓ Profile created');

    await supabase.from('subscriptions').insert({
      user_id: authData.user.id,
      plan_type: 'pro',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
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
    console.log('=================================');
    console.log('Login credentials:');
    console.log('Email:', testEmail);
    console.log('Password:', testPassword);
    console.log('Plan: Pro (30 days trial)');
    console.log('=================================\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestAccount();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestAccount() {
  const testEmail = 'test@contentflow.app';
  const testPassword = 'TestUser2024!';

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (authError) throw authError;

    console.log('User created:', authData.user.id);

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email: testEmail,
      full_name: 'Utilisateur Test',
      company_name: 'ContentFlow Demo',
    });

    if (profileError) throw profileError;

    const { error: subscriptionError } = await supabase.from('subscriptions').insert({
      user_id: authData.user.id,
      plan_type: 'pro',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (subscriptionError) throw subscriptionError;

    const demoPost = await supabase.from('posts').insert({
      user_id: authData.user.id,
      title: 'Ma première publication test',
      description: 'Ceci est une publication de démonstration pour tester ContentFlow!',
      platforms: ['youtube', 'instagram'],
      status: 'draft',
    }).select().single();

    if (demoPost.data) {
      await supabase.from('platform_posts').insert([
        {
          post_id: demoPost.data.id,
          platform: 'youtube',
          status: 'pending',
        },
        {
          post_id: demoPost.data.id,
          platform: 'instagram',
          status: 'pending',
        },
      ]);
    }

    console.log('Test account created successfully!');
    console.log('Email:', testEmail);
    console.log('Password:', testPassword);
  } catch (error) {
    console.error('Error creating test account:', error);
  }
}

createTestAccount();

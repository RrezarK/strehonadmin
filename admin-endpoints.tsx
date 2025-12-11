// ============================================================================
// ADMIN PROFILE API ENDPOINTS
// ============================================================================
// Add these endpoints to the main index.tsx file after the create-admin endpoint

// Get current admin user profile
app.get("/make-server-0bdba248/admin/me", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'No authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    if (user.user_metadata?.role !== 'platform_admin') {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }

    let dbUser = null;
    try {
      const { data, error: dbError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (!dbError && data) {
        dbUser = data;
      }
    } catch (e) {
      console.log('[Admin Profile] User not in public.users table');
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || dbUser?.name || user.email?.split('@')[0] || 'Admin',
        role: user.user_metadata?.role || 'platform_admin',
        phone: user.user_metadata?.phone || dbUser?.phone_number || '',
        avatarUrl: user.user_metadata?.avatar_url || '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_verified: !!user.email_confirmed_at,
      }
    });
  } catch (error: any) {
    console.error('[Admin Profile] Error:', error);
    return c.json({ success: false, error: error.message || 'Failed to fetch profile' }, 500);
  }
});

// Update admin user profile
app.put("/make-server-0bdba248/admin/me", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'No authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const body = await c.req.json();
    const { name, phone, avatarUrl } = body;
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    if (user.user_metadata?.role !== 'platform_admin') {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }

    const updatedMetadata = {
      ...user.user_metadata,
      name: name || user.user_metadata?.name,
      phone: phone || user.user_metadata?.phone,
      avatar_url: avatarUrl || user.user_metadata?.avatar_url,
    };

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { user_metadata: updatedMetadata }
    );

    if (updateError) {
      throw updateError;
    }

    try {
      await supabaseAdmin
        .from('users')
        .upsert({
          id: user.id,
          email: user.email,
          name: name || user.user_metadata?.name,
          phone_number: phone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (e) {
      console.log('[Admin Profile] Could not update public.users');
    }

    return c.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        email: user.email,
        name: name || user.user_metadata?.name,
        phone: phone,
        avatarUrl: avatarUrl,
      }
    });
  } catch (error: any) {
    console.error('[Admin Profile] Error updating:', error);
    return c.json({ success: false, error: error.message || 'Failed to update profile' }, 500);
  }
});

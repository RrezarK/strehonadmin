/**
 * Admin Routes
 * Handles admin user creation and profile management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { getRoleUUID } from "../lib/constants.tsx";

const admin = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Create first admin user for the platform
admin.post("/create-admin", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password) {
      return c.json({ 
        success: false,
        error: "Email and password are required" 
      }, 400);
    }

    console.log(`[Admin] Creating admin user: ${email}`);

    // Create admin user in auth.users
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name || email.split('@')[0],
        role: 'platform_admin',
        created_via: 'admin_signup_endpoint',
        created_at: new Date().toISOString(),
      }
    });

    if (userError) {
      console.error(`[Admin] Error creating admin user:`, userError);
      return c.json({ 
        success: false,
        error: userError.message,
        details: 'Failed to create admin user in auth.users'
      }, 400);
    }

    if (!userData?.user) {
      return c.json({ 
        success: false,
        error: 'User creation returned no data'
      }, 500);
    }

    console.log(`[Admin] ✓ Created admin user: ${userData.user.id}`);

    // Try to insert into public.users table (optional, for admin users)
    try {
      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userData.user.id,
          email: email,
          name: name || email.split('@')[0],
          role_id: getRoleUUID('platform_admin'),
          tenant_id: null, // Admin users don't belong to a tenant
        });

      if (insertError) {
        console.warn(`[Admin] Could not insert into public.users table:`, insertError.message);
      } else {
        console.log(`[Admin] ✓ Also created record in public.users table`);
      }
    } catch (dbError) {
      console.warn(`[Admin] Exception inserting into public.users:`, dbError);
    }

    return c.json({ 
      success: true,
      message: "Admin user created successfully",
      user: {
        id: userData.user.id,
        email: userData.user.email,
        name: name || email.split('@')[0],
      },
      instructions: "You can now log in to the admin panel with these credentials"
    });

  } catch (error: any) {
    console.error("[Admin] Error creating admin user:", error);
    return c.json({ 
      success: false,
      error: error.message || 'Failed to create admin user'
    }, 500);
  }
});

// Get current admin user profile
admin.get("/me", async (c) => {
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

    let dbUser: any = null;
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
admin.put("/me", async (c) => {
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

export default admin;


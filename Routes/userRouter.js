// Routes/userRouter.js - User Management API พร้อม Role-based Access Control
const express = require('express');
const router = express.Router();
const Parse = require('parse/node');

// 🆕 Import middleware ใหม่ (แทน authenticateToken เดิม)
const { requireAuth, checkPermissions, requireSuperAdmin, getUserRoles } = require('../middleware/auth');

// Helper function
const fail = (res, status, msg) =>
  res.status(status).json({ status, message: msg });

const isUrl = s => /^https?:\/\/.+/i.test(s);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ───────────────────────────────────────────── */
/*  📖 GET /api/users - ดู users ทั้งหมด         */
/*  สิทธิ์: ทุก role ที่ login แล้ว (admin, developer, super_admin) */
/* ───────────────────────────────────────────── */
router.get('/users', requireAuth, checkPermissions('read'), async (req, res) => {
  console.log('📋 Users list endpoint called by:', req.user.get('username'));
  
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const userQuery = new Parse.Query(Parse.User);
    
    // ถ้ามีการค้นหา
    if (search) {
      userQuery.contains('username', search);
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    userQuery.skip(skip);
    userQuery.limit(parseInt(limit));
    
    // Select fields (ไม่เอา sensitive data)
    userQuery.select(['username', 'email', 'firstname', 'lastname', 'phone', 'imageUrl', 'createdAt', 'updatedAt']);
    
    const users = await userQuery.find({ useMasterKey: true });
    const total = await userQuery.count({ useMasterKey: true });
    
    // แปลงข้อมูล และเพิ่ม roles
    const userData = [];
    for (const user of users) {
      const userRoles = await getUserRoles(user);
      userData.push({
        id: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        phone: user.get('phone'),
        imageUrl: user.get('imageUrl') || '',
        roles: userRoles, // 🆕 เพิ่ม roles
        createdAt: user.get('createdAt'),
        updatedAt: user.get('updatedAt')
      });
    }
    
    console.log(`✅ ${req.user.get('username')} (${req.userRoles.join(',')}) viewed ${users.length} users`);
    
    res.json({
      status: 200,
      message: 'Users fetched successfully',
      data: userData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      },
      requestedBy: {
        username: req.user.get('username'),
        roles: req.userRoles // 🆕 แสดง roles ของคนที่ request
      }
    });
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    fail(res, 500, error.message);
  }
});

/* ───────────────────────────────────────────── */
/*  📖 GET /api/user/:id - ดู user คนเดียว       */
/*  สิทธิ์: ทุก role ที่ login แล้ว              */
/* ───────────────────────────────────────────── */
router.get('/user/:id', requireAuth, checkPermissions('read'), async (req, res) => {
  console.log('👤 Get user by ID endpoint called:', req.params.id, 'by:', req.user.get('username'));
  
  try {
    const { id } = req.params;
    
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(id, { useMasterKey: true });
    
    if (!user) {
      return fail(res, 404, 'User not found');
    }
    
    // หา roles ของ user นี้
    const userRoles = await getUserRoles(user);
    
    console.log(`✅ ${req.user.get('username')} viewed user ${user.get('username')}`);
    
    res.json({
      status: 200,
      message: 'User fetched successfully',
      data: {
        id: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        phone: user.get('phone'),
        imageUrl: user.get('imageUrl') || '',
        roles: userRoles, // 🆕 เพิ่ม roles
        createdAt: user.get('createdAt'),
        updatedAt: user.get('updatedAt')
      },
      requestedBy: {
        username: req.user.get('username'),
        roles: req.userRoles
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    const status = error.code === 101 ? 404 : 500;
    fail(res, status, error.code === 101 ? 'User not found' : error.message);
  }
});

/* ───────────────────────────────────────────── */
/*  ➕ POST /api/register - สร้าง user ใหม่       */
/*  สิทธิ์: เฉพาะ developer และ super_admin     */
/* ───────────────────────────────────────────── */
router.post('/register', requireAuth, checkPermissions('create'), async (req, res) => {
  console.log('📝 Register endpoint called by:', req.user.get('username'), 'with body:', req.body);
  
  const {
    username,
    password,
    firstname = '',
    lastname = '',
    phone = '',
    email = '',
    imageUrl = '',
    roles = ['admin'], // 🆕 เพิ่ม roles (default เป็น admin)
    moreInfo = [],
    fileIds = []
  } = req.body;

  // Validation
  if (!username || !password) {
    return fail(res, 400, 'Username and password are required.');
  }
  if (!Array.isArray(fileIds)) {
    return fail(res, 400, 'fileIds must be an array.');
  }
  if (email && !isEmail(email)) {
    return fail(res, 400, 'Invalid email format');
  }
  if (imageUrl && !isUrl(imageUrl)) {
    return fail(res, 400, 'imageUrl must be a valid URL');
  }

  try {
    // ตรวจสอบว่า username ซ้ำหรือไม่
    const existingUserQuery = new Parse.Query(Parse.User);
    existingUserQuery.equalTo('username', username);
    const existingUser = await existingUserQuery.first({ useMasterKey: true });
    
    if (existingUser) {
      return fail(res, 400, `Username '${username}' มีอยู่แล้ว`);
    }

    // สร้าง user ใหม่
    const user = new Parse.User();
    user.set('username', username);
    user.set('password', password);
    user.set('firstname', firstname);
    user.set('lastname', lastname);
    user.set('phone', phone);
    user.set('email', email);
    user.set('imageUrl', imageUrl);
    user.set('moreInfo', moreInfo);
    user.set('files', fileIds);

    const newUser = await user.signUp();

    // 🆕 เพิ่ม roles ให้ user ใหม่
    const addedRoles = [];
    for (const roleName of roles) {
      try {
        const roleQuery = new Parse.Query(Parse.Role);
        roleQuery.equalTo('name', roleName);
        const role = await roleQuery.first({ useMasterKey: true });
        
        if (role) {
          role.getUsers().add(newUser);
          await role.save(null, { useMasterKey: true });
          addedRoles.push(roleName);
          console.log(`✅ Added user ${username} to role ${roleName}`);
        } else {
          console.warn(`⚠️  Role ${roleName} not found`);
        }
      } catch (roleError) {
        console.error(`❌ Error adding role ${roleName}:`, roleError);
      }
    }

    console.log(`✅ ${req.user.get('username')} created user ${username} with roles:`, addedRoles);

    res.json({
      status: 200,
      message: 'User registered successfully',
      data: {
        id: newUser.id,
        username: newUser.get('username'),
        email: newUser.get('email'),
        firstname: newUser.get('firstname'),
        lastname: newUser.get('lastname'),
        phone: newUser.get('phone'),
        imageUrl: newUser.get('imageUrl') || '',
        roles: addedRoles, // 🆕 แสดง roles ที่เพิ่ม
        files: newUser.get('files') || [],
        createdAt: newUser.get('createdAt')
      },
      createdBy: {
        username: req.user.get('username'),
        roles: req.userRoles
      }
    });
  } catch (err) { 
    console.error('❌ Register error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  ✏️ PATCH /api/user/:id - แก้ไข user          */
/*  สิทธิ์: เฉพาะ developer และ super_admin     */
/* ───────────────────────────────────────────── */
router.patch('/user/:id', requireAuth, checkPermissions('update'), async (req, res) => {
  console.log('✏️ Update user endpoint called:', req.params.id, 'by:', req.user.get('username'), req.body);
  
  const {
    addFiles = [],
    removeFiles = [],
    fileIds,
    roles, // 🆕 เพิ่มการแก้ไข roles
    ...restBody
  } = req.body;

  // Allow-list ของ field ที่แก้ไขได้
  const ALLOWED_FIELDS = [
    'firstname',
    'lastname', 
    'phone',
    'email',
    'password',
    'imageUrl',
    'moreInfo',
    'username',
    'fileIds',
  ];

  const updates = {};
  for (const k of Object.keys(restBody)) {
    if (!ALLOWED_FIELDS.includes(k)) {
      return fail(res, 400, `Field "${k}" is not allowed`);
    }
    updates[k] = restBody[k];
  }

  // Validation
  if (updates.email && !isEmail(updates.email)) {
    return fail(res, 400, 'Invalid email format');
  }
  if (updates.imageUrl && !isUrl(updates.imageUrl)) {
    return fail(res, 400, 'imageUrl must be a valid URL');
  }
  if (updates.username && typeof updates.username !== 'string') {
    return fail(res, 400, 'username must be a string');
  }
  if (fileIds !== undefined && !Array.isArray(fileIds)) {
    return fail(res, 400, 'fileIds must be an array of File objectIds');
  }
  if (!Array.isArray(addFiles) || !Array.isArray(removeFiles)) {
    return fail(res, 400, 'addFiles/removeFiles must be arrays.');
  }

  try {
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(req.params.id, { useMasterKey: true });
    
    if (!user) {
      return fail(res, 404, 'User not found');
    }

    // ป้องกันไม่ให้แก้ไขตัวเอง
    if (user.id === req.user.id) {
      return fail(res, 400, 'ไม่สามารถแก้ไขข้อมูลตัวเองผ่าน API นี้ได้');
    }

    // แก้ไขข้อมูลพื้นฐาน
    for (const [key, value] of Object.entries(updates)) {
      user.set(key, value);
    }

    // จัดการ files
    if (fileIds !== undefined) {
      user.set('files', fileIds);
    } else {
      let currentFiles = user.get('files') || [];
      currentFiles = currentFiles.concat(addFiles);
      currentFiles = currentFiles.filter(f => !removeFiles.includes(f));
      user.set('files', currentFiles);
    }

    await user.save(null, { useMasterKey: true });

    // 🆕 แก้ไข roles ถ้ามี (เฉพาะ super_admin)
    let updatedRoles = [];
    if (roles && Array.isArray(roles)) {
      const currentUserRoles = await getUserRoles(req.user);
      if (!currentUserRoles.includes('super_admin')) {
        return fail(res, 403, 'เฉพาะ super_admin เท่านั้นที่สามารถแก้ไข roles ได้');
      }

      // ลบออกจาก roles เดิมทั้งหมด
      const oldRoleQuery = new Parse.Query(Parse.Role);
      oldRoleQuery.equalTo('users', user);
      const oldRoles = await oldRoleQuery.find({ useMasterKey: true });
      
      for (const oldRole of oldRoles) {
        oldRole.getUsers().remove(user);
        await oldRole.save(null, { useMasterKey: true });
      }
      
      // เพิ่มเข้า roles ใหม่
      for (const roleName of roles) {
        const roleQuery = new Parse.Query(Parse.Role);
        roleQuery.equalTo('name', roleName);
        const role = await roleQuery.first({ useMasterKey: true });
        
        if (role) {
          role.getUsers().add(user);
          await role.save(null, { useMasterKey: true });
          updatedRoles.push(roleName);
        }
      }
    } else {
      // ถ้าไม่ได้ส่ง roles มา ให้ดู roles เดิม
      updatedRoles = await getUserRoles(user);
    }

    console.log(`✅ ${req.user.get('username')} updated user ${user.get('username')}`);

    res.json({
      status: 200,
      message: 'User updated successfully',
      data: {
        id: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        phone: user.get('phone'),
        imageUrl: user.get('imageUrl') || '',
        roles: updatedRoles, // 🆕 แสดง roles ที่อัปเดต
        files: user.get('files') || [],
        updatedAt: user.get('updatedAt')
      },
      updatedBy: {
        username: req.user.get('username'),
        roles: req.userRoles
      }
    });
  } catch (err) { 
    console.error('❌ Update user error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  🗑️ DELETE /api/user/:id - ลบ user            */
/*  สิทธิ์: เฉพาะ developer และ super_admin     */
/* ───────────────────────────────────────────── */
router.delete('/user/:id', requireAuth, checkPermissions('delete'), async (req, res) => {
  console.log('🗑️ Delete user endpoint called:', req.params.id, 'by:', req.user.get('username'));
  
  try {
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(req.params.id, { useMasterKey: true });
    
    if (!user) {
      return fail(res, 404, 'User not found');
    }

    // ป้องกันไม่ให้ลบตัวเอง
    if (user.id === req.user.id) {
      return fail(res, 400, 'ไม่สามารถลบ user ตัวเองได้');
    }
    
    const deletedUsername = user.get('username');
    
    // ลบออกจาก roles ทั้งหมดก่อน
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('users', user);
    const roles = await roleQuery.find({ useMasterKey: true });
    
    for (const role of roles) {
      role.getUsers().remove(user);
      await role.save(null, { useMasterKey: true });
    }
    
    // ลบ user
    await user.destroy({ useMasterKey: true });
    
    console.log(`✅ ${req.user.get('username')} deleted user ${deletedUsername}`);
    
    res.json({
      status: 200,
      message: 'User deleted successfully',
      deletedUser: {
        id: req.params.id,
        username: deletedUsername
      },
      deletedBy: {
        username: req.user.get('username'),
        roles: req.userRoles
      }
    });
  } catch (err) { 
    console.error('❌ Delete user error:', err.message);
    fail(res, err.message === 'User not found' ? 404 : 500, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  🔧 POST /api/user/:id/roles - เพิ่ม role     */
/*  สิทธิ์: เฉพาะ super_admin                   */
/* ───────────────────────────────────────────── */
router.post('/user/:id/roles', requireAuth, requireSuperAdmin, async (req, res) => {
  console.log('🔧 Add role endpoint called:', req.params.id, req.body, 'by:', req.user.get('username'));
  
  try {
    const { id } = req.params;
    const { roleName } = req.body;
    
    if (!roleName) {
      return fail(res, 400, 'ต้องระบุ roleName');
    }
    
    // หา user และ role
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(id, { useMasterKey: true });
    
    const targetRoleQuery = new Parse.Query(Parse.Role);
    targetRoleQuery.equalTo('name', roleName);
    const role = await targetRoleQuery.first({ useMasterKey: true });
    
    if (!user || !role) {
      return fail(res, 404, 'ไม่พบ user หรือ role ที่ระบุ');
    }
    
    // เพิ่ม user เข้า role
    role.getUsers().add(user);
    await role.save(null, { useMasterKey: true });
    
    console.log(`✅ ${req.user.get('username')} added role ${roleName} to user ${user.get('username')}`);
    
    res.json({
      status: 200,
      message: `เพิ่ม user เข้า role ${roleName} เรียบร้อยแล้ว`,
      data: {
        userId: user.id,
        username: user.get('username'),
        addedRole: roleName
      }
    });
  } catch (error) {
    console.error('❌ Error adding role:', error);
    fail(res, 500, error.message);
  }
});

/* ───────────────────────────────────────────── */
/*  LOGIN ยังคงใช้ระบบเดิม                       */
/* ───────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  console.log('🔐 Login endpoint called with body:', req.body);
  
  const { username, password } = req.body;

  try {
    // Login ด้วย Parse
    const user = await Parse.User.logIn(username, password);
    
    // 🆕 หา roles ของ user
    const userRoles = await getUserRoles(user);
    
    // กำหนด permissions ตาม roles
    const permissions = {
      canCreate: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canRead: userRoles.length > 0,
      canUpdate: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canDelete: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canManageRoles: userRoles.includes('super_admin')
    };
    
    console.log(`✅ User ${username} logged in with roles:`, userRoles);
    
    res.json({
      status: 200,
      message: 'Login successful',
      data: {
        id: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        roles: userRoles, // 🆕 เพิ่ม roles
        permissions: permissions, // 🆕 เพิ่ม permissions
        sessionToken: user.getSessionToken(),
        files: user.get('files') || [],
        imageUrl: user.get('imageUrl') || '',
        loginAt: new Date().toISOString()
      },
    });
  } catch (err) { 
    console.error('❌ Login error:', err.message);
    fail(res, 400, err.message === 'Invalid username/password.' ? 
      'Username หรือ Password ไม่ถูกต้อง' : err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  ME - ดูข้อมูลตัวเอง                          */
/* ───────────────────────────────────────────── */
router.get('/me', requireAuth, async (req, res) => {
  console.log('👤 Me endpoint called by:', req.user.get('username'));
  
  try {
    const user = req.user;
    if (!user) return fail(res, 404, 'User not found.');

    // หา roles ของ user ปัจจุบัน
    const userRoles = await getUserRoles(user);
    
    const permissions = {
      canCreate: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canRead: userRoles.length > 0,
      canUpdate: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canDelete: userRoles.includes('super_admin') || userRoles.includes('developer'),
      canManageRoles: userRoles.includes('super_admin')
    };

    res.json({
      status: 200,
      message: 'User info retrieved successfully',
      data: {
        id: user.id,
        username: user.get('username'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        phone: user.get('phone'),
        email: user.get('email'),
        imageUrl: user.get('imageUrl') || '',
        roles: userRoles, // 🆕 เพิ่ม roles
        permissions: permissions, // 🆕 เพิ่ม permissions
        files: user.get('files') || [],
        lastLogin: user.get('updatedAt')
      },
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    fail(res, 500, error.message);
  }
});

// เพิ่ม test route
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  res.json({ 
    message: 'User router with Role-based Access Control is working!', 
    timestamp: new Date(),
    roleBasedEndpoints: {
      'GET /api/users': 'ทุก role ที่ login (admin, developer, super_admin)',
      'GET /api/user/:id': 'ทุก role ที่ login (admin, developer, super_admin)',
      'POST /api/register': 'เฉพาะ developer และ super_admin',
      'PATCH /api/user/:id': 'เฉพาะ developer และ super_admin',
      'DELETE /api/user/:id': 'เฉพาะ developer และ super_admin',
      'POST /api/user/:id/roles': 'เฉพาะ super_admin',
      'POST /api/login': 'ไม่ต้อง login (public)',
      'GET /api/me': 'ทุก role ที่ login'
    }
  });
});

console.log('✅ userRouter with Role-based Access Control setup complete');
module.exports = router;
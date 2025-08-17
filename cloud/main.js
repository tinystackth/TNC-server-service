// cloud/main.js - ฉบับสมบูรณ์ (ไม่มี user role)

console.log('🚀 Loading Cloud Functions for Role Management...');

// ===================================
// Helper Functions
// ===================================

// ฟังก์ชันช่วยตรวจสอบ role ของ user
const getUserRoles = async (user) => {
  try {
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('users', user);
    const roles = await roleQuery.find({ useMasterKey: true });
    return roles.map(role => role.get('name'));
  } catch (error) {
    console.error('Error getting user roles:', error);
    return [];
  }
};

// ฟังก์ชันตรวจสอบว่า user มี permission หรือไม่
const hasPermission = (userRoles, requiredPermission) => {
  if (requiredPermission === 'read') {
    return userRoles.length > 0; // ทุก role สามารถ read ได้
  } else if (['create', 'update', 'delete'].includes(requiredPermission)) {
    return userRoles.includes('super_admin') || userRoles.includes('developer');
  } else if (requiredPermission === 'manage_roles') {
    return userRoles.includes('super_admin');
  }
  return false;
};

// Helper function สำหรับ permissions ของแต่ละ role
const getRolePermissions = (roleName) => {
  const permissions = {
    'super_admin': {
      create: true,
      read: true,
      update: true,
      delete: true,
      manageRoles: true,
      manageUsers: true,
      level: 3,
      description: 'เจ้านาย - ทำได้ทุกอย่าง รวมถึงจัดการ roles'
    },
    'developer': {
      create: true,
      read: true,
      update: true,
      delete: true,
      manageRoles: false,
      manageUsers: true,
      level: 2,
      description: 'นักพัฒนา - CRUD users ได้หมด แต่จัดการ roles ไม่ได้'
    },
    'admin': {
      create: false,
      read: true,
      update: false,
      delete: false,
      manageRoles: false,
      manageUsers: false,
      level: 1,
      description: 'แอดมิน - ดู users ได้อย่างเดียว (role ต่ำสุด)'
    }
  };
  
  return permissions[roleName] || {
    create: false,
    read: false,
    update: false,
    delete: false,
    manageRoles: false,
    manageUsers: false,
    level: 0,
    description: 'Role ไม่รู้จัก - ไม่มีสิทธิ์'
  };
};

// ===================================
// User Management Functions
// ===================================

// 🔍 Cloud Function: หา User IDs ทั้งหมด
Parse.Cloud.define('getUserIds', async (request) => {
  try {
    console.log('🔍 Getting all user IDs...');
    
    const userQuery = new Parse.Query(Parse.User);
    const users = await userQuery.find({ useMasterKey: true });
    
    const userData = [];
    
    for (const user of users) {
      const userRoles = await getUserRoles(user);
      const permissions = userRoles.length > 0 ? getRolePermissions(userRoles[0]) : getRolePermissions('unknown');
      
      userData.push({
        id: user.id,
        username: user.get('username'),
        email: user.get('email') || 'ไม่มี email',
        firstname: user.get('firstname') || '',
        lastname: user.get('lastname') || '',
        phone: user.get('phone') || '',
        roles: userRoles,
        permissions: permissions,
        createdAt: user.get('createdAt'),
        updatedAt: user.get('updatedAt')
      });
    }
    
    console.log(`✅ Found ${users.length} users in system`);
    
    return {
      success: true,
      message: `พบ ${users.length} users ในระบบ`,
      data: userData,
      totalUsers: users.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting user IDs:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 📊 Cloud Function: ตรวจสอบ role ของ user
Parse.Cloud.define('checkUserRole', async (request) => {
  const { user } = request;
  
  if (!user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'ต้อง login ก่อน');
  }
  
  try {
    const roles = await getUserRoles(user);
    
    return {
      success: true,
      data: {
        userId: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        roles: roles,
        permissions: {
          canCreate: hasPermission(roles, 'create'),
          canRead: hasPermission(roles, 'read'),
          canUpdate: hasPermission(roles, 'update'),
          canDelete: hasPermission(roles, 'delete'),
          canManageRoles: hasPermission(roles, 'manage_roles')
        },
        roleDetails: roles.map(roleName => getRolePermissions(roleName)),
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error checking user roles:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error checking user roles');
  }
});

// ===================================
// Role Management Functions
// ===================================

// 🆕 Cloud Function: สร้าง role ใหม่
Parse.Cloud.define('createRole', async (request) => {
  const { roleName } = request.params;
  
  if (!roleName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ roleName');
  }
  
  try {
    console.log(`🔧 Creating new role: ${roleName}`);
    
    // ตรวจสอบว่า role มีอยู่แล้วหรือไม่
    const existingRoleQuery = new Parse.Query(Parse.Role);
    existingRoleQuery.equalTo('name', roleName);
    const existingRole = await existingRoleQuery.first({ useMasterKey: true });
    
    if (existingRole) {
      return {
        success: false,
        message: `Role '${roleName}' มีอยู่แล้ว`,
        data: {
          roleId: existingRole.id,
          roleName: existingRole.get('name'),
          permissions: getRolePermissions(roleName)
        }
      };
    }
    
    // สร้าง role ใหม่
    const newRole = new Parse.Role(roleName, new Parse.ACL());
    await newRole.save(null, { useMasterKey: true });
    
    console.log(`✅ Created new role: ${roleName} with ID: ${newRole.id}`);
    
    return {
      success: true,
      message: `สร้าง role '${roleName}' เรียบร้อยแล้ว`,
      data: {
        roleId: newRole.id,
        roleName: newRole.get('name'),
        permissions: getRolePermissions(roleName),
        createdAt: newRole.get('createdAt')
      }
    };
  } catch (error) {
    console.error('❌ Error creating role:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 📋 Cloud Function: ดู roles ทั้งหมดและ users ในแต่ละ role
Parse.Cloud.define('getAllRoles', async (request) => {
  try {
    console.log('📋 Getting all roles and their users...');
    
    const roleQuery = new Parse.Query(Parse.Role);
    const roles = await roleQuery.find({ useMasterKey: true });
    
    const roleData = [];
    
    for (const role of roles) {
      const roleName = role.get('name');
      
      // ดึง users ที่อยู่ใน role นี้
      const usersRelation = role.getUsers();
      const relatedUsers = await usersRelation.query().find({ useMasterKey: true });
      
      roleData.push({
        roleId: role.id,
        roleName: roleName,
        userCount: relatedUsers.length,
        users: relatedUsers.map(user => ({
          id: user.id,
          username: user.get('username'),
          email: user.get('email') || '',
          firstname: user.get('firstname') || '',
          lastname: user.get('lastname') || '',
          phone: user.get('phone') || '',
          createdAt: user.get('createdAt')
        })),
        permissions: getRolePermissions(roleName),
        createdAt: role.get('createdAt'),
        updatedAt: role.get('updatedAt')
      });
    }
    
    // เรียงตาม level (super_admin -> developer -> admin)
    roleData.sort((a, b) => b.permissions.level - a.permissions.level);
    
    console.log(`✅ Found ${roles.length} roles in system`);
    
    return {
      success: true,
      message: `พบ ${roles.length} roles ในระบบ`,
      data: {
        totalRoles: roles.length,
        roles: roleData,
        hierarchy: [
          'super_admin (Level 3)',
          'developer (Level 2)', 
          'admin (Level 1 - ต่ำสุด)'
        ]
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting all roles:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🔧 Cloud Function: เพิ่ม user เข้า role
Parse.Cloud.define('addUserToRole', async (request) => {
  const { userId, roleName } = request.params;
  
  if (!userId || !roleName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ userId และ roleName');
  }
  
  try {
    console.log(`🔧 Adding user ${userId} to role ${roleName}`);
    
    // หา role
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('name', roleName);
    const role = await roleQuery.first({ useMasterKey: true });
    
    if (!role) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ role ชื่อ ${roleName}`);
    }
    
    // หา user
    const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ user ID ${userId}`);
    }
    
    // ตรวจสอบว่า user อยู่ใน role นี้แล้วหรือยัง
    const existingUsersQuery = role.getUsers().query();
    existingUsersQuery.equalTo('objectId', userId);
    const existingUser = await existingUsersQuery.first({ useMasterKey: true });
    
    if (existingUser) {
      return {
        success: false,
        message: `${user.get('username')} อยู่ใน role ${roleName} อยู่แล้ว`,
        data: {
          userId: user.id,
          username: user.get('username'),
          roleName: roleName,
          permissions: getRolePermissions(roleName)
        }
      };
    }
    
    // เพิ่ม user เข้า role
    role.getUsers().add(user);
    await role.save(null, { useMasterKey: true });
    
    console.log(`✅ เพิ่ม ${user.get('username')} เข้า role ${roleName} สำเร็จ`);
    
    return { 
      success: true, 
      message: `เพิ่ม ${user.get('username')} เข้า role ${roleName} เรียบร้อยแล้ว`,
      data: {
        userId: user.id,
        username: user.get('username'),
        email: user.get('email'),
        firstname: user.get('firstname'),
        lastname: user.get('lastname'),
        roleName: roleName,
        permissions: getRolePermissions(roleName),
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error adding user to role:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🗑️ Cloud Function: ลบ user ออกจาก role
Parse.Cloud.define('removeUserFromRole', async (request) => {
  const { userId, roleName } = request.params;
  
  if (!userId || !roleName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ userId และ roleName');
  }
  
  try {
    console.log(`🗑️ Removing user ${userId} from role ${roleName}`);
    
    // หา role
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('name', roleName);
    const role = await roleQuery.first({ useMasterKey: true });
    
    if (!role) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ role ชื่อ ${roleName}`);
    }
    
    // หา user
    const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ user ID ${userId}`);
    }
    
    // ลบ user ออกจาก role
    role.getUsers().remove(user);
    await role.save(null, { useMasterKey: true });
    
    console.log(`✅ ลบ ${user.get('username')} ออกจาก role ${roleName} สำเร็จ`);
    
    return { 
      success: true, 
      message: `ลบ ${user.get('username')} ออกจาก role ${roleName} เรียบร้อยแล้ว`,
      data: {
        userId: user.id,
        username: user.get('username'),
        roleName: roleName,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error removing user from role:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🔄 Cloud Function: เปลี่ยน role ของ user
Parse.Cloud.define('changeUserRole', async (request) => {
  const { userId, oldRoleName, newRoleName } = request.params;
  
  if (!userId || !oldRoleName || !newRoleName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ userId, oldRoleName และ newRoleName');
  }
  
  try {
    console.log(`🔄 Changing user ${userId} role from ${oldRoleName} to ${newRoleName}`);
    
    // หา user
    const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ user ID ${userId}`);
    }
    
    // ลบออกจาก role เดิม
    if (oldRoleName !== 'none') {
      const oldRoleQuery = new Parse.Query(Parse.Role);
      oldRoleQuery.equalTo('name', oldRoleName);
      const oldRole = await oldRoleQuery.first({ useMasterKey: true });
      
      if (oldRole) {
        oldRole.getUsers().remove(user);
        await oldRole.save(null, { useMasterKey: true });
      }
    }
    
    // เพิ่มเข้า role ใหม่
    const newRoleQuery = new Parse.Query(Parse.Role);
    newRoleQuery.equalTo('name', newRoleName);
    const newRole = await newRoleQuery.first({ useMasterKey: true });
    
    if (!newRole) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ role ชื่อ ${newRoleName}`);
    }
    
    newRole.getUsers().add(user);
    await newRole.save(null, { useMasterKey: true });
    
    console.log(`✅ เปลี่ยน role ของ ${user.get('username')} จาก ${oldRoleName} เป็น ${newRoleName} สำเร็จ`);
    
    return {
      success: true,
      message: `เปลี่ยน role ของ ${user.get('username')} จาก ${oldRoleName} เป็น ${newRoleName} เรียบร้อยแล้ว`,
      data: {
        userId: user.id,
        username: user.get('username'),
        email: user.get('email'),
        oldRole: oldRoleName,
        newRole: newRoleName,
        oldPermissions: getRolePermissions(oldRoleName),
        newPermissions: getRolePermissions(newRoleName),
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error changing user role:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🧹 Cloud Function: ล้าง roles ทั้งหมดของ user
Parse.Cloud.define('clearUserRoles', async (request) => {
  const { userId } = request.params;
  
  if (!userId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ userId');
  }
  
  try {
    console.log(`🧹 Clearing all roles for user ${userId}`);
    
    // หา user
    const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ user ID ${userId}`);
    }
    
    // หา roles ทั้งหมดที่ user อยู่
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('users', user);
    const userRoles = await roleQuery.find({ useMasterKey: true });
    
    const removedRoles = [];
    
    // ลบ user ออกจาก roles ทั้งหมด
    for (const role of userRoles) {
      role.getUsers().remove(user);
      await role.save(null, { useMasterKey: true });
      removedRoles.push(role.get('name'));
    }
    
    console.log(`✅ ล้าง roles ทั้งหมดของ ${user.get('username')} สำเร็จ`);
    
    return {
      success: true,
      message: `ล้าง roles ทั้งหมดของ ${user.get('username')} เรียบร้อยแล้ว`,
      data: {
        userId: user.id,
        username: user.get('username'),
        removedRoles: removedRoles,
        removedCount: removedRoles.length,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error clearing user roles:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 📊 Cloud Function: ตรวจสอบ user ที่ไม่มี role
Parse.Cloud.define('getUsersWithoutRoles', async (request) => {
  try {
    console.log('📊 Finding users without roles...');
    
    const userQuery = new Parse.Query(Parse.User);
    const allUsers = await userQuery.find({ useMasterKey: true });
    
    const usersWithoutRoles = [];
    
    for (const user of allUsers) {
      const userRoles = await getUserRoles(user);
      if (userRoles.length === 0) {
        usersWithoutRoles.push({
          id: user.id,
          username: user.get('username'),
          email: user.get('email') || '',
          firstname: user.get('firstname') || '',
          lastname: user.get('lastname') || '',
          phone: user.get('phone') || '',
          createdAt: user.get('createdAt'),
          suggestion: 'ควรเพิ่มเข้า admin role (role ต่ำสุด)'
        });
      }
    }
    
    console.log(`✅ Found ${usersWithoutRoles.length} users without roles`);
    
    return {
      success: true,
      message: `พบ ${usersWithoutRoles.length} users ที่ไม่มี role`,
      data: {
        totalUsersWithoutRoles: usersWithoutRoles.length,
        users: usersWithoutRoles,
        recommendation: usersWithoutRoles.length > 0 ? 
          'แนะนำให้เพิ่ม users เหล่านี้เข้า admin role (role ต่ำสุด)' : 
          'ทุก users มี role แล้ว'
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error finding users without roles:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🔧 Cloud Function: ตั้งค่า roles เริ่มต้นให้ users ทั้งหมด
Parse.Cloud.define('setupInitialRoles', async (request) => {
  try {
    console.log('🔧 Setting up initial roles for all users...');
    
    // ตรวจสอบว่ามี roles หลักหรือยัง (เอา 'user' ออก)
    const requiredRoles = ['super_admin', 'developer', 'admin'];
    const createdRoles = [];
    
    for (const roleName of requiredRoles) {
      const roleQuery = new Parse.Query(Parse.Role);
      roleQuery.equalTo('name', roleName);
      const existingRole = await roleQuery.first({ useMasterKey: true });
      
      if (!existingRole) {
        const newRole = new Parse.Role(roleName, new Parse.ACL());
        await newRole.save(null, { useMasterKey: true });
        createdRoles.push(roleName);
        console.log(`✅ Created role: ${roleName}`);
      }
    }
    
    return {
      success: true,
      message: 'ตั้งค่า roles เริ่มต้นเรียบร้อยแล้ว',
      data: {
        requiredRoles: requiredRoles,
        createdRoles: createdRoles,
        alreadyExisted: requiredRoles.filter(r => !createdRoles.includes(r)),
        hierarchy: {
          'admin': 'Level 1 (ต่ำสุด) - ดูได้อย่างเดียว',
          'developer': 'Level 2 - CRUD ได้หมด',
          'super_admin': 'Level 3 (สูงสุด) - ทำได้หมด + จัดการ roles'
        }
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error setting up initial roles:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🗑️ Cloud Function: ลบ role ออกจากระบบ
Parse.Cloud.define('deleteRole', async (request) => {
  const { roleName } = request.params;
  
  if (!roleName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'ต้องระบุ roleName');
  }
  
  // ป้องกันการลบ roles หลัก
  const protectedRoles = ['super_admin', 'developer', 'admin'];
  if (protectedRoles.includes(roleName)) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `ไม่สามารถลบ role ${roleName} ได้ เพราะเป็น role หลักของระบบ`);
  }
  
  try {
    console.log(`🗑️ Deleting role: ${roleName}`);
    
    // หา role
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('name', roleName);
    const role = await roleQuery.first({ useMasterKey: true });
    
    if (!role) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `ไม่พบ role ชื่อ ${roleName}`);
    }
    
    // ตรวจสอบว่ามี users ใน role นี้หรือไม่
    const usersInRole = await role.getUsers().query().count({ useMasterKey: true });
    
    if (usersInRole > 0) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `ไม่สามารถลบ role ${roleName} ได้ เพราะมี ${usersInRole} users อยู่ใน role นี้`);
    }
    
    // ลบ role
    await role.destroy({ useMasterKey: true });
    
    console.log(`✅ ลบ role ${roleName} สำเร็จ`);
    
    return {
      success: true,
      message: `ลบ role ${roleName} เรียบร้อยแล้ว`,
      data: {
        deletedRole: roleName,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error deleting role:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// ===================================
// System Information Functions
// ===================================

// 📊 Cloud Function: สถิติระบบ
Parse.Cloud.define('getSystemStats', async (request) => {
  try {
    console.log('📊 Getting system statistics...');
    
    // นับ users
    const userQuery = new Parse.Query(Parse.User);
    const totalUsers = await userQuery.count({ useMasterKey: true });
    
    // นับ roles
    const roleQuery = new Parse.Query(Parse.Role);
    const totalRoles = await roleQuery.count({ useMasterKey: true });
    
    // นับ users ในแต่ละ role
    const roles = await roleQuery.find({ useMasterKey: true });
    const roleStats = [];
    
    for (const role of roles) {
      const usersInRole = await role.getUsers().query().count({ useMasterKey: true });
      roleStats.push({
        roleName: role.get('name'),
        userCount: usersInRole,
        permissions: getRolePermissions(role.get('name')),
        percentage: totalUsers > 0 ? ((usersInRole / totalUsers) * 100).toFixed(1) + '%' : '0%'
      });
    }
    
    // เรียงตาม level
    roleStats.sort((a, b) => b.permissions.level - a.permissions.level);
    
    // หา users ที่ไม่มี role
    const allUsers = await userQuery.find({ useMasterKey: true });
    let usersWithoutRoles = 0;
    
    for (const user of allUsers) {
      const userRoles = await getUserRoles(user);
      if (userRoles.length === 0) {
        usersWithoutRoles++;
      }
    }
    
    return {
      success: true,
      data: {
        system: {
          totalUsers: totalUsers,
          totalRoles: totalRoles,
          usersWithoutRoles: usersWithoutRoles,
          timestamp: new Date().toISOString()
        },
        roleBreakdown: roleStats,
        summary: {
          activeUsers: totalUsers - usersWithoutRoles,
          rolesCoverage: totalUsers > 0 ? 
            ((totalUsers - usersWithoutRoles) / totalUsers * 100).toFixed(1) + '%' : '0%',
          recommendations: usersWithoutRoles > 0 ? 
            [`มี ${usersWithoutRoles} users ที่ยังไม่มี role - แนะนำให้เพิ่มเข้า admin role`] : 
            ['ระบบ roles ทำงานปกติ']
        },
        roleHierarchy: [
          'super_admin (Level 3) - เจ้านาย',
          'developer (Level 2) - นักพัฒนา',
          'admin (Level 1) - แอดมิน (role ต่ำสุด)'
        ]
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting system stats:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

// 🔧 Cloud Function: บำรุงรักษาระบบ
Parse.Cloud.define('systemMaintenance', async (request) => {
  const { action } = request.params;
  
  try {
    console.log(`🔧 Running system maintenance: ${action}`);
    
    const results = {};
    
    if (action === 'cleanup' || action === 'all') {
      // ลบ roles ที่ไม่มี users
      const roleQuery = new Parse.Query(Parse.Role);
      const allRoles = await roleQuery.find({ useMasterKey: true });
      const protectedRoles = ['super_admin', 'developer', 'admin'];
      const emptyRoles = [];
      
      for (const role of allRoles) {
        const roleName = role.get('name');
        if (!protectedRoles.includes(roleName)) {
          const usersCount = await role.getUsers().query().count({ useMasterKey: true });
          if (usersCount === 0) {
            await role.destroy({ useMasterKey: true });
            emptyRoles.push(roleName);
          }
        }
      }
      
      results.cleanup = {
        deletedEmptyRoles: emptyRoles,
        message: emptyRoles.length > 0 ? 
          `ลบ ${emptyRoles.length} roles ที่ไม่มี users` : 
          'ไม่มี roles ว่างที่ต้องลบ'
      };
    }
    
    if (action === 'assign_default_roles' || action === 'all') {
      // เพิ่ม users ที่ไม่มี role เข้า admin role
      const userQuery = new Parse.Query(Parse.User);
      const allUsers = await userQuery.find({ useMasterKey: true });
      const usersWithoutRoles = [];
      
      for (const user of allUsers) {
        const userRoles = await getUserRoles(user);
        if (userRoles.length === 0) {
          usersWithoutRoles.push(user);
        }
      }
      
      // เพิ่มเข้า admin role
      const adminRoleQuery = new Parse.Query(Parse.Role);
      adminRoleQuery.equalTo('name', 'admin');
      const adminRole = await adminRoleQuery.first({ useMasterKey: true });
      
      if (adminRole && usersWithoutRoles.length > 0) {
        for (const user of usersWithoutRoles) {
          adminRole.getUsers().add(user);
        }
        await adminRole.save(null, { useMasterKey: true });
      }
      
      results.assign_default_roles = {
        assignedUsers: usersWithoutRoles.map(u => u.get('username')),
        count: usersWithoutRoles.length,
        message: usersWithoutRoles.length > 0 ? 
          `เพิ่ม ${usersWithoutRoles.length} users เข้า admin role` : 
          'ทุก users มี role แล้ว'
      };
    }
    
    return {
      success: true,
      message: 'บำรุงรักษาระบบเรียบร้อยแล้ว',
      data: results,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error in system maintenance:', error);
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error.message);
  }
});

console.log('✅ Cloud Functions for Role Management loaded successfully');
// console.log('📋 Available Functions:');
// console.log('   👥 User Management:');
// console.log('      - getUserIds: หา User IDs ทั้งหมดพร้อม roles');
// console.log('      - checkUserRole: ตรวจสอบ role ของ user');
// console.log('      - getUsersWithoutRoles: หา users ที่ไม่มี role');
// console.log('   🔧 Role Management:');
// console.log('      - createRole: สร้าง role ใหม่');
// console.log('      - getAllRoles: ดู roles ทั้งหมดพร้อม users');
// console.log('      - addUserToRole: เพิ่ม user เข้า role');
// console.log('      - removeUserFromRole: ลบ user ออกจาก role');
// console.log('      - changeUserRole: เปลี่ยน role ของ user');
// console.log('      - clearUserRoles: ล้าง roles ทั้งหมดของ user');
// console.log('      - deleteRole: ลบ role ออกจากระบบ');
// console.log('   ⚙️ System Management:');
// console.log('      - setupInitialRoles: ตั้งค่า roles เริ่มต้น');
// console.log('      - getSystemStats: สถิติระบบ');
// console.log('      - systemMaintenance: บำรุงรักษาระบบ');
// console.log('');
// console.log('🏆 Role Hierarchy:');
// console.log('   1️⃣ admin (Level 1) - Role ต่ำสุด - ดูได้อย่างเดียว');
// console.log('   2️⃣ developer (Level 2) - CRUD ได้หมด');
// console.log('   3️⃣ super_admin (Level 3) - ทำได้หมด + จัดการ roles');
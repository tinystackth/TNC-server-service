// middleware/auth.js
const Parse = require('parse/node');

// 🔐 Middleware: ตรวจสอบ Authentication
const requireAuth = async (req, res, next) => {
  try {
    // หา session token จาก headers
    const sessionToken = req.headers['x-parse-session-token'] || 
                        req.headers['authorization']?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'ต้อง login ก่อน - ไม่พบ session token',
        hint: 'ใส่ X-Parse-Session-Token ใน headers'
      });
    }

    // ตรวจสอบ session และหา user
    const sessionQuery = new Parse.Query('_Session');
    sessionQuery.equalTo('sessionToken', sessionToken);
    sessionQuery.include('user');
    
    const session = await sessionQuery.first({ useMasterKey: true });
    
    if (!session) {
      return res.status(401).json({ 
        error: 'Invalid session', 
        message: 'Session token ไม่ถูกต้องหรือหมดอายุแล้ว' 
      });
    }

    // เก็บ user ไว้ใน request object
    req.user = session.get('user');
    req.sessionToken = sessionToken;
    
    console.log(`✅ User authenticated: ${req.user.get('username')} (${req.user.id})`);
    next();
    
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(401).json({ 
      error: 'Authentication failed', 
      message: error.message 
    });
  }
};

// 🛡️ Middleware: ตรวจสอบ Role Permissions
const checkPermissions = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          error: 'No user found',
          message: 'ไม่พบข้อมูล user - กรุณา login ใหม่'
        });
      }
      
      // หา roles ของ user
      const roleQuery = new Parse.Query(Parse.Role);
      roleQuery.equalTo('users', user);
      const roles = await roleQuery.find({ useMasterKey: true });
      const roleNames = roles.map(role => role.get('name'));
      
      console.log(`🔍 User ${user.get('username')} has roles:`, roleNames);
      
      // ตรวจสอบสิทธิ์
      let hasPermission = false;
      
      if (requiredPermission === 'read') {
        // ทุก role ที่ login แล้วสามารถ read ได้
        hasPermission = roleNames.length > 0;
      } else if (['create', 'update', 'delete'].includes(requiredPermission)) {
        // เฉพาะ super_admin และ developer เท่านั้น
        hasPermission = roleNames.includes('super_admin') || roleNames.includes('developer');
      }
      
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `ไม่มีสิทธิ์ในการ ${requiredPermission}`,
          userInfo: {
            username: user.get('username'),
            currentRoles: roleNames,
            requiredRoles: requiredPermission === 'read' ? 
              ['admin', 'developer', 'super_admin'] : 
              ['developer', 'super_admin']
          },
          hint: requiredPermission === 'read' ? 
            'ต้องมี role อย่างน้อย 1 role' :
            'ต้องเป็น developer หรือ super_admin เท่านั้น'
        });
      }
      
      // เก็บ roles ไว้ใน request object
      req.userRoles = roleNames;
      req.hasPermission = hasPermission;
      
      console.log(`✅ Permission granted: ${user.get('username')} can ${requiredPermission}`);
      next();
      
    } catch (error) {
      console.error('❌ Permission check error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        message: error.message
      });
    }
  };
};

// 🔍 Helper function: ตรวจสอบว่า user มี role อะไรบ้าง
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

// 🔍 Helper function: ตรวจสอบว่า user มีสิทธิ์ write หรือไม่
const hasWritePermission = async (user) => {
  const roles = await getUserRoles(user);
  return roles.includes('super_admin') || roles.includes('developer');
};

// 🔍 Helper function: ตรวจสอบว่า user มีสิทธิ์ read หรือไม่
const hasReadPermission = async (user) => {
  const roles = await getUserRoles(user);
  return roles.length > 0; // ทุก role สามารถ read ได้
};

// 🔍 Helper function: ตรวจสอบว่า user เป็น super_admin หรือไม่
const isSuperAdmin = async (user) => {
  const roles = await getUserRoles(user);
  return roles.includes('super_admin');
};

// 🚀 Middleware สำหรับเฉพาะ super_admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'ต้อง login ก่อน'
      });
    }
    
    const isSuper = await isSuperAdmin(user);
    
    if (!isSuper) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'เฉพาะ super_admin เท่านั้นที่สามารถเข้าถึงได้',
        userInfo: {
          username: user.get('username'),
          requiredRole: 'super_admin'
        }
      });
    }
    
    console.log(`✅ Super admin access granted: ${user.get('username')}`);
    next();
    
  } catch (error) {
    console.error('❌ Super admin check error:', error);
    return res.status(500).json({
      error: 'Super admin check failed',
      message: error.message
    });
  }
};

module.exports = {
  requireAuth,
  checkPermissions,
  requireSuperAdmin,
  getUserRoles,
  hasWritePermission,
  hasReadPermission,
  isSuperAdmin
};
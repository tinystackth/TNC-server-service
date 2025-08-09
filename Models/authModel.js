/* Models/authModel.js */

const Parse = require('parse/node');
require('dotenv').config();

// Initialize Parse
Parse.initialize(
  process.env.APP_ID || 'myAppId',
  null, // JavaScript Key (not needed for Node.js)
  process.env.MASTER_KEY || 'myMasterKey'
);
Parse.serverURL = process.env.SERVER_URL || 'http://localhost:5000/parse';

/**
 * Middleware สำหรับตรวจสอบ session token
 */
const authenticateToken = async (req, res, next) => {
  try {
    // ดึง token จาก Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        status: 401,
        message: 'Access token is required'
      });
    }

    // ตรวจสอบ session กับ Parse Server
    const query = new Parse.Query(Parse.Session);
    query.equalTo('sessionToken', token);
    query.include('user');
    
    const session = await query.first({ useMasterKey: true });

    if (!session) {
      return res.status(401).json({
        status: 401,
        message: 'Invalid or expired token'
      });
    }

    // ตรวจสอบว่า session ยังไม่หมดอายุ
    const expiresAt = session.get('expiresAt');
    if (expiresAt && new Date() > expiresAt) {
      return res.status(401).json({
        status: 401,
        message: 'Session expired'
      });
    }

    // เพิ่มข้อมูล user ใน request object
    req.user = session.get('user');
    req.sessionToken = token;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      status: 500,
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional: Middleware สำหรับตรวจสอบ role
 */
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 401,
          message: 'Authentication required'
        });
      }

      // ดึงข้อมูล moreInfo ของ user เพื่อตรวจสอบ role
      const userQuery = new Parse.Query(Parse.User);
      userQuery.include(['moreInfo.roles']);
      const user = await userQuery.get(req.user.id, { useMasterKey: true });
      
      const moreInfo = user.get('moreInfo') || [];
      let hasRole = false;

      for (const info of moreInfo) {
        const roles = info.get('roles') || [];
        if (roles.some(role => role.get('name') === requiredRole)) {
          hasRole = true;
          break;
        }
      }

      if (!hasRole) {
        return res.status(403).json({
          status: 403,
          message: `Role "${requiredRole}" is required`
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        status: 500,
        message: 'Role verification failed'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
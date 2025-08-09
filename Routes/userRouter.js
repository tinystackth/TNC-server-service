/* Routes/userRouter.js */

const express = require('express');
const {
  registerUser,
  loginUser,
  getAllUsers,
  getUserById,
  updateUserById,
  deleteUserById,
} = require('../Models/userModel'); // เปลี่ยนเป็น Models (M ตัวใหญ่)
const { authenticateToken } = require('../Models/authModel'); // เปลี่ยนเป็น Models (M ตัวใหญ่)

const router = express.Router();

/* ───────────────────────────────────────────── */
const fail = (res, status, msg) =>
  res.status(status).json({ status, message: msg });

const isUrl   = s => /^https?:\/\/.+/i.test(s);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ───────────────────────────────────────────── */
/*  REGISTER   POST /api/register                */
/* ───────────────────────────────────────────── */
router.post('/register', async (req, res) => {
  console.log('📝 Register endpoint called with body:', req.body);
  
  const {
    username,
    password,
    firstname,
    lastname,
    phone,
    email,
    imageUrl = '',
    moreInfo = [],
    fileIds = [],               // array of File objectId
  } = req.body;

  if (!username || !password)
    return fail(res, 400, 'Username and password are required.');
  if (!Array.isArray(fileIds))
    return fail(res, 400, 'fileIds must be an array.');
  if (email && !isEmail(email))
    return fail(res, 400, 'Invalid email format');
  if (imageUrl && !isUrl(imageUrl))
    return fail(res, 400, 'imageUrl must be a valid URL');

  try {
    const user = await registerUser({
      username,
      password,
      firstname,
      lastname,
      phone,
      email,
      imageUrl,
      moreInfo,
      fileIds,
    });

    res.json({
      status: 200,
      message: 'User registered successfully',
      data: user,
    });
  } catch (err) { 
    console.error('❌ Register error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  LOGIN     POST /api/login                    */
/* ───────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  console.log('🔐 Login endpoint called with body:', req.body);
  
  const { username, password } = req.body;

  try {
    const { user, sessionToken } = await loginUser(username, password);
    res.json({
      status: 200,
      message: 'Login successful',
      data: {
        id: user.id,
        username: user.get('username'),
        sessionToken,
        files: user.get('files') || [],
        imageUrl: user.get('imageUrl') || '',
      },
    });
  } catch (err) { 
    console.error('❌ Login error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  ME        GET /api/me                        */
/* ───────────────────────────────────────────── */
router.get('/me', authenticateToken, (req, res) => {
  console.log('👤 Me endpoint called');
  
  const user = req.user;
  if (!user) return fail(res, 404, 'User not found.');

  res.json({
    status: 200,
    message: 'User info retrieved successfully',
    data: {
      id:        user.id,
      username:  user.get('username'),
      firstname: user.get('firstname'),
      lastname:  user.get('lastname'),
      phone:     user.get('phone'),
      email:     user.get('email'),
      imageUrl:  user.get('imageUrl') || '',
      files:     user.get('files') || [],
    },
  });
});

/* ───────────────────────────────────────────── */
/*  LIST      GET /api/users                     */
/* ───────────────────────────────────────────── */
router.get('/users', authenticateToken, async (req, res) => {
  console.log('📋 Users list endpoint called');
  
  try {
    const users = await getAllUsers(req.query.branchId, req.query.role);
    if (!users.length) return fail(res, 404, 'No users found');
    res.json({ status: 200, message: 'Users fetched successfully', data: users });
  } catch (err) { 
    console.error('❌ Get users error:', err.message);
    fail(res, 500, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  READ      GET /api/user/:id                  */
/* ───────────────────────────────────────────── */
router.get('/user/:id', authenticateToken, async (req, res) => {
  console.log('👤 Get user by ID endpoint called:', req.params.id);
  
  try {
    const user = await getUserById(req.params.id, req.query.branchId);
    res.json({ status: 200, message: 'User fetched successfully', data: user });
  } catch (err) {
    console.error('❌ Get user by ID error:', err.message);
    const status = err.code === 101 ? 404 : 500;
    fail(res, status, err.code === 101 ? 'User not found' : err.message);
  }
});

/* ───────────────────────────────────────────── */
/*  UPDATE    PATCH /api/user/:id                */
/* ───────────────────────────────────────────── */
router.patch('/user/:id', authenticateToken, async (req, res) => {
  console.log('✏️ Update user endpoint called:', req.params.id, req.body);
  
  const {
    addFiles    = [],          // add to current files
    removeFiles = [],          // remove from current files
    fileIds,                   // replace entire files set (if provided)
    ...restBody
  } = req.body;

  /* allow‑list ของ field ที่แก้ไขได้ */
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
    if (!ALLOWED_FIELDS.includes(k))
      return fail(res, 400, `Field "${k}" is not allowed`);
    updates[k] = restBody[k];
  }

  /* validation */
  if (updates.email && !isEmail(updates.email))
    return fail(res, 400, 'Invalid email format');
  if (updates.imageUrl && !isUrl(updates.imageUrl))
    return fail(res, 400, 'imageUrl must be a valid URL');
  if (updates.username && typeof updates.username !== 'string')
    return fail(res, 400, 'username must be a string');
  if (fileIds !== undefined && !Array.isArray(fileIds))
    return fail(res, 400, 'fileIds must be an array of File objectIds');
  if (!Array.isArray(addFiles) || !Array.isArray(removeFiles))
    return fail(res, 400, 'addFiles/removeFiles must be arrays.');

  try {
    const user = await updateUserById(req.params.id, {
      ...updates,
      addFiles,
      removeFiles,
      fileIds,
    });
    if (!user) return fail(res, 404, 'User not found');

    res.json({
      status: 200,
      message: 'User updated successfully',
      data: user,
    });
  } catch (err) { 
    console.error('❌ Update user error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  DELETE    DELETE /api/user/:id               */
/* ───────────────────────────────────────────── */
router.delete('/user/:id', authenticateToken, async (req, res) => {
  console.log('🗑️ Delete user endpoint called:', req.params.id);
  
  try {
    const result = await deleteUserById(req.params.id);
    res.json({ status: 200, message: result.message });
  } catch (err) { 
    console.error('❌ Delete user error:', err.message);
    fail(res, err.message === 'User not found' ? 404 : 500, err.message); 
  }
});

// เพิ่ม test route
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  res.json({ 
    message: 'User router is working!', 
    timestamp: new Date(),
    availableEndpoints: [
      'POST /api/register',
      'POST /api/login', 
      'GET /api/me',
      'GET /api/users',
      'GET /api/user/:id',
      'PATCH /api/user/:id',
      'DELETE /api/user/:id'
    ]
  });
});

console.log('✅ userRouter setup complete');
module.exports = router;
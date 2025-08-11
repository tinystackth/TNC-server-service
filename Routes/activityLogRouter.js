/* Routes/activityLogRouter.js */

const express = require('express');
const {
  createActivityLog,
  getAllActivityLogs,
  getActivityLogById,
  updateActivityLogById,
  deleteActivityLogById,
  deleteActivityLogsByIds,
  getActivityLogStats,
} = require('../Models/activityLogModel'); // เปลี่ยนเป็น Models (M ตัวใหญ่)

const router = express.Router();

/* ───────────────────────────────────────────── */
const fail = (res, status, msg) =>
  res.status(status).json({ status, message: msg });

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ───────────────────────────────────────────── */
/*  CREATE   POST /api/activityLogs              */
/* ───────────────────────────────────────────── */
router.post('/activityLogs', async (req, res) => {
  console.log('📝 Create activity log endpoint called with body:', req.body);
  
  const {
    user,
    action,
    details,
    severity,
    timestamp = new Date(),
  } = req.body;

  if (!user || !action || !details || !severity)
    return fail(res, 400, 'All fields (user, action, details, severity) are required');

  const validSeverities = ['success', 'info', 'warning', 'error'];
  if (!validSeverities.includes(severity.toLowerCase()))
    return fail(res, 400, 'severity must be: success, info, warning, or error');

  // Optional: validate email format if user looks like email
  if (user.includes('@') && !isEmail(user))
    return fail(res, 400, 'Invalid email format for user field');

  try {
    const log = await createActivityLog({
      user,
      action,
      details,
      severity,
      timestamp,
    });

    res.status(201).json({
      status: 201,
      message: 'Activity log created successfully',
      data: log,
    });
  } catch (err) { 
    console.error('❌ Create activity log error:', err.message);
    fail(res, 400, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  LIST      GET /api/activityLogs              */
/* ───────────────────────────────────────────── */
router.get('/activityLogs', async (req, res) => {
  console.log('📋 Activity logs list endpoint called with query:', req.query);
  
  try {
    const {
      page = 1,
      limit = 10,
      user,
      action,
      severity,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const result = await getAllActivityLogs({
      page,
      limit,
      user,
      action,
      severity,
      startDate,
      endDate,
      sortBy,
      sortOrder
    });

    if (!result.logs.length) {
      return res.json({ 
        status: 200, 
        message: 'No activity logs found',
        data: [],
        pagination: result.pagination
      });
    }

    res.json({ 
      status: 200, 
      message: 'Activity logs retrieved successfully', 
      data: result.logs,
      pagination: result.pagination
    });
  } catch (err) { 
    console.error('❌ Get activity logs error:', err.message);
    fail(res, 500, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  READ      GET /api/activityLogs/:id          */
/* ───────────────────────────────────────────── */
router.get('/activityLogs/:id', async (req, res) => {
  console.log('👁️ Get activity log by ID endpoint called:', req.params.id);
  
  try {
    const log = await getActivityLogById(req.params.id);
    res.json({ 
      status: 200, 
      message: 'Activity log retrieved successfully', 
      data: log 
    });
  } catch (err) {
    console.error('❌ Get activity log by ID error:', err.message);
    const status = err.message === 'Activity log not found' ? 404 : 500;
    fail(res, status, err.message);
  }
});

/* ───────────────────────────────────────────── */
/*  UPDATE    PUT /api/activityLogs/:id          */
/* ───────────────────────────────────────────── */
router.put('/activityLogs/:id', async (req, res) => {
  console.log('✏️ Update activity log (PUT) endpoint called:', req.params.id, req.body);
  
  const {
    user,
    action,
    details,
    severity,
    timestamp,
  } = req.body;

  // For PUT, all required fields must be provided
  if (!user || !action || !details || !severity)
    return fail(res, 400, 'All fields (user, action, details, severity) are required for PUT');

  const validSeverities = ['success', 'info', 'warning', 'error'];
  if (!validSeverities.includes(severity.toLowerCase()))
    return fail(res, 400, 'severity must be: success, info, warning, or error');

  if (user.includes('@') && !isEmail(user))
    return fail(res, 400, 'Invalid email format for user field');

  try {
    const log = await updateActivityLogById(req.params.id, {
      user,
      action,
      details,
      severity,
      ...(timestamp && { timestamp })
    });

    res.json({
      status: 200,
      message: 'Activity log updated successfully',
      data: log,
    });
  } catch (err) { 
    console.error('❌ Update activity log error:', err.message);
    const status = err.message === 'Activity log not found' ? 404 : 400;
    fail(res, status, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  UPDATE    PATCH /api/activityLogs/:id        */
/* ───────────────────────────────────────────── */
router.patch('/activityLogs/:id', async (req, res) => {
  console.log('✏️ Update activity log (PATCH) endpoint called:', req.params.id, req.body);
  
  const updates = req.body;

  if (Object.keys(updates).length === 0)
    return fail(res, 400, 'At least one field must be provided for update');

  // Allow-list of fields that can be updated
  const ALLOWED_FIELDS = ['user', 'action', 'details', 'severity', 'timestamp'];
  
  for (const key of Object.keys(updates)) {
    if (!ALLOWED_FIELDS.includes(key))
      return fail(res, 400, `Field "${key}" is not allowed`);
  }

  // Validate severity if provided
  if (updates.severity) {
    const validSeverities = ['success', 'info', 'warning', 'error'];
    if (!validSeverities.includes(updates.severity.toLowerCase()))
      return fail(res, 400, 'severity must be: success, info, warning, or error');
  }

  // Validate email format if user field is provided and looks like email
  if (updates.user && updates.user.includes('@') && !isEmail(updates.user))
    return fail(res, 400, 'Invalid email format for user field');

  try {
    const log = await updateActivityLogById(req.params.id, updates);

    res.json({
      status: 200,
      message: 'Activity log updated successfully',
      data: log,
    });
  } catch (err) { 
    console.error('❌ Update activity log error:', err.message);
    const status = err.message === 'Activity log not found' ? 404 : 400;
    fail(res, status, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  DELETE    DELETE /api/activityLogs/:id       */
/* ───────────────────────────────────────────── */
router.delete('/activityLogs/:id', async (req, res) => {
  console.log('🗑️ Delete activity log endpoint called:', req.params.id);
  
  try {
    const log = await deleteActivityLogById(req.params.id);
    res.json({ 
      status: 200, 
      message: 'Activity log deleted successfully',
      data: log
    });
  } catch (err) { 
    console.error('❌ Delete activity log error:', err.message);
    const status = err.message === 'Activity log not found' ? 404 : 500;
    fail(res, status, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  BULK DELETE    DELETE /api/activityLogs      */
/* ───────────────────────────────────────────── */
router.delete('/activityLogs', async (req, res) => {
  console.log('🗑️ Bulk delete activity logs endpoint called:', req.body);
  
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return fail(res, 400, 'IDs array is required');

  try {
    const result = await deleteActivityLogsByIds(ids);
    res.json({ 
      status: 200, 
      message: result.message,
      data: { deletedCount: result.deletedCount }
    });
  } catch (err) { 
    console.error('❌ Bulk delete activity logs error:', err.message);
    fail(res, 500, err.message); 
  }
});

/* ───────────────────────────────────────────── */
/*  STATS     GET /api/activityLogs/stats/summary */
/* ───────────────────────────────────────────── */
router.get('/activityLogs/stats/summary', async (req, res) => {
  console.log('📊 Activity logs stats endpoint called');
  
  try {
    const stats = await getActivityLogStats();
    res.json({ 
      status: 200, 
      message: 'Activity logs statistics retrieved successfully', 
      data: stats
    });
  } catch (err) { 
    console.error('❌ Get activity logs stats error:', err.message);
    fail(res, 500, err.message); 
  }
});

// เพิ่ม test route
router.get('/activityLogs/test', (req, res) => {
  console.log('🧪 Activity logs test endpoint called');
  res.json({ 
    message: 'Activity Log router is working!', 
    timestamp: new Date(),
    availableEndpoints: [
      'POST /api/activityLogs',
      'GET /api/activityLogs',
      'GET /api/activityLogs/:id',
      'PUT /api/activityLogs/:id',
      'PATCH /api/activityLogs/:id',
      'DELETE /api/activityLogs/:id',
      'DELETE /api/activityLogs',
      'GET /api/activityLogs/stats/summary'
    ]
  });
});

console.log('✅ activityLogRouter setup complete');
module.exports = router;
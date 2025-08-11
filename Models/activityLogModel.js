/* Models/activityLogModel.js */

const Parse = require('parse/node');
require('dotenv').config();

// Initialize Parse
Parse.initialize(
  process.env.APP_ID || 'myAppId',
  null, // JavaScript Key (not needed for Node.js)
  process.env.MASTER_KEY || 'myMasterKey'
);
Parse.serverURL = process.env.SERVER_URL || 'http://localhost:5000/parse';

/* ───────────────────────────────────────────── */
/*  CREATE                                       */
/* ───────────────────────────────────────────── */
const createActivityLog = async ({
  user,
  action,
  details,
  severity,
  timestamp = new Date(),
}) => {
  if (!user || !action || !details || !severity)
    throw new Error('All fields (user, action, details, severity) are required');

  const validSeverities = ['success', 'info', 'warning', 'error'];
  if (!validSeverities.includes(severity.toLowerCase()))
    throw new Error('severity must be: success, info, warning, or error');

  const ActivityLog = Parse.Object.extend('ActivityLog');
  const activityLog = new ActivityLog();

  activityLog.set('user', user);
  activityLog.set('action', action);
  activityLog.set('details', details);
  activityLog.set('severity', severity.toLowerCase());
  activityLog.set('timestamp', timestamp);

  await activityLog.save(null, { useMasterKey: true });

  return {
    objectId: activityLog.id,
    user: activityLog.get('user'),
    action: activityLog.get('action'),
    details: activityLog.get('details'),
    severity: activityLog.get('severity'),
    timestamp: activityLog.get('timestamp'),
    createdAt: activityLog.get('createdAt'),
    updatedAt: activityLog.get('updatedAt'),
  };
};

/* ───────────────────────────────────────────── */
/*  LIST                                         */
/* ───────────────────────────────────────────── */
const getAllActivityLogs = async ({
  page = 1,
  limit = 10,
  user = null,
  action = null,
  severity = null,
  startDate = null,
  endDate = null,
  sortBy = 'timestamp',
  sortOrder = 'desc'
} = {}) => {
  const ActivityLog = Parse.Object.extend('ActivityLog');
  const query = new Parse.Query(ActivityLog);

  // Apply filters
  if (user) {
    query.contains('user', user);
  }
  
  if (action) {
    query.contains('action', action);
  }
  
  if (severity) {
    query.equalTo('severity', severity.toLowerCase());
  }
  
  if (startDate) {
    query.greaterThanOrEqualTo('timestamp', new Date(startDate));
  }
  
  if (endDate) {
    query.lessThanOrEqualTo('timestamp', new Date(endDate));
  }

  // Apply sorting
  if (sortOrder === 'desc') {
    query.descending(sortBy);
  } else {
    query.ascending(sortBy);
  }

  // Apply pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  query.skip(skip);
  query.limit(parseInt(limit));

  // Get results and count
  const results = await query.find({ useMasterKey: true });
  
  // Count total for pagination
  const totalQuery = new Parse.Query(ActivityLog);
  
  // Apply same filters to count query
  if (user) totalQuery.contains('user', user);
  if (action) totalQuery.contains('action', action);
  if (severity) totalQuery.equalTo('severity', severity.toLowerCase());
  if (startDate) totalQuery.greaterThanOrEqualTo('timestamp', new Date(startDate));
  if (endDate) totalQuery.lessThanOrEqualTo('timestamp', new Date(endDate));
  
  const total = await totalQuery.count({ useMasterKey: true });
  const totalPages = Math.ceil(total / parseInt(limit));

  // Format results
  const logs = results.map(log => ({
    objectId: log.id,
    user: log.get('user'),
    action: log.get('action'),
    details: log.get('details'),
    severity: log.get('severity'),
    timestamp: log.get('timestamp'),
    createdAt: log.get('createdAt'),
    updatedAt: log.get('updatedAt'),
  }));

  return {
    logs,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNext: parseInt(page) < totalPages,
      hasPrev: parseInt(page) > 1
    }
  };
};

/* ───────────────────────────────────────────── */
/*  READ                                         */
/* ───────────────────────────────────────────── */
const getActivityLogById = async (id) => {
  if (!id) throw new Error('ID is required');

  const ActivityLog = Parse.Object.extend('ActivityLog');
  const query = new Parse.Query(ActivityLog);

  try {
    const log = await query.get(id, { useMasterKey: true });
    
    return {
      objectId: log.id,
      user: log.get('user'),
      action: log.get('action'),
      details: log.get('details'),
      severity: log.get('severity'),
      timestamp: log.get('timestamp'),
      createdAt: log.get('createdAt'),
      updatedAt: log.get('updatedAt'),
    };
  } catch (error) {
    if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
      throw new Error('Activity log not found');
    }
    throw error;
  }
};

/* ───────────────────────────────────────────── */
/*  UPDATE                                       */
/* ───────────────────────────────────────────── */
const updateActivityLogById = async (id, updates) => {
  if (!id) throw new Error('ID is required');

  const ActivityLog = Parse.Object.extend('ActivityLog');
  const query = new Parse.Query(ActivityLog);

  try {
    const log = await query.get(id, { useMasterKey: true });

    // Allow-list of fields that can be updated
    const ALLOWED_FIELDS = ['user', 'action', 'details', 'severity', 'timestamp'];

    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_FIELDS.includes(key)) {
        throw new Error(`Field "${key}" is not allowed`);
      }

      if (key === 'severity') {
        const validSeverities = ['success', 'info', 'warning', 'error'];
        if (!validSeverities.includes(value.toLowerCase())) {
          throw new Error('severity must be: success, info, warning, or error');
        }
        log.set('severity', value.toLowerCase());
      } else {
        log.set(key, value);
      }
    }

    const savedLog = await log.save(null, { useMasterKey: true });

    return {
      objectId: savedLog.id,
      user: savedLog.get('user'),
      action: savedLog.get('action'),
      details: savedLog.get('details'),
      severity: savedLog.get('severity'),
      timestamp: savedLog.get('timestamp'),
      createdAt: savedLog.get('createdAt'),
      updatedAt: savedLog.get('updatedAt'),
    };
  } catch (error) {
    if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
      throw new Error('Activity log not found');
    }
    throw error;
  }
};

/* ───────────────────────────────────────────── */
/*  DELETE                                       */
/* ───────────────────────────────────────────── */
const deleteActivityLogById = async (id) => {
  if (!id) throw new Error('ID is required');

  const ActivityLog = Parse.Object.extend('ActivityLog');
  const query = new Parse.Query(ActivityLog);

  try {
    const log = await query.get(id, { useMasterKey: true });
    
    const logData = {
      objectId: log.id,
      user: log.get('user'),
      action: log.get('action'),
      details: log.get('details'),
      severity: log.get('severity'),
      timestamp: log.get('timestamp'),
      createdAt: log.get('createdAt'),
      updatedAt: log.get('updatedAt'),
    };

    await log.destroy({ useMasterKey: true });
    
    return logData;
  } catch (error) {
    if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
      throw new Error('Activity log not found');
    }
    throw error;
  }
};

/* ───────────────────────────────────────────── */
/*  BULK DELETE                                  */
/* ───────────────────────────────────────────── */
const deleteActivityLogsByIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('IDs array is required');
  }

  const ActivityLog = Parse.Object.extend('ActivityLog');
  const query = new Parse.Query(ActivityLog);
  query.containedIn('objectId', ids);

  try {
    const logs = await query.find({ useMasterKey: true });
    
    const deletePromises = logs.map(log => log.destroy({ useMasterKey: true }));
    await Promise.all(deletePromises);

    return {
      deletedCount: logs.length,
      message: `${logs.length} activity logs deleted successfully`
    };
  } catch (error) {
    throw new Error('Failed to delete activity logs: ' + error.message);
  }
};

/* ───────────────────────────────────────────── */
/*  STATISTICS                                   */
/* ───────────────────────────────────────────── */
const getActivityLogStats = async () => {
  const ActivityLog = Parse.Object.extend('ActivityLog');
  
  // Get total count
  const totalQuery = new Parse.Query(ActivityLog);
  const total = await totalQuery.count({ useMasterKey: true });

  // Get count by severity
  const severities = ['success', 'info', 'warning', 'error'];
  const severityStats = {};

  for (const severity of severities) {
    const query = new Parse.Query(ActivityLog);
    query.equalTo('severity', severity);
    const count = await query.count({ useMasterKey: true });
    if (count > 0) {
      severityStats[severity] = count;
    }
  }

  return {
    total,
    bySeverity: severityStats
  };
};

module.exports = {
  createActivityLog,
  getAllActivityLogs,
  getActivityLogById,
  updateActivityLogById,
  deleteActivityLogById,
  deleteActivityLogsByIds,
  getActivityLogStats,
};
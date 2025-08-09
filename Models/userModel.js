/* Models/userModel.js */

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
const toFilePointer = id => ({
  __type: 'Pointer',
  className: 'File',
  objectId: id,
});

const serializeFile = f =>
  f && typeof f.toJSON === 'function' ? f.toJSON() : f;

/* ───────────────────────────────────────────── */
/*  REGISTER                                     */
/* ───────────────────────────────────────────── */
const registerUser = async ({
  username,
  password,
  firstname,
  lastname,
  phone,
  email,
  imageUrl = '',
  moreInfo = [],
  fileIds  = [],
}) => {
  if (!username || !password || !firstname || !lastname || !phone || !email)
    throw new Error('All fields are required');
  if (!Array.isArray(fileIds))
    throw new Error('fileIds must be an array');

  const duplicate = await new Parse.Query(Parse.User)
    .equalTo('username', username)
    .first();
  if (duplicate) throw new Error('This username is already registered');

  const user = new Parse.User();
  user.set('username', username);
  user.set('password', password);
  user.set('firstname', firstname);
  user.set('lastname', lastname);
  user.set('phone', phone);
  user.set('email', email);
  if (imageUrl) user.set('imageUrl', imageUrl);

  if (fileIds.length) user.set('files', fileIds.map(toFilePointer));

  if (moreInfo.length) {
    const pointers = await Promise.all(
      moreInfo.map(async id => {
        const obj = await new Parse.Query('BranchUserInfo').get(id);
        if (!obj) throw new Error(`BranchUserInfo ${id} not found.`);
        return { __type: 'Pointer', className: 'BranchUserInfo', objectId: id };
      })
    );
    user.set('moreInfo', pointers);
  }

  await user.signUp();

  return {
    ...user.toJSON(),
    imageUrl: user.get('imageUrl') || '',
    files: (user.get('files') || []).map(serializeFile),
  };
};

/* ───────────────────────────────────────────── */
/*  LOGIN                                        */
/* ───────────────────────────────────────────── */
const loginUser = async (username, password) => {
  if (!username || !password) throw new Error('All fields are required');
  const user = await Parse.User.logIn(username, password);
  return { user, sessionToken: user.getSessionToken() };
};

/* ───────────────────────────────────────────── */
/*  LIST                                         */
/* ───────────────────────────────────────────── */
const getAllUsers = async (branchId = null, role = null) => {
  const q = new Parse.Query(Parse.User)
    .include([
      'moreInfo.branch',
      'moreInfo.roles',
      'files',
      'files.uploader',
      'files.branch',
    ])
    .ascending('lastname');

  const raw = await q.find({ useMasterKey: true });

  const enrich = async infoArr => Promise.all(
    infoArr.map(async info => {
      if (!(info instanceof Parse.Object)) return info.toJSON();
      const branch  = await info.get('branch')?.fetch();
      const company = branch ? await branch.get('company')?.fetch() : null;
      const roles   = await Promise.all((info.get('roles') || []).map(r => r.fetch()));
      return {
        ...info.toJSON(),
        branch: branch ? { ...branch.toJSON(), company: company?.toJSON() || null } : null,
        roles: roles.map(r => r.toJSON()),
      };
    })
  );

  const users = await Promise.all(
    raw.map(async u => {
      const moreInfo = await enrich(u.get('moreInfo') || []);
      return {
        id: u.id,
        username: u.get('username'),
        firstname: u.get('firstname'),
        lastname: u.get('lastname'),
        phone: u.get('phone'),
        email: u.get('email'),
        imageUrl: u.get('imageUrl') || '',
        files: (u.get('files') || []).map(serializeFile),
        moreInfo,
      };
    })
  );

  if (!branchId && !role) return users;
  return users.filter(u => {
    const infos = u.moreInfo || [];
    let ok = true;
    if (branchId) ok = infos.some(i => i.branch?.objectId === branchId);
    if (ok && role) ok = infos.some(i => (i.roles || []).some(r => r.name === role));
    return ok;
  });
};

/* ───────────────────────────────────────────── */
/*  READ                                         */
/* ───────────────────────────────────────────── */
const getUserById = async (id, branchId) => {
  if (!id) throw new Error('ID is required');
  const user = await new Parse.Query(Parse.User)
    .include([
      'moreInfo.branch',
      'moreInfo.roles',
      'moreInfo.branch.company',
      'files',
      'files.uploader',
      'files.branch',
    ])
    .get(id, { useMasterKey: true });

  let moreInfo = user.get('moreInfo') || [];
  moreInfo = await Promise.all(
    moreInfo.map(async info => {
      if (!(info instanceof Parse.Object)) return info.toJSON();
      const branch = info.get('branch');
      const roles  = info.get('roles') || [];
      return {
        ...info.toJSON(),
        branch: branch ? branch.toJSON() : null,
        roles:  roles.map(r => r.toJSON()),
      };
    })
  );

  if (branchId) moreInfo = moreInfo.filter(i => i.branch?.objectId === branchId);

  return {
    id: user.id,
    username: user.get('username'),
    firstname: user.get('firstname'),
    lastname: user.get('lastname'),
    phone: user.get('phone'),
    email: user.get('email'),
    imageUrl: user.get('imageUrl') || '',
    files: (user.get('files') || []).map(serializeFile),
    moreInfo,
  };
};

/* ───────────────────────────────────────────── */
/*  UPDATE                                       */
/* ───────────────────────────────────────────── */
const updateUserById = async (
  id,
  {
    addFiles = [],
    removeFiles = [],
    imageUrl,
    fileIds,
    ...updates   // firstname, lastname, phone, email, password, moreInfo, username
  },
) => {
  if (!id) throw new Error('ID is required');
  if (!Array.isArray(addFiles) || !Array.isArray(removeFiles))
    throw new Error('addFiles/removeFiles must be arrays.');

  const user = await new Parse.Query(Parse.User).get(id, { useMasterKey: true });
  if (!user) throw new Error('User not found');

  /* allow‑list (server‑side) */
  const ALLOWED_FIELDS = [
    'firstname',
    'lastname',
    'phone',
    'email',
    'password',
    'moreInfo',
    'username',
  ];

  for (const k of Object.keys(updates)) {
    if (!ALLOWED_FIELDS.includes(k))
      throw new Error(`Field "${k}" is not allowed`);

    if (k === 'moreInfo' && Array.isArray(updates[k])) {
      const pointers = await Promise.all(
        updates[k].map(async bid => {
          const obj = await new Parse.Query('BranchUserInfo').get(bid);
          if (!obj) throw new Error(`BranchUserInfo ${bid} not found.`);
          return { __type: 'Pointer', className: 'BranchUserInfo', objectId: bid };
        })
      );
      user.set('moreInfo', pointers);
    } else if (k === 'username') {
      /* ตรวจชื่อซ้ำ */
      const dup = await new Parse.Query(Parse.User)
        .equalTo('username', updates.username)
        .notEqualTo('objectId', id)
        .first({ useMasterKey: true });
      if (dup) throw new Error('This username is already registered');
      user.set('username', updates.username);
    } else {
      user.set(k, updates[k]);
    }
  }

  /* imageUrl */
  if (typeof imageUrl === 'string')
    user.set('imageUrl', imageUrl);

  /* files */
  if (fileIds !== undefined) {
    if (!Array.isArray(fileIds))
      throw new Error('fileIds must be an array');
    user.set('files', fileIds.map(toFilePointer));
  } else {
    if (addFiles.length)
      user.addAllUnique('files', addFiles.map(toFilePointer));
    if (removeFiles.length)
      user.removeAll('files', removeFiles.map(toFilePointer));
  }

  const saved = await user.save(null, { useMasterKey: true });
  return {
    id: saved.id,
    username: saved.get('username'),
    firstname: saved.get('firstname'),
    lastname: saved.get('lastname'),
    phone: saved.get('phone'),
    email: saved.get('email'),
    imageUrl: saved.get('imageUrl') || '',
    files: (saved.get('files') || []).map(serializeFile),
    moreInfo: saved.get('moreInfo') || [],
  };
};

/* ───────────────────────────────────────────── */
/*  DELETE                                       */
/* ───────────────────────────────────────────── */
const deleteUserById = async id => {
  if (!id) throw new Error('ID is required');
  const user = await new Parse.Query(Parse.User).get(id, { useMasterKey: true });
  if (!user) throw new Error('User not found');
  await user.destroy({ useMasterKey: true });
  return { message: 'User deleted successfully' };
};

module.exports = {
  registerUser,
  loginUser,
  getAllUsers,
  getUserById,
  updateUserById,
  deleteUserById,
};
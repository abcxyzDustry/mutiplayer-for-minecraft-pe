const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dgram = require('dgram');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mcpe_multiplayer_secret_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mcpe_multiplayer';
const SERVER_IP = process.env.SERVER_IP || '0.0.0.0';
const RELAY_PORT_START = 25000;
const RELAY_PORT_END = 26000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadDir));

// ─── MongoDB Models ────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isBanned: { type: Boolean, default: false },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notifications: [{
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName: String,
  version: { type: String, required: true },
  mapName: { type: String, default: 'My World' },
  gameMode: { type: String, enum: ['Survival', 'Creative', 'Adventure', 'Spectator'], default: 'Survival' },
  maxPlayers: { type: Number, default: 10 },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  playerCount: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: true },
  relayHost: String,
  relayPort: Number,
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  authorAvatar: String,
  content: { type: String, required: true },
  type: { type: String, enum: ['post', 'mod', 'addon', 'resource_pack', 'map'], default: 'post' },
  title: String,
  fileUrl: String,
  fileName: String,
  fileSize: Number,
  imageUrl: String,
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    content: String,
    createdAt: { type: Date, default: Date.now }
  }],
  downloads: { type: Number, default: 0 },
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  targetAll: { type: Boolean, default: true },
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const Post = mongoose.model('Post', postSchema);
const Message = mongoose.model('Message', messageSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ─── JWT Middleware ────────────────────────────────────────────────────────────
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user || req.user.isBanned) return res.status(401).json({ error: 'Unauthorized' });
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ─── UDP Relay Manager ─────────────────────────────────────────────────────────
const activeRelays = new Map(); // roomId -> { server, port, sessions }

function allocateRelayPort() {
  for (let p = RELAY_PORT_START; p <= RELAY_PORT_END; p++) {
    if (![...activeRelays.values()].some(r => r.port === p)) return p;
  }
  throw new Error('No relay ports available');
}

function createUDPRelay(roomId) {
  const port = allocateRelayPort();
  const relayServer = dgram.createSocket('udp4');
  const sessions = new Map(); // clientAddr -> hostAddr

  relayServer.on('message', (msg, rinfo) => {
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    const relay = activeRelays.get(roomId);
    if (!relay) return;

    // First message from a client registers as host
    if (relay.sessions.size === 0) {
      relay.hostAddr = rinfo;
      console.log(`[Relay ${port}] Host registered: ${clientKey}`);
    } else if (relay.hostAddr) {
      // Forward to host if from client
      const hostAddr = relay.hostAddr;
      if (clientKey !== `${hostAddr.address}:${hostAddr.port}`) {
        relay.sessions.set(clientKey, rinfo);
        relayServer.send(msg, hostAddr.port, hostAddr.address, () => {});
      } else {
        // From host, broadcast to all clients
        for (const [, clientRinfo] of relay.sessions) {
          relayServer.send(msg, clientRinfo.port, clientRinfo.address, () => {});
        }
      }
    }
  });

  relayServer.bind(port, () => {
    console.log(`[Relay] Room ${roomId} relay on port ${port}`);
  });

  activeRelays.set(roomId, { server: relayServer, port, sessions, hostAddr: null });
  return port;
}

function destroyRelay(roomId) {
  const relay = activeRelays.get(roomId);
  if (relay) {
    relay.server.close();
    activeRelays.delete(roomId);
    console.log(`[Relay] Destroyed relay for room ${roomId}`);
  }
}

// ─── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) return res.status(409).json({ error: 'Username or email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user._id, username, email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Account banned' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Wrong password' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('friends', 'username avatar');
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auth/profile', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const updates = {};
    if (req.body.bio) updates.bio = req.body.bio;
    if (req.file) updates.avatar = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ROOM ROUTES ───────────────────────────────────────────────────────────────
app.get('/api/rooms', async (req, res) => {
  try {
    const { version, mode, search } = req.query;
    const filter = { isOnline: true };
    if (version) filter.version = version;
    if (mode) filter.gameMode = mode;
    if (search) filter.name = { $regex: search, $options: 'i' };
    const rooms = await Room.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(rooms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rooms', authMiddleware, async (req, res) => {
  try {
    const { name, version, mapName, gameMode, maxPlayers, tags } = req.body;
    // Remove old room by this user
    const oldRoom = await Room.findOne({ owner: req.user._id });
    if (oldRoom) {
      destroyRelay(oldRoom._id.toString());
      await Room.deleteOne({ _id: oldRoom._id });
    }

    const room = await Room.create({
      name, version, mapName, gameMode,
      maxPlayers: maxPlayers || 10,
      owner: req.user._id,
      ownerName: req.user.username,
      players: [req.user._id],
      playerCount: 1,
      tags: tags || []
    });

    // Create UDP relay
    const relayPort = createUDPRelay(room._id.toString());
    const relayHost = process.env.SERVER_IP || req.hostname;
    await Room.updateOne({ _id: room._id }, { relayHost, relayPort });
    room.relayHost = relayHost;
    room.relayPort = relayPort;

    io.emit('room:created', room);
    res.status(201).json({ room, relay: { host: relayHost, port: relayPort } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rooms/:id/join', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.isOnline) return res.status(400).json({ error: 'Room offline' });
    if (room.playerCount >= room.maxPlayers) return res.status(400).json({ error: 'Room full' });
    if (!room.players.includes(req.user._id)) {
      await Room.updateOne({ _id: room._id }, {
        $push: { players: req.user._id },
        $inc: { playerCount: 1 }
      });
    }
    io.emit('room:playerJoined', { roomId: room._id, userId: req.user._id, username: req.user.username });
    res.json({ relay: { host: room.relayHost, port: room.relayPort } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Not found' });
    if (room.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    destroyRelay(req.params.id);
    await Room.deleteOne({ _id: req.params.id });
    io.emit('room:deleted', { roomId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rooms/my/close', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findOne({ owner: req.user._id });
    if (room) {
      destroyRelay(room._id.toString());
      await Room.deleteOne({ _id: room._id });
      io.emit('room:deleted', { roomId: room._id });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SOCIAL / POST ROUTES ──────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const { type, search, page = 1 } = req.query;
    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } }
    ];
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20);
    const total = await Post.countDocuments(filter);
    res.json({ posts, total, page: +page });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts', authMiddleware, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    const { content, type, title, tags } = req.body;
    const postData = {
      author: req.user._id,
      authorName: req.user.username,
      authorAvatar: req.user.avatar,
      content, type: type || 'post',
      title, tags: tags ? JSON.parse(tags) : []
    };
    if (req.files?.file?.[0]) {
      postData.fileUrl = `/uploads/${req.files.file[0].filename}`;
      postData.fileName = req.files.file[0].originalname;
      postData.fileSize = req.files.file[0].size;
    }
    if (req.files?.image?.[0]) {
      postData.imageUrl = `/uploads/${req.files.image[0].filename}`;
    }
    const post = await Post.create(postData);
    io.emit('post:new', post);
    res.status(201).json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const liked = post.likes.includes(req.user._id);
    if (liked) {
      post.likes.pull(req.user._id);
      post.likeCount = Math.max(0, post.likeCount - 1);
    } else {
      post.likes.push(req.user._id);
      post.likeCount += 1;
    }
    await post.save();
    res.json({ liked: !liked, likeCount: post.likeCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/comment', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const comment = { author: req.user._id, authorName: req.user.username, content: req.body.content };
    post.comments.push(comment);
    await post.save();
    res.json(comment);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/download', authMiddleware, async (req, res) => {
  try {
    await Post.updateOne({ _id: req.params.id }, { $inc: { downloads: 1 } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await Post.deleteOne({ _id: req.params.id });
    io.emit('post:deleted', { postId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FRIENDS & MESSAGES ────────────────────────────────────────────────────────
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'username avatar')
      .populate('friendRequests', 'username avatar');
    res.json({ friends: user.friends, requests: user.friendRequests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/friends/request/:userId', authMiddleware, async (req, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.friendRequests.includes(req.user._id)) return res.status(400).json({ error: 'Already requested' });
    await User.updateOne({ _id: req.params.userId }, { $push: { friendRequests: req.user._id } });
    io.to(`user_${req.params.userId}`).emit('friend:request', { from: req.user._id, username: req.user.username });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/friends/accept/:userId', authMiddleware, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, {
      $pull: { friendRequests: req.params.userId },
      $push: { friends: req.params.userId }
    });
    await User.updateOne({ _id: req.params.userId }, { $push: { friends: req.user._id } });
    io.to(`user_${req.params.userId}`).emit('friend:accepted', { by: req.user._id, username: req.user.username });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/friends/reject/:userId', authMiddleware, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $pull: { friendRequests: req.params.userId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ]
    }).sort({ createdAt: 1 }).limit(100);
    await Message.updateMany(
      { sender: req.params.userId, receiver: req.user._id, read: false },
      { read: true }
    );
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const msg = await Message.create({
      sender: req.user._id,
      receiver: req.params.userId,
      content: req.body.content
    });
    io.to(`user_${req.params.userId}`).emit('message:new', {
      ...msg.toObject(),
      senderName: req.user.username
    });
    res.status(201).json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user._id }
    }).select('username avatar').limit(20);
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user.notifications.sort((a, b) => b.createdAt - a.createdAt));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { 'notifications.$[].read': true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [users, rooms, posts, messages] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments({ isOnline: true }),
      Post.countDocuments(),
      Message.countDocuments()
    ]);
    res.json({ users, rooms, posts, messages, relays: activeRelays.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search, page = 1 } = req.query;
    const filter = {};
    if (search) filter.username = { $regex: search, $options: 'i' };
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 })
      .skip((page - 1) * 20).limit(20);
    const total = await User.countDocuments(filter);
    res.json({ users, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/ban', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await User.updateOne({ _id: req.params.id }, { isBanned: req.body.ban });
    io.to(`user_${req.params.id}`).emit('account:banned', { banned: req.body.ban });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await User.deleteOne({ _id: req.params.id });
    await Room.deleteMany({ owner: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/rooms', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 }).limit(100);
    res.json(rooms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/rooms/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    destroyRelay(req.params.id);
    await Room.deleteOne({ _id: req.params.id });
    io.emit('room:deleted', { roomId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/posts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(100);
    res.json(posts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/posts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Post.deleteOne({ _id: req.params.id });
    io.emit('post:deleted', { postId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/notify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, targetAll, targetUsers } = req.body;
    const notification = await Notification.create({ title, content, targetAll, targetUsers });
    const msg = { message: `📢 ${title}: ${content}`, read: false, createdAt: new Date() };
    if (targetAll) {
      await User.updateMany({}, { $push: { notifications: msg } });
      io.emit('notification:broadcast', { title, content });
    } else {
      await User.updateMany({ _id: { $in: targetUsers } }, { $push: { notifications: msg } });
      (targetUsers || []).forEach(uid => {
        io.to(`user_${uid}`).emit('notification:new', { title, content });
      });
    }
    res.status(201).json(notification);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('auth', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.join(`user_${decoded.id}`);
      console.log(`[Socket] User authenticated: ${decoded.id}`);
    } catch { socket.disconnect(); }
  });

  socket.on('room:heartbeat', async ({ roomId }) => {
    await Room.updateOne({ _id: roomId }, { isOnline: true });
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      const room = await Room.findOne({ owner: socket.userId });
      if (room) {
        await Room.updateOne({ _id: room._id }, { isOnline: false });
        io.emit('room:offline', { roomId: room._id });
      }
    }
  });

  // WebRTC signaling for relay
  socket.on('relay:offer', ({ targetId, offer }) => {
    io.to(`user_${targetId}`).emit('relay:offer', { from: socket.userId, offer });
  });
  socket.on('relay:answer', ({ targetId, answer }) => {
    io.to(`user_${targetId}`).emit('relay:answer', { from: socket.userId, answer });
  });
  socket.on('relay:ice', ({ targetId, candidate }) => {
    io.to(`user_${targetId}`).emit('relay:ice', { from: socket.userId, candidate });
  });
});

// ─── Startup ───────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connected');
    // Create default admin
    User.findOne({ role: 'admin' }).then(admin => {
      if (!admin) {
        bcrypt.hash('admin123', 10).then(hash => {
          User.create({ username: 'admin', email: 'admin@mcpe.local', password: hash, role: 'admin' });
          console.log('[Init] Default admin created: admin / admin123');
        });
      }
    });
    server.listen(PORT, '0.0.0.0', () => console.log(`[Server] Running on port ${PORT}`));
  })
  .catch(e => { console.error('[DB] Connection failed:', e); process.exit(1); });

// Auto-cleanup offline rooms every 2 minutes
setInterval(async () => {
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
  const staleRooms = await Room.find({ isOnline: false, createdAt: { $lt: twoMinsAgo } });
  for (const room of staleRooms) {
    destroyRelay(room._id.toString());
    await Room.deleteOne({ _id: room._id });
    io.emit('room:deleted', { roomId: room._id });
  }
}, 2 * 60 * 1000);

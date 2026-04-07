import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: envFile });

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const app = express();

// Security Middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 600
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parser with size limits
app.use(express.json({ limit: '10kb' }));

// Validation helpers
const isValidISODate = (value) =>
  typeof value === 'string' && !isNaN(Date.parse(value));

const isValidHexColor = (value) =>
  typeof value === 'string' && /^#([0-9A-Fa-f]{6})$/.test(value);

// Input validation middleware
const validateTaskInput = (req, res, next) => {
  const { title, dueDate, color } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required and must be a string' });
  }

  if (title.trim().length === 0 || title.length > 500) {
    return res.status(400).json({ error: 'Title must be between 1 and 500 characters' });
  }

  const { description } = req.body;

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: 'description must be 2000 characters or less' });
    }
    req.body.description = description.trim();
  }

  if (dueDate !== undefined && dueDate !== null && !isValidISODate(dueDate)) {
    return res.status(400).json({ error: 'dueDate must be a valid ISO 8601 date string' });
  }

  if (color !== undefined && color !== null && !isValidHexColor(color)) {
    return res.status(400).json({ error: 'color must be a valid hex color string (e.g. #FF5733)' });
  }

  // Sanitize title
  req.body.title = title.trim();
  next();
};

// Sanitize update data
const sanitizeUpdateData = (updates) => {
  const allowedFields = ['title', 'description', 'completed', 'dueDate', 'color'];
  const sanitized = {};

  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      if (key === 'title' && typeof updates[key] === 'string') {
        sanitized[key] = updates[key].trim().substring(0, 500);
      } else if (key === 'description') {
        if (updates[key] === null || (typeof updates[key] === 'string' && updates[key].length <= 2000)) {
          sanitized[key] = updates[key] === null ? null : updates[key].trim();
        }
      } else if (key === 'completed' && typeof updates[key] === 'boolean') {
        sanitized[key] = updates[key];
      } else if (key === 'dueDate') {
        if (updates[key] === null || isValidISODate(updates[key])) {
          sanitized[key] = updates[key];
        }
      } else if (key === 'color') {
        if (updates[key] === null || isValidHexColor(updates[key])) {
          sanitized[key] = updates[key];
        }
      }
    }
  }

  return sanitized;
};

const formatTaskData = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    description: data.description ?? null,
    completed: data.completed,
    createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : (data.updatedAt ?? null),
    dueDate: data.dueDate ?? null,
    color: data.color ?? null
  };
};

app.get('/tasks', async (req, res) => {
  try {
    // Pagination
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    let query = db.collection('tasks').orderBy('createdAt', 'desc');

    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }

    const tasksSnapshot = await query.limit(limit).get();
    const tasks = [];

    tasksSnapshot.forEach(doc => {
      tasks.push(formatTaskData(doc));
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/tasks', validateTaskInput, async (req, res) => {
  try {
    const { title, description, dueDate, color } = req.body;

    const taskRef = db.collection('tasks').doc();
    const task = {
      id: taskRef.id,
      title,
      completed: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate }),
      ...(color !== undefined && { color })
    };

    await taskRef.set(task);

    const createdTask = await taskRef.get();
    res.status(201).json(formatTaskData(createdTask));
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const sanitizedUpdates = sanitizeUpdateData(req.body);

    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const taskRef = db.collection('tasks').doc(id);
    const task = await taskRef.get();

    if (!task.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await taskRef.update({ ...sanitizedUpdates, updatedAt: FieldValue.serverTimestamp() });

    const updatedTask = await taskRef.get();
    res.json(formatTaskData(updatedTask));
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const taskRef = db.collection('tasks').doc(id);
    const task = await taskRef.get();

    if (!task.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await taskRef.delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});


app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

export { app, server };
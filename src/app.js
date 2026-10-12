import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import './config/passport.js'; // registers Passport strategies as a side effect

import authRoutes from './routes/auth.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import folderNodesRoutes from './routes/folderNodes.routes.js';
import tasksRoutes from './routes/tasks.routes.js';
import journalRoutes from './routes/journal.routes.js';
import vaultRoutes from './routes/vault.routes.js';
import ledgerRoutes from './routes/ledger.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import usersRoutes from './routes/users.routes.js';
import chatRoutes from './routes/chat.routes.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true // required so the httpOnly refresh cookie is sent/received
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/folder-nodes', folderNodesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat', chatRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

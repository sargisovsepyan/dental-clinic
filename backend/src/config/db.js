import mongoose from 'mongoose';

import env from './env.js';
import logger from '../observability/logger.js';

const connectDB = async () => {
    const connection = await mongoose.connect(env.MONGO_URI, {
        autoIndex: env.NODE_ENV !== 'production',
        autoCreate: env.NODE_ENV !== 'production',
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
    });

    logger.info('mongodb_connected');
    return connection.connection;
};

export default connectDB;
